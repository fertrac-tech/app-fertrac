import { LocalConsentStore } from './localConsentStore';

describe('LocalConsentStore', () => {
  beforeEach(() => window.localStorage.clear());

  it('guarda y lee la decisión', () => {
    const store = new LocalConsentStore('k');
    store.save({ analytics: true, version: 1, decidedAt: 5 });
    expect(store.load()).toEqual({ analytics: true, version: 1, decidedAt: 5 });
  });

  it('sin dato o con JSON dañado devuelve null', () => {
    expect(new LocalConsentStore('vacio').load()).toBeNull();
    window.localStorage.setItem('roto', '{no-json');
    expect(new LocalConsentStore('roto').load()).toBeNull();
  });

  it('sin almacenamiento disponible no falla', () => {
    const store = new LocalConsentStore('k', null);
    expect(() => store.save({ analytics: false, version: 1, decidedAt: 1 })).not.toThrow();
    expect(store.load()).toBeNull();
  });
});
