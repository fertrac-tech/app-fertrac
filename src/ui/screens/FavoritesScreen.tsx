import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { countByList, favoriteRefs, totalFavorites, type FavoritesState } from '@/domain/favorites';
import { priorityTier, type Product } from '@/domain/product';
import { normalize } from '@/domain/text';
import { DeleteListSheet, EditFavoriteSheet, ListNameSheet } from '../components/FavoriteSheets';
import { ProductDetail } from '../components/ProductDetail';
import { EmptyState, ListSkeleton, ProductCards, ProductTable, type ProductItem } from '../components/ProductViews';
import { Icon } from '../components/primitives';
import { useBreakpoint, useContainer, useFavoritesState, useQuery, useReady } from '../context';

type Dialog = { kind: 'new' } | { kind: 'rename'; id: string } | { kind: 'delete'; id: string } | { kind: 'edit'; ref: string } | null;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Tarjetas "Mis listas" (escritorio): vista previa y conteo por nivel de cada lista. */
function ListCards({ state, products, onDialog }: { state: FavoritesState; products: Product[]; onDialog: (d: Dialog) => void }) {
  const byRef = new Map(products.map((p) => [p.ref, p]));
  return (
    <div className="listgrid">
      {state.lists.map((list) => {
        const members = favoriteRefs(state, list.id);
        const inCatalog = members.map((ref) => byRef.get(ref)).filter((p): p is Product => Boolean(p));
        const count = (tier: number) => inCatalog.filter((p) => priorityTier(p) === tier).length;
        return (
          <article key={list.id} className="listcard">
            <div className="listcard__head">
              <span className="listcard__icon"><Icon name="folder" /></span>
              <Link to={`/favoritos?lista=${list.id}`} className="listcard__title">
                <strong className="truncate">{list.name}</strong>
                <small>{plural(members.length, 'producto', 'productos')}</small>
              </Link>
              <button type="button" className="icon-btn" aria-label={`Renombrar lista ${list.name}`} onClick={() => onDialog({ kind: 'rename', id: list.id })}>
                <Icon name="pencil" size={18} />
              </button>
              <button type="button" className="icon-btn" aria-label={`Eliminar lista ${list.name}`} onClick={() => onDialog({ kind: 'delete', id: list.id })}>
                <Icon name="trash" size={18} />
              </button>
            </div>
            <ul className="listcard__preview">
              {members.slice(0, 3).map((ref) => (
                <li key={ref} className="truncate">★ {state.favorites[ref]?.alias || byRef.get(ref)?.name || ref}</li>
              ))}
              {members.length === 0 && <li>Lista vacía</li>}
            </ul>
            <div className="listcard__pills">
              {count(1) > 0 && <span className="pill pill--nuevo">{plural(count(1), 'nuevo', 'nuevos')}</span>}
              {count(2) > 0 && <span className="pill pill--promo">{count(2)} promo</span>}
              {count(4) > 0 && <span className="pill pill--none">{count(4)} sin stock</span>}
            </div>
          </article>
        );
      })}
      <button type="button" className="listcard listcard--new" onClick={() => onDialog({ kind: 'new' })}>
        <Icon name="plus" size={22} /> Nueva lista
      </button>
    </div>
  );
}

