'use client';

import { Suspense, useEffect, useRef, useState, useCallback, type CSSProperties, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useDataChanged } from '@/lib/data-events';
import { useAuth } from '@/lib/auth-context';
import { toLocale } from '@/lib/i18n';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import Button, { ButtonLink, Spinner } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/icons';
import type { Objective, Industry, Strategy, Template, OrgSelection, CustomCalendarItem } from '@/types/strategy';
import CustomStrategyPanel, {
  ActiveBadge,
  ConversionMechanic,
  StrategyCalendar,
  StrategyOverview,
  StrategySection,
  type CalendarRow,
} from '@/components/dashboard/strategy/CustomStrategyPanel';
import {
  catalogFormatLabel,
  channelName,
  draftFromCatalog,
  emptyDraft,
  formatIcon,
  generateParams,
  type CustomDraft,
} from '@/components/dashboard/strategy/custom-strategy-model';
import esT from '@/locales/es/dashboard/strategy';
import enT from '@/locales/en/dashboard/strategy';
import styles from './page.module.css';

const T = { es: esT, en: enT } as const;
const MODES = ['catalog', 'custom'] as const;
type Mode = (typeof MODES)[number];

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Dos modos: «Recomendadas» (objetivo × industria del catálogo) y
// «Personalizadas» (estrategias propias de la org). Los enlaces del asistente
// abren esta página con ?objective=&industry= (previsualiza ese par) o
// ?custom=<id> (abre esa estrategia propia).
//
// Los modos son pestañas de ARIA (flechas, Inicio y Fin las recorren); los
// objetivos, botones con aria-pressed (antes eran <div role="button"> que no
// se podían usar con el teclado).

export default function StrategyPage() {
  // useSearchParams necesita un Suspense para el prerender.
  return (
    <Suspense>
      <StrategyPageInner />
    </Suspense>
  );
}

interface AutomationPackRule {
  id: string;
  trigger_type: string;
  action_type: string;
  name?: string | null;
  name_es?: string | null;
  name_en?: string | null;
}

interface AutomationPack {
  id: string;
  name?: string | null;
  name_es?: string | null;
  name_en?: string | null;
  description?: string | null;
  desc_es?: string | null;
  desc_en?: string | null;
  icon: string | null;
  kefy_automation_pack_rules: AutomationPackRule[];
}

