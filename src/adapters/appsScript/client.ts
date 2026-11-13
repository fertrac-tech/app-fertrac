import { isAccessCode } from '@/domain/access';
import { AccessDeniedError, ApiError, type DeviceIdentity } from '@/ports';

export interface AppsScriptClientOptions {
  baseUrl: string;
  appVersion: string;
  device: DeviceIdentity;
  /** Token de acceso de Google vigente, o null si no hay sesión. */
  getToken: () => string | null;
  fetchFn?: typeof fetch;
  /** Reintentos cuando el backend responde `temporalmente_ocupado` (lock de sincronización). */
  busyRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const BUSY = 'temporalmente_ocupado';
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Cliente del API actual (doGet de Apps Script). Envía el token de Google y la
 * identidad del dispositivo en TODAS las peticiones, igual que la v10, para que
 * la lista blanca y la restricción por dispositivo sigan operando sin cambios.
 */
export class AppsScriptClient {
  constructor(private readonly options: AppsScriptClientOptions) {}

  async get<T>(params: Record<string, string> = {}): Promise<T> {
    const { busyRetries = 3, sleep = defaultSleep } = this.options;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.request<T>(params);
      } catch (error) {
        const busy = error instanceof ApiError && error.code === BUSY;
        if (!busy || attempt >= busyRetries) throw error;
        await sleep(800 * 2 ** attempt);
      }
    }
  }

  private async request<T>(params: Record<string, string>): Promise<T> {
    const token = this.options.getToken();
    if (!token) throw new AccessDeniedError('sin_credenciales');

    const device = await this.options.device.get();
    const query = new URLSearchParams({
      token,
      ...params,
      device: device.id,
      canal: device.channel,
      plat: device.platform,
      modelo: device.model,
      ver: this.options.appVersion,
    });
    if (device.isAndroid) query.set('so', 'android');

    let response: Response;
    try {
      response = await (this.options.fetchFn ?? fetch)(`${this.options.baseUrl}?${query.toString()}`, {
        method: 'GET',
        redirect: 'follow',
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
    return body as T;
  }
}
