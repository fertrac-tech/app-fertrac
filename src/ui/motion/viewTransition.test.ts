import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeWithTransform, fadeThrough, openWithTransform, shiftWithAxis } from './viewTransition';

type VT = (update: () => Promise<void> | void) => { finished: Promise<void> };
const doc = document as unknown as { startViewTransition?: VT };

afterEach(() => {
  delete doc.startViewTransition;
  document.body.innerHTML = '';
});

describe('Container transform (View Transitions)', () => {
  it('sin soporte del navegador aplica el cambio directo', () => {
    const update = vi.fn();
    openWithTransform(null, 'A1', update);
    closeWithTransform('A1', update);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('al abrir, la foto viaja de la miniatura al detalle y el panel se nombra inspector', async () => {
    document.body.innerHTML = '<div class="row" data-ref="A1"><span class="thumb"></span></div>';
    const row = document.querySelector<HTMLElement>('[data-ref="A1"]')!;
    const thumb = row.querySelector<HTMLElement>('.thumb')!;
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 60 } as DOMRect);
    let names: Record<string, string> = {};
    let kind: string | undefined;
    let done!: () => void;
    doc.startViewTransition = (cb) => {
      names.thumbAntes = thumb.style.viewTransitionName;
      kind = document.documentElement.dataset.vt;
      const finished = new Promise<void>((r) => (done = r));
      void Promise.resolve(cb()).then(() => {
        names = {
          ...names,
          thumbDespues: thumb.style.viewTransitionName,
          panel: document.querySelector<HTMLElement>('.detail')!.style.viewTransitionName,
          foto: document.querySelector<HTMLElement>('.detail__photo')!.style.viewTransitionName,
        };
        done();
      });
      return { finished };
    };
    const update = () => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<aside class="detail"><div class="detail__photo"></div><h2 class="detail__name">A1</h2></aside>',
      );
    };
    openWithTransform(null, 'A1', update);
    await new Promise((r) => setTimeout(r, 30));
    expect(kind).toBe('detalle-abre');
    expect(names).toEqual({ thumbAntes: 'foto', thumbDespues: '', panel: 'inspector', foto: 'foto' });
    expect(document.documentElement.dataset.vt).toBeUndefined();
    expect(document.querySelector<HTMLElement>('.detail')!.style.viewTransitionName).toBe('');
  });

  it('al cerrar sin detalle en pantalla aplica el cambio directo', () => {
    doc.startViewTransition = vi.fn();
    const update = vi.fn();
    closeWithTransform('A1', update);
    expect(update).toHaveBeenCalledOnce();
    expect(doc.startViewTransition).not.toHaveBeenCalled();
  });
});

describe('Navegación con dirección (Shared axis y Fade through)', () => {
  afterEach(() => delete document.documentElement.dataset.vt);

  it('sin soporte cambia de página y de pestaña directo', () => {
    const update = vi.fn();
    shiftWithAxis('next', update);
    fadeThrough(update, '/favoritos');
    expect(update).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.vt).toBeUndefined();
  });

  it('marca el tipo y la dirección durante la transición y lo limpia al terminar', async () => {
    let seen: string | undefined;
    let done!: () => void;
    doc.startViewTransition = (cb) => {
      seen = document.documentElement.dataset.vt;
      void Promise.resolve(cb());
      return { finished: new Promise<void>((r) => (done = r)) };
    };
    document.body.innerHTML = '<div data-ref="A1"></div>';
    shiftWithAxis('prev', () => (document.body.innerHTML = '<div data-ref="B2"></div>'));
    expect(seen).toBe('axis-prev');
    done();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.dataset.vt).toBeUndefined();
  });
});
