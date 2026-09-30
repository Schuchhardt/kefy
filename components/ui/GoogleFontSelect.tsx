'use client';

// ─── Selector de fuentes de Google (Brand Kit) ───────────────────────────────
//
// Un botón abre una lista con buscador. El buscador es un combobox de ARIA que
// controla la lista con `aria-activedescendant`: las flechas mueven la opción
// activa, Enter la elige (sin enviar el formulario), Escape cierra y devuelve
// el foco al botón, y salir con Tab la cierra. Antes solo se podía usar con el
// ratón y sus textos estaban en español fijo.
//
// La lista ocupa el ancho del campo (cabe en 360px) y su alto se limita al del
// viewport, para que el teclado del móvil no la tape entera.
//
// Dentro de <Field> recibe `id`, `aria-describedby`… para que la etiqueta
// nombre al botón: `<Field label="Fuente">{(p) => <GoogleFontSelect {...p} … />}</Field>`.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useParams } from 'next/navigation';
import { DEFAULT_BRAND_FONT, GOOGLE_FONT_OPTIONS, type GoogleFontOption } from '@/lib/google-fonts';
import Icon from '@/components/ui/icons';
import { toLocale } from '@/lib/i18n';
import esT from '@/locales/es/dashboard/brand';
import enT from '@/locales/en/dashboard/brand';
import styles from './GoogleFontSelect.module.css';

export type { GoogleFontOption } from '@/lib/google-fonts';
export { GOOGLE_FONT_OPTIONS } from '@/lib/google-fonts';

const FONT_LINK_ID = 'kefy-google-font-options';

function ensureGoogleFontsLoaded() {
  if (typeof document === 'undefined' || document.getElementById(FONT_LINK_ID)) return;

  const families = GOOGLE_FONT_OPTIONS
    .map((font) => `family=${encodeURIComponent(font.value).replace(/%20/g, '+')}:wght@400;500;600;700`)
    .join('&');

  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}

interface Props {
  value?: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  previewText?: string;
  /** Id del botón: lo pasa <Field> para que la etiqueta lo nombre. */
  id?: string;
  /** Idioma de los textos. Sin él, el de la ruta (`/[lang]/…`). */
  lang?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-required'?: boolean | 'true' | 'false';
}

/** Una fila de la lista: `font` null es «Sin fuente». */
interface Row {
  value: string | null;
  font: GoogleFontOption | null;
}

