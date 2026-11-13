import type { Product } from '@/domain/product';
import { formatPrice } from '@/domain/text';
import { ConditionPill, FavButton, Icon, Logo, StockPill } from './primitives';

interface Props {
  product: Product | undefined;
  loading: boolean;
  alias?: string | null;
  favorite: boolean;
  /** `back` en pantalla completa (móvil), `close` como panel (fold abierto / escritorio). */
  dismiss: 'back' | 'close';
  onDismiss: () => void;
  onFavorite: () => void;
  overlay?: boolean;
}

/**
 * Detalle de producto (pantalla 04). Trazabilidad de marca exigida por gerencia:
 * el logo permanece en la barra del detalle y junto al bloque "Precios".
 */
export function ProductDetail({ product, loading, alias, favorite, dismiss, onDismiss, onFavorite, overlay }: Props) {
  return (
    <aside className={`detail ${overlay ? 'detail--overlay' : ''}`} aria-label="Detalle de producto">
      <header className="detail__bar">
        <button type="button" className="detail__back" onClick={onDismiss} aria-label={dismiss === 'back' ? 'Volver' : 'Cerrar detalle'}>
          <Icon name={dismiss === 'back' ? 'left' : 'close'} size={22} /> Detalle
        </button>
        <Logo height={34} />
        {product ? (
          <FavButton active={favorite} label={favorite ? 'Editar favorito' : 'Guardar en favoritos'} onClick={onFavorite} />
        ) : (
          <span style={{ width: 36 }} />
        )}
      </header>

      {!product ? (
        <div className="empty">
          {loading ? <Icon name="refresh" size={28} className="spin" /> : <strong>Este producto ya no está en el catálogo</strong>}
        </div>
      ) : (
        <>
          <div className="detail__scroll">
            <div className="detail__photo">
              {product.photoUrl ? (
                <img src={product.photoUrl} alt={`Foto de ${product.name}`} referrerPolicy="no-referrer" />
              ) : (
                <Icon name="image" size={44} />
              )}
            </div>
            <div className="detail__content">
              <div className="detail__pills">
                <ConditionPill condition={product.condition} large />
                <StockPill stock={product.stock} long large />
              </div>
              <h2 className="detail__name">{alias || product.name}</h2>
              <p className="detail__sub">
                {[product.ref, alias ? product.name : null, product.brand, product.line && `Línea ${product.line}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              <div className="detail__prices-head">
                <span>Precios</span>
                <Logo variant="mono" height={26} />
              </div>
              <div className="prices">
                <div className="price price--main">
                  <span>Precio bruto</span>
                  <strong>{formatPrice(product.prices.gross)}</strong>
                </div>
                <div className="price">
                  <span>Neto −5%</span>
                  <strong>{formatPrice(product.prices.net5)}</strong>
                </div>
                <div className="price">
                  <span>Neto −8%</span>
                  <strong>{formatPrice(product.prices.net8)}</strong>
                </div>
                <div className="price">
                  <span>Precio promo</span>
                  <strong>{formatPrice(product.prices.promo)}</strong>
                </div>
              </div>

              <dl className="facts">
                {(
                  [
                    ['Categoría', product.category],
                    ['Subcategoría', product.subcategory],
                    ['Tipo', product.type],
                    ['Aplicación', product.application],
                    ['Alternos', product.alternates],
                    ['Promo finaliza', product.promoEnds],
                  ] as const
                )
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </div>
          <div className="detail__action">
            <button type="button" className="btn btn--primary btn--block" onClick={onFavorite}>
              <Icon name="star" size={18} /> {favorite ? 'Editar favorito' : 'Guardar en favoritos'}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
