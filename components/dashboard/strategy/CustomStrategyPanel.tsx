'use client';

// ─── Estrategias propias (pestaña «Personalizadas» de /brand/strategy) ───────
//
// Lista las estrategias propias de la organización, muestra la elegida con el
// mismo aspecto que una del catálogo (enfoque, KPIs, calendario con «Generar»,
// mecánica de conversión) y permite crearlas, editarlas, activarlas y
// borrarlas. Escribir es solo para owner/admin: con `canEdit` en false se
// oculta, y si el servidor responde 403 igual se explica.
//
// La lista se recarga cuando cambia `reloadToken` (el asistente tocó la
// estrategia). `prefill` abre el editor con un borrador (p. ej. «Personalizar
// esta estrategia» desde la pestaña de recomendadas).
//
// También exporta las piezas que la pestaña de recomendadas pinta igual
// (StrategySection, StrategyOverview, StrategyCalendar, ConversionMechanic y
// ActiveBadge): así las dos pestañas no divergen.

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import esT, { type StrategyCopy } from '@/locales/es/dashboard/strategy';
import enT from '@/locales/en/dashboard/strategy';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';
import { openAssistant } from '@/lib/assistant/open';
import type { CustomCalendarItem, CustomStrategy, Objective, OrgSelection } from '@/types/strategy';
import Button, { Spinner } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import EmptyState from '@/components/ui/EmptyState';
import Icon, { type IconName } from '@/components/ui/icons';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import CustomStrategyEditor, { type EditorServerError } from './CustomStrategyEditor';
import {
  CUSTOM_STRATEGY_LIMITS,
  calendarStats,
  channelName,
  draftFromCustom,
  draftToPayload,
  emptyDraft,
  formatIcon,
  type CustomDraft,
} from './custom-strategy-model';
import styles from './CustomStrategyPanel.module.css';

const T = { es: esT, en: enT } as const;
type Texts = StrategyCopy;

interface Props {
  lang: 'es' | 'en';
  objectives: Objective[];
  /** Id de la estrategia propia activa en la org, o null. */
  activeCustomId: string | null;
  canEdit: boolean;
  selectedId: string | null;
  onSelectedIdChange: (id: string | null) => void;
  /** La org cambió de estrategia activa (respuesta del servidor). */
  onSelectionSaved: (selection: OrgSelection) => void;
  /** La org puede haber cambiado de estrategia activa sin devolverla (borrado). */
  onSelectionStale: () => void;
  reloadToken: number;
  prefill: { id: number; draft: CustomDraft } | null;
  onGenerate: (item: CustomCalendarItem) => void;
}

type EditorState = { mode: 'create' | 'edit'; id?: string; draft: CustomDraft; key: number };

// ─── Piezas compartidas con la pestaña de recomendadas ───────────────────────

/** Pastilla «Activa»: texto sobre el acento con --on-accent (antes #000). */
export function ActiveBadge({ label }: { label: string }) {
  return (
    <span
      className="ui-badge"
      style={{
        '--badge-color': 'var(--on-accent)',
        '--badge-bg': 'var(--accent)',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      } as CSSProperties}
    >
      {label}
    </span>
  );
}

/** Bloque con su rótulo como encabezado (h2 en recomendadas, h3 en propias). */
export function StrategySection({
  label, as: Heading = 'h2', children, className, headingId: givenId,
}: {
  label: string;
  as?: 'h2' | 'h3';
  children: ReactNode;
  className?: string;
  /** Id del encabezado, para nombrar con él una tabla de dentro. */
  headingId?: string;
}) {
  const autoId = `strategy-section-${useId().replace(/:/g, '')}`;
  const headingId = givenId ?? autoId;
  return (
    <section aria-labelledby={headingId} className={[styles.section, className].filter(Boolean).join(' ')}>
      <Heading id={headingId} className={styles.sectionLabel}>{label}</Heading>
      {children}
    </section>
  );
}