export default function GoogleFontSelect({
  value,
  onChange,
  placeholder,
  previewText,
  id,
  lang,
  disabled,
  ...aria
}: Props) {
  const params = useParams<{ lang?: string }>();
  const locale = toLocale(lang ?? params?.lang);
  const t = (locale === 'en' ? enT : esT).fontSelect;

  const uid = useId().replace(/:/g, '');
  const triggerId = id ?? `font-${uid}`;
  const valueId = `${triggerId}-value`;
  const listId = `${triggerId}-list`;
  const optionId = (i: number) => `${triggerId}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    ensureGoogleFontsLoaded();
  }, []);

  const selected = GOOGLE_FONT_OPTIONS.find((font) => font.value === value) ?? null;

  const rows = useMemo<Row[]>(() => {
    const normalized = query.trim().toLowerCase();
    const fonts = !normalized
      ? GOOGLE_FONT_OPTIONS
      : GOOGLE_FONT_OPTIONS.filter((font) =>
        `${font.value} ${font.category} ${font.preview}`.toLowerCase().includes(normalized));
    // «Sin fuente» solo sin búsqueda: no es un resultado.
    return [...(normalized ? [] : [{ value: null, font: null }]), ...fonts.map((font) => ({ value: font.value, font }))];
  }, [query]);
  const fontCount = rows.filter((r) => r.font).length;

  // Clic fuera: cierra.
  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery('');
    }
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open]);

  // Al abrir, el foco va al buscador.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // La opción activa siempre a la vista.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, rows]);

  function openList() {
    if (disabled) return;
    setQuery('');
    // Empieza en la elegida (fila 0 = «Sin fuente»).
    const index = GOOGLE_FONT_OPTIONS.findIndex((font) => font.value === value);
    setActive(index >= 0 ? index + 1 : 0);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    setQuery('');
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(row: Row | undefined) {
    if (!row) return;
    onChange(row.value);
    close(true);
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => Math.min(i + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case 'PageDown':
        e.preventDefault();
        setActive((i) => Math.min(i + 5, rows.length - 1));
        break;
      case 'PageUp':
        e.preventDefault();
        setActive((i) => Math.max(i - 5, 0));
        break;
      case 'Enter':
        // Nunca envía el formulario que lo contiene.
        e.preventDefault();
        choose(rows[active]);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  }

  const triggerName = selected?.value ?? (value || placeholder || t.placeholder);
  const triggerSub = selected
    ? (previewText || t.sample)
    : value ? t.notInCatalog(DEFAULT_BRAND_FONT) : t.source;
  const describedBy = [aria['aria-describedby'], valueId].filter(Boolean).join(' ');
  const activeRow = rows[active];

  return (
    <div
      ref={rootRef}
      className={styles.root}
      onBlur={(e) => {
        // El foco salió del componente (Tab, clic en otro campo): se cierra.
        if (open && !rootRef.current?.contains(e.relatedTarget as Node | null)) close(false);
      }}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-describedby={describedBy}
        // Un botón no admite aria-invalid/aria-required: el error llega por
        // aria-describedby (lo pone <Field>) y el borde rojo por este atributo.
        data-invalid={aria['aria-invalid'] === true || aria['aria-invalid'] === 'true' || undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span id={valueId} className={styles.triggerText}>
          <span className={styles.triggerName} style={{ fontFamily: selected?.family ?? 'inherit' }}>
            {triggerName}
          </span>
          <span className={styles.triggerSub} style={{ fontFamily: selected?.family ?? 'inherit' }}>
            {triggerSub}
          </span>
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} className={styles.chevron} />
      </button>

      {open && (
        <div className={styles.popup}>
          <input
            ref={searchRef}
            type="search"
            className="ui-input"
            role="combobox"
            aria-label={t.searchLabel}
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeRow ? optionId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder={t.search}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onSearchKeyDown}
          />

          <ul ref={listRef} id={listId} role="listbox" aria-label={t.listLabel} className={styles.list}>
            {rows.map((row, i) => {
              const isSelected = row.font ? selected?.value === row.value : !value;
              return (
                <li
                  key={row.value ?? '__none'}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  data-active={i === active}
                  className={styles.option}
                  // El foco se queda en el buscador: sin esto, el clic lo
                  // saca del componente y la lista se cerraría antes del click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(row)}
                >
                  <span className={styles.check} aria-hidden="true">
                    {isSelected && <Icon name="check" size={14} />}
                  </span>
                  {row.font ? (
                    <span className={styles.optionBody}>
                      <span className={styles.optionHead}>
                        <span className={styles.optionName} style={{ fontFamily: row.font.family }}>{row.font.value}</span>
                        <span className={styles.optionCategory}>{row.font.category}</span>
                      </span>
                      <span className={styles.optionPreview} style={{ fontFamily: row.font.family }}>
                        {/* Las frases del catálogo están en español. */}
                        {locale === 'es' ? row.font.preview : (previewText || t.sample)}
                      </span>
                    </span>
                  ) : (
                    <span className={styles.optionBody}>
                      <span className={styles.optionName}>{t.none}</span>
                      <span className={styles.optionPreview}>{t.noneHint(DEFAULT_BRAND_FONT)}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Visible solo cuando no hay resultados; si los hay, solo se anuncia cuántos. */}
          <p role="status" className={fontCount === 0 ? styles.empty : 'sr-only'}>
            {fontCount === 0 ? t.empty : t.results(fontCount)}
          </p>
        </div>
      )}
    </div>
  );
}
