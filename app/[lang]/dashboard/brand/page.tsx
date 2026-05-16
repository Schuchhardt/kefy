'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { BrandKit, BrandTone, CompanySize } from '@/lib/brand-kit';

// ─── i18n ─────────────────────────────────────────────────────────────────────

type Locale = 'es' | 'en';

const T: Record<Locale, {
  title: string; subtitle: string;
  modeChat: string; modeForm: string;
  saving: string; saved: string;
  save: string; next: string; prev: string; skip: string; finish: string;
  loading: string; loadError: string; enrichBtn: string; enriching: string;
  enrichSuccess: string; enrichError: string; confirmEnriched: string;
  applyEnriched: string; addPlaceholder: string;
  stepOf: (current: number, total: number) => string;
  sec1: string; sec2: string;
  name: string; tagline: string; industry: string; websiteUrl: string;
  socialUrls: string; language: string; customerLocations: string;
  usesEmojis: string; communicationStyle: string; mission: string;
  tone: string; primaryColor: string; secondaryColor: string; accentColor: string;
  fontHeading: string; fontBody: string; notes: string;
  companySize: string; differentiators: string; challenges: string;
  niche: string; competitors: string; targetAudience: string;
  q_name: string; q_websiteUrl: string; q_mission: string; q_industry: string;
  q_language: string; q_customerLocations: string; q_usesEmojis: string;
  q_communicationStyle: string; q_tone: string; q_tagline: string;
  q_colors: string; q_fonts: string; q_notes: string;
  q_companySize: string; q_niche: string; q_targetAudience: string;
  q_differentiators: string; q_challenges: string; q_competitors: string;
  yes: string; no: string; suggestions: string; loadingSuggestions: string;
}> = {
  es: {
    title: 'Brand Kit',
    subtitle: 'Define la identidad y mercado de tu marca para que Kefy genere contenido consistente.',
    modeChat: 'Cuestionario', modeForm: 'Formulario',
    saving: 'Guardando...', saved: '✓ Guardado', save: 'Guardar cambios',
    next: 'Siguiente', prev: 'Anterior', skip: 'Saltar', finish: 'Finalizar',
    loading: 'Cargando brand kit...', loadError: 'Error al cargar el brand kit',
    enrichBtn: 'Analizar con IA', enriching: 'Analizando sitio...',
    enrichSuccess: '¡Encontramos información de tu marca!',
    enrichError: 'No pudimos analizar el sitio. Continuá manualmente.',
    confirmEnriched: 'Revisá la información que encontramos:',
    applyEnriched: 'Confirmar y continuar',
    addPlaceholder: 'Escribe y presiona Enter...',
    stepOf: (c, t) => `Paso ${c} de ${t}`,
    sec1: 'Quién eres', sec2: 'Tu mercado',
    name: 'Nombre de la marca', tagline: 'Tagline / Eslogan', industry: 'Industria',
    websiteUrl: 'Sitio web', socialUrls: 'Redes sociales', language: 'Idioma principal',
    customerLocations: 'Ubicación de clientes', usesEmojis: '¿Usas emojis?',
    communicationStyle: 'Estilo de comunicación', mission: 'Misión / Qué hacen',
    tone: 'Tono de voz', primaryColor: 'Color primario', secondaryColor: 'Color secundario',
    accentColor: 'Color de acento', fontHeading: 'Fuente de títulos', fontBody: 'Fuente de texto',
    notes: 'Notas adicionales', companySize: 'Tamaño de la empresa', differentiators: 'Diferenciadores',
    challenges: 'Dificultades / Retos', niche: 'Nicho', competitors: 'Competidores',
    targetAudience: 'Público objetivo',
    q_name: '¿Cuál es el nombre de tu marca?',
    q_websiteUrl: '¿Tenés un sitio web o página de redes sociales principal?',
    q_mission: '¿Qué hace tu empresa? ¿Cuál es su misión?',
    q_industry: '¿En qué industria opera tu marca?',
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
    yes: 'Sí', no: 'No',
    suggestions: 'Sugerencias IA', loadingSuggestions: 'Cargando sugerencias...',
  },
  en: {
    title: 'Brand Kit',
    subtitle: 'Define your brand identity and market so Kefy generates consistent content.',
    modeChat: 'Questionnaire', modeForm: 'Form',
    saving: 'Saving...', saved: '✓ Saved', save: 'Save changes',
    next: 'Next', prev: 'Previous', skip: 'Skip', finish: 'Finish',
    loading: 'Loading brand kit...', loadError: 'Error loading brand kit',
    enrichBtn: 'Analyze with AI', enriching: 'Analyzing site...',
    enrichSuccess: 'We found information about your brand!',
    enrichError: 'Could not analyze the site. Continue manually.',
    confirmEnriched: 'Review the information we found:',
    applyEnriched: 'Confirm and continue',
    addPlaceholder: 'Type and press Enter...',
    stepOf: (c, t) => `Step ${c} of ${t}`,
    sec1: 'Who you are', sec2: 'Your market',
    name: 'Brand name', tagline: 'Tagline', industry: 'Industry',
    websiteUrl: 'Website', socialUrls: 'Social media', language: 'Primary language',
    customerLocations: 'Customer locations', usesEmojis: 'Do you use emojis?',
    communicationStyle: 'Communication style', mission: 'Mission / What you do',
    tone: 'Brand voice', primaryColor: 'Primary color', secondaryColor: 'Secondary color',
    accentColor: 'Accent color', fontHeading: 'Heading font', fontBody: 'Body font',
    notes: 'Additional notes', companySize: 'Company size', differentiators: 'Differentiators',
    challenges: 'Challenges', niche: 'Niche', competitors: 'Competitors',
    targetAudience: 'Target audience',
    q_name: 'What is your brand name?',
    q_websiteUrl: 'Do you have a website or main social media page?',
    q_mission: 'What does your company do? What is its mission?',
    q_industry: 'What industry does your brand operate in?',
    q_language: 'What language do you communicate in with your customers?',
    q_customerLocations: 'Where are your customers? (countries or cities)',
    q_usesEmojis: 'Does your brand use emojis in communication?',
    q_communicationStyle: "How would you describe your brand's communication style?",
    q_tone: "What is your brand's voice tone? (you can pick several)",
    q_tagline: 'What is your brand tagline or slogan?',
    q_colors: 'Define your brand color palette',
    q_fonts: 'What fonts does your brand use?',
    q_notes: 'Any additional style guide or special AI instructions',
    q_companySize: 'How many employees does your company have?',
    q_niche: "What is your brand's specific niche?",
    q_targetAudience: 'Who is your target audience?',
    q_differentiators: 'What differentiates your brand from competitors?',
    q_challenges: 'What are the main challenges of your business?',
    q_competitors: 'Who are your main competitors?',
    yes: 'Yes', no: 'No',
    suggestions: 'AI Suggestions', loadingSuggestions: 'Loading suggestions...',
  },
};

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

