/**
 * Transiciones de la app con la API View Transitions del navegador.
 *
 * Detalle de producto (opción D):
 * - La foto viaja: la miniatura de la fila o tarjeta vuela hasta la foto del detalle y regresa al cerrar
 *   (Fluent 2 · Connected animation). Nada se estira ni se deforma.
 * - Fold y escritorio: el Inspector de vidrio entra y sale por el borde derecho (Apple HIG · Split views /
 *   inspector; Material 3 · Side sheet). Móvil: el detalle avanza en profundidad (Material 3 · Shared axis Z).
 * - Cambiar de producto con el detalle abierto: el panel se queda y su contenido hace Fade through.
 * Los nombres (`foto`, `inspector`) se asignan solo durante la transición, para que nunca haya dos elementos
 * con el mismo nombre. motion.css decide la coreografía según <html data-vt="detalle-…"> y el ancho.
 *
 * Sin soporte (WebView antiguo, Firefox < 144, pruebas) el cambio se aplica directo, sin animación.
 * Con "Reducir movimiento", motion.css deja solo el fundido.
 */

const PHOTO = 'foto';
const PANEL = 'inspector';
const DETAIL = '.detail';

type Doc = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> };
};

function supported(doc: Doc): boolean {
  return typeof doc.startViewTransition === 'function';
}

function setName(el: Element | null | undefined, name: string) {
  if (el instanceof HTMLElement) el.style.viewTransitionName = name;
}

/**
 * Espera a que el DOM refleje el cambio de ruta (React Router puede aplicarlo en el siguiente ciclo).
 * Usa setTimeout y no requestAnimationFrame: durante la transición el navegador pausa la pintura y rAF no corre.
 */
function waitFor(test: () => boolean, timeoutMs = 300): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (test() || performance.now() - start > timeoutMs) resolve();
      else setTimeout(tick, 16);
    };
    tick();
  });
}

/** Elemento de la lista (fila de tabla o tarjeta) que representa la referencia, si está a la vista. */
function itemFor(ref: string): Element | null {
  const el = document.querySelector(`[data-ref="${CSS.escape(ref)}"]`);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  // Animar hacia una fila fuera de pantalla desorienta: en ese caso la foto no viaja.
  return box.bottom > 0 && box.top < window.innerHeight ? el : null;
}

const thumbFor = (ref: string) => itemFor(ref)?.querySelector('.thumb') ?? null;
const panel = () => document.querySelector(DETAIL);
const panelPhoto = () => document.querySelector(`${DETAIL} .detail__photo`);
const showing = (ref: string) => document.querySelector(`${DETAIL} .detail__name`)?.textContent === ref;

type DetailKind = 'detalle-abre' | 'detalle-cierra' | 'detalle-cambia';

/** Ejecuta la transición marcando su tipo en <html> y limpia nombres y marca al terminar. */
function runDetail(kind: DetailKind, update: () => Promise<void>, cleanup: () => void): void {
  const doc = document as Doc;
  const root = document.documentElement;
  root.dataset.vt = kind;
  const transition = doc.startViewTransition!(update);
  transition.finished.finally(() => {
    cleanup();
    if (root.dataset.vt === kind) delete root.dataset.vt;
  });
}

/** Abre el detalle (o cambia de producto con el detalle abierto). `source` se conserva por compatibilidad. */
export function openWithTransform(_source: Element | null, ref: string, update: () => void): void {
  if (!supported(document as Doc)) return update();

  const open = panel();
  if (open) {
    // Cambio de producto: el panel no se mueve; su contenido hace Fade through.
    setName(open, PANEL);
    runDetail(
      'detalle-cambia',
      async () => {
        update();
        await waitFor(() => showing(ref));
        setName(panel(), PANEL);
      },
      () => setName(panel(), ''),
    );
    return;
  }

  const thumb = thumbFor(ref);
  setName(thumb, PHOTO);
  runDetail(
    'detalle-abre',
    async () => {
      setName(thumb, '');
      update();
      // Espera a que el detalle muestre el producto (o se agote el tiempo) para capturar el estado final.
      await waitFor(() => showing(ref));
      setName(panel(), PANEL);
      if (thumb) setName(panelPhoto(), PHOTO);
    },
    () => {
      setName(panel(), '');
      setName(panelPhoto(), '');
    },
  );
}

/** Cierra el detalle: el panel sale y la foto regresa a su fila o tarjeta (si está a la vista). */
export function closeWithTransform(ref: string | null, update: () => void): void {
  const open = panel();
  if (!supported(document as Doc) || !open) return update();

  const photoReturns = Boolean(ref && thumbFor(ref));
  setName(open, PANEL);
  if (photoReturns) setName(panelPhoto(), PHOTO);
  let target: Element | null = null;
  runDetail(
    'detalle-cierra',
    async () => {
      setName(open, '');
      setName(open.querySelector('.detail__photo'), '');
      update();
      await waitFor(() => !panel());
      if (photoReturns && ref) {
        target = thumbFor(ref);
        setName(target, PHOTO);
      }
    },
    () => setName(target, ''),
  );
}

/* ───────────── Opción 3: navegación con dirección (M3 Shared axis + Fade through) ───────────── */

/** Tipo de transición en curso; motion.css lo lee en <html data-vt="…">. */
export type TransitionKind = 'tabs' | 'axis-next' | 'axis-prev';

function run(kind: TransitionKind, update: () => void, ready: () => boolean): void {
  const doc = document as Doc;
  if (!supported(doc)) return update();
  const root = document.documentElement;
  root.dataset.vt = kind;
  const transition = doc.startViewTransition!(async () => {
    update();
    await waitFor(ready);
  });
  transition.finished.finally(() => {
    if (root.dataset.vt === kind) delete root.dataset.vt;
  });
}

const firstRef = () => document.querySelector('[data-ref]')?.getAttribute('data-ref') ?? null;

/**
 * Cambio de página del catálogo (Shared axis X): la lista sale hacia un lado y la nueva entra por el otro.
 * `direction` sigue el sentido de lectura: siguiente → entra por la derecha.
 */
export function shiftWithAxis(direction: 'next' | 'prev', update: () => void): void {
  const before = firstRef();
  run(direction === 'next' ? 'axis-next' : 'axis-prev', update, () => firstRef() !== before);
}

/** Cambio entre destinos principales (Catálogo, Favoritos, Perfil): Fade through. */
export function fadeThrough(update: () => void, pathname: string): void {
  run('tabs', update, () => window.location.pathname === pathname);
}
