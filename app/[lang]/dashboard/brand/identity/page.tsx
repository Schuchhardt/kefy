'use client';

// ─── Mi marca › Identidad ────────────────────────────────────────────────────
//
// El Brand Kit: quién eres, cómo hablas y cómo te ves. Guardar es explícito,
// pero la barra de guardado va pegada al pie de la vista y dice en todo
// momento si hay cambios sin guardar, si se está guardando o si ya se guardó.
// Antes había un solo «Guardar» al final de seis tarjetas y el «Guardado»
// aparecía junto a él, fuera de vista. Sin cambios, el botón está desactivado.
//
// Solo se envían los campos que cambiaron respecto de lo último que se cargó o
// guardó (PATCH parcial): así Identidad, Mercado y el asistente no se pisan.
// Si el asistente edita la marca mientras hay cambios pendientes, se toma lo
// del servidor y se conservan los campos que el usuario tocó.
//
// La validación es la del servidor (lib/brand-kit.ts) hecha antes de enviar y
// con mensajes en el idioma de la app, en lugar de los globos nativos del
// navegador (que salen en el idioma del navegador y no nombran el campo).

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useBrand } from '@/lib/brand-context';
import { useDataChanged } from '@/lib/data-events';
import { CHANNEL_LABELS } from '@/lib/channels';
import { toLocale } from '@/lib/i18n';
import type { BrandKit, BrandTone } from '@/types/brand-kit';
import BrandImageField from '@/components/dashboard/BrandImageField';
import GoogleFontSelect from '@/components/ui/GoogleFontSelect';
import { SkeletonBlock, FormSectionSkeleton } from '@/components/ui/Skeleton';
import SectionCard from '@/components/ui/SectionCard';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import ArrayChips from '@/components/ui/ArrayChips';
import Button, { Spinner } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import esT, { type BrandCopy } from '@/locales/es/dashboard/brand';
import enT from '@/locales/en/dashboard/brand';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';
import styles from '../brand-form.module.css';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TONES: BrandTone[] = [
  'professional', 'friendly', 'authoritative', 'playful',
  'inspirational', 'educational', 'casual', 'formal',
];

const SOCIAL_CHANNELS = ['instagram', 'linkedin', 'twitter', 'facebook', 'tiktok', 'youtube'] as const;

// Cada idioma con su nombre en ese idioma: no se traducen.
const LANGUAGES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

// Colores por defecto del selector cuando la marca no eligió ninguno.
const COLOR_FIELDS = [
  { key: 'primary_color', label: 'primaryColor', fallback: '#000000' },
  { key: 'secondary_color', label: 'secondaryColor', fallback: '#ffffff' },
  { key: 'accent_color', label: 'accentColor', fallback: '#c6ff4b' },
] as const;

// Lo mismo que acepta /api/brand-kit/assets (lib/brand-kit.ts).
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Campos que edita esta página. */
const IDENTITY_FIELDS = [
  'name', 'tagline', 'industry', 'website_url', 'social_urls', 'language',
  'customer_locations', 'uses_emojis', 'communication_style', 'mission', 'tone',
  'primary_color', 'secondary_color', 'accent_color', 'font_heading', 'font_body',
  'logo_url', 'notes',
] as const;
/** Son de Mercado, pero el análisis de la web también los trae y se muestran al confirmarlo. */
const ENRICHED_MARKET_FIELDS = ['niche', 'target_audience', 'competitors'] as const;
const FIELDS: readonly FieldKey[] = [...IDENTITY_FIELDS, ...ENRICHED_MARKET_FIELDS];

type FieldKey = (typeof IDENTITY_FIELDS)[number] | (typeof ENRICHED_MARKET_FIELDS)[number];
type Kit = Partial<BrandKit>;
type ValidatedKey = 'name' | 'website_url' | 'logo_url' | 'primary_color' | 'secondary_color' | 'accent_color';
type Errors = Partial<Record<ValidatedKey, string>>;

