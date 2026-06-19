'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useBrand, type Brand } from '@/lib/brand-context';

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function brandInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function BrandAvatar({ brand, size = 28 }: { brand: Brand | null; size?: number }) {
  if (!brand) {
    return (
      <span style={{
        width: size, height: size, borderRadius: 7, flexShrink: 0,
        background: 'var(--accent)', color: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: size * 0.42, lineHeight: 1,
      }}>?</span>
    );
  }

  if (brand.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.avatar_url}
        alt={brand.name}
        width={size}
        height={size}
        style={{ borderRadius: 7, objectFit: 'cover', flexShrink: 0, display: 'block' }}
      />
    );
  }

  // Color derived from brand id for consistency
  const colors = ['#C6FF4B', '#4B8FFF', '#FF6B4B', '#B44BFF', '#4BFFD8', '#FF4BD0'];
  const idx = brand.id.charCodeAt(0) % colors.length;

  return (
    <span style={{
      width: size, height: size, borderRadius: 7, flexShrink: 0,
      background: colors[idx], color: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.42, lineHeight: 1,
    }}>
      {brandInitial(brand.name)}
    </span>
  );
}

/* ─── BrandSwitcher ──────────────────────────────────────────────────────── */

export default function BrandSwitcher({ collapsed }: { collapsed: boolean }) {
  const { brands, activeBrand, loading, canCreate, switchBrand, createBrand } = useBrand();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setError(null);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  async function handleSwitch(id: string) {
    if (id === activeBrand?.id) { setOpen(false); return; }
    try {
      await switchBrand(id);
    } catch {
      // silent
    }
    setOpen(false);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await createBrand(name);
      setNewName('');
      setCreating(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la marca');
    } finally {
      setSaving(false);
    }
  }

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
          {/* Brand list */}
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => handleSwitch(b.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '9px 14px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-syne), system-ui, sans-serif',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <BrandAvatar brand={b} size={22} />
                <span style={{
                  flex: 1, textAlign: 'left', fontSize: 13,
                  color: b.id === activeBrand?.id ? 'var(--accent)' : 'var(--text)',
                  fontWeight: b.id === activeBrand?.id ? 700 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {b.name}
                </span>
                {b.id === activeBrand?.id && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Create new brand */}
          {creating ? (
            <div style={{ padding: '10px 14px' }}>
              {!canCreate && (
                <p style={{ fontSize: 11, color: '#ff6b6b', margin: '0 0 8px', lineHeight: 1.4 }}>
                  Alcanzaste el límite de tu plan.{' '}
                  <Link href="/es/dashboard/settings" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                    Mejorar plan
                  </Link>
                </p>
              )}
              <input
                autoFocus
                type="text"
                placeholder="Nombre de la marca"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreate(); if (e.key === 'Escape') { setCreating(false); setError(null); } }}
                disabled={saving || !canCreate}
                style={{
                  width: '100%', padding: '6px 10px',
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 6, fontSize: 13, color: 'var(--text)',
                  fontFamily: 'var(--font-syne), system-ui, sans-serif',
                  outline: 'none', boxSizing: 'border-box',
                  marginBottom: 7, opacity: !canCreate ? 0.4 : 1,
                }}
              />
              {error && (
                <p style={{ fontSize: 11, color: '#ff6b6b', margin: '0 0 6px' }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleCreate}
                  disabled={saving || !newName.trim() || !canCreate}
                  style={{
                    flex: 1, padding: '5px 0', borderRadius: 6, border: 'none',
                    background: 'var(--accent)', color: '#000',
                    fontSize: 12, fontWeight: 700, cursor: canCreate ? 'pointer' : 'not-allowed',
                    fontFamily: 'var(--font-syne), system-ui, sans-serif',
                    opacity: saving || !newName.trim() || !canCreate ? 0.4 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {saving ? '...' : 'Crear'}
                </button>
                <button
                  onClick={() => { setCreating(false); setError(null); setNewName(''); }}
                  style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer',
                    fontFamily: 'var(--font-syne), system-ui, sans-serif',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 14px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-syne), system-ui, sans-serif',
                color: 'var(--muted)', fontSize: 13,
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = 'rgba(255,255,255,0.05)';
                btn.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = 'none';
                btn.style.color = 'var(--muted)';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nueva marca
            </button>
          )}
        </div>
      )}
    </div>
  );
}
