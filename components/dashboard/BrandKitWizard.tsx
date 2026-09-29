'use client';

// ─── Completa tu marca: el Brand Kit en 5 pantallas ──────────────────────────
//
// Antes eran 20 pasos de una sola pregunta, en voseo, sin «Terminar más tarde»
// y con sugerencias de IA que se pedían solas al entrar en cada paso (y
// gastaban un crédito cada vez). Vivía incrustado en el home y desaparecía en
// cuanto la cuenta dejaba de ser nueva, sin forma de retomarlo.
//
// Ahora:
// - 5 pantallas con los campos agrupados (lib/brand-setup.ts) y una lista de
//   pasos que marca cuáles están completos y deja saltar a cualquiera;
// - retoma en la primera pantalla incompleta;
// - guarda solo lo que cambió (PATCH /api/brand-kit), valida antes de enviar
//   y avisa si se sale con cambios sin guardar;
// - «Terminar más tarde» guarda y sale;
// - las sugerencias de IA y la lectura de la web solo se piden con un botón
//   que dice lo que cuestan.
//
// Se usa en /{lang}/dashboard/brand/setup.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { BrandKit, BrandTone, CompanySize } from '@/types/brand-kit';
import type { BrandKitWizardProps } from '@/types/components/brand-kit-wizard';
import { BRAND_SETUP_GROUPS, brandCompleteness, firstIncompleteGroup, isFilled } from '@/lib/brand-setup';
import { useBrand } from '@/lib/brand-context';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import Button, { Spinner } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import ArrayChips from '@/components/ui/ArrayChips';
import GoogleFontSelect from '@/components/ui/GoogleFontSelect';
import Icon from '@/components/ui/icons';
import esBrand from '@/locales/es/dashboard/brand';
import enBrand from '@/locales/en/dashboard/brand';
import esSetup from '@/locales/es/dashboard/brand-setup';
import enSetup from '@/locales/en/dashboard/brand-setup';
import styles from './BrandKitWizard.module.css';

const TONES: BrandTone[] = [
  'professional', 'friendly', 'authoritative', 'playful', 'inspirational', 'educational', 'casual', 'formal',
];
const COMPANY_SIZES: CompanySize[] = ['1-10', '11-50', '51-200', '201-500', '500+'];
const SOCIAL_CHANNELS = [
  ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['twitter', 'X (Twitter)'],
  ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'],
] as const;
const LANGUAGES = ['es', 'en', 'pt', 'fr'] as const;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const ALL_FIELDS = BRAND_SETUP_GROUPS.flatMap((g) => g.fields);
const COLOR_FIELDS = ['primary_color', 'secondary_color', 'accent_color'] as const;

type Kit = Partial<BrandKit>;
type FieldErrors = Partial<Record<keyof BrandKit, string>>;
type SuggestionState = { loading: boolean; items: string[] | null; error: string | null };
type ApiError = { message: string; plans?: boolean };

/** URL escrita a mano → con protocolo (https por defecto). null si no es válida. */
function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    return url.hostname.includes('.') ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/** Valor tal como se guardaría: textos recortados, vacíos como null, redes sin huecos. */
function normalizeForSave(field: keyof BrandKit, value: unknown): unknown {
  if (field === 'website_url' || field === 'logo_url') {
    return typeof value === 'string' && value.trim() ? normalizeUrl(value) : null;
  }
  if (field === 'social_urls') {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries((value ?? {}) as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = normalizeUrl(v) ?? v.trim();
    }
    return out;
  }
  if (typeof value === 'string') return value.trim() ? value.trim() : null;
  return value ?? null;
}

function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** Error del API legible (el servidor ya lo manda en el idioma pedido). */
async function apiError(res: Response, fallback: string): Promise<ApiError> {
  const data = await res.json().catch(() => null) as { error?: unknown; creditsExhausted?: unknown } | null;
  return {
    message: typeof data?.error === 'string' ? data.error : fallback,
    plans: res.status === 402 || data?.creditsExhausted === true,
  };
}

