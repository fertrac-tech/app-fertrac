/** Regla de negocio: 100 unidades por página. */
export const PAGE_SIZE = 100;

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Índice (base 0) del primer elemento de la página. */
  offset: number;
  /** Rango visible en base 1; ambos 0 cuando no hay resultados. */
  from: number;
  to: number;
}

export function paginate(total: number, requestedPage: number, pageSize = PAGE_SIZE): PageInfo {
  const safeTotal = Math.max(0, Math.floor(total));
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));
  const wanted = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const page = Math.min(Math.max(1, wanted), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    total: safeTotal,
    totalPages,
    offset,
    from: safeTotal === 0 ? 0 : offset + 1,
    to: Math.min(offset + pageSize, safeTotal),
  };
}

export type PageSlot = number | 'gap';

/** Botones del paginador: primera, última y vecinas de la actual, con "…" en los saltos. */
export function pageWindow(page: number, totalPages: number, siblings = 1): PageSlot[] {
  const wanted = new Set<number>([1, totalPages]);
  for (let p = page - siblings; p <= page + siblings; p += 1) {
    if (p >= 1 && p <= totalPages) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const slots: PageSlot[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (p - previous === 2) slots.push(previous + 1);
    else if (p - previous > 2) slots.push('gap');
    slots.push(p);
    previous = p;
  }
  return slots;
}
