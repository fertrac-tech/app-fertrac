/** Variante de una miniatura de Drive con otro tamaño; otras URLs se devuelven sin cambios. */
export function withThumbSize(url: string, size: number): string {
  return /drive\.google\.com\/thumbnail\?/.test(url) ? url.replace(/([?&]sz=)w\d+/, `$1w${size}`) : url;
}
