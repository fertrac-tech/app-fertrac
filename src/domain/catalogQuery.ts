import { paginate, PAGE_SIZE, type PageInfo } from './pagination';
import type { Condition, Product } from './product';
import { compareText, normalize } from './text';

export const FILTER_KEYS = ['line', 'brand', 'category', 'subcategory', 'type', 'condition'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type CatalogFilters = Partial<Record<FilterKey, string>>;

export interface CatalogQuery {
  text?: string;
  filters?: CatalogFilters;
  page?: number;
  pageSize?: number;
}

export interface CatalogPage extends PageInfo {
  items: Product[];
}

export type Facets = Record<FilterKey, string[]>;

export const CONDITION_LABEL: Record<Condition, string> = {
  NUEVO: 'Nuevo',
  PROMO: 'Promoción',
  NORMAL: 'Normal',
};

/**
 * Orden oficial del catálogo y de la búsqueda: alfabético por nombre de producto (A–Z),
 * con la referencia como desempate para un orden estable.
 */
export function compareProducts(a: Product, b: Product): number {
  return compareText(a.name, b.name) || compareText(a.ref, b.ref);
}

export function sortCatalog(products: readonly Product[]): Product[] {
  return [...products].sort(compareProducts);
}

function filterValue(product: Product, key: FilterKey): string {
  return key === 'condition' ? product.condition : product[key];
}

interface IndexedProduct {
  product: Product;
  haystack: string;
}

/**
 * Índice en memoria ya ordenado. Ordenar una sola vez por sincronización hace que
 * filtrar y paginar sea un recorrido lineal y un `slice`, sin reordenar en cada tecla.
 */
export class CatalogIndex {
  private readonly entries: IndexedProduct[];
  private readonly byRef: Map<string, Product>;

  constructor(products: readonly Product[]) {
    this.entries = sortCatalog(products).map((product) => ({
      product,
      haystack: normalize(
        [product.ref, product.name, product.brand, product.alternates, product.application].join(' '),
      ),
    }));
    this.byRef = new Map(this.entries.map((e) => [e.product.ref, e.product]));
  }

  get size(): number {
    return this.entries.length;
  }

  get(ref: string): Product | undefined {
    return this.byRef.get(ref);
  }

  /** Devuelve los productos pedidos en el orden oficial; ignora referencias inexistentes. */
  getMany(refs: Iterable<string>): Product[] {
    const wanted = new Set(refs);
    return this.entries.filter((e) => wanted.has(e.product.ref)).map((e) => e.product);
  }

  query(query: CatalogQuery = {}): CatalogPage {
    const tokens = normalize(query.text ?? '').split(' ').filter(Boolean);
    const filters = Object.entries(query.filters ?? {}).filter(([, v]) => Boolean(v)) as [FilterKey, string][];

    const matches: Product[] = [];
    for (const { product, haystack } of this.entries) {
      if (!tokens.every((t) => haystack.includes(t))) continue;
      if (!filters.every(([key, value]) => filterValue(product, key) === value)) continue;
      matches.push(product);
    }

    const info = paginate(matches.length, query.page ?? 1, query.pageSize ?? PAGE_SIZE);
    return { ...info, items: matches.slice(info.offset, info.offset + info.pageSize) };
  }

  facets(): Facets {
    const sets = Object.fromEntries(FILTER_KEYS.map((k) => [k, new Set<string>()])) as Record<FilterKey, Set<string>>;
    for (const { product } of this.entries) {
      for (const key of FILTER_KEYS) {
        const value = filterValue(product, key);
        if (value) sets[key].add(value);
      }
    }
    return Object.fromEntries(FILTER_KEYS.map((k) => [k, [...sets[k]].sort(compareText)])) as Facets;
  }
}
