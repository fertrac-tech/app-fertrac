import { describe, expect, it } from 'vitest';
import { ACCESS_CODES, accessMessage, evaluateAccess, isAccessCode, isCorporateEmail, layerStatuses, shortDeviceCode } from './access';

describe('evaluateAccess', () => {
  it('ok concede el acceso', () => {
    expect(evaluateAccess('ok')).toMatchObject({ granted: true, failedLayer: null, wipeLocalData: false });
  });

  it('capa 1 (Google): exige volver a iniciar sesión', () => {
    for (const code of ['sin_credenciales', 'token_invalido', 'token_requerido'] as const) {
      expect(evaluateAccess(code)).toMatchObject({ granted: false, failedLayer: 'google', requiresSignIn: true });
    }
  });

  it('capa 2 (lista blanca): niega y borra datos locales', () => {
    for (const code of ['no_autorizado', 'usuario_suspendido'] as const) {
      expect(evaluateAccess(code)).toMatchObject({ granted: false, failedLayer: 'whitelist', wipeLocalData: true, retryable: false });
    }
  });

  it('capa 3 (dispositivo): pendiente y límite se pueden reintentar y conservan datos', () => {
    for (const code of ['dispositivo_pendiente', 'dispositivo_limite'] as const) {
      expect(evaluateAccess(code)).toMatchObject({ failedLayer: 'device', retryable: true, wipeLocalData: false });
    }
  });

  it('dispositivo bloqueado no se reintenta y borra datos locales', () => {
    expect(evaluateAccess('dispositivo_bloqueado')).toMatchObject({ failedLayer: 'device', retryable: false, wipeLocalData: true });
  });

  it('ningún código distinto de ok concede acceso', () => {
    for (const code of ACCESS_CODES) expect(evaluateAccess(code).granted).toBe(code === 'ok');
  });

  it('todo código de rechazo tiene mensaje para el usuario', () => {
    for (const code of ACCESS_CODES) {
      if (code !== 'ok') expect(accessMessage(code).title.length).toBeGreaterThan(0);
    }
  });
});

describe('layerStatuses', () => {
  it('todo aprobado con ok', () => {
    expect(layerStatuses('ok')).toEqual({ google: 'passed', whitelist: 'passed', device: 'passed' });
  });
  it('dispositivo pendiente: las dos primeras capas pasaron', () => {
    expect(layerStatuses('dispositivo_pendiente')).toEqual({ google: 'passed', whitelist: 'passed', device: 'failed' });
  });
  it('fuera de lista blanca: la capa de dispositivo no se evaluó', () => {
    expect(layerStatuses('no_autorizado')).toEqual({ google: 'passed', whitelist: 'failed', device: 'unknown' });
  });
});

describe('utilidades', () => {
  it('reconoce códigos válidos', () => {
    expect(isAccessCode('dispositivo_limite')).toBe(true);
    expect(isAccessCode('temporalmente_ocupado')).toBe(false);
    expect(isAccessCode(undefined)).toBe(false);
  });
  it('código corto: últimos 6 caracteres en mayúscula, nunca el id completo', () => {
    expect(shortDeviceCode('web-1b2c3d4e-aaaa-bbbb-cccc-00a3f9k2')).toBe('A3F9K2');
    expect(shortDeviceCode('')).toBe('------');
  });
  it('valida dominio corporativo', () => {
    expect(isCorporateEmail('Usuario@Fertrac.com', 'fertrac.com')).toBe(true);
    expect(isCorporateEmail('usuario@gmail.com', 'fertrac.com')).toBe(false);
    expect(isCorporateEmail('x@notfertrac.com', 'fertrac.com')).toBe(false);
  });
});
