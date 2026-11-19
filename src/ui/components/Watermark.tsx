import { useId } from 'react';

/**
 * Marca de agua del catálogo: microtexto "Fertrac" en diagonal, repetido en patrón.
 * El tamaño (11 px) y el ángulo (−20°) hacen que la palabra quepa completa en una fila,
 * así que cualquier recorte de pantalla (p. ej. Sniping Tool) conserva la marca legible.
 * Color e intensidad salen de tokens.css (--watermark-color / --watermark-opacity).
 */
export const WATERMARK = { text: 'Fertrac', fontSize: 11, angle: -20 } as const;

export function Watermark() {
  const id = `wm-${useId().replace(/:/g, '')}`;
  const { text, fontSize: s, angle } = WATERMARK;
  const w = Math.round(s * 7.2);
  const h = Math.round(s * 2.4);
  return (
    <svg className="watermark" aria-hidden="true" focusable="false" data-testid="watermark">
      <defs>
        <pattern id={id} width={w} height={h} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
          <text x={2} y={Math.round(s * 1.05)} fontSize={s}>
            {text}
          </text>
          <text x={Math.round(w / 2) + 2} y={Math.round(s * 2.25)} fontSize={s}>
            {text}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
