import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CONDITION_LABEL, FILTER_KEYS, filterValues, type Facets, type FilterKey } from '@/domain/catalogQuery';
import { isFavorite } from '@/domain/favorites';
import type { Condition } from '@/domain/product';
import { formatCount } from '@/domain/text';
import { EditFavoriteSheet } from '../components/FavoriteSheets';
import { ProductDetail } from '../components/ProductDetail';
import { Watermark } from '../components/Watermark';
import { EmptyState, ListSkeleton, PaginationBar, ProductCards, ProductTable } from '../components/ProductViews';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { HeaderCurve, Icon } from '../components/primitives';
import { useBreakpoint, useContainer, useFavoritesState, useQuery, useReady } from '../context';
import { SyncButton, SyncStamp } from '../layout/Shell';
import { closeWithTransform, openWithTransform, shiftWithAxis } from '../motion/viewTransition';

/** Nombre de cada filtro en la URL y en pantalla. */
const FILTERS: Record<FilterKey, { param: string; label: string; all: string; plural: string }> = {
  line: { param: 'linea', label: 'Línea', all: 'Todas', plural: 'seleccionadas' },
  brand: { param: 'marca', label: 'Marca', all: 'Todas', plural: 'seleccionadas' },
  category: { param: 'categoria', label: 'Categoría', all: 'Todas', plural: 'seleccionadas' },
  subcategory: { param: 'subcategoria', label: 'Subcategoría', all: 'Todas', plural: 'seleccionadas' },
  type: { param: 'tipo', label: 'Tipo', all: 'Todos', plural: 'seleccionados' },
  condition: { param: 'condicion', label: 'Condición', all: 'Todas', plural: 'seleccionadas' },
};

/** Filtros visibles en el catálogo. "Línea" se retiró de la interfaz (se ignora también en la URL). */
const VISIBLE_FILTERS = FILTER_KEYS.filter((key) => key !== 'line');

const optionLabel = (key: FilterKey, value: string) => (key === 'condition' ? CONDITION_LABEL[value as Condition] ?? value : value);

type SelectedFilters = Partial<Record<FilterKey, string[]>>;

interface FilterChipsProps {
  facets: Facets | undefined;
  filters: SelectedFilters;
  onChange: (key: FilterKey, values: string[]) => void;
  onClear: () => void;
}

/** Filtros siempre a la vista (selección múltiple con búsqueda), con "Limpiar filtros" al inicio de la fila. */
function FilterChips({ facets, filters, onChange, onClear }: FilterChipsProps) {
  const active = Object.values(filters).reduce((n, values) => n + (values?.length ?? 0), 0);
  return (
    <div className="chips" role="group" aria-label="Filtros">
      <button type="button" className="chip chip--clear" disabled={active === 0} onClick={onClear}>
        <Icon name="close" size={14} />
        Limpiar filtros{active > 0 ? ` · ${active}` : ''}
      </button>
      {VISIBLE_FILTERS.map((key) => {
        const { label, all, plural } = FILTERS[key];
        return (
          <MultiSelectFilter
            key={key}
            label={label}
            all={all}
            plural={plural}
            options={facets?.[key] ?? []}
            selected={filters[key] ?? []}
            onChange={(values) => onChange(key, values)}
            optionLabel={(value) => optionLabel(key, value)}
          />
        );
      })}
    </div>
  );
}

