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

import { useCallback, useEffect, useRef, useState } from 'react';
import esT from '@/locales/es/dashboard/strategy';
import enT from '@/locales/en/dashboard/strategy';
import { CHANNEL_LABELS } from '@/lib/channels';
import { openAssistant } from '@/lib/assistant/open';
import type { Channel } from '@/types/channels';
import type { CustomCalendarItem, CustomStrategy, Objective, OrgSelection } from '@/types/strategy';
import CustomStrategyEditor, { type EditorServerError } from './CustomStrategyEditor';
import {
  CUSTOM_STRATEGY_LIMITS,
  calendarStats,
  draftFromCustom,
  draftToPayload,
  emptyDraft,
  type CustomDraft,
} from './custom-strategy-model';

const T = { es: esT, en: enT } as const;
type Texts = typeof esT;

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

// ─── Estilos ─────────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--muted)', marginBottom: 16,
};

const smallLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
  color: 'var(--muted)', marginBottom: 4,
};

const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 10,
  padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  ...secondaryBtn, color: '#ff6b6b', borderColor: 'rgba(255,107,107,0.5)',
};

const noticeBox = (kind: 'error' | 'ok' | 'info'): React.CSSProperties => ({
  background: kind === 'error' ? 'rgba(255,107,107,0.08)' : 'rgba(198,255,75,0.07)',
  border: `1px solid ${kind === 'error' ? 'rgba(255,107,107,0.35)' : 'rgba(198,255,75,0.25)'}`,
  borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 20,
});

export const activeBadgeStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800,
  letterSpacing: '0.08em', textTransform: 'uppercase', color: '#000', background: 'var(--accent)',
  borderRadius: 100, padding: '3px 8px', lineHeight: 1.2, whiteSpace: 'nowrap',
};

