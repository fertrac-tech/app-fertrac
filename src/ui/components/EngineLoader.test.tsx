import { render } from '@testing-library/react';
import { averageLoadMs, COMPACT_THRESHOLD_MS, cycleFor, EngineLoader, recordLoadMs } from './EngineLoader';

describe('EngineLoader: modo según el tiempo de carga', () => {
  beforeEach(() => localStorage.clear());

  it('menos de 3 s usa el modo compacto; desde 3 s, el completo', () => {
    const { container, rerender } = render(<EngineLoader expectedMs={COMPACT_THRESHOLD_MS - 1} />);
    expect(container.querySelector('.eng-loader--quick')).not.toBeNull();
    rerender(<EngineLoader expectedMs={COMPACT_THRESHOLD_MS} />);
    expect(container.querySelector('.eng-loader--quick')).toBeNull();
  });

  it('el ciclo completo se ajusta al tiempo esperado, entre 5 y 40 s', () => {
    expect(cycleFor(3000)).toBe(5);
    expect(cycleFor(10000)).toBeCloseTo(10.5);
    expect(cycleFor(90000)).toBe(40);
  });

  it('aprende un promedio móvil por tipo de carga e ignora mediciones instantáneas', () => {
    recordLoadMs('sesion', 10);
    expect(averageLoadMs('sesion')).toBeNull();
    recordLoadMs('sesion', 4000);
    recordLoadMs('sesion', 2000);
    expect(averageLoadMs('sesion')).toBeCloseTo(3400);
    expect(averageLoadMs('detalle')).toBeNull();
  });
});
