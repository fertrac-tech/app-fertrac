import { describe, expect, it } from 'vitest';
import { conditionLabel, priorityTier, stockLevel } from './product';

describe('priorityTier', () => {
  it('nivel 1: NUEVO con inventario > 0', () => {
    expect(priorityTier({ condition: 'NUEVO', stock: 1 })).toBe(1);
  });
  it('nivel 2: PROMOCIÓN con inventario > 0', () => {
    expect(priorityTier({ condition: 'PROMO', stock: 5 })).toBe(2);
  });
  it('nivel 3: normal con inventario > 0', () => {
    expect(priorityTier({ condition: 'NORMAL', stock: 5 })).toBe(3);
  });
  it.each(['NUEVO', 'PROMO', 'NORMAL'] as const)('nivel 4: %s sin inventario', (condition) => {
    expect(priorityTier({ condition, stock: 0 })).toBe(4);
  });
  it('inventario negativo se trata como sin inventario', () => {
    expect(priorityTier({ condition: 'NUEVO', stock: -3 })).toBe(4);
  });
});

describe('conditionLabel', () => {
  it('no muestra nada sin condición o con "NO TIENE"', () => {
    expect(conditionLabel({ condition: 'NORMAL', promoColor: null })).toBeNull();
  });
  it('muestra el color en lugar de PROMO', () => {
    expect(conditionLabel({ condition: 'PROMO', promoColor: 'verde' })).toBe('VERDE');
    expect(conditionLabel({ condition: 'PROMO', promoColor: 'magenta' })).toBe('MAGENTA');
    expect(conditionLabel({ condition: 'PROMO', promoColor: 'azul' })).toBe('AZUL');
  });
  it('mantiene PROMO cuando CONDICIÓN es PROMOCION', () => {
    expect(conditionLabel({ condition: 'PROMO', promoColor: null })).toBe('PROMO');
  });
  it('mantiene NUEVO cuando CONDICIÓN es NUEVA', () => {
    expect(conditionLabel({ condition: 'NUEVO', promoColor: null })).toBe('NUEVO');
  });
});

describe('stockLevel', () => {
  it('clasifica sin stock, bajo y disponible', () => {
    expect(stockLevel(0)).toBe('none');
    expect(stockLevel(4)).toBe('low');
    expect(stockLevel(10)).toBe('ok');
  });
});
