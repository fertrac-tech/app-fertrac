import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import { emptyFavorites, FAVORITES_SCHEMA_VERSION, type FavoritesState } from '@/domain/favorites';
import type { CatalogSnapshot, FavoritesRepository, SnapshotStore } from '@/ports';

const SNAPSHOT_KEY = 'catalog:v1';

/** Copia local del catálogo en IndexedDB (soporta varios MB sin bloquear la UI). */
export class IdbSnapshotStore implements SnapshotStore {
  private readonly store: UseStore;

  constructor(dbName = 'fertrac_v2_catalog') {
    this.store = createStore(dbName, 'kv');
  }

  async load(): Promise<CatalogSnapshot | null> {
    const value = await get<CatalogSnapshot>(SNAPSHOT_KEY, this.store);
    return value && Array.isArray(value.products) ? value : null;
  }

  save(snapshot: CatalogSnapshot): Promise<void> {
    return set(SNAPSHOT_KEY, snapshot, this.store);
  }

  clear(): Promise<void> {
    return del(SNAPSHOT_KEY, this.store);
  }
}

/**
 * Favoritos por usuario en el dispositivo. El estado lleva `version` y `updatedAt`
 * para poder migrarlo y sincronizarlo con la nube cuando exista ese backend.
 */
export class IdbFavoritesRepository implements FavoritesRepository {
  private readonly store: UseStore;

  constructor(dbName = 'fertrac_v2_favorites') {
    this.store = createStore(dbName, 'kv');
  }

  async load(userKey: string): Promise<FavoritesState> {
    const value = await get<FavoritesState>(this.key(userKey), this.store);
    if (!value || value.version !== FAVORITES_SCHEMA_VERSION) return emptyFavorites();
    return value;
  }

  save(userKey: string, state: FavoritesState): Promise<void> {
    return set(this.key(userKey), state, this.store);
  }

  private key(userKey: string): string {
    return `favorites:${userKey.trim().toLowerCase()}`;
  }
}