// ─── Wizard step definitions ──────────────────────────────────────────────────

type WizardStepId =
  | 'name' | 'website' | 'mission' | 'industry' | 'language'
  | 'locations' | 'emojis' | 'comm_style' | 'tone' | 'tagline'
  | 'colors' | 'fonts' | 'notes'
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
  { id: 'notes',           section: 1, field: 'notes' },
  { id: 'company_size',    section: 2, field: 'company_size', isCompanySize: true },
  { id: 'niche',           section: 2, field: 'niche', aiField: 'niche' },
  { id: 'target_audience', section: 2, field: 'target_audience', aiField: 'target_audience' },
  { id: 'differentiators', section: 2, field: 'differentiators', isArray: true, aiField: 'differentiators' },
  { id: 'challenges',      section: 2, field: 'challenges', isArray: true, aiField: 'challenges' },
  { id: 'competitors',     section: 2, field: 'competitors', isArray: true, aiField: 'competitors' },
];

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
  const [mode, setMode] = useState<'chat' | 'form'>('chat');
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<Partial<BrandKit>>({});
  const suggCacheRef = useRef<Record<string, string[]>>({});
  const localeRef = useRef<Locale>('es');
  const suggInflight = useRef<string | null>(null);

  // Wizard state
  const [wizardStep, setWizardStep] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [suggCache, setSuggCache] = useState<Record<string, string[]>>({});
  const [wizardInput, setWizardInput] = useState('');

  // Enrichment state
  const [enrichUrl, setEnrichUrl] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<Partial<BrandKit> | null>(null);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

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
  }, [authLoading]);

  // Sync refs on every render so callbacks always see latest values without re-creating
  formRef.current = form;
  suggCacheRef.current = suggCache;
  localeRef.current = locale;

  function updateField<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  // Fetch AI suggestions for wizard text fields — stable ref, no reactive deps
  const fetchSuggestions = useCallback(async (field: string) => {
    // Skip if already in-flight for this field or cached
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
    } catch {
      setSuggestions([]);
    } finally {
      suggInflight.current = null;
      setLoadingSugg(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load suggestions only when the wizard step changes (not on every re-render)
  useEffect(() => {
    const step = WIZARD_STEPS[wizardStep];
    setSuggestions([]);
    setWizardInput('');
    if (step?.aiField && !step.isArray && !step.isTone) {
      void fetchSuggestions(step.aiField);
    }
  }, [wizardStep]); // fetchSuggestions is stable (empty deps), safe to omit

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
    // Jump to mission step after enrichment in wizard mode
    if (mode === 'chat') setWizardStep(2);
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
      font_body: form.font_body ?? null, notes: form.notes ?? null,
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

  // Wizard navigation
  function wizardNext() {
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardStep((s) => s + 1);
    } else {
      void handleSave();
      setMode('form');
    }
  }
  function wizardPrev() { if (wizardStep > 0) setWizardStep((s) => s - 1); }

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

  const step = WIZARD_STEPS[wizardStep];
  const progress = ((wizardStep + 1) / WIZARD_STEPS.length) * 100;

  const wizardQuestions: Record<WizardStepId, string> = {
    name: t.q_name, website: t.q_websiteUrl, mission: t.q_mission,
    industry: t.q_industry, language: t.q_language, locations: t.q_customerLocations,
    emojis: t.q_usesEmojis, comm_style: t.q_communicationStyle, tone: t.q_tone,
    tagline: t.q_tagline, colors: t.q_colors, fonts: t.q_fonts, notes: t.q_notes,
    company_size: t.q_companySize, niche: t.q_niche, target_audience: t.q_targetAudience,
    differentiators: t.q_differentiators, challenges: t.q_challenges, competitors: t.q_competitors,
  };

  // ─── Wizard step content ────────────────────────────────────────────────────

  function WizardStepContent() {
    if (!step) return null;

    // Website + social enrichment step
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
                    placeholder={`URL`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Boolean
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

    // Tone multi-select
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

    // Colors
    if (step.isColor) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <ColorField label={t.primaryColor} value={form.primary_color ?? '#000000'} onChange={(v) => updateField('primary_color', v)} />
          <ColorField label={t.secondaryColor} value={form.secondary_color ?? '#ffffff'} onChange={(v) => updateField('secondary_color', v)} />
          <ColorField label={t.accentColor} value={form.accent_color ?? '#c6ff4b'} onChange={(v) => updateField('accent_color', v)} />
        </div>
      );
    }

    // Fonts
    if (step.isFont) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>{t.fontHeading}</label>
            <input style={inputStyle} value={form.font_heading ?? ''} onChange={(e) => updateField('font_heading', e.target.value || null)} placeholder="Syne, Playfair..." />
          </div>
          <div>
            <label style={labelStyle}>{t.fontBody}</label>
            <input style={inputStyle} value={form.font_body ?? ''} onChange={(e) => updateField('font_body', e.target.value || null)} placeholder="DM Sans, Inter..." />
          </div>
        </div>
      );
    }

    // Company size
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

    // Select
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

    // Array chips
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

    // Notes textarea
    if (step.id === 'notes') {
      return (
        <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          value={form.notes ?? ''}
          onChange={(e) => updateField('notes', e.target.value || null)}
          placeholder={locale === 'es' ? 'Guías de estilo, instrucciones para la IA...' : 'Style guides, AI instructions...'} />
      );
    }

    // Default: text input with AI suggestions chips
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

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '40px 48px', maxWidth: 840 }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700, marginBottom: 6 }}>{t.title}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.subtitle}</p>
        </div>
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, gap: 4 }}>
          {(['chat', 'form'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              style={{ padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: mode === m ? 600 : 400, border: 'none', background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? '#000' : 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s' }}>
              {m === 'chat' ? t.modeChat : t.modeForm}
            </button>
          ))}
        </div>
      </div>

      {/* ── CHAT MODE ── */}
      {mode === 'chat' && step && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px' }}>
          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>
              {step.section === 1 ? `1. ${t.sec1}` : `2. ${t.sec2}`}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.stepOf(wizardStep + 1, WIZARD_STEPS.length)}</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, marginBottom: 28, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.3s ease' }} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 20, fontWeight: 700, marginBottom: 20, lineHeight: 1.3 }}>
            {wizardQuestions[step.id]}
          </h2>
          {WizardStepContent()}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
            <button type="button" onClick={wizardPrev} disabled={wizardStep === 0}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: wizardStep === 0 ? 'var(--muted)' : 'var(--text)', fontSize: 13, cursor: wizardStep === 0 ? 'default' : 'pointer', opacity: wizardStep === 0 ? 0.4 : 1 }}>
              {t.prev}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              {step.field !== 'name' && !step.isColor && !step.isFont && (
                <button type="button" onClick={wizardNext}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
                  {t.skip}
                </button>
              )}
              <button type="button" onClick={wizardNext}
                style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {wizardStep === WIZARD_STEPS.length - 1 ? t.finish : t.next}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FORM MODE ── */}
      {mode === 'form' && (
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
                  style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 600, fontSize: 13, cursor: !form.website_url ? 'not-allowed' : 'pointer', opacity: !form.website_url ? 0.5 : 1, whiteSpace: 'nowrap' }}>
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
                  style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label={t.fontHeading}>
                <input style={inputStyle} value={form.font_heading ?? ''} onChange={(e) => updateField('font_heading', e.target.value || null)} placeholder="Syne, Playfair..." />
              </Field>
              <Field label={t.fontBody}>
                <input style={inputStyle} value={form.font_body ?? ''} onChange={(e) => updateField('font_body', e.target.value || null)} placeholder="DM Sans, Inter..." />
              </Field>
            </div>
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
              style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? t.saving : t.save}
            </button>
            {saved && <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>{t.saved}</span>}
            {error && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</span>}
          </div>
        </form>
      )}

      {/* Save shortcut in chat mode */}
      {mode === 'chat' && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? t.saving : t.save}
          </button>
          {saved && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{t.saved}</span>}
          {error && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

