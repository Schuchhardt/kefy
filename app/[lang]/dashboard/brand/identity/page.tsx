'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { BrandKit, BrandTone, CompanySize } from '@/lib/brand-kit';

// ─── i18n ─────────────────────────────────────────────────────────────────────

import esT from '@/locales/es/dashboard/brand';
import enT from '@/locales/en/dashboard/brand';

const T = { es: esT, en: enT } as const;
type Locale = keyof typeof T;

// ─── Constants ────────────────────────────────────────────────────────────────

const TONES: { value: BrandTone; label: Record<Locale, string> }[] = [
  { value: 'professional',  label: { es: 'Profesional',   en: 'Professional'  } },
  { value: 'friendly',      label: { es: 'Amigable',      en: 'Friendly'      } },
  { value: 'authoritative', label: { es: 'Autoritativo',  en: 'Authoritative' } },
  { value: 'playful',       label: { es: 'Divertido',     en: 'Playful'       } },
  { value: 'inspirational', label: { es: 'Inspiracional', en: 'Inspirational' } },
  { value: 'educational',   label: { es: 'Educativo',     en: 'Educational'   } },
  { value: 'casual',        label: { es: 'Casual',        en: 'Casual'        } },
  { value: 'formal',        label: { es: 'Formal',        en: 'Formal'        } },
];

const COMPANY_SIZES: CompanySize[] = ['1-10', '11-50', '51-200', '201-500', '500+'];

const SOCIAL_CHANNELS = ['instagram', 'linkedin', 'twitter', 'facebook', 'tiktok', 'youtube'];

const LANGUAGES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 14px', fontSize: 14, color: 'var(--text)',
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--muted)',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: 40, height: 38, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'var(--bg)' }} />
        <input style={{ ...inputStyle, flex: 1 }} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder="#000000" maxLength={7} />
      </div>
    </Field>
  );
}

