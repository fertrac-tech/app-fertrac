import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest corre con `css: false`: se lee la hoja de estilos como texto.
const css = readFileSync(resolve(process.cwd(), 'src/ui/styles/app.css'), 'utf8');

/** La app se dibuja de borde a borde (viewport-fit=cover): nada puede quedar bajo las barras del sistema. */
describe('áreas seguras (barra de estado y barra de navegación/tareas de Android)', () => {
  it('#root reserva los cuatro bordes', () => {
    expect(css).toMatch(/#root\s*{\s*padding:\s*var\(--safe-top\)\s+var\(--safe-right\)\s+var\(--safe-bottom\)\s+var\(--safe-left\)/);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(css).toContain(`--safe-${side}: env(safe-area-inset-${side}, 0px)`);
    }
  });

  it('el detalle a pantalla completa (móvil) respeta las cuatro áreas seguras', () => {
    expect(css).toContain('inset: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)');
  });

  it('nadie suma el área inferior dos veces (ya la reserva #root)', () => {
    expect(css).not.toMatch(/\.bottomnav\s*{[^}]*safe-area-inset-bottom/);
    expect(css).not.toMatch(/\.detail__action\s*{[^}]*safe-area-inset-bottom/);
  });
});
