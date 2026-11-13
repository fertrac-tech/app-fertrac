import { describe, expect, it } from 'vitest';
import { COL, parseCondition, parseConditionText, parseNumber, parsePromoColor, photoUrlFrom, rowsToProducts, rowToProduct } from './mapper';

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

  it('una condición que nombra un color es una promoción de ese color', () => {
    expect(parseCondition('Magenta')).toBe('PROMO');
    expect(parsePromoColor('Magenta')).toBe('magenta');
    expect(parsePromoColor(' PROMO AZUL ')).toBe('azul');
    expect(parsePromoColor('PROMOCION')).toBeNull();
    expect(parsePromoColor('NUEVAS')).toBeNull();
    expect(parsePromoColor('')).toBeNull();
  });

  it('el texto de la condición se conserva salvo que sea vacío o "NO TIENE"', () => {
    expect(parseConditionText(' Magenta ')).toBe('Magenta');
    expect(parseConditionText('NUEVAS')).toBe('NUEVAS');
    expect(parseConditionText('NO TIENE')).toBeNull();
    expect(parseConditionText('No tiene')).toBeNull();
    expect(parseConditionText('')).toBeNull();
    expect(parseCondition('NO TIENE')).toBe('NORMAL');
  });

  it('el producto conserva el color de su promoción', () => {
    const p = rowToProduct(row({ REF: '4089757-MCBEE', CONDICION: 'Magenta', INV: 20 }));
    expect(p).toMatchObject({ condition: 'PROMO', promoColor: 'magenta', conditionText: 'Magenta', stock: 20 });
  });
});

describe('rowToProduct', () => {
  it('mapea todas las columnas', () => {
    const p = rowToProduct(
      row({
        REF: ' AMK-2210 ', PRODUCTO: 'AMORTIGUADOR CABINA T800', MARCA: 'FERTRAC', LINEA: 'SUSPENSION',
        CATEGORIA: 'Suspensión cabina', APLICACION: 'Tractocamión T800', ALTERNOS: 'AMK-2210A, 85-1021',
        PRECIO_BRUTO: 412000, NETO_5: 391400, NETO_8: 379040, PRECIO_PROMO: '', INV: '18', CONDICION: 'NUEVAS',
        FOTO: 'https://cdn.fertrac.com/fotos/amk-2210.jpg',
      }),
    );
    expect(p).toMatchObject({
      ref: 'AMK-2210', name: 'AMORTIGUADOR CABINA T800', brand: 'FERTRAC', condition: 'NUEVO', stock: 18,
      prices: { gross: 412000, net5: 391400, net8: 379040, promo: null }, photoUrl: 'https://cdn.fertrac.com/fotos/amk-2210.jpg',
    });
  });

  it('prefiere la foto del mapa de fotos y tolera inventario vacío o negativo', () => {
    const p = rowToProduct(row({ REF: 'X-1', INV: '', FOTO: 'https://col-b' }), { 'X-1': 'https://mapa' });
    expect(p?.photoUrl).toBe('https://mapa');
    expect(p?.stock).toBe(0);
    expect(rowToProduct(row({ REF: 'X-2', INV: -4 }))?.stock).toBe(0);
  });

  it('conserva promociones en texto libre', () => {
    expect(rowToProduct(row({ REF: 'X-1', PRECIO_PROMO: '2x1 hasta agotar' }))?.prices.promo).toBe('2x1 hasta agotar');
  });

  it('una aplicación "0" (celda vacía en la hoja) se trata como sin dato', () => {
    expect(rowToProduct(row({ REF: 'X-1', APLICACION: 0 }))?.application).toBe('');
    expect(rowToProduct(row({ REF: 'X-1', APLICACION: 'Kenworth' }))?.application).toBe('Kenworth');
  });

  it('descarta filas sin referencia', () => {
    expect(rowToProduct(row({ PRODUCTO: 'SIN REF' }))).toBeNull();
  });
});

describe('photoUrlFrom', () => {
  it('"Sin Foto" y vacíos no generan URL (evita peticiones 404 a rutas relativas)', () => {
    expect(photoUrlFrom('Sin Foto')).toBeNull();
    expect(photoUrlFrom('')).toBeNull();
    expect(photoUrlFrom(null)).toBeNull();
    expect(rowToProduct(row({ REF: 'X-1', FOTO: 'Sin Foto' }))?.photoUrl).toBeNull();
  });
  it('convierte enlaces de Drive en miniaturas públicas, como la v10', () => {
    expect(photoUrlFrom('https://drive.google.com/open?id=1aB_c-9')).toBe('https://drive.google.com/thumbnail?id=1aB_c-9&sz=w200');
    expect(photoUrlFrom('https://drive.google.com/file/d/1aB_c-9/view')).toBe('https://drive.google.com/thumbnail?id=1aB_c-9&sz=w200');
  });
  it('el mapa de fotos se consulta por referencia en mayúsculas', () => {
    expect(rowToProduct(row({ REF: 'amk-1' }), { 'AMK-1': 'https://drive.google.com/open?id=zz9' })?.photoUrl).toContain('id=zz9');
  });
});

describe('rowsToProducts', () => {
  it('omite encabezados, filas vacías y referencias duplicadas', () => {
    const data = [row({ REF: 'REFERENCIA' }), row({ REF: 'A-1' }), row({}), row({ REF: 'A-1' }), row({ REF: 'B-2' })];
    expect(rowsToProducts(data).map((p) => p.ref)).toEqual(['A-1', 'B-2']);
  });
});
