import type { ConsentDecision } from '@/domain/consent';
import type { ConsentStore } from '@/ports';

/** Decisión de consentimiento en localStorage (por dispositivo y entorno). Sin almacenamiento, no recuerda. */
export class LocalConsentStore implements ConsentStore {
  constructor(
    private readonly key = 'fertrac_v2_consent',
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage(),
  ) {}

  load(): unknown {
    try {
      const raw = this.storage?.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  save(decision: ConsentDecision): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(decision));
    } catch {
      /* la decisión solo dura esta sesión */
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
