import { analyticsGranted, CONSENT_VERSION, consentState, parseConsent } from './consent';

describe('parseConsent', () => {
  it('acepta una decisión válida de la versión vigente', () => {
    expect(parseConsent({ analytics: true, version: CONSENT_VERSION, decidedAt: 1 })).toEqual({ analytics: true, version: CONSENT_VERSION, decidedAt: 1 });
  });

  it.each([
    ['nulo', null],
    ['texto', 'si'],
    ['sin analytics', { version: CONSENT_VERSION, decidedAt: 1 }],
    ['analytics no booleano', { analytics: 'true', version: CONSENT_VERSION, decidedAt: 1 }],
    ['otra versión del aviso', { analytics: true, version: CONSENT_VERSION + 1, decidedAt: 1 }],
    ['fecha inválida', { analytics: true, version: CONSENT_VERSION, decidedAt: Number.NaN }],
  ])('%s → sin decisión (se vuelve a preguntar)', (_, raw) => {
    expect(parseConsent(raw)).toBeNull();
  });
});

describe('analyticsGranted', () => {
  it('solo con aceptación expresa', () => {
    expect(analyticsGranted(consentState(null))).toBe(false);
    expect(analyticsGranted(consentState({ analytics: false, version: 1, decidedAt: 1 }))).toBe(false);
    expect(analyticsGranted(consentState({ analytics: true, version: 1, decidedAt: 1 }))).toBe(true);
  });
});
