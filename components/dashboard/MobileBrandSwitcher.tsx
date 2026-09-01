'use client';

// ─── Selector de marca en móvil ──────────────────────────────────────────────
//
// En móvil el sidebar se oculta (`.dashboard-sidebar { display: none }`) y la
// navegación pasa al BottomNav, que no incluye el selector: quien gestionaba
// varias marcas no tenía forma de cambiar entre ellas desde el teléfono.
//
// Se ancla arriba a la izquierda, simétrico al avatar de usuario que ya vive
// arriba a la derecha, y se muestra solo en móvil vía CSS.

import { useState, useRef, useEffect } from 'react';
import { useBrand } from '@/lib/brand-context';
import BrandAvatar from '@/components/dashboard/BrandAvatar';
import BrandMenu from '@/components/dashboard/BrandMenu';

export default function MobileBrandSwitcher({ lang }: { lang: string }) {
  const { activeBrand, brands, loading } = useBrand();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const locale = lang === 'en' ? 'en' : 'es';

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // Sin marcas cargadas no hay nada que ofrecer, y con una sola el selector no
  // aporta: se muestra igualmente porque desde aquí se crea la segunda.
  if (loading || brands.length === 0) return null;

  return (
    <div
      ref={ref}
      className="brand-switcher-mobile"
      style={{ position: 'fixed', top: 13, left: 16, zIndex: 300 }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={locale === 'en' ? 'Switch brand' : 'Cambiar de marca'}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          maxWidth: '52vw',
          padding: '5px 10px 5px 5px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 999, cursor: 'pointer',
          fontFamily: 'var(--font-syne), system-ui, sans-serif',
        }}
      >
        <BrandAvatar brand={activeBrand} size={26} />
        <span style={{
          fontWeight: 700, fontSize: 13, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {activeBrand?.name ?? '—'}
        </span>
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0,
          minWidth: 240, maxWidth: '80vw',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}>
          <BrandMenu lang={locale} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
