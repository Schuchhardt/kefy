'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Objective {
  id:       string;
  slug:     string;
  name_es:  string;
  name_en:  string;
  desc_es:  string;
  desc_en:  string;
  icon:     string;
}

interface Industry {
  id:       string;
  slug:     string;
  name_es:  string;
  name_en:  string;
  icon:     string;
  desc_es:  string;
}

interface Strategy {
  id:                 string;
  framework_slug:     string;
  framework_name_es:  string;
  framework_name_en:  string;
  framework_desc_es:  string;
  framework_desc_en:  string;
  kpi_primary_es:     string;
  kpi_primary_en:     string;
  kpi_secondary_es:   string;
  kpi_secondary_en:   string;
  interaction_layers: Array<{ num_es: string; num_en: string; title_es: string; title_en: string; items_es: string[]; items_en: string[] }>;
  cta_mechanic_es:    string;
  cta_mechanic_en:    string;
}

interface Template {
  id:               string;
  week_num:         number;
  post_num:         number;
  format:           string;
  channel_hint:     string;
  topic_es:         string;
  topic_en:         string;
  copy_structure_es: string;
  copy_structure_en: string;
  goal_es:          string;
  goal_en:          string;
}

interface OrgSelection {
  objective_id: string | null;
  industry_id:  string | null;
  strategy_id:  string | null;
  custom_notes: string | null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardStyle = (selected: boolean): React.CSSProperties => ({
  background:   selected ? 'rgba(198,255,75,0.08)' : 'var(--surface)',
  border:       `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 12,
  padding:      '18px 20px',
  cursor:       'pointer',
  transition:   'all .15s ease',
});

const sectionLabel: React.CSSProperties = {
  fontSize:     11,
  fontWeight:   700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color:        'var(--muted)',
  marginBottom:  16,
};

const FORMAT_ICONS: Record<string, string> = {
  carrusel:   '▦',
  reel:       '▶',
  post:       '✦',
  story:      '⬜',
  infografía: '◉',
  email:      '✉',
};
import esT from '@/locales/es/dashboard/strategy';
import enT from '@/locales/en/dashboard/strategy';

const T = { es: esT, en: enT } as const;
type Locale = keyof typeof T;
// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const { lang } = useParams<{ lang: string }>();
  const router   = useRouter();
  const locale   = (lang === 'en' ? 'en' : 'es') as Locale;
  const t        = T[locale];

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
  const [packs, setPacks]             = useState<AutomationPack[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [installedPacks, setInstalledPacks] = useState<Set<string>>(new Set());
  const [installingPack, setInstallingPack] = useState<string | null>(null);

  // ── Load catalog + saved selection on mount ──────────────────────────────
  useEffect(() => {
    async function init() {
      setCatalogLoading(true);
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
            setSavedSelection(selection);
            setSelectedObjective(selection.objective_id);
            setSelectedIndustry(selection.industry_id);
          }
        }
      } finally {
        setCatalogLoading(false);
      }
    }
    init();
  }, []);


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
        const { strategy: s, templates: t, is_fallback, fallback_objective } = await res.json();
        setStrategy(s ?? null);
        setTemplates(t ?? []);
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
    try {
      const res = await fetch('/api/automations/engagement/rules/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: packId }),
      });
      if (res.ok) {
        setInstalledPacks(prev => new Set([...prev, packId]));
      }
    } finally {
      setInstallingPack(null);
    }
  }

  // ── Save selection ────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedObjective || !selectedIndustry) return;
    setSaving(true);
    setSaveOk(false);
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
      }
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

  // ── Group templates by week ───────────────────────────────────────────────
  const weeks = templates.reduce<Record<number, Template[]>>((acc, t) => {
    acc[t.week_num] = acc[t.week_num] ?? [];
    acc[t.week_num].push(t);
    return acc;
  }, {});

  const localizedText = (es?: string | null, en?: string | null, fallback?: string | null) => {
    if (locale === 'en') return en || es || fallback || '';
    return es || en || fallback || '';
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (catalogLoading) {
    return (
      <div style={{ padding: '48px 32px', color: 'var(--muted)', fontSize: 14 }}>
        {t.loading}
      </div>
    );
  }

  const isSelectionSaved =
    savedSelection?.objective_id === selectedObjective &&
    savedSelection?.industry_id === selectedIndustry;

  return (
    <div style={{ padding: '32px', maxWidth: 900, fontFamily: 'var(--font-geist-sans)' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 40 }}>
        <p style={{ ...sectionLabel, marginBottom: 8 }}>{t.sectionLabel}</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0, fontFamily: 'var(--font-syne)' }}>
          {t.heading}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 8, maxWidth: 560, lineHeight: 1.6 }}>
          {t.headingDesc}
        </p>
      </div>

      {/* ── Step 1: Objective ── */}
      <div style={{ marginBottom: 40 }}>
        <p style={sectionLabel}>{t.step1}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {objectives.map((obj) => (
            <div
              key={obj.id}
              style={cardStyle(selectedObjective === obj.id)}
              onClick={() => setSelectedObjective(obj.id)}
              role="button"
              aria-pressed={selectedObjective === obj.id}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>{obj.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                {locale === 'en' ? obj.name_en : obj.name_es}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                {locale === 'en' ? obj.desc_en : obj.desc_es}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Industria (read-only, configurada en Mercado) ── */}
      {(() => {
        const currentIndustry = industries.find((i) => i.id === selectedIndustry);
        return currentIndustry ? (
          <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 100, padding: '8px 16px', fontSize: 13, color: 'var(--text)',
            }}>
              <span style={{ fontSize: 16 }}>{currentIndustry.icon}</span>
              <span style={{ fontWeight: 600 }}>
                {locale === 'en' ? currentIndustry.name_en : currentIndustry.name_es}
              </span>
            </div>
            <a
              href={`/${lang}/dashboard/brand/market`}
              style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
            >
              {locale === 'es' ? 'Cambiar en Mercado →' : 'Change in Market →'}
            </a>
          </div>
        ) : (
          <div style={{
            marginBottom: 32,
            background: 'var(--surface)', border: '1px dashed var(--border)',
            borderRadius: 10, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {locale === 'es'
                ? 'Define tu industria para ver la estrategia recomendada.'
                : 'Set your industry to see the recommended strategy.'}
            </span>
            <a
              href={`/${lang}/dashboard/brand/market`}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: 'var(--accent)', color: '#000',
                fontSize: 13, fontWeight: 700, textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {locale === 'es' ? 'Ir a Mercado →' : 'Go to Market →'}
            </a>
          </div>
        );
      })()}

      {/* ── Strategy recommendation ── */}
      {selectedObjective && selectedIndustry && (
        <>
          {recLoading && (
            <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>
              {t.recLoading}
            </div>
          )}

          {!recLoading && !strategy && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px dashed var(--border)',
                borderRadius: 12,
                padding: '32px 24px',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: 14,
                marginBottom: 32,
              }}
            >
              {t.noStrategy}
            </div>
          )}

          {!recLoading && strategy && (
            <>
              {/* ── Framework ── */}
              <div style={{ marginBottom: 40 }}>
                <p style={sectionLabel}>{t.step3}</p>

                {isFallback && fallbackObjective && (
                  <div style={{
                    background: 'rgba(198,255,75,0.07)',
                    border: '1px solid rgba(198,255,75,0.25)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: 'var(--muted)',
                    marginBottom: 16,
                    lineHeight: 1.5,
                  }}>
                    {t.fallbackHint}{' '}
                    <strong style={{ color: 'var(--text)' }}>
                      {locale === 'en' ? fallbackObjective.name_en : fallbackObjective.name_es}
                    </strong>
                  </div>
                )}
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '24px 28px',
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-syne)', fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
                    {locale === 'en' ? strategy.framework_name_en : strategy.framework_name_es}
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 20 }}>
                    {locale === 'en' ? strategy.framework_desc_en : strategy.framework_desc_es}
                  </p>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 4 }}>
                        {t.kpiPrimary}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }}>
                        {locale === 'en' ? (strategy.kpi_primary_en || strategy.kpi_primary_es) : strategy.kpi_primary_es}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 4 }}>
                        {t.kpiSecondary}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text)' }}>
                        {locale === 'en' ? (strategy.kpi_secondary_en || strategy.kpi_secondary_es) : strategy.kpi_secondary_es}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Weekly calendar ── */}
              <div style={{ marginBottom: 40 }}>
                <p style={sectionLabel}>{t.step4}</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                        {t.tableHeaders.map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              fontWeight: 700,
                              color: 'var(--muted)',
                              fontSize: 11,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(weeks)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([week, tpls]) =>
                          tpls.map((t2, idx) => (
                            <tr
                              key={t2.id}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                background: 'transparent',
                                transition: 'background .1s',
                              }}
                              onMouseEnter={(e) =>
                                ((e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface)')
                              }
                              onMouseLeave={(e) =>
                                ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')
                              }
                            >
                              {idx === 0 && (
                                <td
                                  rowSpan={tpls.length}
                                  style={{
                                    padding: '12px',
                                    fontWeight: 700,
                                    color: 'var(--accent)',
                                    fontSize: 13,
                                    verticalAlign: 'top',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  S{week}
                                </td>
                              )}
                              <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: 16, marginRight: 6 }}>
                                  {FORMAT_ICONS[t2.format] ?? '◉'}
                                </span>
                                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                                  {t2.format}
                                </span>
                              </td>
                              <td style={{ padding: '12px', color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                                {t2.channel_hint}
                              </td>
                              <td style={{ padding: '12px', color: 'var(--text)', lineHeight: 1.5, maxWidth: 300 }}>
                                {locale === 'en' ? (t2.topic_en || t2.topic_es) : t2.topic_es}
                                {(locale === 'en' ? (t2.copy_structure_en || t2.copy_structure_es) : t2.copy_structure_es) && (
                                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                                    {locale === 'en' ? (t2.copy_structure_en || t2.copy_structure_es) : t2.copy_structure_es}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '12px', color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                                {locale === 'en' ? (t2.goal_en || t2.goal_es) : t2.goal_es}
                              </td>
                              <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                <button
                                  onClick={() => handleGenerate(t2)}
                                  style={{
                                    background: 'var(--accent)',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: 8,
                                    padding: '7px 14px',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {t.generateBtn}
                                </button>
                              </td>
                            </tr>
                          )),
                        )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Interaction layers ── */}
              {strategy.interaction_layers?.length > 0 && (
                <div style={{ marginBottom: 40 }}>
                  <p style={sectionLabel}>{t.step5}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                    {strategy.interaction_layers.map((layer, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: '20px 20px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--accent)',
                            marginBottom: 6,
                          }}
                        >
                          {locale === 'en' ? layer.num_en : layer.num_es}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
                          {locale === 'en' ? layer.title_en : layer.title_es}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--muted)', fontSize: 13, lineHeight: 1.7 }}>
                          {(locale === 'en' ? layer.items_en : layer.items_es).map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── CTA mechanic ── */}
              {strategy.cta_mechanic_es && (
                <div
                  style={{
                    background: 'rgba(198,255,75,0.06)',
                    border: '1px solid rgba(198,255,75,0.25)',
                    borderRadius: 12,
                    padding: '20px 24px',
                    marginBottom: 40,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
                    {t.conversionMechanic}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.7 }}>
                    {locale === 'en' ? (strategy.cta_mechanic_en || strategy.cta_mechanic_es) : strategy.cta_mechanic_es}
                  </p>
                </div>
              )}

              {/* ── Automation packs ── */}
              {(packsLoading || packs.length > 0) && (
                <div style={{ marginBottom: 40 }}>
                  <p style={sectionLabel}>
                    {locale === 'es' ? 'Automatizaciones recomendadas' : 'Recommended automations'}
                  </p>
                  {packsLoading ? (
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>⏳</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                      {packs.map(pack => {
                        const installed = installedPacks.has(pack.id);
                        const installing = installingPack === pack.id;
                        const packName = localizedText(pack.name_es, pack.name_en, pack.name);
                        const packDescription = localizedText(pack.desc_es, pack.desc_en, pack.description);
                        return (
                          <div key={pack.id} style={{
                            background: 'var(--surface)', border: `1px solid ${installed ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: 12, padding: '18px 20px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                              {pack.icon && <span style={{ fontSize: 22 }}>{pack.icon}</span>}
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{packName}</div>
                            </div>
                            {packDescription && (
                              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 12px' }}>
                                {packDescription}
                              </p>
                            )}
                            {pack.kefy_automation_pack_rules?.length > 0 && (
                              <ul style={{ margin: '0 0 14px', paddingLeft: 16, listStyle: 'disc', color: 'var(--muted)', fontSize: 12, lineHeight: 1.8 }}>
                                {pack.kefy_automation_pack_rules.map(r => (
                                  <li key={r.id}>{localizedText(r.name_es, r.name_en, r.name)}</li>
                                ))}
                              </ul>
                            )}
                            <button
                              onClick={() => installPack(pack.id)}
                              disabled={installed || installing}
                              style={{
                                width: '100%', padding: '8px', borderRadius: 8,
                                border: installed ? '1px solid var(--accent)' : 'none',
                                background: installed ? 'transparent' : 'var(--accent)',
                                color: installed ? 'var(--accent)' : '#000',
                                fontWeight: 600, fontSize: 13,
                                cursor: (installed || installing) ? 'default' : 'pointer',
                              }}
                            >
                              {installing ? '⏳' : installed
                                ? (locale === 'es' ? '✓ Pack instalado' : '✓ Pack installed')
                                : (locale === 'es' ? 'Instalar pack' : 'Install pack')}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Save button ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button
                  onClick={handleSave}
                  disabled={saving || isSelectionSaved}
                  style={{
                    background:    isSelectionSaved ? 'var(--surface)' : 'var(--accent)',
                    color:         isSelectionSaved ? 'var(--muted)' : '#000',
                    border:        isSelectionSaved ? '1px solid var(--border)' : 'none',
                    borderRadius:  10,
                    padding:       '12px 28px',
                    fontSize:      14,
                    fontWeight:    700,
                    cursor:        isSelectionSaved ? 'default' : 'pointer',
                    transition:    'all .15s ease',
                  }}
                >
                  {saving ? t.saving : isSelectionSaved ? t.strategySaved : t.saveStrategy}
                </button>
                {saveOk && (
                  <span style={{ fontSize: 13, color: 'var(--accent)' }}>{t.savedOk}</span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
