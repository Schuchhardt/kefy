'use client';

import {
  useCallback, useEffect, useId, useRef, useState, useSyncExternalStore,
  type CSSProperties, type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { useBrand } from '@/lib/brand-context';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import Modal from '@/components/ui/Modal';
import Button, { ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import EmptyState from '@/components/ui/EmptyState';
import Notice from '@/components/ui/Notice';
import ArrayChips from '@/components/ui/ArrayChips';
import ChannelIcon from '@/components/ui/ChannelIcon';
import Icon from '@/components/ui/icons';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { TONE_COLORS, type Tone } from '@/lib/status';
import { toLocale } from '@/lib/i18n';
import esT from '@/locales/es/dashboard/leads';
import enT from '@/locales/en/dashboard/leads';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';
import type { LeadsCopy } from '@/locales/es/dashboard/leads';
import type { DashboardCommonCopy } from '@/locales/es/dashboard/common';
import type { LeadStage, Lead } from '@/types/leads';
import styles from './page.module.css';

const T  = { es: esT, en: enT } as const;
const TC = { es: esCommon, en: enCommon } as const;

const STAGES: LeadStage[] = ['frio', 'tibio', 'caliente', 'contactado', 'convertido'];
const NEXT_STAGE: Record<LeadStage, LeadStage | null> = {
  frio: 'tibio', tibio: 'caliente', caliente: 'contactado',
  contactado: 'convertido', convertido: null,
};

/** Temperatura del lead → tono semántico. Antes eran emojis (❄️ 🌡️ 🔥 📞 ✅)
 *  y hex sueltos; ahora los mismos tokens que los estados de contenido. */
const STAGE_TONE: Record<LeadStage, Tone> = {
  frio: 'info', tibio: 'warning', caliente: 'danger', contactado: 'accent', convertido: 'success',
};

/** Canales del alta manual (los mismos valores que antes). */
const CHANNEL_OPTIONS = [
  'instagram', 'facebook', 'twitter', 'x', 'tiktok', 'youtube', 'linkedin',
  'google_business', 'yelp', 'tripadvisor',
];
const CHANNEL_LABELS: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', twitter: 'Twitter', x: 'X',
  tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn',
  google_business: 'Google Business', yelp: 'Yelp', tripadvisor: 'Tripadvisor',
};
/** Nombre en ChannelIcon cuando no coincide con el valor guardado. */
const CHANNEL_ICON: Record<string, string> = { x: 'twitter', google_business: 'googlebusiness' };

const MOBILE_QUERY = '(max-width: 767px)';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

function scoreTone(score: number): Tone {
  if (score >= 50) return 'danger';
  if (score >= 20) return 'warning';
  return 'info';
}

/** Variables de `.ui-badge` (y de `.dot`) para un tono. */
function toneVars(tone: Tone): CSSProperties {
  const c = TONE_COLORS[tone];
  return { '--badge-color': c.color, '--badge-bg': c.background } as CSSProperties;
}

function timeAgo(date: string | null, t: LeadsCopy): string {
  if (!date) return '—';
  const m = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (m < 1) return t.timeJustNow;
  const h = Math.floor(m / 60);
  return t.timeAgo(m, h, Math.floor(h / 24));
}

function subscribeViewport(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener?.('change', callback);
  return () => mql.removeEventListener?.('change', callback);
}

function isMobileViewport(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches;
}

/** Móvil (<768px): el detalle se abre como hoja inferior. En el servidor, no. */
function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeViewport, isMobileViewport, () => false);
}

// ─── Piezas pequeñas ──────────────────────────────────────────────────────────

function LeadAvatar({ lead, size }: { lead: Lead; size: number }) {
  return (
    <span
      aria-hidden="true"
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {lead.avatar_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={lead.avatar_url} alt="" />
        : (lead.username[0]?.toUpperCase() ?? '?')}
    </span>
  );
}

function ChannelTag({ channel }: { channel: string }) {
  return (
    <span className={styles.channel}>
      <span aria-hidden="true" style={{ display: 'inline-flex' }}>
        <ChannelIcon name={CHANNEL_ICON[channel] ?? channel} size={12} />
      </span>
      {channelLabel(channel)}
    </span>
  );
}

