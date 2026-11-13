import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, pageWindow, paginate } from './pagination';

describe('paginate', () => {
  it('usa 100 unidades por página por defecto', () => {
    expect(PAGE_SIZE).toBe(100);
    expect(paginate(4732, 1).pageSize).toBe(100);
  });
  it('calcula rango y total de páginas (caso del diseño: pág. 2 de 48)', () => {
    expect(paginate(4732, 2)).toMatchObject({ page: 2, totalPages: 48, offset: 100, from: 101, to: 200 });
  });
  it('la última página puede quedar incompleta', () => {
    expect(paginate(4732, 48)).toMatchObject({ from: 4701, to: 4732 });
  });
  it('limita páginas fuera de rango o inválidas', () => {
    expect(paginate(250, 99).page).toBe(3);
    expect(paginate(250, 0).page).toBe(1);
    expect(paginate(250, Number.NaN).page).toBe(1);
  });
  it('sin resultados: una página vacía', () => {
    expect(paginate(0, 1)).toMatchObject({ page: 1, totalPages: 1, from: 0, to: 0 });
  });
  it('exactamente 100 resultados caben en una página', () => {
    expect(paginate(100, 1)).toMatchObject({ totalPages: 1, from: 1, to: 100 });
  });
});

describe('pageWindow', () => {
  it('reproduce el paginador del diseño', () => {
    expect(pageWindow(2, 48)).toEqual([1, 2, 3, 'gap', 48]);
  });
  it('muestra saltos a ambos lados en páginas intermedias', () => {
    expect(pageWindow(20, 48)).toEqual([1, 'gap', 19, 20, 21, 'gap', 48]);
  });
  it('no usa "…" para saltar una sola página', () => {
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('una sola página', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});
