/**
 * Consentimiento de analítica de uso (aviso propio, reemplaza el banner externo de la v10).
 *
 * Reglas:
 * - Sin decisión, la analítica queda DENEGADA: GA4 solo recibe señales sin cookies y sin user_id.
 * - La decisión se guarda en el dispositivo con la versión del aviso. Si el texto cambia
 *   (nueva versión), se vuelve a preguntar.
 * - El usuario puede cambiar su decisión cuando quiera desde Perfil.
 */

/** Sube este número cuando cambie el texto del aviso o el uso de los datos: se vuelve a preguntar. */
export const CONSENT_VERSION = 1;

export interface ConsentDecision {
  analytics: boolean;
  version: number;
  /** Epoch ms de la decisión (trazabilidad ante una consulta de habeas data). */
  decidedAt: number;
}

export type ConsentState = { status: 'pending' } | { status: 'decided'; decision: ConsentDecision };

/** Valida lo guardado en el dispositivo; cualquier dato corrupto o de otra versión cuenta como sin decisión. */
export function parseConsent(raw: unknown, version = CONSENT_VERSION): ConsentDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const { analytics, version: saved, decidedAt } = raw as Record<string, unknown>;
  if (typeof analytics !== 'boolean' || saved !== version || typeof decidedAt !== 'number' || !Number.isFinite(decidedAt)) return null;
  return { analytics, version: saved, decidedAt };
}

export function consentState(decision: ConsentDecision | null): ConsentState {
  return decision ? { status: 'decided', decision } : { status: 'pending' };
}

/** ¿Se puede medir con cookies y user_id? Solo con aceptación expresa. */
export function analyticsGranted(state: ConsentState): boolean {
  return state.status === 'decided' && state.decision.analytics;
}
