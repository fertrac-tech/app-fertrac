/** Modelo de dominio del catálogo. No depende de React, del navegador ni del backend. */

export type Condition = 'NUEVO' | 'PROMO' | 'NORMAL';

/**
 * Colores con los que negocio distingue cada promoción en la columna CONDICIÓN
 * (p. ej. "Magenta"). Claves normalizadas: minúsculas y sin tildes.
 */
export const PROMO_COLORS = [
  'magenta', 'fucsia', 'rosado', 'rosa', 'rojo', 'naranja', 'amarillo', 'dorado', 'verde',
  'turquesa', 'cian', 'celeste', 'azul', 'morado', 'violeta', 'lila', 'gris',
] as const;
export type PromoColor = (typeof PROMO_COLORS)[number];

/** Nombre visible del color: primera letra en mayúscula ("Magenta"). */
export function promoColorLabel(color: PromoColor): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

/**
 * Texto de la condición que se muestra en el catálogo. null = no mostrar nada
 * (sin condición o "NO TIENE"). Cuando CONDICIÓN nombra un color ("VERDE",
 * "MAGENTA", "AZUL"…), se muestra ese color en lugar de "PROMO".
 */
export function conditionLabel(p: Pick<Product, 'condition' | 'promoColor'>): string | null {
  if (p.condition === 'NORMAL') return null;
  if (p.condition === 'PROMO' && p.promoColor) return p.promoColor.toUpperCase();
  return p.condition;
}

export interface ProductPrices {
  gross: number | null;
  net5: number | null;
  net8: number | null;
  /** El backend actual entrega el precio promo como número o como texto libre. */
  promo: number | string | null;
}

export interface Product {
  ref: string;
  name: string;
  brand: string;
  line: string;
  category: string;
  subcategory: string;
  type: string;
  application: string;
  alternates: string;
  condition: Condition;
  /**
   * Color de la promoción cuando CONDICIÓN nombra uno. Opcional: las copias del catálogo
   * guardadas en el dispositivo antes de este campo no lo traen hasta la siguiente sincronización.
   */
  promoColor?: PromoColor | null;
  /** Texto de CONDICIÓN tal como viene en la hoja; null si está vacío o es "NO TIENE". Opcional por la misma razón. */
  conditionText?: string | null;
  stock: number;
  prices: ProductPrices;
  promoEnds: string | null;
  photoUrl: string | null;
}

/**
 * Nivel de prioridad del orden (regla de negocio):
 * 1 NUEVO con inventario · 2 PROMOCIÓN con inventario · 3 normal con inventario · 4 sin inventario.
 */
export type PriorityTier = 1 | 2 | 3 | 4;

export function hasStock(p: Pick<Product, 'stock'>): boolean {
  return p.stock > 0;
}

export function priorityTier(p: Pick<Product, 'stock' | 'condition'>): PriorityTier {
  if (!hasStock(p)) return 4;
  if (p.condition === 'NUEVO') return 1;
  if (p.condition === 'PROMO') return 2;
  return 3;
}

export type StockLevel = 'ok' | 'low' | 'none';

/** Umbral de inventario bajo (supuesto por validar con negocio). */
export const LOW_STOCK_THRESHOLD = 10;

export function stockLevel(stock: number, lowThreshold = LOW_STOCK_THRESHOLD): StockLevel {
  if (stock <= 0) return 'none';
  return stock < lowThreshold ? 'low' : 'ok';
}