export function FavoritesScreen() {
  const { catalog } = useContainer();
  const { catalogVersion } = useReady();
  const state = useFavoritesState();
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState('');

  const listId = state.lists.some((l) => l.id === params.get('lista')) ? params.get('lista') : null;
  const list = state.lists.find((l) => l.id === listId);
  const selectedRef = params.get('ref');
  const counts = countByList(state);
  const total = totalFavorites(state);

  const allRefs = Object.keys(state.favorites);
  const { data: allProducts } = useQuery(() => catalog.getMany(allRefs), [allRefs.join('|'), catalogVersion]);
  const { data: selected, loading: loadingSelected } = useQuery(
    async () => (selectedRef ? catalog.get(selectedRef) : undefined),
    [selectedRef, catalogVersion],
  );

  const setParam = (key: string, value: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });

  // Precio, inventario y condición siempre vienen del catálogo vigente; el orden es el oficial.
  const visible = new Set(favoriteRefs(state, listId));
  const needle = normalize(search);
  const items: ProductItem[] = (allProducts ?? [])
    .filter((p) => visible.has(p.ref))
    .map((product) => ({ product, alias: state.favorites[product.ref]?.alias ?? null }))
    .filter(({ product, alias }) => !needle || normalize(`${alias ?? ''} ${product.name} ${product.ref}`).includes(needle));

  const expanded = breakpoint === 'expanded';
  const listProps = {
    items,
    selectedRef,
    isFavorite: () => true,
    onOpen: (ref: string) => setParam('ref', ref),
    onFavorite: (ref: string) => setDialog({ kind: 'edit', ref }),
  };
  const editingProduct = dialog?.kind === 'edit' ? allProducts?.find((p) => p.ref === dialog.ref) ?? selected : undefined;

  return (
    <div className="catalog">
      <section className="catalog__list" aria-label="Favoritos">
        <header className="pagehead">
          <div>
            <h1>Favoritos</h1>
            <p>
              {plural(total, 'producto', 'productos')} en {plural(state.lists.length, 'lista', 'listas')}
              {expanded ? (state.lists.length === 1 ? ' personal' : ' personales') : ''}
            </p>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ kind: 'new' })}>
            <Icon name="plus" size={16} /> Nueva lista
          </button>
        </header>

        <div className="chips fav-chips" role="group" aria-label="Listas">
          <Link to="/favoritos" className="chip" aria-current={!listId ? 'true' : undefined}>
            Todos · {total}
          </Link>
          {state.lists.map((l) => (
            <Link key={l.id} to={`/favoritos?lista=${l.id}`} className="chip" aria-current={listId === l.id ? 'true' : undefined}>
              {l.name} · {counts[l.id] ?? 0}
            </Link>
          ))}
        </div>

        <div className="scroll" data-scroll>
          {expanded && !listId && state.lists.length > 0 && <ListCards state={state} products={allProducts ?? []} onDialog={setDialog} />}

          <div className="meta">
            <strong style={{ color: 'var(--text-primary)' }}>{list ? `Lista: ${list.name}` : 'Todos los favoritos'}</strong>
            <span className="meta__actions">
              {total > 8 && (
                <label className="search" style={{ height: 32, width: 180 }}>
                  <Icon name="search" size={14} />
                  <input type="search" aria-label="Buscar en favoritos" placeholder="Buscar en favoritos…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
              )}
              {list && (
                <>
                  <button type="button" className="linkbtn" onClick={() => setDialog({ kind: 'rename', id: list.id })}>
                    <Icon name="pencil" size={14} /> Renombrar lista
                  </button>
                  <button type="button" className="linkbtn" aria-label="Eliminar lista" onClick={() => setDialog({ kind: 'delete', id: list.id })}>
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            </span>
          </div>

          {!allProducts ? (
            <ListSkeleton rows={4} />
          ) : items.length === 0 ? (
            <EmptyState title={total === 0 ? 'Aún no tienes favoritos' : 'Sin productos en esta vista'}>
              <span>{total === 0 ? 'Toca la estrella de un producto del catálogo para guardarlo aquí.' : 'Asigna productos a esta lista desde "Editar favorito".'}</span>
              <Link to="/" className="btn btn--outline btn--sm">Ir al catálogo</Link>
            </EmptyState>
          ) : expanded ? (
            <div style={{ display: 'flex', height: Math.min(items.length, 9) * 57 + 46 }}>
              <ProductTable {...listProps} compact={Boolean(selectedRef)} />
            </div>
          ) : (
            <ProductCards {...listProps} />
          )}

          <p className="note">
            Un mismo producto puede estar en varias listas. Renombrar o eliminar una lista no modifica el catálogo; precio,
            inventario y condición siempre son los vigentes.
          </p>
        </div>
      </section>

      {(selectedRef || breakpoint === 'medium') &&
        (selectedRef ? (
          <ProductDetail
            product={selected}
            loading={loadingSelected}
            alias={state.favorites[selectedRef]?.alias}
            favorite={selectedRef in state.favorites}
            dismiss={breakpoint === 'compact' ? 'back' : 'close'}
            overlay={breakpoint === 'compact'}
            onDismiss={() => setParam('ref', null)}
            onFavorite={() => setDialog({ kind: 'edit', ref: selectedRef })}
          />
        ) : (
          <aside className="detail" aria-label="Detalle de producto">
            <EmptyState title="Selecciona un favorito" />
          </aside>
        ))}

      {dialog?.kind === 'new' && <ListNameSheet listId={null} onClose={() => setDialog(null)} onCreated={(id) => setParam('lista', id)} />}
      {dialog?.kind === 'rename' && <ListNameSheet listId={dialog.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && <DeleteListSheet listId={dialog.id} onClose={() => setDialog(null)} onDeleted={() => setParam('lista', null)} />}
      {dialog?.kind === 'edit' && editingProduct && <EditFavoriteSheet product={editingProduct} onClose={() => setDialog(null)} />}
    </div>
  );
}
