import { useConsentState, useContainer } from '../context';
import { Icon } from './primitives';

/** Texto del aviso (BORRADOR: validar con jurídica). Si cambia, sube CONSENT_VERSION en domain/consent.ts. */
export const CONSENT_COPY = {
  title: 'Privacidad y analítica de uso',
  body:
    'Con tu autorización, Fertrac usa Google Analytics para medir el uso de esta app (pantallas, búsquedas y productos consultados) y así mejorarla. ' +
    'No enviamos tu correo: usamos un identificador seudónimo. Puedes cambiar tu decisión cuando quieras en Perfil.',
};

export function PrivacyPolicyLink({ className }: { className?: string }) {
  const { config } = useContainer();
  return config.privacyPolicyUrl ? (
    <a className={className} href={config.privacyPolicyUrl} target="_blank" rel="noreferrer">
      Ver Política de Protección de Datos
    </a>
  ) : null;
}

/**
 * Aviso de privacidad (reemplaza el banner externo de la v10). No bloquea la app: mientras no haya
 * decisión, la analítica queda denegada. "Aceptar" y "Rechazar" tienen el mismo peso visual.
 */
export function ConsentBanner() {
  const { consent } = useContainer();
  const state = useConsentState();
  if (state.status !== 'pending') return null;

  return (
    <section className="consent" role="region" aria-label="Aviso de privacidad">
      <h2 className="consent__title">
        <Icon name="shield" size={16} /> {CONSENT_COPY.title}
      </h2>
      <p className="consent__text">{CONSENT_COPY.body}</p>
      <PrivacyPolicyLink className="consent__link" />
      <div className="consent__actions">
        <button type="button" className="btn btn--outline" onClick={() => consent.decide(false)}>
          Rechazar
        </button>
        <button type="button" className="btn btn--primary" onClick={() => consent.decide(true)}>
          Aceptar
        </button>
      </div>
    </section>
  );
}
