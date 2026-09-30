'use client';

// ─── Mi marca › Mercado ──────────────────────────────────────────────────────
//
// Tamaño, nicho, público, diferenciadores, competidores y retos. Mismo patrón
// que Identidad: barra de guardado pegada al pie con el estado («Cambios sin
// guardar» / «Guardando…» / «Guardado») y PATCH solo de los campos que
// cambiaron. Antes esta página enviaba el Brand Kit entero y pisaba lo que se
// hubiera guardado en Identidad (o lo que el asistente cambió) desde que se
// abrió.
//
// La industria es otra cosa: vive en la selección de estrategia de la org
// (/api/strategies/org) y se guarda al elegirla, con su propio estado.
//
// Las sugerencias con IA cuestan un crédito cada vez: solo se piden con el
// botón de cada lista (antes esta página llamaba a una ruta que no existe).

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useDataChanged } from '@/lib/data-events';
import { toLocale } from '@/lib/i18n';
import type { BrandKit, CompanySize } from '@/types/brand-kit';
import type { Industry } from '@/types/strategy';
import { SkeletonBlock, FormSectionSkeleton } from '@/components/ui/Skeleton';
import SectionCard from '@/components/ui/SectionCard';
import { Field, Input, Textarea } from '@/components/ui/Field';
import ArrayChips from '@/components/ui/ArrayChips';
import Button, { Spinner } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import esT, { type BrandCopy } from '@/locales/es/dashboard/brand';
import enT from '@/locales/en/dashboard/brand';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';
import styles from '../brand-form.module.css';

const COMPANY_SIZES: CompanySize[] = ['1-10', '11-50', '51-200', '201-500', '500+'];

/** Campos que edita esta página. */
const FIELDS = ['company_size', 'niche', 'target_audience', 'differentiators', 'competitors', 'challenges'] as const;
type FieldKey = (typeof FIELDS)[number];
type ListKey = 'differentiators' | 'competitors' | 'challenges';
type Kit = Partial<BrandKit>;

const LIST_FIELDS: { key: ListKey; label: keyof BrandCopy; placeholder: 'differentiatorsPlaceholder' | 'competitorsPlaceholder' | 'challengesPlaceholder' }[] = [
  { key: 'differentiators', label: 'differentiators', placeholder: 'differentiatorsPlaceholder' },
  { key: 'competitors', label: 'competitors', placeholder: 'competitorsPlaceholder' },
  { key: 'challenges', label: 'challenges', placeholder: 'challengesPlaceholder' },
];

/** Etiquetas para los errores de validación del servidor. */
const LABEL_KEYS: Record<string, keyof BrandCopy> = {
  company_size: 'companySize', niche: 'niche', target_audience: 'targetAudience',
  differentiators: 'differentiators', competitors: 'competitors', challenges: 'challenges',
};

/** Valor de un campo tal como se guarda: vacío → null, listas limpias. */
function normalized(kit: Kit, key: FieldKey): unknown {
  const v = kit[key];
  if (key === 'differentiators' || key === 'competitors' || key === 'challenges') return Array.isArray(v) ? v : [];
  return typeof v === 'string' ? (v.trim() ? v : null) : (v ?? null);
}

const sameField = (key: FieldKey, a: Kit, b: Kit) => JSON.stringify(normalized(a, key)) === JSON.stringify(normalized(b, key));

function changes(form: Kit, base: Kit): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FIELDS) if (!sameField(key, form, base)) out[key] = normalized(form, key);
  return out;
}

/** Lo nuevo del servidor sin perder los campos que el usuario cambió desde `base`. */
function mergeKit(server: Kit, base: Kit, local: Kit): Kit {
  const merged: Record<string, unknown> = { ...server };
  for (const key of FIELDS) if (!sameField(key, local, base)) merged[key] = local[key];
  return merged as Kit;
}

type SuggState = { items?: string[]; loading: boolean; error: string | null };
type IndustryState = 'idle' | 'saving' | 'saved' | 'error';