export function CatalogScreen() {
  const { catalog, favorites } = useContainer();
  const { catalogVersion } = useReady();
  const favoritesState = useFavoritesState();
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);

  // El estado de la vista vive en la URL: se conserva al plegar/desplegar, recargar o compartir.
  const text = params.get('q') ?? '';
  const pageNumber = Number(params.get('p')) || 1;
  const selectedRef = params.get('ref');
  // Selección múltiple en la URL como parámetro repetido: ?marca=A&marca=B (compatible con enlaces de un solo valor).
  const filters: SelectedFilters = {};
  for (const key of VISIBLE_FILTERS) {
    const values = filterValues(params.getAll(FILTERS[key].param));
    if (values.length) filters[key] = values;
  }
  const filtersKey = JSON.stringify(filters);

  const [draft, setDraft] = useState(text);
  const [editing, setEditing] = useState<string | null>(null);

  const update = (changes: Record<string, string | readonly string[] | null>, options?: { replace?: boolean }) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        next.delete(key);
        for (const v of filterValues(value ?? undefined)) next.append(key, v);
      }
      return next;
    }, options);
  };

  useEffect(() => setDraft(text), [text]);
  useEffect(() => {
    if (draft === text) return;
    const timer = setTimeout(() => update({ q: draft.trim() ? draft : null, p: null }, { replace: true }), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const { data: page } = useQuery(() => catalog.query({ text, filters, page: pageNumber }), [text, filtersKey, pageNumber, catalogVersion]);
  const { data: facets } = useQuery(() => catalog.facets(), [catalogVersion]);
  const { data: selected, loading: loadingSelected } = useQuery(
    async () => (selectedRef ? catalog.get(selectedRef) : undefined),
    [selectedRef, catalogVersion],
  );
  const { data: editingProduct } = useQuery(async () => (editing ? catalog.get(editing) : undefined), [editing]);

  // Cambiar de página o de criterio lleva el scroll al inicio.
  useEffect(() => {
    const container = scrollRef.current?.querySelector('[data-scroll]') ?? scrollRef.current;
    container?.scrollTo({ top: 0 });
  }, [page?.page, text, filtersKey]);

  const fav = (ref: string) => isFavorite(favoritesState, ref);
  const onFavorite = (ref: string) => (fav(ref) ? setEditing(ref) : favorites.add(ref));
  const noFilters = Object.fromEntries(FILTER_KEYS.map((k) => [FILTERS[k].param, null]));
  /** Quita todos los filtros y conserva la búsqueda escrita. */
  const clearFilters = () => update({ p: null, ...noFilters });
  const clear = () => {
    setDraft('');
    update({ q: null, p: null, ...noFilters });
  };

  const expanded = breakpoint === 'expanded';
  const items = (page?.items ?? []).map((product) => ({ product }));
  const listProps = { items, selectedRef, isFavorite: fav, onOpen: (ref: string) => openWithTransform(null, ref, () => update({ ref })), onFavorite };
  // El panel de detalle solo existe con un producto elegido; sin él, el catálogo ocupa todo el ancho (fold y horizontal).
  const showDetail = Boolean(selectedRef);
  const total = page ? formatCount(page.total) : '…';

  const search = (
    <label className="search">
      <Icon name="search" size={18} />
      <input
        type="search"
        enterKeyHint="search"
        aria-label="Buscar en el catálogo"
        placeholder={expanded ? 'Buscar por referencia, producto, marca o alterno…' : 'Buscar referencia, producto, marca…'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </label>
  );

  return (
    <div className={`catalog ${showDetail ? 'catalog--detail' : ''}`}>
      <section className="catalog__list" aria-label="Catálogo">
        <div className="toolbar">
          <div className="toolbar__row toolbar__row--top">
            {search}
            {expanded ? (
              <>
                <SyncButton labelled />
                <SyncStamp />
              </>
            ) : null}
          </div>
          <div className="toolbar__row toolbar__row--chips">
              <FilterChips
              facets={facets}
              filters={filters}
              onChange={(key, values) => update({ [FILTERS[key].param]: values, p: null })}
              onClear={clearFilters}
            />
              {expanded && (
                <div className="meta meta--inline">
                  <span>{total} productos</span>
                  <span className="meta__order">Orden: A–Z (Producto)</span>
                </div>
              )}
          </div>
        </div>
        <HeaderCurve />

        {!expanded && (
          <div className="meta">
            <span>
              {total} productos{page ? ` · pág. ${page.page} de ${page.totalPages}` : ''}
            </span>
            <span className="meta__order">A–Z</span>
          </div>
        )}

        <div className={`catalog__area${expanded && page && page.total > 0 ? ' catalog__area--table' : ''}`}>
        <div className={expanded ? 'catalog__list' : 'scroll'} ref={scrollRef} data-scroll={expanded ? undefined : true} style={expanded ? { minHeight: 0 } : undefined}>
          {!page ? (
            <ListSkeleton />
          ) : page.total === 0 ? (
            <EmptyState title="Sin resultados">
              <span>Revisa la búsqueda o quita filtros.</span>
              <button type="button" className="btn btn--outline btn--sm" onClick={clear}>
                Limpiar búsqueda y filtros
              </button>
            </EmptyState>
          ) : expanded ? (
            <ProductTable {...listProps} compact={Boolean(selectedRef)} />
          ) : (
            <ProductCards {...listProps} />
          )}
        </div>
          <Watermark />
        </div>

        {page && page.total > 0 && <PaginationBar info={page} wide={expanded} onPage={(p) => shiftWithAxis(p > pageNumber ? 'next' : 'prev', () => update({ p: p > 1 ? String(p) : null }))} />}
      </section>

      {showDetail && selectedRef && (
        <ProductDetail
          product={selected}
          loading={loadingSelected}
          favorite={fav(selectedRef)}
          dismiss={breakpoint === 'compact' ? 'back' : 'close'}
          overlay={breakpoint === 'compact'}
          onDismiss={() => closeWithTransform(selectedRef, () => update({ ref: null }))}
          onFavorite={() => setEditing(selectedRef)}
        />
      )}

      {editing && editingProduct && <EditFavoriteSheet product={editingProduct} onClose={() => setEditing(null)} />}
    </div>
  );
}
