import { SCREEN_PATH, SCREEN_TITLE, type AnalyticsEvent, type AnalyticsScreen } from '@/domain/analytics';
import type { Analytics, AnalyticsUser } from '@/ports';

type Gtag = (...args: unknown[]) => void;
type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };

export interface Ga4Options {
  measurementId: string;
  /** Base de la app (import.meta.env.BASE_URL): arma page_location limpio. */
  basePath?: string;
  /** Consentimiento de analítica guardado al arrancar. Sin decisión: false (denegado). */
  analyticsConsent?: boolean;
  win?: GtagWindow;
}

export const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js';

/**
 * Adaptador GA4 con gtag.js.
 * - Consent Mode v2: el estado por defecto se fija ANTES de `config`. Publicidad siempre denegada
 *   (la app no usa Ads); analítica según el aviso de privacidad propio.
 * - `send_page_view: false`: la app envía `page_view` solo al cambiar de pantalla (la medición
 *   mejorada por historial está apagada en GA4, así que filtros y ?ref= no inflan las vistas).
 * - `page_location` se fija sin parámetros para que ningún evento lleve la búsqueda en la URL.
 * - `user_id` (seudónimo) solo viaja con consentimiento; al revocarlo se envía null.
 * - La CSP del build debe permitir googletagmanager.com y google-analytics.com.
 */
export class Ga4Analytics implements Analytics {
  private readonly gtag: Gtag;
  private readonly win: GtagWindow;
  private readonly basePath: string;
  private granted: boolean;
  private userId: string | null = null;

  constructor(options: Ga4Options) {
    this.win = options.win ?? (window as GtagWindow);
    this.basePath = `/${(options.basePath ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(/\/{2,}/g, '/');
    this.granted = options.analyticsConsent ?? false;
    this.gtag = installGtag(this.win, options.measurementId, this.granted);
  }

  identify({ userId, properties }: AnalyticsUser): void {
    this.userId = userId;
    if (this.granted || userId === null) this.gtag('set', { user_id: userId });
    this.gtag('set', 'user_properties', properties);
  }

  setConsent(analyticsGranted: boolean): void {
    if (analyticsGranted === this.granted) return;
    this.granted = analyticsGranted;
    this.gtag('consent', 'update', { analytics_storage: analyticsGranted ? 'granted' : 'denied' });
    // Con consentimiento se asocia el seudónimo; al revocarlo se desasocia.
    if (analyticsGranted && this.userId) this.gtag('set', { user_id: this.userId });
    if (!analyticsGranted) this.gtag('set', { user_id: null });
  }

  screen(screen: AnalyticsScreen): void {
    const page_location = new URL(this.basePath + SCREEN_PATH[screen], this.win.location.origin).href;
    const page_title = SCREEN_TITLE[screen];
    // Los eventos posteriores (view_item, share…) heredan la pantalla limpia.
    this.gtag('set', { page_location, page_title });
    this.gtag('event', 'page_view', { page_location, page_title, pantalla: screen });
  }

  track({ name, ...params }: AnalyticsEvent): void {
    this.gtag('event', name, params);
  }
}

/** Instala gtag una sola vez por ventana (StrictMode y recargas en caliente crean el contenedor dos veces). */
function installGtag(win: GtagWindow, measurementId: string, analyticsGranted: boolean): Gtag {
  win.dataLayer = win.dataLayer ?? [];
  if (!win.gtag) {
    // gtag.js exige el objeto `arguments`, no un arreglo.
    win.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      win.dataLayer!.push(arguments);
    };
    // Consent Mode: el estado por defecto va antes de cualquier `config` o evento.
    win.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: analyticsGranted ? 'granted' : 'denied',
    });
    win.gtag('js', new Date());
  }
  win.gtag('config', measurementId, { send_page_view: false, page_location: win.location.origin + '/' });

  const doc = win.document;
  const src = `${GTAG_SRC}?id=${encodeURIComponent(measurementId)}`;
  if (!doc.querySelector(`script[src="${src}"]`)) {
    const script = doc.createElement('script');
    script.async = true;
    script.src = src;
    doc.head.appendChild(script);
  }
  return win.gtag;
}
