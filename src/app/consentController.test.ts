import { describe, expect, it, vi } from 'vitest';
import { MemoryAnalytics } from '@/adapters/analytics/memoryAnalytics';
import { CONSENT_VERSION } from '@/domain/consent';
import type { ConsentStore } from '@/ports';
import { ConsentController } from './consentController';

function memoryStore(initial: unknown = null) {
  let value = initial;
  const store: ConsentStore = { load: () => value, save: vi.fn((d) => void (value = d)) };
  return store;
}

describe('ConsentController', () => {
  it('sin decisión guardada queda pendiente (el aviso se muestra)', () => {
    const c = new ConsentController(memoryStore(), new MemoryAnalytics());
    expect(c.getState()).toEqual({ status: 'pending' });
  });

  it('respeta la decisión guardada de la versión vigente', () => {
    const saved = { analytics: false, version: CONSENT_VERSION, decidedAt: 1 };
    const c = new ConsentController(memoryStore(saved), new MemoryAnalytics());
    expect(c.getState()).toEqual({ status: 'decided', decision: saved });
  });

  it('una decisión de otra versión del aviso vuelve a preguntar', () => {
    const c = new ConsentController(memoryStore({ analytics: true, version: CONSENT_VERSION - 1, decidedAt: 1 }), new MemoryAnalytics());
    expect(c.getState()).toEqual({ status: 'pending' });
  });

  it('decidir guarda con fecha, aplica Consent Mode y notifica a la UI', () => {
    const store = memoryStore();
    const analytics = new MemoryAnalytics();
    const c = new ConsentController(store, analytics, () => 1700);
    const listener = vi.fn();
    c.subscribe(listener);

    c.decide(true);
    c.decide(false);

    expect(store.save).toHaveBeenLastCalledWith({ analytics: false, version: CONSENT_VERSION, decidedAt: 1700 });
    expect(analytics.records).toEqual([
      { kind: 'consent', granted: true },
      { kind: 'consent', granted: false },
    ]);
    expect(c.getState()).toEqual({ status: 'decided', decision: { analytics: false, version: CONSENT_VERSION, decidedAt: 1700 } });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
