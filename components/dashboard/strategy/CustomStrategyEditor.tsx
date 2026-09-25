'use client';

// ─── Editor de una estrategia propia ─────────────────────────────────────────
//
// Crear o editar: nombre, objetivo (opcional), enfoque, KPIs, mecánica de
// conversión y un calendario de piezas (semana, formato, canal, tema, ángulo,
// objetivo). Valida lo mínimo en el cliente (nombre, al menos una pieza, tema
// en cada pieza); el resto lo valida el servidor y sus errores llegan en
// `serverError`. En pantallas estrechas cada pieza se apila en una columna.

import { useId, useState } from 'react';
import esT from '@/locales/es/dashboard/strategy';
import enT from '@/locales/en/dashboard/strategy';
import { CHANNEL_LABELS } from '@/lib/channels';
import type { Channel } from '@/types/channels';
import type { CustomStrategyFormat, Objective } from '@/types/strategy';
import {
  CUSTOM_CHANNELS,
  CUSTOM_FORMATS,
  CUSTOM_STRATEGY_LIMITS,
  CUSTOM_TEXT_LIMITS,
  emptyRow,
  validateDraft,
  type CustomDraft,
  type CustomDraftRow,
} from './custom-strategy-model';

const T = { es: esT, en: enT } as const;

export interface EditorServerError {
  message: string;
  details: string[];
}

interface Props {
  lang: 'es' | 'en';
  mode: 'create' | 'edit';
  initial: CustomDraft;
  objectives: Objective[];
  saving: boolean;
  serverError: EditorServerError | null;
  onSave: (draft: CustomDraft, activate: boolean) => void;
  onCancel: () => void;
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
  fontSize: 14, fontFamily: 'inherit',
};

const invalidInput: React.CSSProperties = { borderColor: 'var(--danger, #ff6b6b)' };

const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 10,
  padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '11px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const errorBox: React.CSSProperties = {
  background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.35)', borderRadius: 10,
  padding: '12px 14px', fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 16,
};

// ─── Componente ──────────────────────────────────────────────────────────────

