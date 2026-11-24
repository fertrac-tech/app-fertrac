import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import './EngineLoader.css';

/**
 * EngineLoader — loader caricaturesco de un motor diésel 6 en línea.
 *
 * Dos modos, elegidos por la duración esperada de la carga (`expectedMs`):
 *   - completo (>= 3 s): toda la historia, ajustada para terminar en el tiempo esperado.
 *   - compacto (< 3 s): el motor ya está armado; arranca, acelera y repite en 2,4 s.
 *
 * Línea de tiempo del modo completo (base 24 s, escalable con `cycle`, mínimo 5 s):
 *   0–4 s   Ensamblaje: las piezas caen y rebotan en su lugar
 *   4–6 s   Arranque: tosidos, humo negro
 *   6–16 s  Ralentí → marcha: pistones, ventilador, turbo, humo gris
 *   16–21 s Aceleración: vibración, aguja al rojo, chispas
 *   21–24 s Las piezas salen volando y el ciclo reinicia
 *
 * Lo mecánico (giro, vibración, pistones, tacómetro) se calcula en un solo
 * requestAnimationFrame a partir de una curva de RPM; lo decorativo va en CSS.
 */
export interface EngineLoaderProps {
  /** Duración del ciclo completo en segundos (>= 5). Si llega `expectedMs`, se calcula sola. */
  cycle?: number;
  /** Duración esperada de la carga (ms): < 3000 activa el modo compacto; si no, ajusta el ciclo. */
  expectedMs?: number;
  /** 0–100: si llega, la barra refleja el progreso real. */
  progress?: number;
  /** Texto fijo que reemplaza los mensajes por fase. */
  label?: string;
  /** Overlay a pantalla completa. */
  fullscreen?: boolean;
  /** Fuerza el modo compacto (secuencia corta). Por defecto se decide con `expectedMs`. */
  compact?: boolean;
  /** Tamaño reducido (detalle / inspector). */
  small?: boolean;
  /** Clases extra para el contenedor (p. ej. `eng-loader--center`). */
  className?: string;
}

const BASE = 24;
const MIN_CYCLE = 5;
const MAX_CYCLE = 40;
/** Por debajo de este tiempo esperado se usa el modo compacto. */
export const COMPACT_THRESHOLD_MS = 3000;
/** Ciclo fijo del modo compacto (s). */
const QUICK_CYCLE = 2.4;

const PHASES = [
  { at: 0, text: 'Ensamblando el bloque…' },
  { at: 4, text: 'Dando arranque…' },
  { at: 6.5, text: 'Calentando el motor…' },
  { at: 11, text: 'Presurizando el turbo…' },
  { at: 16, text: '¡A plena potencia!' },
  { at: 21, text: 'Casi listo…' },
] as const;

const QUICK_PHASES = [
  { at: 0, text: 'Dando arranque…' },
  { at: 0.5, text: 'Cargando…' },
] as const;

type Part = 'pan' | 'block' | 'head' | 'cover' | 'stack' | 'turbo' | 'fan';
// Retardo (s, base 24) de caída de cada pieza
const DROP: Record<Part, number> = { pan: 0, block: 0.35, head: 0.7, cover: 1.05, stack: 1.4, turbo: 1.75, fan: 2.1 };

// Perfil de revoluciones normalizado (0 = apagado, 1 = ralentí, ~2.2 = máximo)
function rpmAt(t: number): number {
  if (t < 4) return 0;
  if (t < 6) return 0.35 * ((t - 4) / 2) + 0.3 * Math.abs(Math.sin(t * 9)); // tosidos
  if (t < 7) return 0.6 + 0.4 * (t - 6);
  if (t < 16) return 1;
  if (t < 19) return 1 + 1.2 * ((t - 16) / 3);
  if (t < 21) return 2.2;
  if (t < 23) return 2.2 * (1 - (t - 21) / 2);
  return 0;
}

// Modo compacto (2,4 s): tosido → ralentí → acelerón → baja, y repite.
function rpmQuick(t: number): number {
  if (t < 0.5) return 0.3 + 0.3 * Math.abs(Math.sin(t * 20));
  if (t < 1.2) return 1;
  if (t < 1.9) return 1 + 1.2 * ((t - 1.2) / 0.7);
  return 2.2 - 1.8 * ((t - 1.9) / 0.5);
}

/** Ciclo completo (s) para que la secuencia termine en el tiempo esperado. */
export function cycleFor(expectedMs: number): number {
  return Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, (expectedMs / 1000) * 1.05));
}

