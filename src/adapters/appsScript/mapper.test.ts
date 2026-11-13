import { describe, expect, it } from 'vitest';
import { COL, parseCondition, parseNumber, rowsToProducts, rowToProduct } from './mapper';

function row(values: Partial<Record<keyof typeof COL, unknown>>): unknown[] {
  const r: unknown[] = Array.from({ length: 22 }, () => '');
  for (const [key, value] of Object.entries(values)) r[COL[key as keyof typeof COL]] = value;
  return r;
}

describe('parseNumber', () => {
  it.each([
    [412000, 412000],
    ['412000', 412000],
    ['$ 412.000', 412000],
    ['1.280.000,50', 1280000.5],
    ['12,5', 12.5],
    ['', null],
    ['N/A', null],
    [null, null],
  ])('%j → %j', (input, expected) => expect(parseNumber(input)).toBe(expected));
});

describe('parseCondition', () => {
  it('reconoce las condiciones de la base actual', () => {
    expect(parseCondition('NUEVAS')).toBe('NUEVO');
    expect(parseCondition('nuevo')).toBe('NUEVO');
    expect(parseCondition('PROMOCION')).toBe('PROMO');
    expect(parseCondition('Promoción')).toBe('PROMO');
    expect(parseCondition('')).toBe('NORMAL');
    expect(parseCondition('LIQUIDACION')).toBe('NORMAL');
  });
});

describe('rowToProduct', () => {
  it('mapea todas las columnas', () => {
    const p = rowToProduct(
      row({
        REF: ' AMK-2210 ', PRODUCTO: 'AMORTIGUADOR CABINA T800', MARCA: 'FERTRAC', LINEA: 'SUSPENSION',
        CATEGORIA: 'Suspensión cabina', APLICACION: 'Tractocamión T800', ALTERNOS: 'AMK-2210A, 85-1021',
        PRECIO_BRUTO: 412000, NETO_5: 391400, NETO_8: 379040, PRECIO_PROMO: '', INV: '18', CONDICION: 'NUEVAS',
        FOTO: 'https://drive/fallback',
      }),
    );
    expect(p).toMatchObject({
      ref: 'AMK-2210', name: 'AMORTIGUADOR CABINA T800', brand: 'FERTRAC', condition: 'NUEVO', stock: 18,
      prices: { gross: 412000, net5: 391400, net8: 379040, promo: null }, photoUrl: 'https://drive/fallback',
    });
  });

  it('prefiere la foto del mapa de fotos y tolera inventario vacío o negativo', () => {
    const p = rowToProduct(row({ REF: 'X-1', INV: '', FOTO: 'col-b' }), { 'X-1': 'mapa' });
    expect(p?.photoUrl).toBe('mapa');
    expect(p?.stock).toBe(0);
    expect(rowToProduct(row({ REF: 'X-2', INV: -4 }))?.stock).toBe(0);
  });

  it('conserva promociones en texto libre', () => {
    expect(rowToProduct(row({ REF: 'X-1', PRECIO_PROMO: '2x1 hasta agotar' }))?.prices.promo).toBe('2x1 hasta agotar');
  });

  it('descarta filas sin referencia', () => {
    expect(rowToProduct(row({ PRODUCTO: 'SIN REF' }))).toBeNull();
  });
});

describe('rowsToProducts', () => {
  it('omite encabezados, filas vacías y referencias duplicadas', () => {
    const data = [row({ REF: 'REFERENCIA' }), row({ REF: 'A-1' }), row({}), row({ REF: 'A-1' }), row({ REF: 'B-2' })];
    expect(rowsToProducts(data).map((p) => p.ref)).toEqual(['A-1', 'B-2']);
  });
});
