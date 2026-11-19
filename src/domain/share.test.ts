import { describe, expect, it } from 'vitest';
import { makeProduct } from './testing';
import { shareFileName, shareText, whatsappUrl } from './share';

describe('shareText', () => {
  it('lleva producto, referencia, marca y precio bruto en formato de WhatsApp', () => {
    const p = makeProduct({ ref: 'AMK-2210', name: 'AMORTIGUADOR CABINA T800', brand: 'FERTRAC', prices: { gross: 412000, net5: 391400, net8: 379040, promo: null } });
    expect(shareText(p)).toBe('*AMORTIGUADOR CABINA T800*\nRef. AMK-2210 · FERTRAC\nPrecio: $ 412.000\n\nFertrac · Siempre Calidad Original');
  });
  it('agrega el precio promo cuando existe y nunca comparte los netos', () => {
    const p = makeProduct({ ref: 'P1', prices: { gross: 100000, net5: 95000, net8: 92000, promo: 80000 } });
    const text = shareText(p);
    expect(text).toContain('Precio promo: $ 80.000');
    expect(text).not.toContain('95.000');
    expect(text).not.toContain('92.000');
  });
  it('usa el alias del favorito como nombre si lo hay', () => {
    expect(shareText(makeProduct({ ref: 'P1', name: 'ORIGINAL' }), 'Mi alias')).toMatch(/^\*Mi alias\*/);
  });
  it('omite el precio cuando no hay valor', () => {
    expect(shareText(makeProduct({ ref: 'P1', prices: { gross: null, net5: null, net8: null, promo: null } }))).not.toContain('Precio');
  });
});

describe('whatsappUrl', () => {
  it('codifica el texto para wa.me', () => {
    expect(whatsappUrl('*Hola* & $ 1.000\nRef')).toBe('https://wa.me/?text=*Hola*%20%26%20%24%201.000%0ARef');
  });
});

describe('shareFileName', () => {
  it('nombre de archivo seguro a partir de la referencia', () => {
    expect(shareFileName('AMK 2210/A', 'image/png')).toBe('fertrac-AMK-2210-A.png');
    expect(shareFileName('X1', 'image/webp')).toBe('fertrac-X1.webp');
    expect(shareFileName('X1', 'application/octet-stream')).toBe('fertrac-X1.jpg');
  });
});
