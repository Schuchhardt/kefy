'use client';

import { useEffect, useState, useCallback, useId, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CHANNELS as ALL_CHANNELS, getChannelLabel } from '@/lib/channels';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import EmptyState from '@/components/ui/EmptyState';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { TONE_COLORS, type Tone } from '@/lib/status';
import { toLocale } from '@/lib/i18n';
import type { Channel } from '@/types/channels';

import esT from '@/locales/es/dashboard/autopilot';
import enT from '@/locales/en/dashboard/autopilot';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

import type { AIModel } from '@/types/ai';
import type { Frequency, AutopilotRule } from '@/types/automations';
import type { SocialAccount } from '@/types/social';
import { useDataChanged } from '@/lib/data-events';
import { useBrand } from '@/lib/brand-context';

// ─── Constants ────────────────────────────────────────────────────────────────

const T  = { es: esT, en: enT } as const;
const TC = { es: esCommon, en: enCommon } as const;

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];
/** Frecuencias que piden día de la semana. */
const WEEKLY: Frequency[] = ['weekly', 'biweekly'];
const MODEL_LABELS: Record<AIModel, string> = { claude: 'Claude', gpt: 'GPT-4o' };

function badgeTone(tone: Tone): CSSProperties {
  const c = TONE_COLORS[tone];
  return { '--badge-color': c.color, '--badge-bg': c.background } as CSSProperties;
}