export default function BrandMarketPage() {
  const params = useParams<{ lang: string }>();
  const locale = toLocale(params?.lang);
  const t = locale === 'en' ? enT : esT;
  const tm = t.market;
  const common = locale === 'en' ? enCommon : esCommon;

  const { org, role, loading: authLoading } = useAuth();
  const canEdit = !role || role === 'owner' || role === 'admin';

  const uid = useId().replace(/:/g, '');
  const formId = `market-form-${uid}`;
  const fid = (key: string) => `market-${uid}-${key}`;

  const [{ form, baseline }, setKit] = useState<{ form: Kit; baseline: Kit }>({ form: {}, baseline: {} });
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [sugg, setSugg] = useState<Partial<Record<ListKey, SuggState>>>({});
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [selectedIndustryId, setSelectedIndustryId] = useState<string | null>(null);
  const [industryState, setIndustryState] = useState<IndustryState>('idle');

  // ── Carga: Brand Kit + catálogo de industrias + industria elegida ────────
  // Las recargas (el asistente cambió la marca o la estrategia) no vuelven a
  // mostrar el esqueleto y conservan lo que se estaba editando.
  const load = useCallback(async (initial: boolean) => {
    if (initial) { setLoadingData(true); setLoadError(false); }
    try {
      const [bkRes, catRes, orgRes] = await Promise.all([
        fetch('/api/brand-kit', { credentials: 'include' }),
        fetch('/api/strategies', { credentials: 'include' }),
        fetch('/api/strategies/org', { credentials: 'include' }),
      ]);
      if (!bkRes.ok) throw new Error('brand-kit');
      const { kit } = (await bkRes.json()) as { kit: BrandKit | null };
      const server: Kit = kit ?? {};
      setKit((prev) => (initial
        ? { baseline: server, form: server }
        : { baseline: server, form: mergeKit(server, prev.baseline, prev.form) }));
      if (catRes.ok) {
        const { industries: inds } = (await catRes.json()) as { industries?: Industry[] };
        setIndustries(inds ?? []);
      }
      if (orgRes.ok) {
        const { selection } = (await orgRes.json()) as { selection: { industry_id: string | null } | null };
        setSelectedIndustryId(selection?.industry_id ?? null);
      }
    } catch {
      if (initial) setLoadError(true);
    } finally {
      if (initial) setLoadingData(false);
    }
  }, []);

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (authLoading || !org || loadedOnce.current) return;
    loadedOnce.current = true;
    void load(true);
  }, [authLoading, org, load]);

  // El asistente editó la marca o cambió la estrategia: se recarga.
  useDataChanged(['brand-kit', 'strategy'], () => { if (!authLoading && org && !loadingData) void load(false); });

  const pending = changes(form, baseline);
  const dirty = Object.keys(pending).length > 0;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function updateField<K extends FieldKey>(key: K, value: BrandKit[K] | null) {
    setKit((prev) => ({ ...prev, form: { ...prev.form, [key]: value } }));
    setSaveError(null);
  }

  // ── Industria: se guarda al elegirla ─────────────────────────────────────
  async function handleSelectIndustry(id: string) {
    const previous = selectedIndustryId;
    const next = previous === id ? null : id;
    setSelectedIndustryId(next);
    setIndustryState('saving');
    try {
      const res = await fetch('/api/strategies/org', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry_id: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setIndustryState('saved');
    } catch {
      setSelectedIndustryId(previous);
      setIndustryState('error');
    }
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (saving || !canEdit || !dirty) return;
    const sent = form;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/brand-kit', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      if (!res.ok) {
        let message = t.errors.save;
        if (res.status === 403) message = t.errors.forbidden;
        else if (res.status === 422) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          const field = /^([a-z_]+) (?:must|items)/.exec(body.error ?? '')?.[1];
          const labelKey = field ? LABEL_KEYS[field] : undefined;
          if (labelKey) message = t.errors.invalidField(t[labelKey] as string);
        }
        setSaveError(message);
        return;
      }
      const { kit } = (await res.json()) as { kit: BrandKit };
      setKit((prev) => ({ baseline: kit, form: mergeKit(kit, sent, prev.form) }));
      setJustSaved(true);
    } catch {
      setSaveError(common.errors.network);
    } finally {
      setSaving(false);
    }
  }

  // ── Sugerencias (1 crédito cada vez: solo con el botón) ──────────────────
  async function requestSuggestions(field: ListKey) {
    setSugg((prev) => ({ ...prev, [field]: { loading: true, error: null } }));
    try {
      const res = await fetch('/api/brand-kit/ai-suggest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, context: form, lang: locale }),
      });
      const body = await res.json().catch(() => ({})) as { suggestions?: unknown; error?: unknown };
      if (!res.ok) {
        const explained = (res.status === 402 || res.status === 429) && typeof body.error === 'string';
        setSugg((prev) => ({ ...prev, [field]: { loading: false, error: explained ? body.error as string : t.errors.suggestions } }));
        return;
      }
      const items = Array.isArray(body.suggestions) ? body.suggestions.filter((s): s is string => typeof s === 'string') : [];
      setSugg((prev) => ({ ...prev, [field]: { items, loading: false, error: null } }));
    } catch {
      setSugg((prev) => ({ ...prev, [field]: { loading: false, error: t.errors.suggestions } }));
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (authLoading || loadingData) {
    return (
      <div className="page" style={{ maxWidth: 840 }} aria-busy="true">
        <p role="status" className="sr-only">{t.loading}</p>
        <div style={{ marginBottom: 28 }}>
          <SkeletonBlock width="min(220px, 70%)" height={26} style={{ marginBottom: 10 }} />
          <SkeletonBlock width="min(340px, 100%)" height={14} />
        </div>
        <FormSectionSkeleton fields={3} />
        <FormSectionSkeleton fields={2} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page" style={{ maxWidth: 840 }}>
        <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
          <p style={{ margin: '0 0 10px' }}>{t.loadError}</p>
          <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={() => { void load(true); }}>
            {common.actions.retry}
          </Button>
        </Notice>
      </div>
    );
  }

  const status = saving ? 'saving' : dirty ? 'dirty' : justSaved ? 'saved' : 'clean';
  const industryStatus = industryState === 'saving' ? tm.industrySaving : industryState === 'saved' ? tm.industrySaved : '';

  return (
    <div className="page" style={{ maxWidth: 840 }}>
      <header className="page-header">
        <div>
          <h1>{tm.title}</h1>
          <p>{tm.subtitle}</p>
        </div>
      </header>

      {!canEdit && (
        <div className={styles.block}>
          <Notice tone="info" live={false} icon={<Icon name="lock" size={16} />}>{t.errors.readOnly}</Notice>
        </div>
      )}

      <form id={formId} onSubmit={handleSave} noValidate aria-label={tm.title}>
        <fieldset className={styles.fieldset} disabled={!canEdit}>
          {/* ── Empresa ── */}
          <SectionCard title={tm.sections.company}>
            <div className={styles.stack}>
              <div className="ui-field">
                <span className="ui-label" id={fid('size')}>{t.companySize}</span>
                <div className="ui-segmented" role="group" aria-labelledby={fid('size')}>
                  {COMPANY_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={form.company_size === size}
                      onClick={() => updateField('company_size', size)}
                    >
                      {tm.employees(size)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ui-field">
                <span className="ui-label" id={fid('industry')}>{t.industry}</span>
                <p className="ui-hint" id={fid('industry-hint')}>{tm.industryHint}</p>
                {industries.length === 0 ? (
                  <p className="ui-hint">{tm.industriesEmpty}</p>
                ) : (
                  <div
                    className="ui-segmented"
                    role="group"
                    aria-labelledby={fid('industry')}
                    aria-describedby={fid('industry-hint')}
                    style={{ marginTop: 4 }}
                  >
                    {industries.map((ind) => (
                      <button
                        key={ind.id}
                        type="button"
                        aria-pressed={selectedIndustryId === ind.id}
                        disabled={industryState === 'saving'}
                        onClick={() => { void handleSelectIndustry(ind.id); }}
                      >
                        {ind.icon && <span className={styles.choiceIcon} aria-hidden="true">{ind.icon}</span>}
                        <span>{locale === 'en' ? (ind.name_en || ind.name_es) : ind.name_es}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p role="status" className={industryStatus ? 'ui-hint' : 'sr-only'}>
                  {industryState === 'saving' && <Spinner size={12} />} {industryStatus}
                </p>
                {industryState === 'error' && <p role="alert" className="ui-error">{tm.industryError}</p>}
              </div>

              <Field label={t.niche}>
                <Input
                  value={form.niche ?? ''}
                  onChange={(e) => updateField('niche', e.target.value || null)}
                  placeholder={tm.nichePlaceholder}
                />
              </Field>
            </div>
          </SectionCard>

          {/* ── Audiencia ── */}
          <SectionCard title={tm.sections.audience}>
            <Field label={t.targetAudience}>
              <Textarea
                value={form.target_audience ?? ''}
                onChange={(e) => updateField('target_audience', e.target.value || null)}
                placeholder={tm.audiencePlaceholder}
                rows={4}
              />
            </Field>
          </SectionCard>

          {/* ── Posicionamiento ── */}
          <SectionCard title={tm.sections.positioning}>
            <div className={styles.stack}>
              {LIST_FIELDS.map(({ key, label, placeholder }) => {
                const state = sugg[key];
                return (
                  <Field key={key} label={t[label] as string}>
                    {(p) => (
                      <div>
                        <ArrayChips
                          id={p.id}
                          aria-describedby={p['aria-describedby']}
                          lang={locale}
                          value={(form[key] as string[] | undefined) ?? []}
                          onChange={(v) => updateField(key, v)}
                          placeholder={tm[placeholder]}
                          suggestions={state?.items}
                          loadingSuggestions={state?.loading}
                          onRequestSuggestions={canEdit ? () => { void requestSuggestions(key); } : undefined}
                        />
                        {state?.error && <p role="alert" className="ui-error" style={{ marginTop: 6 }}>{state.error}</p>}
                        {state?.items?.length === 0 && <p role="status" className="ui-hint" style={{ marginTop: 6 }}>{t.errors.noSuggestions}</p>}
                      </div>
                    )}
                  </Field>
                );
              })}
            </div>
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
