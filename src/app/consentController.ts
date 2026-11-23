import { CONSENT_VERSION, consentState, parseConsent, type ConsentDecision, type ConsentState } from '@/domain/consent';
import type { Analytics, ConsentStore } from '@/ports';

type Listener = () => void;

/** Estado del aviso de privacidad: lee la decisión guardada, la persiste y la aplica a la analítica (Consent Mode). */
export class ConsentController {
  private state: ConsentState;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly store: ConsentStore,
    private readonly analytics: Pick<Analytics, 'setConsent'>,
    private readonly now: () => number = Date.now,
    private readonly version: number = CONSENT_VERSION,
  ) {
    this.state = consentState(parseConsent(store.load(), version));
  }

  /** Decisión guardada al arrancar (la usa el contenedor para el estado por defecto de GA4). */
  static initialDecision(store: ConsentStore, version = CONSENT_VERSION): ConsentDecision | null {
    return parseConsent(store.load(), version);
  }

  getState = (): ConsentState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Aceptar (true) o rechazar (false) la analítica. Se puede cambiar en cualquier momento desde Perfil. */
  decide = (analytics: boolean): void => {
    const decision: ConsentDecision = { analytics, version: this.version, decidedAt: this.now() };
    this.store.save(decision);
    this.analytics.setConsent(analytics);
    this.state = consentState(decision);
    this.listeners.forEach((listener) => listener());
  };
}
