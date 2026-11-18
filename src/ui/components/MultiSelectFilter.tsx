import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { normalize } from '@/domain/text';
import { Icon } from './primitives';

export interface MultiSelectFilterProps {
  /** Nombre del filtro ("Marca"). */
  label: string;
  /** Texto cuando no hay selección ("Todas"). */
  all: string;
  /** Texto para varias selecciones ("seleccionadas"). */
  plural: string;
  options: readonly string[];
  selected: readonly string[];
  onChange: (values: string[]) => void;
  optionLabel?: (value: string) => string;
}

/**
 * Filtro de selección múltiple con búsqueda: se escribe para acotar las opciones
 * (sin tildes ni mayúsculas) y se marcan/desmarcan varias sin cerrar el panel.
 * Teclado: ↑/↓ recorre, Enter marca, Esc cierra.
 */
export function MultiSelectFilter({ label, all, plural, options, selected, onChange, optionLabel = (v) => v }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [offset, setOffset] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const listId = `${id}-list`;

  const chosen = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => {
    const tokens = normalize(query).split(' ').filter(Boolean);
    const matches = options.filter((o) => {
      const text = normalize(`${o} ${optionLabel(o)}`);
      return tokens.every((t) => text.includes(t));
    });
    // Sin texto, lo ya marcado va primero para verlo de un vistazo.
    return tokens.length ? matches : [...matches.filter((o) => chosen.has(o)), ...matches.filter((o) => !chosen.has(o))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query, open]);

  useEffect(() => setActive(0), [query]);

  // Cerrar al tocar fuera.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  // El panel se desplaza en horizontal lo justo para quedar siempre dentro de la pantalla (margen de 16 px).
  useLayoutEffect(() => {
    if (!open) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const margin = 16;
      const width = Math.min(300, window.innerWidth - margin * 2);
      const overflowRight = rect.left + width - (window.innerWidth - margin);
      setOffset(-Math.max(0, Math.min(overflowRight, rect.left - margin)));
    }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const toggle = (value: string) => {
    onChange(chosen.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    setQuery('');
    inputRef.current?.focus();
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const value = visible[active];
      if (value !== undefined) toggle(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const count = selected.length;
  const first = selected[0];
  const summary = count === 0 ? all : count === 1 && first !== undefined ? optionLabel(first) : `${count} ${plural}`;
  const text = count === 0 ? label : count === 1 ? summary : `${label} · ${count}`;

  return (
    <div className="filter" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`chip ${count ? 'chip--active' : ''}`}
        aria-label={`${label}: ${summary}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate" style={{ maxWidth: 160 }}>{text}</span>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div className="filter__pop" style={{ left: offset }}>
          <label className="filter__search">
            <Icon name="search" size={16} />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label={`Buscar en ${label}`}
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={visible.length ? `${id}-opt-${active}` : undefined}
              placeholder={`Escribe para buscar ${label.toLowerCase()}…`}
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </label>
          <ul ref={listRef} id={listId} role="listbox" aria-label={label} aria-multiselectable="true" className="filter__list">
            {visible.map((value, index) => {
              const isOn = chosen.has(value);
              return (
                <li
                  key={value}
                  id={`${id}-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isOn}
                  className={`filter__opt ${index === active ? 'filter__opt--active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => toggle(value)}
                >
                  <span className={`filter__box ${isOn ? 'filter__box--on' : ''}`} aria-hidden="true">
                    {isOn && <Icon name="check" size={12} />}
                  </span>
                  <span className="truncate">{optionLabel(value)}</span>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && <p className="filter__empty">Sin coincidencias</p>}
          {count > 0 && (
            <div className="filter__foot">
              <span>{count === 1 ? `1 ${plural.replace(/s$/, '')}` : `${count} ${plural}`}</span>
              <button type="button" className="filter__reset" onClick={() => onChange([])}>
                Quitar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
