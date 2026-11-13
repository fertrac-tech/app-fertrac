import { describe, expect, it } from 'vitest';
import { withThumbSize } from './photo';

describe('withThumbSize', () => {
  it('cambia el tamaño de una miniatura de Drive', () => {
    expect(withThumbSize('https://drive.google.com/thumbnail?id=abc&sz=w200', 800)).toBe('https://drive.google.com/thumbnail?id=abc&sz=w800');
  });
  it('deja intactas otras URLs', () => {
    expect(withThumbSize('https://cdn.fertrac.com/a.jpg', 800)).toBe('https://cdn.fertrac.com/a.jpg');
  });
});
