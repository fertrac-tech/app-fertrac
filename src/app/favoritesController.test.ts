import { describe, expect, it, vi } from 'vitest';
import { emptyFavorites, FavoritesError, type FavoritesState } from '@/domain/favorites';
import type { FavoritesRepository } from '@/ports';
import { FavoritesController } from './favoritesController';

function memoryRepo() {
  const data = new Map<string, FavoritesState>();
  const repo: FavoritesRepository = {
    load: async (k) => data.get(k) ?? emptyFavorites(),
    save: vi.fn(async (k, s) => void data.set(k, s)),
  };
  return { repo, data };
}

describe('FavoritesController', () => {
  it('persiste cada cambio bajo el usuario activo y notifica a la UI', async () => {
    const { repo, data } = memoryRepo();
    let id = 0;
    const c = new FavoritesController(repo, () => `l${(id += 1)}`);
    const listener = vi.fn();
    c.subscribe(listener);
    await c.load('ana@fertrac.com');

    c.toggle('AMK-2210');
    const listId = c.createList('Clientes Bogotá');
    c.saveFavorite('AMK-2210', 'Amortiguador Kenworth', [listId]);

    expect(data.get('ana@fertrac.com')?.favorites['AMK-2210']).toMatchObject({ alias: 'Amortiguador Kenworth', listIds: ['l1'] });
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('guardar desde el detalle convierte el producto en favorito', async () => {
    const { repo } = memoryRepo();
    const c = new FavoritesController(repo);
    await c.load('a@fertrac.com');
    c.saveFavorite('X-1', '', []);
    expect(c.getState().favorites['X-1']).toMatchObject({ alias: null, listIds: [] });
  });

  it('cambiar de usuario no mezcla favoritos; sin sesión queda vacío', async () => {
    const { repo } = memoryRepo();
    const c = new FavoritesController(repo);
    await c.load('a@fertrac.com');
    c.add('A-1');
    await c.load('b@fertrac.com');
    expect(c.getState().favorites).toEqual({});
    await c.load('a@fertrac.com');
    expect(Object.keys(c.getState().favorites)).toEqual(['A-1']);
    await c.load(null);
    expect(c.getState().favorites).toEqual({});
  });

  it('un nombre de lista inválido lanza error y no guarda nada', async () => {
    const { repo } = memoryRepo();
    const c = new FavoritesController(repo);
    await c.load('a@fertrac.com');
    expect(() => c.createList('  ')).toThrow(FavoritesError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