const FORMAT_ICONS: Record<string, string> = { carousel: '▦', reel: '▶', post: '✦', story: '⬜' };

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

  const [strategies, setStrategies] = useState<CustomStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<EditorServerError | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: 'activate' | 'delete' } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const editorKey = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setEditor(null);
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
      setConfirmDeleteId(null);
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
  const objectiveName = (id: string | null) => {
    const o = objectives.find((x) => x.id === id);
    return o ? `${o.icon} ${lang === 'en' ? o.name_en : o.name_es}` : null;
  };
  const channelLabel = (c: string) => (c === 'general' ? tc.channelGeneral : CHANNEL_LABELS[c as Channel] ?? c);

  return (
    <div>
      {/* ── Cabecera ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ flex: '1 1 280px' }}>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>
            {tc.title}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6, maxWidth: 560 }}>{tc.desc}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={secondaryBtn} onClick={() => openAssistant(tc.assistantDraft)}>
            {tc.askAssistant}
          </button>
          {canEdit && !editor && (
            <button type="button" style={primaryBtn} onClick={openCreate}>{tc.newBtn}</button>
          )}
        </div>
      </div>

      {!canEdit && <div role="status" style={noticeBox('info')}>{t.forbidden}</div>}
      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'} style={noticeBox(notice.kind)}>{notice.text}</div>
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
          onCancel={() => { setEditor(null); setEditorError(null); }}
        />
      )}

      {/* ── Lista ── */}
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{tc.loading}</p>
      ) : loadError ? (
        <div role="alert" style={noticeBox('error')}>{tc.loadError}</div>
      ) : strategies.length === 0 ? (
        !editor && (
          <div style={{
            background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12,
            padding: '28px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, lineHeight: 1.6,
          }}>
            {tc.empty}
          </div>
        )
      ) : (
        <ul
          aria-label={tc.listLabel}
          style={{
            listStyle: 'none', padding: 0, margin: '0 0 32px',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 12,
          }}
        >
          {strategies.map((s) => {
            const isSel = s.id === selectedId;
            const isActive = s.id === activeCustomId;
            const stats = calendarStats(s.calendar);
            const origin = s.created_via === 'chat' ? tc.byAssistant
              : s.created_via === 'api' || s.created_via === 'mcp' ? tc.byIntegration : null;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => { onSelectedIdChange(s.id); setConfirmDeleteId(null); }}
                  style={{
                    width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit',
                    background: isSel ? 'rgba(198,255,75,0.08)' : 'var(--surface)',
                    border: `1.5px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 12, padding: '16px 18px', cursor: 'pointer', height: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {s.name}
                    </span>
                    {isActive && <span style={activeBadgeStyle}>{t.activeBadge}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                    {tc.summary(stats.weeks, stats.pieces)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{tc.updated(dateFmt(s.updated_at))}</div>
                  {origin && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>{origin}</div>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {missing && <div role="alert" style={noticeBox('error')}>{tc.notFound}</div>}

      {/* ── Estrategia elegida ── */}
      {selected && (
        <SelectedStrategy
          key={selected.id}
          t={t}
          strategy={selected}
          isActive={selected.id === activeCustomId}
          canEdit={canEdit}
          busy={busy?.id === selected.id ? busy.action : null}
          confirmingDelete={confirmDeleteId === selected.id}
          objectiveName={objectiveName(selected.objective_id)}
          channelLabel={channelLabel}
          onActivate={() => { void activate(selected.id); }}
          onEdit={() => openEdit(selected)}
          onAskDelete={() => setConfirmDeleteId(selected.id)}
          onCancelDelete={() => setConfirmDeleteId(null)}
          onConfirmDelete={() => { void remove(selected.id); }}
          onGenerate={onGenerate}
        />
      )}
    </div>
  );
}

// ─── Vista de lectura ────────────────────────────────────────────────────────

function SelectedStrategy({
  t, strategy, isActive, canEdit, busy, confirmingDelete, objectiveName, channelLabel,
  onActivate, onEdit, onAskDelete, onCancelDelete, onConfirmDelete, onGenerate,
}: {
  t: Texts;
  strategy: CustomStrategy;
  isActive: boolean;
  canEdit: boolean;
  busy: 'activate' | 'delete' | null;
  confirmingDelete: boolean;
  objectiveName: string | null;
  channelLabel: (c: string) => string;
  onActivate: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onGenerate: (item: CustomCalendarItem) => void;
}) {
  const tc = t.custom;
  const weeks = strategy.calendar.reduce<Record<number, CustomCalendarItem[]>>((acc, item) => {
    (acc[item.week] ??= []).push(item);
    return acc;
  }, {});

  return (
    <section aria-label={strategy.name} data-testid="custom-strategy-detail">
      {/* ── Enfoque y KPIs ── */}
      <div style={{ marginBottom: 32 }}>
        <p style={sectionLabel}>{tc.approach}</p>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 'clamp(16px, 4vw, 28px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <h3 style={{ fontFamily: 'var(--font-syne)', fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, wordBreak: 'break-word' }}>
              {strategy.name}
            </h3>
            {isActive && <span style={activeBadgeStyle}>{t.activeBadge}</span>}
          </div>
          {objectiveName && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              {tc.objective}: <span style={{ color: 'var(--text)' }}>{objectiveName}</span>
            </div>
          )}
          {strategy.description && (
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 20px', whiteSpace: 'pre-line' }}>
              {strategy.description}
            </p>
          )}
          {(strategy.kpi_primary || strategy.kpi_secondary) && (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
              {strategy.kpi_primary && (
                <div>
                  <div style={smallLabel}>{t.kpiPrimary}</div>
                  <div style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }}>{strategy.kpi_primary}</div>
                </div>
              )}
              {strategy.kpi_secondary && (
                <div>
                  <div style={smallLabel}>{t.kpiSecondary}</div>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>{strategy.kpi_secondary}</div>
                </div>
              )}
            </div>
          )}

          {/* ── Acciones ── */}
          {canEdit && (
            confirmingDelete ? (
              <div role="alertdialog" aria-label={tc.delete} style={{ ...noticeBox('error'), marginBottom: 0 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{tc.confirmDelete(strategy.name)}</p>
                {isActive && <p style={{ margin: '0 0 10px', color: 'var(--muted)' }}>{tc.confirmDeleteActive}</p>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  <button type="button" style={{ ...dangerBtn, background: '#ff6b6b', color: '#000', border: 'none' }} disabled={busy === 'delete'} onClick={onConfirmDelete}>
                    {busy === 'delete' ? tc.deleting : tc.confirmYes}
                  </button>
                  <button type="button" style={secondaryBtn} disabled={busy === 'delete'} onClick={onCancelDelete}>{tc.cancel}</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {!isActive && (
                  <button type="button" style={primaryBtn} disabled={busy === 'activate'} onClick={onActivate}>
                    {busy === 'activate' ? tc.activating : tc.activate}
                  </button>
                )}
                <button type="button" style={secondaryBtn} onClick={onEdit}>{tc.edit}</button>
                <button type="button" style={dangerBtn} onClick={onAskDelete}>{tc.delete}</button>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Calendario ── */}
      {strategy.calendar.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <p style={sectionLabel}>{tc.calendar}</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                  {t.tableHeaders.map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      style={{
                        padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--muted)',
                        fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
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
                  .map(([week, items]) => items.map((item, idx) => (
                    <tr key={`${week}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      {idx === 0 && (
                        <td
                          rowSpan={items.length}
                          style={{ padding: 12, fontWeight: 700, color: 'var(--accent)', fontSize: 13, verticalAlign: 'top', whiteSpace: 'nowrap' }}
                        >
                          {tc.weekPrefix}{week}
                        </td>
                      )}
                      <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 16, marginRight: 6 }} aria-hidden>{FORMAT_ICONS[item.format] ?? '◉'}</span>
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{tc.formats[item.format] ?? item.format}</span>
                      </td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {channelLabel(item.channel)}
                      </td>
                      <td style={{ padding: 12, color: 'var(--text)', lineHeight: 1.5, maxWidth: 300 }}>
                        {item.topic}
                        {item.angle && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{item.angle}</div>
                        )}
                      </td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12 }}>{item.goal}</td>
                      <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => onGenerate(item)}
                          style={{
                            background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                            padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          {t.generateBtn}
                        </button>
                      </td>
                    </tr>
                  )))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Mecánica de conversión ── */}
      {strategy.cta_mechanic && (
        <div style={{
          background: 'rgba(198,255,75,0.06)', border: '1px solid rgba(198,255,75,0.25)',
          borderRadius: 12, padding: '20px 24px', marginBottom: 40,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
            {t.conversionMechanic}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
            {strategy.cta_mechanic}
          </p>
        </div>
      )}
    </section>
  );
}
