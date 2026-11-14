import { isAccessCode } from '@/domain/access';
import { AccessDeniedError, ApiError, type DeviceIdentity, type SessionGrant } from '@/ports';

export interface AppsScriptClientOptions {
  baseUrl: string;
  appVersion: string;
  device: DeviceIdentity;
  /** Token de dispositivo vigente (emitido por ?op=sesion), o null si no hay sesión. */
  getToken: () => string | null;
  /** El backend rotó el token: la sesión debe guardarlo (SEC-02). */
  onSessionRotated?: (grant: SessionGrant) => void;
  fetchFn?: typeof fetch;
  /** Reintentos cuando el backend responde `temporalmente_ocupado` (lock de sincronización). */
  busyRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const BUSY = 'temporalmente_ocupado';
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface SessionPayload {
  token?: unknown;
  exp?: unknown;
}

function grantFrom(raw: SessionPayload | undefined | null): SessionGrant | null {
  return raw && typeof raw.token === 'string' && typeof raw.exp === 'number' ? { token: raw.token, expiresAt: raw.exp } : null;
}

/**
 * Cliente del API de Apps Script.
 *  · POST con cuerpo `text/plain` (sin preflight CORS): las credenciales NUNCA van en la URL (SEC-03).
 *  · Cada petición lleva el token de dispositivo (`st`) y la identidad del dispositivo,
 *    para que la lista blanca y la restricción por dispositivo sigan operando.
 *  · `createSession` canjea el ID token de Google por ese token (SEC-01).
 */
export class AppsScriptClient {
  constructor(private readonly options: AppsScriptClientOptions) {}

  async get<T>(params: Record<string, string> = {}): Promise<T> {
    return this.withRetries(async () => {
      const token = this.options.getToken();
      if (!token) throw new AccessDeniedError('sin_credenciales');
      const body = await this.send({ st: token, ...params });
      const rotated = grantFrom((body as { sesion?: SessionPayload }).sesion);
      if (rotated) this.options.onSessionRotated?.(rotated);
      return body as T;
    });
  }

  /** ?op=sesion: el backend verifica el ID token y emite el token de dispositivo. */
  async createSession(idToken: string, integrity?: string): Promise<SessionGrant> {
    return this.withRetries(async () => {
      const params: Record<string, string> = { op: 'sesion', id_token: idToken };
      if (integrity) params.integridad = integrity;
      const body = (await this.send(params)) as { sesion?: SessionPayload; usuario?: { email?: string; name?: string; picture?: string } };
      const grant = grantFrom(body.sesion);
      if (!grant) throw new ApiError('respuesta_invalida');
      const u = body.usuario ?? {};
      return { ...grant, user: { email: u.email, name: u.name, picture: u.picture || null } };
    });
  }

  private async withRetries<T>(run: () => Promise<T>): Promise<T> {
    const { busyRetries = 3, sleep = defaultSleep } = this.options;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        const busy = error instanceof ApiError && error.code === BUSY;
        if (!busy || attempt >= busyRetries) throw error;
        await sleep(800 * 2 ** attempt);
      }
    }
  }

  private async send(params: Record<string, string>): Promise<unknown> {
    const device = await this.options.device.get();
    const payload: Record<string, string> = {
      ...params,
      device: device.id,
      canal: device.channel,
      plat: device.platform,
      modelo: device.model,
      ver: this.options.appVersion,
    };
    if (device.isAndroid) payload.so = 'android';

    let response: Response;
    try {
      response = await (this.options.fetchFn ?? fetch)(this.options.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        credentials: 'omit',
      });
    } catch {
      throw new ApiError('sin_conexion', 'No hay conexión con el servidor.');
    }
    if (!response.ok) throw new ApiError(`http_${response.status}`);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError('respuesta_invalida');
    }

    const errorCode = (body as { error?: unknown } | null)?.error;
    if (typeof errorCode === 'string') {
      if (isAccessCode(errorCode) && errorCode !== 'ok') throw new AccessDeniedError(errorCode);
      throw new ApiError(errorCode);
    }
    return body;
  }
}
