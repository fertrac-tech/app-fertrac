import { afterEach, describe, expect, it } from 'vitest';
import { focusSearch, hasOpenModal, isSearchShortcut } from './searchShortcut';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
});

describe('atajo Ctrl + B del buscador', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('reconoce Ctrl + B y ⌘ + B (mayúscula o minúscula)', () => {
    expect(isSearchShortcut(key('b', { ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key('B', { ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key('b', { metaKey: true }))).toBe(true);
  });

  it('ignora B sola, Ctrl + Shift + B, Ctrl + Alt + B y otras teclas', () => {
    expect(isSearchShortcut(key('b'))).toBe(false);
    expect(isSearchShortcut(key('b', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSearchShortcut(key('b', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSearchShortcut(key('f', { ctrlKey: true }))).toBe(false);
  });

  it('enfoca y selecciona el texto del buscador marcado', () => {
    document.body.innerHTML = '<input id="otro" /><input type="search" data-search-shortcut value="filtro" />';
    const search = document.querySelector<HTMLInputElement>('[data-search-shortcut]')!;
    expect(focusSearch()).toBe(true);
    expect(document.activeElement).toBe(search);
    expect(search.selectionStart).toBe(0);
    expect(search.selectionEnd).toBe('filtro'.length);
  });

  it('sin buscador en pantalla devuelve false', () => {
    document.body.innerHTML = '<input />';
    expect(focusSearch()).toBe(false);
  });

  it('detecta capas modales abiertas', () => {
    expect(hasOpenModal()).toBe(false);
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(hasOpenModal()).toBe(true);
  });
});