const PISTON_X = [136, 163, 190, 217, 244, 271];
const FIRING = [0, 4, 2, 5, 1, 3]; // orden de encendido 1-5-3-6-2-4
const STARS: ReadonlyArray<readonly [number, number]> = [[112, 52], [290, 40], [392, 222], [26, 214]];

export function EngineLoader({ cycle, expectedMs, progress, label, fullscreen = false, compact, small = false, className }: EngineLoaderProps) {
  const quick = compact ?? (typeof expectedMs === 'number' && expectedMs < COMPACT_THRESHOLD_MS);
  const fullCycle = typeof expectedMs === 'number' && cycle === undefined ? cycleFor(expectedMs) : Math.max(MIN_CYCLE, Number(cycle) || BASE);
  const dur = quick ? QUICK_CYCLE : fullCycle;
  const scale = dur / BASE;
  // El relleno de la barra en modo compacto dura lo esperado (llega al 92 % y espera).
  const fillMs = Math.max(600, expectedMs ?? COMPACT_THRESHOLD_MS);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = `eng-win-${uid}`;

  const engineRef = useRef<SVGGElement>(null);
  const fanRef = useRef<SVGGElement>(null);
  const turboRef = useRef<SVGGElement>(null);
  const needleRef = useRef<SVGLineElement>(null);
  const pistonRefs = useRef<(SVGGElement | null)[]>([]);
  const [phase, setPhase] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (reduced) return undefined;
    let raf = 0;
    const start = performance.now();
    let last = start;
    let fanA = 0, turboA = 0, crank = 0, turboW = 0, lastPhase = -1;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = ((now - start) / 1000) % dur;
      const t = quick ? elapsed : elapsed / scale; // compacto: segundos reales; completo: base 24 s
      const rpm = quick ? rpmQuick(t) : rpmAt(t);
      const phases = quick ? QUICK_PHASES : PHASES;
      const sec = now / 1000;

      turboW += (rpm * rpm - turboW) * Math.min(1, dt * 1.5); // el turbo "espera"
      fanA = (fanA + rpm * 900 * dt) % 360;
      turboA = (turboA + turboW * 1400 * dt) % 360;
      crank += rpm * 2 * Math.PI * 4 * dt;

      const amp = rpm > 0 ? 0.6 + rpm * 1.4 : 0;
      const vx = amp * 0.5 * Math.sin(sec * 2 * Math.PI * 21);
      const vy = amp * Math.sin(sec * 2 * Math.PI * 27);

      engineRef.current?.setAttribute('transform', `translate(${vx.toFixed(2)} ${vy.toFixed(2)})`);
      fanRef.current?.setAttribute('transform', `rotate(${fanA.toFixed(1)} 70 168)`);
      turboRef.current?.setAttribute('transform', `rotate(${turboA.toFixed(1)} 352 160)`);
      pistonRefs.current.forEach((p, i) => {
        const y = 7 * Math.sin(crank + ((FIRING[i] ?? 0) * Math.PI) / 3);
        p?.setAttribute('transform', `translate(0 ${y.toFixed(2)})`);
      });
      const jitter = rpm > 0 ? Math.sin(sec * 40) * 2 : 0;
      const needle = -120 + Math.min(rpm / 2.3, 1) * 240 + jitter;
      needleRef.current?.setAttribute('transform', `rotate(${needle.toFixed(1)} 58 66)`);

      let idx = 0;
      for (let i = 0; i < phases.length; i++) if (t >= phases[i]!.at) idx = i;
      if (idx !== lastPhase) {
        lastPhase = idx;
        setPhase(idx);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dur, scale, reduced, quick]);

  const drop = (k: Part): CSSProperties => ({ animationDelay: `${(DROP[k] * scale).toFixed(2)}s` });
  const hasProgress = typeof progress === 'number' && !Number.isNaN(progress);
  const pct = hasProgress ? Math.min(100, Math.max(0, progress)) : null;
  const message = label ?? (reduced ? 'Cargando…' : (quick ? QUICK_PHASES : PHASES)[phase]?.text ?? 'Cargando…');

  const classes = ['eng-loader'];
  if (fullscreen) classes.push('eng-loader--full');
  if (quick) classes.push('eng-loader--quick');
  if (small) classes.push('eng-loader--compact');
  if (reduced) classes.push('eng-loader--static');
  if (className) classes.push(className);

  return (
    <div className={classes.join(' ')} style={{ '--cycle': `${dur}s`, '--fill-dur': `${fillMs}ms` } as CSSProperties} role="status" aria-live="polite" aria-busy="true">
      <svg className="eng-svg" viewBox="0 0 420 290" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <rect x="128" y="158" width="164" height="46" rx="8" />
          </clipPath>
        </defs>

        {/* Tacómetro */}
        <g className="eng-tach">
          <circle cx="58" cy="66" r="32" className="o fill-white" />
          <path d="M 35.5 82 A 28 28 0 0 1 30.5 60" className="tach-green" />
          <path d="M 81.5 60 A 28 28 0 0 1 80.5 82" className="tach-red" />
          <line ref={needleRef} x1="58" y1="66" x2="58" y2="42" className="needle" transform="rotate(-120 58 66)" />
          <circle cx="58" cy="66" r="4" className="fill-ink" />
          <text x="58" y="88" className="tach-label">RPM</text>
        </g>

        <ellipse cx="215" cy="262" rx="150" ry="11" className="eng-shadow" style={drop('pan')} />

        <g ref={engineRef}>
          {/* Escape */}
          <g className="part" style={drop('stack')}>
            <rect x="341" y="44" width="22" height="100" rx="6" className="o fill-steel" />
            <rect x="336" y="36" width="32" height="12" rx="4" className="o fill-steel-dk" />
            <g className="smoke smoke--dark">
              {[0, 1, 2, 3].map((i) => <circle key={i} cx="352" cy="30" r="9" className="puff" style={{ animationDelay: `${i * 0.45}s` }} />)}
            </g>
            <g className="smoke smoke--light">
              {[0, 1, 2, 3].map((i) => <circle key={i} cx="352" cy="30" r="9" className="puff" style={{ animationDelay: `${i * 0.45}s` }} />)}
            </g>
          </g>

          {/* Turbo */}
          <g className="part" style={drop('turbo')}>
            <rect x="314" y="150" width="18" height="20" className="o fill-steel-dk" />
            <circle cx="352" cy="160" r="28" className="o fill-steel" />
            <circle cx="352" cy="160" r="16" className="o fill-steel-dk" />
            <g ref={turboRef}>
              {[0, 60, 120, 180, 240, 300].map((a) => (
                <path key={a} d="M352 160 Q360 152 352 145" className="blade" transform={`rotate(${a} 352 160)`} />
              ))}
            </g>
            <circle cx="352" cy="160" r="4" className="fill-ink" />
            <path d="M330 140 A30 30 0 0 1 345 133" className="shine" />
          </g>

          {/* Cárter */}
          <g className="part" style={drop('pan')}>
            <path d="M120 222 H310 L298 250 H132 Z" className="o fill-steel-dk" />
          </g>

          {/* Bloque */}
          <g className="part" style={drop('block')}>
            <rect x="100" y="140" width="220" height="86" rx="14" className="o fill-red" />
            <rect x="112" y="147" width="70" height="7" rx="3.5" className="fill-hi" />
            <rect x="128" y="158" width="164" height="46" rx="8" className="fill-window" />
            <g clipPath={`url(#${clipId})`}>
              {PISTON_X.map((x, i) => (
                <g
                  key={x}
                  ref={(el) => {
                    pistonRefs.current[i] = el;
                  }}
                >
                  <rect x={x + 7} y="180" width="4" height="30" className="fill-steel-dk" />
                  <rect x={x} y="164" width="18" height="22" rx="4" className="o3 fill-steel" />
                </g>
              ))}
            </g>
            <rect x="128" y="158" width="164" height="46" rx="8" className="o fill-none" />
            {[118, 302].map((x) => <circle key={x} cx={x} cy="214" r="4" className="fill-ink" />)}
          </g>

          {/* Culata */}
          <g className="part" style={drop('head')}>
            <rect x="108" y="110" width="204" height="34" rx="6" className="o fill-red-dk" />
            {[128, 160, 192, 224, 256, 288].map((x) => <circle key={x} cx={x} cy="127" r="4" className="fill-steel" />)}
          </g>

          {/* Tapa de válvulas con carita */}
          <g className="part" style={drop('cover')}>
            <rect x="116" y="70" width="188" height="44" rx="18" className="o fill-red" />
            <rect x="130" y="76" width="56" height="6" rx="3" className="fill-hi" />
            <g className="eyes">
              <ellipse cx="185" cy="92" rx="10" ry="12" className="o3 fill-white" />
              <ellipse cx="235" cy="92" rx="10" ry="12" className="o3 fill-white" />
              <circle cx="188" cy="94" r="5" className="fill-ink" />
              <circle cx="238" cy="94" r="5" className="fill-ink" />
            </g>
            <path d="M198 104 Q210 112 222 104" className="smile" />
          </g>

          {/* Ventilador */}
          <g className="part" style={drop('fan')}>
            <rect x="84" y="160" width="20" height="16" className="o fill-steel-dk" />
            <circle cx="70" cy="168" r="42" className="o shroud" />
            <g ref={fanRef}>
              {[0, 60, 120].map((a) => (
                <ellipse key={a} cx="70" cy="168" rx="7" ry="34" className="o3 fill-steel" transform={`rotate(${a} 70 168)`} />
              ))}
            </g>
            <circle cx="70" cy="168" r="9" className="o3 fill-red-dk" />
          </g>
        </g>

        {/* Chispas de potencia */}
        {STARS.map(([x, y], i) => (
          <path
            key={i}
            className="star"
            style={{ animationDelay: `${i * 0.25}s` }}
            d={`M${x} ${y - 10} L${x + 3} ${y - 3} L${x + 10} ${y} L${x + 3} ${y + 3} L${x} ${y + 10} L${x - 3} ${y + 3} L${x - 10} ${y} L${x - 3} ${y - 3} Z`}
          />
        ))}
      </svg>

      <p className="eng-msg">{message}</p>
      <div className="eng-bar" aria-hidden="true">
        <div className={`eng-bar__fill${hasProgress ? ' eng-bar__fill--real' : ''}`} style={hasProgress ? { width: `${pct}%` } : undefined} />
      </div>
    </div>
  );
}

