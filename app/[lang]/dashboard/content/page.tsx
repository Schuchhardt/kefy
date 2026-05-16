'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel     = 'linkedin' | 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'threads' | 'generic';
type Status      = 'draft' | 'approved' | 'scheduled' | 'published' | 'archived';
type ContentType = 'post' | 'carousel' | 'reel';

interface ReelScene {
  scene_order:      number;
  title:            string;
  body:             string;
  image_url?:       string;
  duration_seconds: number;
}

interface CarouselSlide {
  slide_order:   number;
  title:         string;
  body:          string;
  image_url?:    string;
}

interface ContentItem {
  id:           string;
  channel:      Channel;
  content_type: ContentType;
  status:       Status;
  title:        string | null;
  body:         string | null;
  image_url:    string | null;
  hashtags:     string[];
  slides:       ReelScene[] | CarouselSlide[] | null;
  video_url:    string | null;
  created_at:   string;
}

// Lazy-load ReelPlayer to avoid SSR issues with Remotion
const ReelPlayer = dynamic(
  () => import('@/components/dashboard/ReelPlayer').then((m) => m.ReelPlayer),
  { ssr: false, loading: () => <p style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando preview...</p> },
);

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNELS: { value: Channel; label: string; icon: string }[] = [
  { value: 'linkedin',  label: 'LinkedIn',  icon: 'in' },
  { value: 'instagram', label: 'Instagram', icon: '◉'  },
  { value: 'facebook',  label: 'Facebook',  icon: 'f'  },
  { value: 'twitter',   label: 'X/Twitter', icon: '𝕏'  },
  { value: 'tiktok',    label: 'TikTok',    icon: '♪'  },
  { value: 'threads',   label: 'Threads',   icon: '@'  },
  { value: 'generic',   label: 'Genérico',  icon: '✦'  },
];

const CONTENT_TYPES: { value: ContentType; label: string; desc: string }[] = [
  { value: 'post',     label: 'Post',     desc: 'Publicación de texto + imagen' },
  { value: 'carousel', label: 'Carrusel', desc: 'Múltiples slides deslizables' },
  { value: 'reel',     label: 'Reel',     desc: 'Video vertical corto' },
];

const CONTENT_TYPE_ICONS: Record<ContentType, string> = {
  post:     '✦',
  carousel: '▦',
  reel:     '▶',
};

const STATUS_LABELS: Record<Status, string> = {
  draft:     'Borrador',
  approved:  'Aprobado',
  scheduled: 'Programado',
  published: 'Publicado',
  archived:  'Archivado',
};

