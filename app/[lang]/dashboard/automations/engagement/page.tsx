'use client';

import { useEffect, useState, useCallback, useId, type CSSProperties, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useBrand } from '@/lib/brand-context';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import EmptyState from '@/components/ui/EmptyState';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { TONE_COLORS, type Tone } from '@/lib/status';
import { toLocale } from '@/lib/i18n';
import type { TriggerType, ActionType, EngagementPlatform, EngagementRule } from '@/types/automations';
import esT from '@/locales/es/dashboard/engagement';
import enT from '@/locales/en/dashboard/engagement';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

const DICT = { es: esT, en: enT } as const;
const TC   = { es: esCommon, en: enCommon } as const;

const PLATFORMS: { value: EngagementPlatform; label: string }[] = [
  { value: 'linkedin',  label: 'LinkedIn'  },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook'  },
  { value: 'twitter',   label: 'X/Twitter' },
  { value: 'tiktok',    label: 'TikTok'    },
  { value: 'threads',   label: 'Threads'   },
];
const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]));

const TRIGGER_TYPES: TriggerType[] = [
  'new_comment',
  'new_follower',
  'mention',
  'brand_mention',
  'post_shared',
  'new_dm',
  'comment_contains_keyword',
  'dm_contains_keyword',
  'lead_score_threshold',
];

const ACTION_TYPES: ActionType[] = [
  'reply_comment',
  'reply_comment_ai',
  'send_dm',
  'send_dm_ai_response',
];

const KEYWORD_TRIGGERS: TriggerType[] = ['comment_contains_keyword', 'dm_contains_keyword'];
const AI_ACTIONS: ActionType[]        = ['reply_comment_ai', 'send_dm_ai_response'];
const NEEDS_TEMPLATE: ActionType[]    = ['reply_comment', 'send_dm'];
const DELAY_MINUTES = [5, 15, 30, 60];

function badgeTone(tone: Tone): CSSProperties {
  const c = TONE_COLORS[tone];
  return { '--badge-color': c.color, '--badge-bg': c.background } as CSSProperties;
}

