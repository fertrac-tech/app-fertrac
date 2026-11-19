/** Variante de una miniatura de Drive con otro tamaño; otras URLs se devuelven sin cambios. */
export function withThumbSize(url: string, size: number): string {
  return /drive\.google\.com\/thumbnail\?/.test(url) ? url.replace(/([?&]sz=)w\d+/, `$1w${size}`) : url;
}

/**
 * URL para descargar la foto como archivo. `drive.google.com/thumbnail` redirige (302) sin
 * cabecera CORS, así que el `fetch` del navegador falla; su destino, `lh3.googleusercontent.com/d/<id>=<sz>`,
 * sí responde con `Access-Control-Allow-Origin: *`. Se conserva el mismo tamaño de la miniatura.
 * Otras URLs se devuelven sin cambios.
 */
export function downloadUrl(url: string): string {
  const match = /drive\.google\.com\/thumbnail\?(?:.*&)?id=([A-Za-z0-9_-]+)/.exec(url);
  if (!match) return url;
  const size = /[?&]sz=(w\d+)/.exec(url)?.[1] ?? 'w800';
  return `https://lh3.googleusercontent.com/d/${match[1]}=${size}`;
}
