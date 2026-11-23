import { createHash } from 'node:crypto';
import { analyticsItem, isMeasurementId, normalizeSearchTerm, pseudonymousUserId, screenFromPath, USER_ID_SALT } from './analytics';

const sha256Hex = async (text: string) => createHash('sha256').update(text).digest('hex');

describe('screenFromPath', () => {
  it.each([
    ['/', 'catalogo'],
    ['', 'catalogo'],
    ['/favoritos', 'favoritos'],
    ['/Favoritos/', 'favoritos'],
    ['/perfil', 'perfil'],
    ['/otra-cosa', 'catalogo'],
  ])('%s → %s', (path, screen) => {
    expect(screenFromPath(path)).toBe(screen);
  });
});

describe('analyticsItem', () => {
  it('usa la referencia como item_id y omite los campos vacíos', () => {
    expect(analyticsItem({ ref: '4089757', name: 'Filtro aceite', brand: 'MCBEE', category: 'Filtros', subcategory: '' })).toEqual({
      item_id: '4089757',
      item_name: 'Filtro aceite',
      item_brand: 'MCBEE',
      item_category: 'Filtros',
    });
  });
});

describe('normalizeSearchTerm', () => {
  it('recorta, une espacios, pasa a minúsculas y limita a 100 caracteres', () => {
    expect(normalizeSearchTerm('  Filtro   ACEITE ')).toBe('filtro aceite');
    expect(normalizeSearchTerm('x'.repeat(150))).toHaveLength(100);
  });
});

describe('isMeasurementId', () => {
  it('acepta solo IDs de medición GA4', () => {
    expect(isMeasurementId('G-TR2YESSS1P')).toBe(true);
    expect(isMeasurementId('GT-WKPPCJV7')).toBe(false);
    expect(isMeasurementId('GTM-ABC123')).toBe(false);
    expect(isMeasurementId('')).toBe(false);
    expect(isMeasurementId(undefined)).toBe(false);
  });
});

describe('pseudonymousUserId', () => {
  it('es estable, no depende de mayúsculas y nunca contiene el correo', async () => {
    const a = await pseudonymousUserId('Vendedor@Fertrac.com ', sha256Hex);
    const b = await pseudonymousUserId('vendedor@fertrac.com', sha256Hex);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain('fertrac');
  });

  it('usa sal: no coincide con el hash plano del correo', async () => {
    const plain = (await sha256Hex('vendedor@fertrac.com')).slice(0, 32);
    expect(await pseudonymousUserId('vendedor@fertrac.com', sha256Hex)).not.toBe(plain);
    expect(USER_ID_SALT).not.toBe('');
  });

  it('sin correo devuelve null', async () => {
    expect(await pseudonymousUserId('  ', sha256Hex)).toBeNull();
  });
});
