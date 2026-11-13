import { isCorporateEmail } from '@/domain/access';
import { SignInError, type AuthProvider, type Session, type UserProfile } from '@/ports';

/**
 * Inicio de sesión con Google.
 *  · Navegador / PWA: Google Identity Services (token client, sin redirecciones).
 *  · APK Android: plugin nativo de Capacitor (@codetrix-studio/capacitor-google-auth),
 *    el mismo que usa la v10.
 * En ambos casos se obtiene un access token que el backend valida, y el perfil
 * (nombre, correo y foto "picture") de la cuenta de Google.
 */

export const SESSION_STORAGE_KEY = 'fertrac_v2_session';
const SCOPES = 'openid email profile';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; hint?: string }): void;
}
export interface GoogleIdentityServices {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    hd?: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }): TokenClient;
}
export interface NativeGoogleAuthPlugin {
  initialize(options: { clientId: string; scopes: string[]; grantOfflineAccess: boolean }): Promise<void> | void;
  signIn(): Promise<{
    email?: string;
    name?: string;
    imageUrl?: string;
    authentication?: { accessToken?: string; idToken?: string; expires_in?: number };
  }>;
  refresh?(): Promise<{ accessToken?: string }>;
  signOut?(): Promise<void>;
}

export interface GoogleAuthOptions {
  clientId: string;
  allowedDomain: string;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** Inyectables para pruebas; por defecto se resuelven desde `window`. */
  loadGis?: () => Promise<GoogleIdentityServices>;
  nativePlugin?: () => NativeGoogleAuthPlugin | null;
}

function loadGisScript(): Promise<GoogleIdentityServices> {
  type GoogleWindow = Window & { google?: { accounts?: { oauth2?: GoogleIdentityServices } } };
  const existing = (window as GoogleWindow).google?.accounts?.oauth2;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const gis = (window as GoogleWindow).google?.accounts?.oauth2;
      if (gis) resolve(gis);
      else reject(new SignInError('no_disponible'));
    };
    script.onerror = () => reject(new SignInError('no_disponible', 'No se pudo cargar el inicio de sesión de Google.'));
    document.head.appendChild(script);
  });
}

function defaultNativePlugin(): NativeGoogleAuthPlugin | null {
  type CapWindow = Window & {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { GoogleAuth?: NativeGoogleAuthPlugin } };
  };
  const cap = (window as CapWindow).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.GoogleAuth ?? null) : null;
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> {
  try {
    const part = token?.split('.')[1];
    if (!part) return {};
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(base64)))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class GoogleAuthProvider implements AuthProvider {
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  private readonly now: () => number;

  constructor(private readonly options: GoogleAuthOptions) {
    this.storage = options.storage ?? window.localStorage;
    this.now = options.now ?? Date.now;
  }

  async restore(): Promise<Session | null> {
    try {
      const raw = this.storage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as Session;
      if (!session?.user?.email || !isCorporateEmail(session.user.email, this.options.allowedDomain)) return null;
      return session;
    } catch {
      return null;
    }
  }

  async signIn(): Promise<Session> {
    const native = (this.options.nativePlugin ?? defaultNativePlugin)();
    const session = native ? await this.signInNative(native) : await this.signInWeb({});
    this.save(session);
    return session;
  }

  async refresh(current: Session): Promise<Session | null> {
    try {
      const native = (this.options.nativePlugin ?? defaultNativePlugin)();
      let session: Session;
      if (native) {
        const refreshed = await native.refresh?.();
        if (!refreshed?.accessToken) return null;
        session = { ...current, token: refreshed.accessToken, expiresAt: this.now() + 3600_000 };
      } else {
        session = await this.signInWeb({ prompt: '', hint: current.user.email });
      }
      if (session.user.email.toLowerCase() !== current.user.email.toLowerCase()) return null;
      this.save(session);
      return session;
    } catch {
      return null;
    }
  }

  async signOut(): Promise<void> {
    this.storage.removeItem(SESSION_STORAGE_KEY);
    await (this.options.nativePlugin ?? defaultNativePlugin)()?.signOut?.().catch(() => undefined);
  }

  private save(session: Session): void {
    try {
      this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* sin almacenamiento la sesión vive solo en memoria */
    }
  }

  private assertDomain(email: string): void {
    if (!isCorporateEmail(email, this.options.allowedDomain)) {
      throw new SignInError('dominio_no_permitido', `Usa tu cuenta corporativa @${this.options.allowedDomain}.`);
    }
  }

  private async signInWeb(overrides: { prompt?: string; hint?: string }): Promise<Session> {
    const gis = await (this.options.loadGis ?? loadGisScript)();
    const response = await new Promise<TokenResponse>((resolve, reject) => {
      const client = gis.initTokenClient({
        client_id: this.options.clientId,
        scope: SCOPES,
        hd: this.options.allowedDomain,
        callback: resolve,
        error_callback: (error) =>
          reject(new SignInError(error.type === 'popup_closed' ? 'cancelado' : 'error', error.type ?? 'error')),
      });
      client.requestAccessToken(overrides);
    });
    if (!response.access_token) throw new SignInError(response.error === 'access_denied' ? 'cancelado' : 'error', response.error);

    const user = await this.fetchProfile(response.access_token);
    this.assertDomain(user.email);
    return { user, token: response.access_token, expiresAt: this.now() + Number(response.expires_in ?? 3600) * 1000 };
  }

  private async fetchProfile(token: string): Promise<UserProfile> {
    const response = await (this.options.fetchFn ?? fetch)(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new SignInError('error', 'No se pudo leer el perfil de Google.');
    const info = (await response.json()) as { email?: string; name?: string; picture?: string };
    if (!info.email) throw new SignInError('error', 'La cuenta de Google no entregó un correo.');
    return { email: info.email.toLowerCase(), name: info.name || info.email, picture: info.picture || null };
  }

  private async signInNative(plugin: NativeGoogleAuthPlugin): Promise<Session> {
    await plugin.initialize({ clientId: this.options.clientId, scopes: ['email', 'profile'], grantOfflineAccess: false });
    let result: Awaited<ReturnType<NativeGoogleAuthPlugin['signIn']>>;
    try {
      result = await plugin.signIn();
    } catch {
      throw new SignInError('cancelado');
    }
    const claims = decodeJwtPayload(result.authentication?.idToken);
    const email = String(result.email || claims.email || '').toLowerCase();
    const token = result.authentication?.accessToken;
    if (!email || !token) throw new SignInError('error', 'Google no entregó las credenciales.');
    this.assertDomain(email);
    return {
      user: {
        email,
        name: String(result.name || claims.name || email),
        picture: String(result.imageUrl || claims.picture || '') || null,
      },
      token,
      expiresAt: this.now() + Number(result.authentication?.expires_in ?? 3600) * 1000,
    };
  }
}
