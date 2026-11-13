import { describe, expect, it } from 'vitest';
import { CatalogIndex, compareProducts, sortCatalog } from './catalogQuery';
import { makeProduct } from './testing';

const catalog = [
  makeProduct({ ref: 'TDI-0412', name: 'TERMINAL DIRECCIÓN IZQ.', stock: 0 }),
  makeProduct({ ref: 'KEM-1550', name: 'KIT EMBRAGUE 15.5"', stock: 4, brand: 'ORIGINAL' }),
  makeProduct({ ref: 'FAP-3321', name: 'FILTRO DE AIRE PRIMARIO', condition: 'PROMO', stock: 30 }),
  makeProduct({ ref: 'BAC-1450', name: 'BOMBA DE AGUA ISX', condition: 'NUEVO', stock: 6, brand: 'ORIGINAL' }),
  makeProduct({ ref: 'CRC-1810', name: 'CRUCETA CARDAN 1810', condition: 'PROMO', stock: 42, brand: 'IMPORTADO' }),
  makeProduct({ ref: 'AMK-2210', name: 'AMORTIGUADOR CABINA T800', condition: 'NUEVO', stock: 18, alternates: 'AMK-2210A, 85-1021' }),
  makeProduct({ ref: 'NVO-0000', name: 'ABRAZADERA NUEVA SIN STOCK', condition: 'NUEVO', stock: 0 }),
  makeProduct({ ref: 'PRM-0000', name: 'ZAPATA PROMO SIN STOCK', condition: 'PROMO', stock: 0 }),
  makeProduct({ ref: 'RAF-0780', name: 'RACHE AUTOMÁTICO FRENO', stock: 9, brand: 'IMPORTADO', line: 'FRENOS' }),
];

const refs = (items: { ref: string }[]) => items.map((p) => p.ref);

describe('orden del catálogo', () => {
  it('ordena solo alfabéticamente por nombre de producto (sin prioridad por condición ni inventario)', () => {
    const names = sortCatalog(catalog).map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true })));
    // La condición y el inventario ya no afectan el orden: un NUEVO sin stock no se va al final.
    expect(refs(sortCatalog(catalog))[0]).toBe('NVO-0000'); // "ABRAZADERA NUEVA SIN STOCK" va primero por la A
  });

  it('desempata por referencia cuando el nombre coincide', () => {
    const a = makeProduct({ ref: 'B-2', name: 'RODAMIENTO' });
    const b = makeProduct({ ref: 'B-1', name: 'RODAMIENTO' });
    expect(compareProducts(a, b)).toBeGreaterThan(0);
  });

  it('no muta el arreglo original', () => {
    const before = refs(catalog);
    sortCatalog(catalog);
    expect(refs(catalog)).toEqual(before);
  });
});

describe('CatalogIndex.query', () => {
  const index = new CatalogIndex(catalog);

  it('sin criterios devuelve todo el catálogo en orden alfabético', () => {
    const page = index.query();
    expect(page.total).toBe(catalog.length);
    expect(page.items[0]?.ref).toBe('NVO-0000'); // "ABRAZADERA NUEVA SIN STOCK"
  });

  it('la búsqueda conserva el orden alfabético', () => {
    const names = index.query({ text: 'a' }).items.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true })));
  });

  it('busca por referencia, producto, marca y alternos, sin tildes ni mayúsculas', () => {
    expect(refs(index.query({ text: 'amk-2210' }).items)).toEqual(['AMK-2210']);
    expect(refs(index.query({ text: 'direccion' }).items)).toEqual(['TDI-0412']);
    expect(refs(index.query({ text: '85-1021' }).items)).toEqual(['AMK-2210']);
    expect(refs(index.query({ text: 'importado' }).items)).toEqual(['CRC-1810', 'RAF-0780']);
  });

  it('todas las palabras deben coincidir (AND)', () => {
    expect(refs(index.query({ text: 'filtro aire' }).items)).toEqual(['FAP-3321']);
    expect(index.query({ text: 'filtro embrague' }).total).toBe(0);
  });

  it('aplica filtros combinados', () => {
    expect(refs(index.query({ filters: { brand: 'ORIGINAL' } }).items)).toEqual(['BAC-1450', 'KEM-1550']);
    expect(refs(index.query({ filters: { brand: 'ORIGINAL', condition: 'NUEVO' } }).items)).toEqual(['BAC-1450']);
    expect(index.query({ filters: { brand: '' } }).total).toBe(catalog.length);
  });

  it('pagina el resultado filtrado de 100 en 100', () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      makeProduct({ ref: `R-${String(i).padStart(4, '0')}`, name: `ITEM ${String(i).padStart(4, '0')}` }),
    );
    const big = new CatalogIndex(many);
    const first = big.query({ page: 1 });
    const third = big.query({ page: 3 });
    expect(first.items).toHaveLength(100);
    expect(first.totalPages).toBe(3);
    expect(third.items).toHaveLength(50);
    expect(third).toMatchObject({ from: 201, to: 250 });
    expect(big.query({ page: 2 }).items[0]?.ref).toBe('R-0100');
  });

  it('getMany devuelve en orden oficial e ignora referencias inexistentes', () => {
    expect(refs(index.getMany(['TDI-0412', 'NO-EXISTE', 'AMK-2210']))).toEqual(['AMK-2210', 'TDI-0412']);
  });

  it('facets lista los valores únicos ordenados', () => {
    const facets = index.facets();
    expect(facets.brand).toEqual(['FERTRAC', 'IMPORTADO', 'ORIGINAL']);
    expect(facets.line).toEqual(['FRENOS', 'SUSPENSION']);
    expect(facets.condition).toEqual(['NORMAL', 'NUEVO', 'PROMO']);
  });
});
