import { useLayoutEffect, useRef, useState } from 'react';
import type { AppState } from '@/app/sessionController';
import { accessMessage, evaluateAccess } from '@/domain/access';
import { Icon, Logo, ThemeToggle } from '../components/primitives';
import { useContainer } from '../context';

/** Bloque obligatorio en Login y Dispositivo pendiente (Ley 1581 de 2012). */
export function DataProtectionNotice() {
  const { config } = useContainer();
  return (
    <section className="privacy" aria-label="Protección de datos personales">
      <h2>
        <Icon name="lock" size={16} /> Protección de datos personales
      </h2>
      <p>
        Fertrac trata tu correo corporativo y un identificador técnico de este dispositivo únicamente para controlar
        el acceso a la aplicación, conforme a la Ley 1581 de 2012.
      </p>
      {config.privacyPolicyUrl ? (
        <a href={config.privacyPolicyUrl} target="_blank" rel="noreferrer">
          Ver Política de Protección de Datos
        </a>
      ) : (
        <a aria-disabled="true" title="Enlace pendiente de definir">
          Ver Política de Protección de Datos
        </a>
      )}
    </section>
  );
}

export function LoginScreen({ state }: { state: Extract<AppState, { status: 'signedOut' }> }) {
  const { config } = useContainer();
  return (
    <main className="gate">
      <div className="gate__theme"><ThemeToggle /></div>
      <div className="gate__card">
        <Logo height={64} />
        <h1 className="gate__title">Lista de Precios</h1>
        <p className="gate__text">Inicia sesión con tu cuenta corporativa de Fertrac para continuar</p>
        {state.notice && (
          <div className="gate__notice" role="alert">
            <strong>{state.notice.title}.</strong> {state.notice.body}
          </div>
        )}
        <SignInButton busy={state.busy} />
        <section className="gate__box">
          <h2>Acceso protegido en 3 capas</h2>
          <ul className="gate__layers">
            <li><Icon name="check" size={18} /> Cuenta Google @{config.allowedDomain}</li>
            <li><Icon name="check" size={18} /> Usuario en lista blanca</li>
            <li><Icon name="check" size={18} /> Dispositivo autorizado</li>
          </ul>
        </section>
        <DataProtectionNotice />
      </div>
    </main>
  );
}

/**
 * Web: botón oficial "Sign in with Google" (entrega el ID token que se canjea en el backend).
 * APK y demo: botón propio de la app, que abre el flujo nativo.
 */
function SignInButton({ busy }: { busy: boolean }) {
  const { session } = useContainer();
  const slot = useRef<HTMLDivElement>(null);
  const [official, setOfficial] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    setOfficial(slot.current ? session.mountSignInButton(slot.current) : false);
  }, [session]);

  return (
    <>
      <div ref={slot} className="gate__gsi" hidden={official === false} aria-busy={busy} />
      {official === false && (
        <button type="button" className="btn btn--outline btn--block" disabled={busy} onClick={() => void session.signIn()}>
          <span className="gate__google" aria-hidden="true">G</span>
          {busy ? 'Conectando…' : 'Iniciar sesión con Google'}
        </button>
      )}
      {official && busy && <p className="gate__text" role="status">Conectando…</p>}
    </>
  );
}

/** Pantalla propia para cada estado de la capa 3: pendiente, bloqueado, límite, canal no autorizado. */
export function DeviceScreen({ state }: { state: Extract<AppState, { status: 'blocked' }> }) {
  const { session } = useContainer();
  const message = accessMessage(state.code);
  const verdict = evaluateAccess(state.code);
  const blocked = !verdict.retryable;
  return (
    <main className="gate">
      <div className="gate__theme"><ThemeToggle /></div>
      <div className="gate__card">
        <span className={`gate__status-icon ${blocked ? 'gate__status-icon--blocked' : ''}`}>
          <Icon name={blocked ? 'block' : 'phone'} size={32} />
        </span>
        <h1 className="gate__title gate__title--sm">{message.title}</h1>
        <p className="gate__text">{message.body}</p>
        <div className="gate__code">
          <span>Código del dispositivo</span>
          <strong aria-label={`Código ${state.deviceCode.split('').join(' ')}`}>{state.deviceCode}</strong>
        </div>
        <button type="button" className="btn btn--primary btn--block" disabled={state.busy} onClick={() => void session.retry()}>
          <Icon name="refresh" size={18} className={state.busy ? 'spin' : ''} />
          {state.busy ? 'Verificando…' : 'Reintentar'}
        </button>
        <button type="button" className="btn btn--outline btn--block" onClick={() => void session.signOut()}>
          Cerrar sesión
        </button>
        <p className="gate__text" style={{ fontSize: 12 }}>{state.session.user.email}</p>
        <DataProtectionNotice />
      </div>
    </main>
  );
}

export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Cargando">
      <Icon name="refresh" size={32} className="spin" />
    </div>
  );
}
