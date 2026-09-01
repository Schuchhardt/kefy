'use client';

import { useState, useRef, useEffect } from 'react';
import { useBrand } from '@/lib/brand-context';
import BrandAvatar from '@/components/dashboard/BrandAvatar';
import BrandMenu from '@/components/dashboard/BrandMenu';

/* ─── BrandSwitcher ──────────────────────────────────────────────────────── */

export default function BrandSwitcher({
  collapsed,
  lang = 'es',
}: {
  collapsed: boolean;
  lang?: 'es' | 'en';
}) {
  const { activeBrand, loading } = useBrand();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 8, padding: collapsed ? '18px 0' : '18px 16px',
        borderBottom: '1px solid var(--border)', minHeight: 60, flexShrink: 0,
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 7, background: 'var(--border)', flexShrink: 0,
          animation: 'pulse 1.5s infinite',
        }} />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* ── Trigger ── */}
      <button
        onClick={() => { if (!collapsed) setOpen((v) => !v); }}
        title={collapsed ? (activeBrand?.name ?? 'Marca') : undefined}
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8, width: '100%',
          padding: collapsed ? '18px 0' : '12px 16px',
          borderBottom: '1px solid var(--border)', minHeight: 60,
          background: 'none', border: 'none', cursor: collapsed ? 'default' : 'pointer',
          fontFamily: 'var(--font-syne), system-ui, sans-serif',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!collapsed) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
        }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1, minWidth: 0 }}>
          <BrandAvatar brand={activeBrand} size={28} />
          {!collapsed && (
            <span style={{
              fontWeight: 700, fontSize: 13, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textAlign: 'left',
            }}>
              {activeBrand?.name ?? 'Sin marca'}
            </span>
          )}
        </div>
        {!collapsed && (
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>

      {/* ── Dropdown ── */}
      {open && !collapsed && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          overflow: 'hidden', marginTop: 4,
        }}>
          <BrandMenu lang={lang} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