/* ───────── Tiempo de carga medido en el dispositivo ───────── */

export type LoadKind = 'sesion' | 'catalogo' | 'favoritos' | 'detalle';

/**
 * Supuestos iniciales (ms) mientras el dispositivo no tenga mediciones propias:
 * - sesion: descarga completa del catálogo + fotos desde Apps Script (red).
 * - catalogo / favoritos / detalle: consultas al índice en memoria (casi instantáneas).
 */
export const DEFAULT_EXPECTED_MS: Record<LoadKind, number> = { sesion: 4000, catalogo: 800, favoritos: 800, detalle: 600 };

const TIMING_KEY = 'fertrac.loadTiming.v1';
const MIN_SAMPLE_MS = 50; // ignora montajes de ida y vuelta (StrictMode) y lecturas instantáneas
const EWMA_WEIGHT = 0.3; // peso de la medición nueva en el promedio móvil

type TimingStore = Partial<Record<LoadKind, { avg: number; n: number }>>;

function readStore(): TimingStore {
  try {
    return JSON.parse(localStorage.getItem(TIMING_KEY) ?? '{}') as TimingStore;
  } catch {
    return {};
  }
}

/** Promedio móvil (ms) de las cargas de este tipo en el dispositivo, o null si no hay datos. */
export function averageLoadMs(kind: LoadKind): number | null {
  const entry = readStore()[kind];
  return entry && Number.isFinite(entry.avg) ? entry.avg : null;
}

