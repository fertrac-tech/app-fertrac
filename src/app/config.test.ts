import { describe, expect, it } from 'vitest';
import { readConfig } from './config';

describe('readConfig', () => {
  it('por defecto usa datos de demostración (nunca apunta a producción por accidente)', () => {
    expect(readConfig({}, '11.0.0')).toMatchObject({ dataSource: 'mock', allowedDomain: 'fertrac.com', version: '11.0.0' });
  });
  it('acepta la configuración real completa', () => {
    const config = readConfig(
      { VITE_DATA_SOURCE: 'appsscript', VITE_APPS_SCRIPT_URL: 'https://script.google.com/x/exec', VITE_GOOGLE_CLIENT_ID: 'id', VITE_ENV_LABEL: 'STAGING' },
      '11.0.0',
    );
    expect(config).toMatchObject({ dataSource: 'appsscript', environmentLabel: 'STAGING' });
  });
  it('falla al arrancar si falta la URL del backend o el cliente de Google', () => {
    expect(() => readConfig({ VITE_DATA_SOURCE: 'appsscript' }, '1')).toThrow(/VITE_APPS_SCRIPT_URL y VITE_GOOGLE_CLIENT_ID/);
    expect(() => readConfig({ VITE_DATA_SOURCE: 'appsscript', VITE_APPS_SCRIPT_URL: 'http://inseguro', VITE_GOOGLE_CLIENT_ID: 'id' }, '1')).toThrow(/VITE_APPS_SCRIPT_URL/);
  });
});
