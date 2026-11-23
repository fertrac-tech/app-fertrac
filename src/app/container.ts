import { Ga4Analytics } from '@/adapters/analytics/ga4Analytics';
import { MemoryAnalytics } from '@/adapters/analytics/memoryAnalytics';
import { AppsScriptCatalogSource } from '@/adapters/appsScript/catalogSource';
import { AppsScriptClient } from '@/adapters/appsScript/client';
import { SnapshotCatalogRepository } from '@/adapters/catalog/snapshotCatalogRepository';
import { BrowserDeviceIdentity } from '@/adapters/device/browserDeviceIdentity';
import { GoogleAuthProvider } from '@/adapters/google/googleAuthProvider';
import { MockAuthProvider, MockCatalogSource, MockDeviceIdentity } from '@/adapters/mock/mockAdapters';
import { IdbFavoritesRepository, IdbSnapshotStore } from '@/adapters/storage/idbStores';
import { LocalConsentStore } from '@/adapters/storage/localConsentStore';
import type { Analytics, AuthProvider, CatalogRepository, CatalogSource, DeviceIdentity } from '@/ports';
import type { AppConfig } from './config';
import { ConsentController } from './consentController';
import { FavoritesController } from './favoritesController';
import { SessionController } from './sessionController';

export interface Container {
  config: AppConfig;
  catalog: CatalogRepository;
  session: SessionController;
  favorites: FavoritesController;
  analytics: Analytics;
  consent: ConsentController;
}

/**
 * Raíz de composición: el ÚNICO lugar que sabe qué adaptador concreto se usa.
 * Migrar a la nube = registrar aquí un `CloudCatalogRepository` / `CloudFavoritesRepository`.
 */
export function createContainer(config: AppConfig): Container {
  // `session` se necesita dentro del cliente HTTP (token vigente) y se crea después.
  const holder: { session?: SessionController } = {};
  const getToken = () => holder.session?.getToken() ?? null;

  let auth: AuthProvider;
  let device: DeviceIdentity;
  let source: CatalogSource;

  if (config.dataSource === 'appsscript') {
    device = new BrowserDeviceIdentity();
    const client = new AppsScriptClient({
      baseUrl: config.appsScriptUrl,
      appVersion: config.version,
      device,
      getToken,
      onSessionRotated: (grant) => holder.session?.rotate(grant.token, grant.expiresAt),
    });
    auth = new GoogleAuthProvider({
      clientId: config.googleClientId,
      allowedDomain: config.allowedDomain,
      // SEC-01: el ID token de Google se canjea en el backend por un token de dispositivo firmado.
      exchange: (idToken, integrity) => client.createSession(idToken, integrity),
    });
    source = new AppsScriptCatalogSource(client);
  } else {
    device = new MockDeviceIdentity();
    auth = new MockAuthProvider();
    source = new MockCatalogSource();
  }

  // Cada entorno guarda su copia en una base distinta: demo y staging nunca pisan producción.
  const suffix = config.dataSource === 'mock' ? '_demo' : config.environmentLabel ? `_${config.environmentLabel.toLowerCase()}` : '';
  // SEC-05: la copia local del catálogo vence a las `offlineMaxHours` (24 h) sin sincronizar.
  const offlineMaxAgeMs = config.offlineMaxHours * 3_600_000;
  const catalog = new SnapshotCatalogRepository(source, new IdbSnapshotStore(`fertrac_v2_catalog${suffix}`), Date.now, offlineMaxAgeMs);
  const session = new SessionController(auth, catalog, device, { offlineMaxAgeMs });
  holder.session = session;
  // Aviso de privacidad propio: la decisión guardada fija el estado por defecto de Consent Mode.
  const consentStore = new LocalConsentStore(`fertrac_v2_consent${suffix}`);
  const savedConsent = ConsentController.initialDecision(consentStore);
  // GA4 solo con backend real y un ID válido; la demo nunca envía datos a Google.
  const analytics: Analytics =
    config.dataSource === 'appsscript' && config.ga4MeasurementId
      ? new Ga4Analytics({ measurementId: config.ga4MeasurementId, basePath: import.meta.env.BASE_URL, analyticsConsent: savedConsent?.analytics ?? false })
      : new MemoryAnalytics();
  const consent = new ConsentController(consentStore, analytics);
  const favorites = new FavoritesController(new IdbFavoritesRepository(`fertrac_v2_favorites${suffix}`), undefined, analytics);

  return { config, catalog, session, favorites, analytics, consent };
}