export default function BrandKitWizard({ locale, orgName, onComplete, onExit }: BrandKitWizardProps) {
  const lang: 'es' | 'en' = locale === 'en' ? 'en' : 'es';
  const tb = lang === 'en' ? enBrand : esBrand;
  const t = lang === 'en' ? enSetup : esSetup;
  const { refresh: refreshBrands } = useBrand();

  const [kit, setKit] = useState<Kit | null>(null);
  const [form, setForm] = useState<Kit>({});
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionState>>({});
  const [enrich, setEnrich] = useState<
    { status: 'idle' | 'loading' | 'empty' | 'applied' } | { status: 'found'; data: Kit } | { status: 'error'; error: ApiError }
  >({ status: 'idle' });
  const [logo, setLogo] = useState<{ status: 'idle' | 'uploading' } | { status: 'error'; message: string }>({ status: 'idle' });

  const headingRef = useRef<HTMLHeadingElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const navigated = useRef(false);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const res = await fetch('/api/brand-kit', { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      const { kit: k } = await res.json() as { kit: BrandKit };
      const initial: Kit = { ...k };
      // El kit nace con el nombre por defecto de la base: se propone el del negocio.
      if ((!initial.name || initial.name === 'Mi marca') && orgName) initial.name = orgName;
      setKit(k);
      setForm(initial);
      setStep(firstIncompleteGroup(k));
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [orgName]);

  useEffect(() => { void load(); }, [load]);

  // Al cambiar de pantalla el foco va a su título: sin esto, con teclado o
  // lector de pantalla el foco se quedaba en un botón que ya no existe.
  useEffect(() => {
    if (!navigated.current) return;
    headingRef.current?.focus();
  }, [step]);

  const changes = useMemo(() => {
    const patch: Record<string, unknown> = {};
    if (!kit) return patch;
    for (const field of ALL_FIELDS) {
      const next = normalizeForSave(field, form[field]);
      if (!sameValue(next, kit[field])) patch[field] = next;
    }
    return patch;
  }, [form, kit]);
  const dirty = Object.keys(changes).length > 0;

  // Cerrar o recargar la pestaña con cambios sin guardar pide confirmación.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const completeness = useMemo(() => brandCompleteness(form), [form]);

  function update<K extends keyof BrandKit>(key: K, value: BrandKit[K] | null) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function goTo(index: number) {
    navigated.current = true;
    setSaveError(null);
    setStep(index);
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!isFilled(form.name)) errs.name = tb.identity.nameRequired;
    for (const f of ['website_url', 'logo_url'] as const) {
      const v = form[f];
      if (typeof v === 'string' && v.trim() && !normalizeUrl(v)) errs[f] = tb.identity.urlInvalid;
    }
    for (const f of COLOR_FIELDS) {
      const v = form[f];
      if (typeof v === 'string' && v.trim() && !HEX.test(v.trim())) errs[f] = tb.identity.colorInvalid;
    }
    const social = (form.social_urls ?? {}) as Record<string, unknown>;
    if (Object.values(social).some((v) => typeof v === 'string' && v.trim() && !normalizeUrl(v))) {
      errs.social_urls = tb.identity.urlInvalid;
    }
    return errs;
  }

  /** Guarda todo lo que cambió (de cualquier pantalla). false si no se pudo. */
  async function save(): Promise<boolean> {
    const errs = validate();
    setFieldErrors(errs);
    const invalid = Object.keys(errs) as (keyof BrandKit)[];
    if (invalid.length > 0) {
      setSaveError({ message: t.errors.fix });
      const groupIndex = BRAND_SETUP_GROUPS.findIndex((g) => g.fields.includes(invalid[0]));
      if (groupIndex !== -1 && groupIndex !== step) goTo(groupIndex);
      return false;
    }
    if (!dirty) return true;

    setSaving(true);
    setSaveError(null);
    try {
      // syncOrg: con una sola marca, el nombre de la organización sigue al de la marca.
      const res = await fetch('/api/brand-kit?syncOrg=1', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) {
        setSaveError(res.status === 403 ? { message: t.errors.forbidden } : await apiError(res, t.errors.save));
        return false;
      }
      const { kit: updated } = await res.json() as { kit: BrandKit };
      setKit(updated);
      setForm((prev) => {
        const next = { ...prev };
        for (const field of ALL_FIELDS) next[field] = updated[field] as never;
        return next;
      });
      setSaved(true);
      // El nombre y el logo se ven en el selector de marca.
      if ('name' in changes || 'logo_url' in changes) void refreshBrands();
      return true;
    } catch {
      setSaveError({ message: t.errors.save });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleNext(e?: FormEvent) {
    e?.preventDefault();
    if (saving) return;
    if (!(await save())) return;
    if (step === BRAND_SETUP_GROUPS.length - 1) onComplete();
    else goTo(step + 1);
  }

  async function handleLater() {
    if (saving) return;
    if (await save()) (onExit ?? onComplete)();
  }

  async function suggest(field: keyof BrandKit) {
    setSuggestions((p) => ({ ...p, [field]: { loading: true, items: null, error: null } }));
    try {
      const res = await fetch('/api/brand-kit/ai-suggest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, context: form, lang }),
      });
      if (!res.ok) {
        const err = await apiError(res, t.errors.suggestions);
        setSuggestions((p) => ({ ...p, [field]: { loading: false, items: null, error: err.message } }));
        return;
      }
      const data = await res.json() as { suggestions?: unknown };
      const items = Array.isArray(data.suggestions)
        ? data.suggestions.filter((s): s is string => typeof s === 'string' && !!s.trim())
        : [];
      setSuggestions((p) => ({
        ...p, [field]: { loading: false, items, error: items.length ? null : t.noSuggestions },
      }));
    } catch {
      setSuggestions((p) => ({ ...p, [field]: { loading: false, items: null, error: t.errors.suggestions } }));
    }
  }

  async function readWebsite() {
    const url = normalizeUrl(String(form.website_url ?? ''));
    if (!url) {
      setFieldErrors((p) => ({ ...p, website_url: tb.identity.urlInvalid }));
      return;
    }
    setEnrich({ status: 'loading' });
    try {
      const res = await fetch('/api/brand-kit/enrich-url', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, lang }),
      });
      if (!res.ok) {
        setEnrich({ status: 'error', error: await apiError(res, t.website.error) });
        return;
      }
      const { extracted } = await res.json() as { extracted?: Kit };
      const data = Object.fromEntries(Object.entries(extracted ?? {}).filter(([, v]) => isFilled(v))) as Kit;
      setEnrich(Object.keys(data).length ? { status: 'found', data } : { status: 'empty' });
    } catch {
      setEnrich({ status: 'error', error: { message: t.website.error } });
    }
  }

  function applyEnriched() {
    if (enrich.status !== 'found') return;
    setForm((prev) => ({ ...prev, ...enrich.data }));
    setSaved(false);
    setEnrich({ status: 'applied' });
  }

  async function uploadLogo(file: File) {
    if (!LOGO_TYPES.includes(file.type)) { setLogo({ status: 'error', message: tb.identity.logoBadType }); return; }
    if (file.size > LOGO_MAX_BYTES) { setLogo({ status: 'error', message: tb.identity.logoTooBig }); return; }
    setLogo({ status: 'uploading' });
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'logo');
      fd.append('label', 'Logo');
      const res = await fetch('/api/brand-kit/assets', { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) throw new Error(String(res.status));
      const { asset } = await res.json() as { asset: { public_url: string } };
      update('logo_url', asset.public_url);
      setLogo({ status: 'idle' });
    } catch {
      setLogo({ status: 'error', message: tb.identity.logoFailed });
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  // ─── Piezas ────────────────────────────────────────────────────────────────

  const fieldLabel: Partial<Record<keyof BrandKit, string>> = {
    name: tb.name, tagline: tb.tagline, industry: tb.industry, website_url: tb.websiteUrl,
    social_urls: tb.socialUrls, language: tb.language, customer_locations: tb.customerLocations,
    uses_emojis: tb.usesEmojis, communication_style: tb.communicationStyle, mission: tb.mission,
    tone: tb.tone, primary_color: tb.primaryColor, secondary_color: tb.secondaryColor,
    accent_color: tb.accentColor, font_heading: tb.fontHeading, font_body: tb.fontBody,
    logo_url: tb.logo, notes: tb.notes, company_size: tb.companySize,
    differentiators: tb.differentiators, challenges: tb.challenges, niche: tb.niche,
    competitors: tb.competitors, target_audience: tb.targetAudience,
  };

  function suggestionsFor(field: keyof BrandKit, apply: (value: string) => void, current?: string): ReactNode {
    const s = suggestions[field];
    const label = fieldLabel[field] ?? String(field);
    return (
      <div className={styles.suggest}>
        <Button
          size="sm" variant="ghost" icon={<Icon name="sparkles" size={14} />}
          loading={s?.loading} onClick={() => void suggest(field)}
          aria-label={t.suggest(label)}
        >
          {t.suggestShort}
        </Button>
        {s?.error && <p className={styles.suggestError} role="status">{s.error}</p>}
        {s?.items && s.items.length > 0 && (
          <div className={styles.suggestList} role="group" aria-label={`${t.suggestionsTitle}: ${label}`}>
            {s.items.map((item) => (
              <button
                key={item} type="button" className={styles.suggestItem}
                aria-pressed={current === item} onClick={() => apply(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function textField(field: keyof BrandKit, opts: {
    multiline?: boolean; placeholder?: string; hint?: string; required?: boolean; suggest?: boolean; label?: string;
  } = {}) {
    const value = typeof form[field] === 'string' ? (form[field] as string) : '';
    const Control = opts.multiline ? Textarea : Input;
    return (
      <div className={styles.fieldBlock}>
        <Field label={opts.label ?? fieldLabel[field] ?? String(field)} hint={opts.hint} error={fieldErrors[field]} required={opts.required}>
          <Control
            value={value}
            onChange={(e: { target: { value: string } }) => update(field, e.target.value as never)}
            placeholder={opts.placeholder}
            {...(opts.multiline ? { rows: 3 } : {})}
          />
        </Field>
        {opts.suggest && suggestionsFor(field, (v) => update(field, v as never), value)}
      </div>
    );
  }

  function chipsField(field: 'customer_locations' | 'differentiators' | 'competitors' | 'challenges', placeholder?: string) {
    const s = suggestions[field];
    return (
      <Field label={fieldLabel[field] ?? field}>
        {(p) => (
          <ArrayChips
            id={p.id}
            aria-describedby={p['aria-describedby']}
            lang={lang}
            value={(form[field] as string[] | undefined) ?? []}
            onChange={(v) => update(field, v)}
            placeholder={placeholder}
            suggestions={s?.items ?? undefined}
            loadingSuggestions={s?.loading}
            onRequestSuggestions={() => void suggest(field)}
          />
        )}
      </Field>
    );
  }

  function toggleGroup<T extends string>(legend: string, options: readonly T[], isActive: (o: T) => boolean,
    onToggle: (o: T) => void, label: (o: T) => string, hint?: string) {
    return (
      <fieldset className={styles.fieldset}>
        <legend className="ui-label">{legend}</legend>
        {hint && <p className="ui-hint" style={{ marginTop: -2 }}>{hint}</p>}
        <div className={styles.toggles}>
          {options.map((o) => (
            <button
              key={o} type="button" className={styles.toggle}
              aria-pressed={isActive(o)} onClick={() => onToggle(o)}
            >
              {isActive(o) && <Icon name="check" size={14} />}
              {label(o)}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  function renderBusiness() {
    const social = (form.social_urls ?? {}) as Record<string, string | undefined>;
    return (
      <>
        {textField('name', { required: true, placeholder: tb.identity.namePlaceholder })}
        <div className={styles.fieldBlock}>
          <Field label={tb.websiteUrl} hint={tb.identity.websiteHint} error={fieldErrors.website_url}>
            <Input
              type="url" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false}
              value={form.website_url ?? ''}
              onChange={(e) => update('website_url', e.target.value)}
              placeholder={t.website.placeholder}
            />
          </Field>
          <div className={styles.suggest}>
            <Button
              size="sm" variant="secondary" icon={<Icon name="globe" size={14} />}
              loading={enrich.status === 'loading'} disabled={!isFilled(form.website_url)}
              onClick={() => void readWebsite()}
            >
              {enrich.status === 'loading' ? t.website.reading : t.website.read}
            </Button>
          </div>
          {enrich.status === 'error' && (
            <Notice tone="warning">
              {enrich.error.message}{' '}
              {enrich.error.plans && <a href={`/${lang}/dashboard/settings#billing`}>{t.errors.plans}</a>}
            </Notice>
          )}
          {enrich.status === 'empty' && <Notice tone="warning">{t.website.empty}</Notice>}
          {enrich.status === 'applied' && <Notice tone="success">{t.website.applied}</Notice>}
          {enrich.status === 'found' && (
            <div className={styles.found}>
              <p className={styles.foundTitle}>{t.website.found}</p>
              <dl className={styles.foundList}>
                {Object.entries(enrich.data).map(([key, value]) => (
                  <div key={key} className={styles.foundRow}>
                    <dt>{fieldLabel[key as keyof BrandKit] ?? key}</dt>
                    <dd>
                      {typeof value === 'string' && HEX.test(value) && (
                        <span className={styles.swatch} style={{ background: value }} aria-hidden="true" />
                      )}
                      {Array.isArray(value)
                        ? value.map((v) => (tb.tones as Record<string, string>)[v] ?? v).join(', ')
                        : typeof value === 'object' && value
                          ? Object.entries(value as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(' · ')
                          : typeof value === 'boolean' ? (value ? tb.yes : tb.no) : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className={styles.actionsRow}>
                <Button size="sm" variant="primary" onClick={applyEnriched}>{t.website.apply}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEnrich({ status: 'idle' })}>{t.website.discard}</Button>
              </div>
            </div>
          )}
        </div>
        {textField('mission', { multiline: true, placeholder: tb.identity.missionPlaceholder, suggest: true })}
        {textField('industry', { placeholder: tb.identity.industryPlaceholder, suggest: true })}
        {/* Seis campos opcionales: plegados, para que la primera pantalla no
            sea kilométrica en móvil. Abiertos si ya hay alguno o hay error. */}
        <details
          className={styles.details}
          open={!!fieldErrors.social_urls || Object.values(social).some((v) => !!v?.trim()) || undefined}
        >
          <summary className={styles.summary}>
            <Icon name="chevron-right" size={16} />
            {t.socialOptional}
          </summary>
          <p className="ui-hint">{tb.identity.socialHint}</p>
          {fieldErrors.social_urls && <p className="ui-error" role="alert">{fieldErrors.social_urls}</p>}
          <div className="auto-grid" style={{ ['--min' as string]: '220px' }}>
            {SOCIAL_CHANNELS.map(([key, name]) => (
              <Field key={key} label={name}>
                <Input
                  type="url" inputMode="url" autoCapitalize="none" spellCheck={false}
                  value={social[key] ?? ''}
                  onChange={(e) => update('social_urls', { ...social, [key]: e.target.value })}
                  placeholder={t.socialPlaceholder}
                />
              </Field>
            ))}
          </div>
        </details>
      </>
    );
  }

  function renderVoice() {
    const tones = (form.tone ?? []) as BrandTone[];
    return (
      <>
        {toggleGroup(tb.tone, TONES, (o) => tones.includes(o),
          (o) => update('tone', tones.includes(o) ? tones.filter((x) => x !== o) : [...tones, o]),
          (o) => tb.tones[o], tb.identity.toneHint)}
        {textField('communication_style', { multiline: true, placeholder: tb.identity.communicationPlaceholder, suggest: true })}
        {toggleGroup(tb.usesEmojis, ['yes', 'no'] as const,
          (o) => (o === 'yes' ? form.uses_emojis === true : form.uses_emojis === false),
          (o) => update('uses_emojis', o === 'yes'),
          (o) => (o === 'yes' ? t.emojisYes : t.emojisNo))}
        <Field label={tb.language}>
          <Select value={form.language ?? 'es'} onChange={(e) => update('language', e.target.value as BrandKit['language'])}>
            {LANGUAGES.map((l) => <option key={l} value={l}>{t.languages[l]}</option>)}
          </Select>
        </Field>
        {textField('tagline', { placeholder: tb.identity.taglinePlaceholder, suggest: true })}
      </>
    );
  }

  function renderLook() {
    return (
      <>
        <div className="auto-grid" style={{ ['--min' as string]: '180px' }}>
          {COLOR_FIELDS.map((f) => {
            const label = fieldLabel[f] ?? f;
            const value = form[f] ?? '';
            return (
              <Field key={f} label={label} error={fieldErrors[f]}>
                {(p) => (
                  <div className={styles.color}>
                    <input
                      type="color" className={styles.colorPicker}
                      value={HEX.test(value) ? value : '#000000'}
                      onChange={(e) => update(f, e.target.value)}
                      aria-label={tb.identity.colorPicker(label)}
                    />
                    <Input {...p} value={value} onChange={(e) => update(f, e.target.value)} placeholder="#000000" maxLength={7} />
                  </div>
                )}
              </Field>
            );
          })}
        </div>
        <div className="grid-2">
          <Field label={tb.fontHeading}>
            {(p) => (
              <GoogleFontSelect
                id={p.id} aria-describedby={p['aria-describedby']} lang={lang}
                value={form.font_heading} onChange={(v) => update('font_heading', v)}
                placeholder={tb.identity.fontHeadingPlaceholder} previewText={tb.identity.fontHeadingPreview}
              />
            )}
          </Field>
          <Field label={tb.fontBody}>
            {(p) => (
              <GoogleFontSelect
                id={p.id} aria-describedby={p['aria-describedby']} lang={lang}
                value={form.font_body} onChange={(v) => update('font_body', v)}
                placeholder={tb.identity.fontBodyPlaceholder} previewText={tb.identity.fontBodyPreview}
              />
            )}
          </Field>
        </div>
        <fieldset className={styles.fieldset}>
          <legend className="ui-label">{tb.logo}</legend>
          {form.logo_url && normalizeUrl(form.logo_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logo_url} alt={tb.identity.logoAlt} className={styles.logo} />
          )}
          <div className={styles.actionsRow}>
            <input
              ref={logoInputRef} type="file" accept={LOGO_TYPES.join(',')} className="sr-only"
              aria-label={tb.identity.logoFile} tabIndex={-1}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }}
            />
            <Button
              size="sm" variant="secondary" icon={<Icon name="upload" size={14} />}
              loading={logo.status === 'uploading'} onClick={() => logoInputRef.current?.click()}
              aria-describedby="wizard-logo-hint"
            >
              {logo.status === 'uploading' ? tb.identity.logoUploading : tb.identity.logoUpload}
            </Button>
            {form.logo_url && (
              <Button size="sm" variant="danger-ghost" onClick={() => update('logo_url', null)}>
                {tb.identity.logoRemove}
              </Button>
            )}
          </div>
          <p id="wizard-logo-hint" className="ui-hint">{tb.identity.logoHint}</p>
          {logo.status === 'error' && <Notice tone="danger">{logo.message}</Notice>}
          <Field label={tb.identity.logoUrl} error={fieldErrors.logo_url}>
            <Input
              type="url" inputMode="url" autoCapitalize="none" spellCheck={false}
              value={form.logo_url ?? ''} onChange={(e) => update('logo_url', e.target.value)} placeholder="https://…"
            />
          </Field>
        </fieldset>
      </>
    );
  }

  function renderAudience() {
    return (
      <>
        {textField('target_audience', { multiline: true, placeholder: tb.market.audiencePlaceholder, suggest: true })}
        {textField('niche', { placeholder: tb.market.nichePlaceholder, suggest: true })}
        {chipsField('customer_locations', tb.identity.locationsPlaceholder)}
        {toggleGroup(tb.companySize, COMPANY_SIZES, (o) => form.company_size === o,
          (o) => update('company_size', form.company_size === o ? null : o), (o) => t.companySize(o))}
      </>
    );
  }

  function renderDifference() {
    return (
      <>
        {chipsField('differentiators', tb.market.differentiatorsPlaceholder)}
        {chipsField('competitors', tb.market.competitorsPlaceholder)}
        {chipsField('challenges', tb.market.challengesPlaceholder)}
        {textField('notes', { multiline: true, placeholder: tb.identity.notesPlaceholder, hint: tb.identity.notesHint })}
      </>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div className={styles.loading} role="status">
        <Spinner size={18} />
        <span>{t.loading}</span>
      </div>
    );
  }
  if (loadState === 'error') {
    return (
      <Notice tone="danger">
        {t.loadError}{' '}
        <Button size="sm" variant="secondary" onClick={() => void load()}>{t.retry}</Button>
      </Notice>
    );
  }

  const group = BRAND_SETUP_GROUPS[step];
  const last = step === BRAND_SETUP_GROUPS.length - 1;
  const total = BRAND_SETUP_GROUPS.length;
  const body = {
    business: renderBusiness, voice: renderVoice, look: renderLook,
    audience: renderAudience, difference: renderDifference,
  }[group.id]();

  return (
    <div className={styles.wizard}>
      <nav aria-label={t.stepsNav} className={styles.stepsNav}>
        <ol className={styles.steps}>
          {BRAND_SETUP_GROUPS.map((g, i) => {
            const done = !completeness.incomplete.includes(g.id);
            return (
              <li key={g.id}>
                <button
                  type="button" className={styles.stepBtn}
                  aria-current={i === step ? 'step' : undefined}
                  data-done={done}
                  onClick={() => goTo(i)}
                >
                  <span className={styles.stepNum} aria-hidden="true">
                    {done ? <Icon name="check" size={14} /> : i + 1}
                  </span>
                  <span className={styles.stepName}>{t.steps[g.id]}</span>
                  <span className="sr-only"> ({done ? t.statusDone : t.statusPending})</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form className={styles.card} onSubmit={(e) => void handleNext(e)} noValidate>
        <div className={styles.head}>
          <p className={styles.stepOf}>{t.stepOf(step + 1, total, t.steps[group.id])}</p>
          <div
            className={styles.progress} role="progressbar" aria-label={t.title}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={completeness.percent}
          >
            <span style={{ width: `${completeness.percent}%` }} />
          </div>
          <h2 ref={headingRef} tabIndex={-1} className={styles.title}>{t.steps[group.id]}</h2>
          <p className={styles.intro}>{t.intros[group.id]}</p>
        </div>

        <div className={styles.body}>{body}</div>

        {saveError && (
          <Notice tone="danger">
            {saveError.message}{' '}
            {saveError.plans && <a href={`/${lang}/dashboard/settings#billing`}>{t.errors.plans}</a>}
          </Notice>
        )}

        <div className={styles.footer}>
          <div className={styles.footerStart}>
            {step > 0 && (
              <Button variant="ghost" icon={<Icon name="arrow-left" size={16} />} onClick={() => goTo(step - 1)}>
                {t.prev}
              </Button>
            )}
          </div>
          <p className={styles.status} role="status">
            {saving ? t.saving : saved && !dirty ? t.saved : ''}
          </p>
          <div className={styles.footerEnd}>
            <Button variant="ghost" onClick={() => void handleLater()} disabled={saving}>{t.later}</Button>
            <Button type="submit" variant="primary" loading={saving}>{last ? t.finish : t.next}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
