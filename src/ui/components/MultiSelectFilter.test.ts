import { describe, expect, it } from 'vitest';
import { popoverPlacement } from './MultiSelectFilter';

const phone = { width: 430, height: 932 };

describe('posición del panel de filtro (nunca desplaza la pantalla)', () => {
  it('chip a la izquierda: el panel se alinea a su borde izquierdo', () => {
    const p = popoverPlacement({ left: 16, right: 96, bottom: 100 }, phone);
    expect(p).toMatchObject({ left: 16, width: 300, top: 106 });
  });

  it('chip a la derecha (Marca en 430 px): el panel se alinea a su borde derecho', () => {
    const p = popoverPlacement({ left: 280, right: 345, bottom: 200 }, phone);
    expect(p.left).toBe(45);
    expect(p.left + p.width).toBe(345);
  });

  it('siempre queda dentro de la pantalla con 8 px de margen', () => {
    for (const left of [0, 50, 120, 200, 300, 380]) {
      const p = popoverPlacement({ left, right: left + 40, bottom: 120 }, { width: 320, height: 640 });
      expect(p.left).toBeGreaterThanOrEqual(8);
      expect(p.left + p.width).toBeLessThanOrEqual(312);
    }
  });

  it('el alto se ajusta al espacio disponible bajo el chip', () => {
    expect(popoverPlacement({ left: 16, right: 96, bottom: 500 }, { width: 430, height: 700 }).maxHeight).toBe(186);
    expect(popoverPlacement({ left: 16, right: 96, bottom: 100 }, phone).maxHeight).toBe(360);
  });
});
