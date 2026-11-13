/**
 * Puertos: contratos que la aplicación necesita del mundo exterior.
 * La UI y los casos de uso dependen solo de estas interfaces; cambiar de
 * Apps Script a una API en la nube es escribir otro adaptador, no tocar la UI.
 */
import type { AccessCode } from '@/domain/access';
import type { CatalogPage, CatalogQuery, Facets } from '@/domain/catalogQuery';
import type { FavoritesState } from '@/domain/favorites';
import type { Product } from '@/domain/product';

// ── Errores ──────────────────────────────────────────────────────────────

/** El backend negó el acceso (lista blanca, dispositivo, token…). */
export class AccessDeniedError extends Error {
  constructor(public readonly code: Exclude<AccessCode, 'ok'>) {
    super(code);
    this.name = 'AccessDeniedError';
  }
}

/** Error del backend o de red que no es una decisión de acceso. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Catálogo ─────────────────────────────────────────────────────────────

export interface SyncResult {
  count: number;
  syncedAt: number;
}

export interface CatalogRepository {
  /** Trae la versión vigente del catálogo. Lanza AccessDeniedError si el acceso fue negado. */
  sync(): Promise<SyncResult>;
  /** Consulta paginada ya ordenada por prioridad + A–Z. */
  query(query: CatalogQuery): Promise<CatalogPage>;
  get(ref: string): Promise<Product | undefined>;
  getMany(refs: readonly string[]): Promise<Product[]>;
  facets(): Promise<Facets>;
  lastSyncedAt(): Promise<number | null>;
  /** Borra todo lo guardado en el dispositivo (acceso revocado o cierre de sesión). */
  clear(): Promise<void>;
}

/** Origen remoto del catálogo completo (Apps Script hoy). */
export interface CatalogSource {
  fetchAll(): Promise<Product[]>;
}

export interface CatalogSnapshot {
  products: Product[];
  syncedAt: number;
}

/** Copia local del catálogo para arranque inmediato y uso sin conexión. */
export interface SnapshotStore {
  load(): Promise<CatalogSnapshot | null>;
  save(snapshot: CatalogSnapshot): Promise<void>;
  clear(): Promise<void>;
}

// ── Favoritos ────────────────────────────────────────────────────────────

export interface FavoritesRepository {
  load(userKey: string): Promise<FavoritesState>;
  save(userKey: string, state: FavoritesState): Promise<void>;
}

// ── Identidad ────────────────────────────────────────────────────────────

export interface UserProfile {
  email: string;
  name: string;
  /** URL de la foto de la cuenta de Google (claim "picture"); null si no tiene. */
  picture: string | null;
}

export interface Session {
  user: UserProfile;
  token: string;
  /** Epoch ms en que vence el token. */
  expiresAt: number;
}

export class SignInError extends Error {
  constructor(
    public readonly code: 'cancelado' | 'dominio_no_permitido' | 'no_disponible' | 'error',
    message: string = code,
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

export interface AuthProvider {
  /** Sesión guardada, aunque el token esté vencido (permite ver el catálogo sin conexión). */
  restore(): Promise<Session | null>;
  /** Flujo interactivo de Google. Lanza SignInError. */
  signIn(): Promise<Session>;
  /** Renueva el token sin pedir datos al usuario; null si no fue posible. */
  refresh(current: Session): Promise<Session | null>;
  signOut(): Promise<void>;
}

export type Channel = 'apk_android' | 'pwa_instalada' | 'navegador';

export interface DeviceInfo {
  /** Identificador completo: funciona como credencial, nunca se muestra ni se registra. */
  id: string;
  channel: Channel;
  platform: string;
  model: string;
  isAndroid: boolean;
}

export interface DeviceIdentity {
  get(): Promise<DeviceInfo>;
}