export function recordLoadMs(kind: LoadKind, ms: number): void {
  if (!(ms >= MIN_SAMPLE_MS)) return;
  try {
    const store = readStore();
    const prev = store[kind];
    store[kind] = prev ? { avg: prev.avg * (1 - EWMA_WEIGHT) + ms * EWMA_WEIGHT, n: prev.n + 1 } : { avg: ms, n: 1 };
    localStorage.setItem(TIMING_KEY, JSON.stringify(store));
  } catch {
    /* sin almacenamiento: se sigue con el supuesto */
  }
}

/** Tiempo antes de mostrar el loader: las cargas más rápidas no muestran nada (evita parpadeos). */
const SHOW_DELAY_MS = 300;

/**
 * Loader de la app: mide cuánto dura cada carga, aprende el promedio por tipo y elige el modo.
 * Promedio < 3 s → compacto; si no, la secuencia completa se ajusta a ese promedio.
 */
export function LoadingEngine({ kind, ...rest }: { kind: LoadKind } & Omit<EngineLoaderProps, 'expectedMs' | 'cycle'>) {
  const expectedMs = useMemo(() => averageLoadMs(kind) ?? DEFAULT_EXPECTED_MS[kind], [kind]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      recordLoadMs(kind, performance.now() - start);
    };
  }, [kind]);

  if (!visible) return <div className={rest.className} role="status" aria-busy="true" aria-label="Cargando" />;
  return <EngineLoader expectedMs={expectedMs} {...rest} />;
}

export default EngineLoader;
