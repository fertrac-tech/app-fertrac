/** Normaliza texto para comparar y buscar: sin tildes, minúsculas, espacios colapsados. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Comparación alfabética en español (ignora tildes y mayúsculas; números en orden natural). */
export function compareText(a: string, b: string): number {
  return collator.compare(a, b);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Formato de moneda del diseño: "$ 412.000". */
export function formatPrice(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Solo dígitos → es un número serializado; cualquier otro texto se muestra tal cual.
    if (!/^\d+$/.test(trimmed)) return trimmed;
    value = Number(trimmed);
  }
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  const grouped = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${rounded < 0 ? '-' : ''}${grouped}`;
}

export function formatCount(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "Hoy, 2:30 p. m." o "12 nov, 2:30 p. m." para la última sincronización. */
export function formatSyncTime(timestamp: number | null, now: number = Date.now()): string {
  if (timestamp === null) return 'Sin sincronizar';
  const date = new Date(timestamp);
  const today = new Date(now);
  const time = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(date)
    .replace(/\s+/g, ' ');
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return `Hoy, ${time}`;
  const day = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
  return `${day}, ${time}`;
}
