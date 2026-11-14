import { accessMessage, evaluateAccess, shortDeviceCode, type AccessCode, type AccessMessage } from '@/domain/access';
import { AccessDeniedError, ApiError, SignInError, type AuthProvider, type CatalogRepository, type Channel, type DeviceIdentity, type Session } from '@/ports';

type DeniedCode = Exclude<AccessCode, 'ok'>;

export type AppState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice: AccessMessage | null; busy: boolean }
  | { status: 'blocked'; session: Session; code: DeniedCode; deviceCode: string; busy: boolean }
  | {
      status: 'ready';
      session: Session;
      deviceCode: string;
      channel: Channel | null;
      syncing: boolean;
      lastSyncedAt: number | null;
      /** Se muestra la última copia guardada porque no hubo conexión o venció la sesión. */
      offline: boolean;
      syncError: string | null;
      /** Cambia con cada sincronización exitosa: las vistas lo usan para refrescar consultas. */
      catalogVersion: number;
    };

type Listener = () => void;

/**
 * Orquesta sesión + seguridad en tres capas + sincronización del catálogo.
 * No conoce React ni el backend concreto: solo los puertos.
 */
export class SessionController {
  private state: AppState = { status: 'loading' };
  private readonly listeners = new Set<Listener>();
  private session: Session | null = null;
  private catalogVersion = 0;
  private channel: Channel | null = null;

  constructor(
    private readonly auth: AuthProvider,
    private readonly catalog: CatalogRepository,
    private readonly device: DeviceIdentity,
  ) {}

  getState = (): AppState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Token vigente para los adaptadores de red. */
  getToken = (): string | null => this.session?.token ?? null;

  async start(): Promise<void> {
    const session = await this.auth.restore();
    if (!session) return this.set({ status: 'signedOut', notice: null, busy: false });
    await this.enter(session);
  }

  async signIn(): Promise<void> {
    if (this.state.status !== 'signedOut' || this.state.busy) return;
    this.set({ ...this.state, notice: null, busy: true });
    await this.completeSignIn(this.auth.signIn());
  }

  /**
   * Monta el botón oficial de Google (web). Devuelve false si el proveedor no tiene botón
   * propio: la pantalla muestra entonces el botón de la app, que llama a `signIn()`.
   */
  mountSignInButton(container: HTMLElement): boolean {
    if (!this.auth.mountButton) return false;
    return this.auth.mountButton(container, (pending) => {
      if (this.state.status !== 'signedOut') return;
      this.set({ ...this.state, notice: null, busy: true });
      void this.completeSignIn(pending);
    });
  }

  /** El backend rotó el token de dispositivo (SEC-02): se usa desde ya y se persiste. */
  rotate(token: string, expiresAt: number): void {
    if (!this.session) return;
    this.session = { ...this.session, token, expiresAt };
    this.auth.persist?.(this.session);
  }

  private async completeSignIn(pending: Promise<Session>): Promise<void> {
    try {
      await this.enter(await pending);
    } catch (error) {
      let notice: AccessMessage | null;
      if (error instanceof SignInError && error.code === 'cancelado') notice = null;
      else if (error instanceof AccessDeniedError && error.code !== 'token_invalido') notice = accessMessage(error.code);
      else notice = { title: 'No se pudo iniciar sesión', body: error instanceof SignInError && error.message !== error.code ? error.message : 'Intenta de nuevo en unos segundos.' };
      this.set({ status: 'signedOut', notice, busy: false });
    }
  }

  /** Reintenta el acceso desde una pantalla de bloqueo (p. ej. dispositivo ya aprobado). */
  async retry(): Promise<void> {
    if (this.state.status !== 'blocked') return;
    const session = this.session ?? this.state.session;
    this.set({ ...this.state, busy: true });
    await this.enter(session);
  }

  /** Sincronización manual desde la app. */
  async sync(): Promise<void> {
    if (this.state.status !== 'ready' || this.state.syncing) return;
    const session = this.session ?? this.state.session;
    this.set({ ...this.state, syncing: true, syncError: null });
    // Manual: si la sesión venció y Google no la renueva en silencio, se pide iniciar sesión.
    await this.enter(session, true, true);
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.catalog.clear().catch(() => undefined);
    this.session = null;
    this.set({ status: 'signedOut', notice: null, busy: false });
  }

  private set(state: AppState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  private async deviceCode(): Promise<string> {
    try {
      const info = await this.device.get();
      this.channel = info.channel;
      return shortDeviceCode(info.id);
    } catch {
      return shortDeviceCode('');
    }
  }

  private async enter(session: Session, allowRefresh = true, interactive = false): Promise<void> {
    this.session = session;
    const deviceCode = await this.deviceCode();
    try {
      const result = await this.catalog.sync();
      this.catalogVersion += 1;
      this.set({ status: 'ready', session, deviceCode, channel: this.channel, syncing: false, lastSyncedAt: result.syncedAt, offline: false, syncError: null, catalogVersion: this.catalogVersion });
    } catch (error) {
      if (error instanceof AccessDeniedError) return this.handleDenied(session, error.code, deviceCode, allowRefresh, interactive);
      const message = error instanceof ApiError && error.code === 'sin_conexion' ? 'Sin conexión. Se muestra la última copia guardada.' : 'No se pudo actualizar el catálogo.';
      await this.showLocalCopy(session, deviceCode, message);
    }
  }

  private async handleDenied(session: Session, code: DeniedCode, deviceCode: string, allowRefresh: boolean, interactive = false): Promise<void> {
    const verdict = evaluateAccess(code);
    if (verdict.wipeLocalData) await this.catalog.clear().catch(() => undefined);

    if (verdict.requiresSignIn) {
      const renewed = allowRefresh ? await this.auth.refresh(session) : null;
      if (renewed) return this.enter(renewed, false);
      // Sesión vencida: al abrir la app, si hay copia local se sigue trabajando; si el usuario
      // pide sincronizar (o no hay copia), se le lleva a iniciar sesión con Google.
      if (!interactive && (await this.catalog.lastSyncedAt().catch(() => null)) !== null) {
        return this.showLocalCopy(session, deviceCode, 'Tu sesión venció. Pulsa "Sincronizar" para renovarla.');
      }
      await this.auth.signOut();
      this.session = null;
      return this.set({ status: 'signedOut', notice: accessMessage(code), busy: false });
    }

    if (verdict.failedLayer === 'whitelist') {
      await this.auth.signOut();
      this.session = null;
      return this.set({ status: 'signedOut', notice: accessMessage(code), busy: false });
    }

    this.set({ status: 'blocked', session, code, deviceCode, busy: false });
  }

  private async showLocalCopy(session: Session, deviceCode: string, syncError: string): Promise<void> {
    const lastSyncedAt = await this.catalog.lastSyncedAt().catch(() => null);
    this.set({ status: 'ready', session, deviceCode, channel: this.channel, syncing: false, lastSyncedAt, offline: true, syncError, catalogVersion: this.catalogVersion });
  }
}
