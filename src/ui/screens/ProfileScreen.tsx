import { layerStatuses } from '@/domain/access';
import { formatSyncTime } from '@/domain/text';
import type { Channel } from '@/ports';
import { Avatar, Icon } from '../components/primitives';
import { useContainer, useReady, useTheme, type Theme } from '../context';

const CHANNEL_LABEL: Record<Channel, string> = {
  apk_android: 'App Android',
  pwa_instalada: 'App instalada (PWA)',
  navegador: 'Navegador',
};

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

/** Perfil (pantalla 07): foto, nombre y correo de Google + estado de las tres capas de seguridad. */
export function ProfileScreen() {
  const { session, config } = useContainer();
  const state = useReady();
  const { theme: activeTheme, setTheme } = useTheme();
  const { user } = state.session;
  const layers = layerStatuses('ok');

  return (
    <div className="scroll">
      <div className="profile">
        <section className="panel panel--center" aria-label="Cuenta">
          <Avatar name={user.name} picture={user.picture} size={76} />
          <small>{user.picture ? 'Foto de la cuenta de Google' : 'Tu cuenta de Google no tiene foto'}</small>
          <h1>{user.name}</h1>
          <span className="muted">{user.email}</span>
          <span className="pill pill--ok pill--lg">
            <Icon name="shield" size={14} /> Acceso autorizado
          </span>
        </section>

        <section className="panel" aria-label="Seguridad">
          <h2>Seguridad</h2>
          <div className="kv">
            <span>Cuenta Google</span>
            <span data-status={layers.google}>Verificada</span>
          </div>
          <div className="kv">
            <span>Lista blanca</span>
            <span data-status={layers.whitelist}>Autorizado</span>
          </div>
          <div className="kv">
            <span>Dispositivo</span>
            <span data-status={layers.device}>Aprobado · {state.deviceCode}</span>
          </div>
          <div className="kv">
            <span>Canal</span>
            <span>{state.channel ? CHANNEL_LABEL[state.channel] : '—'}</span>
          </div>
        </section>

        <section className="panel" aria-label="Aplicación">
          <h2>Aplicación</h2>
          <div className="kv">
            <span>Última sincronización</span>
            <span>{formatSyncTime(state.lastSyncedAt)}</span>
          </div>
          <div className="kv">
            <span>Apariencia</span>
            <div className="segmented" role="group" aria-label="Apariencia">
              {THEMES.map((theme) => (
                <button key={theme.value} type="button" aria-pressed={activeTheme === theme.value} onClick={() => setTheme(theme.value)}>
                  {theme.label}
                </button>
              ))}
            </div>
          </div>
          <div className="kv">
            <span>Versión</span>
            <span>
              {config.version}
              {config.environmentLabel ? ` · ${config.environmentLabel}` : ''}
            </span>
          </div>
        </section>

        <button type="button" className="btn btn--outline btn--block" onClick={() => void session.signOut()}>
          <Icon name="logout" size={18} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
