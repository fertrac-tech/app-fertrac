import { describe, expect, it, vi } from 'vitest';
import type { AccessCode } from '@/domain/access';
import { AccessDeniedError, ApiError, SignInError, type AuthProvider, type CatalogRepository, type DeviceIdentity, type Session } from '@/ports';
import { SessionController } from './sessionController';

const session: Session = { user: { email: 'david@fertrac.com', name: 'David Torres', picture: null }, token: 'tok', expiresAt: 9e15 };
const device: DeviceIdentity = { get: async () => ({ id: 'web-0000-00a3f9k2', channel: 'navegador', platform: 'web-desktop', model: '', isAndroid: false }) };

function fakeAuth(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    restore: vi.fn(async () => null),
    signIn: vi.fn(async () => session),
    refresh: vi.fn(async () => null),
    signOut: vi.fn(async () => {}),
    ...overrides,
  };
}

/** Catálogo falso: `responses` define el resultado de cada sync en orden (el último se repite). */
function fakeCatalog(responses: (AccessCode | 'red')[], localCopyAt: number | null = null) {
  let call = 0;
  let local = localCopyAt;
  const repo = {
    sync: vi.fn(async () => {
      const r = responses[Math.min(call, responses.length - 1)] ?? 'ok';
      call += 1;
      if (r === 'red') throw new ApiError('sin_conexion');
      if (r !== 'ok') throw new AccessDeniedError(r);
      local = 5000;
      return { count: 10, syncedAt: 5000 };
    }),
    lastSyncedAt: vi.fn(async () => local),
    clear: vi.fn(async () => { local = null; }),
  };
  return repo as typeof repo & CatalogRepository;
}

