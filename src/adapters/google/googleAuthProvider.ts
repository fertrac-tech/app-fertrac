import { isCorporateEmail } from '@/domain/access';
import { SignInError, type AuthProvider, type Session, type SessionGrant, type UserProfile } from '@/ports';

/**
 * Inicio de sesión con Google basado en ID token (JWT) — SEC-01.
 *  · Navegador / PWA: "Sign in with Google" (google.accounts.id): botón oficial para el
 *    inicio interactivo y One Tap con auto_select para renovar en silencio.
 *  · APK Android: plugin nativo de Capacitor (@codetrix-studio/capacitor-google-auth),
 *    que entrega el idToken emitido para el cliente web (serverClientId).
 * El ID token NUNCA se usa para pedir datos: se canjea en el backend (`exchange`), que
 * verifica firma, aud, iss, exp y hd, y devuelve un token de dispositivo firmado (SEC-02).
 * La sesión guardada contiene solo ese token de dispositivo, no credenciales de Google.
 */

export const SESSION_STORAGE_KEY = 'fertrac_v2_session';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const SILENT_TIMEOUT_MS = 10_000;

export interface CredentialResponse {
  credential?: string;
}
export interface PromptNotification {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
}
/** Subconjunto de google.accounts.id que usa la app. */
export interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    hd?: string;
    auto_select?: boolean;
    login_hint?: string;
    use_fedcm_for_button?: boolean;
    itp_support?: boolean;
    context?: 'signin' | 'signup' | 'use';
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  prompt(listener?: (notification: PromptNotification) => void): void;
  cancel?(): void;
  disableAutoSelect?(): void;
}
export interface NativeGoogleAuthPlugin {
  initialize(options: { clientId: string; scopes: string[]; grantOfflineAccess: boolean }): Promise<void> | void;
  signIn(): Promise<{
    email?: string;
    name?: string;
    imageUrl?: string;
    authentication?: { accessToken?: string; idToken?: string };
  }>;
  refresh?(): Promise<{ accessToken?: string; idToken?: string }>;
  signOut?(): Promise<void>;
}
/** Plugin nativo de Play Integrity (Standard API) — SEC-02.3. Opcional. */
export interface NativeIntegrityPlugin {
  requestToken(options: { requestHash: string }): Promise<{ token?: string }>;
}

/** Canje del ID token por el token de dispositivo (lo implementa el adaptador del backend). */
export type SessionExchange = (idToken: string, integrity?: string) => Promise<SessionGrant>;

export interface GoogleAuthOptions {
  clientId: string;
  allowedDomain: string;
  exchange: SessionExchange;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** Inyectables para pruebas; por defecto se resuelven desde `window`. */
  loadGis?: () => Promise<GoogleIdApi>;
  nativePlugin?: () => NativeGoogleAuthPlugin | null;
  integrityPlugin?: () => NativeIntegrityPlugin | null;
  silentTimeoutMs?: number;
}

type CapWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: { GoogleAuth?: NativeGoogleAuthPlugin; PlayIntegrity?: NativeIntegrityPlugin };
  };
};

function loadGisScript(): Promise<GoogleIdApi> {
  type GoogleWindow = Window & { google?: { accounts?: { id?: GoogleIdApi } } };
  const existing = (window as GoogleWindow).google?.accounts?.id;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const gis = (window as GoogleWindow).google?.accounts?.id;
      if (gis) resolve(gis);
      else reject(new SignInError('no_disponible'));
    };
    script.onerror = () => reject(new SignInError('no_disponible', 'No se pudo cargar el inicio de sesión de Google.'));
    document.head.appendChild(script);
  });
}

function nativeCapacitor(): CapWindow['Capacitor'] | null {
  const cap = (window as CapWindow).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}
const defaultNativePlugin = (): NativeGoogleAuthPlugin | null => nativeCapacitor()?.Plugins?.GoogleAuth ?? null;
const defaultIntegrityPlugin = (): NativeIntegrityPlugin | null => nativeCapacitor()?.Plugins?.PlayIntegrity ?? null;

