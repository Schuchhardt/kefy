'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

import esT from '@/locales/es/dashboard/autopilot';
import enT from '@/locales/en/dashboard/autopilot';

const T = { es: esT, en: enT } as const;
type Locale = keyof typeof T;

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel   = 'linkedin' | 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'threads' | 'generic';
type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
type AIModel   = 'claude' | 'gpt';

interface AutopilotRule {
  id:                 string;
  name:               string;
  channel:            Channel;
  social_account_ids: string[];
  frequency:          Frequency;
  day_of_week:        number | null;
  time_of_day:        string;
  timezone:           string;
  ai_model:           AIModel;
  prompt_hint:        string | null;
  is_active:          boolean;
  next_run_at:        string | null;
  last_run_at:        string | null;
  created_at:         string;
}

interface SocialAccount {
  id:       string;
  platform: string;
  username: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNELS_BASE: { value: Channel; label: string }[] = [
  { value: 'linkedin',  label: 'LinkedIn'  },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook'  },
  { value: 'twitter',   label: 'X/Twitter' },
  { value: 'tiktok',    label: 'TikTok'    },
  { value: 'threads',   label: 'Threads'   },
  { value: 'generic',   label: ''          },
];

const FREQUENCIES_BASE: { value: Frequency; label: string }[] = [
  { value: 'daily',    label: '' },
  { value: 'weekly',   label: '' },
  { value: 'biweekly', label: '' },
  { value: 'monthly',  label: '' },
];

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutopilotPage() {
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as Locale) ?? 'es'] ?? T.es;
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';
  const CHANNELS   = CHANNELS_BASE.map((c) => c.value === 'generic' ? { ...c, label: t.channelGeneric } : c);
  const FREQUENCIES = FREQUENCIES_BASE.map((f) => ({ ...f, label: t.frequencies[f.value] ?? f.value }));
  const DAYS = t.days;
  const [rules, setRules]       = useState<AutopilotRule[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);
  const [runMsg, setRunMsg]     = useState<string | null>(null);

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
    const [rulesRes, accountsRes] = await Promise.all([
      fetch('/api/autopilot/rules', { credentials: 'include' }),
      fetch('/api/social/accounts', { credentials: 'include' }),
    ]);
    const { data: rulesData }   = await rulesRes.json()    as { data: AutopilotRule[] };
    const { accounts: accsData } = await accountsRes.json() as { accounts: SocialAccount[] };
    setRules(rulesData ?? []);
    setAccounts(accsData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleAccount(id: string) {
    setFormAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  }

  async function handleCreate(e: React.FormEvent) {
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
          day_of_week:        ['weekly', 'biweekly'].includes(formFreq) ? formDay : null,
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
      setFormError(err instanceof Error ? err.message : t.errorUnknown);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: AutopilotRule) {
    await fetch(`/api/autopilot/rules/${rule.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    fetchData();
  }

  async function handleDelete(ruleId: string) {
    if (!confirm(t.confirmDelete)) return;
    await fetch(`/api/autopilot/rules/${ruleId}`, { method: 'DELETE', credentials: 'include' });
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  }

  async function handleRun(ruleId: string) {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch('/api/autopilot/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_ids: [ruleId] }),
      });
      const data = await res.json() as { processed?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? t.errorRun);
      setRunMsg(t.runSuccess(data.processed ?? 0));
      fetchData();
    } catch (err) {
      setRunMsg(err instanceof Error ? err.message : t.errorUnknown);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ padding: '40px 48px', maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>Autopilot</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            {t.subtitle}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setFormError(null); }}
          style={{
            background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
            padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0,
          }}
        >
          {showForm ? t.cancelBtn : t.newRuleBtn}
        </button>
      </div>

      {runMsg && (
        <div style={{
          background: 'rgba(198,255,75,0.08)', border: '1px solid var(--accent)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: 'var(--accent)',
        }}>
          {runMsg}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 24px', marginBottom: 28,
        }}>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 15, fontWeight: 700, marginBottom: 18 }}>
            {t.formTitle}
          </h2>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t.nameLabel}</label>
            <input
              style={inputStyle} value={formName} required
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t.namePlaceholder}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>{t.channelLabel}</label>
              <select style={inputStyle} value={formChannel} onChange={(e) => setFormChannel(e.target.value as Channel)}>
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t.modelLabel}</label>
              <select style={inputStyle} value={formModel} onChange={(e) => setFormModel(e.target.value as AIModel)}>
                <option value="claude">Claude</option>
                <option value="gpt">GPT-4o</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t.accountsLabel}</label>
            {accounts.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                {t.noAccounts}{' '}
                <a href="settings" style={{ color: 'var(--accent)' }}>{t.connectSettings}</a>
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {accounts.map((acc) => {
                  const active = formAccounts.includes(acc.id);
                  return (
                    <button
                      key={acc.id} type="button" onClick={() => toggleAccount(acc.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        background: active ? 'rgba(198,255,75,0.1)' : 'var(--bg)',
                        color: active ? 'var(--accent)' : 'var(--text)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {acc.platform} · {acc.username}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>{t.freqLabel}</label>
              <select style={inputStyle} value={formFreq} onChange={(e) => setFormFreq(e.target.value as Frequency)}>
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            {['weekly', 'biweekly'].includes(formFreq) && (
              <div>
                <label style={labelStyle}>{t.dayLabel}</label>
                <select style={inputStyle} value={formDay} onChange={(e) => setFormDay(Number(e.target.value))}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>{t.timeLabel}</label>
              <input type="time" style={inputStyle} value={formTime} onChange={(e) => setFormTime(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t.tzLabel}</label>
            <input style={inputStyle} value={formTz} onChange={(e) => setFormTz(e.target.value)} placeholder="America/Mexico_City" />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>{t.hintLabel}</label>
            <textarea
              style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
              value={formHint}
              onChange={(e) => setFormHint(e.target.value)}
              placeholder={t.hintPlaceholder}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit" disabled={saving}
              style={{
                background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                padding: '9px 20px', fontWeight: 600, fontSize: 13,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? t.saving : t.createBtn}
            </button>
            {formError && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{formError}</span>}
          </div>
        </form>
      )}

      {/* Rules list */}
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t.loading}</p>
      ) : rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ color: 'var(--muted)', fontSize: 15 }}>{t.noRules}</p>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            {t.noRulesHint}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map((rule) => (
            <div key={rule.id} style={{
              background: 'var(--surface)', border: `1px solid ${rule.is_active ? 'rgba(198,255,75,0.3)' : 'var(--border)'}`,
              borderRadius: 12, padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, background: 'var(--bg)',
                      border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {rule.channel}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 8px',
                      background: rule.is_active ? 'rgba(198,255,75,0.1)' : 'var(--bg)',
                      color: rule.is_active ? 'var(--accent)' : 'var(--muted)',
                      border: `1px solid ${rule.is_active ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                      {rule.is_active ? t.active : t.paused}
                    </span>
                  </div>
                  <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{rule.name}</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {FREQUENCIES.find((f) => f.value === rule.frequency)?.label} ·{' '}
                    {rule.day_of_week !== null ? `${DAYS[rule.day_of_week]} · ` : ''}
                    {rule.time_of_day} ({rule.timezone}) ·{' '}
                    {rule.ai_model === 'claude' ? 'Claude' : 'GPT-4o'}
                  </p>
                    {rule.next_run_at && (
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        {t.nextRun}{' '}
                        {new Date(rule.next_run_at).toLocaleString(dateLocale, {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => handleRun(rule.id)}
                    disabled={running}
                    title="Ejecutar ahora"
                    style={{
                      background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '7px 12px', fontSize: 13, cursor: running ? 'not-allowed' : 'pointer',
                      color: 'var(--text)', opacity: running ? 0.5 : 1,
                    }}
                  >
                    ▶
                  </button>
                  <button
                    onClick={() => handleToggle(rule)}
                    style={{
                      background: 'none',
                      border: `1px solid ${rule.is_active ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer',
                      color: rule.is_active ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {rule.is_active ? t.pauseBtn : t.activateBtn}
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    style={{
                      background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: '#ff6b6b',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
