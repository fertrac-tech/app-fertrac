import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
        <Logo height={34} />
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
function Rail() {
  const { session } = useReady();
  return (
    <nav className="rail" aria-label="Navegación principal">
      <Logo variant="isotipo" height={44} />
      <span style={{ height: 12 }} />
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>
          <Icon name={item.icon} size={22} />
          {item.label}
        </NavLink>
      ))}
      <span className="rail__spacer" />
      <ThemeToggle />
      <SyncButton />
      <Link to="/perfil" className="icon-btn" aria-label="Abrir perfil">
        <Avatar name={session.user.name} picture={session.user.picture} size={36} />
      </Link>
    </nav>
  );
}

/** Barra lateral (escritorio) con acceso directo a las listas del usuario. */
function Sidebar({ onNewList }: { onNewList: () => void }) {
  const { session } = useContainer();
  const state = useReady();
  const favorites = useFavoritesState();
  const counts = countByList(favorites);
  const location = useLocation();
  const [params] = useSearchParams();
  const activeList = location.pathname === '/favoritos' ? params.get('lista') : null;

  return (
    <nav className="sidebar" aria-label="Navegación principal">
      <div className="sidebar__brand">
        <Logo height={44} />
        Lista de Precios
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

export function Shell() {
  const breakpoint = useBreakpoint();
  const state = useReady();
  const navigate = useNavigate();
  const [creatingList, setCreatingList] = useState(false);

  return (
    <div className="shell" data-breakpoint={breakpoint}>
      {breakpoint === 'expanded' && <Sidebar onNewList={() => setCreatingList(true)} />}
      {breakpoint === 'medium' && <Rail />}
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
