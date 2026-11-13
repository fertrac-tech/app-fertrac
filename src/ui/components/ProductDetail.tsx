import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { withThumbSize } from '@/domain/photo';
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
 * Foto grande: pide la miniatura de Drive en w800 y, si Drive responde 404 (archivo más
 * pequeño que el tamaño pedido), cae a la URL original (w200), como hacía la v10.
 */
function useDriveImage(url: string, size: number) {
  const [src, setSrc] = useState(() => withThumbSize(url, size));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSrc(withThumbSize(url, size));
    setFailed(false);
  }, [url, size]);
  const onError = () => (src !== url ? setSrc(url) : setFailed(true));
  return { src, failed, onError };
}

function DetailPhoto({ url, alt, onZoom }: { url: string; alt: string; onZoom: () => void }) {
  const { src, failed, onError } = useDriveImage(url, 800);
  if (failed) return <Icon name="image" size={44} />;
  return (
    <button type="button" className="detail__zoom" aria-label="Ampliar foto" onClick={onZoom}>
      <img src={src} alt={alt} referrerPolicy="no-referrer" onError={onError} />
    </button>
  );
}

/** Foto ampliada en un diálogo centrado; cierra con Escape, el botón o tocando fuera. */
function PhotoDialog({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  const { src, onError } = useDriveImage(url, 1600);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  // Portal al body: el diálogo no queda atrapado en el contexto de apilado del detalle
  // (en móvil `.detail--overlay` tiene z-index propio) y siempre cubre el texto.
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button ref={closeRef} type="button" className="icon-btn lightbox__close" aria-label="Cerrar foto" onClick={onClose}>
        <Icon name="close" size={24} />
      </button>
      <img src={src} alt={alt} referrerPolicy="no-referrer" onError={onError} onClick={onClose} />
    </div>,
    document.body,
  );
}

/**
 * Detalle de producto (pantalla 04). Trazabilidad de marca exigida por gerencia:
 * el logo permanece en la barra del detalle y junto al bloque "Precios".
 */
export function ProductDetail({ product, loading, alias, favorite, dismiss, onDismiss, onFavorite, overlay }: Props) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => setZoom(false), [product?.ref]);
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
                <DetailPhoto url={product.photoUrl} alt={`Foto de ${product.name}`} onZoom={() => setZoom(true)} />
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
          {zoom && product.photoUrl && <PhotoDialog url={product.photoUrl} alt={`Foto de ${product.name}`} onClose={() => setZoom(false)} />}
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
