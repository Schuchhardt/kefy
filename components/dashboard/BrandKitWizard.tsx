'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { BrandKit, BrandTone, CompanySize } from '@/lib/brand-kit';

// ─── i18n ─────────────────────────────────────────────────────────────────────

const T = {
  es: {
    title: 'Cuéntanos sobre tu marca',
    subtitle: 'Completá esta información para que Kefy genere contenido consistente con tu identidad.',
    saving: 'Guardando...', saved: '✓ Guardado', save: 'Guardar y continuar',
    next: 'Siguiente', prev: 'Anterior', skip: 'Saltar', finish: 'Finalizar',
    loading: 'Cargando...', loadError: 'Error al cargar',
    enrichBtn: 'Analizar con IA', enriching: 'Analizando...',
    enrichSuccess: '¡Encontramos información de tu marca!',
    enrichError: 'No pudimos analizar el sitio. Continuá manualmente.',
    confirmEnriched: 'Revisá la información que encontramos:',
    applyEnriched: 'Confirmar y continuar',
    addPlaceholder: 'Escribe y presiona Enter...',
    stepOf: (c: number, total: number) => `Paso ${c} de ${total}`,
    sec1: 'Quién eres', sec2: 'Tu mercado',
    yes: 'Sí', no: 'No',
    suggestions: 'Sugerencias IA', loadingSuggestions: 'Cargando sugerencias...',
    socialUrls: 'Redes sociales (opcional)',
    q_name: '¿Cuál es el nombre de tu marca?',
    q_websiteUrl: '¿Tenés un sitio web o página de redes sociales principal?',
    q_mission: '¿Qué hace tu empresa? ¿Cuál es su misión?',
    q_industry: '¿En qué industria opera tu marca?',
    q_logo: '¿Tenés el logo de tu marca? Podés subir un archivo o pegar una URL.',
    q_language: '¿En qué idioma te comunicás con tus clientes?',
    q_customerLocations: '¿Dónde están tus clientes? (países o ciudades)',
    q_usesEmojis: '¿Tu marca usa emojis en su comunicación?',
    q_communicationStyle: '¿Cómo describirías el estilo de comunicación de tu marca?',
    q_tone: '¿Cuál es el tono de voz de tu marca? (podés elegir varios)',
    q_tagline: '¿Cuál es el tagline o eslogan de tu marca?',
    q_colors: 'Definí la paleta de colores de tu marca',
    q_fonts: '¿Qué tipografías usa tu marca?',
    q_notes: 'Alguna guía de estilo adicional o instrucción especial para la IA',
    q_companySize: '¿Cuántos empleados tiene tu empresa?',
    q_niche: '¿Cuál es el nicho específico de tu marca?',
    q_targetAudience: '¿Quién es tu público objetivo?',
    q_differentiators: '¿Qué diferencia a tu marca de la competencia?',
    q_challenges: '¿Cuáles son los principales retos o dificultades de tu negocio?',
    q_competitors: '¿Quiénes son tus principales competidores?',
  },
  en: {
    title: 'Tell us about your brand',
    subtitle: 'Fill in this information so Kefy can generate content consistent with your identity.',
    saving: 'Saving...', saved: '✓ Saved', save: 'Save & continue',
    next: 'Next', prev: 'Back', skip: 'Skip', finish: 'Finish',
    loading: 'Loading...', loadError: 'Error loading',
    enrichBtn: 'Analyze with AI', enriching: 'Analyzing...',
    enrichSuccess: 'We found information about your brand!',
    enrichError: 'Could not analyze the site. Continue manually.',
    confirmEnriched: 'Review the information we found:',
    applyEnriched: 'Confirm & continue',
    addPlaceholder: 'Type and press Enter...',
    stepOf: (c: number, total: number) => `Step ${c} of ${total}`,
    sec1: 'Who you are', sec2: 'Your market',
    yes: 'Yes', no: 'No',
    suggestions: 'AI Suggestions', loadingSuggestions: 'Loading suggestions...',
    socialUrls: 'Social networks (optional)',
    q_name: "What is your brand's name?",
    q_websiteUrl: 'Do you have a website or main social media page?',
    q_mission: "What does your company do? What's its mission?",
    q_industry: 'What industry does your brand operate in?',
    q_logo: 'Do you have your brand logo? You can upload a file or paste a URL.',
    q_language: 'What language do you communicate with your customers in?',
    q_customerLocations: 'Where are your customers? (countries or cities)',
    q_usesEmojis: 'Does your brand use emojis in its communication?',
    q_communicationStyle: "How would you describe your brand's communication style?",
    q_tone: "What is your brand's tone of voice? (you can choose multiple)",
    q_tagline: "What is your brand's tagline or slogan?",
    q_colors: 'Define your brand color palette',
    q_fonts: 'What fonts does your brand use?',
    q_notes: 'Any additional style guide or special instruction for the AI',
    q_companySize: 'How many employees does your company have?',
    q_niche: "What is your brand's specific niche?",
    q_targetAudience: 'Who is your target audience?',
    q_differentiators: 'What sets your brand apart from the competition?',
    q_challenges: 'What are the main challenges or difficulties in your business?',
    q_competitors: 'Who are your main competitors?',
  },
} as const;
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

