'use client';

// Contenido del selector de marca: la lista y el alta de una marca nueva.
// Lo comparten el selector del sidebar (escritorio) y el de la barra superior
// (móvil), para que ambos se comporten igual sin duplicar la lógica.

import { useState } from 'react';
import Link from 'next/link';
import { useBrand } from '@/lib/brand-context';
import BrandAvatar from '@/components/dashboard/BrandAvatar';

const COPY = {
  es: {
    newBrand: 'Nueva marca',
    namePlaceholder: 'Nombre de la marca',
    create: 'Crear',
    cancel: 'Cancelar',
    planLimit: 'Alcanzaste el límite de tu plan.',
    upgrade: 'Mejorar plan',
    createError: 'Error al crear la marca',
  },
  en: {
    newBrand: 'New brand',
    namePlaceholder: 'Brand name',
    create: 'Create',
    cancel: 'Cancel',
    planLimit: "You've reached your plan limit.",
    upgrade: 'Upgrade plan',
    createError: 'Could not create the brand',
  },
} as const;

export default function BrandMenu({
  lang = 'es',
  onDone,
}: {
  lang?: 'es' | 'en';
  /** Se llama tras cambiar o crear una marca, para que el contenedor cierre. */
  onDone: () => void;
}) {
  const { brands, activeBrand, canCreate, switchBrand, createBrand } = useBrand();
  const t = COPY[lang];

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch(id: string) {
    if (id === activeBrand?.id) { onDone(); return; }
    try {
      await switchBrand(id);
    } catch {
      // El contexto ya deja el estado como estaba; cerrar es lo correcto.
    }
    onDone();
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
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.createError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {brands.map((b) => (
          <button
            key={b.id}
            onClick={() => handleSwitch(b.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              width: '100%', padding: '11px 14px',
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

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {creating ? (
        <div style={{ padding: '10px 14px' }}>
          {!canCreate && (
            <p style={{ fontSize: 11, color: '#ff6b6b', margin: '0 0 8px', lineHeight: 1.4 }}>
              {t.planLimit}{' '}
              <Link href={`/${lang}/dashboard/settings`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                {t.upgrade}
              </Link>
            </p>
          )}
          <input
            autoFocus
            type="text"
            placeholder={t.namePlaceholder}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canCreate) handleCreate();
              if (e.key === 'Escape') { setCreating(false); setError(null); }
            }}
            disabled={saving || !canCreate}
            style={{
              width: '100%', padding: '7px 10px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 6, fontSize: 13, color: 'var(--text)',
              fontFamily: 'var(--font-syne), system-ui, sans-serif',
              outline: 'none', boxSizing: 'border-box',
              marginBottom: 7, opacity: !canCreate ? 0.4 : 1,
            }}
          />
          {error && <p style={{ fontSize: 11, color: '#ff6b6b', margin: '0 0 6px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim() || !canCreate}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 6, border: 'none',
                background: 'var(--accent)', color: '#000',
                fontSize: 12, fontWeight: 700, cursor: canCreate ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-syne), system-ui, sans-serif',
                opacity: saving || !newName.trim() || !canCreate ? 0.4 : 1,
              }}
            >
              {saving ? '...' : t.create}
            </button>
            <button
              onClick={() => { setCreating(false); setError(null); setNewName(''); }}
              style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer',
                fontFamily: 'var(--font-syne), system-ui, sans-serif',
              }}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '11px 14px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-syne), system-ui, sans-serif',
            color: 'var(--muted)', fontSize: 13,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t.newBrand}
        </button>
      )}
    </>
  );
}
