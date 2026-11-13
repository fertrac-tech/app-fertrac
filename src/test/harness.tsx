import { render } from '@testing-library/react';
import { SnapshotCatalogRepository } from '@/adapters/catalog/snapshotCatalogRepository';
import { MockCatalogSource } from '@/adapters/mock/mockAdapters';
import type { Container } from '@/app/container';
import { FavoritesController } from '@/app/favoritesController';
import { SessionController } from '@/app/sessionController';
import type { AccessCode } from '@/domain/access';
import { emptyFavorites, type FavoritesState } from '@/domain/favorites';
import type { AuthProvider, CatalogSnapshot, Session, UserProfile } from '@/ports';
import { App } from '@/ui/App';
import { ContainerProvider } from '@/ui/context';

export type Viewport = 'compact' | 'medium' | 'expanded';

/** Simula el ancho de pantalla respondiendo a las media queries de los breakpoints. */
export function setViewport(viewport: Viewport, dark = false): void {
  const width = { compact: 360, medium: 690, expanded: 1440 }[viewport];
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches = min ? width >= Number(min[1]) : /prefers-color-scheme: dark/.test(query) ? dark : false;
    return { matches, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  }) as typeof window.matchMedia;
}

interface Options {
  route?: string;
  viewport?: Viewport;
  /** Respuestas de acceso del backend, en orden (la última se repite). */
  access?: AccessCode[];
  signedIn?: boolean;
  user?: Partial<UserProfile>;
  catalogSize?: number;
  privacyPolicyUrl?: string;
  systemDark?: boolean;
}

export function renderApp(options: Options = {}) {
  const { route = '/', viewport = 'compact', access = ['ok'], signedIn = true, catalogSize = 250 } = options;
  setViewport(viewport, options.systemDark);
  window.history.pushState({}, '', route);
  window.localStorage.clear();

  const session: Session = {
    user: { email: 'usuario@fertrac.com', name: 'David Torres', picture: null, ...options.user },
    token: 'tok',
    expiresAt: Number.MAX_SAFE_INTEGER,
  };
  let stored = signedIn;
  const auth: AuthProvider = {
    restore: async () => (stored ? session : null),
    signIn: async () => { stored = true; return session; },
    refresh: async () => null,
    signOut: async () => { stored = false; },
  };

  let call = 0;
  const source = new MockCatalogSource(() => access[Math.min(call++, access.length - 1)] ?? 'ok', 0, catalogSize);
  let snapshot: CatalogSnapshot | null = null;
  const catalog = new SnapshotCatalogRepository(source, {
    load: async () => snapshot,
    save: async (s) => { snapshot = s; },
    clear: async () => { snapshot = null; },
  });
  const device = { get: async () => ({ id: 'web-demo-0000-a3f9k2', channel: 'navegador' as const, platform: 'web-desktop', model: 'Test', isAndroid: false }) };

  const saved = new Map<string, FavoritesState>();
  let id = 0;
  const favorites = new FavoritesController(
    { load: async (k) => saved.get(k) ?? emptyFavorites(), save: async (k, s) => void saved.set(k, s) },
    () => `lista-${(id += 1)}`,
  );

  const container: Container = {
    config: {
      dataSource: 'mock', appsScriptUrl: '', googleClientId: '', allowedDomain: 'fertrac.com',
      privacyPolicyUrl: options.privacyPolicyUrl ?? '', environmentLabel: '', version: '11.0.0',
    },
    catalog,
    session: new SessionController(auth, catalog, device),
    favorites,
  };

  const view = render(
    <ContainerProvider container={container}>
      <App />
    </ContainerProvider>,
  );
  return { ...view, container, saved };
}
