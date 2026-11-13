import { useState, type FormEvent } from 'react';
import { ALIAS_MAX_LENGTH, FAVORITES_ERROR_MESSAGE, FavoritesError, LIST_NAME_MAX_LENGTH } from '@/domain/favorites';
import type { Product } from '@/domain/product';
import { useContainer, useFavoritesState } from '../context';
import { Icon, Sheet } from './primitives';

const errorText = (error: unknown) =>
  error instanceof FavoritesError ? FAVORITES_ERROR_MESSAGE[error.code] : 'No se pudo guardar. Intenta de nuevo.';

/** Hoja "Editar favorito" (pantalla 06): nombre personalizado + listas del usuario. */
export function EditFavoriteSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { favorites } = useContainer();
  const state = useFavoritesState();
  const current = state.favorites[product.ref];
  const [alias, setAlias] = useState(current?.alias ?? '');
  const [selected, setSelected] = useState<string[]>(current?.listIds ?? []);
  const [newList, setNewList] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));

  const addList = () => {
    try {
      const id = favorites.createList(newList ?? '');
      setSelected((ids) => [...ids, id]);
      setNewList(null);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (newList !== null && newList.trim() !== '') return addList();
    favorites.saveFavorite(product.ref, alias, selected);
    onClose();
  };

  return (
    <Sheet title={current ? 'Editar favorito' : 'Guardar en favoritos'} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        {product.ref} · {product.name}
      </p>
      <form onSubmit={save} style={{ display: 'contents' }}>
        <label className="field">
          Nombre personalizado
          <input value={alias} maxLength={ALIAS_MAX_LENGTH} placeholder={product.name} onChange={(e) => setAlias(e.target.value)} />
        </label>

        <div className="field">
          <span id="fav-lists">Lista / categoría</span>
          <div className="sheet__chips" role="group" aria-labelledby="fav-lists">
            {state.lists.map((list) => (
              <button key={list.id} type="button" className="chip" aria-pressed={selected.includes(list.id)} onClick={() => toggle(list.id)}>
                {list.name}
              </button>
            ))}
            {newList === null && (
              <button type="button" className="chip" onClick={() => setNewList('')}>
                + Crear lista
              </button>
            )}
          </div>
          {newList !== null && (
            <div className="toolbar__row">
              <input
                autoFocus
                aria-label="Nombre de la nueva lista"
                placeholder="Nombre de la lista"
                style={{ flex: 1, minWidth: 0 }}
                value={newList}
                maxLength={LIST_NAME_MAX_LENGTH}
                onChange={(e) => setNewList(e.target.value)}
              />
              <button type="button" className="btn btn--outline" onClick={addList}>
                Crear
              </button>
            </div>
          )}
          {error && <span className="field__error" role="alert">{error}</span>}
        </div>

        <small>El nombre y la lista son personales: no modifican el catálogo.</small>
        <div className="sheet__actions">
          {current && (
            <button type="button" className="btn btn--danger" onClick={() => { favorites.remove(product.ref); onClose(); }}>
              Quitar
            </button>
          )}
          <button type="submit" className="btn btn--primary">
            Guardar
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** Crear o renombrar una lista. */
export function ListNameSheet({ listId, onClose, onCreated }: { listId: string | null; onClose: () => void; onCreated?: (id: string) => void }) {
  const { favorites } = useContainer();
  const state = useFavoritesState();
  const existing = state.lists.find((l) => l.id === listId);
  const [name, setName] = useState(existing?.name ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      if (existing) favorites.renameList(existing.id, name);
      else onCreated?.(favorites.createList(name));
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Sheet title={existing ? 'Renombrar lista' : 'Nueva lista'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'contents' }}>
        <label className="field">
          Nombre de la lista
          <input value={name} maxLength={LIST_NAME_MAX_LENGTH} placeholder="Ej.: Clientes Bogotá" onChange={(e) => setName(e.target.value)} />
          {error && <span className="field__error" role="alert">{error}</span>}
        </label>
        <div className="sheet__actions">
          <button type="button" className="btn btn--outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary">
            {existing ? 'Guardar' : 'Crear lista'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function DeleteListSheet({ listId, onClose, onDeleted }: { listId: string; onClose: () => void; onDeleted: () => void }) {
  const { favorites } = useContainer();
  const list = useFavoritesState().lists.find((l) => l.id === listId);
  return (
    <Sheet title="Eliminar lista" onClose={onClose}>
      <p className="muted" style={{ fontSize: 14 }}>
        Se eliminará la lista <strong>{list?.name}</strong>. Los productos siguen en tus favoritos.
      </p>
      <div className="sheet__actions">
        <button type="button" className="btn btn--outline" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn btn--danger" onClick={() => { favorites.deleteList(listId); onDeleted(); onClose(); }}>
          <Icon name="trash" size={18} /> Eliminar
        </button>
      </div>
    </Sheet>
  );
}