const STATUS_COLORS: Record<Status, string> = {
  draft:     '#888',
  approved:  '#4fc3f7',
  scheduled: '#ffb74d',
  published: 'var(--accent)',
  archived:  '#555',
};

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const [items, setItems]           = useState<ContentItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterChannel, setFilterChannel] = useState<Channel | ''>('');
  const [filterStatus, setFilterStatus]   = useState<Status | ''>('');

  // Generate form
  const [showGenerate, setShowGenerate] = useState(false);
  const [genChannel, setGenChannel]     = useState<Channel>('linkedin');
  const [genType, setGenType]           = useState<ContentType>('post');
  const [genTopic, setGenTopic]         = useState('');
  const [genLang, setGenLang]           = useState<'es' | 'en'>('es');
  const [genSlides, setGenSlides]       = useState(5);
  const [generating, setGenerating]     = useState(false);
  const [genError, setGenError]         = useState<string | null>(null);
  const [genResult, setGenResult]       = useState<string | null>(null);

  // Selected item
  const [selected, setSelected] = useState<ContentItem | null>(null);

  // AI re-generation for selected item
  const [regenTextFeedback, setRegenTextFeedback]   = useState('');
  const [regenImageFeedback, setRegenImageFeedback] = useState('');
  const [regenTextLoading, setRegenTextLoading]     = useState(false);
  const [regenImageLoading, setRegenImageLoading]   = useState(false);
  const [regenTextError, setRegenTextError]         = useState<string | null>(null);
  const [regenImageError, setRegenImageError]       = useState<string | null>(null);
  const [regenTextOk, setRegenTextOk]               = useState(false);
  const [regenImageOk, setRegenImageOk]             = useState(false);

  // Reset regen state when selection changes
  useEffect(() => {
    setRegenTextFeedback('');
    setRegenImageFeedback('');
    setRegenTextError(null);
    setRegenImageError(null);
    setRegenTextOk(false);
    setRegenImageOk(false);
  }, [selected?.id]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (filterChannel) params.set('channel', filterChannel);
    if (filterStatus)  params.set('status', filterStatus);

    try {
      const res = await fetch(`/api/content?${params}`, { credentials: 'include' });
      const { items: data } = await res.json() as { items: ContentItem[] };
      setItems(data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterStatus]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!genTopic.trim()) return;
    setGenerating(true);
    setGenError(null);
    setGenResult(null);

    try {
      let url = '/api/content/generate';
      let payload: Record<string, unknown> = {
        channel:  genChannel,
        topic:    genTopic,
        language: genLang,
        save:     true,
      };

      if (genType === 'carousel') {
        url = '/api/content/carousel';
        payload = { channel: genChannel, topic: genTopic, language: genLang, slide_count: genSlides, generate_images: false, save: true };
      } else if (genType === 'reel') {
        url = '/api/content/reel';
        payload = { channel: genChannel, topic: genTopic, language: genLang, scene_count: genSlides, generate_images: false, save: true };
      }

      const res  = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { body?: string; hook?: string; slides?: unknown[]; scenes?: unknown[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al generar');

      if (genType === 'post')     setGenResult(data.body ?? '');
      if (genType === 'carousel') setGenResult(`Carrusel generado con ${(data.slides ?? []).length} slides ✓`);
      if (genType === 'reel')     setGenResult(`Reel generado con ${(data.scenes ?? []).length} escenas ✓`);

      fetchItems();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este contenido?')) return;
    await fetch(`/api/content/${id}`, { method: 'DELETE', credentials: 'include' });
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  async function handleStatusChange(item: ContentItem, newStatus: Status) {
    const res = await fetch(`/api/content/${item.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const { item: updated } = await res.json() as { item: ContentItem };
      setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i));
      if (selected?.id === updated.id) setSelected(updated);
    }
  }

  async function handleRegenText() {
    if (!selected) return;
    setRegenTextLoading(true);
    setRegenTextError(null);
    setRegenTextOk(false);
    try {
      const existingBody = selected.body?.slice(0, 250) ?? selected.title ?? '';
      const topic = regenTextFeedback.trim()
        ? existingBody
          ? `Reescribe este post aplicando el siguiente feedback: "${regenTextFeedback.trim()}". Post actual: ${existingBody}`
          : regenTextFeedback.trim()
        : existingBody || 'contenido de calidad';
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: selected.channel, topic: topic.slice(0, 480), itemId: selected.id, save: true }),
      });
      const data = await res.json() as { body?: string; hashtags?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al generar');
      const patch = { body: data.body ?? selected.body, hashtags: data.hashtags ?? selected.hashtags };
      setSelected((prev) => prev ? { ...prev, ...patch } : prev);
      setItems((prev) => prev.map((i) => i.id === selected.id ? { ...i, ...patch } : i));
      setRegenTextOk(true);
      setRegenTextFeedback('');
      setTimeout(() => setRegenTextOk(false), 3000);
    } catch (err) {
      setRegenTextError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRegenTextLoading(false);
    }
  }

  async function handleRegenImage() {
    if (!selected) return;
    setRegenImageLoading(true);
    setRegenImageError(null);
    setRegenImageOk(false);
    try {
      const base = selected.body?.slice(0, 350) ?? selected.title ?? 'imagen para post de redes sociales';
      const prompt = regenImageFeedback.trim()
        ? `${base}. Estilo visual: ${regenImageFeedback.trim()}`
        : base;
      const res = await fetch('/api/content/image', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.slice(0, 900), size: '1024x1024', quality: 'medium', itemId: selected.id }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al generar imagen');
      setSelected((prev) => prev ? { ...prev, image_url: data.url ?? prev.image_url } : prev);
      setItems((prev) => prev.map((i) => i.id === selected.id ? { ...i, image_url: data.url ?? i.image_url } : i));
      setRegenImageOk(true);
      setRegenImageFeedback('');
      setTimeout(() => setRegenImageOk(false), 3000);
    } catch (err) {
      setRegenImageError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRegenImageLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '100vh' }}>
      {/* List panel */}
      <div style={{ flex: 1, padding: '40px 32px', overflowY: 'auto', borderRight: '1px solid var(--border)', maxWidth: selected ? 480 : '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700 }}>Contenido</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Gestiona y genera tus piezas de contenido</p>
          </div>
          <button
            onClick={() => { setShowGenerate(!showGenerate); setGenResult(null); setGenError(null); }}
            style={{
              background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
              padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            {showGenerate ? 'Cancelar' : '✦ Generar con IA'}
          </button>
        </div>

        {/* Generate form */}
        {showGenerate && (
          <form onSubmit={handleGenerate} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 28,
          }}>
            <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
              Generar contenido con IA
            </h2>

            {/* Content type selector */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>TIPO</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {CONTENT_TYPES.map((ct) => (
                  <button
                    key={ct.value} type="button" onClick={() => setGenType(ct.value)}
                    title={ct.desc}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: `1px solid ${genType === ct.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: genType === ct.value ? 'rgba(198,255,75,0.1)' : 'var(--bg)',
                      color: genType === ct.value ? 'var(--accent)' : 'var(--text)',
                      fontWeight: genType === ct.value ? 700 : 400,
                    }}
                  >
                    {CONTENT_TYPE_ICONS[ct.value]} {ct.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                CANAL
              </label>
              <select style={inputStyle} value={genChannel} onChange={(e) => setGenChannel(e.target.value as Channel)}>
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>IDIOMA</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['es', 'en'] as const).map((l) => (
                  <button
                    key={l} type="button" onClick={() => setGenLang(l)}
                    style={{
                      padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                      border: `1px solid ${genLang === l ? 'var(--accent)' : 'var(--border)'}`,
                      background: genLang === l ? 'rgba(198,255,75,0.1)' : 'var(--bg)',
                      color: genLang === l ? 'var(--accent)' : 'var(--text)',
                    }}
                  >
                    {l === 'es' ? 'Español' : 'English'}
                  </button>
                ))}
              </div>
            </div>

            {/* Slides / Scenes count — only for carousel and reel */}
            {(genType === 'carousel' || genType === 'reel') && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                  {genType === 'carousel' ? 'CANTIDAD DE SLIDES' : 'CANTIDAD DE ESCENAS'}
                  <span style={{ fontWeight: 400, marginLeft: 8 }}>{genSlides}</span>
                </label>
                <input
                  type="range"
                  min={genType === 'reel' ? 3 : 3}
                  max={genType === 'reel' ? 8 : 10}
                  value={genSlides}
                  onChange={(e) => setGenSlides(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  <span>3</span>
                  <span>{genType === 'reel' ? 8 : 10}</span>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>TEMA</label>
              <textarea
                style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder={
                  genType === 'reel'
                    ? 'Ej: 5 tips para crecer en TikTok en 2026...'
                    : genType === 'carousel'
                    ? 'Ej: beneficios de nuestra herramienta de analytics...'
                    : 'Ej: lanzamiento de nuestro nuevo feature de analytics...'
                }
                required
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="submit" disabled={generating}
                style={{
                  background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                  padding: '9px 20px', fontWeight: 600, fontSize: 13,
                  cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1,
                }}
              >
                {generating ? 'Generando...' : `Generar ${CONTENT_TYPES.find(c => c.value === genType)?.label}`}
              </button>
              {genError && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{genError}</span>}
            </div>
            {genResult && (
              <div style={{ marginTop: 16, background: 'var(--bg)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>RESULTADO</p>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, fontFamily: 'inherit', margin: 0 }}>{genResult}</pre>
              </div>
            )}
          </form>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <select style={{ ...inputStyle, width: 'auto' }} value={filterChannel} onChange={(e) => setFilterChannel(e.target.value as Channel | '')}>
            <option value="">Todos los canales</option>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select style={{ ...inputStyle, width: 'auto' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as Status | '')}>
            <option value="">Todos los estados</option>
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* List */}
        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando...</p>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ color: 'var(--muted)', fontSize: 15 }}>No hay contenido todavía</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
              Usa el botón &ldquo;Generar con IA&rdquo; para crear tu primera pieza
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelected(selected?.id === item.id ? null : item)}
                style={{
                  background: 'var(--surface)', border: `1px solid ${selected?.id === item.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {CHANNELS.find((c) => c.value === item.channel)?.icon} {item.channel}
                  </span>
                  {item.content_type && item.content_type !== 'post' && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, background: 'rgba(198,255,75,0.06)',
                      border: '1px solid rgba(198,255,75,0.25)', borderRadius: 4, padding: '2px 7px',
                      color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {CONTENT_TYPE_ICONS[item.content_type as ContentType]} {item.content_type}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
                    background: `${STATUS_COLORS[item.status]}22`,
                    color: STATUS_COLORS[item.status],
                  }}>
                    {STATUS_LABELS[item.status]}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                    {new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                <p style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                  {item.body ?? item.title ?? '(sin texto)'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ width: 400, padding: '40px 28px', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700 }}>Detalle</h2>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20 }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>ESTADO</p>
            <select
              style={inputStyle}
              value={selected.status}
              onChange={(e) => handleStatusChange(selected, e.target.value as Status)}
            >
              {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {selected.title && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>TÍTULO</p>
              <p style={{ fontSize: 14 }}>{selected.title}</p>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>CONTENIDO</p>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 14, whiteSpace: 'pre-wrap', maxHeight: 340, overflowY: 'auto' }}>
              {selected.body ?? '(sin texto)'}
            </div>
          </div>

          {selected.hashtags.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>HASHTAGS</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selected.hashtags.map((h) => (
                  <span key={h} style={{ fontSize: 13, color: 'var(--accent)', background: 'rgba(198,255,75,0.08)', borderRadius: 4, padding: '2px 8px' }}>
                    {h.startsWith('#') ? h : `#${h}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selected.image_url && selected.content_type !== 'reel' && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>IMAGEN</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.image_url} alt="Content" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
          )}

          {/* Carousel slides */}
          {selected.content_type === 'carousel' && Array.isArray(selected.slides) && selected.slides.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>SLIDES ({selected.slides.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(selected.slides as CarouselSlide[]).map((slide) => (
                  <div key={slide.slide_order} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>#{slide.slide_order}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{slide.title}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{slide.body}</p>
                    {slide.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slide.image_url} alt={`Slide ${slide.slide_order}`}
                        style={{ width: '100%', borderRadius: 6, marginTop: 8, border: '1px solid var(--border)' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reel preview with Remotion Player */}
          {selected.content_type === 'reel' && Array.isArray(selected.slides) && selected.slides.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10 }}>PREVIEW REEL</p>
              <ReelPlayer scenes={selected.slides as ReelScene[]} height={400} />
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>ESCENAS ({(selected.slides as ReelScene[]).length})</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(selected.slides as ReelScene[]).map((scene) => (
                    <div key={scene.scene_order} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>{scene.scene_order}</span>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>{scene.title}</p>
                        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{scene.body}</p>
                        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0', opacity: 0.6 }}>{scene.duration_seconds}s</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── IA: Regenerar texto ───────────────────────────────── */}
          {(selected.content_type === 'post' || selected.content_type === 'carousel') && (
            <div style={{ marginBottom: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 8 }}>
                ✦ REGENERAR TEXTO CON IA
              </p>
              <textarea
                placeholder="Feedback opcional: ej. 'más corto y directo', 'añade emojis', 'tono más profesional'..."
                value={regenTextFeedback}
                onChange={(e) => setRegenTextFeedback(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              />
              {regenTextError && (
                <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 6 }}>{regenTextError}</p>
              )}
              {regenTextOk && (
                <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>✓ Texto actualizado</p>
              )}
              <button
                onClick={handleRegenText}
                disabled={regenTextLoading}
                style={{
                  width: '100%', marginTop: 8, background: 'rgba(198,255,75,0.08)',
                  border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 8,
                  padding: '9px 0', fontSize: 13, fontWeight: 600,
                  cursor: regenTextLoading ? 'not-allowed' : 'pointer',
                  opacity: regenTextLoading ? 0.6 : 1,
                }}
              >
                {regenTextLoading ? 'Generando...' : '✦ Regenerar texto'}
              </button>
            </div>
          )}

          {/* ── IA: Generar / Regenerar imagen ───────────────────────── */}
          {selected.content_type !== 'reel' && (
            <div style={{ marginBottom: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 8 }}>
                {selected.image_url ? '🖼 REGENERAR IMAGEN CON IA' : '🖼 GENERAR IMAGEN CON IA'}
              </p>
              <textarea
                placeholder="Feedback visual opcional: ej. 'fondo oscuro minimalista', 'colores vibrantes', 'estilo fotográfico'..."
                value={regenImageFeedback}
                onChange={(e) => setRegenImageFeedback(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              />
              {regenImageError && (
                <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 6 }}>{regenImageError}</p>
              )}
              {regenImageOk && (
                <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>✓ Imagen generada</p>
              )}
              <button
                onClick={handleRegenImage}
                disabled={regenImageLoading}
                style={{
                  width: '100%', marginTop: 8, background: 'rgba(198,255,75,0.05)',
                  border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 8,
                  padding: '9px 0', fontSize: 13, fontWeight: 600,
                  cursor: regenImageLoading ? 'not-allowed' : 'pointer',
                  opacity: regenImageLoading ? 0.6 : 1,
                }}
              >
                {regenImageLoading ? 'Generando imagen...' : (selected.image_url ? '🖼 Regenerar imagen' : '🖼 Generar imagen')}
              </button>
            </div>
          )}

          <button
            onClick={() => handleDelete(selected.id)}
            style={{
              width: '100%', background: 'none', border: '1px solid #ff6b6b',
              color: '#ff6b6b', borderRadius: 8, padding: '9px 0',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8,
            }}
          >
            Eliminar contenido
          </button>
        </div>
      )}
    </div>
  );
}