type PageNotice = { tone: 'success' | 'danger'; text: string } | null;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutopilotPage() {
  const { lang } = useParams<{ lang: string }>();
  const locale = toLocale(lang);
  const t = T[locale];
  const tc = TC[locale];
  const { activeBrand } = useBrand();
  const { confirm, dialog } = useConfirm();
  const uid = useId();
  const formId = `${uid}-form`;
  const formTitleId = `${uid}-form-title`;
  const accountsLabelId = `${uid}-accounts`;
  const dateLocale = t.dateLocale;
  const CHANNELS = ALL_CHANNELS.map((c) => c.value === 'generic' ? { ...c, label: t.channelGeneric } : c);
  const DAYS = t.days;

  const [rules, setRules]           = useState<AutopilotRule[]>([]);
  const [accounts, setAccounts]     = useState<SocialAccount[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState(false);
  const [runningId, setRunningId]   = useState<string | null>(null);
  const [notice, setNotice]         = useState<PageNotice>(null);

  // Form state
  const [showForm, setShowForm]         = useState(false);
  const [formName, setFormName]         = useState('');
  const [formChannel, setFormChannel]   = useState<Channel>('linkedin');
  const [formAccounts, setFormAccounts] = useState<string[]>([]);
  const [formFreq, setFormFreq]         = useState<Frequency>('weekly');
  const [formDay, setFormDay]           = useState<number>(1);
  const [formTime, setFormTime]         = useState('09:00');
  const [formTz, setFormTz]             = useState('America/Mexico_City');
  const [formModel, setFormModel]       = useState<AIModel>('claude');
  const [formHint, setFormHint]         = useState('');
  const [saving, setSaving]             = useState(false);
  const [formError, setFormError]       = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [rulesRes, accountsRes] = await Promise.all([
        fetch('/api/autopilot/rules', { credentials: 'include' }),
        fetch('/api/social/accounts', { credentials: 'include' }),
      ]);
      if (!rulesRes.ok) throw new Error('rules');
      const { data: rulesData } = await rulesRes.json() as { data: AutopilotRule[] };
      const accountsJson = accountsRes.ok
        ? await accountsRes.json() as { accounts: SocialAccount[] }
        : { accounts: [] };
      setRules(rulesData ?? []);
      setAccounts(accountsJson.accounts ?? []);
      setLoadError(false);
    } catch {
      // Antes un fallo dejaba el esqueleto de carga para siempre.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cambiar de marca activa no disparaba por sí solo un refetch (mismo bug
  // que en /content): las reglas/cuentas son de la marca anterior hasta que
  // algo más refresque. Cierra el formulario abierto por la misma razón.
  useEffect(() => {
    if (!activeBrand?.id) return;
    void fetchData();
    setShowForm(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  // El asistente creó, pausó o ejecutó una regla: se recarga la lista.
  useDataChanged(['autopilot'], () => { void fetchData(); });

  function toggleAccount(id: string) {
    setFormAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  }

  function toggleForm() {
    setShowForm((v) => !v);
    setFormError(null);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch('/api/autopilot/rules', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               formName,
          channel:            formChannel,
          social_account_ids: formAccounts,
          frequency:          formFreq,
          day_of_week:        WEEKLY.includes(formFreq) ? formDay : null,
          time_of_day:        formTime,
          timezone:           formTz,
          ai_model:           formModel,
          prompt_hint:        formHint.trim() || null,
        }),
      });
      const data = await res.json() as { rule?: AutopilotRule; error?: string };
      if (!res.ok) throw new Error(data.error ?? t.errorCreate);
      setShowForm(false);
      setFormName(''); setFormHint(''); setFormAccounts([]);
      fetchData();
    } catch (err) {
      setFormError(err instanceof Error && err.message ? err.message : t.errorUnknown);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: AutopilotRule) {
    setNotice(null);
    try {
      const res = await fetch(`/api/autopilot/rules/${rule.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: rule.status === 'active' ? 'paused' : 'active' }),
      });
      if (!res.ok) setNotice({ tone: 'danger', text: t.errorToggle });
    } catch {
      setNotice({ tone: 'danger', text: t.errorToggle });
    }
    fetchData();
  }

  async function handleDelete(rule: AutopilotRule) {
    const ok = await confirm({
      title: t.confirmDelete,
      message: <><strong style={{ color: 'var(--text)' }}>{rule.name}</strong><br />{tc.confirm.irreversible}</>,
      confirmLabel: tc.actions.delete,
      cancelLabel: tc.actions.cancel,
      danger: true,
    });
    if (!ok) return;
    setNotice(null);
    try {
      const res = await fetch(`/api/autopilot/rules/${rule.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('delete');
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch {
      setNotice({ tone: 'danger', text: t.errorDelete });
    }
  }

  async function handleRun(ruleId: string) {
    setRunningId(ruleId);
    setNotice(null);
    try {
      const res = await fetch('/api/autopilot/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_ids: [ruleId] }),
      });
      const data = await res.json() as { executed?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? t.errorRun);
      setNotice({ tone: 'success', text: t.runSuccess(data.executed ?? 0) });
      fetchData();
    } catch (err) {
      setNotice({ tone: 'danger', text: err instanceof Error && err.message ? err.message : t.errorUnknown });
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      {/* Header */}
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-syne), system-ui, sans-serif' }}>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="page-header-actions">
          <Button
            variant={showForm ? 'secondary' : 'primary'}
            icon={showForm ? undefined : <Icon name="plus" size={16} />}
            aria-expanded={showForm}
            aria-controls={showForm ? formId : undefined}
            onClick={toggleForm}
          >
            {showForm ? t.cancelBtn : t.newRuleBtn}
          </Button>
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone={notice.tone} icon={<Icon name={notice.tone === 'success' ? 'check-circle' : 'alert'} size={16} />}>
            {notice.text}
          </Notice>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form id={formId} onSubmit={handleCreate} className="ui-card" aria-labelledby={formTitleId} style={{ marginBottom: 28 }}>
          <h2 id={formTitleId} className="ui-card-title" style={{ marginBottom: 18 }}>{t.formTitle}</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label={t.nameLabel} required>
              <Input
                value={formName}
                required
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t.namePlaceholder}
              />
            </Field>

            <div className="grid-2" style={{ '--gap': '14px' } as CSSProperties}>
              <Field label={t.channelLabel}>
                <Select value={formChannel} onChange={(e) => setFormChannel(e.target.value as Channel)}>
                  {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
              </Field>
              <Field label={t.modelLabel}>
                <Select value={formModel} onChange={(e) => setFormModel(e.target.value as AIModel)}>
                  <option value="claude">{MODEL_LABELS.claude}</option>
                  <option value="gpt">{MODEL_LABELS.gpt}</option>
                </Select>
              </Field>
            </div>

            <div role="group" aria-labelledby={accountsLabelId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span id={accountsLabelId} className="ui-label">{t.accountsLabel}</span>
              {accounts.length === 0 ? (
                <Notice live={false}>
                  {t.noAccounts}{' '}
                  {/* Antes era <a href="settings"> relativo: resolvía a
                      /dashboard/automations/settings (404). */}
                  <Link
                    href={`/${lang}/dashboard/settings#social`}
                    style={{ color: 'var(--accent-text)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    {t.connectSettings}
                  </Link>
                </Notice>
              ) : (
                <div className="ui-segmented">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      aria-pressed={formAccounts.includes(acc.id)}
                      onClick={() => toggleAccount(acc.id)}
                    >
                      {getChannelLabel(acc.platform as Channel)} · {acc.username}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="auto-grid" style={{ '--min': '150px', '--gap': '14px' } as CSSProperties}>
              <Field label={t.freqLabel}>
                <Select value={formFreq} onChange={(e) => setFormFreq(e.target.value as Frequency)}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{t.frequencies[f] ?? f}</option>)}
                </Select>
              </Field>
              {WEEKLY.includes(formFreq) && (
                <Field label={t.dayLabel}>
                  <Select value={formDay} onChange={(e) => setFormDay(Number(e.target.value))}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </Select>
                </Field>
              )}
              <Field label={t.timeLabel}>
                <Input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
              </Field>
            </div>

            <Field label={t.tzLabel} hint={t.tzHint}>
              <Input
                value={formTz}
                onChange={(e) => setFormTz(e.target.value)}
                placeholder="America/Mexico_City"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>

            <Field label={t.hintLabel}>
              <Textarea
                rows={3}
                value={formHint}
                onChange={(e) => setFormHint(e.target.value)}
                placeholder={t.hintPlaceholder}
              />
            </Field>

            {formError && <Notice tone="danger">{formError}</Notice>}

            <div>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? t.saving : t.createBtn}
              </Button>
            </div>
          </div>
        </form>
      )}

      {loadError && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
            {tc.errors.load}{' '}
            <button
              type="button"
              onClick={() => { setLoading(true); void fetchData(); }}
              style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              {tc.actions.retry}
            </button>
          </Notice>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <>
          <p role="status" className="sr-only">{t.loading}</p>
          <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <SkeletonBlock width={60} height={17} borderRadius={4} />
                  <SkeletonBlock width={60} height={17} borderRadius={4} />
                </div>
                <SkeletonBlock width={220} height={15} style={{ marginBottom: 6, maxWidth: '100%' }} />
                <SkeletonBlock width={160} height={13} style={{ maxWidth: '100%' }} />
              </div>
            ))}
          </div>
        </>
      ) : rules.length === 0 ? (
        !loadError && (
          <div className="ui-card">
            <EmptyState
              icon={<Icon name="bolt" size={32} strokeWidth={1.5} />}
              title={t.noRules}
              hint={t.noRulesHint}
              action={!showForm && (
                <Button variant="primary" icon={<Icon name="plus" size={14} />} onClick={toggleForm}>
                  {t.createFirstRule}
                </Button>
              )}
            />
          </div>
        )
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map((rule) => {
            const active = rule.status === 'active';
            const nameId = `${uid}-rule-${rule.id}`;
            return (
              <li key={rule.id}>
                <article
                  className="ui-card"
                  aria-labelledby={nameId}
                  style={{ borderColor: active ? 'var(--accent-border)' : undefined }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span className="ui-badge">{getChannelLabel(rule.channel, t.channelGeneric)}</span>
                        <span className="ui-badge" style={badgeTone(active ? 'accent' : 'neutral')}>
                          {active ? t.active : t.paused}
                        </span>
                      </div>
                      <h2 id={nameId} style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 600, margin: '0 0 4px', overflowWrap: 'anywhere' }}>
                        {rule.name}
                      </h2>
                      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                        {t.frequencies[rule.frequency] ?? rule.frequency} ·{' '}
                        {rule.day_of_week !== null ? `${DAYS[rule.day_of_week]} · ` : ''}
                        {rule.time_of_day} ({rule.timezone}) ·{' '}
                        {MODEL_LABELS[rule.ai_model] ?? rule.ai_model}
                      </p>
                      {rule.next_run_at && (
                        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
                          {t.nextRun}{' '}
                          {new Date(rule.next_run_at).toLocaleString(dateLocale, {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Icon name="play" size={12} />}
                        loading={runningId === rule.id}
                        disabled={runningId !== null}
                        onClick={() => void handleRun(rule.id)}
                      >
                        {t.runNow}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void handleToggle(rule)}>
                        {active ? t.pauseBtn : t.activateBtn}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        iconOnly
                        aria-label={t.deleteRule}
                        title={t.deleteRule}
                        icon={<Icon name="trash" size={14} />}
                        onClick={() => void handleDelete(rule)}
                      />
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {dialog}
    </div>
  );
}
