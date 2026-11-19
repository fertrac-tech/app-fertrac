/**
 * Compartir y guardar fotos dentro de la APK (Capacitor carga https://app.fertrac.com en un WebView).
 * El WebView de Android no implementa `navigator.share` con archivos ni descargas `<a download>`
 * de blobs, así que ahí se usan los plugins nativos, expuestos en `window.Capacitor.Plugins`:
 * @capacitor/filesystem, @capacitor/share y @capacitor-community/media (instalados en app-android).
 */

interface FilesystemPlugin {
  writeFile(options: { path: string; data: string; directory: 'CACHE'; recursive?: boolean }): Promise<{ uri: string }>;
}
interface SharePlugin {
  share(options: { text?: string; files?: string[]; dialogTitle?: string }): Promise<unknown>;
}
interface MediaPlugin {
  getAlbums(): Promise<{ albums: Array<{ name: string; identifier: string }> }>;
  createAlbum(options: { name: string }): Promise<unknown>;
  savePhoto(options: { path: string; albumIdentifier: string; fileName?: string }): Promise<unknown>;
}

export interface CapacitorMediaGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { Filesystem?: FilesystemPlugin; Share?: SharePlugin; Media?: MediaPlugin };
}

export interface NativeMedia {
  /** Hoja nativa de Android con la foto (si hay) y el texto como pie. */
  share(file: File | null, text: string): Promise<'shared' | 'cancelled'>;
  /** Guarda la foto en la galería, álbum "Fertrac". */
  savePhoto(blob: Blob, fileName: string): Promise<void>;
}

const ALBUM = 'Fertrac';

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const isCancel = (error: unknown) => /cancel/i.test(error instanceof Error ? error.message : String(error));

/** null en la web o si la APK aún no tiene los plugins (se usa el flujo web). */
export function nativeMedia(
  capacitor: CapacitorMediaGlobal | undefined = typeof window !== 'undefined' ? (window as Window & { Capacitor?: CapacitorMediaGlobal }).Capacitor : undefined,
): NativeMedia | null {
  if (!capacitor?.isNativePlatform?.()) return null;
  const { Filesystem, Share, Media } = capacitor.Plugins ?? {};
  if (!Filesystem || !Share || !Media) return null;

  const albumId = async (): Promise<string> => {
    const find = async () => (await Media.getAlbums()).albums.find((a) => a.name === ALBUM)?.identifier;
    const existing = await find();
    if (existing) return existing;
    await Media.createAlbum({ name: ALBUM });
    const created = await find();
    if (!created) throw new Error('No se pudo crear el álbum Fertrac');
    return created;
  };

  return {
    async share(file, text) {
      try {
        const files: string[] = [];
        if (file) {
          const data = (await toDataUrl(file)).split(',')[1] ?? '';
          const { uri } = await Filesystem.writeFile({ path: `compartir/${file.name}`, data, directory: 'CACHE', recursive: true });
          files.push(uri);
        }
        await Share.share({ text, files: files.length ? files : undefined, dialogTitle: 'Compartir producto' });
        return 'shared';
      } catch (error) {
        if (isCancel(error)) return 'cancelled';
        throw error;
      }
    },
    async savePhoto(blob, fileName) {
      await Media.savePhoto({ path: await toDataUrl(blob), albumIdentifier: await albumId(), fileName });
    },
  };
}
