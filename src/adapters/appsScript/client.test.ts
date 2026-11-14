import { describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ApiError, type DeviceIdentity } from '@/ports';
import { AppsScriptCatalogSource } from './catalogSource';
import { AppsScriptClient } from './client';

const device: DeviceIdentity = {
  get: async () => ({ id: 'web-12345678', channel: 'navegador', platform: 'web-android', model: 'Android 15 · Chrome/140', isAndroid: true }),
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function makeClient(fetchFn: typeof fetch, token: string | null = 'st1.tok', onSessionRotated?: (g: { token: string; expiresAt: number }) => void) {
  return new AppsScriptClient({
    baseUrl: 'https://script.test/exec',
    appVersion: '11.0.0',
    device,
    getToken: () => token,
    onSessionRotated,
    fetchFn,
    sleep: async () => {},
  });
}

/** Cuerpo JSON de la petición POST. */
const sent = (call: unknown[] | undefined): Record<string, string> => JSON.parse(String((call?.[1] as RequestInit).body));

describe('AppsScriptClient', () => {
  it('envía por POST el token de dispositivo y la identidad, sin credenciales en la URL (SEC-03)', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json({ ok: true }));
    await makeClient(fetchFn).get({ fotos: '1' });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://script.test/exec');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit' });
    expect(sent(fetchFn.mock.calls[0])).toEqual({
      st: 'st1.tok', fotos: '1', device: 'web-12345678', canal: 'navegador',
      plat: 'web-android', modelo: 'Android 15 · Chrome/140', ver: '11.0.0', so: 'android',
    });
  });

  it('entrega al controlador el token rotado por el backend', async () => {
    const onRotated = vi.fn();
    await makeClient(async () => json({ data: [], sesion: { token: 'st1.nuevo', exp: 123 } }), 'st1.tok', onRotated).get();
    expect(onRotated).toHaveBeenCalledWith({ token: 'st1.nuevo', expiresAt: 123 });
  });

  it('canjea el ID token (op=sesion) sin token previo y devuelve el token de dispositivo', async () => {
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) =>
      json({ ok: true, sesion: { token: 'st1.a', exp: 99 }, usuario: { email: 'a@fertrac.com', name: 'A', picture: '' } }));
    const grant = await makeClient(fetchFn, null).createSession('jwt.id.token', 'integ');
    expect(grant).toEqual({ token: 'st1.a', expiresAt: 99, user: { email: 'a@fertrac.com', name: 'A', picture: null } });
    expect(sent(fetchFn.mock.calls[0])).toMatchObject({ op: 'sesion', id_token: 'jwt.id.token', integridad: 'integ', device: 'web-12345678' });
    expect(sent(fetchFn.mock.calls[0])).not.toHaveProperty('st');
  });

  it('el canje propaga el rechazo de acceso', async () => {
    await expect(makeClient(async () => json({ error: 'no_autorizado' }), null).createSession('x')).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('sin token no llama al backend', async () => {
    const fetchFn = vi.fn();
    await expect(makeClient(fetchFn, null).get()).rejects.toMatchObject({ code: 'sin_credenciales' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(['no_autorizado', 'dispositivo_pendiente', 'dispositivo_bloqueado', 'dispositivo_limite', 'token_invalido'])(
    'traduce %s a AccessDeniedError',
    async (code) => {
      const error = await makeClient(async () => json({ error: code })).get().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AccessDeniedError);
      expect((error as AccessDeniedError).code).toBe(code);
    },
  );

  it('otros errores del backend son ApiError', async () => {
    await expect(makeClient(async () => json({ error: 'img_no_disponible' })).get()).rejects.toBeInstanceOf(ApiError);
  });

  it('reintenta cuando el backend está temporalmente ocupado', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: 'temporalmente_ocupado' }))
      .mockResolvedValueOnce(json({ data: [] }));
    await expect(makeClient(fetchFn).get()).resolves.toEqual({ data: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('se rinde tras agotar los reintentos', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json({ error: 'temporalmente_ocupado' }));
    await expect(makeClient(fetchFn).get()).rejects.toMatchObject({ code: 'temporalmente_ocupado' });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('reporta fallas de red y HTTP', async () => {
    await expect(makeClient(async () => { throw new TypeError('offline'); }).get()).rejects.toMatchObject({ code: 'sin_conexion' });
    await expect(makeClient(async () => json({}, 500)).get()).rejects.toMatchObject({ code: 'http_500' });
  });
});

describe('AppsScriptCatalogSource', () => {
  const header = Array.from({ length: 22 }, () => 'H');
  const rowA = ['A-1', 'https://foto-col-b', '', 'PRODUCTO A', '', '', '', '', 'FERTRAC', '', 1000, 950, 920, '', '', '', '', '', 3, '', '', 'NUEVAS'];

  it('combina catálogo y mapa de fotos', async () => {
    const fetchFn: typeof fetch = async (_url, init) =>
      String((init as RequestInit).body).includes('"fotos":"1"') ? json({ ok: true, fotos: { 'A-1': 'https://foto-mapa' } }) : json({ data: [header, rowA] });
    const products = await new AppsScriptCatalogSource(makeClient(fetchFn)).fetchAll();
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ ref: 'A-1', condition: 'NUEVO', stock: 3, photoUrl: 'https://foto-mapa' });
  });

  it('si fallan las fotos, el catálogo carga igual', async () => {
    const fetchFn: typeof fetch = async (_url, init) =>
      String((init as RequestInit).body).includes('"fotos":"1"') ? json({ error: 'error' }) : json({ data: [header, rowA] });
    const products = await new AppsScriptCatalogSource(makeClient(fetchFn)).fetchAll();
    expect(products[0]?.photoUrl).toBe('https://foto-col-b');
  });

  it('propaga el rechazo de acceso del catálogo', async () => {
    const source = new AppsScriptCatalogSource(makeClient(async () => json({ error: 'dispositivo_pendiente' })));
    await expect(source.fetchAll()).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
