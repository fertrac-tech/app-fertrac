import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useHref, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { MouseEvent } from 'react';
import { fadeThrough } from '../motion/viewTransition';
import { countByList, totalFavorites } from '@/domain/favorites';
import { formatSyncTime } from '@/domain/text';
import { ListNameSheet } from '../components/FavoriteSheets';
import { Avatar, Icon, Logo, ThemeToggle } from '../components/primitives';
import { useBreakpoint, useContainer, useFavoritesState, useReady } from '../context';

export function SyncButton({ labelled = false }: { labelled?: boolean }) {
  const { session } = useContainer();
  const state = useReady();
  const icon = <Icon name="refresh" size={labelled ? 18 : 20} className={state.syncing ? 'spin' : ''} />;
  return labelled ? (
    <button type="button" className="btn btn--outline" disabled={state.syncing} onClick={() => void session.sync()}>
      {icon} {state.syncing ? 'Sincronizando…' : 'Sincronizar'}
    </button>
  ) : (
    <button type="button" className="icon-btn" aria-label="Sincronizar catálogo" disabled={state.syncing} onClick={() => void session.sync()}>
      {icon}
    </button>
  );
}

export function SyncStamp() {
  const { lastSyncedAt } = useReady();
  return <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Actualizado {formatSyncTime(lastSyncedAt).replace(/^Hoy, /, '')}</span>;
}

function AppBar() {
  const { session } = useReady();
  return (
    <header className="appbar">
      <div className="appbar__brand">
        <Logo variant="encabezado" height={30} />
        <span>Lista de Precios</span>
      </div>
      <div className="appbar__actions">
        <ThemeToggle />
        <SyncButton />
        <Link to="/perfil" className="icon-btn" aria-label="Abrir perfil">
          <Avatar name={session.user.name} picture={session.user.picture} size={32} />
        </Link>
      </div>
    </header>
  );
}

const NAV = [
  { to: '/', label: 'Catálogo', icon: 'list' },
  { to: '/favoritos', label: 'Favoritos', icon: 'star' },
  { to: '/perfil', label: 'Perfil', icon: 'user' },
] as const;

function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Navegación principal">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>
          <Icon name={item.icon} size={22} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Riel de navegación (fold abierto / tablet). */
function Rail({ onToggle, onNewList, hidden = false }: { onToggle: () => void; onNewList?: () => void; hidden?: boolean }) {
  const { session } = useReady();
  return (
    <nav className="rail" aria-label="Navegación principal" aria-hidden={hidden || undefined} inert={hidden || undefined}>
      <Logo variant="isotipo" height={44} />
      <button type="button" className="icon-btn" aria-label="Expandir barra de navegación" onClick={onToggle} style={{ alignSelf: 'center' }}>
        <Icon name="right" size={20} />
      </button>
      <span style={{ height: 12 }} />
      {/* Perfil no va en el riel: se abre desde la foto, al pie. */}
      {NAV.filter((item) => item.to !== '/perfil').map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>
          <Icon name={item.icon} size={22} />
          {item.label}
        </NavLink>
      ))}
      {onNewList && (
        <button type="button" className="icon-btn" aria-label="Nueva lista" onClick={onNewList} style={{ alignSelf: 'center' }}>
          <Icon name="plus" size={20} />
        </button>
      )}
      <span className="rail__spacer" />
      <ThemeToggle />
      <SyncButton />
      <NavLink to="/perfil" className="icon-btn rail__profile" aria-label="Abrir perfil">
        <Avatar name={session.user.name} picture={session.user.picture} size={36} />
      </NavLink>
    </nav>
  );
}