// ─── Wizard step definitions ──────────────────────────────────────────────────

type WizardStepId =
  | 'name' | 'website' | 'mission' | 'industry' | 'language'
  | 'locations' | 'emojis' | 'comm_style' | 'tone' | 'tagline'
  | 'colors' | 'fonts' | 'logo' | 'notes'
  | 'company_size' | 'niche' | 'target_audience' | 'differentiators'
  | 'challenges' | 'competitors';

interface WizardStep {
  id: WizardStepId;
  section: 1 | 2;
  field: keyof BrandKit | null;
  aiField?: string;
  isArray?: boolean;
  isTone?: boolean;
  isColor?: boolean;
  isFont?: boolean;
  isBoolean?: boolean;
  isUrl?: boolean;
  isLogo?: boolean;
  isCompanySize?: boolean;
  isSelect?: boolean;
  selectOptions?: { value: string; label: string }[];
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'name',            section: 1, field: 'name' },
  { id: 'website',         section: 1, field: 'website_url', isUrl: true },
  { id: 'mission',         section: 1, field: 'mission', aiField: 'mission' },
  { id: 'industry',        section: 1, field: 'industry', aiField: 'industry' },
  { id: 'language',        section: 1, field: 'language', isSelect: true, selectOptions: LANGUAGES },
  { id: 'locations',       section: 1, field: 'customer_locations', isArray: true, aiField: 'customer_locations' },
  { id: 'emojis',          section: 1, field: 'uses_emojis', isBoolean: true },
  { id: 'comm_style',      section: 1, field: 'communication_style', aiField: 'communication_style' },
  { id: 'tone',            section: 1, field: 'tone', isTone: true },
  { id: 'tagline',         section: 1, field: 'tagline', aiField: 'tagline' },
  { id: 'colors',          section: 1, field: null, isColor: true },
  { id: 'fonts',           section: 1, field: null, isFont: true },
  { id: 'logo',            section: 1, field: 'logo_url', isLogo: true },
  { id: 'notes',           section: 1, field: 'notes' },
  { id: 'company_size',    section: 2, field: 'company_size', isCompanySize: true },
  { id: 'niche',           section: 2, field: 'niche', aiField: 'niche' },
  { id: 'target_audience', section: 2, field: 'target_audience', aiField: 'target_audience' },
  { id: 'differentiators', section: 2, field: 'differentiators', isArray: true, aiField: 'differentiators' },
  { id: 'challenges',      section: 2, field: 'challenges', isArray: true, aiField: 'challenges' },
  { id: 'competitors',     section: 2, field: 'competitors', isArray: true, aiField: 'competitors' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: 40, height: 38, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'var(--bg)' }} />
        <input style={{ ...inputStyle, flex: 1 }} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder="#000000" maxLength={7} />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  locale: string;
  orgName?: string;
  onComplete: () => void;
}

