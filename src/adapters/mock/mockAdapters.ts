import { isAccessCode, type AccessCode } from '@/domain/access';
import type { Product } from '@/domain/product';
import { AccessDeniedError, type AuthProvider, type CatalogSource, type DeviceIdentity, type Session } from '@/ports';
import { buildMockCatalog } from './mockCatalog';

/**
 * Adaptadores de demostración: permiten ejecutar y probar toda la app sin Google ni backend.
 * El estado de seguridad se simula con `?acceso=<código>` en la URL (p. ej.
 * `?acceso=dispositivo_pendiente`), o `?acceso=ok` para volver al flujo normal.
 */
const MOCK_ACCESS_KEY = 'fertrac_mock_access';
const MOCK_SESSION_KEY = 'fertrac_mock_session';

export function readMockAccess(search = window.location.search, storage: Storage = window.sessionStorage): AccessCode {
  const fromUrl = new URLSearchParams(search).get('acceso');
  if (isAccessCode(fromUrl)) storage.setItem(MOCK_ACCESS_KEY, fromUrl);
  const stored = storage.getItem(MOCK_ACCESS_KEY);
  return isAccessCode(stored) ? stored : 'ok';
}

export class MockCatalogSource implements CatalogSource {
  constructor(
    private readonly accessCode: () => AccessCode = readMockAccess,
    private readonly delayMs = 350,
    private readonly size = 4732,
  ) {}

  async fetchAll(): Promise<Product[]> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const code = this.accessCode();
    if (code !== 'ok') throw new AccessDeniedError(code);
    return buildMockCatalog(this.size);
  }
}

const DEMO_SESSION: Session = {
  user: { email: 'usuario@fertrac.com', name: 'David Torres', picture: null },
  token: 'mock-token',
  expiresAt: Number.MAX_SAFE_INTEGER,
};

export class MockAuthProvider implements AuthProvider {
  constructor(private readonly storage: Storage = window.sessionStorage) {}

  async restore(): Promise<Session | null> {
    return this.storage.getItem(MOCK_SESSION_KEY) ? DEMO_SESSION : null;
  }
  async signIn(): Promise<Session> {
    this.storage.setItem(MOCK_SESSION_KEY, '1');
    return DEMO_SESSION;
  }
  async refresh(current: Session): Promise<Session | null> {
    return current;
  }
  async signOut(): Promise<void> {
    this.storage.removeItem(MOCK_SESSION_KEY);
  }
}

export class MockDeviceIdentity implements DeviceIdentity {
  async get() {
    return { id: 'web-demo-0000-0000-a3f9k2', channel: 'navegador' as const, platform: 'web-desktop', model: 'Demo', isAndroid: false };
  }
}
