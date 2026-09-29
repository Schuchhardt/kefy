'use client';

// ─── Editor de una estrategia propia ─────────────────────────────────────────
//
// Crear o editar: nombre, objetivo (opcional), enfoque, KPIs, mecánica de
// conversión y un calendario de piezas (semana, formato, canal, tema, ángulo,
// objetivo). Valida lo mínimo en el cliente (nombre, al menos una pieza, tema
// en cada pieza); el resto lo valida el servidor y sus errores llegan en
// `serverError`. En pantallas estrechas cada pieza se apila en una columna.
//
// Al abrirse, el foco va a su título: si no, quien usa teclado o lector de
// pantalla se quedaba en el botón que lo abrió, más abajo en la página.

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import esT from '@/locales/es/dashboard/strategy';
import enT from '@/locales/en/dashboard/strategy';
import type { CustomStrategyFormat, Objective } from '@/types/strategy';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import {
  CUSTOM_CHANNELS,
  CUSTOM_FORMATS,
  CUSTOM_STRATEGY_LIMITS,
  CUSTOM_TEXT_LIMITS,
  channelName,
  emptyRow,
  validateDraft,
  type CustomDraft,
  type CustomDraftRow,
} from './custom-strategy-model';
import styles from './CustomStrategyPanel.module.css';

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

const grid = (min: number, gap = 16) => ({ '--min': `${min}px`, '--gap': `${gap}px` }) as CSSProperties;

// ─── Componente ──────────────────────────────────────────────────────────────

