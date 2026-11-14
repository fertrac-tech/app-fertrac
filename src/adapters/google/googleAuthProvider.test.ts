import { describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, SignInError, type Session, type SessionGrant } from '@/ports';
import {
  GoogleAuthProvider,
  SESSION_STORAGE_KEY,
  type CredentialResponse,
  type GoogleIdApi,
  type NativeGoogleAuthPlugin,
  type NativeIntegrityPlugin,
  type PromptNotification,
} from './googleAuthProvider';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

/** JWT sin firma válida: el cliente solo lee claims para UX; la firma la verifica el backend. */
function idToken(claims: Record<string, unknown>): string {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'RS256', kid: 'k' })}.${enc(claims)}.firma`;
}

interface FakeGis extends GoogleIdApi {
  configs: Record<string, unknown>[];
  /** Simula que el usuario pulsa el botón oficial. */
  click(credential: string): void;
  disableAutoSelect: ReturnType<typeof vi.fn<() => void>>;
}
function fakeGis(promptResult: { credential?: string; notification?: PromptNotification } = {}): FakeGis {
  let callback: ((r: CredentialResponse) => void) | null = null;
  const gis: FakeGis = {
    configs: [],
    initialize(config) {
      gis.configs.push(config as unknown as Record<string, unknown>);
      callback = config.callback;
    },
    renderButton: vi.fn(),
    prompt(listener) {
      if (promptResult.notification) listener?.(promptResult.notification);
      else if (promptResult.credential) callback?.({ credential: promptResult.credential });
    },
    disableAutoSelect: vi.fn<() => void>(),
    click(credential) {
      callback?.({ credential });
    },
  };
  return gis;
}

const grant = (over: Partial<SessionGrant> = {}): SessionGrant => ({
  token: 'st1.payload.firma',
  expiresAt: 9_000,
  user: { email: 'david@fertrac.com', name: 'David Torres', picture: 'https://lh3/foto' },
  ...over,
});

function provider(opts: {
  gis?: GoogleIdApi;
  native?: NativeGoogleAuthPlugin | null;
  integrity?: NativeIntegrityPlugin | null;
  storage?: ReturnType<typeof memoryStorage>;
  exchange?: (idToken: string, integrity?: string) => Promise<SessionGrant>;
}) {
  const exchange = vi.fn(opts.exchange ?? (async () => grant()));
  const auth = new GoogleAuthProvider({
    clientId: 'client-id',
    allowedDomain: 'fertrac.com',
    exchange,
    storage: opts.storage ?? memoryStorage(),
    loadGis: async () => opts.gis ?? fakeGis(),
    nativePlugin: () => opts.native ?? null,
    integrityPlugin: () => opts.integrity ?? null,
    silentTimeoutMs: 50,
  });
  return { auth, exchange };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const davidToken = idToken({ email: 'David@Fertrac.com', hd: 'fertrac.com', name: 'David' });

describe('GoogleAuthProvider (web, ID token)', () => {
  it('el botón oficial entrega el ID token, se canjea en el backend y se guarda solo el token de dispositivo', async () => {
    const storage = memoryStorage();
    const gis = fakeGis();
    const { auth, exchange } = provider({ storage, gis });
    const results: Promise<Session>[] = [];
    expect(auth.mountButton(document.createElement('div'), (p) => { p.catch(() => undefined); results.push(p); })).toBe(true);
    await tick();
    expect(gis.renderButton).toHaveBeenCalled();
    expect(gis.configs[0]).toMatchObject({ client_id: 'client-id', hd: 'fertrac.com' });

    gis.click(davidToken);
    const session = await results[0];
    expect(exchange).toHaveBeenCalledWith(davidToken, undefined);
    expect(session).toEqual({
      user: { email: 'david@fertrac.com', name: 'David Torres', picture: 'https://lh3/foto' },
      token: 'st1.payload.firma',
      expiresAt: 9_000,
    });
    expect(storage.data.get(SESSION_STORAGE_KEY)).not.toContain(davidToken);
    expect(await auth.restore()).toEqual(session);
  });

  it('rechaza cuentas fuera del dominio corporativo sin llamar al backend', async () => {
    const gis = fakeGis();
    const { auth, exchange } = provider({ gis });
    const results: Promise<Session>[] = [];
    auth.mountButton(document.createElement('div'), (p) => { p.catch(() => undefined); results.push(p); });
    await tick();
    gis.click(idToken({ email: 'alguien@gmail.com' }));
    await expect(results[0]).rejects.toMatchObject({ code: 'dominio_no_permitido' });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('propaga el rechazo del backend (p. ej. cuenta fuera de la lista blanca)', async () => {
    const gis = fakeGis();
    const { auth } = provider({ gis, exchange: async () => { throw new AccessDeniedError('no_autorizado'); } });
    const results: Promise<Session>[] = [];
    auth.mountButton(document.createElement('div'), (p) => { p.catch(() => undefined); results.push(p); });
    await tick();
    gis.click(davidToken);
    await expect(results[0]).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('renueva en silencio con One Tap (auto_select) y la misma cuenta', async () => {
    const gis = fakeGis({ credential: davidToken });
    const { auth } = provider({ gis });
    const current: Session = { user: { email: 'david@fertrac.com', name: 'D', picture: null }, token: 'st1.viejo.x', expiresAt: 0 };
    expect((await auth.refresh(current))?.token).toBe('st1.payload.firma');
    expect(gis.configs.at(-1)).toMatchObject({ auto_select: true, login_hint: 'david@fertrac.com' });
  });

  it('la renovación falla si Google no muestra One Tap o devuelve otra cuenta', async () => {
    const current: Session = { user: { email: 'david@fertrac.com', name: 'D', picture: null }, token: 'st1.v.x', expiresAt: 0 };
    const skipped = provider({ gis: fakeGis({ notification: { isSkippedMoment: () => true } }) });
    expect(await skipped.auth.refresh(current)).toBeNull();
    const other = provider({ gis: fakeGis({ credential: davidToken }), exchange: async () => grant({ user: { email: 'otro@fertrac.com' } }) });
    expect(await other.auth.refresh(current)).toBeNull();
    const silent = provider({ gis: fakeGis({}) });
    expect(await silent.auth.refresh(current)).toBeNull();
  });

  it('descarta sesiones de la versión anterior (access token) y datos corruptos', async () => {
    const storage = memoryStorage();
    const { auth } = provider({ storage });
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ user: { email: 'a@fertrac.com' }, token: 'ya29.access', expiresAt: 1 }));
    expect(await auth.restore()).toBeNull();
    storage.setItem(SESSION_STORAGE_KEY, '{no-json');
    expect(await auth.restore()).toBeNull();
  });

  it('persist guarda el token rotado; signOut lo borra y desactiva la selección automática', async () => {
    const storage = memoryStorage();
    const gis = fakeGis({ credential: davidToken });
    const { auth } = provider({ storage, gis });
    const session = await auth.signIn();
    auth.persist({ ...session, token: 'st1.rotado.x' });
    expect((await auth.restore())?.token).toBe('st1.rotado.x');
    await auth.signOut();
    expect(await auth.restore()).toBeNull();
    expect(gis.disableAutoSelect).toHaveBeenCalled();
  });

  it('informa cuando Google no está disponible', async () => {
    const auth = new GoogleAuthProvider({
      clientId: 'c', allowedDomain: 'fertrac.com', exchange: async () => grant(), storage: memoryStorage(),
      loadGis: async () => { throw new SignInError('no_disponible'); }, nativePlugin: () => null,
    });
    const results: Promise<Session>[] = [];
    auth.mountButton(document.createElement('div'), (p) => { p.catch(() => undefined); results.push(p); });
    await tick();
    await expect(results[0]).rejects.toMatchObject({ code: 'no_disponible' });
  });
});

describe('GoogleAuthProvider (APK Android)', () => {
  const anaToken = idToken({ email: 'ana@fertrac.com', name: 'Ana Ruiz', picture: 'https://lh3/ana' });

  it('usa el plugin nativo, canjea el idToken y no monta el botón web', async () => {
    const native: NativeGoogleAuthPlugin = {
      initialize: vi.fn(),
      signIn: async () => ({ authentication: { accessToken: 'nat', idToken: anaToken } }),
    };
    const { auth, exchange } = provider({ native, exchange: async () => grant({ user: {} }) });
    expect(auth.mountButton(document.createElement('div'), () => {})).toBe(false);
    const session = await auth.signIn();
    expect(native.initialize).toHaveBeenCalledWith({ clientId: 'client-id', scopes: ['email', 'profile'], grantOfflineAccess: false });
    expect(exchange).toHaveBeenCalledWith(anaToken, undefined);
    expect(session.user).toEqual({ email: 'ana@fertrac.com', name: 'Ana Ruiz', picture: 'https://lh3/ana' });
  });

  it('adjunta el token de Play Integrity ligado al ID token cuando la APK trae el plugin', async () => {
    const native: NativeGoogleAuthPlugin = { initialize: vi.fn(), signIn: async () => ({ authentication: { idToken: anaToken } }) };
    const requestToken = vi.fn(async (_: { requestHash: string }) => ({ token: 'integridad-123' }));
    const { auth, exchange } = provider({ native, integrity: { requestToken } });
    await auth.signIn();
    expect(exchange).toHaveBeenCalledWith(anaToken, 'integridad-123');
    expect(requestToken.mock.calls[0]?.[0].requestHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('renueva con el idToken del plugin; sin idToken no hay renovación', async () => {
    const current: Session = { user: { email: 'ana@fertrac.com', name: 'A', picture: null }, token: 'st1.v.x', expiresAt: 0 };
    const ok = provider({ native: { initialize: vi.fn(), signIn: vi.fn(), refresh: async () => ({ idToken: anaToken }) }, exchange: async () => grant({ user: {} }) });
    expect((await ok.auth.refresh(current))?.token).toBe('st1.payload.firma');
    const none = provider({ native: { initialize: vi.fn(), signIn: vi.fn(), refresh: async () => ({ accessToken: 'solo-access' }) } });
    expect(await none.auth.refresh(current)).toBeNull();
  });
});
