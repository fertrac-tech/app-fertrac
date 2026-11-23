import { useContainer } from '../context';

/**
 * Texto del aviso (BORRADOR: validar con jurídica). Si cambia, sube CONSENT_VERSION en domain/consent.ts
 * para que todos los usuarios lo acepten de nuevo.
 */
export const CONSENT_COPY = {
  title: 'Aviso de privacidad y analítica de uso',
  body:
    'Para usar Lista de Precios debes aceptar que Fertrac mida el uso de la app con Google Analytics (pantallas, búsquedas y productos consultados) para mejorarla. ' +
    'No enviamos tu correo: usamos un identificador seudónimo. Puedes retirar tu autorización en Perfil; si lo haces, no podrás usar la app hasta aceptarla de nuevo.',
  deniedTitle: 'Acceso no disponible',
  deniedBody: 'Rechazaste el aviso de privacidad y analítica de uso, por eso no puedes ingresar.',
};

export function PrivacyPolicyLink({ className }: { className?: string }) {
  const { config } = useContainer();
  return config.privacyPolicyUrl ? (
    <a className={className} href={config.privacyPolicyUrl} target="_blank" rel="noreferrer">
      Ver Política de Protección de Datos
    </a>
  ) : null;
}
