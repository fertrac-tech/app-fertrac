import { SCREEN_PATH, SCREEN_TITLE, type AnalyticsEvent, type AnalyticsScreen } from '@/domain/analytics';
import type { Analytics, AnalyticsUser } from '@/ports';

type Gtag = (...args: unknown[]) => void;
type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };

export interface Ga4Options {
  measurementId: string;
  /** Base de la app (import.meta.env.BASE_URL): arma page_location limpio. */
  basePath?: string;
  win?: GtagWindow;
}

export const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js';

/**
 * Adaptador GA4 con gtag.js.
 * - `send_page_view: false`: la app envía `page_view` solo al cambiar de pantalla (la medición
 *   mejorada por historial está apagada en GA4, así que filtros y ?ref= no inflan las vistas).
 * - `page_location` se fija sin parámetros para que ningún evento lleve la búsqueda en la URL.
 * - La CSP del build debe permitir googletagmanager.com y google-analytics.com.
 */
export class Ga4Analytics implements Analytics {
  private readonly gtag: Gtag;
  private readonly win: GtagWindow;
  private readonly basePath: string;

  constructor(options: Ga4Options) {
    this.win = options.win ?? (window as GtagWindow);
    this.basePath = `/${(options.basePath ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(/\/{2,}/g, '/');
    this.gtag = installGtag(this.win, options.measurementId);
  }

  identify({ userId, properties }: AnalyticsUser): void {
    this.gtag('set', { user_id: userId });
    this.gtag('set', 'user_properties', properties);
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
function installGtag(win: GtagWindow, measurementId: string): Gtag {
  win.dataLayer = win.dataLayer ?? [];
  if (!win.gtag) {
    // gtag.js exige el objeto `arguments`, no un arreglo.
    win.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      win.dataLayer!.push(arguments);
    };
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
