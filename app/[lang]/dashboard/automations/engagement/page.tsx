'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { Locale } from '@/types/i18n';
import type { TriggerType, ActionType, EngagementPlatform, EngagementRule } from '@/types/automations';
import esT from '@/locales/es/dashboard/engagement';
import enT from '@/locales/en/dashboard/engagement';

const DICT = { es: esT, en: enT } as const;

const PLATFORMS: { value: EngagementPlatform; label: string }[] = [
  { value: 'linkedin',  label: 'LinkedIn'  },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook'  },
  { value: 'twitter',   label: 'X/Twitter' },
  { value: 'tiktok',    label: 'TikTok'    },
  { value: 'threads',   label: 'Threads'   },
];

const TRIGGER_TYPES: TriggerType[] = [
  'new_comment',
  'new_review',
  'new_follower',
  'mention',
  'brand_mention',
  'post_shared',
  'new_dm',
  'dm_no_response',
  'comment_contains_keyword',
  'dm_contains_keyword',
  'lead_score_threshold',
];

const ACTION_TYPES: ActionType[] = [
  'reply_comment',
  'reply_comment_ai',
  'reply_review',
  'reply_review_ai',
  'send_dm',
  'send_dm_ai_response',
  'like_comment',
  'notify_team',
  'add_to_list',
];

