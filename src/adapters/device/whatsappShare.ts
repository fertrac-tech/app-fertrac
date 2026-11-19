import { downloadUrl, withThumbSize } from '@/domain/photo';
import type { Product } from '@/domain/product';
import { shareFileName, shareText, whatsappUrl } from '@/domain/share';

/** Capacidades del dispositivo, inyectables para pruebas. */
export interface ShareEnv {
  fetch: typeof fetch;
  /** Web Share API nivel 2 (Android Chrome, iOS Safari, Edge/Windows). */
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  /** Copia la imagen al portapapeles (escritorio) para pegarla con Ctrl+V en WhatsApp Web. */
  copyImage?: (blob: Blob) => Promise<void>;
  open: (url: string) => void;
}

export type ShareResult = { status: 'shared' } | { status: 'cancelled' } | { status: 'opened'; photoCopied: boolean };

/** Por qué no viajó la foto (para el aviso en pantalla y el diagnóstico). */
export type PhotoIssue = 'no-photo' | 'download-failed' | 'not-supported' | null;

/** Tamaño de la foto compartida: suficiente para WhatsApp sin pesar demasiado. */
const SHARE_PHOTO_SIZE = 800;

/**
 * Descarga la foto como archivo. Se llama al abrir el detalle (no al tocar "Compartir"):
 * la hoja nativa exige activación del usuario reciente y Safari/iOS la pierde si se espera la red.
 * Si w800 falla, reintenta con el tamaño original de la miniatura.
 */
export async function preparePhoto(product: Product, env: Pick<ShareEnv, 'fetch'> = browserShareEnv()): Promise<File | null> {
  if (!product.photoUrl) return null;
  const candidates = [...new Set([downloadUrl(withThumbSize(product.photoUrl, SHARE_PHOTO_SIZE)), downloadUrl(product.photoUrl)])];
  for (const url of candidates) {
    try {
      const response = await env.fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) continue;
      const blob = await response.blob();
      const mime = blob.type.split(';')[0] ?? '';
      if (!mime.startsWith('image/')) continue;
      return new File([blob], shareFileName(product.ref, mime), { type: mime });
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

/**
 * Comparte foto + producto + precio.
 * 1. Con Web Share de archivos (móvil): hoja nativa con foto y texto; el usuario elige WhatsApp.
 * 2. Si no (escritorio, WebView sin soporte): copia la foto al portapapeles cuando se puede
 *    y abre wa.me con el texto prellenado (WhatsApp no acepta imágenes por enlace).
 */
export async function shareOnWhatsApp(
  product: Product,
  alias: string | null | undefined,
  env: ShareEnv = browserShareEnv(),
  /** Foto ya preparada al abrir el detalle; si no se pasa, se descarga ahora (puede perder la activación). */
  prepared?: File | null,
): Promise<ShareResult> {
  const text = shareText(product, alias);
  const photo = prepared !== undefined ? prepared : await preparePhoto(product, env);

  if (photo && env.share && env.canShare?.({ files: [photo], text })) {
    try {
      await env.share({ files: [photo], text });
      return { status: 'shared' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { status: 'cancelled' };
      // NotAllowedError u otro: se sigue con el enlace de WhatsApp.
    }
  }

  let photoCopied = false;
  if (photo && env.copyImage) {
    try {
      await env.copyImage(photo);
      photoCopied = true;
    } catch {
      photoCopied = false;
    }
  }
  env.open(whatsappUrl(text));
  return { status: 'opened', photoCopied };
}

/** El portapapeles del navegador solo acepta PNG: se convierte con canvas si hace falta. */
async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG'))), 'image/png'));
}

export function browserShareEnv(): ShareEnv {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const hasClipboardImage = Boolean(nav?.clipboard?.write) && typeof ClipboardItem !== 'undefined';
  return {
    fetch: (...args) => fetch(...args),
    canShare: nav?.canShare ? (data) => nav.canShare(data) : undefined,
    share: nav?.share ? (data) => nav.share(data) : undefined,
    // ClipboardItem acepta una promesa: conserva la activación del usuario mientras se convierte a PNG.
    copyImage: hasClipboardImage ? (blob) => nav!.clipboard.write([new ClipboardItem({ 'image/png': toPng(blob) })]) : undefined,
    open: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
  };
}
