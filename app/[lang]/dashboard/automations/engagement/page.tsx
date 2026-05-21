'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import esT from '@/locales/es/dashboard/engagement';
import enT from '@/locales/en/dashboard/engagement';

type Locale = 'es' | 'en';
const DICT = { es: esT, en: enT } as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerType = 'new_comment' | 'new_review' | 'new_follower' | 'mention';
type ActionType  = 'reply_comment' | 'reply_review' | 'send_dm' | 'like_comment';
type Platform    = 'linkedin' | 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'threads' | 'all';

interface EngagementRule {
  id: string;
  name: string;
  trigger_type: TriggerType;
  condition_platform: string | null;
  condition_keyword: string | null;
  condition_rating: number | null;
  action_type: ActionType;
  action_template: string;
  is_active: boolean;
  created_at: string;
}

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'linkedin',  label: 'LinkedIn'  },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook'  },
  { value: 'twitter',   label: 'X/Twitter' },
  { value: 'tiktok',    label: 'TikTok'    },
  { value: 'threads',   label: 'Threads'   },
];

const TRIGGER_TYPES: TriggerType[] = ['new_comment', 'new_review', 'new_follower', 'mention'];
const ACTION_TYPES: ActionType[]   = ['reply_comment', 'reply_review', 'send_dm', 'like_comment'];

const NEEDS_TEMPLATE: ActionType[] = ['reply_comment', 'reply_review', 'send_dm'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EngagementPage() {
  const { lang } = useParams<{ lang: string }>();
  const locale: Locale = (lang as Locale) === 'en' ? 'en' : 'es';
  const t = DICT[locale];

  const [rules, setRules]             = useState<EngagementRule[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  // Form state
  const [name, setName]                   = useState('');
  const [triggerType, setTriggerType]     = useState<TriggerType>('new_comment');
  const [platform, setPlatform]           = useState<Platform | 'all'>('all');
  const [keyword, setKeyword]             = useState('');
  const [minRating, setMinRating]         = useState<number | ''>('');
  const [actionType, setActionType]       = useState<ActionType>('reply_comment');
  const [template, setTemplate]           = useState('');

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
    setKeyword(''); setMinRating(''); setActionType('reply_comment'); setTemplate('');
    setFormError(null);
  }

  function openForm() { resetForm(); setShowForm(true); }
  function closeForm() { setShowForm(false); resetForm(); }

  async function handleCreate() {
    if (!name.trim()) { setFormError(t.nameLabel + ' requerido'); return; }
    setSaving(true); setFormError(null);
    try {
      const res = await fetch('/api/automations/engagement/rules', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          trigger_type: triggerType,
          condition_platform: platform !== 'all' ? platform : null,
          condition_keyword: keyword.trim() || null,
          condition_rating: minRating !== '' ? Number(minRating) : null,
          action_type: actionType,
          action_template: template.trim(),
          is_active: true,
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

  const needsTemplate = NEEDS_TEMPLATE.includes(actionType);

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
              background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Name */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.nameLabel}
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t.namePlaceholder}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>

            {/* Trigger */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.triggerLabel}
              </label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                {TRIGGER_TYPES.map((tr) => (
                  <option key={tr} value={tr}>{t.triggers[tr] ?? tr}</option>
                ))}
              </select>
            </div>

            {/* Platform */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.platformLabel}
              </label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform | 'all')}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                <option value="all">{t.platformAll}</option>
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Keyword */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.keywordLabel}
              </label>
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                placeholder={t.keywordPlaceholder}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>

            {/* Min rating (only visible for new_review) */}
            {triggerType === 'new_review' && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                  color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t.ratingLabel}
                </label>
                <select value={minRating} onChange={(e) => setMinRating(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="">—</option>
                  {[1,2,3,4,5].map((n) => (
                    <option key={n} value={n}>{'★'.repeat(n)} ({n}+)</option>
                  ))}
                </select>
              </div>
            )}

            {/* Action */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.actionLabel}
              </label>
              <select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                {ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>{t.actions[a] ?? a}</option>
                ))}
              </select>
            </div>

            {/* Template */}
            {needsTemplate && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                  color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t.templateLabel}
                </label>
                <textarea value={template} onChange={(e) => setTemplate(e.target.value)}
                  placeholder={t.templatePlaceholder} rows={4}
                  style={{ width: '100%', resize: 'vertical', padding: '10px 14px', borderRadius: 8, fontSize: 14,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.templateHint}</p>
              </div>
            )}
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
          <div key={rule.id} style={{ background: 'var(--surface)', border: `1px solid ${rule.is_active ? 'var(--border)' : 'var(--border)'}`,
            borderLeft: `3px solid ${rule.is_active ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{rule.name}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                    background: rule.is_active ? 'rgba(198,255,75,0.15)' : 'var(--border)',
                    color: rule.is_active ? 'var(--accent)' : 'var(--muted)' }}>
                    {rule.is_active ? t.active : t.inactive}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                    background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    {DICT[locale].triggers[rule.trigger_type] ?? rule.trigger_type}
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
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                    background: 'rgba(198,255,75,0.08)', border: '1px solid rgba(198,255,75,0.2)',
                    color: 'var(--accent)' }}>
                    → {DICT[locale].actions[rule.action_type] ?? rule.action_type}
                  </span>
                </div>
                {rule.action_template && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8,
                    fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    &ldquo;{rule.action_template}&rdquo;
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
