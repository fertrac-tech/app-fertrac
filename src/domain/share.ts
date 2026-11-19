/** Mensaje para compartir un producto por WhatsApp. Reglas puras: sin navegador ni React. */
import type { Product } from './product';
import { formatPrice } from './text';

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

const hasValue = (v: number | string | null | undefined) => formatPrice(v) !== '—';

/**
 * Texto que acompaña la foto. Regla de negocio: solo el precio bruto (y el promo si existe);
 * los netos −5 % / −8 % son internos y no se comparten. Usa *negrita* de WhatsApp.
 */
export function shareText(product: Product, alias?: string | null): string {
  const lines = [`*${alias || product.name}*`, [`Ref. ${product.ref}`, product.brand].filter(Boolean).join(' · ')];
  if (hasValue(product.prices.gross)) lines.push(`Precio: ${formatPrice(product.prices.gross)}`);
  if (hasValue(product.prices.promo)) lines.push(`Precio promo: ${formatPrice(product.prices.promo)}`);
  lines.push('', 'Fertrac · Siempre Calidad Original');
  return lines.join('\n');
}

/** Enlace universal de WhatsApp (abre la app o WhatsApp Web) con el texto prellenado. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function shareFileName(ref: string, mime: string): string {
  return `fertrac-${ref.replace(/[^\w.-]+/g, '-')}.${EXTENSION[mime] ?? 'jpg'}`;
}
