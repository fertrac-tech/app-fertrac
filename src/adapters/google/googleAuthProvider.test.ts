import { describe, expect, it, vi } from 'vitest';
import { SignInError } from '@/ports';
import { GoogleAuthProvider, SESSION_STORAGE_KEY, type GoogleIdentityServices, type NativeGoogleAuthPlugin } from './googleAuthProvider';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function fakeGis(response: object, seen: { config?: Record<string, unknown>; overrides?: unknown } = {}): GoogleIdentityServices {
  return {
    initTokenClient: (config) => {
      seen.config = config as unknown as Record<string, unknown>;
      return { requestAccessToken: (overrides) => { seen.overrides = overrides; config.callback(response); } };
    },
  };
}

const profile = (body: object) => vi.fn(async () => new Response(JSON.stringify(body)));

function provider(opts: { gis?: GoogleIdentityServices; fetchFn?: typeof fetch; native?: NativeGoogleAuthPlugin | null; storage?: ReturnType<typeof memoryStorage> }) {
  return new GoogleAuthProvider({
    clientId: 'client-id',
    allowedDomain: 'fertrac.com',
    storage: opts.storage ?? memoryStorage(),
    fetchFn: opts.fetchFn,
    now: () => 1_000,
    loadGis: async () => opts.gis ?? fakeGis({}),
    nativePlugin: () => opts.native ?? null,
  });
}

describe('GoogleAuthProvider (web)', () => {
  it('inicia sesión, trae nombre, correo y foto de Google y guarda la sesión', async () => {
    const storage = memoryStorage();
    const seen: { config?: Record<string, unknown> } = {};
    const auth = provider({
      storage,
      gis: fakeGis({ access_token: 'tok', expires_in: 3600 }, seen),
      fetchFn: profile({ email: 'David@Fertrac.com', name: 'David Torres', picture: 'https://lh3/foto' }),
    });
    const session = await auth.signIn();
    expect(session).toEqual({
      user: { email: 'david@fertrac.com', name: 'David Torres', picture: 'https://lh3/foto' },
      token: 'tok',
      expiresAt: 1_000 + 3_600_000,
    });
    expect(seen.config).toMatchObject({ client_id: 'client-id', hd: 'fertrac.com' });
    expect(await auth.restore()).toEqual(session);
  });

  it('rechaza cuentas fuera del dominio corporativo y no guarda sesión', async () => {
    const storage = memoryStorage();
    const auth = provider({ storage, gis: fakeGis({ access_token: 'tok' }), fetchFn: profile({ email: 'alguien@gmail.com' }) });
    await expect(auth.signIn()).rejects.toMatchObject({ code: 'dominio_no_permitido' });
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it('informa cancelación del usuario', async () => {
    const auth = provider({ gis: fakeGis({ error: 'access_denied' }) });
    const error = await auth.signIn().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignInError);
    expect((error as SignInError).code).toBe('cancelado');
  });

  it('sin foto en la cuenta deja picture en null', async () => {
    const auth = provider({ gis: fakeGis({ access_token: 't' }), fetchFn: profile({ email: 'a@fertrac.com', name: 'A' }) });
    expect((await auth.signIn()).user.picture).toBeNull();
  });

  it('renueva en silencio con la misma cuenta', async () => {
    const seen: { overrides?: unknown } = {};
    const auth = provider({ gis: fakeGis({ access_token: 'nuevo' }, seen), fetchFn: profile({ email: 'a@fertrac.com', name: 'A' }) });
    const current = { user: { email: 'a@fertrac.com', name: 'A', picture: null }, token: 'viejo', expiresAt: 0 };
    expect((await auth.refresh(current))?.token).toBe('nuevo');
    expect(seen.overrides).toEqual({ prompt: '', hint: 'a@fertrac.com' });
  });

  it('la renovación falla si Google devuelve otra cuenta', async () => {
    const auth = provider({ gis: fakeGis({ access_token: 'x' }), fetchFn: profile({ email: 'otro@fertrac.com' }) });
    const current = { user: { email: 'a@fertrac.com', name: 'A', picture: null }, token: 'viejo', expiresAt: 0 };
    expect(await auth.refresh(current)).toBeNull();
  });

  it('signOut borra la sesión; restore ignora datos corruptos', async () => {
    const storage = memoryStorage();
    const auth = provider({ storage, gis: fakeGis({ access_token: 't' }), fetchFn: profile({ email: 'a@fertrac.com' }) });
    await auth.signIn();
    await auth.signOut();
    expect(await auth.restore()).toBeNull();
    storage.setItem(SESSION_STORAGE_KEY, '{no-json');
    expect(await auth.restore()).toBeNull();
  });
});

describe('GoogleAuthProvider (APK Android)', () => {
  it('usa el plugin nativo y toma la foto del idToken', async () => {
    const claims = btoa(JSON.stringify({ email: 'ana@fertrac.com', name: 'Ana Ruiz', picture: 'https://lh3/ana' }));
    const native: NativeGoogleAuthPlugin = {
      initialize: vi.fn(),
      signIn: async () => ({ authentication: { accessToken: 'nat', idToken: `x.${claims}.y`, expires_in: 60 } }),
    };
    const session = await provider({ native }).signIn();
    expect(native.initialize).toHaveBeenCalledWith({ clientId: 'client-id', scopes: ['email', 'profile'], grantOfflineAccess: false });
    expect(session).toMatchObject({ user: { email: 'ana@fertrac.com', name: 'Ana Ruiz', picture: 'https://lh3/ana' }, token: 'nat', expiresAt: 61_000 });
  });
});
