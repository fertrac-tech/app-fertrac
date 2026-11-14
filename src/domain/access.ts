/**
 * Seguridad en tres capas (sin cambios frente a la versión actual):
 * 1) cuenta Google corporativa · 2) usuario en lista blanca · 3) dispositivo autorizado.
 * Los códigos son los que hoy devuelve el backend (gs/API.gs y gs/Autorizacion.gs).
 */

export const ACCESS_CODES = [
  'ok',
  'sin_credenciales',
  'token_invalido',
  'token_requerido',
  'no_autorizado',
  'usuario_pendiente',
  'usuario_suspendido',
  'canal_no_autorizado',
  'canal_no_verificado',
  'web_android_no_permitido',
  'dispositivo_requerido',
  'dispositivo_invalido',
  'dispositivo_pendiente',
  'dispositivo_limite',
  'dispositivo_bloqueado',
] as const;

export type AccessCode = (typeof ACCESS_CODES)[number];
export type SecurityLayer = 'google' | 'whitelist' | 'device';

export function isAccessCode(value: unknown): value is AccessCode {
  return typeof value === 'string' && (ACCESS_CODES as readonly string[]).includes(value);
}

export interface AccessVerdict {
  code: AccessCode;
  granted: boolean;
  /** Capa que rechazó el acceso (null si fue concedido). */
  failedLayer: SecurityLayer | null;
  /** El usuario puede reintentar sin cerrar sesión (p. ej. dispositivo en aprobación). */
  retryable: boolean;
  /** Debe borrarse el catálogo guardado en el dispositivo. */
  wipeLocalData: boolean;
  /** Requiere volver a iniciar sesión con Google. */
  requiresSignIn: boolean;
}

const LAYER_BY_CODE: Record<Exclude<AccessCode, 'ok'>, SecurityLayer> = {
  sin_credenciales: 'google',
  token_invalido: 'google',
  token_requerido: 'google',
  no_autorizado: 'whitelist',
  usuario_pendiente: 'whitelist',
  usuario_suspendido: 'whitelist',
  canal_no_autorizado: 'device',
  canal_no_verificado: 'device',
  web_android_no_permitido: 'device',
  dispositivo_requerido: 'device',
  dispositivo_invalido: 'device',
  dispositivo_pendiente: 'device',
  dispositivo_limite: 'device',
  dispositivo_bloqueado: 'device',
};

const RETRYABLE: ReadonlySet<AccessCode> = new Set([
  'usuario_pendiente',
  'dispositivo_pendiente',
  'dispositivo_limite',
  'dispositivo_requerido',
  'dispositivo_invalido',
  'canal_no_verificado',
]);

const WIPES_LOCAL_DATA: ReadonlySet<AccessCode> = new Set([
  'no_autorizado',
  'usuario_pendiente',
  'usuario_suspendido',
  'canal_no_autorizado',
  'canal_no_verificado',
  'dispositivo_bloqueado',
  'web_android_no_permitido',
]);

export function evaluateAccess(code: AccessCode): AccessVerdict {
  if (code === 'ok') {
    return { code, granted: true, failedLayer: null, retryable: false, wipeLocalData: false, requiresSignIn: false };
  }
  const failedLayer = LAYER_BY_CODE[code];
  return {
    code,
    granted: false,
    failedLayer,
    retryable: RETRYABLE.has(code),
    wipeLocalData: WIPES_LOCAL_DATA.has(code),
    requiresSignIn: failedLayer === 'google',
  };
}

export type LayerStatus = 'passed' | 'failed' | 'unknown';

/** Estado de las tres capas para la pantalla de perfil. */
export function layerStatuses(code: AccessCode): Record<SecurityLayer, LayerStatus> {
  const order: SecurityLayer[] = ['google', 'whitelist', 'device'];
  const { failedLayer } = evaluateAccess(code);
  if (!failedLayer) return { google: 'passed', whitelist: 'passed', device: 'passed' };
  const failedAt = order.indexOf(failedLayer);
  const status = (layer: SecurityLayer): LayerStatus => {
    const i = order.indexOf(layer);
    return i < failedAt ? 'passed' : i === failedAt ? 'failed' : 'unknown';
  };
  return { google: status('google'), whitelist: status('whitelist'), device: status('device') };
}

export interface AccessMessage {
  title: string;
  body: string;
}

const MESSAGES: Record<Exclude<AccessCode, 'ok'>, AccessMessage> = {
  sin_credenciales: { title: 'Inicia sesión', body: 'Inicia sesión con tu cuenta corporativa de Fertrac para continuar.' },
  token_invalido: { title: 'Tu sesión expiró', body: 'Vuelve a iniciar sesión con Google para continuar.' },
  token_requerido: { title: 'Inicia sesión', body: 'El acceso requiere iniciar sesión con Google.' },
  no_autorizado: { title: 'Cuenta sin acceso', body: 'Tu cuenta no está en la lista de usuarios autorizados. Escala con el área encargada.' },
  usuario_pendiente: {
    title: 'Solicitud de acceso enviada',
    body: 'Tu cuenta y este dispositivo quedaron pendientes de aprobación. Se avisó al área encargada; si te lo piden, dicta este código y pulsa "Reintentar" cuando te confirmen.',
  },
  usuario_suspendido: { title: 'Acceso suspendido', body: 'Tu usuario fue suspendido. Contacta a tu administrador.' },
  canal_no_autorizado: { title: 'Canal no autorizado', body: 'Tu usuario no está habilitado para ingresar desde este canal (app o web).' },
  canal_no_verificado: { title: 'Canal no verificado', body: 'No se pudo verificar el canal de acceso. Reintenta o reinstala la aplicación.' },
  web_android_no_permitido: { title: 'Usa la app en Android', body: 'En celulares Android el acceso es únicamente desde la aplicación instalada.' },
  dispositivo_requerido: { title: 'Dispositivo no identificado', body: 'No se pudo identificar este dispositivo. Pulsa "Reintentar".' },
  dispositivo_invalido: { title: 'Dispositivo no identificado', body: 'No se pudo identificar este dispositivo. Pulsa "Reintentar".' },
  dispositivo_pendiente: { title: 'Dispositivo pendiente de aprobación', body: 'Tu cuenta está autorizada, pero este dispositivo aún no. Dicta este código a soporte para que lo aprueben.' },
  dispositivo_limite: { title: 'Límite de dispositivos alcanzado', body: 'Alcanzaste el máximo de dispositivos autorizados. Escala con el área encargada para liberar uno y reintenta.' },
  dispositivo_bloqueado: { title: 'Dispositivo bloqueado', body: 'Este dispositivo fue bloqueado. Contacta a tu administrador.' },
};

export function accessMessage(code: Exclude<AccessCode, 'ok'>): AccessMessage {
  return MESSAGES[code];
}

/** Código corto que el usuario dicta a soporte. Nunca se muestra el identificador completo. */
export function shortDeviceCode(deviceId: string): string {
  return deviceId ? deviceId.slice(-6).toUpperCase() : '------';
}

export function isCorporateEmail(email: string, domain: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}
