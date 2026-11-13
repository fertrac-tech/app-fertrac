import type { Condition, Product } from '@/domain/product';

/** Catálogo de demostración determinista (mismo resultado en cada ejecución). */
const PARTS = [
  ['AMORTIGUADOR CABINA', 'SUSPENSION', 'Suspensión cabina'], ['BOMBA DE AGUA', 'MOTOR', 'Refrigeración'],
  ['CRUCETA CARDAN', 'TRANSMISION', 'Cardán'], ['FILTRO DE AIRE PRIMARIO', 'MOTOR', 'Filtración'],
  ['KIT EMBRAGUE', 'TRANSMISION', 'Embrague'], ['RACHE AUTOMÁTICO FRENO', 'FRENOS', 'Freno de aire'],
  ['TERMINAL DIRECCIÓN', 'DIRECCION', 'Terminales'], ['VÁLVULA CONTROL SUSPENSIÓN', 'SUSPENSION', 'Válvulas'],
  ['PASTILLA FRENO DELANTERA', 'FRENOS', 'Pastillas'], ['BALINERA RUEDA TRASERA', 'RODAMIENTOS', 'Balineras'],
  ['SOPORTE MOTOR DELANTERO', 'MOTOR', 'Soportes'], ['EMPAQUE MÚLTIPLE ESCAPE', 'MOTOR', 'Empaques'],
  ['MUELLE TRASERO', 'SUSPENSION', 'Muelles'], ['RETENEDOR RUEDA', 'RODAMIENTOS', 'Retenedores'],
  ['BANDA FRENO', 'FRENOS', 'Bandas'], ['INYECTOR', 'MOTOR', 'Inyección'],
  ['TURBO CARGADOR', 'MOTOR', 'Turbos'], ['RADIADOR', 'MOTOR', 'Refrigeración'],
  ['BARRA ESTABILIZADORA', 'SUSPENSION', 'Barras'], ['CÁMARA DE FRENO', 'FRENOS', 'Freno de aire'],
] as const;
const MODELS = ['T800', 'ISX', '1810', 'W900', 'FH12', 'CASCADIA', 'M2', 'PRO STAR', 'FL112', 'ACTROS', 'NPR', 'FVR', 'CH613', 'T680', '9200i', 'COLUMBIA'];
const BRANDS = ['FERTRAC', 'ORIGINAL', 'IMPORTADO'];
const VARIANTS = ['', 'IZQ.', 'DER.', 'REFORZADO', 'KIT', 'STD', 'HD', 'DELANTERO', 'TRASERO', 'LARGO', 'CORTO', '15.5"', '14"', 'PREMIUM', 'ECO'];

