import { Ga4Analytics, GTAG_SRC } from './ga4Analytics';

type TestWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

/** Llamadas a gtag como arreglos (gtag.js recibe objetos `arguments`). */
const calls = (win: TestWindow) => (win.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));

function freshWindow(): TestWindow {
  const win = window as TestWindow;
  delete win.dataLayer;
  delete win.gtag;
  document.head.querySelectorAll(`script[src^="${GTAG_SRC}"]`).forEach((s) => s.remove());
  return win;
}

describe('Ga4Analytics', () => {
  it('carga gtag.js una sola vez y configura sin page_view automático', () => {
    const win = freshWindow();
    new Ga4Analytics({ measurementId: 'G-TR2YESSS1P', win });
    new Ga4Analytics({ measurementId: 'G-TR2YESSS1P', win }); // StrictMode crea el contenedor dos veces

    expect(document.head.querySelectorAll(`script[src="${GTAG_SRC}?id=G-TR2YESSS1P"]`)).toHaveLength(1);
    const config = calls(win).filter(([cmd]) => cmd === 'config');
    expect(config[0]?.[1]).toBe('G-TR2YESSS1P');
    expect(config[0]?.[2]).toMatchObject({ send_page_view: false });
    expect(calls(win).filter(([cmd]) => cmd === 'js')).toHaveLength(1);
    // gtag.js ignora arreglos: cada entrada debe ser un objeto `arguments`.
    expect(Array.isArray(win.dataLayer?.[0])).toBe(false);
  });

  it('envía page_view con la URL limpia de la pantalla, sin parámetros', () => {
    const win = freshWindow();
    window.history.pushState({}, '', '/favoritos?lista=abc&ref=123');
    const ga = new Ga4Analytics({ measurementId: 'G-TR2YESSS1P', basePath: '/', win });
    ga.screen('favoritos');

    const pageView = calls(win).find(([cmd, name]) => cmd === 'event' && name === 'page_view');
    expect(pageView?.[2]).toEqual({ page_location: `${window.location.origin}/favoritos`, page_title: 'Favoritos', pantalla: 'favoritos' });
    const set = calls(win).find(([cmd, params]) => cmd === 'set' && typeof params === 'object' && params && 'page_location' in params);
    expect(set?.[1]).toEqual({ page_location: `${window.location.origin}/favoritos`, page_title: 'Favoritos' });
  });

  it('respeta el basename de la app', () => {
    const win = freshWindow();
    const ga = new Ga4Analytics({ measurementId: 'G-TR2YESSS1P', basePath: '/app-fertrac/', win });
    ga.screen('catalogo');
    const pageView = calls(win).find(([cmd, name]) => cmd === 'event' && name === 'page_view');
    expect((pageView?.[2] as { page_location: string }).page_location).toBe(`${window.location.origin}/app-fertrac/`);
  });

  it('con consentimiento identifica con seudónimo y propiedades de usuario', () => {
    const win = freshWindow();
    const ga = new Ga4Analytics({ measurementId: 'G-TR2YESSS1P', win, analyticsConsent: true });
    ga.identify({ userId: 'abc123', properties: { canal: 'apk_android', vista: 'compact' } });
    expect(calls(win)).toContainEqual(['set', { user_id: 'abc123' }]);
    expect(calls(win)).toContainEqual(['set', 'user_properties', { canal: 'apk_android', vista: 'compact' }]);
  });

  it('Consent Mode: el estado por defecto (denegado sin decisión) va antes de config', () => {
    const win = freshWindow();
    new Ga4Analytics({ measurementId: 'G-TR2YESSS1P', win });
    const commands = calls(win).map(([cmd]) => cmd);
    expect(commands.indexOf('consent')).toBeLessThan(commands.indexOf('config'));
    expect(calls(win)[0]).toEqual([
      'consent',
      'default',
      { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' },
    ]);
  });

  it('sin consentimiento no envía user_id; al aceptar lo asocia y al revocar lo quita', () => {
    const win = freshWindow();
    const ga = new Ga4Analytics({ measurementId: 'G-TR2YESSS1P', win });
    ga.identify({ userId: 'abc123', properties: { canal: 'navegador' } });
    expect(calls(win)).not.toContainEqual(['set', { user_id: 'abc123' }]);

    ga.setConsent(true);
    ga.setConsent(true); // sin cambio: no repite
    expect(calls(win).filter(([cmd, type]) => cmd === 'consent' && type === 'update')).toEqual([['consent', 'update', { analytics_storage: 'granted' }]]);
    expect(calls(win)).toContainEqual(['set', { user_id: 'abc123' }]);

    ga.setConsent(false);
    expect(calls(win)).toContainEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    expect(calls(win).at(-1)).toEqual(['set', { user_id: null }]);
  });

  it('con consentimiento guardado arranca concedido', () => {
    const win = freshWindow();
    new Ga4Analytics({ measurementId: 'G-TR2YESSS1P', win, analyticsConsent: true });
    expect((calls(win)[0]?.[2] as Record<string, string>).analytics_storage).toBe('granted');
  });

  it('envía eventos con su nombre y parámetros', () => {
    const win = freshWindow();
    const ga = new Ga4Analytics({ measurementId: 'G-TR2YESSS1P', win });
    ga.track({ name: 'share', method: 'whatsapp', content_type: 'producto', item_id: '4089757' });
    expect(calls(win)).toContainEqual(['event', 'share', { method: 'whatsapp', content_type: 'producto', item_id: '4089757' }]);
  });
});
