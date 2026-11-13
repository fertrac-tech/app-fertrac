import { describe, expect, it } from 'vitest';
import { BrowserDeviceIdentity, DEVICE_STORAGE_KEY, type BrowserEnvironment } from './browserDeviceIdentity';

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 15; SM-F956B) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

function env(overrides: Partial<BrowserEnvironment> = {}): BrowserEnvironment & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    userAgent: CHROME_WINDOWS,
    maxTouchPoints: 0,
    standalone: false,
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    randomUUID: () => '11111111-2222-3333-4444-555555555555',
    idb: null,
    ...overrides,
  };
}

describe('BrowserDeviceIdentity', () => {
  it('navegador: genera "web-" + UUID y lo persiste con la clave de la v10', async () => {
    const e = env();
    const info = await new BrowserDeviceIdentity(e).get();
    expect(info).toMatchObject({ id: 'web-11111111-2222-3333-4444-555555555555', channel: 'navegador', platform: 'web-desktop', isAndroid: false });
    expect(e.data.get(DEVICE_STORAGE_KEY)).toBe(info.id);
    expect(info.model).toBe('Windows NT 10.0 · Chrome/140');
  });

  it('reutiliza el identificador ya aprobado en la v10 (no obliga a re-aprobar)', async () => {
    const e = env();
    e.data.set(DEVICE_STORAGE_KEY, 'web-aprobado-en-v10-0001');
    expect((await new BrowserDeviceIdentity(e).get()).id).toBe('web-aprobado-en-v10-0001');
  });

  it('descarta identificadores corruptos o de otro canal', async () => {
    const e = env();
    e.data.set(DEVICE_STORAGE_KEY, 'and-de-otro-canal-0001');
    expect((await new BrowserDeviceIdentity(e).get()).id).toMatch(/^web-/);
  });

  it('PWA instalada en Android: canal pwa_instalada y bandera so=android', async () => {
    const info = await new BrowserDeviceIdentity(env({ userAgent: CHROME_ANDROID, standalone: true, maxTouchPoints: 5 })).get();
    expect(info).toMatchObject({ channel: 'pwa_instalada', platform: 'pwa-android', isAndroid: true });
  });

  it('detecta Android en modo "ver como computador"', async () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';
    expect((await new BrowserDeviceIdentity(env({ userAgent: ua, maxTouchPoints: 5 })).get()).isAndroid).toBe(true);
  });

  it('APK: usa "and-" + ANDROID_ID del plugin de Capacitor', async () => {
    const info = await new BrowserDeviceIdentity(
      env({
        userAgent: CHROME_ANDROID,
        capacitor: {
          isNativePlatform: () => true,
          Plugins: {
            Device: {
              getId: async () => ({ identifier: 'a1b2c3d4e5f60718' }),
              getInfo: async () => ({ manufacturer: 'samsung', model: 'SM-F956B', operatingSystem: 'android', osVersion: '15' }),
            },
          },
        },
      }),
    ).get();
    expect(info).toMatchObject({ id: 'and-a1b2c3d4e5f60718', channel: 'apk_android', platform: 'app-android', isAndroid: false, model: 'samsung SM-F956B android 15' });
  });

  it('resuelve una sola vez por carga', async () => {
    let calls = 0;
    const identity = new BrowserDeviceIdentity(env({ randomUUID: () => `0000000${(calls += 1)}-aaaa` }));
    expect((await identity.get()).id).toBe((await identity.get()).id);
    expect(calls).toBe(1);
  });
});
