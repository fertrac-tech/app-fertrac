import type { ReactNode } from 'react';
import { pageWindow, type PageInfo } from '@/domain/pagination';
import { conditionLabel, priorityTier, type Product } from '@/domain/product';
import { formatCount, formatPrice } from '@/domain/text';
import { ConditionPill, FavButton, Icon, Logo, PromoColorTag, StockPill, Thumb } from './primitives';

export interface ProductItem {
  product: Product;
  /** Nombre personalizado del favorito; si existe reemplaza al nombre del catálogo. */
  alias?: string | null;
}

interface ListProps {
  items: ProductItem[];
  selectedRef: string | null;
  isFavorite: (ref: string) => boolean;
  onOpen: (ref: string) => void;
  onFavorite: (ref: string) => void;
}

const favLabel = (active: boolean, name: string) => (active ? `Editar favorito ${name}` : `Agregar ${name} a favoritos`);

/** Card producto (móvil / fold) — 4 niveles de prioridad. */
export function ProductCards({ items, selectedRef, isFavorite, onOpen, onFavorite }: ListProps) {
  return (
    <ul className="cards" aria-label="Productos">
      {items.map(({ product, alias }) => {
        const favorite = isFavorite(product.ref);
        return (
          <li key={product.ref}>
            <article className="card" data-tier={priorityTier(product)} data-selected={selectedRef === product.ref}>
              <span className="card__accent" />
              <div className="card__body">
                <button type="button" className="card__open" onClick={() => onOpen(product.ref)}>
                  <Thumb url={product.photoUrl} />
                  <span className="card__info">
                    <ConditionPill condition={product.condition} promoColor={product.promoColor} />
                    <span className="card__name">{alias || product.name}</span>
                    <span className="card__sub truncate">
                      {product.ref} · {alias ? product.name : product.brand}
                    </span>
                  </span>
                </button>
                <div className="card__side">
                  <span className="card__price">{formatPrice(product.prices.gross)}</span>
                  <span className="card__inv">
                    <StockPill stock={product.stock} />
                    <PromoColorTag color={product.promoColor} />
                    <FavButton active={favorite} label={favLabel(favorite, product.name)} onClick={() => onFavorite(product.ref)} />
                  </span>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/** Fila de tabla (escritorio). El logo permanece en el encabezado, después de "Producto". */
export function ProductTable({ items, selectedRef, isFavorite, onOpen, onFavorite, compact }: ListProps & { compact: boolean }) {
  return (
    <div className="table" role="table" aria-label="Productos" data-compact={compact}>
      <div className="table__head" role="row">
        <span role="columnheader">Foto</span>
        <span role="columnheader">Referencia</span>
        <span role="columnheader" className="col-brand">Marca</span>
        <span role="columnheader" className="col-product">
          Producto ↑ A–Z <Logo variant="mono" height={26} />
        </span>
        <span role="columnheader" className="col-condition">Condición</span>
        <span role="columnheader">Inventario</span>
        <span role="columnheader" className="col-price">Precio bruto</span>
        <span role="columnheader" aria-label="Favorito">★</span>
      </div>
      <div className="table__body" role="rowgroup" data-scroll>
        {items.map(({ product, alias }) => {
          const favorite = isFavorite(product.ref);
          const condition = conditionLabel(product);
          return (
            <div className="row" role="row" key={product.ref} data-tier={priorityTier(product)} data-selected={selectedRef === product.ref}>
              <span role="cell"><Thumb url={product.photoUrl} /></span>
              <span role="cell" className="row__ref truncate">{product.ref}</span>
              <span role="cell" className="row__brand col-brand truncate">{product.brand}</span>
              <span role="cell" className="truncate">
                <button type="button" className="row__open row__name truncate" onClick={() => onOpen(product.ref)}>
                  {alias || product.name}
                </button>
              </span>
              <span
                role="cell"
                className="row__cond col-condition"
                data-condition={product.condition}
                data-color={condition && condition !== product.condition ? product.promoColor ?? undefined : undefined}
              >
                {condition ?? ''}
              </span>
              <span role="cell" className="row__inv">
                <StockPill stock={product.stock} />
                <PromoColorTag color={product.promoColor} />
              </span>
              <span role="cell" className="row__price">{formatPrice(product.prices.gross)}</span>
              <span role="cell">
                <FavButton active={favorite} label={favLabel(favorite, product.name)} onClick={() => onFavorite(product.ref)} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul className="cards" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="skeleton" />
      ))}
    </ul>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name="search" size={32} />
      <strong>{title}</strong>
      {children}
    </div>
  );
}

/** Paginación: 100 unidades por página; rango, total y página siempre visibles. */
export function PaginationBar({ info, onPage, wide }: { info: PageInfo; onPage: (page: number) => void; wide: boolean }) {
  const range = `Mostrando ${formatCount(info.from)}–${formatCount(info.to)} de ${formatCount(info.total)}`;
  return (
    <div className="pagebar">
      <nav className="pagination" aria-label="Paginación">
        <button type="button" aria-label="Página anterior" disabled={info.page <= 1} onClick={() => onPage(info.page - 1)}>
          <Icon name="left" size={18} />
        </button>
        {pageWindow(info.page, info.totalPages).map((slot, i) =>
          slot === 'gap' ? (
            <span key={`gap-${i}`} aria-hidden="true">…</span>
          ) : (
            <button key={slot} type="button" aria-label={`Página ${slot}`} aria-current={slot === info.page ? 'page' : undefined} onClick={() => onPage(slot)}>
              {slot}
            </button>
          ),
        )}
        <button type="button" aria-label="Página siguiente" disabled={info.page >= info.totalPages} onClick={() => onPage(info.page + 1)}>
          <Icon name="right" size={18} />
        </button>
      </nav>
      <span role="status">{wide ? `${range} productos` : range}</span>
      {wide && (
        <span>
          {info.pageSize} por página · pág. {info.page} de {info.totalPages}
        </span>
      )}
    </div>
  );
}
