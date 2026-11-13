import { describe, expect, it } from 'vitest';
import {
  ALIAS_MAX_LENGTH,
  addFavorite,
  countByList,
  createList,
  deleteList,
  emptyFavorites,
  FavoritesError,
  favoriteRefs,
  isFavorite,
  removeFavorite,
  renameList,
  setAlias,
  setFavoriteLists,
  toggleFavorite,
  totalFavorites,
} from './favorites';

const base = () => {
  let s = emptyFavorites();
  s = addFavorite(s, 'AMK-2210', 1);
  s = addFavorite(s, 'FAP-3321', 2);
  s = createList(s, 'Clientes Bogotá', 'l1', 3);
  s = createList(s, 'Frenos', 'l2', 4);
  return s;
};

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof FavoritesError ? e.code : 'otro';
  }
  return 'sin_error';
};

describe('favoritos', () => {
  it('agrega, consulta y quita sin mutar el estado previo', () => {
    const empty = emptyFavorites();
    const one = addFavorite(empty, 'AMK-2210', 10);
    expect(isFavorite(empty, 'AMK-2210')).toBe(false);
    expect(isFavorite(one, 'AMK-2210')).toBe(true);
    expect(one.updatedAt).toBe(10);
    expect(isFavorite(removeFavorite(one, 'AMK-2210'), 'AMK-2210')).toBe(false);
  });

  it('agregar dos veces es idempotente', () => {
    const one = addFavorite(emptyFavorites(), 'A', 1);
    expect(addFavorite(one, 'A', 2)).toBe(one);
  });

  it('toggle alterna el estado', () => {
    const on = toggleFavorite(emptyFavorites(), 'A');
    expect(totalFavorites(on)).toBe(1);
    expect(totalFavorites(toggleFavorite(on, 'A'))).toBe(0);
  });
});

describe('alias (nombre personalizado)', () => {
  it('renombra limpiando espacios', () => {
    const s = setAlias(base(), 'AMK-2210', '  Amortiguador   Kenworth ');
    expect(s.favorites['AMK-2210']?.alias).toBe('Amortiguador Kenworth');
  });
  it('alias vacío restaura el nombre del catálogo', () => {
    const s = setAlias(setAlias(base(), 'AMK-2210', 'X'), 'AMK-2210', '   ');
    expect(s.favorites['AMK-2210']?.alias).toBeNull();
  });
  it('recorta al máximo permitido', () => {
    const s = setAlias(base(), 'AMK-2210', 'x'.repeat(200));
    expect(s.favorites['AMK-2210']?.alias).toHaveLength(ALIAS_MAX_LENGTH);
  });
  it('no permite renombrar algo que no es favorito', () => {
    expect(code(() => setAlias(base(), 'NO', 'x'))).toBe('no_es_favorito');
  });
});

describe('listas (categorías del usuario)', () => {
  it('crea listas con nombre válido y único (sin distinguir tildes ni mayúsculas)', () => {
    expect(base().lists.map((l) => l.name)).toEqual(['Clientes Bogotá', 'Frenos']);
    expect(code(() => createList(base(), '  ', 'x'))).toBe('nombre_vacio');
    expect(code(() => createList(base(), 'clientes bogota', 'x'))).toBe('nombre_duplicado');
    expect(code(() => createList(base(), 'n'.repeat(31), 'x'))).toBe('nombre_largo');
  });

  it('renombra una lista y valida duplicados contra las demás', () => {
    expect(renameList(base(), 'l1', 'Clientes Cali').lists[0]?.name).toBe('Clientes Cali');
    expect(renameList(base(), 'l1', 'CLIENTES BOGOTÁ').lists[0]?.name).toBe('CLIENTES BOGOTÁ');
    expect(code(() => renameList(base(), 'l1', 'frenos'))).toBe('nombre_duplicado');
    expect(code(() => renameList(base(), 'zz', 'Otra'))).toBe('lista_inexistente');
  });

  it('asigna un favorito a varias listas e ignora listas inexistentes', () => {
    const s = setFavoriteLists(base(), 'AMK-2210', ['l1', 'l2', 'l2', 'fantasma']);
    expect(s.favorites['AMK-2210']?.listIds).toEqual(['l1', 'l2']);
    expect(favoriteRefs(s, 'l1')).toEqual(['AMK-2210']);
    expect(favoriteRefs(s).sort()).toEqual(['AMK-2210', 'FAP-3321']);
    expect(countByList(s)).toEqual({ l1: 1, l2: 1 });
  });

  it('eliminar una lista conserva los favoritos', () => {
    const s = deleteList(setFavoriteLists(base(), 'AMK-2210', ['l1']), 'l1');
    expect(s.lists.map((l) => l.id)).toEqual(['l2']);
    expect(isFavorite(s, 'AMK-2210')).toBe(true);
    expect(s.favorites['AMK-2210']?.listIds).toEqual([]);
  });
});
