'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ContentType } from '@/types/content';
import type { LibraryItemWithIndustry } from '@/types/content-library';

import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

const T = { es: esT, en: enT } as const;

const CONTENT_TYPE_ICONS: Record<ContentType, string> = {
  post:     '✦',
  carousel: '▦',
  reel:     '▶',
  story:    '◎',
};

const CONTENT_TYPE_LABELS: Record<string, Record<ContentType, string>> = {
  es: { post: 'Post', carousel: 'Carrusel', reel: 'Reel', story: 'Story' },
  en: { post: 'Post', carousel: 'Carousel', reel: 'Reel', story: 'Story' },
};

const PLACEHOLDER_GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
];

interface Industry {
  id:   string;
  slug: string;
  name: string;
  icon: string;
}

interface ContentLibraryBrowserProps {
  lang:     'es' | 'en';
  onSelect: (item: LibraryItemWithIndustry) => void;
}

export default function ContentLibraryBrowser({ lang, onSelect }: ContentLibraryBrowserProps) {
  const t = T[lang];
  const [items, setItems]           = useState<LibraryItemWithIndustry[]>([]);
  const [loading, setLoading]       = useState(false);
  const [total, setTotal]           = useState(0);
  const [offset, setOffset]         = useState(0);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [filterIndustry, setFilterIndustry] = useState('');
  const [filterType, setFilterType] = useState<ContentType | ''>('');

  const fetchIndustries = useCallback(async () => {
    try {
      const res = await fetch('/api/strategies', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { industries?: Array<{ id: string; slug: string; name_es: string; name_en: string; icon: string }> };
      setIndustries((data.industries ?? []).map((ind) => ({
        id:   ind.id,
        slug: ind.slug,
        name: lang === 'en' ? ind.name_en : ind.name_es,
        icon: ind.icon,
      })));
    } catch { /* non-critical */ }
  }, [lang]);

  const fetchItems = useCallback(async (newOffset: number, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit:    '12',
        offset:   String(newOffset),
        language: lang,
      });
      if (filterIndustry) params.set('industry_id', filterIndustry);
      if (filterType)     params.set('content_type', filterType);

      const res = await fetch(`/api/content-library?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json() as { items: LibraryItemWithIndustry[]; total: number };
      setItems((prev) => append ? [...prev, ...data.items] : data.items);
      setTotal(data.total);
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [lang, filterIndustry, filterType]);

  useEffect(() => {
    fetchIndustries();
  }, [fetchIndustries]);

  useEffect(() => {
    setOffset(0);
    fetchItems(0, false);
  }, [filterIndustry, filterType, fetchItems]);

  function handleLoadMore() {
    const newOffset = offset + 12;
    setOffset(newOffset);
    fetchItems(newOffset, true);
  }

  const hasMore = items.length < total;

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterIndustry}
          onChange={(e) => setFilterIndustry(e.target.value)}
          style={{
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none',
          }}
        >
          <option value="">{t.libraryAllIndustries}</option>
          {industries.map((ind) => (
            <option key={ind.id} value={ind.id}>{ind.icon} {ind.name}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 6 }}>
          {(['', 'post', 'carousel', 'reel', 'story'] as const).map((ct) => (
            <button
              key={ct || 'all'}
              type="button"
              onClick={() => setFilterType(ct as ContentType | '')}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${filterType === ct ? 'var(--accent)' : 'var(--border)'}`,
                background: filterType === ct ? 'rgba(198,255,75,0.1)' : 'var(--bg)',
                color: filterType === ct ? 'var(--accent)' : 'var(--text)',
              }}
            >
              {ct === '' ? (t.libraryAllTypes) : `${CONTENT_TYPE_ICONS[ct]} ${CONTENT_TYPE_LABELS[lang][ct]}`}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading && items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
          {t.libraryLoading}
        </p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
          {t.libraryEmpty}
        </p>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 14,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                style={{
                  textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden', cursor: 'pointer', color: 'var(--text)',
                  display: 'flex', flexDirection: 'column', transition: 'border-color 0.12s',
                  padding: 0,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
              >
                {/* Thumbnail */}
                <div
                  style={{
                    width: '100%', height: 140, position: 'relative',
                    background: item.image_url
                      ? `url(${item.image_url}) center/cover`
                      : PLACEHOLDER_GRADIENTS[idx % PLACEHOLDER_GRADIENTS.length],
                  }}
                >
                  {/* Content type badge */}
                  <span style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'rgba(0,0,0,0.65)', color: '#fff',
                    fontSize: 11, fontWeight: 700, padding: '3px 8px',
                    borderRadius: 6, backdropFilter: 'blur(4px)',
                  }}>
                    {CONTENT_TYPE_ICONS[item.content_type]} {CONTENT_TYPE_LABELS[lang][item.content_type]}
                  </span>
                  {/* Industry badge */}
                  <span style={{
                    position: 'absolute', bottom: 8, left: 8,
                    background: 'rgba(0,0,0,0.55)', color: '#fff',
                    fontSize: 10, padding: '2px 7px', borderRadius: 6,
                    backdropFilter: 'blur(4px)',
                  }}>
                    {item.industry_icon} {item.industry_name}
                  </span>
                </div>

                {/* Text preview */}
                <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.3,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {item.title}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {item.body}
                  </p>
                  <span style={{
                    marginTop: 'auto', paddingTop: 8,
                    fontSize: 11.5, fontWeight: 700, color: 'var(--accent)',
                  }}>
                    {t.libraryUseBtn} →
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loading}
                style={{
                  background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '9px 20px', fontWeight: 600, fontSize: 13,
                  cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? t.libraryLoading : t.libraryLoadMore}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