const KEYWORD_TRIGGERS: TriggerType[] = ['comment_contains_keyword', 'dm_contains_keyword'];
const AI_ACTIONS: ActionType[]        = ['reply_comment_ai', 'reply_review_ai', 'send_dm_ai_response'];
const NEEDS_TEMPLATE: ActionType[]    = ['reply_comment', 'reply_review', 'send_dm', 'notify_team'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EngagementPage() {
  const { lang } = useParams<{ lang: string }>();
  const locale: Locale = (lang as Locale) === 'en' ? 'en' : 'es';
  const t = DICT[locale];
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES';

  const [rules, setRules]         = useState<EngagementRule[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [name, setName]               = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('new_comment');
  const [platform, setPlatform]       = useState<EngagementPlatform | 'all'>('all');
  const [keyword, setKeyword]         = useState('');
  const [minRating, setMinRating]     = useState<number | ''>('');
  const [actionType, setActionType]   = useState<ActionType>('reply_comment');
  const [template, setTemplate]       = useState('');
  const [aiContext, setAiContext]     = useState('');
  const [delayMinutes, setDelayMinutes] = useState<number>(0);

  const fetchRules = useCallback(() => {
    setLoading(true); setLoadError(null);
    fetch('/api/automations/engagement/rules', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? 'error'); }
        const json = await res.json() as { rules: EngagementRule[] };
        setRules(json.rules ?? []);
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  function resetForm() {
    setName(''); setTriggerType('new_comment'); setPlatform('all');
    setKeyword(''); setMinRating(''); setActionType('reply_comment');
    setTemplate(''); setAiContext(''); setDelayMinutes(0);
    setFormError(null);
  }

  function openForm()  { resetForm(); setShowForm(true); }
  function closeForm() { setShowForm(false); resetForm(); }

  const needsKeyword  = KEYWORD_TRIGGERS.includes(triggerType);
  const isAiAction    = AI_ACTIONS.includes(actionType);
  const needsTemplate = NEEDS_TEMPLATE.includes(actionType);

  async function handleCreate() {
    if (!name.trim()) { setFormError(t.nameLabel + ' requerido'); return; }
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
          condition_rating:   minRating !== '' ? Number(minRating) : null,
          action_type:        actionType,
          action_template:    template.trim(),
          ai_context:         isAiAction ? (aiContext.trim() || null) : null,
          delay_minutes:      delayMinutes,
          is_active:          true,
        }),
      });
      if (!res.ok) {
        const e = await res.json() as { error?: string };
        setFormError(e.error ?? t.errorCreate); return;
      }
      const json = await res.json() as { rule: EngagementRule };
      setRules((prev) => [json.rule, ...prev]);
      closeForm();
    } catch { setFormError(t.errorCreate); }
    finally { setSaving(false); }
  }

  async function toggleActive(rule: EngagementRule) {
    const updated = { ...rule, is_active: !rule.is_active };
    setRules((prev) => prev.map((r) => r.id === rule.id ? updated : r));
    const res = await fetch(`/api/automations/engagement/rules/${rule.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    if (!res.ok) setRules((prev) => prev.map((r) => r.id === rule.id ? rule : r));
  }

  async function deleteRule(rule: EngagementRule) {
    if (!window.confirm(t.confirmDelete)) return;
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    const res = await fetch(`/api/automations/engagement/rules/${rule.id}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (!res.ok) { fetchRules(); }
  }

  return (
    <div style={{ padding: '32px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            {t.title}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t.subtitle}</p>
        </div>
        {!showForm && (
          <button onClick={openForm}
            style={{ padding: '10px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            {t.newRuleBtn}
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '24px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20,
            fontFamily: 'var(--font-syne)', color: 'var(--text)' }}>
            {t.newRuleBtn}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Name */}
            <div>
              <label style={labelStyle}>{t.nameLabel}</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t.namePlaceholder} style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Trigger */}
              <div>
                <label style={labelStyle}>{t.triggerLabel}</label>
                <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  {TRIGGER_TYPES.map((tr) => (
                    <option key={tr} value={tr}>{t.triggers[tr] ?? tr}</option>
                  ))}
                </select>
              </div>

              {/* Platform */}
              <div>
                <label style={labelStyle}>{t.platformLabel}</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value as EngagementPlatform | 'all')}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="all">{t.platformAll}</option>
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Keyword — only for keyword triggers */}
            {needsKeyword && (
              <div>
                <label style={labelStyle}>{t.keywordLabel}</label>
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                  placeholder={t.keywordPlaceholder} style={inputStyle} />
              </div>
            )}

            {/* Min rating — only for review trigger */}
            {triggerType === 'new_review' && (
              <div style={{ maxWidth: 240 }}>
                <label style={labelStyle}>{t.ratingLabel}</label>
                <select value={minRating} onChange={(e) => setMinRating(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">—</option>
                  {[1,2,3,4,5].map((n) => (
                    <option key={n} value={n}>{'★'.repeat(n)} ({n}+)</option>
                  ))}
                </select>
              </div>
            )}

            {/* Action */}
            <div style={{ maxWidth: 360 }}>
              <label style={labelStyle}>{t.actionLabel}</label>
              <select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                {ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>{t.actions[a] ?? a}</option>
                ))}
              </select>
            </div>

            {/* Template — for manual template actions */}
            {needsTemplate && (
              <div>
                <label style={labelStyle}>{t.templateLabel}</label>
                <textarea value={template} onChange={(e) => setTemplate(e.target.value)}
                  placeholder={t.templatePlaceholder} rows={3}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.templateHint}</p>
              </div>
            )}

            {/* AI context — for AI-powered actions */}
            {isAiAction && (
              <div style={{
                background: 'rgba(198,255,75,0.04)', border: '1px solid rgba(198,255,75,0.2)',
                borderRadius: 10, padding: '14px 16px',
              }}>
                <label style={{ ...labelStyle, color: 'var(--accent)' }}>{t.aiContextLabel}</label>
                <textarea value={aiContext} onChange={(e) => setAiContext(e.target.value)}
                  placeholder={t.aiContextPlaceholder} rows={3}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 80, borderColor: 'rgba(198,255,75,0.3)' }} />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                  La IA usará la info de tu brand kit + este contexto para generar la respuesta.
                </p>
              </div>
            )}

            {/* Delay */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <label style={labelStyle}>{t.delayLabel}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select value={delayMinutes} onChange={(e) => setDelayMinutes(Number(e.target.value))}
                    style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
                    <option value={0}>{t.delayNone}</option>
                    <option value={5}>5 {t.delayMinutes}</option>
                    <option value={15}>15 {t.delayMinutes}</option>
                    <option value={30}>30 {t.delayMinutes}</option>
                    <option value={60}>60 {t.delayMinutes}</option>
                    <option value={180}>3 h</option>
                    <option value={1440}>24 h</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {formError && (
            <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 12 }}>{formError}</p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={closeForm} disabled={saving}
              style={{ padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--muted)', cursor: 'pointer' }}>
              {t.cancelBtn}
            </button>
            <button onClick={() => void handleCreate()} disabled={saving || !name.trim()}
              style={{ padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: name.trim() && !saving ? 'var(--accent)' : 'var(--border)',
                color: name.trim() && !saving ? '#000' : 'var(--muted)',
                border: 'none', cursor: name.trim() && !saving ? 'pointer' : 'default',
                opacity: saving ? 0.7 : 1 }}>
              {saving ? t.saving : t.saveBtn}
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {loading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.loading}</p>}
      {!loading && loadError && <p style={{ color: '#ff6b6b', fontSize: 13 }}>{loadError}</p>}
      {!loading && !loadError && rules.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>⚡</p>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>{t.noRules}</p>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.noRulesHint}</p>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rules.map((rule) => (
          <div key={rule.id} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${rule.is_active ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12, padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{rule.name}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                    background: rule.is_active ? 'rgba(198,255,75,0.15)' : 'var(--bg)',
                    color: rule.is_active ? 'var(--accent)' : 'var(--muted)',
                    border: `1px solid ${rule.is_active ? 'rgba(198,255,75,0.4)' : 'var(--border)'}` }}>
                    {rule.is_active ? t.active : t.inactive}
                  </span>
                </div>

                {/* Trigger → Action badges */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                    background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    {t.triggers[rule.trigger_type] ?? rule.trigger_type}
                  </span>
                  {rule.condition_platform && (
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                      background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                      {rule.condition_platform}
                    </span>
                  )}
                  {rule.condition_keyword && (
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                      background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                      &quot;{rule.condition_keyword}&quot;
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                    background: AI_ACTIONS.includes(rule.action_type as ActionType)
                      ? 'rgba(198,255,75,0.08)' : 'var(--bg)',
                    border: `1px solid ${AI_ACTIONS.includes(rule.action_type as ActionType) ? 'rgba(198,255,75,0.3)' : 'var(--border)'}`,
                    color: AI_ACTIONS.includes(rule.action_type as ActionType) ? 'var(--accent)' : 'var(--muted)' }}>
                    {AI_ACTIONS.includes(rule.action_type as ActionType) ? '✦ ' : ''}{t.actions[rule.action_type] ?? rule.action_type}
                  </span>
                  {rule.delay_minutes > 0 && (
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                      background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                      +{rule.delay_minutes}min
                    </span>
                  )}
                </div>

                {rule.action_template && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>
                    &ldquo;{rule.action_template}&rdquo;
                  </p>
                )}

                {/* Stats */}
                {(rule.times_triggered > 0 || rule.last_triggered_at) && (
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    {rule.times_triggered > 0 && `${rule.times_triggered}× ejecutada`}
                    {rule.last_triggered_at && ` · última vez ${new Date(rule.last_triggered_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' })}`}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => void toggleActive(rule)}
                  style={{ padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${rule.is_active ? 'var(--border)' : 'var(--accent)'}`,
                    background: rule.is_active ? 'var(--bg)' : 'rgba(198,255,75,0.1)',
                    color: rule.is_active ? 'var(--muted)' : 'var(--accent)', cursor: 'pointer' }}>
                  {rule.is_active ? t.togglePause : t.toggleActivate}
                </button>
                <button onClick={() => void deleteRule(rule)}
                  style={{ padding: '6px 12px', borderRadius: 7, fontSize: 12,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: '#ff6b6b', cursor: 'pointer' }}>
                  {t.deleteBtn}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
