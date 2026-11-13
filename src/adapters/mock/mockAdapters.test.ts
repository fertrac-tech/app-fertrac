import { describe, expect, it } from 'vitest';
import { CatalogIndex } from '@/domain/catalogQuery';
import { priorityTier } from '@/domain/product';
import { AccessDeniedError } from '@/ports';
import { MockCatalogSource, readMockAccess } from './mockAdapters';
import { buildMockCatalog } from './mockCatalog';

describe('catálogo de demostración', () => {
  const catalog = buildMockCatalog();

  it('es determinista, sin referencias repetidas y del tamaño del diseño', () => {
    expect(catalog).toHaveLength(4732);
    expect(new Set(catalog.map((p) => p.ref)).size).toBe(4732);
    expect(buildMockCatalog().map((p) => p.ref)).toEqual(catalog.map((p) => p.ref));
  });

  it('cubre los cuatro niveles de prioridad y da 48 páginas de 100', () => {
    expect(new Set(catalog.map(priorityTier))).toEqual(new Set([1, 2, 3, 4]));
    const page = new CatalogIndex(catalog).query({ page: 2 });
    expect(page).toMatchObject({ totalPages: 48, from: 101, to: 200 });
    expect(page.items).toHaveLength(100);
  });

  it('el catálogo completo ordenado nunca retrocede de nivel', () => {
    const index = new CatalogIndex(catalog);
    let last = 1;
    for (let page = 1; page <= 48; page += 1) {
      for (const p of index.query({ page }).items) {
        expect(priorityTier(p)).toBeGreaterThanOrEqual(last);
        last = priorityTier(p);
      }
    }
  });
});

describe('simulación de seguridad', () => {
  it('lee el estado desde la URL y lo recuerda en la pestaña', () => {
    expect(readMockAccess('?acceso=dispositivo_pendiente')).toBe('dispositivo_pendiente');
    expect(readMockAccess('')).toBe('dispositivo_pendiente');
    expect(readMockAccess('?acceso=ok')).toBe('ok');
    expect(readMockAccess('?acceso=inventado')).toBe('ok');
  });

  it('la fuente niega el acceso con el código simulado', async () => {
    const source = new MockCatalogSource(() => 'dispositivo_bloqueado', 0, 10);
    await expect(source.fetchAll()).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(new MockCatalogSource(() => 'ok', 0, 10).fetchAll()).resolves.toHaveLength(10);
  });
});