/** Nombre, insignia, objetivo, enfoque y KPIs; `children`, las acciones. */
export function StrategyOverview({
  t, name, active, meta, description, kpiPrimary, kpiSecondary, headingAs: Heading = 'h3', children,
}: {
  t: Texts;
  name: string;
  active?: boolean;
  meta?: ReactNode;
  description?: string | null;
  kpiPrimary?: string | null;
  kpiSecondary?: string | null;
  headingAs?: 'h2' | 'h3';
  children?: ReactNode;
}) {
  return (
    <div className={styles.overview}>
      <div className={styles.overviewTitleRow}>
        <Heading className={styles.overviewTitle}>{name}</Heading>
        {active && <ActiveBadge label={t.activeBadge} />}
      </div>
      {meta && <p className={styles.overviewMeta}>{meta}</p>}
      {description && <p className={styles.overviewDesc}>{description}</p>}
      {(kpiPrimary || kpiSecondary) && (
        <dl className={styles.kpis} style={{ margin: 0 }}>
          {kpiPrimary && (
            <div>
              <dt className={styles.kpiLabel}>{t.kpiPrimary}</dt>
              <dd className={styles.kpiPrimary} style={{ margin: 0 }}>{kpiPrimary}</dd>
            </div>
          )}
          {kpiSecondary && (
            <div>
              <dt className={styles.kpiLabel}>{t.kpiSecondary}</dt>
              <dd className={styles.kpiSecondary} style={{ margin: 0 }}>{kpiSecondary}</dd>
            </div>
          )}
        </dl>
      )}
      {children && <div className={styles.buttonRow} style={{ marginTop: 20 }}>{children}</div>}
    </div>
  );
}

export function ConversionMechanic({ t, text }: { t: Texts; text: string }) {
  return (
    <div className={styles.mechanic}>
      <p className={styles.mechanicLabel}>{t.conversionMechanic}</p>
      <p className={styles.mechanicText}>{text}</p>
    </div>
  );
}

export interface CalendarRow {
  key: string;
  week: number;
  icon: IconName;
  format: string;
  channel: string;
  topic: string;
  detail?: string | null;
  goal?: string | null;
  onGenerate: () => void;
}

/**
 * Calendario por semanas. Cada semana es un <tbody> con su fila de grupo
 * («Semana 1»); en móvil cada pieza se ve como una tarjeta. «Generar» lleva
 * el tema en el nombre accesible: si no, un lector de pantalla oía diez
 * botones «Generar» iguales.
 */