export default function CustomStrategyEditor({
  lang, mode, initial, objectives, saving, serverError, onSave, onCancel,
}: Props) {
  const t = T[lang];
  const te = t.editor;
  const uid = useId();
  const [draft, setDraft] = useState<CustomDraft>(initial);
  const [submitted, setSubmitted] = useState(false);

  const validation = validateDraft(draft);
  const showErrors = submitted && validation.errors.length > 0;
  const nameInvalid = submitted && validation.errors.includes('nameRequired');

  function set<K extends keyof CustomDraft>(key: K, value: CustomDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setRow(key: string, patch: Partial<CustomDraftRow>) {
    setDraft((d) => ({ ...d, calendar: d.calendar.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  }

  function addRow() {
    setDraft((d) => {
      if (d.calendar.length >= CUSTOM_STRATEGY_LIMITS.posts) return d;
      const lastWeek = d.calendar[d.calendar.length - 1]?.week ?? 1;
      return { ...d, calendar: [...d.calendar, emptyRow(lastWeek)] };
    });
  }

  function removeRow(key: string) {
    setDraft((d) => (d.calendar.length <= 1 ? d : { ...d, calendar: d.calendar.filter((r) => r.key !== key) }));
  }

  function submit(activate: boolean) {
    setSubmitted(true);
    if (validation.errors.length > 0) return;
    onSave(draft, activate);
  }

  const errorText = (e: (typeof validation.errors)[number]) => {
    if (e === 'tooManyRows') return te.errors.tooManyRows(CUSTOM_STRATEGY_LIMITS.posts);
    return te.errors[e];
  };

  const channelLabel = (c: string) => (c === 'general' ? t.custom.channelGeneral : CHANNEL_LABELS[c as Channel] ?? c);
  const id = (name: string) => `${uid}-${name}`;

  return (
    <form
      aria-label={mode === 'create' ? te.createTitle : te.editTitle}
      onSubmit={(e) => { e.preventDefault(); submit(false); }}
      noValidate
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: 'clamp(16px, 4vw, 28px)', marginBottom: 32,
      }}
    >
      <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
        {mode === 'create' ? te.createTitle : te.editTitle}
      </h2>
      {draft.based_on_strategy_id && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>{te.basedOn}</p>
      )}
      <div style={{ height: 12 }} />

      {showErrors && (
        <div role="alert" style={errorBox}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {validation.errors.map((e) => <li key={e}>{errorText(e)}</li>)}
          </ul>
        </div>
      )}
      {serverError && !showErrors && (
        <div role="alert" style={errorBox}>
          <div>{serverError.message}</div>
          {serverError.details.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {serverError.details.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* ── Datos generales ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16, marginBottom: 16 }}>
        <div>
          <label htmlFor={id('name')} style={labelStyle}>{te.name} *</label>
          <input
            id={id('name')}
            value={draft.name}
            maxLength={CUSTOM_TEXT_LIMITS.name}
            placeholder={te.namePlaceholder}
            aria-invalid={nameInvalid || undefined}
            required
            onChange={(e) => set('name', e.target.value)}
            style={{ ...inputStyle, ...(nameInvalid ? invalidInput : {}) }}
          />
        </div>
        <div>
          <label htmlFor={id('objective')} style={labelStyle}>{te.objective}</label>
          <select
            id={id('objective')}
            value={draft.objective_id}
            onChange={(e) => set('objective_id', e.target.value)}
            style={inputStyle}
          >
            <option value="">{te.noObjective}</option>
            {objectives.map((o) => (
              <option key={o.id} value={o.id}>{lang === 'en' ? o.name_en : o.name_es}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor={id('description')} style={labelStyle}>{te.description}</label>
        <textarea
          id={id('description')}
          value={draft.description}
          maxLength={CUSTOM_TEXT_LIMITS.description}
          placeholder={te.descriptionPlaceholder}
          rows={3}
          onChange={(e) => set('description', e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16, marginBottom: 16 }}>
        <div>
          <label htmlFor={id('kpi1')} style={labelStyle}>{te.kpiPrimary}</label>
          <input
            id={id('kpi1')}
            value={draft.kpi_primary}
            maxLength={CUSTOM_TEXT_LIMITS.kpi}
            placeholder={te.kpiPlaceholder}
            onChange={(e) => set('kpi_primary', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor={id('kpi2')} style={labelStyle}>{te.kpiSecondary}</label>
          <input
            id={id('kpi2')}
            value={draft.kpi_secondary}
            maxLength={CUSTOM_TEXT_LIMITS.kpi}
            onChange={(e) => set('kpi_secondary', e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label htmlFor={id('cta')} style={labelStyle}>{te.cta}</label>
        <textarea
          id={id('cta')}
          value={draft.cta_mechanic}
          maxLength={CUSTOM_TEXT_LIMITS.cta_mechanic}
          placeholder={te.ctaPlaceholder}
          rows={2}
          onChange={(e) => set('cta_mechanic', e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* ── Calendario ── */}
      <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 4px' }}>
        {te.calendar}
      </h3>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
        {te.calendarHint(CUSTOM_STRATEGY_LIMITS.weeks, CUSTOM_STRATEGY_LIMITS.posts)}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        {draft.calendar.map((row, i) => {
          const n = i + 1;
          const topicInvalid = submitted && validation.rowsWithoutTopic.includes(row.key);
          const rid = (name: string) => id(`${row.key}-${name}`);
          return (
            <fieldset
              key={row.key}
              data-testid="custom-calendar-row"
              style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', margin: 0, minWidth: 0 }}
            >
              <legend style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', padding: '0 6px' }}>{te.row(n)}</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10, marginBottom: 10 }}>
                <div>
                  <label htmlFor={rid('week')} style={labelStyle}>{te.week}</label>
                  <select
                    id={rid('week')}
                    value={row.week}
                    onChange={(e) => setRow(row.key, { week: Number(e.target.value) })}
                    style={inputStyle}
                  >
                    {Array.from({ length: CUSTOM_STRATEGY_LIMITS.weeks }, (_, w) => w + 1).map((w) => (
                      <option key={w} value={w}>{te.weekOption(w)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={rid('format')} style={labelStyle}>{te.format}</label>
                  <select
                    id={rid('format')}
                    value={row.format}
                    onChange={(e) => setRow(row.key, { format: e.target.value as CustomStrategyFormat })}
                    style={inputStyle}
                  >
                    {CUSTOM_FORMATS.map((f) => <option key={f} value={f}>{t.custom.formats[f]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={rid('channel')} style={labelStyle}>{te.channel}</label>
                  <select
                    id={rid('channel')}
                    value={row.channel}
                    onChange={(e) => setRow(row.key, { channel: e.target.value })}
                    style={inputStyle}
                  >
                    {CUSTOM_CHANNELS.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label htmlFor={rid('topic')} style={labelStyle}>{te.topic} *</label>
                <input
                  id={rid('topic')}
                  value={row.topic}
                  maxLength={CUSTOM_TEXT_LIMITS.topic}
                  placeholder={te.topicPlaceholder}
                  aria-invalid={topicInvalid || undefined}
                  required
                  onChange={(e) => setRow(row.key, { topic: e.target.value })}
                  style={{ ...inputStyle, ...(topicInvalid ? invalidInput : {}) }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                <div>
                  <label htmlFor={rid('angle')} style={labelStyle}>{te.angle}</label>
                  <input
                    id={rid('angle')}
                    value={row.angle}
                    maxLength={CUSTOM_TEXT_LIMITS.angle}
                    placeholder={te.anglePlaceholder}
                    onChange={(e) => setRow(row.key, { angle: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor={rid('goal')} style={labelStyle}>{te.goal}</label>
                  <input
                    id={rid('goal')}
                    value={row.goal}
                    maxLength={CUSTOM_TEXT_LIMITS.goal}
                    placeholder={te.goalPlaceholder}
                    onChange={(e) => setRow(row.key, { goal: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>
              {draft.calendar.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    aria-label={te.removeRow(n)}
                    style={{ ...secondaryBtn, padding: '6px 12px', fontSize: 12 }}
                  >
                    {te.remove}
                  </button>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        disabled={draft.calendar.length >= CUSTOM_STRATEGY_LIMITS.posts}
        style={{ ...secondaryBtn, padding: '8px 16px', fontSize: 13, marginBottom: 24 }}
      >
        {te.addRow}
      </button>

      {/* ── Acciones ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="submit" disabled={saving} style={{ ...secondaryBtn, borderColor: 'var(--accent)', color: 'var(--accent)' }}>
          {saving ? te.saving : te.save}
        </button>
        <button type="button" disabled={saving} onClick={() => submit(true)} style={primaryBtn}>
          {saving ? te.saving : te.saveActivate}
        </button>
        <button type="button" disabled={saving} onClick={onCancel} style={secondaryBtn}>
          {te.cancel}
        </button>
      </div>
    </form>
  );
}
