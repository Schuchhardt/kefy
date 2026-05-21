'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { BrandKit, CompanySize } from '@/lib/brand-kit';

import esT from '@/locales/es/dashboard/brand';
import enT from '@/locales/en/dashboard/brand';

const T = { es: esT, en: enT } as const;

const COMPANY_SIZES: CompanySize[] = ['1-10', '11-50', '51-200', '201-500', '500+'];

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--muted)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
      <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 15, fontWeight: 700, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function ArrayChips({
  value, onChange, placeholder, suggestions, loadingSugg, onLoadSuggestions,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions?: string[];
  loadingSugg?: boolean;
  onLoadSuggestions?: () => void;
}) {
  const [input, setInput] = useState('');

  function add(item: string) {
    const trimmed = item.trim();
    if (!trimmed || value.includes(trimmed) || value.length >= 10) return;
    onChange([...value, trimmed]);
    setInput('');
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {value.map((v) => (
          <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(198,255,75,0.12)', border: '1px solid var(--accent)', borderRadius: 20, padding: '4px 10px', fontSize: 13, color: 'var(--accent)' }}>
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      {suggestions !== undefined && (
        <div style={{ marginBottom: 8 }}>
          {loadingSugg ? (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Cargando sugerencias...</span>
          ) : suggestions.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {suggestions.filter((s) => !value.includes(s)).map((s) => (
                <button key={s} type="button" onClick={() => add(s)}
                  style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}>
                  + {s}
                </button>
              ))}
            </div>
          ) : onLoadSuggestions ? (
            <button type="button" onClick={onLoadSuggestions}
              style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              {loadingSugg ? '...' : 'Sugerencias IA'}
            </button>
          ) : null}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...inputStyle, flex: 1 }} value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input); } }}
          placeholder={placeholder} />
        <button type="button" onClick={() => add(input)}
          style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>+</button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BrandMarketPage({ params }: { params: Promise<{ lang: string }> }) {
  const { org, loading: authLoading } = useAuth();
  const [locale, setLocale] = useState<'es' | 'en'>('es');
  const [form, setForm] = useState<Partial<BrandKit>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const [arraySugg, setArraySugg] = useState<Record<string, string[]>>({});
  const [arraySuggLoading, setArraySuggLoading] = useState<Record<string, boolean>>({});

  // Load locale from params
  useEffect(() => {
    void params.then(({ lang }) => {
      setLocale(lang === 'en' ? 'en' : 'es');
    });
  }, [params]);

  // Load brand kit
  const loadBrandKit = useCallback(async () => {
    try {
      setLoadingData(true);
      const res = await fetch('/api/brand-kit');
      if (res.ok) {
        const data = (await res.json()) as { brandKit: BrandKit | null };
        if (data.brandKit) setForm(data.brandKit);
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && org) void loadBrandKit();
  }, [authLoading, org, loadBrandKit]);

  function updateField<K extends keyof BrandKit>(key: K, value: BrandKit[K] | null) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      await fetch('/api/brand-kit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function loadArraySugg(field: string) {
    setArraySuggLoading((prev) => ({ ...prev, [field]: true }));
    try {
      const res = await fetch('/api/brand-kit/suggest-array', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, brandKit: form }),
      });
      if (res.ok) {
        const data = (await res.json()) as { suggestions: string[] };
        setArraySugg((prev) => ({ ...prev, [field]: data.suggestions ?? [] }));
      }
    } finally {
      setArraySuggLoading((prev) => ({ ...prev, [field]: false }));
    }
  }

  const t = T[locale];

  if (authLoading || loadingData) {
    return (
      <div style={{ padding: '40px 48px' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>
          {locale === 'es' ? 'Cargando...' : 'Loading...'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px 48px', maxWidth: 840 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
          {locale === 'es' ? 'Mercado & Audiencia' : 'Market & Audience'}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          {locale === 'es'
            ? 'Define tu posicionamiento, público objetivo y competencia.'
            : 'Define your positioning, target audience, and competition.'}
        </p>
      </div>

      <form onSubmit={handleSave}>

        {/* Empresa */}
        <SectionCard title={locale === 'es' ? 'Empresa' : 'Company'}>
          <Field label={t.companySize}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {COMPANY_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => updateField('company_size', size)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: form.company_size === size ? 600 : 400,
                    border: `1px solid ${form.company_size === size ? 'var(--accent)' : 'var(--border)'}`,
                    background: form.company_size === size ? 'rgba(198,255,75,0.1)' : 'var(--bg)',
                    color: form.company_size === size ? 'var(--accent)' : 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  {size} {locale === 'es' ? 'empleados' : 'employees'}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t.niche}>
            <input
              style={inputStyle}
              value={form.niche ?? ''}
              onChange={(e) => updateField('niche', e.target.value || null)}
              placeholder={locale === 'es' ? 'ej. SaaS para restaurantes pequeños' : 'e.g. SaaS for small restaurants'}
            />
          </Field>
        </SectionCard>

        {/* Audiencia */}
        <SectionCard title={locale === 'es' ? 'Audiencia' : 'Audience'}>
          <Field label={t.targetAudience}>
            <textarea
              style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
              value={form.target_audience ?? ''}
              onChange={(e) => updateField('target_audience', e.target.value || null)}
              placeholder={locale === 'es'
                ? 'Describe a tu cliente ideal: quiénes son, qué necesitan, qué les preocupa...'
                : 'Describe your ideal customer: who they are, what they need, what they worry about...'}
            />
          </Field>
        </SectionCard>

        {/* Posicionamiento */}
        <SectionCard title={locale === 'es' ? 'Posicionamiento' : 'Positioning'}>
          <Field label={t.differentiators}>
            <ArrayChips
              value={(form.differentiators as string[] | undefined) ?? []}
              onChange={(v) => updateField('differentiators', v as never)}
              placeholder={locale === 'es' ? 'Añadir diferenciador...' : 'Add differentiator...'}
              suggestions={arraySugg['differentiators']}
              loadingSugg={arraySuggLoading['differentiators']}
              onLoadSuggestions={() => void loadArraySugg('differentiators')}
            />
          </Field>

          <Field label={t.competitors}>
            <ArrayChips
              value={(form.competitors as string[] | undefined) ?? []}
              onChange={(v) => updateField('competitors', v as never)}
              placeholder={locale === 'es' ? 'Añadir competidor...' : 'Add competitor...'}
              suggestions={arraySugg['competitors']}
              loadingSugg={arraySuggLoading['competitors']}
              onLoadSuggestions={() => void loadArraySugg('competitors')}
            />
          </Field>

          <Field label={t.challenges}>
            <ArrayChips
              value={(form.challenges as string[] | undefined) ?? []}
              onChange={(v) => updateField('challenges', v as never)}
              placeholder={locale === 'es' ? 'Añadir reto...' : 'Add challenge...'}
              suggestions={arraySugg['challenges']}
              loadingSugg={arraySuggLoading['challenges']}
              onLoadSuggestions={() => void loadArraySugg('challenges')}
            />
          </Field>
        </SectionCard>

        {/* Save button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          {saved && (
            <span style={{ fontSize: 13, color: 'var(--accent)', alignSelf: 'center' }}>
              {locale === 'es' ? '✓ Guardado' : '✓ Saved'}
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '11px 28px',
              borderRadius: 8,
              border: 'none',
              background: saving ? 'var(--border)' : 'var(--accent)',
              color: saving ? 'var(--muted)' : '#000',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {saving
              ? (locale === 'es' ? 'Guardando...' : 'Saving...')
              : (locale === 'es' ? 'Guardar cambios' : 'Save changes')}
          </button>
        </div>
      </form>
    </div>
  );
}
