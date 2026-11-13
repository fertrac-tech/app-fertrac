import type { Product } from './product';

/** Fábrica de productos para pruebas. */
export function makeProduct(overrides: Partial<Product> & Pick<Product, 'ref'>): Product {
  return {
    name: `PRODUCTO ${overrides.ref}`,
    brand: 'FERTRAC',
    line: 'SUSPENSION',
    category: 'GENERAL',
    subcategory: '',
    type: '',
    application: '',
    alternates: '',
    condition: 'NORMAL',
    stock: 5,
    prices: { gross: 100000, net5: 95000, net8: 92000, promo: null },
    promoEnds: null,
    photoUrl: null,
    ...overrides,
  };
}
