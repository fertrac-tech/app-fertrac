import { describe, expect, it } from 'vitest';
import { compareText, formatCount, formatPrice, initials, normalize } from './text';

describe('normalize', () => {
  it('quita tildes, mayúsculas y espacios sobrantes', () => {
    expect(normalize('  VÁLVULA   Suspensión ')).toBe('valvula suspension');
  });
});

describe('compareText', () => {
  it('ordena ignorando tildes y mayúsculas', () => {
    expect(['Válvula', 'amortiguador', 'Bomba'].sort(compareText)).toEqual(['amortiguador', 'Bomba', 'Válvula']);
  });
  it('ordena números de forma natural', () => {
    expect(['KIT 10', 'KIT 2'].sort(compareText)).toEqual(['KIT 2', 'KIT 10']);
  });
});

describe('formatPrice', () => {
  it('usa punto de miles y prefijo $', () => {
    expect(formatPrice(412000)).toBe('$ 412.000');
    expect(formatPrice(1280000)).toBe('$ 1.280.000');
    expect(formatPrice(96500.4)).toBe('$ 96.500');
  });
  it('muestra raya cuando no hay valor', () => {
    expect(formatPrice(null)).toBe('—');
    expect(formatPrice('')).toBe('—');
  });
  it('conserva textos libres de promoción', () => {
    expect(formatPrice('2x1 hasta agotar')).toBe('2x1 hasta agotar');
  });
  it('formatea números que llegan como texto', () => {
    expect(formatPrice('148900')).toBe('$ 148.900');
  });
});

describe('formatCount / initials', () => {
  it('agrupa miles', () => expect(formatCount(4732)).toBe('4.732'));
  it('toma primera y última inicial', () => {
    expect(initials('David Torres')).toBe('DT');
    expect(initials('laura maría pérez')).toBe('LP');
    expect(initials('Fertrac')).toBe('F');
    expect(initials('  ')).toBe('?');
  });
});

import { formatSyncTime } from './text';

describe('formatSyncTime', () => {
  const now = new Date(2026, 10, 12, 16, 0).getTime();
  it('mismo día: "Hoy, hora"', () => {
    expect(formatSyncTime(new Date(2026, 10, 12, 14, 30).getTime(), now)).toMatch(/^Hoy, 2:30 p\. ?m\.$/);
  });
  it('otro día: fecha corta', () => {
    expect(formatSyncTime(new Date(2026, 10, 10, 9, 5).getTime(), now)).toMatch(/^10 (de )?nov, 9:05 a\. ?m\.$/);
  });
  it('nunca sincronizado', () => expect(formatSyncTime(null)).toBe('Sin sincronizar'));
});
