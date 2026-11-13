/**
 * Favoritos: subconjunto personal del catálogo. Cada favorito admite un alias
 * (nombre personalizado) y pertenece a cero o más listas creadas por el usuario.
 * Todas las operaciones son puras: reciben un estado y devuelven uno nuevo.
 */

export const ALIAS_MAX_LENGTH = 60;
export const LIST_NAME_MAX_LENGTH = 30;
export const FAVORITES_SCHEMA_VERSION = 1;

export interface Favorite {
  ref: string;
  alias: string | null;
  listIds: string[];
  addedAt: number;
}

export interface FavoriteList {
  id: string;
  name: string;
  createdAt: number;
}

export interface FavoritesState {
  version: number;
  favorites: Record<string, Favorite>;
  lists: FavoriteList[];
  /** Marca de última modificación: base para sincronizar con la nube más adelante. */
  updatedAt: number;
}

export type FavoritesErrorCode = 'nombre_vacio' | 'nombre_largo' | 'nombre_duplicado' | 'lista_inexistente' | 'no_es_favorito';

export class FavoritesError extends Error {
  constructor(public readonly code: FavoritesErrorCode) {
    super(code);
    this.name = 'FavoritesError';
  }
}

export const FAVORITES_ERROR_MESSAGE: Record<FavoritesErrorCode, string> = {
  nombre_vacio: 'Escribe un nombre.',
  nombre_largo: `El nombre admite máximo ${LIST_NAME_MAX_LENGTH} caracteres.`,
  nombre_duplicado: 'Ya tienes una lista con ese nombre.',
  lista_inexistente: 'La lista ya no existe.',
  no_es_favorito: 'El producto no está en favoritos.',
};

export function emptyFavorites(): FavoritesState {
  return { version: FAVORITES_SCHEMA_VERSION, favorites: {}, lists: [], updatedAt: 0 };
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const sameName = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

function touch(state: FavoritesState, now: number): FavoritesState {
  return { ...state, updatedAt: now };
}

export function isFavorite(state: FavoritesState, ref: string): boolean {
  return ref in state.favorites;
}

export function addFavorite(state: FavoritesState, ref: string, now = Date.now()): FavoritesState {
  if (isFavorite(state, ref)) return state;
  const favorite: Favorite = { ref, alias: null, listIds: [], addedAt: now };
  return touch({ ...state, favorites: { ...state.favorites, [ref]: favorite } }, now);
}

export function removeFavorite(state: FavoritesState, ref: string, now = Date.now()): FavoritesState {
  if (!isFavorite(state, ref)) return state;
  const { [ref]: _removed, ...rest } = state.favorites;
  return touch({ ...state, favorites: rest }, now);
}

export function toggleFavorite(state: FavoritesState, ref: string, now = Date.now()): FavoritesState {
  return isFavorite(state, ref) ? removeFavorite(state, ref, now) : addFavorite(state, ref, now);
}

function requireFavorite(state: FavoritesState, ref: string): Favorite {
  const favorite = state.favorites[ref];
  if (!favorite) throw new FavoritesError('no_es_favorito');
  return favorite;
}

/** Renombra un favorito. Un alias vacío restaura el nombre del catálogo. */
export function setAlias(state: FavoritesState, ref: string, alias: string, now = Date.now()): FavoritesState {
  const favorite = requireFavorite(state, ref);
  const value = clean(alias).slice(0, ALIAS_MAX_LENGTH);
  const next: Favorite = { ...favorite, alias: value === '' ? null : value };
  return touch({ ...state, favorites: { ...state.favorites, [ref]: next } }, now);
}

function validateListName(state: FavoritesState, name: string, ignoreId?: string): string {
  const value = clean(name);
  if (value === '') throw new FavoritesError('nombre_vacio');
  if (value.length > LIST_NAME_MAX_LENGTH) throw new FavoritesError('nombre_largo');
  if (state.lists.some((l) => l.id !== ignoreId && sameName(l.name, value))) {
    throw new FavoritesError('nombre_duplicado');
  }
  return value;
}

export function createList(
  state: FavoritesState,
  name: string,
  id: string,
  now = Date.now(),
): FavoritesState {
  const value = validateListName(state, name);
  return touch({ ...state, lists: [...state.lists, { id, name: value, createdAt: now }] }, now);
}

export function renameList(state: FavoritesState, id: string, name: string, now = Date.now()): FavoritesState {
  if (!state.lists.some((l) => l.id === id)) throw new FavoritesError('lista_inexistente');
  const value = validateListName(state, name, id);
  return touch({ ...state, lists: state.lists.map((l) => (l.id === id ? { ...l, name: value } : l)) }, now);
}

/** Elimina la lista; los productos siguen siendo favoritos (solo pierden esa categoría). */
export function deleteList(state: FavoritesState, id: string, now = Date.now()): FavoritesState {
  if (!state.lists.some((l) => l.id === id)) return state;
  const favorites = Object.fromEntries(
    Object.entries(state.favorites).map(([ref, f]) => [ref, { ...f, listIds: f.listIds.filter((l) => l !== id) }]),
  );
  return touch({ ...state, favorites, lists: state.lists.filter((l) => l.id !== id) }, now);
}

/** Define a qué listas pertenece un favorito (se ignoran listas inexistentes). */
export function setFavoriteLists(
  state: FavoritesState,
  ref: string,
  listIds: readonly string[],
  now = Date.now(),
): FavoritesState {
  const favorite = requireFavorite(state, ref);
  const valid = new Set(state.lists.map((l) => l.id));
  const next: Favorite = { ...favorite, listIds: [...new Set(listIds)].filter((id) => valid.has(id)) };
  return touch({ ...state, favorites: { ...state.favorites, [ref]: next } }, now);
}

export function favoriteRefs(state: FavoritesState, listId?: string | null): string[] {
  return Object.values(state.favorites)
    .filter((f) => !listId || f.listIds.includes(listId))
    .map((f) => f.ref);
}

export function countByList(state: FavoritesState): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(state.lists.map((l) => [l.id, 0]));
  for (const favorite of Object.values(state.favorites)) {
    for (const id of favorite.listIds) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export function totalFavorites(state: FavoritesState): number {
  return Object.keys(state.favorites).length;
}
