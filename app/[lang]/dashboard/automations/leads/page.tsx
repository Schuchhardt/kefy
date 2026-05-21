'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import esT from '@/locales/es/dashboard/leads';
import enT from '@/locales/en/dashboard/leads';

// ─── Types ───────────────────────────────────────────────────────────────────

type Stage = 'frio' | 'tibio' | 'caliente' | 'contactado' | 'convertido';

interface Lead {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  channel: string;
  stage: Stage;
  score: number;
  notes: string | null;
  tags: string[];
  contacted: boolean;
  converted: boolean;
  first_interaction_at: string | null;
  last_interaction_at: string | null;
  created_at: string;
}

const STAGES: Stage[] = ['frio', 'tibio', 'caliente', 'contactado', 'convertido'];
const NEXT_STAGE: Record<Stage, Stage | null> = {
  frio: 'tibio', tibio: 'caliente', caliente: 'contactado',
  contactado: 'convertido', convertido: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(date: string | null, lang: string): string {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return lang === 'en' ? 'just now' : 'ahora';
  if (m < 60) return lang === 'en' ? `${m}m ago` : `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'en' ? `${h}h ago` : `hace ${h}h`;
  const d = Math.floor(h / 24);
  return lang === 'en' ? `${d}d ago` : `hace ${d}d`;
}

function scoreColor(score: number): string {
  if (score >= 50) return '#FF4B4B';
  if (score >= 20) return '#FF9B4B';
  return '#4B9BFF';
}

const channelEmoji: Record<string, string> = {
  instagram: '📸', facebook: '👤', twitter: '🐦', x: '🐦',
  tiktok: '🎵', youtube: '▶️', linkedin: '💼',
  google_business: '🗺️', yelp: '⭐', tripadvisor: '🧳',
};

// ─── Modal: Add Manual Lead ───────────────────────────────────────────────────

function AddLeadModal({
  t, lang, onAdd, onClose,
}: {
  t: typeof esT;
  lang: string;
  onAdd: (lead: Lead) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState('');
  const [channel, setChannel]   = useState('instagram');
  const [stage, setStage]       = useState<Stage>('frio');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/automations/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), channel, stage }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { lead } = await res.json();
      onAdd(lead);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t.errorCreate);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, width: 360, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t.addManualTitle}</h3>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            placeholder={t.addManualUsername}
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', color: 'var(--text)',
              fontSize: 14, outline: 'none',
            }}
          />
          <select
            value={channel} onChange={e => setChannel(e.target.value)}
            style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 14,
            }}
          >
            {Object.keys(channelEmoji).map(c => (
              <option key={c} value={c}>{channelEmoji[c]} {c}</option>
            ))}
          </select>
          <select
            value={stage} onChange={e => setStage(e.target.value as Stage)}
            style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 14,
            }}
          >
            {STAGES.map(s => <option key={s} value={s}>{t.stages[s]}</option>)}
          </select>
          {err && <p style={{ color: '#ff4b4b', fontSize: 12, margin: 0 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button" onClick={onClose}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 13,
              }}
            >{t.addManualCancel}</button>
            <button
              type="submit" disabled={loading || !username.trim()}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#000', cursor: loading ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >{loading ? '...' : t.addManualSave}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Lead Card ───────────────────────────────────────────────────────────────

function LeadCard({
  lead, t, lang, onSelect, onMoveNext,
}: {
  lead: Lead;
  t: typeof esT;
  lang: string;
  onSelect: (l: Lead) => void;
  onMoveNext: (l: Lead) => void;
}) {
  const nextStage = NEXT_STAGE[lead.stage];
  return (
    <div
      onClick={() => onSelect(lead)}
      style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '12px 14px', cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 1px var(--accent)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, overflow: 'hidden', flexShrink: 0,
        }}>
          {lead.avatar_url
            ? <img src={lead.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : lead.username[0]?.toUpperCase() ?? '?'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {lead.display_name || lead.username}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>@{lead.username}</div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
          background: scoreColor(lead.score) + '20', color: scoreColor(lead.score),
        }}>{lead.score}</span>
      </div>
      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {channelEmoji[lead.channel] ?? '🌐'} {lead.channel} · {timeAgo(lead.last_interaction_at, lang)}
        </span>
        {nextStage && (
          <button
            onClick={e => { e.stopPropagation(); onMoveNext(lead); }}
            style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--muted)', cursor: 'pointer',
            }}
          >→ {t.stages[nextStage]}</button>
        )}
      </div>
    </div>
  );
}

// ─── Lead Drawer ─────────────────────────────────────────────────────────────

function LeadDrawer({
  lead, t, lang, onClose, onUpdate, onDelete,
}: {
  lead: Lead;
  t: typeof esT;
  lang: string;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Lead>) => void;
  onDelete: (id: string) => void;
}) {
  const [notes, setNotes]       = useState(lead.notes ?? '');
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [tag, setTag]           = useState('');
  const [tags, setTags]         = useState<string[]>(lead.tags ?? []);

  async function patchLead(updates: Record<string, unknown>) {
    const res = await fetch(`/api/automations/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const { lead: updated } = await res.json();
      onUpdate(lead.id, updated);
    }
  }

  async function saveNotes() {
    setNoteState('saving');
    await patchLead({ notes });
    setNoteState('saved');
    setTimeout(() => setNoteState('idle'), 1500);
  }

  async function addTag() {
    if (!tag.trim() || tags.includes(tag.trim())) { setTag(''); return; }
    const newTags = [...tags, tag.trim()];
    setTags(newTags);
    setTag('');
    await patchLead({ tags: newTags });
  }

  async function removeTag(t2: string) {
    const newTags = tags.filter(x => x !== t2);
    setTags(newTags);
    await patchLead({ tags: newTags });
  }

  async function handleDelete() {
    if (!confirm(t.confirmDelete)) return;
    await fetch(`/api/automations/leads/${lead.id}`, { method: 'DELETE' });
    onDelete(lead.id);
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      zIndex: 50, overflow: 'auto', padding: 24,
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16, background: 'transparent',
          border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20,
        }}
      >×</button>

      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', background: 'var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, overflow: 'hidden',
        }}>
          {lead.avatar_url
            ? <img src={lead.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : lead.username[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{lead.display_name || lead.username}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            {channelEmoji[lead.channel] ?? '🌐'} @{lead.username}
          </div>
        </div>
      </div>

      {/* Stage + Score */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{
          flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 20 }}>{t.stageIcons[lead.stage]}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.stages[lead.stage]}</div>
        </div>
        <div style={{
          flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor(lead.score) }}>{lead.score}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.score}</div>
        </div>
      </div>

      {/* Move stage buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {STAGES.filter(s => s !== lead.stage).map(s => (
          <button
            key={s}
            onClick={() => patchLead({ stage: s })}
            style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--muted)', cursor: 'pointer',
            }}
          >{t.stageIcons[s]} {t.stages[s]}</button>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!lead.contacted && (
          <button
            onClick={() => patchLead({ contacted: true })}
            style={{
              flex: 1, fontSize: 12, padding: '8px', borderRadius: 8,
              border: '1px solid var(--accent)', background: 'var(--accent)20',
              color: 'var(--accent)', cursor: 'pointer',
            }}
          >📞 {t.markContacted}</button>
        )}
        {!lead.converted && (
          <button
            onClick={() => patchLead({ converted: true, stage: 'convertido' })}
            style={{
              flex: 1, fontSize: 12, padding: '8px', borderRadius: 8,
              border: '1px solid #4bff9b', background: '#4bff9b20',
              color: '#4bff9b', cursor: 'pointer',
            }}
          >✅ {t.markConverted}</button>
        )}
      </div>

      {/* Tags */}
      <div>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          {t.tagsLabel}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {tags.map(tg => (
            <span key={tg} style={{
              fontSize: 12, padding: '3px 8px', borderRadius: 20,
              background: 'var(--accent)20', color: 'var(--accent)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {tg}
              <button
                onClick={() => removeTag(tg)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 12, padding: 0 }}
              >×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={tag} onChange={e => setTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
            placeholder={t.tagsPlaceholder}
            style={{
              flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 12, outline: 'none',
            }}
          />
          <button
            onClick={addTag}
            style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12,
            }}
          >+</button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          {t.notesLabel}
        </label>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder={t.notesPlaceholder}
          rows={4}
          style={{
            width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13,
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={saveNotes} disabled={noteState === 'saving'}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: noteState === 'saved' ? '#4bff9b20' : 'transparent',
              color: noteState === 'saved' ? '#4bff9b' : 'var(--text)', cursor: 'pointer',
            }}
          >{noteState === 'saving' ? t.savingNotes : noteState === 'saved' ? t.notesSaved : '💾'}</button>
        </div>
      </div>

      {/* Meta */}
      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.8 }}>
        {lead.first_interaction_at && <div>Primera interacción: {new Date(lead.first_interaction_at).toLocaleDateString(lang)}</div>}
        {lead.last_interaction_at  && <div>Última: {timeAgo(lead.last_interaction_at, lang)}</div>}
        <div>Creado: {new Date(lead.created_at).toLocaleDateString(lang)}</div>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        style={{
          marginTop: 'auto', fontSize: 12, padding: '8px', borderRadius: 8,
          border: '1px solid #ff4b4b40', background: 'transparent',
          color: '#ff4b4b', cursor: 'pointer',
        }}
      >{t.deleteBtn}</button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const params = useParams();
  const lang = (params.lang as string) || 'es';
  const t = lang === 'en' ? enT : esT;

  const [leads, setLeads]             = useState<Lead[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [view, setView]               = useState<'kanban' | 'list'>('kanban');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch]           = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterStage, setFilterStage] = useState('');

  const loadLeads = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filterStage)   params.set('stage', filterStage);
      if (filterChannel) params.set('channel', filterChannel);
      if (search)        params.set('search', search);
      const res = await fetch(`/api/automations/leads?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const { leads: data } = await res.json();
      setLeads(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [filterStage, filterChannel, search, t.errorLoad]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  function updateLead(id: string, updates: Partial<Lead>) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    if (selectedLead?.id === id) setSelectedLead(prev => prev ? { ...prev, ...updates } : null);
  }

  async function moveLead(lead: Lead, newStage: Stage) {
    const res = await fetch(`/api/automations/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    });
    if (res.ok) updateLead(lead.id, { stage: newStage });
  }

  function moveToNext(lead: Lead) {
    const next = NEXT_STAGE[lead.stage];
    if (next) moveLead(lead, next);
  }

  function deleteLead(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id));
  }

  // Stats
  const hotCount       = leads.filter(l => l.stage === 'caliente').length;
  const convertedCount = leads.filter(l => l.converted).length;
  const avgScore       = leads.length ? Math.round(leads.reduce((a, l) => a + l.score, 0) / leads.length) : 0;

  // Unique channels
  const channels = Array.from(new Set(leads.map(l => l.channel))).sort();

  return (
    <div style={{ padding: '32px 48px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', fontFamily: 'Syne, sans-serif' }}>{t.title}</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '9px 18px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: '#000', fontWeight: 600,
            fontSize: 13, cursor: 'pointer',
          }}
        >{t.addManualLead}</button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[
          { label: t.totalLeads,  value: leads.length },
          { label: t.hotLeads,    value: hotCount },
          { label: t.converted,   value: convertedCount },
          { label: t.avgScore,    value: avgScore },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 20px', flex: 1, textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder={t.searchPlaceholder}
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '7px 12px', color: 'var(--text)', fontSize: 13,
            outline: 'none', width: 200,
          }}
        />
        <select
          value={filterStage} onChange={e => setFilterStage(e.target.value)}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '7px 12px', color: 'var(--text)', fontSize: 13,
          }}
        >
          <option value="">{t.filterAll}</option>
          {STAGES.map(s => <option key={s} value={s}>{t.stageIcons[s]} {t.stages[s]}</option>)}
        </select>
        {channels.length > 0 && (
          <select
            value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '7px 12px', color: 'var(--text)', fontSize: 13,
            }}
          >
            <option value="">{t.filterChannel}</option>
            {channels.map(c => <option key={c} value={c}>{channelEmoji[c] ?? '🌐'} {c}</option>)}
          </select>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['kanban', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13,
                border: '1px solid var(--border)',
                background: view === v ? 'var(--accent)' : 'transparent',
                color: view === v ? '#000' : 'var(--muted)',
                fontWeight: view === v ? 600 : 400, cursor: 'pointer',
              }}
            >{v === 'kanban' ? t.viewKanban : t.viewList}</button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: '#ff4b4b', background: '#ff4b4b20', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60 }}>⏳</div>
      )}

      {/* KANBAN VIEW */}
      {!loading && view === 'kanban' && (
        <div style={{
          display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12,
          alignItems: 'flex-start',
        }}>
          {STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage);
            return (
              <div key={stage} style={{
                flex: '0 0 240px', minWidth: 240,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '12px 10px',
              }}>
                {/* Column header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 12, padding: '0 4px',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {t.stageIcons[stage]} {t.stages[stage]}
                  </span>
                  <span style={{
                    fontSize: 11, background: 'var(--border)', borderRadius: 20,
                    padding: '1px 7px', color: 'var(--muted)',
                  }}>{stageLeads.length}</span>
                </div>
                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stageLeads.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
                      {t.noLeadsStage}
                    </p>
                  ) : stageLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      t={t}
                      lang={lang}
                      onSelect={setSelectedLead}
                      onMoveNext={moveToNext}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {!loading && view === 'list' && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Usuario', 'Canal', 'Etapa', 'Score', 'Última interacción', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 12,
                    color: 'var(--muted)', fontWeight: 600,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40, fontSize: 13 }}>
                    {t.noLeads}
                  </td>
                </tr>
              ) : leads.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  style={{
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{lead.display_name || lead.username}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>@{lead.username}</div>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>
                    {channelEmoji[lead.channel] ?? '🌐'} {lead.channel}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>
                    {t.stageIcons[lead.stage]} {t.stages[lead.stage]}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                      background: scoreColor(lead.score) + '20', color: scoreColor(lead.score),
                    }}>{lead.score}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)' }}>
                    {timeAgo(lead.last_interaction_at, lang)}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {NEXT_STAGE[lead.stage] && (
                      <button
                        onClick={e => { e.stopPropagation(); moveToNext(lead); }}
                        style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--muted)', cursor: 'pointer',
                        }}
                      >→ {t.stages[NEXT_STAGE[lead.stage]!]}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No leads empty state */}
      {!loading && leads.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t.noLeads}</div>
          <div style={{ fontSize: 13 }}>{t.noLeadsHint}</div>
        </div>
      )}

      {/* Lead Drawer */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          t={t}
          lang={lang}
          onClose={() => setSelectedLead(null)}
          onUpdate={updateLead}
          onDelete={deleteLead}
        />
      )}

      {/* Add Lead Modal */}
      {showAddModal && (
        <AddLeadModal
          t={t}
          lang={lang}
          onAdd={lead => { setLeads(prev => [lead, ...prev]); setShowAddModal(false); }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