describe('SessionController — seguridad en tres capas', () => {
  it('sin sesión guardada muestra el login', async () => {
    const c = new SessionController(fakeAuth(), fakeCatalog(['ok']), device);
    await c.start();
    expect(c.getState()).toMatchObject({ status: 'signedOut', notice: null });
  });

  it('Google + lista blanca + dispositivo aprobado → entra y sincroniza', async () => {
    const c = new SessionController(fakeAuth(), fakeCatalog(['ok']), device);
    await c.start();
    await c.signIn();
    expect(c.getState()).toMatchObject({ status: 'ready', offline: false, lastSyncedAt: 5000, deviceCode: 'A3F9K2', catalogVersion: 1 });
    expect(c.getToken()).toBe('tok');
  });

  it('usuario fuera de la lista blanca: vuelve al login, cierra sesión y borra datos locales', async () => {
    const auth = fakeAuth();
    const catalog = fakeCatalog(['no_autorizado'], 100);
    const c = new SessionController(auth, catalog, device);
    await c.start();
    await c.signIn();
    expect(c.getState()).toMatchObject({ status: 'signedOut', notice: { title: 'Cuenta sin acceso' } });
    expect(auth.signOut).toHaveBeenCalled();
    expect(catalog.clear).toHaveBeenCalled();
    expect(c.getToken()).toBeNull();
  });

  it('dispositivo pendiente: pantalla propia con código corto; al aprobarse, Reintentar entra', async () => {
    const catalog = fakeCatalog(['dispositivo_pendiente', 'ok']);
    const c = new SessionController(fakeAuth(), catalog, device);
    await c.start();
    await c.signIn();
    expect(c.getState()).toMatchObject({ status: 'blocked', code: 'dispositivo_pendiente', deviceCode: 'A3F9K2' });
    expect(catalog.clear).not.toHaveBeenCalled();
    await c.retry();
    expect(c.getState().status).toBe('ready');
  });

  it.each(['dispositivo_bloqueado', 'dispositivo_limite', 'canal_no_autorizado', 'web_android_no_permitido'] as const)(
    '%s bloquea el ingreso',
    async (code) => {
      const c = new SessionController(fakeAuth({ restore: async () => session }), fakeCatalog([code]), device);
      await c.start();
      expect(c.getState()).toMatchObject({ status: 'blocked', code });
    },
  );

  it('dispositivo bloqueado borra la copia local del catálogo', async () => {
    const catalog = fakeCatalog(['dispositivo_bloqueado'], 100);
    const c = new SessionController(fakeAuth({ restore: async () => session }), catalog, device);
    await c.start();
    expect(catalog.clear).toHaveBeenCalled();
  });

  it('token vencido: se renueva en silencio y reintenta una sola vez', async () => {
    const renewed = { ...session, token: 'nuevo' };
    const auth = fakeAuth({ restore: async () => session, refresh: vi.fn(async () => renewed) });
    const catalog = fakeCatalog(['token_invalido', 'ok']);
    const c = new SessionController(auth, catalog, device);
    await c.start();
    expect(c.getState().status).toBe('ready');
    expect(c.getToken()).toBe('nuevo');
    expect(catalog.sync).toHaveBeenCalledTimes(2);
  });

  it('token vencido sin renovación y sin copia local → login', async () => {
    const auth = fakeAuth({ restore: async () => session });
    const c = new SessionController(auth, fakeCatalog(['token_invalido']), device);
    await c.start();
    expect(c.getState()).toMatchObject({ status: 'signedOut', notice: { title: 'Tu sesión expiró' } });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('token vencido con copia local → sigue trabajando sin conexión', async () => {
    const c = new SessionController(fakeAuth({ restore: async () => session }), fakeCatalog(['token_invalido'], 777), device);
    await c.start();
    expect(c.getState()).toMatchObject({ status: 'ready', offline: true, lastSyncedAt: 777 });
  });

  it('sin red: abre con la última copia guardada', async () => {
    const c = new SessionController(fakeAuth({ restore: async () => session }), fakeCatalog(['red'], 777), device);
    await c.start();
    expect(c.getState()).toMatchObject({ status: 'ready', offline: true, lastSyncedAt: 777, syncError: expect.stringContaining('Sin conexión') });
  });

  it('sincronización manual: actualiza versión; si revocan el acceso, bloquea', async () => {
    const catalog = fakeCatalog(['ok', 'ok', 'dispositivo_bloqueado']);
    const c = new SessionController(fakeAuth({ restore: async () => session }), catalog, device);
    const seen: string[] = [];
    c.subscribe(() => seen.push(c.getState().status));
    await c.start();
    await c.sync();
    expect(c.getState()).toMatchObject({ status: 'ready', catalogVersion: 2 });
    await c.sync();
    expect(c.getState()).toMatchObject({ status: 'blocked', code: 'dispositivo_bloqueado' });
    expect(seen).toContain('ready');
  });

  it('cancelar el login de Google no muestra error; otra falla sí', async () => {
    const cancel = new SessionController(fakeAuth({ signIn: async () => { throw new SignInError('cancelado'); } }), fakeCatalog(['ok']), device);
    await cancel.start();
    await cancel.signIn();
    expect(cancel.getState()).toMatchObject({ status: 'signedOut', notice: null, busy: false });

    const domain = new SessionController(fakeAuth({ signIn: async () => { throw new SignInError('dominio_no_permitido', 'Usa tu cuenta corporativa @fertrac.com.'); } }), fakeCatalog(['ok']), device);
    await domain.start();
    await domain.signIn();
    expect(domain.getState()).toMatchObject({ notice: { body: 'Usa tu cuenta corporativa @fertrac.com.' } });
  });

  it('cerrar sesión borra sesión y catálogo local', async () => {
    const auth = fakeAuth({ restore: async () => session });
    const catalog = fakeCatalog(['ok']);
    const c = new SessionController(auth, catalog, device);
    await c.start();
    await c.signOut();
    expect(c.getState().status).toBe('signedOut');
    expect(auth.signOut).toHaveBeenCalled();
    expect(catalog.clear).toHaveBeenCalled();
    expect(c.getToken()).toBeNull();
  });
});