// ─── ArrayChips ───────────────────────────────────────────────────────────────

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
              Cargar sugerencias IA
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BrandKitPage({ params }: { params: Promise<{ lang: string }> }) {
  const { loading: authLoading, org } = useAuth();
  const [locale, setLocale] = useState<Locale>('es');

  useEffect(() => {
    params.then(({ lang }) => {
      if (lang === 'en' || lang === 'es') setLocale(lang as Locale);
    });
  }, [params]);

  const t = T[locale];

  const [form, setForm] = useState<Partial<BrandKit>>({});
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localeRef = useRef<Locale>('es');

  // Enrichment state
  const [enrichUrl, setEnrichUrl] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<Partial<BrandKit> | null>(null);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  // Logo upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Array field suggestions
  const [arraySugg, setArraySugg] = useState<Record<string, string[]>>({});
  const [arraySuggLoading, setArraySuggLoading] = useState<Record<string, boolean>>({});

  // Load brand kit
  useEffect(() => {
    if (authLoading) return;
    fetch('/api/brand-kit', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load');
        const { kit: k } = await res.json() as { kit: BrandKit };
        // Pre-fill name with org name if not yet customized
        if ((!k.name || k.name === 'Mi marca') && org?.name) k.name = org.name;
        setForm(k);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setFetching(false));
  }, [authLoading, org?.name]);

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'logo');
      fd.append('label', 'Logo');
      const res = await fetch('/api/brand-kit/assets', { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) throw new Error('upload failed');
      const { asset } = await res.json() as { asset: { public_url: string } };
      updateField('logo_url', asset.public_url);
    } catch {
      // silently ignore — user can retry
    } finally {
      setLogoUploading(false);
    }
  }

  // Sync refs after every render so callbacks always see latest values without re-creating
  useEffect(() => {
    localeRef.current = locale;
  }); // intentionally no deps — runs after every render

  function updateField<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  // Enrich from URL
  async function handleEnrich(urlOverride?: string) {
    const url = urlOverride ?? enrichUrl;
    if (!url.trim()) return;
    setEnriching(true);
    setEnrichResult(null);
    setEnrichMsg(null);
    try {
      const res = await fetch('/api/brand-kit/enrich-url', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), lang: localeRef.current }),
      });
      if (!res.ok) throw new Error();
      const { extracted } = await res.json() as { extracted: Partial<BrandKit> };
      if (Object.keys(extracted).length === 0) throw new Error('empty');
      setEnrichResult(extracted);
      setEnrichMsg(t.enrichSuccess);
    } catch {
      setEnrichMsg(t.enrichError);
    } finally {
      setEnriching(false);
    }
  }

  function applyEnriched() {
    if (!enrichResult) return;
    setForm((prev) => ({ ...prev, ...enrichResult }));
    setEnrichResult(null);
    setEnrichMsg(null);
    setEnrichUrl('');
  }

  async function loadArraySugg(field: string) {
    if (arraySugg[field]) return;
    setArraySuggLoading((p) => ({ ...p, [field]: true }));
    try {
      const res = await fetch('/api/brand-kit/ai-suggest', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, context: form, lang: locale }),
      });
      if (!res.ok) throw new Error();
      const { suggestions: sugg } = await res.json() as { suggestions: string[] };
      setArraySugg((p) => ({ ...p, [field]: sugg }));
    } catch {
      setArraySugg((p) => ({ ...p, [field]: [] }));
    } finally {
      setArraySuggLoading((p) => ({ ...p, [field]: false }));
    }
  }

  // Save
  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name ?? org?.name ?? null,
      tagline: form.tagline ?? null, industry: form.industry ?? null,
      website_url: form.website_url ?? null, social_urls: form.social_urls ?? {},
      language: form.language ?? 'es', customer_locations: form.customer_locations ?? [],
      uses_emojis: form.uses_emojis ?? false, communication_style: form.communication_style ?? null,
      mission: form.mission ?? null, tone: form.tone ?? [],
      primary_color: form.primary_color ?? null, secondary_color: form.secondary_color ?? null,
      accent_color: form.accent_color ?? null, font_heading: form.font_heading ?? null,
      font_body: form.font_body ?? null, logo_url: form.logo_url ?? null, notes: form.notes ?? null,
      company_size: form.company_size ?? null, differentiators: form.differentiators ?? [],
      challenges: form.challenges ?? [], niche: form.niche ?? null,
      competitors: form.competitors ?? [], target_audience: form.target_audience ?? null,
    };
    try {
      const res = await fetch('/api/brand-kit', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const { error: msg } = await res.json() as { error?: string };
        throw new Error(msg ?? 'Error al guardar');
      }
      const { kit: updated } = await res.json() as { kit: BrandKit };
      setForm(updated);
      setSaved(true);
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || fetching) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh' }}>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>{t.loading}</span>
      </div>
    );
  }

  if (error && !form.name) {
    return (
      <div style={{ padding: '40px 48px' }}>
        <p style={{ color: '#ff6b6b', fontSize: 14 }}>{t.loadError}</p>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '40px 48px', maxWidth: 840 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700, marginBottom: 6 }}>{t.title}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.subtitle}</p>
        </div>


      <form onSubmit={handleSave}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>1. {t.sec1}</span>
          </div>

          <SectionCard title={`${t.name} & ${t.industry}`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label={t.name}>
                <input style={inputStyle} value={form.name ?? ''} onChange={(e) => updateField('name', e.target.value)} placeholder="Mi empresa" required />
              </Field>
              <Field label={t.industry}>
                <input style={inputStyle} value={form.industry ?? ''} onChange={(e) => updateField('industry', e.target.value || null)} placeholder="SaaS, E-commerce..." />
              </Field>
            </div>
            <Field label={t.tagline}>
              <input style={inputStyle} value={form.tagline ?? ''} onChange={(e) => updateField('tagline', e.target.value || null)} placeholder="Tu eslogan..." />
            </Field>
            <Field label={t.mission}>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.mission ?? ''} onChange={(e) => updateField('mission', e.target.value || null)} placeholder={locale === 'es' ? '¿Qué hace tu empresa?' : 'What does your company do?'} />
            </Field>
          </SectionCard>

          <SectionCard title={`${t.websiteUrl} & ${t.socialUrls}`}>
            <Field label={t.websiteUrl}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1 }} value={form.website_url ?? ''} onChange={(e) => updateField('website_url', e.target.value || null)} placeholder="https://..." type="url" />
                <button type="button" disabled={!form.website_url || enriching}
                  onClick={() => { setEnrichUrl(form.website_url ?? ''); void handleEnrich(form.website_url ?? undefined); }}
                  style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: !form.website_url ? 'not-allowed' : 'pointer', opacity: !form.website_url ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  {enriching ? t.enriching : t.enrichBtn}
                </button>
              </div>
            </Field>
            {enrichMsg && (
              <p style={{ fontSize: 13, color: enrichResult ? 'var(--accent)' : '#ff6b6b', marginBottom: 12 }}>{enrichMsg}</p>
            )}
            {enrichResult && (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>{t.confirmEnriched}</p>
                {Object.entries(enrichResult).map(([k, v]) => {
                  if (!v || (Array.isArray(v) && v.length === 0)) return null;
                  return (
                    <div key={k} style={{ fontSize: 13, display: 'flex', gap: 8, marginBottom: 4 }}>
                      <span style={{ color: 'var(--muted)', minWidth: 140, flexShrink: 0 }}>{k}</span>
                      <span style={{ color: 'var(--text)' }}>{Array.isArray(v) ? (v as string[]).join(', ') : String(v)}</span>
                    </div>
                  );
                })}
                <button type="button" onClick={applyEnriched}
                  style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {t.applyEnriched}
                </button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SOCIAL_CHANNELS.map((ch) => (
                <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 68, textTransform: 'capitalize' }}>{ch}</span>
                  <input style={{ ...inputStyle, fontSize: 13 }}
                    value={(form.social_urls as Record<string, string> | undefined)?.[ch] ?? ''}
                    onChange={(e) => updateField('social_urls', { ...(form.social_urls ?? {}), [ch]: e.target.value || undefined })}
                    placeholder="URL" />
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={`${t.language} & ${t.customerLocations}`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label={t.language}>
                <select style={inputStyle} value={form.language ?? 'es'} onChange={(e) => updateField('language', e.target.value)}>
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </Field>
              <Field label={t.usesEmojis}>
                <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                  {([true, false] as const).map((v) => (
                    <button key={String(v)} type="button" onClick={() => updateField('uses_emojis', v)}
                      style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: form.uses_emojis === v ? 600 : 400, border: `1px solid ${form.uses_emojis === v ? 'var(--accent)' : 'var(--border)'}`, background: form.uses_emojis === v ? 'rgba(198,255,75,0.1)' : 'var(--bg)', color: form.uses_emojis === v ? 'var(--accent)' : 'var(--text)', cursor: 'pointer' }}>
                      {v ? t.yes : t.no}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label={t.customerLocations}>
              <ArrayChips value={form.customer_locations ?? []} onChange={(v) => updateField('customer_locations', v)} placeholder={locale === 'es' ? 'País o ciudad...' : 'Country or city...'}
                suggestions={arraySugg['customer_locations']} loadingSugg={arraySuggLoading['customer_locations']}
                onLoadSuggestions={() => void loadArraySugg('customer_locations')} />
            </Field>
          </SectionCard>

          <SectionCard title={`${t.communicationStyle} & ${t.tone}`}>
            <Field label={t.communicationStyle}>
              <input style={inputStyle} value={form.communication_style ?? ''} onChange={(e) => updateField('communication_style', e.target.value || null)} placeholder={locale === 'es' ? 'Ej: Directo y cercano, sin tecnicismos...' : 'E.g. Direct and friendly, no jargon...'} />
            </Field>
            <Field label={t.tone}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TONES.map(({ value, label }) => {
                  const active = (form.tone ?? []).includes(value);
                  return (
                    <button key={value} type="button"
                      onClick={() => { const next = active ? (form.tone ?? []).filter((x) => x !== value) : [...(form.tone ?? []), value]; updateField('tone', next); }}
                      style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: active ? 600 : 400, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'rgba(198,255,75,0.1)' : 'var(--bg)', color: active ? 'var(--accent)' : 'var(--text)', cursor: 'pointer' }}>
                      {label[locale]}
                    </button>
                  );
                })}
              </div>
            </Field>
          </SectionCard>

          <SectionCard title={`${t.primaryColor} / ${t.fontHeading}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
              <ColorField label={t.primaryColor} value={form.primary_color ?? '#000000'} onChange={(v) => updateField('primary_color', v)} />
              <ColorField label={t.secondaryColor} value={form.secondary_color ?? '#ffffff'} onChange={(v) => updateField('secondary_color', v)} />
              <ColorField label={t.accentColor} value={form.accent_color ?? '#c6ff4b'} onChange={(v) => updateField('accent_color', v)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <Field label={t.fontHeading}>
                <input style={inputStyle} value={form.font_heading ?? ''} onChange={(e) => updateField('font_heading', e.target.value || null)} placeholder="Syne, Playfair..." />
              </Field>
              <Field label={t.fontBody}>
                <input style={inputStyle} value={form.font_body ?? ''} onChange={(e) => updateField('font_body', e.target.value || null)} placeholder="DM Sans, Inter..." />
              </Field>
            </div>
            <Field label={t.logo}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                {form.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logo_url} alt="Logo" style={{ height: 56, maxWidth: 140, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', padding: 6, background: '#fff' }} />
                )}
                <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f); }} />
                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: logoUploading ? 'not-allowed' : 'pointer', opacity: logoUploading ? 0.7 : 1 }}>
                  {logoUploading ? (locale === 'es' ? 'Subiendo...' : 'Uploading...') : (locale === 'es' ? '↑ Subir logo' : '↑ Upload logo')}
                </button>
                {form.logo_url && (
                  <button type="button" onClick={() => updateField('logo_url', null)}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: '#ff6b6b', fontSize: 13, cursor: 'pointer' }}>
                    {locale === 'es' ? 'Quitar' : 'Remove'}
                  </button>
                )}
                <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} value={form.logo_url ?? ''}
                  onChange={(e) => updateField('logo_url', e.target.value || null)}
                  placeholder="https://..." type="url" />
              </div>
            </Field>
          </SectionCard>

          <SectionCard title={t.notes}>
            <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={form.notes ?? ''} onChange={(e) => updateField('notes', e.target.value || null)} placeholder={locale === 'es' ? 'Guías de estilo, instrucciones para la IA...' : 'Style guides, AI instructions...'} />
          </SectionCard>

          <div style={{ marginTop: 16, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>2. {t.sec2}</span>
          </div>

          <SectionCard title={`${t.companySize} & ${t.niche}`}>
            <Field label={t.companySize}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {COMPANY_SIZES.map((size) => (
                  <button key={size} type="button" onClick={() => updateField('company_size', size)}
                    style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: form.company_size === size ? 600 : 400, border: `1px solid ${form.company_size === size ? 'var(--accent)' : 'var(--border)'}`, background: form.company_size === size ? 'rgba(198,255,75,0.1)' : 'var(--bg)', color: form.company_size === size ? 'var(--accent)' : 'var(--text)', cursor: 'pointer' }}>
                    {size} {locale === 'es' ? 'empleados' : 'employees'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t.niche}>
              <input style={inputStyle} value={form.niche ?? ''} onChange={(e) => updateField('niche', e.target.value || null)} placeholder={locale === 'es' ? 'Ej: Coaches para mujeres emprendedoras...' : 'E.g. Life coaches for female entrepreneurs...'} />
            </Field>
            <Field label={t.targetAudience}>
              <input style={inputStyle} value={form.target_audience ?? ''} onChange={(e) => updateField('target_audience', e.target.value || null)} placeholder={locale === 'es' ? 'Ej: Emprendedores digitales 25-40 años...' : 'E.g. Digital entrepreneurs 25-40 years...'} />
            </Field>
          </SectionCard>

          <SectionCard title={`${t.differentiators} & ${t.challenges}`}>
            <Field label={t.differentiators}>
              <ArrayChips value={form.differentiators ?? []} onChange={(v) => updateField('differentiators', v)} placeholder={t.addPlaceholder}
                suggestions={arraySugg['differentiators']} loadingSugg={arraySuggLoading['differentiators']}
                onLoadSuggestions={() => void loadArraySugg('differentiators')} />
            </Field>
            <Field label={t.challenges}>
              <ArrayChips value={form.challenges ?? []} onChange={(v) => updateField('challenges', v)} placeholder={t.addPlaceholder}
                suggestions={arraySugg['challenges']} loadingSugg={arraySuggLoading['challenges']}
                onLoadSuggestions={() => void loadArraySugg('challenges')} />
            </Field>
          </SectionCard>

          <SectionCard title={t.competitors}>
            <ArrayChips value={form.competitors ?? []} onChange={(v) => updateField('competitors', v)} placeholder={t.addPlaceholder}
              suggestions={arraySugg['competitors']} loadingSugg={arraySuggLoading['competitors']}
              onLoadSuggestions={() => void loadArraySugg('competitors')} />
          </SectionCard>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, paddingTop: 8 }}>
            <button type="submit" disabled={saving}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? t.saving : t.save}
            </button>
            {saved && <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>{t.saved}</span>}
            {error && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</span>}
          </div>
        </form>

    </div>
  );
}

