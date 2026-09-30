'use client';

// ─── Pestañas de sección del dashboard ───────────────────────────────────────
// Contenido (Crear/Calendario/Librería), Mi marca (Identidad/Mercado/
// Estrategia) y Automatizaciones (Autopilot/Engagement/Leads) tenían el mismo
// layout copiado tres veces, con `padding: 0 48px` y sin scroll horizontal: a
// 360px las pestañas empujaban la página entera hacia un lado.
//
// Son enlaces de navegación, no pestañas de contenido en la página: por eso
// van en un <nav> con `aria-current="page"` en la activa (el patrón de ARIA
// para navegación), y hacen scroll horizontal si no caben.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

export interface SectionTab {
  key: string;
  label: string;
  href: string;
}

export default function SectionTabs({
  tabs, ariaLabel, children, defaultKey,
}: {
  tabs: SectionTab[];
  ariaLabel: string;
  children: ReactNode;
  /** Pestaña activa cuando la ruta es la raíz de la sección. */
  defaultKey?: string;
}) {
  const pathname = usePathname() ?? '';
  const activeRef = useRef<HTMLAnchorElement>(null);

  const activeKey = tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.key ?? defaultKey;

  // En móvil la pestaña activa puede quedar fuera de la vista: se centra.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <nav className="section-tabs" aria-label={ariaLabel}>
        <ul className="section-tabs-list">
          {tabs.map((tab) => {
            const active = tab.key === activeKey;
            return (
              <li key={tab.key} style={{ display: 'flex' }}>
                <Link
                  ref={active ? activeRef : undefined}
                  href={tab.href}
                  className="section-tab"
                  aria-current={active ? 'page' : undefined}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
