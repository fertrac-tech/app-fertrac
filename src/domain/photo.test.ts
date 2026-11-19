import { describe, expect, it } from 'vitest';
import { downloadUrl, withThumbSize } from './photo';

describe('withThumbSize', () => {
  it('cambia el tamaño de una miniatura de Drive', () => {
    expect(withThumbSize('https://drive.google.com/thumbnail?id=abc&sz=w200', 800)).toBe('https://drive.google.com/thumbnail?id=abc&sz=w800');
  });
  it('deja intactas otras URLs', () => {
    expect(withThumbSize('https://cdn.fertrac.com/a.jpg', 800)).toBe('https://cdn.fertrac.com/a.jpg');
  });
});

describe('downloadUrl', () => {
  it('convierte la miniatura de Drive en la URL de lh3 (con CORS) y conserva el tamaño', () => {
    expect(downloadUrl('https://drive.google.com/thumbnail?id=abc_-1&sz=w800')).toBe('https://lh3.googleusercontent.com/d/abc_-1=w800');
  });
  it('usa w800 si la miniatura no trae tamaño', () => {
    expect(downloadUrl('https://drive.google.com/thumbnail?id=abc')).toBe('https://lh3.googleusercontent.com/d/abc=w800');
  });
  it('deja intactas otras URLs', () => {
    expect(downloadUrl('https://cdn.fertrac.com/a.jpg')).toBe('https://cdn.fertrac.com/a.jpg');
  });
});
