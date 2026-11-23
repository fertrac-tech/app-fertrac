/**
 * Analítica de uso: catálogo de eventos y reglas puras (sin GA4 ni navegador).
 *
 * Reglas de privacidad (Ley 1581 y políticas de Google Analytics):
 * - Nunca se envía el correo ni el nombre: el usuario viaja como un seudónimo (hash con sal).
 * - Las URL se envían sin parámetros (?q=, ?ref=, filtros): cada filtro no cuenta como "página".
 */
import type { Product } from './product';

/** Pantallas protegidas de la app; son las únicas "páginas" que se reportan. */
export type AnalyticsScreen = 'catalogo' | 'favoritos' | 'perfil';

export const SCREEN_TITLE: Record<AnalyticsScreen, string> = {
  catalogo: 'Catálogo',
  favoritos: 'Favoritos',
  perfil: 'Perfil',
};

export const SCREEN_PATH: Record<AnalyticsScreen, string> = {
  catalogo: '',
  favoritos: 'favoritos',
  perfil: 'perfil',
};

/** Ruta del enrutador (sin basename) → pantalla. Cualquier ruta desconocida redirige al catálogo. */
export function screenFromPath(pathname: string): AnalyticsScreen {
  const first = pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase() ?? '';
  if (first === 'favoritos') return 'favoritos';
  if (first === 'perfil') return 'perfil';
  return 'catalogo';
}

/** Producto en el formato `items` de GA4 (habilita el informe "Artículos más vistos"). */
export interface AnalyticsItem {
  item_id: string;
  item_name?: string;
  item_brand?: string;
  item_category?: string;
  item_category2?: string;
}

export function analyticsItem(product: Pick<Product, 'ref' | 'name' | 'brand' | 'category' | 'subcategory'>): AnalyticsItem {
  const item: AnalyticsItem = { item_id: product.ref };
  if (product.name) item.item_name = product.name;
  if (product.brand) item.item_brand = product.brand;
  if (product.category) item.item_category = product.category;
  if (product.subcategory) item.item_category2 = product.subcategory;
  return item;
}

export type ShareMethod = 'whatsapp' | 'copiar_texto' | 'descargar_foto';

/**
 * Eventos medidos. Los nombres en inglés son eventos recomendados de GA4 (traen informes listos);
 * los nombres en español son propios y sus parámetros se registran como dimensiones personalizadas.
 */
export type AnalyticsEvent =
  | { name: 'login'; method: 'google' }
  | { name: 'search'; search_term: string; resultados: number | null }
  | { name: 'view_item'; origen: AnalyticsScreen; items: [AnalyticsItem] }
  | { name: 'share'; method: ShareMethod; content_type: 'producto'; item_id: string }
  | { name: 'add_to_wishlist'; items: [AnalyticsItem] }
  | { name: 'filtro_aplicado'; filtro: string; valores: number }
  | { name: 'filtros_limpiados'; incluye_busqueda: boolean }
  | { name: 'paginar'; pagina: number }
  | { name: 'foto_ampliada'; item_id: string }
  | { name: 'favorito_quitado'; item_id: string }
  | { name: 'favorito_editado'; item_id: string; con_alias: boolean; listas: number }
  | { name: 'lista_creada' }
  | { name: 'sincronizar' };

/** Máximo de caracteres de un término de búsqueda (GA4 corta los parámetros a 100). */
export const MAX_SEARCH_TERM = 100;

export function normalizeSearchTerm(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es').slice(0, MAX_SEARCH_TERM);
}

/** ID de medición de GA4 (G-XXXXXXX). Cualquier otro valor deja la analítica apagada. */
export function isMeasurementId(value: string | undefined): value is string {
  return typeof value === 'string' && /^G-[A-Z0-9]{6,}$/.test(value.trim());
}

/** Sal fija de la app: evita que el seudónimo coincida con un hash "plano" del correo. */
export const USER_ID_SALT = 'fertrac-lista-precios|ga4|v1';

/**
 * Seudónimo estable del usuario para `user_id` de GA4: SHA-256(sal + correo normalizado), 32 hex.
 * Permite contar personas (no equipos) entre web y APK sin enviar el correo.
 */
export async function pseudonymousUserId(email: string, sha256Hex: (text: string) => Promise<string>): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return (await sha256Hex(`${USER_ID_SALT}|${normalized}`)).slice(0, 32);
}
