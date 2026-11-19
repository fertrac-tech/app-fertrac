import { describe, expect, it, vi } from 'vitest';
import { makeProduct } from '@/domain/testing';
import { preparePhoto, shareOnWhatsApp, type ShareEnv } from './whatsappShare';

const product = makeProduct({ ref: 'AMK-2210', name: 'AMORTIGUADOR', photoUrl: 'https://drive.google.com/thumbnail?id=abc&sz=w200', prices: { gross: 412000, net5: 1, net8: 1, promo: null } });
const jpeg = () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as unknown as Response;

function env(overrides: Partial<ShareEnv> = {}): ShareEnv {
  return {
    fetch: vi.fn(async () => jpeg()),
    canShare: undefined,
    share: undefined,
    copyImage: undefined,
    open: vi.fn(),
    ...overrides,
  };
}

describe('shareOnWhatsApp', () => {
  it('móvil: comparte foto + texto con la hoja nativa (el usuario elige WhatsApp)', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    const e = env({ canShare: () => true, share });
    expect(await shareOnWhatsApp(product, null, e)).toEqual({ status: 'shared' });
    const data = share.mock.calls[0]![0];
    expect(data.files?.[0]?.name).toBe('fertrac-AMK-2210.jpg');
    expect(data.text).toContain('Precio: $ 412.000');
    expect(String((e.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toBe('https://lh3.googleusercontent.com/d/abc=w800');
    expect(e.open).not.toHaveBeenCalled();
  });

  it('si el usuario cierra la hoja nativa no es error ni abre WhatsApp', async () => {
    const e = env({ canShare: () => true, share: vi.fn(async () => { throw new DOMException('x', 'AbortError'); }) });
    expect(await shareOnWhatsApp(product, null, e)).toEqual({ status: 'cancelled' });
    expect(e.open).not.toHaveBeenCalled();
  });

  it('escritorio: copia la foto al portapapeles y abre WhatsApp con el texto', async () => {
    const copyImage = vi.fn(async () => {});
    const e = env({ copyImage });
    expect(await shareOnWhatsApp(product, null, e)).toEqual({ status: 'opened', photoCopied: true });
    expect(copyImage).toHaveBeenCalledOnce();
    expect(e.open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/\?text=\*AMORTIGUADOR\*/));
  });

  it('sin foto descargable igual abre WhatsApp con producto y precio', async () => {
    const e = env({ fetch: vi.fn(async () => { throw new TypeError('Failed to fetch'); }), canShare: () => true, share: vi.fn() });
    expect(await shareOnWhatsApp(product, null, e)).toEqual({ status: 'opened', photoCopied: false });
    expect(e.share).not.toHaveBeenCalled();
    expect(e.open).toHaveBeenCalledOnce();
  });

  it('producto sin foto: no intenta descargar', async () => {
    const e = env();
    await shareOnWhatsApp({ ...product, photoUrl: null }, null, e);
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('con la foto ya preparada comparte sin volver a descargar (conserva la activación del toque)', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    const e = env({ canShare: () => true, share });
    const file = new File(['x'], 'fertrac-AMK-2210.jpg', { type: 'image/jpeg' });
    expect(await shareOnWhatsApp(product, null, e, file)).toEqual({ status: 'shared' });
    expect(e.fetch).not.toHaveBeenCalled();
    expect(share.mock.calls[0]![0].files?.[0]).toBe(file);
  });
});

describe('shareOnWhatsApp en la APK', () => {
  it('usa la hoja nativa de Android con la foto aunque el WebView no tenga Web Share', async () => {
    const native = { share: vi.fn(async () => 'shared' as const) };
    const e = env({ native });
    const file = new File(['x'], 'fertrac-AMK-2210.jpg', { type: 'image/jpeg' });
    expect(await shareOnWhatsApp(product, null, e, file)).toEqual({ status: 'shared' });
    expect(native.share).toHaveBeenCalledWith(file, expect.stringContaining('Precio: $ 412.000'));
    expect(e.open).not.toHaveBeenCalled();
  });
  it('si el plugin falla, cae al enlace de WhatsApp', async () => {
    const e = env({ native: { share: vi.fn(async () => { throw new Error('boom'); }) } });
    expect(await shareOnWhatsApp(product, null, e, null)).toEqual({ status: 'opened', photoCopied: false });
    expect(e.open).toHaveBeenCalledOnce();
  });
});

describe('preparePhoto', () => {
  it('si w800 falla reintenta con el tamaño original', async () => {
    const fetch = vi.fn(async (url: string) => (url.endsWith('=w800') ? ({ ok: false } as Response) : jpeg()));
    const file = await preparePhoto(product, { fetch: fetch as unknown as typeof globalThis.fetch });
    expect(file?.name).toBe('fertrac-AMK-2210.jpg');
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['https://lh3.googleusercontent.com/d/abc=w800', 'https://lh3.googleusercontent.com/d/abc=w200']);
  });
});
