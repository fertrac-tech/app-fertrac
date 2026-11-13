import { createStore, get, set, type UseStore } from 'idb-keyval';
import type { Channel, DeviceIdentity, DeviceInfo } from '@/ports';

/**
 * Identidad del dispositivo para la lista blanca. Mantiene EXACTAMENTE las claves y el
 * formato de la v10 (`fertrac_device_id` en localStorage + IndexedDB `fertrac_device/kv`),
 * de modo que un dispositivo ya aprobado sigue aprobado al pasar a la v2 en el mismo origen.
 *
 *   APK (Capacitor): "and-" + ANDROID_ID del plugin Device · Navegador/PWA: "web-" + UUID.
 * No se recolecta MAC, IMEI, teléfono ni ubicación.
 */
export const DEVICE_STORAGE_KEY = 'fertrac_device_id';
const VALID_ID = /^(and|web)-[A-Za-z0-9_-]{8,80}$/;

interface CapacitorDevicePlugin {
  getId?: () => Promise<{ identifier?: string; uuid?: string }>;
  getInfo?: () => Promise<{ manufacturer?: string; model?: string; operatingSystem?: string; osVersion?: string }>;
}
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { Device?: CapacitorDevicePlugin };
}

export interface BrowserEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  capacitor?: CapacitorGlobal;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  randomUUID: () => string;
  idb?: UseStore | null;
}

export function currentEnvironment(): BrowserEnvironment {
  const nav = window.navigator;
  let idb: UseStore | null = null;
  try {
    idb = createStore('fertrac_device', 'kv');
  } catch {
    idb = null;
  }
  return {
    userAgent: nav.userAgent || '',
    maxTouchPoints: nav.maxTouchPoints || 0,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((nav as Navigator & { standalone?: boolean }).standalone),
    capacitor: (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor,
    storage: window.localStorage,
    randomUUID: () => crypto.randomUUID(),
    idb,
  };
}

const withTimeout = <T>(promise: Promise<T>, ms = 1500): Promise<T | null> =>
  Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

export class BrowserDeviceIdentity implements DeviceIdentity {
  private cached: Promise<DeviceInfo> | null = null;

  constructor(private readonly env: BrowserEnvironment = currentEnvironment()) {}

  get(): Promise<DeviceInfo> {
    this.cached ??= this.resolve().catch((error) => {
      this.cached = null;
      throw error;
    });
    return this.cached;
  }

  private get isNative(): boolean {
    return Boolean(this.env.capacitor?.isNativePlatform?.());
  }

  private async resolve(): Promise<DeviceInfo> {
    const ua = this.env.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const uaAndroid = /android/.test(ua);
    const os = isIOS ? 'ios' : uaAndroid ? 'android' : this.isNative ? 'other' : 'desktop';
    const channel: Channel = this.isNative ? 'apk_android' : this.env.standalone ? 'pwa_instalada' : 'navegador';
    const prefix = this.isNative ? 'app' : this.env.standalone ? 'pwa' : 'web';
    const platform = `${prefix}-${!this.isNative && this.env.standalone && os === 'desktop' ? 'other' : os}`;
    // "Ver como computador" en Chrome Android cambia el user-agent pero conserva la pantalla táctil.
    const looksLikeAndroidDesktopMode =
      /Linux/.test(this.env.userAgent) && !/CrOS/.test(this.env.userAgent) && this.env.maxTouchPoints > 1;

    return {
      id: await this.resolveId(),
      channel,
      platform,
      model: (await this.model()).slice(0, 80),
      isAndroid: !this.isNative && (uaAndroid || looksLikeAndroidDesktopMode),
    };
  }

  private async resolveId(): Promise<string> {
    const prefix = this.isNative ? 'and-' : 'web-';
    const own = (id: string | null | undefined): id is string => !!id && VALID_ID.test(id) && id.startsWith(prefix);

    // 1) APK con plugin: ANDROID_ID (estable, sobrevive a "Borrar datos").
    const plugin = this.isNative ? this.env.capacitor?.Plugins?.Device : undefined;
    if (plugin?.getId) {
      const result = await withTimeout(plugin.getId());
      const raw = String(result?.identifier || result?.uuid || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (raw.length >= 8) return this.persist(`and-${raw.slice(0, 80)}`);
    }
    // 2) Persistido (localStorage → IndexedDB), restaurando la copia faltante.
    const fromStorage = this.readStorage();
    if (own(fromStorage)) return this.persist(fromStorage);
    const fromIdb = this.env.idb ? await withTimeout(get<string>(DEVICE_STORAGE_KEY, this.env.idb)) : null;
    if (own(fromIdb)) return this.persist(fromIdb);
    // 3) Nuevo.
    return this.persist(prefix + this.env.randomUUID());
  }

  private readStorage(): string | null {
    try {
      return this.env.storage.getItem(DEVICE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private async persist(id: string): Promise<string> {
    try {
      this.env.storage.setItem(DEVICE_STORAGE_KEY, id);
    } catch {
      /* almacenamiento bloqueado: se intenta con IndexedDB */
    }
    if (this.env.idb) await withTimeout(set(DEVICE_STORAGE_KEY, id, this.env.idb));
    return id;
  }

  private async model(): Promise<string> {
    const plugin = this.isNative ? this.env.capacitor?.Plugins?.Device : undefined;
    if (plugin?.getInfo) {
      const info = await withTimeout(plugin.getInfo());
      if (info) return [info.manufacturer, info.model, info.operatingSystem, info.osVersion].filter(Boolean).join(' ');
    }
    const ua = this.env.userAgent;
    const os = ua.match(/Windows NT [\d.]+|Android [\d.]+|iPhone OS [\d_]+|iPad|Mac OS X [\d_]+|CrOS|Linux/)?.[0] ?? '?';
    const browser = ua.match(/Edg\/\d+|OPR\/\d+|SamsungBrowser\/\d+|Chrome\/\d+|Firefox\/\d+|Version\/\d+.*Safari/)?.[0] ?? '?';
    return `${os} · ${browser}`.replace(/_/g, '.');
  }
}
