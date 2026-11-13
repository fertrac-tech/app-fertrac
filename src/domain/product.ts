/** Modelo de dominio del catálogo. No depende de React, del navegador ni del backend. */

export type Condition = 'NUEVO' | 'PROMO' | 'NORMAL';

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
