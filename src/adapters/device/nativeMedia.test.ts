import { describe, expect, it, vi } from 'vitest';
import { nativeMedia, type CapacitorMediaGlobal } from './nativeMedia';

const blob = () => new Blob(['hola'], { type: 'image/jpeg' });

function capacitor(overrides: Partial<NonNullable<CapacitorMediaGlobal['Plugins']>> = {}): CapacitorMediaGlobal {
  return {
    isNativePlatform: () => true,
    Plugins: {
      Filesystem: { writeFile: vi.fn(async () => ({ uri: 'file:///cache/compartir/fertrac-A1.jpg' })) },
      Share: { share: vi.fn(async () => ({})) },
      Media: {
        getAlbums: vi.fn(async () => ({ albums: [{ name: 'Fertrac', identifier: '/storage/Pictures/Fertrac' }] })),
        createAlbum: vi.fn(async () => {}),
        savePhoto: vi.fn(async () => ({ filePath: '/storage/Pictures/Fertrac/fertrac-A1.jpg' })),
      },
      ...overrides,
    },
  };
}

describe('nativeMedia', () => {
  it('no aplica en la web', () => {
    expect(nativeMedia(undefined)).toBeNull();
    expect(nativeMedia({ isNativePlatform: () => false, Plugins: {} })).toBeNull();
  });

  it('APK: comparte la foto desde la caché con la hoja nativa de Android', async () => {
    const cap = capacitor();
    const media = nativeMedia(cap)!;
    const file = new File([blob()], 'fertrac-A1.jpg', { type: 'image/jpeg' });
    expect(await media.share(file, 'Precio: $ 1')).toBe('shared');
    expect(cap.Plugins!.Filesystem!.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'compartir/fertrac-A1.jpg', directory: 'CACHE', recursive: true, data: 'aG9sYQ==' }));
    expect(cap.Plugins!.Share!.share).toHaveBeenCalledWith(expect.objectContaining({ text: 'Precio: $ 1', files: ['file:///cache/compartir/fertrac-A1.jpg'] }));
  });

  it('APK: cerrar la hoja de compartir cuenta como cancelado', async () => {
    const cap = capacitor({ Share: { share: vi.fn(async () => { throw new Error('Share canceled'); }) } });
    expect(await nativeMedia(cap)!.share(null, 'texto')).toBe('cancelled');
  });

  it('APK: guarda la foto en el álbum "Fertrac" de la galería', async () => {
    const cap = capacitor();
    await nativeMedia(cap)!.savePhoto(blob(), 'fertrac-A1');
    expect(cap.Plugins!.Media!.savePhoto).toHaveBeenCalledWith({ path: 'data:image/jpeg;base64,aG9sYQ==', albumIdentifier: '/storage/Pictures/Fertrac', fileName: 'fertrac-A1' });
    expect(cap.Plugins!.Media!.createAlbum).not.toHaveBeenCalled();
  });

  it('APK: crea el álbum "Fertrac" la primera vez', async () => {
    const getAlbums = vi.fn()
      .mockResolvedValueOnce({ albums: [] })
      .mockResolvedValueOnce({ albums: [{ name: 'Fertrac', identifier: 'id-fertrac' }] });
    const cap = capacitor();
    cap.Plugins!.Media!.getAlbums = getAlbums;
    await nativeMedia(cap)!.savePhoto(blob(), 'x');
    expect(cap.Plugins!.Media!.createAlbum).toHaveBeenCalledWith({ name: 'Fertrac' });
    expect(cap.Plugins!.Media!.savePhoto).toHaveBeenCalledWith(expect.objectContaining({ albumIdentifier: 'id-fertrac' }));
  });

  it('APK sin los plugins instalados: no se usa (cae al flujo web)', () => {
    expect(nativeMedia({ isNativePlatform: () => true, Plugins: {} })).toBeNull();
  });
});
