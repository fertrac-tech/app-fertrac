import { paginate, PAGE_SIZE, type PageInfo } from './pagination';
import type { Condition, Product } from './product';
import { compareText, normalize } from './text';

export const FILTER_KEYS = ['line', 'brand', 'category', 'subcategory', 'type', 'condition'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
/**
 * Cada filtro admite varios valores: un producto pasa si coincide con CUALQUIERA de los valores
 * de un filtro (OR) y con TODOS los filtros activos (AND). Un string suelto equivale a `[valor]`.
 */
export type CatalogFilters = Partial<Record<FilterKey, string | readonly string[]>>;

/** Valores seleccionados de un filtro, sin vacíos ni duplicados. */
export function filterValues(value: string | readonly string[] | undefined): string[] {
  const list = typeof value === 'string' ? [value] : (value ?? []);
  return [...new Set(list.filter(Boolean))];
}

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

function searchTokens(text: string | undefined): string[] {
  return normalize(text ?? '').split(' ').filter(Boolean);
}

function activeFilters(filters: CatalogFilters | undefined): (readonly [FilterKey, Set<string>])[] {
  return (Object.entries(filters ?? {}) as [FilterKey, CatalogFilters[FilterKey]][])
    .map(([key, value]) => [key, new Set(filterValues(value))] as const)
    .filter(([, values]) => values.size > 0);
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
    const tokens = searchTokens(query.text);
    const filters = activeFilters(query.filters);

    const matches: Product[] = [];
    for (const { product, haystack } of this.entries) {
      if (!tokens.every((t) => haystack.includes(t))) continue;
      if (!filters.every(([key, values]) => values.has(filterValue(product, key)))) continue;
      matches.push(product);
    }

    const info = paginate(matches.length, query.page ?? 1, query.pageSize ?? PAGE_SIZE);
    return { ...info, items: matches.slice(info.offset, info.offset + info.pageSize) };
  }

  /**
   * Opciones de cada filtro (facetas dependientes): las de un filtro salen de los productos que
   * cumplen el texto y TODOS LOS DEMÁS filtros activos, sin aplicarse a sí mismo; así se puede
   * seguir sumando valores en el mismo filtro (OR). Los valores ya marcados se conservan siempre,
   * para poder desmarcarlos aunque otro filtro los deje sin productos. Un solo recorrido.
   */
  facets(query: Pick<CatalogQuery, 'text' | 'filters'> = {}): Facets {
    const tokens = searchTokens(query.text);
    const filters = activeFilters(query.filters);
    const sets = Object.fromEntries(FILTER_KEYS.map((k) => [k, new Set<string>()])) as Record<FilterKey, Set<string>>;
    for (const [key, values] of filters) for (const v of values) sets[key].add(v);

    for (const { product, haystack } of this.entries) {
      if (!tokens.every((t) => haystack.includes(t))) continue;
      // Filtro que el producto no cumple: con 0 aporta a todos; con 1 solo a ese; con 2+ a ninguno.
      let failed: FilterKey | null = null;
      let failures = 0;
      for (const [key, values] of filters) {
        if (values.has(filterValue(product, key))) continue;
        failed = key;
        if (++failures > 1) break;
      }
      if (failures > 1) continue;
      for (const key of FILTER_KEYS) {
        if (failed !== null && key !== failed) continue;
        const value = filterValue(product, key);
        if (value) sets[key].add(value);
      }
    }
    return Object.fromEntries(FILTER_KEYS.map((k) => [k, [...sets[k]].sort(compareText)])) as Facets;
  }
}
