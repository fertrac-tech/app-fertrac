import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom no implementa matchMedia; por defecto simulamos un viewport compacto.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
window.scrollTo = () => {};
Element.prototype.scrollTo = () => {};

// Las pruebas nunca salen a la red: cualquier fetch no simulado falla de inmediato.
// Sin esto, componentes como ProductDetail (que precarga la foto al abrir) hacen
// peticiones reales a Drive y el resultado depende de la latencia del runner.
globalThis.fetch = (() => Promise.reject(new TypeError('Red deshabilitada en pruebas'))) as typeof fetch;
