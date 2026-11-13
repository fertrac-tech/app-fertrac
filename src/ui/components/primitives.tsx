import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import isotipo from '@/assets/brand/isotipo.png';
import logoPrincipal from '@/assets/brand/logo.png';
import logoNegativo from '@/assets/brand/logo2.png';
import logoMono from '@/assets/brand/logo3.png';
import { promoColorLabel, stockLevel, type Condition, type PromoColor } from '@/domain/product';
import { initials } from '@/domain/text';
import { useTheme } from '../context';

const iconUrls = import.meta.glob<string>('../../assets/icons/*.svg', { eager: true, query: '?url', import: 'default' });

export type IconName =
  | 'list' | 'star' | 'user' | 'left' | 'right' | 'refresh' | 'search' | 'filter' | 'down' | 'image'
  | 'fav-on' | 'fav-off' | 'close' | 'plus' | 'pencil' | 'trash' | 'folder' | 'logout' | 'shield'
  | 'lock' | 'phone' | 'check' | 'block' | 'offline' | 'sun' | 'moon' | 'download';

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  const url = iconUrls[`../../assets/icons/${name}.svg`] ?? '';
  const style = { width: size, height: size, '--icon': `url("${url}")` } as CSSProperties;
  return <span aria-hidden="true" data-icon={name} className={`icon ${className}`} style={style} />;
}

type LogoVariant = 'principal' | 'mono' | 'isotipo';

/**
 * Logos autorizados (sin recolorear ni deformar).
 * `logo.png` tiene fondo blanco opaco: en modo oscuro se usa el blanco negativo.
 */
export function Logo({ variant = 'principal', height = 34 }: { variant?: LogoVariant; height?: number }) {
  const { theme } = useTheme();
  const src =
    variant === 'isotipo' ? isotipo : variant === 'mono' ? logoMono : theme === 'dark' ? logoNegativo : logoPrincipal;
  return <img className="logo" src={src} alt="Fertrac" data-logo={variant} style={{ height, width: 'auto' }} />;
}

export function Avatar({ name, picture, size = 32 }: { name: string; picture: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [picture]);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {picture && !failed ? (
        <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function StockPill({ stock, long = false, large = false }: { stock: number; long?: boolean; large?: boolean }) {
  const level = stockLevel(stock);
  const label = level === 'none' ? 'Sin stock' : `${stock} und${long ? ' disponibles' : ''}`;
  return <span className={`pill pill--${level} ${large ? 'pill--lg' : ''}`}>{label}</span>;
}

/** Color de la promoción: círculo del color con la inicial en mayúscula. Va después del inventario. */
export function PromoColorTag({ color }: { color?: PromoColor | null }) {
  if (!color) return null;
  const label = promoColorLabel(color);
  return (
    <span className="promo-color" data-color={color} role="img" aria-label={`Promoción ${label}`} title={`Promoción ${label}`}>
      {label.charAt(0)}
    </span>
  );
}

export function ConditionPill({ condition, large = false }: { condition: Condition; large?: boolean }) {
  if (condition === 'NORMAL') return null;
  return (
    <span className={`pill pill--${condition === 'NUEVO' ? 'nuevo' : 'promo'} ${large ? 'pill--lg' : ''}`}>
      {condition}
    </span>
  );
}

/** Miniatura de tamaño fijo con carga diferida: no produce saltos de diseño. */
export function Thumb({ url, size = 40 }: { url: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className="thumb" style={{ width: size, height: size }}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" width={size} height={size} onError={() => setFailed(true)} />
      ) : (
        <Icon name="image" size={Math.round(size / 2)} />
      )}
    </span>
  );
}

export function FavButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className="icon-btn icon-btn--star" aria-pressed={active} aria-label={label} onClick={onClick}>
      <Icon name={active ? 'fav-on' : 'fav-off'} size={22} />
    </button>
  );
}

/** Hoja modal: inferior en móvil, centrada desde 600 px. Cierra con Escape o tocando el fondo. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button:not([data-close])')?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <span className="sheet__grip" />
        <div className="sheet__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" data-close onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Botón de tema: cambia entre claro y oscuro a voluntad del usuario. */
export function ThemeToggle({ labelled = false }: { labelled?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'claro' : 'oscuro';
  return (
    <button type="button" className={labelled ? 'navitem' : 'icon-btn'} aria-label={`Cambiar a modo ${next}`} onClick={toggleTheme}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
      {labelled && `Modo ${next}`}
    </button>
  );
}
