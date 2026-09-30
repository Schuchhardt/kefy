'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { useBrand } from '@/lib/brand-context';
import BrandAvatar from '@/components/dashboard/BrandAvatar';
import BrandMenu from '@/components/dashboard/BrandMenu';
import Icon from '@/components/ui/icons';
import esT from '@/locales/es/dashboard/brand-menu';
import enT from '@/locales/en/dashboard/brand-menu';
import styles from './BrandSwitcher.module.css';

const T = { es: esT, en: enT } as const;

/* ─── BrandSwitcher ──────────────────────────────────────────────────────── */

export default function BrandSwitcher({
  collapsed,
  lang = 'es',
}: {
  collapsed: boolean;
  lang?: 'es' | 'en';
}) {
  const { activeBrand, loading } = useBrand();
  const t = T[lang] ?? T.es;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Cerrar al tocar fuera o con Escape (y devolver el foco al botón).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading) {
    return (
      <div className={`${styles.skeleton}${collapsed ? ` ${styles.isCollapsed}` : ''}`} aria-hidden="true">
        <span className={styles.skeletonBox} />
      </div>
    );
  }

  const name = activeBrand?.name ?? t.noBrand;

  // Colapsado (64px) no hay sitio para la lista: solo se muestra la marca
  // activa. Antes era un botón que no hacía nada al pulsarlo.
  if (collapsed) {
    return (
      <div className={styles.collapsed} title={name}>
        <BrandAvatar brand={activeBrand} size={28} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.root}>
      {/* ── Trigger ── */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.switchBrand(name)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`ui-hoverable ${styles.trigger}`}
      >
        <span className={styles.triggerMain}>
          <span className={styles.avatar} aria-hidden="true">
            <BrandAvatar brand={activeBrand} size={28} />
          </span>
          <span className={styles.name}>{name}</span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          strokeWidth={2}
          className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ''}`}
        />
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div id={menuId} className={styles.menu}>
          <BrandMenu lang={lang} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
