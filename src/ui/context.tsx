import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Container } from '@/app/container';
import type { AppState } from '@/app/sessionController';
import type { FavoritesState } from '@/domain/favorites';

const ContainerContext = createContext<Container | null>(null);

export function ContainerProvider({ container, children }: { container: Container; children: ReactNode }) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

export function useContainer(): Container {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('Falta <ContainerProvider>.');
  return container;
}

export function useAppState(): AppState {
  const { session } = useContainer();
  return useSyncExternalStore(session.subscribe, session.getState);
}

export type ReadyState = Extract<AppState, { status: 'ready' }>;

/** Estado de una sesión activa. Solo se usa dentro de las pantallas protegidas. */
export function useReady(): ReadyState {
  const state = useAppState();
  if (state.status !== 'ready') throw new Error('Pantalla protegida sin sesión activa.');
  return state;
}

export function useFavoritesState(): FavoritesState {
  const { favorites } = useContainer();
  return useSyncExternalStore(favorites.subscribe, favorites.getState);
}

// ── Breakpoints del diseño: compacto < 600 · medio 600–1023 · expandido ≥ 1024 ──

export type Breakpoint = 'compact' | 'medium' | 'expanded';
const MEDIUM = '(min-width: 600px)';
const EXPANDED = '(min-width: 1024px)';

function currentBreakpoint(): Breakpoint {
  if (window.matchMedia(EXPANDED).matches) return 'expanded';
  return window.matchMedia(MEDIUM).matches ? 'medium' : 'compact';
}

export function useBreakpoint(): Breakpoint {
  const subscribe = useCallback((onChange: () => void) => {
    const queries = [window.matchMedia(MEDIUM), window.matchMedia(EXPANDED)];
    queries.forEach((q) => q.addEventListener('change', onChange));
    return () => queries.forEach((q) => q.removeEventListener('change', onChange));
  }, []);
  return useSyncExternalStore(subscribe, currentBreakpoint);
}

// ── Tema: claro por defecto; el usuario lo cambia a voluntad con un botón ──

export type Theme = 'light' | 'dark';
const THEME_KEY = 'fertrac_v2_theme';

interface ThemeValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeValue>({ theme: 'light', setTheme: () => {}, toggleTheme: () => {} });

function readTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1c1f23' : '#ffffff');
  }, [theme]);

  const value = useMemo<ThemeValue>(() => {
    const setTheme = (next: Theme) => {
      setThemeState(next);
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        /* la preferencia solo dura esta sesión */
      }
    };
    return { theme, setTheme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
  }, [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// ── Consultas asíncronas a los repositorios ──

/** Ejecuta una consulta y conserva el último resultado mientras llega el siguiente (sin parpadeos). */
export function useQuery<T>(run: () => Promise<T>, deps: readonly unknown[]): { data: T | undefined; loading: boolean } {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean }>({ data: undefined, loading: true });
  useEffect(() => {
    let active = true;
    setState((previous) => ({ data: previous.data, loading: true }));
    run()
      .then((data) => active && setState({ data, loading: false }))
      .catch(() => active && setState((previous) => ({ data: previous.data, loading: false })));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