export default function CustomStrategyEditor({
  lang, mode, initial, objectives, saving, serverError, onSave, onCancel,
}: Props) {
  const t = T[lang];
  const te = t.editor;
  const headingId = `strategy-editor-${useId().replace(/:/g, '')}`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<CustomDraft>(initial);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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

  const title = mode === 'create' ? te.createTitle : te.editTitle;

  return (
    <form
      aria-labelledby={headingId}
      onSubmit={(e) => { e.preventDefault(); submit(false); }}
      noValidate
      className={`ui-card ${styles.editor}`}
    >
      <h2 ref={headingRef} id={headingId} tabIndex={-1} className={`${styles.editorTitle} ${styles.anchor}`}>
        {title}
      </h2>
      {draft.based_on_strategy_id && <p className="ui-hint">{te.basedOn}</p>}

      <div className={styles.editorBody}>
        {showErrors && (
          <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
            <ul className={styles.errorList}>
              {validation.errors.map((e) => <li key={e}>{errorText(e)}</li>)}
            </ul>
          </Notice>
        )}
        {serverError && !showErrors && (
          <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
            <div>{serverError.message}</div>
            {serverError.details.length > 0 && (
              <ul className={styles.errorList}>
                {serverError.details.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
          </Notice>
        )}

        {/* ── Datos generales ── */}
        <div className="auto-grid" style={grid(240)}>
          <Field label={te.name} required>
            <Input
              value={draft.name}
              maxLength={CUSTOM_TEXT_LIMITS.name}
              placeholder={te.namePlaceholder}
              aria-invalid={nameInvalid || undefined}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label={te.objective}>
            <Select value={draft.objective_id} onChange={(e) => set('objective_id', e.target.value)}>
              <option value="">{te.noObjective}</option>
              {objectives.map((o) => (
                <option key={o.id} value={o.id}>{lang === 'en' ? o.name_en : o.name_es}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={te.description}>
          <Textarea
            value={draft.description}
            maxLength={CUSTOM_TEXT_LIMITS.description}
            placeholder={te.descriptionPlaceholder}
            rows={3}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

        <div className="auto-grid" style={grid(240)}>
          <Field label={te.kpiPrimary}>
            <Input
              value={draft.kpi_primary}
              maxLength={CUSTOM_TEXT_LIMITS.kpi}
              placeholder={te.kpiPlaceholder}
              onChange={(e) => set('kpi_primary', e.target.value)}
            />
          </Field>
          <Field label={te.kpiSecondary}>
            <Input
              value={draft.kpi_secondary}
              maxLength={CUSTOM_TEXT_LIMITS.kpi}
              onChange={(e) => set('kpi_secondary', e.target.value)}
            />
          </Field>
        </div>

        <Field label={te.cta}>
          <Textarea
            value={draft.cta_mechanic}
            maxLength={CUSTOM_TEXT_LIMITS.cta_mechanic}
            placeholder={te.ctaPlaceholder}
            rows={2}
            onChange={(e) => set('cta_mechanic', e.target.value)}
          />
        </Field>

        {/* ── Calendario ── */}
        <div>
          <h3 className={styles.subheading}>{te.calendar}</h3>
          <p className="ui-hint" style={{ marginTop: 4 }}>
            {te.calendarHint(CUSTOM_STRATEGY_LIMITS.weeks, CUSTOM_STRATEGY_LIMITS.posts)}
          </p>
        </div>

        <div className={styles.rows}>
          {draft.calendar.map((row, i) => {
            const n = i + 1;
            const topicInvalid = submitted && validation.rowsWithoutTopic.includes(row.key);
            return (
              <fieldset key={row.key} data-testid="custom-calendar-row" className={styles.row}>
                <legend className={styles.rowLegend}>{te.row(n)}</legend>
                <div className="auto-grid" style={grid(140, 10)}>
                  <Field label={te.week}>
                    <Select value={row.week} onChange={(e) => setRow(row.key, { week: Number(e.target.value) })}>
                      {Array.from({ length: CUSTOM_STRATEGY_LIMITS.weeks }, (_, w) => w + 1).map((w) => (
                        <option key={w} value={w}>{te.weekOption(w)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={te.format}>
                    <Select
                      value={row.format}
                      onChange={(e) => setRow(row.key, { format: e.target.value as CustomStrategyFormat })}
                    >
                      {CUSTOM_FORMATS.map((f) => <option key={f} value={f}>{t.custom.formats[f]}</option>)}
                    </Select>
                  </Field>
                  <Field label={te.channel}>
                    <Select value={row.channel} onChange={(e) => setRow(row.key, { channel: e.target.value })}>
                      {CUSTOM_CHANNELS.map((c) => <option key={c} value={c}>{channelName(c, t)}</option>)}
                    </Select>
                  </Field>
                </div>
                <Field label={te.topic} required>
                  <Input
                    value={row.topic}
                    maxLength={CUSTOM_TEXT_LIMITS.topic}
                    placeholder={te.topicPlaceholder}
                    aria-invalid={topicInvalid || undefined}
                    onChange={(e) => setRow(row.key, { topic: e.target.value })}
                  />
                </Field>
                <div className="auto-grid" style={grid(200, 10)}>
                  <Field label={te.angle}>
                    <Input
                      value={row.angle}
                      maxLength={CUSTOM_TEXT_LIMITS.angle}
                      placeholder={te.anglePlaceholder}
                      onChange={(e) => setRow(row.key, { angle: e.target.value })}
                    />
                  </Field>
                  <Field label={te.goal}>
                    <Input
                      value={row.goal}
                      maxLength={CUSTOM_TEXT_LIMITS.goal}
                      placeholder={te.goalPlaceholder}
                      onChange={(e) => setRow(row.key, { goal: e.target.value })}
                    />
                  </Field>
                </div>
                {draft.calendar.length > 1 && (
                  <div className={styles.rowActions}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Icon name="trash" size={14} />}
                      aria-label={te.removeRow(n)}
                      onClick={() => removeRow(row.key)}
                    >
                      {te.remove}
                    </Button>
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>

        <div>
          <Button
            variant="secondary"
            icon={<Icon name="plus" size={16} />}
            onClick={addRow}
            disabled={draft.calendar.length >= CUSTOM_STRATEGY_LIMITS.posts}
          >
            {te.addRow}
          </Button>
        </div>

        {/* ── Acciones ── */}
        <div className={styles.buttonRow} style={{ marginTop: 8 }}>
          <Button type="submit" variant="secondary" loading={saving}>
            {saving ? te.saving : te.save}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => submit(true)}>
            {saving ? te.saving : te.saveActivate}
          </Button>
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            {te.cancel}
          </Button>
        </div>
      </div>
    </form>
  );
}
