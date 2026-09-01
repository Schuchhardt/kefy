'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { GOOGLE_FONT_OPTIONS } from '@/lib/google-fonts';

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
}

export default function GoogleFontSelect({
  value,
  onChange,
  placeholder = 'Selecciona una fuente',
  previewText = 'Aa Bb Cc 123',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureGoogleFontsLoaded();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = GOOGLE_FONT_OPTIONS.find((font) => font.value === value) ?? null;
  const filteredFonts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return GOOGLE_FONT_OPTIONS;

    return GOOGLE_FONT_OPTIONS.filter((font) => {
      const haystack = `${font.value} ${font.category} ${font.preview}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query]);

  useEffect(() => {
    if (!open) return;
    searchInputRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (!next) setQuery('');
            return next;
          });
        }}
        style={{
          width: '100%',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 14px',
          color: 'var(--text)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 3,
              fontFamily: selected?.family ?? 'inherit',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {selected?.value ?? placeholder}
            </div>
            <div style={{
              fontSize: 12,
              color: 'var(--muted)',
              fontFamily: selected?.family ?? 'inherit',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {selected ? previewText : 'Google Fonts'}
            </div>
          </div>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          right: 0,
          zIndex: 30,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
          maxHeight: 320,
          padding: 6,
        }}>
          <div style={{ padding: 6, paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar fuente..."
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 12px',
                color: 'var(--text)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ maxHeight: 252, overflowY: 'auto' }}>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
              setQuery('');
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: 8,
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Sin seleccionar
          </button>

          {filteredFonts.map((font) => {
            const active = selected?.value === font.value;
            return (
              <button
                key={font.value}
                type="button"
                onClick={() => {
                  onChange(font.value);
                  setOpen(false);
                  setQuery('');
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: active ? 'rgba(198,255,75,0.10)' : 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: 'var(--text)',
                  marginBottom: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, fontFamily: font.family }}>{font.value}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{font.category}</span>
                </div>
                <div style={{ fontSize: 13, color: active ? 'var(--accent)' : 'var(--muted)', fontFamily: font.family }}>
                  {font.preview}
                </div>
              </button>
            );
          })}

          {filteredFonts.length === 0 && (
            <div style={{ padding: '12px 10px', fontSize: 13, color: 'var(--muted)' }}>
              No se encontraron fuentes.
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}