/** Chip neutro de la tarjeta (disparador, red, palabra clave, espera). */
const chipStyle: CSSProperties = {
  fontSize: 12, padding: '3px 8px', borderRadius: 6,
  background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EngagementPage() {
  const { lang } = useParams<{ lang: string }>();
  const { activeBrand } = useBrand();
  const locale = toLocale(lang);
  const t = DICT[locale];
  const tc = TC[locale];
  const dateLocale = t.dateLocale;
  const { confirm, dialog } = useConfirm();
  const uid = useId();
  const formId = `${uid}-form`;
  const formTitleId = `${uid}-form-title`;

  const [rules, setRules]         = useState<EngagementRule[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [name, setName]               = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('new_comment');
  const [platform, setPlatform]       = useState<EngagementPlatform | 'all'>('all');
  const [keyword, setKeyword]         = useState('');
  const [actionType, setActionType]   = useState<ActionType>('reply_comment');
  const [template, setTemplate]       = useState('');
  const [aiContext, setAiContext]     = useState('');
  const [delayMinutes, setDelayMinutes] = useState<number>(0);

  const fetchRules = useCallback(() => {
    setLoading(true); setLoadError(null);
    fetch('/api/automations/engagement/rules', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const e = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(e.error ?? '');
        }
        const json = await res.json() as { rules: EngagementRule[] };
        setRules(json.rules ?? []);
      })
      .catch((e: Error) => setLoadError(e.message || t.errorLoad))
      .finally(() => setLoading(false));
  }, [t.errorLoad]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // Cambiar de marca activa no disparaba por sí solo un refetch (mismo bug
  // que en /content): las reglas son de la marca anterior hasta que algo más
  // refresque. Cierra el formulario abierto por la misma razón.
  useEffect(() => {
    if (!activeBrand?.id) return;
    fetchRules();
    setShowForm(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  function resetForm() {
    setName(''); setTriggerType('new_comment'); setPlatform('all');
    setKeyword(''); setActionType('reply_comment');
    setTemplate(''); setAiContext(''); setDelayMinutes(0);
    setFormError(null);
  }

  function openForm()  { resetForm(); setShowForm(true); }
  function closeForm() { setShowForm(false); resetForm(); }

  const needsKeyword  = KEYWORD_TRIGGERS.includes(triggerType);
  const isAiAction    = AI_ACTIONS.includes(actionType);
  const needsTemplate = NEEDS_TEMPLATE.includes(actionType);

  async function handleCreate(e?: FormEvent) {
    e?.preventDefault();
    if (!name.trim()) { setFormError(t.nameRequired); return; }
    setSaving(true); setFormError(null);
    try {
      const res = await fetch('/api/automations/engagement/rules', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               name.trim(),
          trigger_type:       triggerType,
          condition_platform: platform !== 'all' ? platform : null,
          condition_keyword:  needsKeyword ? (keyword.trim() || null) : null,
          action_type:        actionType,
          action_template:    template.trim(),
          ai_context:         isAiAction ? (aiContext.trim() || null) : null,
          delay_minutes:      delayMinutes,
          is_active:          true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setFormError(err.error ?? t.errorCreate); return;
      }
      const json = await res.json() as { rule: EngagementRule };
      setRules((prev) => [json.rule, ...prev]);
      closeForm();
    } catch { setFormError(t.errorCreate); }
    finally { setSaving(false); }
  }

  async function toggleActive(rule: EngagementRule) {
    setActionError(null);
    const updated = { ...rule, is_active: !rule.is_active };
    setRules((prev) => prev.map((r) => r.id === rule.id ? updated : r));
    try {
      const res = await fetch(`/api/automations/engagement/rules/${rule.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !rule.is_active }),
      });
      if (!res.ok) throw new Error('toggle');
    } catch {
      setRules((prev) => prev.map((r) => r.id === rule.id ? rule : r));
      setActionError(t.errorToggle);
    }
  }

  async function deleteRule(rule: EngagementRule) {
    const ok = await confirm({
      title: t.confirmDelete,
      message: <><strong style={{ color: 'var(--text)' }}>{rule.name}</strong><br />{tc.confirm.irreversible}</>,
      confirmLabel: tc.actions.delete,
      cancelLabel: tc.actions.cancel,
      danger: true,
    });
    if (!ok) return;
    setActionError(null);
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    try {
      const res = await fetch(`/api/automations/engagement/rules/${rule.id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error('delete');
    } catch {
      setActionError(t.errorDelete);
      fetchRules();
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
        {!showForm && (
          <div className="page-header-actions">
            <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={openForm}>
              {t.newRuleBtn}
            </Button>
          </div>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <form
          id={formId}
          className="ui-card"
          aria-labelledby={formTitleId}
          onSubmit={(e) => void handleCreate(e)}
          style={{ marginBottom: 28 }}
          noValidate
        >
          <h2 id={formTitleId} className="ui-card-title" style={{ marginBottom: 20 }}>{t.formTitle}</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Name */}
            <Field label={t.nameLabel} required error={formError === t.nameRequired ? formError : undefined}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} />
            </Field>

            <div className="grid-2">
              {/* Trigger */}
              <Field label={t.triggerLabel}>
                <Select value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}>
                  {TRIGGER_TYPES.map((tr) => (
                    <option key={tr} value={tr}>{t.triggers[tr] ?? tr}</option>
                  ))}
                </Select>
              </Field>

              {/* Platform */}
              <Field label={t.platformLabel}>
                <Select value={platform} onChange={(e) => setPlatform(e.target.value as EngagementPlatform | 'all')}>
                  <option value="all">{t.platformAll}</option>
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Keyword — only for keyword triggers */}
            {needsKeyword && (
              <Field label={t.keywordLabel}>
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={t.keywordPlaceholder} />
              </Field>
            )}

            {/* Action */}
            <div className="grid-2">
              <Field label={t.actionLabel}>
                <Select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
                  {ACTION_TYPES.map((a) => (
                    <option key={a} value={a}>{t.actions[a] ?? a}</option>
                  ))}
                </Select>
              </Field>

              {/* Delay */}
              <Field label={t.delayLabel}>
                <Select value={delayMinutes} onChange={(e) => setDelayMinutes(Number(e.target.value))}>
                  <option value={0}>{t.delayNone}</option>
                  {DELAY_MINUTES.map((m) => <option key={m} value={m}>{m} {t.delayMinutes}</option>)}
                  <option value={180}>3 h</option>
                  <option value={1440}>24 h</option>
                </Select>
              </Field>
            </div>

            {/* Template — for manual template actions */}
            {needsTemplate && (
              <Field label={t.templateLabel} hint={t.templateHint}>
                <Textarea value={template} onChange={(e) => setTemplate(e.target.value)}
                  placeholder={t.templatePlaceholder} rows={3} />
              </Field>
            )}

            {/* AI context — for AI-powered actions */}
            {isAiAction && (
              <div style={{
                background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
                borderRadius: 10, padding: '14px 16px',
              }}>
                <Field
                  label={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent-text)' }}>
                      <Icon name="sparkles" size={14} />{t.aiContextLabel}
                    </span>
                  }
                  hint={t.aiContextHint}
                >
                  <Textarea value={aiContext} onChange={(e) => setAiContext(e.target.value)}
                    placeholder={t.aiContextPlaceholder} rows={3} />
                </Field>
              </div>
            )}
          </div>

          {formError && formError !== t.nameRequired && (
            <div style={{ marginTop: 16 }}><Notice tone="danger">{formError}</Notice></div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>{t.cancelBtn}</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!name.trim()}>
              {saving ? t.saving : t.saveBtn}
            </Button>
          </div>
        </form>
      )}

      {actionError && <div style={{ marginBottom: 16 }}><Notice tone="danger">{actionError}</Notice></div>}

      {/* Rules list */}
      {loading && (
        <>
          <p role="status" className="sr-only">{t.loading}</p>
          <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                <SkeletonBlock width={180} height={13} style={{ marginBottom: 10, maxWidth: '100%' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <SkeletonBlock width={70} height={20} borderRadius={6} />
                  <SkeletonBlock width={70} height={20} borderRadius={6} />
                  <SkeletonBlock width={90} height={20} borderRadius={6} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {!loading && loadError && (
        <Notice tone="danger" icon={<Icon name="alert" size={16} />}>
          {loadError}{' '}
          <button
            type="button"
            onClick={fetchRules}
            style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            {tc.actions.retry}
          </button>
        </Notice>
      )}
      {!loading && !loadError && rules.length === 0 && (
        <div className="ui-card">
          <EmptyState
            icon={<Icon name="bolt" size={32} strokeWidth={1.5} />}
            title={t.noRules}
            hint={t.noRulesHint}
            action={!showForm && (
              <Button variant="primary" icon={<Icon name="plus" size={14} />} onClick={openForm}>
                {t.createFirstRule}
              </Button>
            )}
          />
        </div>
      )}
      {!loading && rules.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map((rule) => {
            const isAi = AI_ACTIONS.includes(rule.action_type as ActionType);
            const nameId = `${uid}-rule-${rule.id}`;
            return (
              <li key={rule.id}>
                <article
                  className="ui-card"
                  aria-labelledby={nameId}
                  style={{ borderLeft: `3px solid ${rule.is_active ? 'var(--accent)' : 'var(--border)'}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <h2 id={nameId} style={{ fontFamily: 'inherit', fontWeight: 600, fontSize: 15, margin: 0, overflowWrap: 'anywhere' }}>
                          {rule.name}
                        </h2>
                        <span className="ui-badge" style={badgeTone(rule.is_active ? 'accent' : 'neutral')}>
                          {rule.is_active ? t.active : t.inactive}
                        </span>
                      </div>

                      {/* Trigger → Action badges */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                        <span style={chipStyle}>{t.triggers[rule.trigger_type] ?? rule.trigger_type}</span>
                        {rule.condition_platform && (
                          <span style={chipStyle}>{PLATFORM_LABELS[rule.condition_platform] ?? rule.condition_platform}</span>
                        )}
                        {rule.condition_keyword && (
                          <span style={chipStyle}>&quot;{rule.condition_keyword}&quot;</span>
                        )}
                        <span style={{ display: 'inline-flex', color: 'var(--muted)' }}>
                          <Icon name="arrow-right" size={14} />
                          <span className="sr-only">{t.then}</span>
                        </span>
                        <span
                          style={{
                            ...chipStyle,
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            ...(isAi ? { background: 'var(--accent-soft)', borderColor: 'var(--accent-border)', color: 'var(--accent-text)' } : {}),
                          }}
                        >
                          {isAi && <Icon name="sparkles" size={12} />}
                          {t.actions[rule.action_type] ?? rule.action_type}
                        </span>
                        {rule.delay_minutes > 0 && (
                          <span style={chipStyle}>{t.delayBadge(rule.delay_minutes)}</span>
                        )}
                      </div>

                      {rule.action_template && (
                        <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                          &ldquo;{rule.action_template}&rdquo;
                        </p>
                      )}

                      {/* Stats */}
                      {(rule.times_triggered > 0 || rule.last_triggered_at) && (
                        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
                          {[
                            rule.times_triggered > 0 ? t.timesTriggered(rule.times_triggered) : null,
                            rule.last_triggered_at
                              ? t.lastTriggered(new Date(rule.last_triggered_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }))
                              : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void toggleActive(rule)}
                      >
                        {rule.is_active ? t.togglePause : t.toggleActivate}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        icon={<Icon name="trash" size={14} />}
                        onClick={() => void deleteRule(rule)}
                      >
                        {t.deleteBtn}
                      </Button>
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
