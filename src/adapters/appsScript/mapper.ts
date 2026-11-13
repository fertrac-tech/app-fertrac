import type { Condition, Product } from '@/domain/product';
import { normalize } from '@/domain/text';

/** Índices de columnas de la fila que entrega el Apps Script (Hoja2). */
export const COL = {
  REF: 0, FOTO: 1, ALTERNOS: 2, PRODUCTO: 3, CATEGORIA: 4,
  SUBCATEGORIA: 5, TIPO: 6, LINEA: 7, MARCA: 8, APLICACION: 9,
  PRECIO_BRUTO: 10, NETO_5: 11, NETO_8: 12, PRECIO_PROMO: 13,
  UND_ESCALA: 14, UND_MIN: 15, UND_MAX: 16, PROMO_FIN: 17,
  INV: 18, UND_RM: 19, UND_RMC: 20, CONDICION: 21,
} as const;

export type CatalogRow = readonly unknown[];

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim());

/** Acepta números, "412000", "$ 412.000" y "1.280.000,50". Devuelve null si no es numérico. */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/[$\s]/g, '');
  if (raw === '') return null;
  const colombian = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw);
  const candidate = colombian ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(candidate)) return null;
  return Number(candidate);
}

export function parseCondition(value: unknown): Condition {
  const c = normalize(text(value));
  if (c.startsWith('nuev')) return 'NUEVO';
  if (c.includes('promo')) return 'PROMO';
  return 'NORMAL';
}

/** Extrae el id de archivo de una URL de Google Drive (…?id=X o …/d/X/…). */
export function extractDriveId(value: string): string | null {
  return /[?&]id=([A-Za-z0-9_-]+)/.exec(value)?.[1] ?? /\/d\/([A-Za-z0-9_-]+)/.exec(value)?.[1] ?? null;
}

/**
 * Convierte el valor de la columna FOTO (o del mapa de fotos) en una URL usable.
 * Drive → miniatura pública (igual que la v10); otra URL http(s) → tal cual;
 * textos como "Sin Foto" o vacíos → null (sin foto), nunca una ruta relativa.
 */
export function photoUrlFrom(value: unknown): string | null {
  const raw = text(value);
  if (raw === '') return null;
  const id = extractDriveId(raw);
  if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w400`;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function parsePromo(value: unknown): number | string | null {
  const numeric = parseNumber(value);
  if (numeric !== null) return numeric;
  const raw = text(value);
  return raw === '' ? null : raw;
}

/** Convierte una fila del backend en un producto de dominio. Devuelve null si no tiene referencia. */
export function rowToProduct(row: CatalogRow, photos: Readonly<Record<string, string>> = {}): Product | null {
  const ref = text(row[COL.REF]);
  if (ref === '') return null;
  return {
    ref,
    name: text(row[COL.PRODUCTO]),
    brand: text(row[COL.MARCA]),
    line: text(row[COL.LINEA]),
    category: text(row[COL.CATEGORIA]),
    subcategory: text(row[COL.SUBCATEGORIA]),
    type: text(row[COL.TIPO]),
    application: text(row[COL.APLICACION]),
    alternates: text(row[COL.ALTERNOS]),
    condition: parseCondition(row[COL.CONDICION]),
    stock: Math.max(0, parseNumber(row[COL.INV]) ?? 0),
    prices: {
      gross: parseNumber(row[COL.PRECIO_BRUTO]),
      net5: parseNumber(row[COL.NETO_5]),
      net8: parseNumber(row[COL.NETO_8]),
      promo: parsePromo(row[COL.PRECIO_PROMO]),
    },
    promoEnds: text(row[COL.PROMO_FIN]) || null,
    photoUrl: photoUrlFrom(photos[ref] ?? photos[ref.toUpperCase()]) ?? photoUrlFrom(row[COL.FOTO]),
  };
}

/** `data` incluye la fila de encabezados en la posición 0. */
export function rowsToProducts(data: readonly CatalogRow[], photos: Readonly<Record<string, string>> = {}): Product[] {
  const products: Product[] = [];
  const seen = new Set<string>();
  for (const row of data.slice(1)) {
    const product = rowToProduct(row, photos);
    if (!product || seen.has(product.ref)) continue;
    seen.add(product.ref);
    products.push(product);
  }
  return products;
}