/** Etiqueta de cada campo del Brand Kit (resultado del análisis, errores del servidor). */
const LABEL_KEYS: Record<string, keyof BrandCopy> = {
  name: 'name', tagline: 'tagline', industry: 'industry', website_url: 'websiteUrl',
  social_urls: 'socialUrls', language: 'language', customer_locations: 'customerLocations',
  uses_emojis: 'usesEmojis', communication_style: 'communicationStyle', mission: 'mission',
  tone: 'tone', primary_color: 'primaryColor', secondary_color: 'secondaryColor',
  accent_color: 'accentColor', font_heading: 'fontHeading', font_body: 'fontBody',
  logo_url: 'logo', notes: 'notes', niche: 'niche', target_audience: 'targetAudience',
  competitors: 'competitors',
};

// ─── Comparar, fusionar y validar ─────────────────────────────────────────────

/** Valor de un campo tal como se guarda: vacío → null, listas y objetos limpios. */
function normalized(kit: Kit, key: FieldKey): unknown {
  const v = kit[key];
  switch (key) {
    case 'name':
      return typeof v === 'string' ? v : '';
    case 'language':
      return (v as string | undefined) || 'es';
    case 'uses_emojis':
      return v ?? false;
    case 'tone':
    case 'customer_locations':
    case 'competitors':
      return Array.isArray(v) ? v : [];
    case 'social_urls': {
      const out: Record<string, string> = {};
      const entries = Object.entries((v ?? {}) as Record<string, string | undefined>)
        .sort(([a], [b]) => a.localeCompare(b));
      for (const [network, url] of entries) if (typeof url === 'string' && url.trim()) out[network] = url;
      return out;
    }
    default:
      return typeof v === 'string' ? (v.trim() ? v : null) : (v ?? null);
  }
}

function sameField(key: FieldKey, a: Kit, b: Kit): boolean {
  let x = normalized(a, key);
  let y = normalized(b, key);
  // El orden de los tonos no significa nada.
  if (key === 'tone') { x = [...(x as string[])].sort(); y = [...(y as string[])].sort(); }
  return JSON.stringify(x) === JSON.stringify(y);
}

/** Campos de `form` que difieren de `base`, con el valor que se envía. */
function changes(form: Kit, base: Kit): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FIELDS) if (!sameField(key, form, base)) out[key] = normalized(form, key);
  return out;
}

/**
 * Lo nuevo del servidor sin perder lo que el usuario cambió: los campos de
 * `local` que difieren de `base` (lo que había cuando empezó a editar) se
 * quedan como están.
 */
function mergeKit(server: Kit, base: Kit, local: Kit): Kit {
  const merged: Record<string, unknown> = { ...server };
  for (const key of FIELDS) if (!sameField(key, local, base)) merged[key] = local[key];
  return merged as Kit;
}

/** `tuempresa.com` → `https://tuempresa.com`; null si no es una URL. */
function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isUrl(value: string): boolean {
  try { new URL(value); return true; } catch { return false; }
}

/**
 * Las mismas reglas que valida el servidor, con mensajes para cada campo. En
 * el orden de la página: al guardar, el foco va al primer campo con error.
 */
function validate(form: Kit, t: BrandCopy): Errors {
  const errors: Errors = {};
  if (!(form.name ?? '').trim()) errors.name = t.identity.nameRequired;
  // El servidor le añade https:// a la web, pero no al logo.
  if (form.website_url?.trim() && !normalizeWebsiteUrl(form.website_url)) errors.website_url = t.identity.urlInvalid;
  for (const { key } of COLOR_FIELDS) {
    const value = form[key];
    if (value && !HEX.test(value)) errors[key] = t.identity.colorInvalid;
  }
  if (form.logo_url?.trim() && !isUrl(form.logo_url.trim())) errors.logo_url = t.identity.urlInvalid;
  return errors;
}

