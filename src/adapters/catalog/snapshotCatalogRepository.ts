import { CatalogIndex, type CatalogPage, type CatalogQuery, type Facets } from '@/domain/catalogQuery';
import type { Product } from '@/domain/product';
import type { CatalogRepository, CatalogSource, SnapshotStore, SyncResult } from '@/ports';

/**
 * Repositorio de catálogo "copia local + índice en memoria".
 *
 * Mientras el backend sea Apps Script (que solo sabe entregar el catálogo completo),
 * el orden por prioridad, la búsqueda y la paginación se resuelven aquí, sobre un
 * índice que se ordena una sola vez por sincronización. Cuando exista una API en la
 * nube, se reemplaza por un repositorio que delegue `query` al servidor: la UI no cambia.
 */
export class SnapshotCatalogRepository implements CatalogRepository {
  private index: CatalogIndex | null = null;
  private syncedAt: number | null = null;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly source: CatalogSource,
    private readonly store: SnapshotStore,
    private readonly now: () => number = Date.now,
  ) {}

  async sync(): Promise<SyncResult> {
    const products = await this.source.fetchAll();
    const syncedAt = this.now();
    this.index = new CatalogIndex(products);
    this.syncedAt = syncedAt;
    // Guardar la copia es una optimización: si el almacenamiento falla, la sesión sigue.
    await this.store.save({ products, syncedAt }).catch(() => undefined);
    return { count: products.length, syncedAt };
  }

  async query(query: CatalogQuery): Promise<CatalogPage> {
    return (await this.ready()).query(query);
  }

  async get(ref: string): Promise<Product | undefined> {
    return (await this.ready()).get(ref);
  }

  async getMany(refs: readonly string[]): Promise<Product[]> {
    return (await this.ready()).getMany(refs);
  }

  async facets(): Promise<Facets> {
    return (await this.ready()).facets();
  }

  async lastSyncedAt(): Promise<number | null> {
    await this.ready();
    return this.syncedAt;
  }

  async clear(): Promise<void> {
    this.index = null;
    this.syncedAt = null;
    this.loading = null;
    await this.store.clear();
  }

  /** Carga la copia local la primera vez; sin copia, trabaja sobre un índice vacío. */
  private async ready(): Promise<CatalogIndex> {
    if (!this.index) {
      this.loading ??= this.store
        .load()
        .catch(() => null)
        .then((snapshot) => {
          if (this.index) return;
          this.index = new CatalogIndex(snapshot?.products ?? []);
          this.syncedAt = snapshot?.syncedAt ?? null;
        });
      await this.loading;
    }
    return this.index ?? new CatalogIndex([]);
  }
}