/** Lee los claims del JWT SOLO para validaciones de experiencia de usuario; la verificación real es del backend. */
export function decodeJwtPayload(token: string | undefined): Record<string, unknown> {
  try {
    const part = token?.split('.')[1];
    if (!part) return {};
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** SHA-256 en base64url: liga el token de Play Integrity a este inicio de sesión. */
async function requestHashOf(idToken: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(idToken)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class GoogleAuthProvider implements AuthProvider {
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  private gis: Promise<GoogleIdApi> | null = null;
  /** Destino del próximo credential de Google (botón o renovación silenciosa). */
  private onCredential: ((response: CredentialResponse) => void) | null = null;

  constructor(private readonly options: GoogleAuthOptions) {
    this.storage = options.storage ?? window.localStorage;
  }

  async restore(): Promise<Session | null> {
    try {
      const raw = this.storage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as Session;
      if (!session?.user?.email || !isCorporateEmail(session.user.email, this.options.allowedDomain)) return null;
      // Sesiones de la versión anterior (access token de Google) se descartan: no son tokens de dispositivo.
      if (typeof session.token !== 'string' || !session.token.startsWith('st1.')) return null;
      return session;
    } catch {
      return null;
    }
  }

  /** Web: botón oficial de Google. Devuelve false en la APK (usa el botón propio + plugin nativo). */
  mountButton(container: HTMLElement, onResult: (session: Promise<Session>) => void): boolean {
    if (this.native()) return false;
    void this.loadGis()
      .then((gis) => {
        this.initialize(gis, {});
        this.onCredential = (response) => onResult(this.completeWeb(response.credential));
        gis.renderButton(container, {
          type: 'standard', theme: 'outline', size: 'large', text: 'signin_with',
          shape: 'pill', logo_alignment: 'left', locale: 'es',
          width: Math.min(400, Math.max(200, Math.round(container.clientWidth || 320))),
        });
      })
      .catch((error: unknown) => onResult(Promise.reject(error)));
    return true;
  }

  async signIn(): Promise<Session> {
    const native = this.native();
    // En web el inicio interactivo es el botón oficial; aquí queda One Tap como alternativa.
    const session = native ? await this.signInNative(native) : await this.completeWeb(await this.promptForCredential({}));
    this.save(session);
    return session;
  }

  async refresh(current: Session): Promise<Session | null> {
    try {
      const native = this.native();
      let session: Session;
      if (native) {
        const refreshed = await native.refresh?.();
        if (!refreshed?.idToken) return null;
        session = await this.fromIdToken(refreshed.idToken, true);
      } else {
        session = await this.completeWeb(await this.promptForCredential({ auto_select: true, login_hint: current.user.email }));
      }
      if (session.user.email.toLowerCase() !== current.user.email.toLowerCase()) return null;
      this.save(session);
      return session;
    } catch {
      return null;
    }
  }

  /** Guarda el token rotado por el backend. */
  persist(session: Session): void {
    this.save(session);
  }

  async signOut(): Promise<void> {
    this.storage.removeItem(SESSION_STORAGE_KEY);
    const native = this.native();
    if (native) {
      await native.signOut?.().catch(() => undefined);
    } else if (this.gis) {
      // Evita que One Tap vuelva a entrar solo con la cuenta anterior (equipos compartidos).
      await this.gis.then((gis) => gis.disableAutoSelect?.()).catch(() => undefined);
    }
  }

  // ── internos ─────────────────────────────────────────────────────────

  private native(): NativeGoogleAuthPlugin | null {
    return (this.options.nativePlugin ?? defaultNativePlugin)();
  }

  private loadGis(): Promise<GoogleIdApi> {
    this.gis ??= (this.options.loadGis ?? loadGisScript)().catch((error: unknown) => {
      this.gis = null;
      throw error;
    });
    return this.gis;
  }

  /** google.accounts.id guarda UNA configuración por página; el callback despacha al destino vigente. */
  private initialize(gis: GoogleIdApi, extra: { auto_select?: boolean; login_hint?: string }): void {
    gis.initialize({
      client_id: this.options.clientId,
      hd: this.options.allowedDomain,
      context: 'signin',
      itp_support: true,
      use_fedcm_for_button: true,
      callback: (response) => this.onCredential?.(response),
      ...extra,
    });
  }

  /** One Tap: con auto_select devuelve el ID token sin interacción si hay una sola cuenta autorizada. */
  private async promptForCredential(extra: { auto_select?: boolean; login_hint?: string }): Promise<string> {
    const gis = await this.loadGis();
    const previous = this.onCredential;
    try {
      return await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new SignInError('no_disponible', 'Google no respondió.')), this.options.silentTimeoutMs ?? SILENT_TIMEOUT_MS);
        this.onCredential = (response) => {
          clearTimeout(timer);
          if (response.credential) resolve(response.credential);
          else reject(new SignInError('error'));
        };
        this.initialize(gis, extra);
        gis.prompt((n) => {
          if (n.isNotDisplayed?.() || n.isSkippedMoment?.() || n.isDismissedMoment?.()) {
            clearTimeout(timer);
            reject(new SignInError('cancelado'));
          }
        });
      });
    } finally {
      this.onCredential = previous;
      if (previous) this.initialize(gis, {});
    }
  }

  private async completeWeb(credential: string | undefined): Promise<Session> {
    if (!credential) throw new SignInError('error', 'Google no entregó las credenciales.');
    const session = await this.fromIdToken(credential, false);
    this.save(session);
    return session;
  }

  private async signInNative(plugin: NativeGoogleAuthPlugin): Promise<Session> {
    await plugin.initialize({ clientId: this.options.clientId, scopes: ['email', 'profile'], grantOfflineAccess: false });
    let result: Awaited<ReturnType<NativeGoogleAuthPlugin['signIn']>>;
    try {
      result = await plugin.signIn();
    } catch {
      throw new SignInError('cancelado');
    }
    const idToken = result.authentication?.idToken;
    if (!idToken) throw new SignInError('error', 'Google no entregó las credenciales.');
    return this.fromIdToken(idToken, true);
  }

  /** Validación temprana (UX) del dominio y canje en el backend, que hace la verificación real. */
  private async fromIdToken(idToken: string, native: boolean): Promise<Session> {
    const claims = decodeJwtPayload(idToken);
    const email = String(claims.email ?? '').toLowerCase();
    if (!email || !isCorporateEmail(email, this.options.allowedDomain)) {
      throw new SignInError('dominio_no_permitido', `Usa tu cuenta corporativa @${this.options.allowedDomain}.`);
    }
    const integrity = native ? await this.integrityToken(idToken) : undefined;
    const grant = await this.options.exchange(idToken, integrity);
    const user: UserProfile = {
      email: grant.user?.email || email,
      name: grant.user?.name || String(claims.name ?? '') || email,
      picture: grant.user?.picture || (typeof claims.picture === 'string' ? claims.picture : '') || null,
    };
    return { user, token: grant.token, expiresAt: grant.expiresAt };
  }

  /** Token de Play Integrity si la APK trae el plugin; si no, el backend decide (interruptor). */
  private async integrityToken(idToken: string): Promise<string | undefined> {
    const plugin = (this.options.integrityPlugin ?? defaultIntegrityPlugin)();
    if (!plugin) return undefined;
    try {
      const { token } = await plugin.requestToken({ requestHash: await requestHashOf(idToken) });
      return token || undefined;
    } catch {
      return undefined;
    }
  }

  private save(session: Session): void {
    try {
      this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* sin almacenamiento la sesión vive solo en memoria */
    }
  }
}