// ─── Página ───────────────────────────────────────────────────────────────────

type EnrichState =
  | { status: 'idle' | 'loading' | 'error' | 'applied' }
  | { status: 'result'; data: Kit };

type LogoState = { status: 'idle' | 'uploading' | 'uploaded' } | { status: 'error'; message: string };

export default function BrandIdentityPage() {
  const params = useParams<{ lang: string }>();
  const locale = toLocale(params?.lang);
  const t = locale === 'en' ? enT : esT;
  const ti = t.identity;
  const common = locale === 'en' ? enCommon : esCommon;

  const { loading: authLoading, org, role } = useAuth();
  const { refresh: refreshBrands } = useBrand();
  // Solo owner/admin escriben el Brand Kit. Sin rol conocido se deja intentar:
  // el servidor responde 403 y se explica.
  const canEdit = !role || role === 'owner' || role === 'admin';

  const uid = useId().replace(/:/g, '');
  const formId = `identity-form-${uid}`;
  const fid = (key: string) => `identity-${uid}-${key}`;

  // `baseline` es lo último que se cargó o guardó; `form`, lo que se edita.
  const [{ form, baseline }, setKit] = useState<{ form: Kit; baseline: Kit }>({ form: {}, baseline: {} });
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());

  const [enrich, setEnrich] = useState<EnrichState>({ status: 'idle' });
  const [logo, setLogo] = useState<LogoState>({ status: 'idle' });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [sugg, setSugg] = useState<{ items?: string[]; loading: boolean; error: string | null }>({ loading: false, error: null });

  // ── Carga ────────────────────────────────────────────────────────────────
  // `initial`: la primera carga muestra el esqueleto; las recargas (el
  // asistente editó la marca) son silenciosas y conservan lo que se editó.
  const orgName = org?.name;
  const loadKit = useCallback(async (initial: boolean) => {
    if (initial) { setFetching(true); setLoadError(false); }
    try {
      const res = await fetch('/api/brand-kit', { credentials: 'include' });
      if (!res.ok) throw new Error('load');
      const { kit } = await res.json() as { kit: BrandKit };
      setKit((prev) => {
        if (!initial) return { baseline: kit, form: mergeKit(kit, prev.baseline, prev.form) };
        const next: Kit = { ...kit };
        // Sin nombre propio todavía: se propone el de la organización (queda
        // como cambio sin guardar hasta que se confirme).
        if ((!kit.name || kit.name === 'Mi marca') && orgName) next.name = orgName;
        return { baseline: kit, form: next };
      });
    } catch {
      if (initial) setLoadError(true);
    } finally {
      if (initial) setFetching(false);
    }
  }, [orgName]);

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (authLoading || loadedOnce.current) return;
    loadedOnce.current = true;
    void loadKit(true);
  }, [authLoading, loadKit]);

  // El asistente editó el perfil de marca: se recarga sin perder lo editado.
  useDataChanged(['brand-kit'], () => { if (!authLoading && !fetching) void loadKit(false); });

  const pending = changes(form, baseline);
  const dirty = Object.keys(pending).length > 0;

  // Cerrar o recargar la pestaña con cambios sin guardar pide confirmación.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function updateField<K extends keyof BrandKit>(key: K, value: BrandKit[K] | null) {
    setKit((prev) => ({ ...prev, form: { ...prev.form, [key]: value } }));
    setSaveError(null);
  }

  function touch(key: ValidatedKey) {
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  const errors = validate(form, t);
  const errorFor = (key: ValidatedKey) => (submitted || touched.has(key) ? errors[key] : undefined);

  // ── Guardar ──────────────────────────────────────────────────────────────
  async function saveErrorMessage(res: Response): Promise<string> {
    if (res.status === 403) return t.errors.forbidden;
    if (res.status === 422) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      const field = /^([a-z_]+) (?:must|items)/.exec(body.error ?? '')?.[1];
      const labelKey = field ? LABEL_KEYS[field] : undefined;
      if (labelKey) return t.errors.invalidField(t[labelKey] as string);
    }
    return t.errors.save;
  }

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (saving || !canEdit) return;

    const invalid = (Object.keys(errors) as ValidatedKey[]);
    if (invalid.length > 0) {
      setSubmitted(true);
      setSaveError(t.saveBar.invalid);
      document.getElementById(fid(invalid[0]))?.focus();
      return;
    }
    if (!dirty) return;

    const sent = form;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/brand-kit', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      if (!res.ok) { setSaveError(await saveErrorMessage(res)); return; }
      const { kit } = await res.json() as { kit: BrandKit };
      // Lo que se editó mientras se guardaba sigue pendiente.
      setKit((prev) => ({ baseline: kit, form: mergeKit(kit, sent, prev.form) }));
      setJustSaved(true);
      setSubmitted(false);
      setTouched(new Set());
      // El nombre y el logo se ven en el selector de marca.
      if ('name' in pending || 'logo_url' in pending) void refreshBrands();
    } catch {
      setSaveError(common.errors.network);
    } finally {
      setSaving(false);
    }
  }

  // ── Analizar la web ──────────────────────────────────────────────────────
  async function handleEnrich() {
    const raw = form.website_url ?? '';
    const url = normalizeWebsiteUrl(raw);
    if (!url) { setEnrich({ status: 'error' }); return; }
    if (url !== raw.trim()) updateField('website_url', url);

    setEnrich({ status: 'loading' });
    try {
      const res = await fetch('/api/brand-kit/enrich-url', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, lang: locale }),
      });
      if (!res.ok) throw new Error('enrich');
      const { extracted } = await res.json() as { extracted: Kit };
      const useful = Object.entries(extracted ?? {}).filter(([key, value]) =>
        (FIELDS as readonly string[]).includes(key) && hasValue(value));
      if (useful.length === 0) throw new Error('empty');
      setEnrich({ status: 'result', data: Object.fromEntries(useful) as Kit });
    } catch {
      setEnrich({ status: 'error' });
    }
  }

  function applyEnriched() {
    if (enrich.status !== 'result') return;
    const data = enrich.data;
    setKit((prev) => ({ ...prev, form: { ...prev.form, ...data } }));
    setEnrich({ status: 'applied' });
  }

  function display(key: string, value: unknown): string {
    if (Array.isArray(value)) {
      return key === 'tone'
        ? value.map((v) => t.tones[v as BrandTone] ?? String(v)).join(', ')
        : value.join(', ');
    }
    if (typeof value === 'boolean') return value ? t.yes : t.no;
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, string>)
        .map(([network, url]) => `${CHANNEL_LABELS[network as keyof typeof CHANNEL_LABELS] ?? network}: ${url}`)
        .join(' · ');
    }
    if (key === 'language') return LANGUAGES.find((l) => l.value === value)?.label ?? String(value);
    return String(value);
  }

  // ── Logo ─────────────────────────────────────────────────────────────────
  async function handleLogoUpload(file: File) {
    const reset = () => { if (logoInputRef.current) logoInputRef.current.value = ''; };
    if (!LOGO_TYPES.includes(file.type)) { setLogo({ status: 'error', message: ti.logoBadType }); reset(); return; }
    if (file.size > MAX_LOGO_BYTES) { setLogo({ status: 'error', message: ti.logoTooBig }); reset(); return; }

    setLogo({ status: 'uploading' });
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'logo');
      fd.append('label', 'Logo');
      const res = await fetch('/api/brand-kit/assets', { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) {
        setLogo({ status: 'error', message: res.status === 403 ? t.errors.forbidden : ti.logoFailed });
        return;
      }
      const { asset } = await res.json() as { asset: { public_url: string } };
      updateField('logo_url', asset.public_url);
      setLogo({ status: 'uploaded' });
    } catch {
      setLogo({ status: 'error', message: ti.logoFailed });
    } finally {
      reset();
    }
  }

  // ── Sugerencias (1 crédito cada vez: solo con el botón) ──────────────────
  async function requestSuggestions() {
    setSugg({ loading: true, error: null });
    try {
      const res = await fetch('/api/brand-kit/ai-suggest', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'customer_locations', context: form, lang: locale }),
      });
      const body = await res.json().catch(() => ({})) as { suggestions?: unknown; error?: unknown };
      if (!res.ok) {
        // Sin créditos o con el límite alcanzado, el servidor ya explica por
        // qué en el idioma pedido.
        const explained = (res.status === 402 || res.status === 429) && typeof body.error === 'string';
        setSugg({ loading: false, error: explained ? body.error as string : t.errors.suggestions });
        return;
      }
      const items = Array.isArray(body.suggestions) ? body.suggestions.filter((s): s is string => typeof s === 'string') : [];
      setSugg({ items, loading: false, error: null });
    } catch {
      setSugg({ loading: false, error: t.errors.suggestions });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (authLoading || fetching) {
    return (
      <div className="page" style={{ maxWidth: 840 }} aria-busy="true">
        <p role="status" className="sr-only">{t.loading}</p>
        <div style={{ marginBottom: 28 }}>
          <SkeletonBlock width="min(220px, 70%)" height={26} style={{ marginBottom: 10 }} />
          <SkeletonBlock width="min(340px, 100%)" height={14} />
        </div>
        <FormSectionSkeleton fields={2} />
        <FormSectionSkeleton fields={2} />
        <FormSectionSkeleton fields={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page" style={{ maxWidth: 840 }}>
        <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
          <p style={{ margin: '0 0 10px' }}>{t.loadError}</p>
          <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={() => { void loadKit(true); }}>
            {common.actions.retry}
          </Button>
        </Notice>
      </div>
    );
  }

  const social = (form.social_urls ?? {}) as Record<string, string | undefined>;
  const tones = form.tone ?? [];
  const status = saving ? 'saving' : dirty ? 'dirty' : justSaved ? 'saved' : 'clean';
  const enrichAnnouncement =
    enrich.status === 'loading' ? t.enriching
      : enrich.status === 'result' ? t.enrichSuccess
        : enrich.status === 'applied' ? ti.enrichApplied
          : '';
  const logoStatus = logo.status === 'uploading' ? ti.logoUploading : logo.status === 'uploaded' ? ti.logoUploaded : '';

  return (
    <div className="page" style={{ maxWidth: 840 }}>
      <header className="page-header">
        <div>
          <h1>{ti.title}</h1>
          <p>{ti.subtitle}</p>
        </div>
      </header>

      {!canEdit && (
        <div className={styles.block}>
          <Notice tone="info" live={false} icon={<Icon name="lock" size={16} />}>{t.errors.readOnly}</Notice>
        </div>
      )}

      {/* La imagen de la marca identifica a la marca dentro de la app (el
          selector), no en el contenido generado — eso lo hace el logo del
          Brand Kit, más abajo. Va fuera del <form> porque se guarda sola al
          subirla, sin esperar a que se envíe el formulario. */}
      <div className={styles.block}>
        <BrandImageField locale={locale} />
      </div>

      <form id={formId} onSubmit={handleSave} noValidate aria-label={ti.title}>
        <fieldset className={styles.fieldset} disabled={!canEdit}>
          {/* ── Datos básicos ── */}
          <SectionCard title={ti.sections.basics}>
            <div className={styles.stack}>
              <div className="grid-2">
                <Field id={fid('name')} label={t.name} required error={errorFor('name')}>
                  <Input
                    value={form.name ?? ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    onBlur={() => touch('name')}
                    placeholder={ti.namePlaceholder}
                    maxLength={100}
                    autoComplete="organization"
                  />
                </Field>
                <Field label={t.industry}>
                  <Input
                    value={form.industry ?? ''}
                    onChange={(e) => updateField('industry', e.target.value || null)}
                    placeholder={ti.industryPlaceholder}
                  />
                </Field>
              </div>
              <Field label={t.tagline}>
                <Input
                  value={form.tagline ?? ''}
                  onChange={(e) => updateField('tagline', e.target.value || null)}
                  placeholder={ti.taglinePlaceholder}
                />
              </Field>
              <Field label={t.mission}>
                <Textarea
                  value={form.mission ?? ''}
                  onChange={(e) => updateField('mission', e.target.value || null)}
                  placeholder={ti.missionPlaceholder}
                  rows={3}
                />
              </Field>
            </div>
          </SectionCard>

          {/* ── Web y redes ── */}
          <SectionCard title={ti.sections.web}>
            <div className={styles.stack}>
              <Field id={fid('website_url')} label={t.websiteUrl} hint={ti.websiteHint} error={errorFor('website_url')}>
                {(p) => (
                  <div className={styles.inlineRow}>
                    <Input
                      {...p}
                      className={styles.grow}
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      value={form.website_url ?? ''}
                      onChange={(e) => updateField('website_url', e.target.value || null)}
                      onBlur={() => touch('website_url')}
                      placeholder="https://…"
                    />
                    <Button
                      variant="secondary"
                      icon={<Icon name="sparkles" size={16} />}
                      loading={enrich.status === 'loading'}
                      disabled={!form.website_url?.trim()}
                      onClick={() => { void handleEnrich(); }}
                    >
                      {enrich.status === 'loading' ? t.enriching : t.enrichBtn}
                    </Button>
                  </div>
                )}
              </Field>

              <p role="status" className="sr-only">{enrichAnnouncement}</p>
              {enrich.status === 'error' && (
                <Notice tone="danger" icon={<Icon name="alert" size={16} />}>{t.enrichError}</Notice>
              )}
              {enrich.status === 'applied' && (
                <Notice tone="success" live={false} icon={<Icon name="check-circle" size={16} />}>{ti.enrichApplied}</Notice>
              )}
              {enrich.status === 'result' && (
                <section className={styles.enrichBox} aria-labelledby={`${fid('enrich')}-title`}>
                  <p id={`${fid('enrich')}-title`} className={styles.enrichTitle}>{t.confirmEnriched}</p>
                  <dl className={styles.enrichList}>
                    {Object.entries(enrich.data).map(([key, value]) => (
                      <div key={key} style={{ display: 'contents' }}>
                        <dt>{LABEL_KEYS[key] ? t[LABEL_KEYS[key]] as string : key}</dt>
                        <dd>
                          {key.endsWith('_color') && typeof value === 'string' && HEX.test(value) && (
                            <span className={styles.enrichSwatch} style={{ background: value }} aria-hidden="true" />
                          )}
                          {display(key, value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className={styles.actions}>
                    <Button variant="primary" icon={<Icon name="check" size={16} />} onClick={applyEnriched}>
                      {ti.enrichApply}
                    </Button>
                    <Button variant="ghost" onClick={() => setEnrich({ status: 'idle' })}>{ti.enrichDiscard}</Button>
                  </div>
                </section>
              )}

              <div className="ui-field">
                <span className="ui-label" id={fid('social-label')}>{t.socialUrls}</span>
                <p className="ui-hint" id={fid('social-hint')}>{ti.socialHint}</p>
                <div
                  role="group"
                  aria-labelledby={fid('social-label')}
                  aria-describedby={fid('social-hint')}
                  className="auto-grid"
                  style={{ '--min': '220px', '--gap': '12px', marginTop: 4 } as CSSProperties}
                >
                  {SOCIAL_CHANNELS.map((channel) => (
                    <Field key={channel} label={CHANNEL_LABELS[channel]}>
                      <Input
                        inputMode="url"
                        autoComplete="off"
                        value={social[channel] ?? ''}
                        onChange={(e) => updateField('social_urls', { ...social, [channel]: e.target.value || undefined })}
                        placeholder={ti.socialPlaceholder}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* ── Idioma y clientes ── */}
          <SectionCard title={ti.sections.audience}>
            <div className={styles.stack}>
              <div className="grid-2">
                <Field label={t.language}>
                  <Select value={form.language ?? 'es'} onChange={(e) => updateField('language', e.target.value)}>
                    {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </Select>
                </Field>
                <div className="ui-field">
                  <span className="ui-label" id={fid('emojis')}>{t.usesEmojis}</span>
                  <div className="ui-segmented" role="group" aria-labelledby={fid('emojis')}>
                    {([true, false] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        aria-pressed={(form.uses_emojis ?? false) === v}
                        onClick={() => updateField('uses_emojis', v)}
                      >
                        {v ? t.yes : t.no}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Field label={t.customerLocations}>
                {(p) => (
                  <div>
                    <ArrayChips
                      id={p.id}
                      aria-describedby={p['aria-describedby']}
                      lang={locale}
                      value={form.customer_locations ?? []}
                      onChange={(v) => updateField('customer_locations', v)}
                      placeholder={ti.locationsPlaceholder}
                      suggestions={sugg.items}
                      loadingSuggestions={sugg.loading}
                      onRequestSuggestions={canEdit ? () => { void requestSuggestions(); } : undefined}
                    />
                    {sugg.error && <p role="alert" className="ui-error" style={{ marginTop: 6 }}>{sugg.error}</p>}
                    {sugg.items?.length === 0 && <p role="status" className="ui-hint" style={{ marginTop: 6 }}>{t.errors.noSuggestions}</p>}
                  </div>
                )}
              </Field>
            </div>
          </SectionCard>

          {/* ── Voz de la marca ── */}
          <SectionCard title={ti.sections.voice}>
            <div className={styles.stack}>
              <Field label={t.communicationStyle}>
                <Input
                  value={form.communication_style ?? ''}
                  onChange={(e) => updateField('communication_style', e.target.value || null)}
                  placeholder={ti.communicationPlaceholder}
                />
              </Field>
              <div className="ui-field">
                <span className="ui-label" id={fid('tone')}>{t.tone}</span>
                <div
                  className="ui-segmented"
                  role="group"
                  aria-labelledby={fid('tone')}
                  aria-describedby={fid('tone-hint')}
                >
                  {TONES.map((tone) => {
                    const active = tones.includes(tone);
                    return (
                      <button
                        key={tone}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateField('tone', active ? tones.filter((x) => x !== tone) : [...tones, tone])}
                      >
                        {t.tones[tone]}
                      </button>
                    );
                  })}
                </div>
                <p className="ui-hint" id={fid('tone-hint')}>{ti.toneHint}</p>
              </div>
            </div>
          </SectionCard>

          {/* ── Identidad visual ── */}
          <SectionCard title={ti.sections.visual}>
            <div className={styles.stack}>
              <div className="auto-grid" style={{ '--min': '200px', '--gap': '16px' } as CSSProperties}>
                {COLOR_FIELDS.map(({ key, label, fallback }) => {
                  const value = form[key] ?? '';
                  return (
                    <Field key={key} id={fid(key)} label={t[label]} error={errorFor(key)}>
                      {(p) => (
                        <div className={styles.colorRow}>
                          <input
                            type="color"
                            className={styles.swatch}
                            value={HEX.test(value) ? value.toLowerCase() : fallback}
                            onChange={(e) => updateField(key, e.target.value)}
                            aria-label={ti.colorPicker(t[label])}
                          />
                          <Input
                            {...p}
                            value={value}
                            onChange={(e) => updateField(key, e.target.value.trim() || null)}
                            onBlur={() => touch(key)}
                            placeholder={fallback.toUpperCase()}
                            maxLength={7}
                            spellCheck={false}
                            autoCapitalize="off"
                            autoComplete="off"
                          />
                        </div>
                      )}
                    </Field>
                  );
                })}
              </div>

              <div className="grid-2">
                <Field label={t.fontHeading}>
                  {(p) => (
                    <GoogleFontSelect
                      {...p}
                      lang={locale}
                      value={form.font_heading}
                      onChange={(value) => updateField('font_heading', value)}
                      placeholder={ti.fontHeadingPlaceholder}
                      previewText={ti.fontHeadingPreview}
                    />
                  )}
                </Field>
                <Field label={t.fontBody}>
                  {(p) => (
                    <GoogleFontSelect
                      {...p}
                      lang={locale}
                      value={form.font_body}
                      onChange={(value) => updateField('font_body', value)}
                      placeholder={ti.fontBodyPlaceholder}
                      previewText={ti.fontBodyPreview}
                    />
                  )}
                </Field>
              </div>

              <div className="ui-field">
                <span className="ui-label">{t.logo}</span>
                <div className={styles.logoRow}>
                  {form.logo_url && !errors.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo_url} alt={ti.logoAlt} className={styles.logoPreview} />
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    hidden
                    accept={LOGO_TYPES.join(',')}
                    aria-label={ti.logoFile}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f); }}
                  />
                  <Button
                    variant="secondary"
                    icon={<Icon name="upload" size={16} />}
                    loading={logo.status === 'uploading'}
                    aria-describedby={fid('logo-hint')}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {ti.logoUpload}
                  </Button>
                  {form.logo_url && (
                    <Button variant="danger-ghost" icon={<Icon name="trash" size={16} />} onClick={() => updateField('logo_url', null)}>
                      {ti.logoRemove}
                    </Button>
                  )}
                </div>
                <p className="ui-hint" id={fid('logo-hint')}>{ti.logoHint}</p>
                <p role="status" className={logoStatus ? 'ui-hint' : 'sr-only'}>{logoStatus}</p>
                {logo.status === 'error' && <p role="alert" className="ui-error">{logo.message}</p>}
              </div>

              <Field id={fid('logo_url')} label={ti.logoUrl} error={errorFor('logo_url')}>
                <Input
                  type="url"
                  inputMode="url"
                  value={form.logo_url ?? ''}
                  onChange={(e) => updateField('logo_url', e.target.value || null)}
                  onBlur={() => touch('logo_url')}
                  placeholder="https://…"
                />
              </Field>
            </div>
          </SectionCard>

          {/* ── Notas para la IA ── */}
          <SectionCard title={ti.sections.notes} subtitle={ti.notesHint}>
            <Field label={t.notes} hideLabel>
              <Textarea
                value={form.notes ?? ''}
                onChange={(e) => updateField('notes', e.target.value || null)}
                placeholder={ti.notesPlaceholder}
                rows={4}
              />
            </Field>
          </SectionCard>
        </fieldset>
      </form>

      {/* ── Barra de guardado: siempre a la vista ── */}
      {canEdit && (
        <div className={styles.saveBar}>
          <p role="status" className={styles.saveStatus} data-state={status}>
            {status === 'saving' && <Spinner size={14} />}
            {status === 'dirty' && <span className={styles.dot} aria-hidden="true" />}
            {status === 'saved' && <Icon name="check-circle" size={16} />}
            <span>{t.saveBar[status]}</span>
          </p>
          <Button type="submit" form={formId} variant="primary" loading={saving} disabled={!dirty}>
            {t.saveBar.save}
          </Button>
          {saveError && (
            <p role="alert" className={styles.saveError}>
              <Icon name="alert" size={16} />
              <span>{saveError}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}
