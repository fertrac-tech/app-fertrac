/**
 * Atajo de teclado Ctrl + B (⌘ + B en macOS): lleva el foco al buscador de la pantalla actual.
 *
 * El buscador se marca con el atributo `data-search-shortcut`. Si la pantalla no tiene uno,
 * quien instala el atajo decide a dónde ir (en la app: al catálogo).
 */

export const SEARCH_SHORTCUT_ATTR = 'data-search-shortcut';
/** Valor para `aria-keyshortcuts` (lectores de pantalla). */
export const SEARCH_SHORTCUT_ARIA = 'Control+B Meta+B';

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Ctrl + B o ⌘ + B, sin Shift ni Alt (Ctrl + Shift + B queda libre para el navegador). */
export function isSearchShortcut(event: KeyLike): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'b';
}

/** Con una hoja u otra capa modal abierta el atajo no actúa: el foco debe quedarse en ella. */
export function hasOpenModal(root: ParentNode = document): boolean {
  return root.querySelector('[aria-modal="true"]') !== null;
}

/** Enfoca y selecciona el texto del buscador visible. Devuelve `false` si la pantalla no tiene buscador. */
export function focusSearch(root: ParentNode = document): boolean {
  const input = root.querySelector<HTMLInputElement>(`input[${SEARCH_SHORTCUT_ATTR}]`);
  if (!input || input.disabled) return false;
  input.focus();
  input.select();
  return true;
}
