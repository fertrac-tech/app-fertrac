import { describe, expect, it } from 'vitest';
import { addFavorite, createList, emptyFavorites, setAlias } from '@/domain/favorites';
import { makeProduct } from '@/domain/testing';
import { IdbFavoritesRepository, IdbSnapshotStore } from './idbStores';

let n = 0;
const unique = (prefix: string) => `${prefix}_${(n += 1)}`;

describe('IdbSnapshotStore', () => {
  it('guarda, lee y borra la copia del catálogo', async () => {
    const store = new IdbSnapshotStore(unique('cat'));
    expect(await store.load()).toBeNull();
    await store.save({ products: [makeProduct({ ref: 'A-1' })], syncedAt: 5 });
    expect(await store.load()).toMatchObject({ syncedAt: 5, products: [{ ref: 'A-1' }] });
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe('IdbFavoritesRepository', () => {
  it('persiste alias y listas, y los recupera en otra instancia (reinicio de la app)', async () => {
    const db = unique('fav');
    let state = addFavorite(emptyFavorites(), 'AMK-2210', 1);
    state = setAlias(state, 'AMK-2210', 'Amortiguador Kenworth', 2);
    state = createList(state, 'Clientes Bogotá', 'l1', 3);
    await new IdbFavoritesRepository(db).save('usuario@fertrac.com', state);
    expect(await new IdbFavoritesRepository(db).load('usuario@fertrac.com')).toEqual(state);
  });

  it('aísla los favoritos por usuario (sin distinguir mayúsculas en el correo)', async () => {
    const repo = new IdbFavoritesRepository(unique('fav'));
    await repo.save('Ana@fertrac.com', addFavorite(emptyFavorites(), 'A-1', 1));
    expect(Object.keys((await repo.load('ana@fertrac.com')).favorites)).toEqual(['A-1']);
    expect((await repo.load('luis@fertrac.com')).favorites).toEqual({});
  });

  it('descarta datos de un esquema desconocido', async () => {
    const repo = new IdbFavoritesRepository(unique('fav'));
    await repo.save('a@fertrac.com', { ...emptyFavorites(), version: 99 });
    expect(await repo.load('a@fertrac.com')).toEqual(emptyFavorites());
  });
});
