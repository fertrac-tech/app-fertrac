import { describe, expect, it, vi } from 'vitest';
import { makeProduct } from '@/domain/testing';
import { AccessDeniedError, type CatalogSnapshot, type SnapshotStore } from '@/ports';
import { SnapshotCatalogRepository } from './snapshotCatalogRepository';

function memoryStore(initial: CatalogSnapshot | null = null): SnapshotStore & { current: CatalogSnapshot | null } {
  return {
    current: initial,
    async load() { return this.current; },
    async save(s) { this.current = s; },
    async clear() { this.current = null; },
  };
}

const products = [
  makeProduct({ ref: 'Z-9', name: 'ZAPATA', stock: 0 }),
  makeProduct({ ref: 'B-1', name: 'BOMBA', condition: 'NUEVO', stock: 2 }),
  makeProduct({ ref: 'A-1', name: 'ARANDELA' }),
];

describe('SnapshotCatalogRepository', () => {
  it('sincroniza, ordena por prioridad y guarda la copia local', async () => {
    const store = memoryStore();
    const repo = new SnapshotCatalogRepository({ fetchAll: async () => products }, store, () => 1234);
    expect(await repo.sync()).toEqual({ count: 3, syncedAt: 1234 });
    expect((await repo.query({})).items.map((p) => p.ref)).toEqual(['B-1', 'A-1', 'Z-9']);
    expect(store.current?.products).toHaveLength(3);
    expect(await repo.lastSyncedAt()).toBe(1234);
  });

  it('arranca desde la copia local sin llamar al backend (uso sin conexión)', async () => {
    const fetchAll = vi.fn();
    const repo = new SnapshotCatalogRepository({ fetchAll }, memoryStore({ products, syncedAt: 99 }));
    expect((await repo.query({ text: 'bomba' })).total).toBe(1);
    expect(await repo.get('A-1')).toMatchObject({ name: 'ARANDELA' });
    expect(await repo.lastSyncedAt()).toBe(99);
    expect(fetchAll).not.toHaveBeenCalled();
  });

  it('sin copia local responde vacío en lugar de fallar', async () => {
    const repo = new SnapshotCatalogRepository({ fetchAll: async () => [] }, memoryStore());
    expect(await repo.query({})).toMatchObject({ total: 0, items: [] });
    expect(await repo.lastSyncedAt()).toBeNull();
  });

  it('si la sincronización es rechazada conserva los datos previos y propaga el error', async () => {
    const store = memoryStore({ products, syncedAt: 1 });
    const repo = new SnapshotCatalogRepository(
      { fetchAll: async () => { throw new AccessDeniedError('dispositivo_pendiente'); } },
      store,
    );
    await expect(repo.sync()).rejects.toBeInstanceOf(AccessDeniedError);
    expect((await repo.query({})).total).toBe(3);
  });

  it('clear borra memoria y copia local', async () => {
    const store = memoryStore({ products, syncedAt: 1 });
    const repo = new SnapshotCatalogRepository({ fetchAll: async () => products }, store);
    await repo.query({});
    await repo.clear();
    expect(store.current).toBeNull();
    expect((await repo.query({})).total).toBe(0);
  });

  it('una falla al guardar la copia no rompe la sincronización', async () => {
    const store = memoryStore();
    store.save = async () => { throw new Error('QuotaExceeded'); };
    const repo = new SnapshotCatalogRepository({ fetchAll: async () => products }, store);
    await expect(repo.sync()).resolves.toMatchObject({ count: 3 });
    expect((await repo.query({})).total).toBe(3);
  });
});