export default function BrandKitWizard({ locale: localeProp, orgName, onComplete }: Props) {
  const locale: Locale = (localeProp === 'en' ? 'en' : 'es') as Locale;
  const t = T[locale];

  const [form, setForm] = useState<Partial<BrandKit>>({});
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<Partial<BrandKit>>({});
  const suggCacheRef = useRef<Record<string, string[]>>({});
  const localeRef = useRef<Locale>(locale);
  const suggInflight = useRef<string | null>(null);

  const [wizardStep, setWizardStep] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [suggCache, setSuggCache] = useState<Record<string, string[]>>({});
  const [wizardInput, setWizardInput] = useState('');

  const [enrichUrl, setEnrichUrl] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<Partial<BrandKit> | null>(null);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [arraySugg, setArraySugg] = useState<Record<string, string[]>>({});
  const [arraySuggLoading, setArraySuggLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/brand-kit', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load');
        const { kit: k } = await res.json() as { kit: BrandKit };
        if ((!k.name || k.name === 'Mi marca') && orgName) k.name = orgName;
        setForm(k);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setFetching(false));
  }, [orgName]);

  useEffect(() => {
    formRef.current = form;
    suggCacheRef.current = suggCache;
    localeRef.current = locale;
  });

  function updateField<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  const fetchSuggestions = useCallback(async (field: string) => {
    if (suggInflight.current === field) return;
    if (suggCacheRef.current[field]) { setSuggestions(suggCacheRef.current[field]); return; }
    suggInflight.current = field;
    setLoadingSugg(true);
    setSuggestions([]);
    try {
      const res = await fetch('/api/brand-kit/ai-suggest', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, context: formRef.current, lang: localeRef.current }),
      });
      if (!res.ok) throw new Error();
      const { suggestions: sugg } = await res.json() as { suggestions: string[] };
      setSuggestions(sugg);
      setSuggCache((prev) => ({ ...prev, [field]: sugg }));
    } catch { setSuggestions([]); }
    finally { suggInflight.current = null; setLoadingSugg(false); }
  }, []);

  useEffect(() => {
    const step = WIZARD_STEPS[wizardStep];
    setSuggestions([]);
    setWizardInput('');
    if (step?.aiField && !step.isArray && !step.isTone) {
      void fetchSuggestions(step.aiField);
    }
  }, [wizardStep, fetchSuggestions]);

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
    } catch { /* silently ignore */ }
    finally { setLogoUploading(false); }
  }

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
    } catch { setEnrichMsg(t.enrichError); }
    finally { setEnriching(false); }
  }

  function applyEnriched() {
    if (!enrichResult) return;
    setForm((prev) => ({ ...prev, ...enrichResult }));
    setEnrichResult(null);
    setEnrichMsg(null);
    setEnrichUrl('');
    setWizardStep(2);
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
    } catch { setArraySugg((p) => ({ ...p, [field]: [] })); }
    finally { setArraySuggLoading((p) => ({ ...p, [field]: false })); }
  }

  async function handleSave(isFinish = false) {
    if (saving) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name ?? orgName ?? null,
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
      if (isFinish) onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally { setSaving(false); }
  }

  function wizardNext() {
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardStep((s) => s + 1);
    } else {
      void handleSave(true);
    }
  }
  function wizardPrev() { if (wizardStep > 0) setWizardStep((s) => s - 1); }

  if (fetching) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>{t.loading}</span>
      </div>
    );
  }

  const step = WIZARD_STEPS[wizardStep];
  const progress = ((wizardStep + 1) / WIZARD_STEPS.length) * 100;

  const wizardQuestions: Record<WizardStepId, string> = {
    name: t.q_name, website: t.q_websiteUrl, mission: t.q_mission,
    industry: t.q_industry, language: t.q_language, locations: t.q_customerLocations,
    emojis: t.q_usesEmojis, comm_style: t.q_communicationStyle, tone: t.q_tone,
    tagline: t.q_tagline, colors: t.q_colors, fonts: t.q_fonts, logo: t.q_logo, notes: t.q_notes,
    company_size: t.q_companySize, niche: t.q_niche, target_audience: t.q_targetAudience,
    differentiators: t.q_differentiators, challenges: t.q_challenges, competitors: t.q_competitors,
  };

  function StepContent() {
    if (!step) return null;

    if (step.id === 'website') {
      return (
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1 }}
              value={enrichUrl || (form.website_url ?? '')}
              onChange={(e) => { setEnrichUrl(e.target.value); updateField('website_url', e.target.value || null); }}
              placeholder="https://tuempresa.com" type="url" />
            {(enrichUrl || form.website_url) && (
              <button type="button" onClick={() => void handleEnrich()} disabled={enriching}
                style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 600, fontSize: 13, cursor: enriching ? 'not-allowed' : 'pointer', opacity: enriching ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                {enriching ? t.enriching : t.enrichBtn}
              </button>
            )}
          </div>
          {enrichMsg && !enrichResult && (
            <p style={{ fontSize: 13, color: '#ff6b6b', marginTop: 8 }}>{enrichMsg}</p>
          )}
          {enrichResult && (
            <div style={{ marginTop: 14, background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 10 }}>{t.confirmEnriched}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {Object.entries(enrichResult).map(([k, v]) => {
                  if (!v || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)) return null;
                  const display = Array.isArray(v) ? (v as string[]).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
                  return (
                    <div key={k} style={{ fontSize: 13, display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--muted)', minWidth: 140, flexShrink: 0 }}>{k}</span>
                      <span style={{ color: 'var(--text)' }}>{display}</span>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={applyEnriched}
                style={{ marginTop: 12, padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {t.applyEnriched}
              </button>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.socialUrls}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SOCIAL_CHANNELS.map((ch) => (
                <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 68, textTransform: 'capitalize' }}>{ch}</span>
                  <input style={{ ...inputStyle, fontSize: 12, padding: '7px 10px' }}
                    value={(form.social_urls as Record<string, string> | undefined)?.[ch] ?? ''}
                    onChange={(e) => updateField('social_urls', { ...(form.social_urls ?? {}), [ch]: e.target.value || undefined })}
                    placeholder="URL" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (step.isBoolean) {
      const current = form.uses_emojis;
      return (
        <div style={{ display: 'flex', gap: 12 }}>
          {([true, false] as const).map((v) => (
            <button key={String(v)} type="button" onClick={() => updateField('uses_emojis', v)}
              style={{ padding: '10px 28px', borderRadius: 8, fontSize: 14, fontWeight: current === v ? 600 : 400, border: `1px solid ${current === v ? 'var(--accent)' : 'var(--border)'}`, background: current === v ? 'rgba(198,255,75,0.1)' : 'var(--bg)', color: current === v ? 'var(--accent)' : 'var(--text)', cursor: 'pointer' }}>
              {v ? t.yes : t.no}
            </button>
          ))}
        </div>
      );
    }

    if (step.isTone) {
      const activeTones = (form.tone ?? []) as BrandTone[];
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TONES.map(({ value, label }) => {
            const active = activeTones.includes(value);
            return (
              <button key={value} type="button"
                onClick={() => { const next = active ? activeTones.filter((x) => x !== value) : [...activeTones, value]; updateField('tone', next); }}
                style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: active ? 600 : 400, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'rgba(198,255,75,0.1)' : 'var(--bg)', color: active ? 'var(--accent)' : 'var(--text)', cursor: 'pointer' }}>
                {label[locale]}
              </button>
            );
          })}
        </div>
      );
    }

    if (step.isColor) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <ColorField label={locale === 'es' ? 'Color primario' : 'Primary color'} value={form.primary_color ?? '#000000'} onChange={(v) => updateField('primary_color', v)} />
          <ColorField label={locale === 'es' ? 'Color secundario' : 'Secondary color'} value={form.secondary_color ?? '#ffffff'} onChange={(v) => updateField('secondary_color', v)} />
          <ColorField label={locale === 'es' ? 'Color de acento' : 'Accent color'} value={form.accent_color ?? '#c6ff4b'} onChange={(v) => updateField('accent_color', v)} />
        </div>
      );
    }

    if (step.isFont) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>{locale === 'es' ? 'Fuente de títulos' : 'Heading font'}</label>
            <input style={inputStyle} value={form.font_heading ?? ''} onChange={(e) => updateField('font_heading', e.target.value || null)} placeholder="Syne, Playfair..." />
          </div>
          <div>
            <label style={labelStyle}>{locale === 'es' ? 'Fuente de texto' : 'Body font'}</label>
            <input style={inputStyle} value={form.font_body ?? ''} onChange={(e) => updateField('font_body', e.target.value || null)} placeholder="DM Sans, Inter..." />
          </div>
        </div>
      );
    }

    if (step.isCompanySize) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {COMPANY_SIZES.map((size) => (
            <button key={size} type="button" onClick={() => updateField('company_size', size)}
              style={{ padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: form.company_size === size ? 600 : 400, border: `1px solid ${form.company_size === size ? 'var(--accent)' : 'var(--border)'}`, background: form.company_size === size ? 'rgba(198,255,75,0.1)' : 'var(--bg)', color: form.company_size === size ? 'var(--accent)' : 'var(--text)', cursor: 'pointer' }}>
              {size} {locale === 'es' ? 'empleados' : 'employees'}
            </button>
          ))}
        </div>
      );
    }

    if (step.isSelect && step.selectOptions && step.field) {
      const fieldKey = step.field as keyof BrandKit;
      return (
        <select style={inputStyle} value={String(form[fieldKey] ?? '')}
          onChange={(e) => updateField(fieldKey, e.target.value as never)}>
          {step.selectOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }

    if (step.isArray && step.field) {
      const fieldKey = step.field as keyof BrandKit;
      const arrVal = (form[fieldKey] as string[] | undefined) ?? [];
      return (
        <ArrayChips
          value={arrVal}
          onChange={(v) => updateField(fieldKey, v as never)}
          placeholder={t.addPlaceholder}
          suggestions={step.aiField ? (arraySugg[step.aiField] ?? []) : undefined}
          loadingSugg={step.aiField ? (arraySuggLoading[step.aiField] ?? false) : false}
          onLoadSuggestions={step.aiField ? () => void loadArraySugg(step.aiField!) : undefined}
        />
      );
    }

    if (step.isLogo) {
      return (
        <div>
          {form.logo_url && (
            <div style={{ marginBottom: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.logo_url} alt="Logo" style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', padding: 8, background: '#fff' }} />
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f); }} />
            <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: logoUploading ? 'not-allowed' : 'pointer', opacity: logoUploading ? 0.7 : 1 }}>
              {logoUploading ? (locale === 'es' ? 'Subiendo...' : 'Uploading...') : (locale === 'es' ? '↑ Subir archivo' : '↑ Upload file')}
            </button>
            {form.logo_url && (
              <button type="button" onClick={() => updateField('logo_url', null)}
                style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: '#ff6b6b', fontSize: 13, cursor: 'pointer' }}>
                {locale === 'es' ? 'Quitar logo' : 'Remove logo'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>URL:</span>
            <input style={inputStyle} value={form.logo_url ?? ''}
              onChange={(e) => updateField('logo_url', e.target.value || null)}
              placeholder="https://..." type="url" />
          </div>
        </div>
      );
    }

    if (step.id === 'notes') {
      return (
        <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          value={form.notes ?? ''}
          onChange={(e) => updateField('notes', e.target.value || null)}
          placeholder={locale === 'es' ? 'Guías de estilo, instrucciones para la IA...' : 'Style guides, AI instructions...'} />
      );
    }

    const fieldKey = step.field as keyof BrandKit | null;
    const currentVal = fieldKey ? String(form[fieldKey] ?? '') : '';

    return (
      <div>
        {loadingSugg ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{t.loadingSuggestions}</p>
        ) : suggestions.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.suggestions}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {suggestions.map((s) => (
                <button key={s} type="button"
                  onClick={() => { if (fieldKey) updateField(fieldKey, s as never); setWizardInput(s); }}
                  style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, border: `1px solid ${(wizardInput || currentVal) === s ? 'var(--accent)' : 'var(--border)'}`, background: (wizardInput || currentVal) === s ? 'rgba(198,255,75,0.1)' : 'var(--bg)', color: (wizardInput || currentVal) === s ? 'var(--accent)' : 'var(--text)', cursor: 'pointer', textAlign: 'left' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <input style={inputStyle}
          value={wizardInput !== '' ? wizardInput : currentVal}
          onChange={(e) => { setWizardInput(e.target.value); if (fieldKey) updateField(fieldKey, e.target.value as never); }}
          placeholder={locale === 'es' ? 'O escribe tu respuesta...' : 'Or type your answer...'}
          onKeyDown={(e) => { if (e.key === 'Enter') wizardNext(); }} />
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{t.title}</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.subtitle}</p>
      </div>

      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>
          {step.section === 1 ? `1. ${t.sec1}` : `2. ${t.sec2}`}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.stepOf(wizardStep + 1, WIZARD_STEPS.length)}</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>

      <h3 style={{ fontFamily: 'var(--font-syne)', fontSize: 19, fontWeight: 700, marginBottom: 20, lineHeight: 1.3 }}>
        {wizardQuestions[step.id]}
      </h3>

      <StepContent />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
        <button type="button" onClick={wizardPrev} disabled={wizardStep === 0}
          style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: wizardStep === 0 ? 'var(--muted)' : 'var(--text)', fontSize: 13, cursor: wizardStep === 0 ? 'default' : 'pointer', opacity: wizardStep === 0 ? 0.4 : 1 }}>
          {t.prev}
        </button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {error && <span style={{ color: '#ff6b6b', fontSize: 12 }}>{error}</span>}
          {saved && <span style={{ color: 'var(--accent)', fontSize: 12 }}>{t.saved}</span>}
          {step.field !== 'name' && !step.isColor && !step.isFont && (
            <button type="button" onClick={wizardNext}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
              {t.skip}
            </button>
          )}
          <button type="button" onClick={wizardNext} disabled={saving}
            style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? t.saving : wizardStep === WIZARD_STEPS.length - 1 ? t.finish : t.next}
          </button>
        </div>
      </div>
    </div>
  );
}
