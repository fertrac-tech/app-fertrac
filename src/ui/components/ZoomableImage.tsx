import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type SyntheticEvent } from 'react';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import './ZoomableImage.css';

/** Límites y pasos del zoom del visor (opción 2: diálogo con controles). */
/**
 * Límites y pasos del zoom del visor (opción 2: diálogo con controles).
 * `wheelStep`: la librería (con `smooth`) multiplica el paso por |deltaY| del evento. Un "clic" de
 * rueda de mouse trae deltaY ≈ 100, así que 0,0025 → +25 % por clic; el trackpad (deltaY 2–10)
 * avanza de forma continua. Con 0,15 un solo clic saltaba de 100 % a 400 %.
 */
export const ZOOM = { min: 1, max: 4, step: 0.5, doubleTap: 2.5, wheelStep: 0.0025, animMs: 200 } as const;

export const clampScale = (s: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, s));
export const toPercent = (s: number) => `${Math.round(s * 100)}%`;
export const isZoomed = (s: number) => s > ZOOM.min + 0.01;

type Size = { w: number; h: number };

/** Tamaño del marco: la foto completa ajustada al área disponible (como `object-fit: contain`). */
export function fitFrame(natural: Size, area: Size): Size | null {
  if (!natural.w || !natural.h || !area.w || !area.h) return null;
  const k = Math.min(area.w / natural.w, area.h / natural.h);
  return { w: Math.floor(natural.w * k), h: Math.floor(natural.h * k) };
}

interface Props {
  src: string;
  alt: string;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
  /** Avisa cada cambio de escala (p. ej. para el texto de ayuda de la ficha). */
  onScaleChange?: (scale: number) => void;
  /** Toque fuera del marco de la foto, sin zoom: el visor lo usa para cerrar. */
  onBackdropClick?: () => void;
}

/**
 * Foto ampliable con marco fijo (al estilo wheelzoom): el marco toma el tamaño de la foto
 * ajustada y no cambia; la imagen se acerca y se desplaza dentro de él.
 * Gestos: pellizcar, doble toque/clic (100 % ↔ 250 %), rueda, arrastrar; controles − / barra / + / 1:1.
 * El cierre (X, Escape, velo, "Atrás") sigue a cargo de `PhotoDialog`.
 */
export function ZoomableImage({ src, alt, onError, onScaleChange, onBackdropClick }: Props) {
  const api = useRef<ReactZoomPanPinchRef | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(ZOOM.min);
  const [natural, setNatural] = useState<Size>({ w: 0, h: 0 });
  const [frame, setFrame] = useState<Size | null>(null);

  // Recalcula el marco al cargar la foto y al cambiar el espacio (giro, plegable, ventana).
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const update = () => setFrame(fitFrame(natural, { w: el.clientWidth, h: el.clientHeight }));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natural]);

  // Si el marco cambia de tamaño, se vuelve a la vista completa para no quedar descentrado.
  useEffect(() => {
    void api.current?.resetTransform(0);
  }, [frame?.w, frame?.h]);

  const updateScale = (s: number) => {
    setScale(s);
    onScaleChange?.(s);
  };

  const zoomTo = useCallback((target: number, animate = true) => {
    const ref = api.current;
    if (!ref) return;
    const s = clampScale(target);
    const ms = animate ? ZOOM.animMs : 0;
    if (s === ZOOM.min) {
      void ref.resetTransform(ms);
      return;
    }
    // Acerca/aleja respecto al centro del marco para no perder lo que se está mirando.
    const box = ref.instance.wrapperComponent?.getBoundingClientRect();
    void ref.zoomToPoint(s, box ? box.left + box.width / 2 : 0, box ? box.top + box.height / 2 : 0, ms);
  }, []);

  const onAreaClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (isZoomed(scale) || target.closest('.zoomable__frame, .zoomable__toolbar')) return;
    onBackdropClick?.();
  };

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
    if (w && h) setNatural({ w, h });
  };

  return (
    <div className="zoomable">
      <div className="zoomable__area" ref={area} onClick={onAreaClick}>
        <div className="zoomable__frame" style={frame ? { width: frame.w, height: frame.h } : undefined}>
          <TransformWrapper
            ref={api}
            minScale={ZOOM.min}
            maxScale={ZOOM.max}
            limitToBounds
            doubleClick={{ mode: 'toggle', step: ZOOM.doubleTap - 1, animationTime: ZOOM.animMs }}
            wheel={{ step: ZOOM.wheelStep }}
            onTransform={(_, state) => updateScale(state.scale)}
          >
            <TransformComponent wrapperClass="zoomable__wrapper" contentClass="zoomable__content">
              <img
                className={`zoomable__img ${isZoomed(scale) ? 'zoomable__img--zoomed' : ''}`}
                src={src}
                alt={alt}
                referrerPolicy="no-referrer"
                draggable={false}
                onLoad={onLoad}
                onError={onError}
              />
            </TransformComponent>
          </TransformWrapper>
        </div>
      </div>

      <div className="zoomable__toolbar" role="group" aria-label="Controles de zoom">
        <button type="button" className="zoomable__btn" aria-label="Alejar" disabled={!isZoomed(scale)} onClick={() => zoomTo(scale - ZOOM.step)}>
          −
        </button>
        <input
          className="zoomable__range"
          type="range"
          min={ZOOM.min * 100}
          max={ZOOM.max * 100}
          step={10}
          value={Math.round(scale * 100)}
          aria-label="Nivel de zoom"
          aria-valuetext={toPercent(scale)}
          onChange={(e) => zoomTo(Number(e.target.value) / 100, false)}
        />
        <button type="button" className="zoomable__btn" aria-label="Acercar" disabled={scale >= ZOOM.max} onClick={() => zoomTo(scale + ZOOM.step)}>
          +
        </button>
        <output className="zoomable__pct" aria-live="polite">
          {toPercent(scale)}
        </output>
        <button
          type="button"
          className="zoomable__btn zoomable__btn--text"
          aria-label="Tamaño original"
          disabled={!isZoomed(scale)}
          onClick={() => zoomTo(ZOOM.min)}
        >
          1:1
        </button>
      </div>
    </div>
  );
}