/** Generador pseudoaleatorio con semilla (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEATURED: Product[] = [
  { ref: 'AMK-2210', name: 'AMORTIGUADOR CABINA T800', brand: 'FERTRAC', line: 'SUSPENSION', category: 'Suspensión cabina', subcategory: 'Cabina', type: 'Neumático', application: 'Tractocamión T800', alternates: 'AMK-2210A, 85-1021', condition: 'NUEVO', stock: 18, prices: { gross: 412000, net5: 391400, net8: 379040, promo: null }, promoEnds: null, photoUrl: null },
  { ref: 'BAC-1450', name: 'BOMBA DE AGUA ISX', brand: 'ORIGINAL', line: 'MOTOR', category: 'Refrigeración', subcategory: 'Bombas', type: 'Mecánica', application: 'Cummins ISX', alternates: '4089910', condition: 'NUEVO', stock: 6, prices: { gross: 1280000, net5: 1216000, net8: 1177600, promo: null }, promoEnds: null, photoUrl: null },
  { ref: 'CRC-1810', name: 'CRUCETA CARDAN 1810', brand: 'IMPORTADO', line: 'TRANSMISION', category: 'Cardán', subcategory: 'Crucetas', type: 'Serie 1810', application: 'Cardán serie 1810', alternates: '5-280X', condition: 'PROMO', stock: 42, prices: { gross: 96500, net5: 91675, net8: 88780, promo: 86900 }, promoEnds: '30 de noviembre', photoUrl: null },
  { ref: 'FAP-3321', name: 'FILTRO DE AIRE PRIMARIO', brand: 'FERTRAC', line: 'MOTOR', category: 'Filtración', subcategory: 'Aire', type: 'Primario', application: 'Kenworth / International', alternates: 'P181099', condition: 'PROMO', stock: 30, prices: { gross: 148900, net5: 141455, net8: 136988, promo: 129900 }, promoEnds: '30 de noviembre', photoUrl: null },
  { ref: 'KEM-1550', name: 'KIT EMBRAGUE 15.5"', brand: 'ORIGINAL', line: 'TRANSMISION', category: 'Embrague', subcategory: 'Kits', type: '15.5"', application: 'Eaton Fuller', alternates: '108925-82', condition: 'NORMAL', stock: 4, prices: { gross: 3450000, net5: 3277500, net8: 3174000, promo: null }, promoEnds: null, photoUrl: null },
  { ref: 'RAF-0780', name: 'RACHE AUTOMÁTICO FRENO', brand: 'IMPORTADO', line: 'FRENOS', category: 'Freno de aire', subcategory: 'Raches', type: 'Automático', application: 'Eje trasero', alternates: '40010211', condition: 'NORMAL', stock: 9, prices: { gross: 215000, net5: 204250, net8: 197800, promo: null }, promoEnds: null, photoUrl: null },
  { ref: 'TDI-0412', name: 'TERMINAL DIRECCIÓN IZQ.', brand: 'FERTRAC', line: 'DIRECCION', category: 'Terminales', subcategory: 'Dirección', type: 'Izquierdo', application: 'Freightliner', alternates: 'ES3172L', condition: 'NORMAL', stock: 0, prices: { gross: 134000, net5: 127300, net8: 123280, promo: null }, promoEnds: null, photoUrl: null },
];

export function buildMockCatalog(size = 4732): Product[] {
  const random = seeded(20261112);
  const products = [...FEATURED];
  const used = new Set(products.map((p) => p.ref));

  while (products.length < size) {
    const i = products.length;
    const part = PARTS[Math.floor(random() * PARTS.length)] ?? PARTS[0];
    const model = MODELS[Math.floor(random() * MODELS.length)] ?? '';
    const variant = VARIANTS[Math.floor(random() * VARIANTS.length)] ?? '';
    const brand = BRANDS[Math.floor(random() * BRANDS.length)] ?? 'FERTRAC';
    const prefix = part[0].replace(/[^A-Z]/g, '').slice(0, 3);
    const ref = `${prefix}-${String(1000 + i)}`;
    if (used.has(ref)) continue;
    used.add(ref);

    const roll = random();
    const condition: Condition = roll < 0.04 ? 'NUEVO' : roll < 0.12 ? 'PROMO' : 'NORMAL';
    const stock = random() < 0.18 ? 0 : Math.floor(random() * 60) + 1;
    const gross = Math.round((40000 + random() * 3_500_000) / 100) * 100;

    products.push({
      ref,
      name: [part[0], model, variant].filter(Boolean).join(' '),
      brand,
      line: part[1],
      category: part[2],
      subcategory: part[2],
      type: variant || 'Estándar',
      application: model,
      alternates: `${prefix}${i}A`,
      condition,
      stock,
      prices: {
        gross,
        net5: Math.round(gross * 0.95),
        net8: Math.round(gross * 0.92),
        promo: condition === 'PROMO' ? Math.round((gross * 0.88) / 100) * 100 : null,
      },
      promoEnds: condition === 'PROMO' ? '30 de noviembre' : null,
      photoUrl: null,
    });
  }
  return products;
}
