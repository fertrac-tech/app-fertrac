import type { AnalyticsEvent, AnalyticsScreen } from '@/domain/analytics';
import type { Analytics, AnalyticsUser } from '@/ports';

export type AnalyticsRecord =
  | { kind: 'identify'; user: AnalyticsUser }
  | { kind: 'screen'; screen: AnalyticsScreen }
  | { kind: 'event'; event: AnalyticsEvent }
  | { kind: 'consent'; granted: boolean };

/** Analítica en memoria: demo, staging sin ID y pruebas. No sale nada del equipo. */
export class MemoryAnalytics implements Analytics {
  readonly records: AnalyticsRecord[] = [];

  identify(user: AnalyticsUser): void {
    this.records.push({ kind: 'identify', user });
  }

  screen(screen: AnalyticsScreen): void {
    this.records.push({ kind: 'screen', screen });
  }

  track(event: AnalyticsEvent): void {
    this.records.push({ kind: 'event', event });
  }

  setConsent(granted: boolean): void {
    this.records.push({ kind: 'consent', granted });
  }

  /** Eventos registrados, opcionalmente filtrados por nombre. */
  events<N extends AnalyticsEvent['name']>(name?: N): Extract<AnalyticsEvent, { name: N }>[] {
    return this.records
      .filter((r): r is Extract<AnalyticsRecord, { kind: 'event' }> => r.kind === 'event')
      .map((r) => r.event)
      .filter((e): e is Extract<AnalyticsEvent, { name: N }> => !name || e.name === name);
  }

  screens(): AnalyticsScreen[] {
    return this.records.flatMap((r) => (r.kind === 'screen' ? [r.screen] : []));
  }
}