function StrategyPageInner() {
  const { lang } = useParams<{ lang: string }>();
  const router   = useRouter();
  const searchParams = useSearchParams();
  const { role } = useAuth();
  const locale   = toLocale(lang);
  const t        = T[locale];
  // Solo owner/admin escriben la estrategia. Sin rol conocido todavía se deja
  // intentar: el servidor responde 403 y se explica.
  const canEdit  = !role || role === 'owner' || role === 'admin';

  const [mode, setMode] = useState<Mode>('catalog');
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);
  const [customReload, setCustomReload] = useState(0);
  const [prefill, setPrefill] = useState<{ id: number; draft: CustomDraft } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ catalog: null, custom: null });

  // Catalog
  const [objectives,  setObjectives]  = useState<Objective[]>([]);
  const [industries,  setIndustries]  = useState<Industry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Selection
  const [selectedObjective, setSelectedObjective] = useState<string | null>(null);
  const [selectedIndustry,  setSelectedIndustry]  = useState<string | null>(null);

  // Recommendation
  const [strategy,    setStrategy]    = useState<Strategy | null>(null);
  const [templates,   setTemplates]   = useState<Template[]>([]);
  const [recLoading,  setRecLoading]  = useState(false);
  const [isFallback,  setIsFallback]  = useState(false);
  const [fallbackObjective, setFallbackObjective] = useState<{ name_es: string; name_en: string } | null>(null);

  // Saved selection
  const [savedSelection, setSavedSelection] = useState<OrgSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  // Automation packs
  const [packs, setPacks]             = useState<AutomationPack[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [installedPacks, setInstalledPacks] = useState<Set<string>>(new Set());
  const [installingPack, setInstallingPack] = useState<string | null>(null);
  const [failedPacks, setFailedPacks] = useState<Set<string>>(new Set());

  // ── Load catalog + saved selection on mount ──────────────────────────────
  // `initial`: la primera carga muestra el estado de carga; las recargas (el
  // asistente cambió la estrategia) son silenciosas para no desmontar la página.
  const loadStrategy = useCallback(async (initial = true): Promise<OrgSelection | null> => {
    if (initial) setCatalogLoading(true);
    let loaded: OrgSelection | null = null;
    try {
      const [catRes, orgRes] = await Promise.all([
        fetch('/api/strategies',     { credentials: 'include' }),
        fetch('/api/strategies/org', { credentials: 'include' }),
      ]);

      if (catRes.ok) {
        const { objectives: objs, industries: inds } = await catRes.json();
        setObjectives(objs ?? []);
        setIndustries(inds ?? []);
      }

      if (orgRes.ok) {
        const { selection } = await orgRes.json();
        if (selection) {
          loaded = selection;
          setSavedSelection(selection);
          setSelectedObjective(selection.objective_id);
          setSelectedIndustry(selection.industry_id);
        }
      }
    } finally {
      setCatalogLoading(false);
    }
    return loaded;
  }, []);

  useEffect(() => { void loadStrategy(); }, [loadStrategy]);

  // El asistente activó, creó o editó una estrategia: se recargan la selección
  // guardada y las propias. Si activó otra propia, se muestra esa.
  const activeCustomId = savedSelection?.custom_strategy_id ?? null;
  useDataChanged(['strategy'], () => {
    const before = activeCustomId;
    setCustomReload((n) => n + 1);
    void loadStrategy(false).then((sel) => {
      const after = sel?.custom_strategy_id ?? null;
      if (after && after !== before) {
        setMode('custom');
        setSelectedCustomId(after);
      }
    });
  });

  // ── Parámetros de la URL (enlaces del asistente) ─────────────────────────
  // Se aplican una vez por combinación, cuando ya está la selección guardada:
  // ?objective=&industry= previsualiza ese par (guardarlo es decisión del
  // usuario), ?custom=<id> abre esa propia. Sin parámetros se abre la pestaña
  // de la estrategia activa.
  const paramObjective = searchParams?.get('objective') ?? null;
  const paramIndustry  = searchParams?.get('industry') ?? null;
  const paramCustom    = searchParams?.get('custom') ?? null;
  const paramsKey = `${paramObjective ?? ''}|${paramIndustry ?? ''}|${paramCustom ?? ''}`;
  const appliedParams = useRef<string | null>(null);

  useEffect(() => {
    if (catalogLoading || appliedParams.current === paramsKey) return;
    appliedParams.current = paramsKey;
    if (paramCustom) {
      setMode('custom');
      setSelectedCustomId(paramCustom);
      return;
    }
    if (paramObjective || paramIndustry) {
      setMode('catalog');
      if (paramObjective) setSelectedObjective(paramObjective);
      if (paramIndustry) setSelectedIndustry(paramIndustry);
      return;
    }
    if (activeCustomId) {
      setMode('custom');
      setSelectedCustomId(activeCustomId);
    }
  }, [catalogLoading, paramsKey, paramCustom, paramObjective, paramIndustry, activeCustomId]);


  // ── Fetch recommendation whenever both selectors are filled ──────────────
  const fetchRecommendation = useCallback(async (objId: string, indId: string) => {
    setRecLoading(true);
    setStrategy(null);
    setTemplates([]);
    setIsFallback(false);
    setFallbackObjective(null);
    try {
      const res = await fetch(
        `/api/strategies/recommend?objective_id=${encodeURIComponent(objId)}&industry_id=${encodeURIComponent(indId)}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        const { strategy: s, templates: tpls, is_fallback, fallback_objective } = await res.json();
        setStrategy(s ?? null);
        setTemplates(tpls ?? []);
        if (is_fallback && fallback_objective) {
          setIsFallback(true);
          setFallbackObjective(fallback_objective);
        }
      }
    } finally {
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedObjective && selectedIndustry) {
      fetchRecommendation(selectedObjective, selectedIndustry);
    }
  }, [selectedObjective, selectedIndustry, fetchRecommendation]);

  // ── Fetch automation packs when objective changes ─────────────────────────
  useEffect(() => {
    if (!selectedObjective) { setPacks([]); return; }
    setPacksLoading(true);
    fetch(`/api/automations/engagement/packs?objective_id=${encodeURIComponent(selectedObjective)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { packs: [] })
      .then(d => setPacks(d.packs ?? []))
      .catch(() => setPacks([]))
      .finally(() => setPacksLoading(false));
  }, [selectedObjective]);

  async function installPack(packId: string) {
    setInstallingPack(packId);
    setFailedPacks((prev) => { const next = new Set(prev); next.delete(packId); return next; });
    try {
      const res = await fetch('/api/automations/engagement/rules/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: packId }),
      });
      if (res.ok) {
        setInstalledPacks(prev => new Set([...prev, packId]));
      } else {
        setFailedPacks((prev) => new Set([...prev, packId]));
      }
    } catch {
      setFailedPacks((prev) => new Set([...prev, packId]));
    } finally {
      setInstallingPack(null);
    }
  }

  // ── Save selection ────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedObjective || !selectedIndustry) return;
    setSaving(true);
    setSaveOk(false);
    setSaveError(null);
    try {
      const res = await fetch('/api/strategies/org', {
        method:  'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective_id: selectedObjective,
          industry_id:  selectedIndustry,
          strategy_id:  strategy?.id ?? null,
        }),
      });
      if (res.ok) {
        const { selection } = await res.json();
        setSavedSelection(selection);
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 3000);
      } else {
        setSaveError(res.status === 403 ? t.forbidden : t.genericError);
      }
    } catch {
      setSaveError(t.genericError);
    } finally {
      setSaving(false);
    }
  }

  // ── Navigate to content generator ────────────────────────────────────────
  function handleGenerate(template: Template) {
    const channel = template.channel_hint === 'general' ? 'instagram' : template.channel_hint;
    const topic   = locale === 'en' ? (template.topic_en || template.topic_es) : template.topic_es;
    const params  = new URLSearchParams({
      channel,
      topic,
      type:  template.format === 'carrusel' ? 'carousel' : template.format === 'reel' ? 'reel' : 'post',
    });
    router.push(`/${lang}/dashboard/content?${params}`);
  }

  function handleGenerateCustom(item: CustomCalendarItem) {
    router.push(`/${lang}/dashboard/content?${generateParams(item)}`);
  }

  // «Personalizar esta estrategia»: abre el editor de propias con la del
  // catálogo ya copiada. El editor se lleva el foco (y la vista) al abrirse.
  function startFromRecommended() {
    if (!strategy) return;
    const draft = draftFromCatalog(strategy, templates, {
      locale,
      objectiveId: selectedObjective,
      suffix: t.customSuffix,
    });
    setPrefill((prev) => ({ id: (prev?.id ?? 0) + 1, draft }));
    setMode('custom');
  }

  // Sin estrategia en el catálogo para este par: una propia desde cero, con el
  // objetivo ya elegido.
  function startCustomFromScratch() {
    const draft = { ...emptyDraft(), objective_id: selectedObjective ?? '' };
    setPrefill((prev) => ({ id: (prev?.id ?? 0) + 1, draft }));
    setMode('custom');
  }

  const onSelectionSaved = useCallback((selection: OrgSelection) => {
    setSavedSelection(selection);
  }, []);
  const onSelectionStale = useCallback(() => {
    setSavedSelection((prev) => (prev ? { ...prev, custom_strategy_id: null } : prev));
  }, []);

  // Pestañas de ARIA: las flechas (y Inicio/Fin) cambian de pestaña y mueven el foco.
  function onTabsKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = MODES.indexOf(mode);
    let next: Mode | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = MODES[(index + 1) % MODES.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = MODES[(index - 1 + MODES.length) % MODES.length];
    else if (e.key === 'Home') next = MODES[0];
    else if (e.key === 'End') next = MODES[MODES.length - 1];
    if (!next) return;
    e.preventDefault();
    setMode(next);
    tabRefs.current[next]?.focus();
  }

  const localizedText = (es?: string | null, en?: string | null, fallback?: string | null) => {
    if (locale === 'en') return en || es || fallback || '';
    return es || en || fallback || '';
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (catalogLoading) {
    return (
      <div className="page" style={{ maxWidth: 900 }} aria-busy="true">
        <p role="status" className="sr-only">{t.loading}</p>
        <div style={{ marginBottom: 40 }}>
          <SkeletonBlock width={100} height={11} style={{ marginBottom: 10 }} />
          <SkeletonBlock width="min(260px, 80%)" height={24} style={{ marginBottom: 10 }} />
          <SkeletonBlock width="min(420px, 100%)" height={13} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
          <SkeletonBlock width={110} height={34} borderRadius={8} />
          <SkeletonBlock width={110} height={34} borderRadius={8} />
        </div>
        <div className="auto-grid" style={{ '--min': '200px', '--gap': '14px' } as CSSProperties}>
          {[...Array(6)].map((_, i) => (
            <SkeletonBlock key={i} height={100} borderRadius={12} />
          ))}
        </div>
      </div>
    );
  }

  // La del catálogo está activa si coincide el par guardado y no manda una propia.
  const isSelectionSaved =
    savedSelection?.objective_id === selectedObjective &&
    savedSelection?.industry_id === selectedIndustry &&
    !activeCustomId;
  const catalogActive = !!savedSelection?.strategy_id && !activeCustomId;
  const currentIndustry = industries.find((i) => i.id === selectedIndustry);
  const marketHref = `/${lang}/dashboard/brand/market`;

  const catalogRows: CalendarRow[] = templates.map((tpl) => ({
    key: tpl.id,
    week: tpl.week_num,
    icon: formatIcon(tpl.format),
    format: catalogFormatLabel(tpl.format, t),
    channel: channelName(tpl.channel_hint, t),
    topic: localizedText(tpl.topic_es, tpl.topic_en),
    detail: localizedText(tpl.copy_structure_es, tpl.copy_structure_en),
    goal: localizedText(tpl.goal_es, tpl.goal_en),
    onGenerate: () => handleGenerate(tpl),
  }));

  return (
    <div className="page" style={{ maxWidth: 900 }}>

      {/* ── Header ── */}
      <header className="page-header">
        <div>
          <span className={styles.eyebrow}>{t.sectionLabel}</span>
          <h1>{t.heading}</h1>
          <p style={{ maxWidth: 560, lineHeight: 1.6, marginTop: 8 }}>{t.headingDesc}</p>
        </div>
      </header>

      {/* ── Modos ── */}
      <div role="tablist" aria-label={t.modesLabel} className={styles.tabs} onKeyDown={onTabsKeyDown}>
        {MODES.map((m) => {
          const selected = mode === m;
          const active = m === 'catalog' ? catalogActive : !!activeCustomId;
          return (
            <button
              key={m}
              ref={(el) => { tabRefs.current[m] = el; }}
              type="button"
              role="tab"
              id={`strategy-tab-${m}`}
              aria-selected={selected}
              aria-controls="strategy-panel"
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => setMode(m)}
            >
              {m === 'catalog' ? t.modeCatalog : t.modeCustom}
              {active && <ActiveBadge label={t.activeBadge} />}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="strategy-panel" aria-labelledby={`strategy-tab-${mode}`}>
      {mode === 'custom' ? (
        <CustomStrategyPanel
          lang={locale}
          objectives={objectives}
          activeCustomId={activeCustomId}
          canEdit={canEdit}
          selectedId={selectedCustomId}
          onSelectedIdChange={setSelectedCustomId}
          onSelectionSaved={onSelectionSaved}
          onSelectionStale={onSelectionStale}
          reloadToken={customReload}
          prefill={prefill}
          onGenerate={handleGenerateCustom}
        />
      ) : (
      <>
      {activeCustomId && (
        <div className={styles.block}>
          <Notice tone="accent" live={false} icon={<Icon name="info" size={16} />}>{t.customActiveElsewhere}</Notice>
        </div>
      )}

      {/* ── Step 1: Objective ── */}
      <StrategySection label={t.step1}>
        <div className="auto-grid" style={{ '--min': '200px', '--gap': '12px' } as CSSProperties}>
          {objectives.map((obj) => {
            const selected = selectedObjective === obj.id;
            return (
              <button
                key={obj.id}
                type="button"
                aria-pressed={selected}
                className={`${styles.optionCard} ui-link-card`}
                onClick={() => setSelectedObjective(obj.id)}
              >
                <span className={styles.optionTop}>
                  <span className={styles.optionIcon} aria-hidden="true">{obj.icon}</span>
                  {selected && <Icon name="check-circle" size={18} className={styles.optionCheck} />}
                </span>
                <span className={styles.optionName}>{locale === 'en' ? obj.name_en : obj.name_es}</span>
                <span className={styles.optionDesc}>{locale === 'en' ? obj.desc_en : obj.desc_es}</span>
              </button>
            );
          })}
        </div>
      </StrategySection>

      {/* ── Step 2: Industria (se define en Mercado) ── */}
      <StrategySection label={t.step2}>
        {currentIndustry ? (
          <div className={styles.industryRow}>
            <span className={styles.industryPill}>
              {currentIndustry.icon && <span aria-hidden="true">{currentIndustry.icon}</span>}
              <span>{locale === 'en' ? (currentIndustry.name_en || currentIndustry.name_es) : currentIndustry.name_es}</span>
            </span>
            <Link href={marketHref} className={styles.inlineLink}>
              {t.industry.change}
              <Icon name="arrow-right" size={14} />
            </Link>
          </div>
        ) : (
          <div className={styles.industryMissing}>
            <span>{t.industry.missing}</span>
            <ButtonLink href={marketHref} variant="primary" size="sm">
              {t.industry.goToMarket}
              <Icon name="arrow-right" size={14} />
            </ButtonLink>
          </div>
        )}
      </StrategySection>

      {/* ── Strategy recommendation ── */}
      {selectedObjective && selectedIndustry && (
        <>
          {recLoading && (
            <p role="status" className={styles.loadingLine}>
              <Spinner size={14} /> {t.recLoading}
            </p>
          )}

          {!recLoading && !strategy && (
            <div className={`ui-card ${styles.block}`} style={{ padding: 0, borderStyle: 'dashed' }}>
              <EmptyState
                icon={<Icon name="target" size={32} />}
                title={t.noStrategy}
                hint={canEdit ? t.noStrategyHint : undefined}
                action={canEdit && (
                  <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={startCustomFromScratch}>
                    {t.noStrategyAction}
                  </Button>
                )}
              />
            </div>
          )}

          {!recLoading && strategy && (
            <>
              {/* ── Framework ── */}
              <StrategySection label={t.step3}>
                {isFallback && fallbackObjective && (
                  <div className={styles.block} style={{ marginBottom: 16 }}>
                    <Notice tone="accent" live={false} icon={<Icon name="info" size={16} />}>
                      {t.fallbackHint}{' '}
                      <strong style={{ color: 'var(--text)' }}>
                        {locale === 'en' ? fallbackObjective.name_en : fallbackObjective.name_es}
                      </strong>
                    </Notice>
                  </div>
                )}
                <StrategyOverview
                  t={t}
                  headingAs="h3"
                  name={locale === 'en' ? strategy.framework_name_en : strategy.framework_name_es}
                  active={isSelectionSaved}
                  meta={isSelectionSaved ? t.catalogActiveHint : undefined}
                  description={locale === 'en' ? strategy.framework_desc_en : strategy.framework_desc_es}
                  kpiPrimary={locale === 'en' ? (strategy.kpi_primary_en || strategy.kpi_primary_es) : strategy.kpi_primary_es}
                  kpiSecondary={locale === 'en' ? (strategy.kpi_secondary_en || strategy.kpi_secondary_es) : strategy.kpi_secondary_es}
                />
              </StrategySection>

              {/* ── Weekly calendar ── */}
              {catalogRows.length > 0 && (
                <StrategySection label={t.step4} headingId="strategy-catalog-calendar">
                  <StrategyCalendar t={t} rows={catalogRows} labelledBy="strategy-catalog-calendar" />
                </StrategySection>
              )}

              {/* ── Interaction layers ── */}
              {strategy.interaction_layers?.length > 0 && (
                <StrategySection label={t.step5}>
                  <div className="auto-grid" style={{ '--min': '240px', '--gap': '16px' } as CSSProperties}>
                    {strategy.interaction_layers.map((layer, idx) => (
                      <div key={idx} className={styles.layerCard}>
                        <p className={styles.layerNum}>{locale === 'en' ? layer.num_en : layer.num_es}</p>
                        <h3 className={styles.layerTitle}>{locale === 'en' ? layer.title_en : layer.title_es}</h3>
                        <ul className={styles.layerList}>
                          {(locale === 'en' ? layer.items_en : layer.items_es).map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </StrategySection>
              )}

              {/* ── CTA mechanic ── */}
              {strategy.cta_mechanic_es && (
                <ConversionMechanic
                  t={t}
                  text={locale === 'en' ? (strategy.cta_mechanic_en || strategy.cta_mechanic_es) : strategy.cta_mechanic_es}
                />
              )}

              {/* ── Automation packs ── */}
              {(packsLoading || packs.length > 0) && (
                <StrategySection label={t.packs.title}>
                  {packsLoading ? (
                    <p role="status" className={styles.loadingLine} style={{ marginBottom: 0 }}>
                      <Spinner size={14} /> {t.packs.loading}
                    </p>
                  ) : (
                    <div className="auto-grid" style={{ '--min': '260px', '--gap': '14px' } as CSSProperties}>
                      {packs.map(pack => {
                        const installed = installedPacks.has(pack.id);
                        const installing = installingPack === pack.id;
                        const packName = localizedText(pack.name_es, pack.name_en, pack.name);
                        const packDescription = localizedText(pack.desc_es, pack.desc_en, pack.description);
                        return (
                          <div key={pack.id} className={styles.packCard} data-installed={installed}>
                            <div className={styles.packHead}>
                              {pack.icon && <span className={styles.packIcon} aria-hidden="true">{pack.icon}</span>}
                              <h3 className={styles.packName}>{packName}</h3>
                            </div>
                            {packDescription && <p className={styles.packDesc}>{packDescription}</p>}
                            {pack.kefy_automation_pack_rules?.length > 0 && (
                              <ul className={styles.packRules}>
                                {pack.kefy_automation_pack_rules.map(r => (
                                  <li key={r.id}>{localizedText(r.name_es, r.name_en, r.name)}</li>
                                ))}
                              </ul>
                            )}
                            <div className={styles.packFooter}>
                              {installed ? (
                                <p role="status" className={styles.packInstalled}>
                                  <Icon name="check-circle" size={16} /> {t.packs.installed}
                                </p>
                              ) : (
                                <Button
                                  block
                                  variant="primary"
                                  loading={installing}
                                  onClick={() => { void installPack(pack.id); }}
                                >
                                  {installing ? t.packs.installing : t.packs.install}
                                </Button>
                              )}
                              {failedPacks.has(pack.id) && <p role="alert" className="ui-error">{t.packs.installError}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </StrategySection>
              )}

              {/* ── Save button ── */}
              {saveError && (
                <div style={{ marginBottom: 16 }}>
                  <Notice tone="danger" icon={<Icon name="alert" size={16} />}>{saveError}</Notice>
                </div>
              )}
              <div className={styles.saveRow}>
                <Button
                  variant={isSelectionSaved ? 'secondary' : 'primary'}
                  size="lg"
                  icon={isSelectionSaved ? <Icon name="check" size={16} /> : undefined}
                  loading={saving}
                  disabled={isSelectionSaved}
                  onClick={() => { void handleSave(); }}
                >
                  {saving ? t.saving : isSelectionSaved ? t.strategySaved : t.saveStrategy}
                </Button>
                {canEdit && (
                  <Button variant="secondary" size="lg" icon={<Icon name="edit" size={16} />} onClick={startFromRecommended}>
                    {t.startFromRecommended}
                  </Button>
                )}
                <p role="status" className={saveOk ? styles.savedOk : 'sr-only'}>{saveOk ? t.savedOk : ''}</p>
              </div>
            </>
          )}
        </>
      )}
      </>
      )}
      </div>
    </div>
  );
}