/** Barra lateral (escritorio) con acceso directo a las listas del usuario. */
function Sidebar({ onNewList, onToggle, hidden = false }: { onNewList: () => void; onToggle: () => void; hidden?: boolean }) {
  const { session } = useContainer();
  const state = useReady();
  const favorites = useFavoritesState();
  const counts = countByList(favorites);
  const location = useLocation();
  const [params] = useSearchParams();
  const activeList = location.pathname === '/favoritos' ? params.get('lista') : null;

  return (
    <nav className="sidebar" aria-label="Navegación principal" aria-hidden={hidden || undefined} inert={hidden || undefined}>
      <div className="sidebar__brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, whiteSpace: 'nowrap' }}>
          {/* Isla flotante: logo naranja sin fondo, legible sobre el vidrio en claro y oscuro. */}
          <Logo variant="mono" height={36} />
          Lista de Precios
        </span>
        <button type="button" className="icon-btn" aria-label="Recortar barra de navegación" onClick={onToggle}>
          <Icon name="left" size={20} />
        </button>
      </div>
      <NavLink to="/" end className="navitem">
        <Icon name="list" /> Catálogo
      </NavLink>
      <Link to="/favoritos" className="navitem" aria-current={location.pathname === '/favoritos' && !activeList ? 'page' : undefined}>
        <Icon name="star" /> Favoritos <span className="navitem__count">{totalFavorites(favorites)}</span>
      </Link>

      <span className="sidebar__section">MIS LISTAS</span>
      {favorites.lists.map((list) => (
        <Link key={list.id} to={`/favoritos?lista=${list.id}`} className="navitem" aria-current={activeList === list.id ? 'page' : undefined}>
          <Icon name="folder" /> <span className="truncate">{list.name}</span>
          <span className="navitem__count">{counts[list.id] ?? 0}</span>
        </Link>
      ))}
      <button type="button" className="navitem" onClick={onNewList}>
        <Icon name="plus" /> Nueva lista
      </button>

      <span className="rail__spacer" />
      <ThemeToggle labelled />
      <div className="sidebar__user">
        <Link to="/perfil" aria-label="Abrir perfil">
          <Avatar name={state.session.user.name} picture={state.session.user.picture} size={40} />
          <span style={{ minWidth: 0 }}>
            <strong className="truncate">{state.session.user.name}</strong>
            <small className="truncate">{state.session.user.email}</small>
          </span>
        </Link>
        <button type="button" className="icon-btn" aria-label="Cerrar sesión" onClick={() => void session.signOut()}>
          <Icon name="logout" />
        </button>
      </div>
    </nav>
  );
}

/**
 * Isla de navegación única (fold, tablet, escritorio): el riel y la barra lateral viven dentro del mismo
 * contenedor de vidrio. Al expandir o recortar, la isla anima su ancho (--nav-w, registrada con @property en
 * motion.css) y el contenido principal se desplaza en sincronía; por dentro, una capa se funde en la otra.
 * La capa inactiva queda inerte y oculta para lectores de pantalla.
 */
function NavIsland({ collapsed, onToggle, onNewList }: { collapsed: boolean; onToggle: () => void; onNewList: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  // El botón pulsado queda en la capa que se oculta: el foco pasa al botón equivalente de la otra capa.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const label = collapsed ? 'Expandir barra de navegación' : 'Recortar barra de navegación';
    ref.current?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.focus({ preventScroll: true });
  }, [collapsed]);

  return (
    <div className="navisland" data-collapsed={collapsed} ref={ref}>
      <Rail onToggle={onToggle} onNewList={onNewList} hidden={!collapsed} />
      <Sidebar onNewList={onNewList} onToggle={onToggle} hidden={collapsed} />
    </div>
  );
}

export function Shell() {
  const breakpoint = useBreakpoint();
  const state = useReady();
  const navigate = useNavigate();
  const base = useHref('/');
  const [creatingList, setCreatingList] = useState(false);

  /**
   * Destinos principales (barra inferior, riel, barra lateral, barra superior): Fade through de Material 3.
   * Solo cuando cambia la pantalla; dentro de la misma (p. ej. otra lista de Favoritos) el enlace sigue normal.
   */
  const onNavClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('nav a[href], .appbar a[href]');
    if (!link || link.target || link.origin !== window.location.origin) return;
    if (link.pathname === window.location.pathname) return;
    event.preventDefault();
    const path = link.pathname.startsWith(base) ? `/${link.pathname.slice(base.length)}` : link.pathname;
    fadeThrough(() => navigate(path + link.search), link.pathname);
  };
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      const stored = window.localStorage.getItem('fertrac_nav_collapsed');
      if (stored !== null) return stored === '1';
      return true;
    } catch { return true; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('fertrac_nav_collapsed', navCollapsed ? '1' : '0'); } catch { /* noop */ }
  }, [navCollapsed]);

  return (
    <div className="shell" data-breakpoint={breakpoint} data-nav-collapsed={navCollapsed} onClickCapture={onNavClick}>
      {breakpoint !== 'compact' && (
        <NavIsland collapsed={navCollapsed} onToggle={() => setNavCollapsed((c) => !c)} onNewList={() => setCreatingList(true)} />
      )}
      <div className="shell__main">
        {breakpoint === 'compact' && <AppBar />}
        {state.syncError && (
          <div className="banner" role="status">
            <Icon name="offline" size={16} /> {state.syncError}
          </div>
        )}
        <Outlet />
        {breakpoint === 'compact' && <BottomNav />}
      </div>
      {creatingList && (
        <ListNameSheet listId={null} onClose={() => setCreatingList(false)} onCreated={(id) => navigate(`/favoritos?lista=${id}`)} />
      )}
    </div>
  );
}
