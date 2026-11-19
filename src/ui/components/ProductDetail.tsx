import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { nativeMedia } from '@/adapters/device/nativeMedia';
import { preparePhoto, shareOnWhatsApp } from '@/adapters/device/whatsappShare';
import { downloadUrl, withThumbSize } from '@/domain/photo';
import { shareText } from '@/domain/share';
import type { Product } from '@/domain/product';
import { formatPrice } from '@/domain/text';
import { ConditionPill, FavButton, HeaderCurve, Icon, Logo, StockPill } from './primitives';

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

const IMAGE_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

/**
 * Descarga la foto al dispositivo con su nombre de archivo (nunca abre Drive ni otra pestaña).
 * Devuelve false si no se pudo, para avisar en pantalla.
 */
async function downloadImage(src: string, fileName: string): Promise<boolean> {
  try {
    const response = await fetch(downloadUrl(src), { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const mime = blob.type.split(';')[0] ?? '';
    if (!mime.startsWith('image/')) throw new Error('El origen no devolvió una imagen');
    // APK: el WebView no descarga blobs con <a download>; se guarda en la galería (álbum Fertrac).
    const native = nativeMedia();
    if (native) {
      await native.savePhoto(blob, fileName);
      return true;
    }
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${fileName}.${IMAGE_EXTENSION[mime] ?? 'jpg'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    return true;
  } catch {
    return false;
  }
}

let pendingHistoryBack: number | undefined;

/**
 * Visor de foto · "Isla de vidrio con ficha" (Material 3: bottom sheet en móvil y panel lateral
 * en escritorio; Apple HIG: modal de medios con zoom por gesto; Fluent 2: foco contenido).
 * - Cierra con Escape, el botón, tocando el velo o con "Atrás" del sistema (entrada de historial).
 * - Doble toque / doble clic alterna el zoom 2× (desplazable); tocar la foto ya no la cierra.
 * - Tab y Shift+Tab quedan dentro del diálogo.
 */
function PhotoDialog({ url, alt, fileName, product, onClose }: { url: string; alt: string; fileName: string; product: Product; onClose: () => void }) {
  const { src, onError } = useDriveImage(url, 1600);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [download, setDownload] = useState<'idle' | 'loading' | 'error'>('idle');
  const onDownload = async () => {
    setDownload('loading');
    setDownload((await downloadImage(src, fileName)) ? 'idle' : 'error');
  };
  const closeRefFn = useRef(onClose);
  closeRefFn.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return closeRefFn.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    // "Atrás" del sistema cierra el visor en vez de abandonar el detalle. El retroceso al
    // cerrar se difiere para que un re-montaje inmediato (StrictMode) reutilice la entrada.
    if (pendingHistoryBack !== undefined) window.clearTimeout(pendingHistoryBack);
    pendingHistoryBack = undefined;
    if (!window.history.state?.lightbox) window.history.pushState({ ...(window.history.state ?? {}), lightbox: true }, '');
    const onPop = () => closeRefFn.current();
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      pendingHistoryBack = window.setTimeout(() => {
        pendingHistoryBack = undefined;
        if (window.history.state?.lightbox) window.history.back();
      }, 0);
      previous?.focus?.();
    };
  }, []);

  const toggleZoom = (event: ReactMouseEvent<HTMLImageElement>) => {
    const stage = stageRef.current;
    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();
    const fx = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const fy = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
    setZoomed((z) => {
      if (!z && stage) requestAnimationFrame(() => {
        stage.scrollLeft = fx * stage.scrollWidth - stage.clientWidth / 2;
        stage.scrollTop = fy * stage.scrollHeight - stage.clientHeight / 2;
      });
      return !z;
    });
  };

  const titleId = 'lightbox-title';
  return createPortal(
    <div
      ref={dialogRef}
      className="lightbox lightbox--glass"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={stageRef} className={`lightbox__stage ${zoomed ? 'lightbox__stage--zoomed' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <img src={src} alt={alt} referrerPolicy="no-referrer" onError={onError} onDoubleClick={toggleZoom} draggable={false} />
      </div>
      <button ref={closeRef} type="button" className="icon-btn lightbox__close" aria-label="Cerrar foto" title="Cerrar" onClick={onClose}>
        <Icon name="close" size={22} />
      </button>
      <aside className="lightbox__sheet" aria-labelledby={titleId}>
        <span className="lightbox__grip" aria-hidden="true" />
        <div className="lightbox__info">
          <strong id={titleId} className="lightbox__title">{product.name}</strong>
          <span className="lightbox__ref">{[product.ref, product.brand].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="lightbox__meta">
          <span className="lightbox__price">{formatPrice(product.prices.gross)}</span>
          <StockPill stock={product.stock} />
        </div>
        <button
          type="button"
          className="btn btn--primary btn--block lightbox__download"
          disabled={download === 'loading'}
          onClick={() => void onDownload()}
        >
          <Icon name="download" size={18} /> {download === 'loading' ? 'Descargando…' : 'Descargar foto'}
        </button>
        {download === 'error' && (
          <p className="lightbox__hint lightbox__hint--error" role="alert">No se pudo descargar la foto. Intenta de nuevo.</p>
        )}
        <p className="lightbox__hint">{zoomed ? 'Doble toque para alejar' : 'Doble toque para acercar'}</p>
      </aside>
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
  const [share, setShare] = useState<{ busy: boolean; notice: string | null }>({ busy: false, notice: null });
  // Foto para compartir, preparada al abrir el detalle (undefined = aún descargando).
  const sharePhoto = useRef<{ ref: string; file: File | null | undefined }>({ ref: '', file: undefined });
  useEffect(() => {
    setZoom(false);
    setShare({ busy: false, notice: null });
    if (!product) return;
    const slot = { ref: product.ref, file: undefined as File | null | undefined };
    sharePhoto.current = slot;
    void preparePhoto(product).then((file) => {
      slot.file = file;
    });
  }, [product?.ref]); // eslint-disable-line react-hooks/exhaustive-deps
  const onShare = async () => {
    if (!product) return;
    setShare({ busy: true, notice: null });
    const ready = sharePhoto.current.ref === product.ref ? sharePhoto.current.file : undefined;
    const result = await shareOnWhatsApp(product, alias, undefined, ready);
    const notice =
      result.status !== 'opened'
        ? null
        : result.photoCopied
          ? 'Foto copiada: pégala en el chat de WhatsApp (Ctrl+V).'
          : product.photoUrl
            ? 'No se pudo adjuntar la foto; se compartió sin foto.'
            : 'Producto sin foto; se compartió sin foto.';
    setShare({ busy: false, notice });
  };
  const onCopy = async () => {
    if (!product) return;
    try {
      await navigator.clipboard.writeText(shareText(product, alias));
      setShare({ busy: false, notice: 'Texto copiado: nombre, referencia y precio bruto.' });
    } catch {
      setShare({ busy: false, notice: 'No se pudo copiar el texto.' });
    }
  };
  const onDownload = async () => {
    if (!product?.photoUrl) return;
    setShare({ busy: true, notice: null });
    const ok = await downloadImage(withThumbSize(product.photoUrl, 1600), `fertrac-${product.ref.replace(/[^\w.-]+/g, '-')}`);
    setShare({ busy: false, notice: ok ? (nativeMedia() ? 'Foto guardada en la galería, álbum Fertrac.' : 'Foto descargada.') : 'No se pudo descargar la foto.' });
  };
  return (
    <aside className={`detail ${overlay ? 'detail--overlay' : ''}`} aria-label="Detalle de producto">
      <header className="detail__bar">
        <button type="button" className="detail__back" onClick={onDismiss} aria-label={dismiss === 'back' ? 'Volver' : 'Cerrar detalle'}>
          <Icon name={dismiss === 'back' ? 'left' : 'close'} size={22} /> Detalle
        </button>
        <Logo variant={overlay ? 'encabezado' : 'mono'} height={overlay ? 30 : 26} />
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
            {/* Curva Fertrac: la foto se apoya sobre el encabezado de marca, que termina en la curva. */}
            <div className="detail__hero">
              <div className="detail__photo">
                {product.photoUrl ? (
                  <DetailPhoto url={product.photoUrl} alt={`Foto de ${product.name}`} onZoom={() => setZoom(true)} />
                ) : (
                  <Icon name="image" size={44} />
                )}
              </div>
            </div>
            <HeaderCurve />
            <div className="detail__content">
              <div className="detail__pills">
                <ConditionPill condition={product.condition} promoColor={product.promoColor} large />
                <StockPill stock={product.stock} long large />
              </div>
              <h2 className="detail__name">{product.ref}</h2>
              <p className="detail__sub">
                {[alias || product.name, product.brand, product.line && `Línea ${product.line}`]
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
                {product.conditionText && (
                  <div className="price price--condition" data-color={product.promoColor ?? undefined}>
                    <span>Condición</span>
                    <strong>{product.conditionText}</strong>
                  </div>
                )}
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
          {zoom && product.photoUrl && (
            <PhotoDialog
              url={product.photoUrl}
              alt={`Foto de ${product.name}`}
              fileName={`fertrac-${product.ref.replace(/[^\w.-]+/g, '-')}`}
              product={product}
              onClose={() => setZoom(false)}
            />
          )}
          <div className="detail__action">
            {share.notice && <p className="detail__notice" role="status">{share.notice}</p>}
            {/* Dock de vidrio (opción 3b): WhatsApp, Copiar texto y Foto como acción destacada.
                Favoritos queda en la estrella de la barra (sin duplicado). */}
            <div className="detail__dock" role="toolbar" aria-label="Acciones del producto">
              <button type="button" className="dock__item" aria-label="Compartir por WhatsApp" aria-busy={share.busy} disabled={share.busy} onClick={() => void onShare()}>
                <span className="dock__wa"><Icon name="chat" size={14} /></span>
                <span>WhatsApp</span>
              </button>
              <button type="button" className="dock__item" aria-label="Copiar texto del producto" onClick={() => void onCopy()}>
                <Icon name="copy" size={20} />
                <span>Copiar</span>
              </button>
              <button
                type="button"
                className="dock__item dock__item--primary"
                aria-label="Descargar foto"
                aria-busy={share.busy}
                disabled={!product.photoUrl || share.busy}
                onClick={() => void onDownload()}
              >
                <Icon name="download" size={20} />
                <span>Foto</span>
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