export function StrategyCalendar({ t, rows, labelledBy }: { t: Texts; rows: CalendarRow[]; labelledBy?: string }) {
  const weeks = new Map<number, CalendarRow[]>();
  for (const row of [...rows].sort((a, b) => a.week - b.week)) {
    weeks.set(row.week, [...(weeks.get(row.week) ?? []), row]);
  }
  const [hFormat, hChannel, hTopic, hGoal, hActions] = t.tableHeaders;

  return (
    <div className={styles.calendarWrap}>
      <table className={styles.calendar} aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col" className={styles.colHead}>{hFormat}</th>
            <th scope="col" className={styles.colHead}>{hChannel}</th>
            <th scope="col" className={styles.colHead}>{hTopic}</th>
            <th scope="col" className={styles.colHead}>{hGoal}</th>
            <th scope="col" className={styles.colHead}><span className="sr-only">{hActions}</span></th>
          </tr>
        </thead>
        {[...weeks.entries()].map(([week, items]) => (
          <tbody key={week}>
            <tr className={styles.weekRow}>
              <th scope="rowgroup" colSpan={5}>{t.weekLabel(week)}</th>
            </tr>
            {items.map((row) => (
              <tr key={row.key} className={styles.itemRow}>
                <td className={styles.formatCell}>
                  <span className={styles.formatInner}>
                    <Icon name={row.icon} size={16} />
                    {row.format}
                  </span>
                </td>
                <td className={styles.channelCell}>{row.channel}</td>
                <td className={styles.topicCell}>
                  {row.topic}
                  {row.detail && <div className={styles.detail}>{row.detail}</div>}
                </td>
                <td className={styles.goalCell}>
                  {row.goal && <><span className={styles.cellLabel}>{hGoal}: </span>{row.goal}</>}
                </td>
                <td className={styles.actionCell}>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Icon name="sparkles" size={14} />}
                    aria-label={t.generateFor(row.topic)}
                    onClick={row.onGenerate}
                  >
                    {t.generateBtn}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// ─── Errores del servidor ────────────────────────────────────────────────────

interface Flattened { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> }

async function readError(res: Response, t: Texts): Promise<EditorServerError> {
  let body: { error?: string; issues?: Flattened } = {};
  try { body = await res.json(); } catch { body = {}; }
  if (res.status === 403) return { message: t.forbidden, details: [] };
  if (res.status === 404) return { message: t.custom.notFound, details: [] };
  if (res.status === 409) return { message: body.error || t.custom.limitReached(CUSTOM_STRATEGY_LIMITS.perOrg), details: [] };
  if (res.status === 422) {
    const fields = t.editor.fields as Record<string, string>;
    const details = [
      ...(body.issues?.formErrors ?? []),
      ...Object.entries(body.issues?.fieldErrors ?? {}).map(
        ([field, msgs]) => `${fields[field] ?? field}: ${(msgs ?? []).join(', ')}`,
      ),
    ];
    return { message: details.length ? t.editor.errors.invalid : (body.error || t.editor.errors.invalid), details };
  }
  return { message: body.error || t.genericError, details: [] };
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function CustomStrategyPanel({
  lang, objectives, activeCustomId, canEdit, selectedId, onSelectedIdChange,
  onSelectionSaved, onSelectionStale, reloadToken, prefill, onGenerate,
}: Props) {
  const t = T[lang];
  const tc = t.custom;
  const common = lang === 'en' ? enCommon : esCommon;
  const { confirm, dialog } = useConfirm();

  const [strategies, setStrategies] = useState<CustomStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<EditorServerError | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: 'activate' | 'delete' } | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const editorKey = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const qs = `lang=${lang}`;

  const flash = useCallback((kind: 'error' | 'ok', text: string) => {
    setNotice({ kind, text });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (kind === 'ok') noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // ── Carga ────────────────────────────────────────────────────────────────
  // La carga lee la selección y la activa del momento sin volver a dispararse
  // cada vez que cambian.
  const selectedRef = useRef(selectedId);
  const activeRef = useRef(activeCustomId);
  useEffect(() => {
    selectedRef.current = selectedId;
    activeRef.current = activeCustomId;
  }, [selectedId, activeCustomId]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch(`/api/strategies/custom?${qs}`, { credentials: 'include' });
      if (!res.ok) { setLoadError(true); return; }
      const { strategies: list } = (await res.json()) as { strategies?: CustomStrategy[] };
      const rows = list ?? [];
      setStrategies(rows);
      // Sin nada elegido: la activa, o la primera.
      if (!selectedRef.current && rows.length) {
        const active = rows.find((s) => s.id === activeRef.current);
        onSelectedIdChange((active ?? rows[0]).id);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [qs, onSelectedIdChange]);

  useEffect(() => { void load(); }, [load, reloadToken]);

  // ── Borrador que llega desde fuera ───────────────────────────────────────
  const prefillId = prefill?.id;
  const prefillDraft = prefill?.draft;
  useEffect(() => {
    if (prefillId === undefined || !prefillDraft) return;
    editorKey.current += 1;
    setEditor({ mode: 'create', draft: prefillDraft, key: editorKey.current });
    setEditorError(null);
  }, [prefillId, prefillDraft]);

  function openCreate() {
    editorKey.current += 1;
    setEditor({ mode: 'create', draft: emptyDraft(), key: editorKey.current });
    setEditorError(null);
    setNotice(null);
  }

  function openEdit(s: CustomStrategy) {
    editorKey.current += 1;
    setEditor({ mode: 'edit', id: s.id, draft: draftFromCustom(s), key: editorKey.current });
    setEditorError(null);
    setNotice(null);
  }

  /** Al cerrar el editor el foco vuelve al título del panel, no se pierde en <body>. */
  function closeEditor() {
    setEditor(null);
    setEditorError(null);
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  // ── Escritura ────────────────────────────────────────────────────────────
  async function save(draft: CustomDraft, activate: boolean) {
    if (!editor) return;
    setSaving(true);
    setEditorError(null);
    try {
      const isEdit = editor.mode === 'edit' && editor.id;
      const res = await fetch(
        isEdit ? `/api/strategies/custom/${encodeURIComponent(editor.id!)}?${qs}` : `/api/strategies/custom?${qs}`,
        {
          method: isEdit ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draftToPayload(draft), activate }),
        },
      );
      if (!res.ok) { setEditorError(await readError(res, t)); return; }
      const { strategy, selection } = (await res.json()) as { strategy: CustomStrategy; selection: OrgSelection | null };
      setStrategies((prev) => [strategy, ...prev.filter((s) => s.id !== strategy.id)]);
      onSelectedIdChange(strategy.id);
      if (selection) onSelectionSaved(selection);
      closeEditor();
      flash('ok', activate ? tc.activated : tc.saved);
    } catch {
      setEditorError({ message: t.genericError, details: [] });
    } finally {
      setSaving(false);
    }
  }

  async function activate(id: string) {
    setBusy({ id, action: 'activate' });
    setNotice(null);
    try {
      const res = await fetch('/api/strategies/org', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_strategy_id: id }),
      });
      if (!res.ok) { flash('error', (await readError(res, t)).message); return; }
      const { selection } = (await res.json()) as { selection: OrgSelection };
      onSelectionSaved(selection);
      flash('ok', tc.activated);
    } catch {
      flash('error', t.genericError);
    } finally {
      setBusy(null);
    }
  }

  async function askRemove(s: CustomStrategy) {
    const isActive = s.id === activeCustomId;
    const ok = await confirm({
      title: tc.confirmDelete(s.name),
      message: isActive ? `${tc.confirmDeleteActive} ${tc.confirmDeleteBody}` : tc.confirmDeleteBody,
      confirmLabel: tc.confirmYes,
      cancelLabel: tc.cancel,
      danger: true,
    });
    if (ok) await remove(s.id);
  }

  async function remove(id: string) {
    setBusy({ id, action: 'delete' });
    setNotice(null);
    try {
      const res = await fetch(`/api/strategies/custom/${encodeURIComponent(id)}?${qs}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 404) { flash('error', (await readError(res, t)).message); return; }
      const rest = strategies.filter((s) => s.id !== id);
      setStrategies(rest);
      onSelectedIdChange(rest[0]?.id ?? null);
      if (id === activeCustomId) onSelectionStale();
      flash('ok', tc.deleted);
    } catch {
      flash('error', t.genericError);
    } finally {
      setBusy(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const selected = strategies.find((s) => s.id === selectedId) ?? null;
  const missing = !loading && !loadError && !!selectedId && !selected;
  const dateFmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const newButton = canEdit && !editor && (
    <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={openCreate}>{tc.newBtn}</Button>
  );
  const assistantButton = (
    <Button variant="secondary" icon={<Icon name="sparkles" size={16} />} onClick={() => openAssistant(tc.assistantDraft)}>
      {tc.askAssistant}
    </Button>
  );
  // Sin estrategias, las acciones van en el estado vacío (no dos veces).
  const empty = !loading && !loadError && strategies.length === 0 && !editor;

  return (
    <div>
      {/* ── Cabecera ── */}
      <div className={styles.panelHead}>
        <div className={styles.panelIntro}>
          <h2 ref={titleRef} tabIndex={-1} className={`${styles.panelTitle} ${styles.anchor}`}>{tc.title}</h2>
          <p className={styles.panelDesc}>{tc.desc}</p>
        </div>
        {!empty && (
          <div className={styles.buttonRow}>
            {assistantButton}
            {newButton}
          </div>
        )}
      </div>

      {!canEdit && (
        <div className={styles.notice}>
          <Notice tone="info" live={false} icon={<Icon name="lock" size={16} />}>{t.forbidden}</Notice>
        </div>
      )}
      {notice && (
        <div className={styles.notice}>
          <Notice
            tone={notice.kind === 'error' ? 'danger' : 'success'}
            icon={<Icon name={notice.kind === 'error' ? 'alert' : 'check-circle'} size={16} />}
          >
            {notice.text}
          </Notice>
        </div>
      )}

      {editor && (
        <CustomStrategyEditor
          key={editor.key}
          lang={lang}
          mode={editor.mode}
          initial={editor.draft}
          objectives={objectives}
          saving={saving}
          serverError={editorError}
          onSave={(draft, act) => { void save(draft, act); }}
          onCancel={closeEditor}
        />
      )}

      {/* ── Lista ── */}
      {loading ? (
        <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 14 }}>
          <Spinner size={14} /> {tc.loading}
        </p>
      ) : loadError ? (
        <div className={styles.notice}>
          <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
            <p style={{ margin: '0 0 10px' }}>{tc.loadError}</p>
            <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={() => { void load(); }}>
              {common.actions.retry}
            </Button>
          </Notice>
        </div>
      ) : strategies.length === 0 ? (
        empty && (
          <div className="ui-card" style={{ padding: 0, borderStyle: 'dashed' }}>
            <EmptyState
              icon={<Icon name="target" size={32} />}
              title={tc.emptyTitle}
              hint={tc.emptyHint}
              action={<div className={styles.buttonRow} style={{ justifyContent: 'center' }}>{newButton}{assistantButton}</div>}
            />
          </div>
        )
      ) : (
        <ul
          aria-label={tc.listLabel}
          className={`auto-grid ${styles.list}`}
          style={{ '--min': '240px', '--gap': '12px' } as CSSProperties}
        >
          {strategies.map((s) => {
            const isSel = s.id === selectedId;
            const isActive = s.id === activeCustomId;
            const stats = calendarStats(s.calendar);
            const origin = s.created_via === 'chat' ? tc.byAssistant
              : s.created_via === 'api' || s.created_via === 'mcp' ? tc.byIntegration : null;
            return (
              <li key={s.id} style={{ minWidth: 0 }}>
                <button
                  type="button"
                  aria-pressed={isSel}
                  className={`${styles.strategyCard} ui-link-card`}
                  onClick={() => onSelectedIdChange(s.id)}
                >
                  <span className={styles.cardHead}>
                    <span className={styles.cardName}>{s.name}</span>
                    {isActive && <ActiveBadge label={t.activeBadge} />}
                  </span>
                  <span className={styles.cardMeta}>{tc.summary(stats.weeks, stats.pieces)}</span>
                  <span className={styles.cardMeta}>{tc.updated(dateFmt(s.updated_at))}</span>
                  {origin && (
                    <span className={styles.cardOrigin}>
                      {s.created_via === 'chat' && <Icon name="sparkles" size={12} />}
                      {origin}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {missing && (
        <div className={styles.notice}>
          <Notice tone="danger" icon={<Icon name="alert" size={16} />}>{tc.notFound}</Notice>
        </div>
      )}

      {/* ── Estrategia elegida ── */}
      {selected && (
        <SelectedStrategy
          key={selected.id}
          t={t}
          strategy={selected}
          isActive={selected.id === activeCustomId}
          canEdit={canEdit}
          busy={busy?.id === selected.id ? busy.action : null}
          objective={objectives.find((o) => o.id === selected.objective_id) ?? null}
          lang={lang}
          onActivate={() => { void activate(selected.id); }}
          onEdit={() => openEdit(selected)}
          onDelete={() => { void askRemove(selected); }}
          onGenerate={onGenerate}
        />
      )}

      {dialog}
    </div>
  );
}

// ─── Vista de lectura ────────────────────────────────────────────────────────

function SelectedStrategy({
  t, strategy, isActive, canEdit, busy, objective, lang, onActivate, onEdit, onDelete, onGenerate,
}: {
  t: Texts;
  strategy: CustomStrategy;
  isActive: boolean;
  canEdit: boolean;
  busy: 'activate' | 'delete' | null;
  objective: Objective | null;
  lang: 'es' | 'en';
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGenerate: (item: CustomCalendarItem) => void;
}) {
  const tc = t.custom;
  const calendarLabelId = `custom-calendar-${useId().replace(/:/g, '')}`;

  const rows: CalendarRow[] = strategy.calendar.map((item, i) => ({
    key: `${item.week}-${i}`,
    week: item.week,
    icon: formatIcon(item.format),
    format: tc.formats[item.format] ?? item.format,
    channel: channelName(item.channel, t),
    topic: item.topic,
    detail: item.angle,
    goal: item.goal,
    onGenerate: () => onGenerate(item),
  }));

  return (
    <section aria-label={strategy.name} data-testid="custom-strategy-detail">
      <StrategySection label={tc.approach} as="h3">
        <StrategyOverview
          t={t}
          name={strategy.name}
          active={isActive}
          meta={objective && (
            <>
              {tc.objective}:
              {objective.icon && <span aria-hidden="true">{objective.icon}</span>}
              <strong>{lang === 'en' ? objective.name_en : objective.name_es}</strong>
            </>
          )}
          description={strategy.description}
          kpiPrimary={strategy.kpi_primary}
          kpiSecondary={strategy.kpi_secondary}
        >
          {canEdit && (
            <>
              {!isActive && (
                <Button variant="primary" icon={<Icon name="check" size={16} />} loading={busy === 'activate'} disabled={busy !== null} onClick={onActivate}>
                  {busy === 'activate' ? tc.activating : tc.activate}
                </Button>
              )}
              <Button variant="secondary" icon={<Icon name="edit" size={16} />} disabled={busy !== null} onClick={onEdit}>{tc.edit}</Button>
              <Button variant="danger-ghost" icon={<Icon name="trash" size={16} />} loading={busy === 'delete'} disabled={busy !== null} onClick={onDelete}>
                {busy === 'delete' ? tc.deleting : tc.delete}
              </Button>
            </>
          )}
        </StrategyOverview>
      </StrategySection>

      {rows.length > 0 && (
        <StrategySection label={tc.calendar} as="h3" headingId={calendarLabelId}>
          <StrategyCalendar t={t} rows={rows} labelledBy={calendarLabelId} />
        </StrategySection>
      )}

      {strategy.cta_mechanic && <ConversionMechanic t={t} text={strategy.cta_mechanic} />}
    </section>
  );
}