function StageBadge({ stage, t }: { stage: LeadStage; t: LeadsCopy }) {
  return (
    <span className="ui-badge" style={toneVars(STAGE_TONE[stage])}>
      <span className={styles.dot} aria-hidden="true" />
      {t.stages[stage]}
    </span>
  );
}

function ScoreBadge({ score, t }: { score: number; t: LeadsCopy }) {
  return (
    <span className="ui-badge" style={toneVars(scoreTone(score))}>
      <span className="sr-only">{`${t.score}: `}</span>
      {score}
    </span>
  );
}

// ─── Modal: alta manual ───────────────────────────────────────────────────────

function AddLeadModal({
  t, onAdd, onClose,
}: {
  t: LeadsCopy;
  onAdd: (lead: Lead) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const [username, setUsername] = useState('');
  const [channel, setChannel]   = useState('instagram');
  const [stage, setStage]       = useState<LeadStage>('frio');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || loading) return;
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/automations/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), channel, stage }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || t.errorCreate);
      }
      const { lead } = await res.json() as { lead: Lead };
      onAdd(lead);
    } catch (e: unknown) {
      setErr(e instanceof Error && e.message ? e.message : t.errorCreate);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.addManualTitle}
      maxWidth={420}
      padded
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t.addManualCancel}</Button>
          <Button type="submit" form={formId} variant="primary" loading={loading} disabled={!username.trim()}>
            {t.addManualSave}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className={styles.form} noValidate>
        <Field label={t.addManualUsername} required>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <Field label={t.addManualChannel}>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
          </Select>
        </Field>
        <Field label={t.addManualStage}>
          <Select value={stage} onChange={(e) => setStage(e.target.value as LeadStage)}>
            {STAGES.map((s) => <option key={s} value={s}>{t.stages[s]}</option>)}
          </Select>
        </Field>
        {err && <Notice tone="danger">{err}</Notice>}
      </form>
    </Modal>
  );
}

// ─── Tarjeta del tablero ──────────────────────────────────────────────────────

function LeadCard({
  lead, t, onSelect, onMoveNext,
}: {
  lead: Lead;
  t: LeadsCopy;
  onSelect: (lead: Lead, opener: HTMLElement) => void;
  onMoveNext: (lead: Lead) => void;
}) {
  const nextStage = NEXT_STAGE[lead.stage];
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <LeadAvatar lead={lead} size={32} />
        <div className={styles.cardName}>
          <button
            type="button"
            className={styles.cardOpen}
            aria-haspopup="dialog"
            onClick={(e) => onSelect(lead, e.currentTarget)}
          >
            {lead.display_name || lead.username}
          </button>
          <div className={styles.handle}>@{lead.username}</div>
        </div>
        <ScoreBadge score={lead.score} t={t} />
      </div>
      <div className={styles.cardFoot}>
        <span className={styles.meta}>
          <ChannelTag channel={lead.channel} />
          <span aria-hidden="true">·</span>
          <span>{timeAgo(lead.last_interaction_at, t)}</span>
        </span>
        {nextStage && (
          <Button
            size="sm"
            variant="secondary"
            className={styles.cardAction}
            icon={<Icon name="arrow-right" size={12} />}
            aria-label={t.moveTo(t.stages[nextStage])}
            onClick={() => onMoveNext(lead)}
          >
            {t.stages[nextStage]}
          </Button>
        )}
      </div>
    </article>
  );
}

// ─── Detalle del lead (panel lateral o hoja inferior) ────────────────────────

