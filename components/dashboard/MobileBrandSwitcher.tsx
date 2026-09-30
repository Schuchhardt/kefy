'use client';

// ─── Selector de marca en móvil ──────────────────────────────────────────────
//
// En móvil el sidebar se oculta (`.dashboard-sidebar { display: none }`) y la
// navegación pasa al BottomNav, que no incluye el selector: quien gestionaba
// varias marcas no tenía forma de cambiar entre ellas desde el teléfono.
//
// Se ancla arriba a la izquierda, simétrico al avatar de usuario que ya vive
// arriba a la derecha, bajo el notch (.top-fixed usa safe-area), y se muestra
// solo en móvil vía CSS.

import { useState, useRef, useEffect, useId } from 'react';
import { useBrand } from '@/lib/brand-context';
import BrandAvatar from '@/components/dashboard/BrandAvatar';
import BrandMenu from '@/components/dashboard/BrandMenu';
import Icon from '@/components/ui/icons';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

export default function MobileBrandSwitcher({ lang }: { lang: string }) {
  const { activeBrand, brands, loading } = useBrand();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const locale = lang === 'en' ? 'en' : 'es';

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Sin marcas cargadas no hay nada que ofrecer, y con una sola el selector no
  // aporta: se muestra igualmente porque desde aquí se crea la segunda.
  if (loading || brands.length === 0) return null;

  return (
    <div ref={ref} className="brand-switcher-mobile top-fixed" style={{ left: 16 }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={(locale === 'en' ? enCommon : esCommon).nav.switchBrand(activeBrand?.name ?? '—')}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="brand-pill"
      >
        <BrandAvatar brand={activeBrand} size={26} />
        <span className="brand-pill-name">{activeBrand?.name ?? '—'}</span>
        <Icon
          name="chevron-down"
          size={13}
          strokeWidth={2}
          style={{ color: 'var(--muted)', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div id={menuId} className="brand-pill-menu">
          <BrandMenu lang={locale} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