function LeadDetail({
  lead, t, common, lang, onUpdate, onDelete, confirm,
}: {
  lead: Lead;
  t: LeadsCopy;
  common: DashboardCommonCopy;
  lang: string;
  onUpdate: (id: string, updates: Partial<Lead>) => void;
  onDelete: (id: string) => void;
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const uid = useId();
  const moveLabelId = `${uid}-move`;
  const tagsId = `${uid}-tags`;
  const [notes, setNotes]         = useState(lead.notes ?? '');
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [tags, setTags]           = useState<string[]>(lead.tags ?? []);
  const [error, setError]         = useState<string | null>(null);
  const [deleting, setDeleting]   = useState(false);

  async function patchLead(updates: Record<string, unknown>): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(`/api/automations/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) { setError(t.errorUpdate); return false; }
      const { lead: updated } = await res.json() as { lead: Lead };
      onUpdate(lead.id, updated);
      return true;
    } catch {
      setError(t.errorUpdate);
      return false;
    }
  }

  async function saveNotes() {
    setNoteState('saving');
    const ok = await patchLead({ notes });
    setNoteState(ok ? 'saved' : 'idle');
    if (ok) setTimeout(() => setNoteState((s) => (s === 'saved' ? 'idle' : s)), 2000);
  }

  async function changeTags(next: string[]) {
    const previous = tags;
    setTags(next);
    if (!(await patchLead({ tags: next }))) setTags(previous);
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t.confirmDelete,
      message: common.confirm.irreversible,
      confirmLabel: common.actions.delete,
      cancelLabel: common.actions.cancel,
      danger: true,
    });
    if (!ok) return;
    setDeleting(true); setError(null);
    try {
      const res = await fetch(`/api/automations/leads/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) { setError(t.errorDelete); return; }
      onDelete(lead.id);
    } catch {
      setError(t.errorDelete);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.detail}>
      {error && <Notice tone="danger">{error}</Notice>}

      <dl className={styles.tiles}>
        <div className={styles.tile}>
          <dt className={styles.tileLabel}>{t.stageLabel}</dt>
          <dd className={styles.tileValue}>
            <span className={styles.dot} style={toneVars(STAGE_TONE[lead.stage])} aria-hidden="true" />
            {t.stages[lead.stage]}
          </dd>
        </div>
        <div className={styles.tile}>
          <dt className={styles.tileLabel}>{t.score}</dt>
          <dd className={styles.tileValue} style={{ color: TONE_COLORS[scoreTone(lead.score)].color }}>{lead.score}</dd>
        </div>
      </dl>

      <div role="group" aria-labelledby={moveLabelId} className={styles.group}>
        <span id={moveLabelId} className={styles.groupLabel}>{t.moveToLabel}</span>
        <div className={styles.buttonRow}>
          {STAGES.filter((s) => s !== lead.stage).map((s) => (
            <Button key={s} size="sm" variant="secondary" onClick={() => void patchLead({ stage: s })}>
              <span className={styles.dot} style={toneVars(STAGE_TONE[s])} aria-hidden="true" />
              {t.stages[s]}
            </Button>
          ))}
        </div>
      </div>

      {(!lead.contacted || !lead.converted) && (
        <div className={styles.buttonRow}>
          {!lead.contacted && (
            <Button
              variant="secondary"
              icon={<Icon name="send" size={14} />}
              style={{ color: 'var(--accent-text)', borderColor: 'var(--accent-border)' }}
              onClick={() => void patchLead({ contacted: true })}
            >
              {t.markContacted}
            </Button>
          )}
          {!lead.converted && (
            <Button
              variant="secondary"
              icon={<Icon name="check-circle" size={14} />}
              style={{ color: 'var(--success)', borderColor: 'var(--success-border)' }}
              onClick={() => void patchLead({ converted: true, stage: 'convertido' })}
            >
              {t.markConverted}
            </Button>
          )}
        </div>
      )}

      <div className={styles.group}>
        <label htmlFor={tagsId} className={styles.groupLabel}>{t.tagsLabel}</label>
        <ArrayChips
          id={tagsId}
          value={tags}
          onChange={(next) => void changeTags(next)}
          lang={lang}
          placeholder={t.tagsPlaceholder}
          max={50}
        />
      </div>

      <div>
        <Field label={t.notesLabel}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.notesPlaceholder}
            rows={4}
          />
        </Field>
        <div className={styles.notesFoot}>
          <span role="status" className={styles.saved}>
            {noteState === 'saved' && <><Icon name="check" size={14} />{t.notesSaved}</>}
          </span>
          <Button size="sm" variant="secondary" loading={noteState === 'saving'} onClick={() => void saveNotes()}>
            {noteState === 'saving' ? t.savingNotes : t.saveNotes}
          </Button>
        </div>
      </div>

      <dl className={styles.metaList}>
        {lead.first_interaction_at && (
          <>
            <dt>{t.metaFirst}</dt>
            <dd>{new Date(lead.first_interaction_at).toLocaleDateString(lang)}</dd>
          </>
        )}
        {lead.last_interaction_at && (
          <>
            <dt>{t.metaLast}</dt>
            <dd>{timeAgo(lead.last_interaction_at, t)}</dd>
          </>
        )}
        <dt>{t.metaCreated}</dt>
        <dd>{new Date(lead.created_at).toLocaleDateString(lang)}</dd>
      </dl>

      <Button
        variant="danger-ghost"
        block
        icon={<Icon name="trash" size={14} />}
        loading={deleting}
        onClick={() => void handleDelete()}
      >
        {t.deleteBtn}
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const params = useParams<{ lang: string }>();
  const lang = params?.lang || 'es';
  const locale = toLocale(lang);
  const t = T[locale];
  const tc = TC[locale];
  const { activeBrand } = useBrand();
  const isMobile = useIsMobile();
  const { confirm, dialog } = useConfirm();
  const uid = useId();
  const drawerTitleId = `${uid}-drawer-title`;

  const [leads, setLeads]             = useState<Lead[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [actionError, setActionError] = useState('');
  const [view, setView]               = useState<'kanban' | 'list'>('kanban');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch]           = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterStage, setFilterStage] = useState('');

  /** Elemento que abrió el detalle: recibe el foco al cerrarlo. */
  const openerRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ limit: '200' });
      if (filterStage)   qs.set('stage', filterStage);
      if (filterChannel) qs.set('channel', filterChannel);
      if (search)        qs.set('search', search);
      const res = await fetch(`/api/automations/leads?${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || t.errorLoad);
      }
      const { leads: data } = await res.json() as { leads: Lead[] };
      setLeads(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [filterStage, filterChannel, search, t.errorLoad]);

  useEffect(() => { void loadLeads(); }, [loadLeads]);

  const closeLead = useCallback(() => {
    setSelectedLead(null);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && document.contains(opener)) {
      requestAnimationFrame(() => opener.focus({ preventScroll: true }));
    }
  }, []);

  // Cambiar de marca activa no disparaba por sí solo un refetch (mismo bug
  // que en /content): los leads son de la marca anterior hasta que algo más
  // refresque. Cierra el detalle abierto por la misma razón.
  useEffect(() => {
    if (!activeBrand?.id) return;
    void loadLeads();
    setSelectedLead(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  // Escritorio: el panel lateral no es modal (se puede seguir usando el
  // tablero), pero recibe el foco al abrirse y Escape lo cierra si el foco
  // está dentro. Un diálogo encima (confirmación) se cierra antes.
  const selectedId = selectedLead?.id ?? null;
  useEffect(() => {
    if (!selectedId || isMobile) return;
    drawerRef.current?.focus({ preventScroll: true });
  }, [selectedId, isMobile]);

  useEffect(() => {
    if (!selectedId || isMobile) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.isComposing) return;
      if (!drawerRef.current?.contains(document.activeElement)) return;
      closeLead();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, isMobile, closeLead]);

  function openLead(lead: Lead, opener?: HTMLElement) {
    openerRef.current = opener ?? null;
    setSelectedLead(lead);
  }

  function updateLead(id: string, updates: Partial<Lead>) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
    setSelectedLead((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
  }

  async function moveLead(lead: Lead, newStage: LeadStage) {
    setActionError('');
    try {
      const res = await fetch(`/api/automations/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
      if (res.ok) updateLead(lead.id, { stage: newStage });
      else setActionError(t.errorUpdate);
    } catch {
      setActionError(t.errorUpdate);
    }
  }

  function moveToNext(lead: Lead) {
    const next = NEXT_STAGE[lead.stage];
    if (next) void moveLead(lead, next);
  }

  function removeLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    closeLead();
  }

  function clearFilters() {
    setSearch(''); setFilterStage(''); setFilterChannel('');
  }

  // Stats
  const hotCount       = leads.filter((l) => l.stage === 'caliente').length;
  const convertedCount = leads.filter((l) => l.converted).length;
  const avgScore       = leads.length ? Math.round(leads.reduce((a, l) => a + l.score, 0) / leads.length) : 0;
  const stats = [
    { label: t.totalLeads, value: leads.length },
    { label: t.hotLeads,   value: hotCount },
    { label: t.converted,  value: convertedCount },
    { label: t.avgScore,   value: avgScore },
  ];

  // Canales presentes (y el filtrado, aunque ya no quede ninguno: si no, el
  // selector desaparecía y no había forma de quitar el filtro).
  const channels = Array.from(new Set([
    ...leads.map((l) => l.channel),
    ...(filterChannel ? [filterChannel] : []),
  ])).sort();
  const filtersActive = Boolean(search || filterStage || filterChannel);

  const selectedName = selectedLead ? (selectedLead.display_name || selectedLead.username) : '';
  const detail = selectedLead && (
    <LeadDetail
      key={selectedLead.id}
      lead={selectedLead}
      t={t}
      common={tc}
      lang={lang}
      onUpdate={updateLead}
      onDelete={removeLead}
      confirm={confirm}
    />
  );

  return (
    <div className="page page--wide">

      {/* Header */}
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <h1 className={styles.title}>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="page-header-actions">
          <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowAddModal(true)}>
            {t.addManualLead}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <dl className={`auto-grid ${styles.stats}`} style={{ '--min': '140px', '--gap': '12px' } as CSSProperties}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <dt className={styles.statLabel}>{stat.label}</dt>
            <dd className={styles.statValue}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      {/* Controls */}
      <div className={styles.controls}>
        <Field label={t.searchLabel} hideLabel className={styles.search}>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
          />
        </Field>
        <Field label={t.filterStageLabel} hideLabel className={styles.filter}>
          <Select value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
            <option value="">{t.allStages}</option>
            {STAGES.map((s) => <option key={s} value={s}>{t.stages[s]}</option>)}
          </Select>
        </Field>
        {channels.length > 0 && (
          <Field label={t.filterChannelLabel} hideLabel className={styles.filter}>
            <Select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
              <option value="">{t.allChannels}</option>
              {channels.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
            </Select>
          </Field>
        )}
        <div role="group" aria-label={t.viewLabel} className={`ui-segmented ${styles.viewToggle}`}>
          {(['kanban', 'list'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'kanban' ? t.viewKanban : t.viewList}
            </button>
          ))}
        </div>
      </div>

      {/* Errors */}
      {error && <div style={{ marginBottom: 16 }}><Notice tone="danger">{error}</Notice></div>}
      {actionError && <div style={{ marginBottom: 16 }}><Notice tone="danger">{actionError}</Notice></div>}

      {/* Loading */}
      {loading && (
        <>
          <p role="status" className="sr-only">{tc.actions.loading}</p>
          <div className={styles.board} aria-hidden="true">
            {[...Array(4)].map((_, col) => (
              <div key={col} className={styles.column}>
                <SkeletonBlock width="60%" height={13} style={{ marginBottom: 12 }} />
                <div className={styles.columnBody}>
                  {[...Array(2)].map((_, row) => (
                    <div key={row} className={styles.card}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <SkeletonBlock width={32} height={32} borderRadius={16} style={{ flexShrink: 0 }} />
                        <SkeletonBlock width="60%" height={11} />
                      </div>
                      <SkeletonBlock width="80%" height={9} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty */}
      {!loading && !error && leads.length === 0 && (
        <div className="ui-card">
          {filtersActive ? (
            <EmptyState
              icon={<Icon name="search" size={32} strokeWidth={1.5} />}
              title={t.noResults}
              hint={t.noResultsHint}
              action={<Button variant="secondary" onClick={clearFilters}>{t.clearFilters}</Button>}
            />
          ) : (
            <EmptyState
              icon={<Icon name="users" size={32} strokeWidth={1.5} />}
              title={t.noLeads}
              hint={t.noLeadsHint}
              action={
                <ButtonLink href={`/${lang}/dashboard/automations/engagement`} variant="primary">
                  {t.noLeadsAction}
                </ButtonLink>
              }
            />
          )}
        </div>
      )}

      {/* KANBAN VIEW */}
      {!loading && leads.length > 0 && view === 'kanban' && (
        <div className={styles.board}>
          {STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage);
            const titleId = `${uid}-col-${stage}`;
            return (
              <section key={stage} className={styles.column} aria-labelledby={titleId}>
                <div className={styles.columnHead}>
                  <h2 id={titleId} className={styles.columnTitle}>
                    <span className={styles.dot} style={toneVars(STAGE_TONE[stage])} aria-hidden="true" />
                    {t.stages[stage]}
                  </h2>
                  <span className={styles.count}>
                    <span aria-hidden="true">{stageLeads.length}</span>
                    <span className="sr-only">{t.leadsInStage(stageLeads.length)}</span>
                  </span>
                </div>
                <div className={styles.columnBody}>
                  {stageLeads.length === 0 ? (
                    <p className={styles.columnEmpty}>{t.noLeadsStage}</p>
                  ) : stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      t={t}
                      onSelect={openLead}
                      onMoveNext={moveToNext}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {!loading && leads.length > 0 && view === 'list' && (
        // Seis columnas no caben en un móvil: la tabla hace scroll horizontal
        // (con sombra de «hay más») en vez de recortarse.
        <div className={`scroll-x ${styles.tableWrap}`} role="region" aria-label={t.viewList} tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t.colUser}</th>
                <th scope="col">{t.colChannel}</th>
                <th scope="col">{t.colStage}</th>
                <th scope="col">{t.score}</th>
                <th scope="col">{t.colLastInteraction}</th>
                <th scope="col"><span className="sr-only">{t.colActions}</span></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const next = NEXT_STAGE[lead.stage];
                return (
                  <tr
                    key={lead.id}
                    className={styles.row}
                    // Clic en cualquier parte de la fila; con teclado, el botón del nombre.
                    onClick={(e) => openLead(lead, e.currentTarget.querySelector('button') ?? undefined)}
                  >
                    <td>
                      <button
                        type="button"
                        className={styles.rowOpen}
                        aria-haspopup="dialog"
                        onClick={(e) => { e.stopPropagation(); openLead(lead, e.currentTarget); }}
                      >
                        {lead.display_name || lead.username}
                      </button>
                      <div className={styles.handle}>@{lead.username}</div>
                    </td>
                    <td><ChannelTag channel={lead.channel} /></td>
                    <td><StageBadge stage={lead.stage} t={t} /></td>
                    <td><ScoreBadge score={lead.score} t={t} /></td>
                    <td className={styles.muted}>{timeAgo(lead.last_interaction_at, t)}</td>
                    <td>
                      {next && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Icon name="arrow-right" size={12} />}
                          aria-label={t.moveTo(t.stages[next])}
                          onClick={(e) => { e.stopPropagation(); void moveLead(lead, next); }}
                        >
                          {t.stages[next]}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle: hoja inferior en móvil, panel lateral en escritorio */}
      {selectedLead && (isMobile ? (
        <Modal
          open
          onClose={closeLead}
          closeLabel={tc.actions.close}
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <LeadAvatar lead={selectedLead} size={32} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedName}</span>
            </span>
          }
          subtitle={
            <span className={styles.meta}>
              <ChannelTag channel={selectedLead.channel} />
              <span>@{selectedLead.username}</span>
            </span>
          }
        >
          <div className={styles.sheetBody}>{detail}</div>
        </Modal>
      ) : createPortal(
        // En <body>: dentro de .dashboard-main (z-index 1) ninguna capa del
        // panel quedaba por encima del avatar fijo, que tapaba el botón cerrar.
        <div
          ref={drawerRef}
          role="dialog"
          aria-labelledby={drawerTitleId}
          tabIndex={-1}
          className={styles.drawer}
        >
          <div className={styles.drawerHead}>
            <LeadAvatar lead={selectedLead} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 id={drawerTitleId} className={styles.drawerTitle}>{selectedName}</h2>
              <div className={styles.meta}>
                <ChannelTag channel={selectedLead.channel} />
                <span>@{selectedLead.username}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              iconOnly
              aria-label={tc.actions.close}
              icon={<Icon name="close" size={18} />}
              onClick={closeLead}
            />
          </div>
          <div className={styles.drawerBody}>{detail}</div>
        </div>,
        document.body,
      ))}

      {/* Add Lead Modal */}
      {showAddModal && (
        <AddLeadModal
          t={t}
          onAdd={(lead) => { setLeads((prev) => [lead, ...prev]); setShowAddModal(false); }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {dialog}
    </div>
  );
}
