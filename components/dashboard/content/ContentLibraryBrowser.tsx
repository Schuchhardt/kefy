'use client';

import { useEffect, useState, useCallback } from 'react';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import EmptyState from '@/components/ui/EmptyState';
import Notice from '@/components/ui/Notice';
import Icon, { type IconName } from '@/components/ui/icons';
import { toLocale } from '@/lib/i18n';
import type { ContentType } from '@/types/content';
import type { LibraryItemWithIndustry } from '@/types/content-library';
import styles from './ContentLibraryBrowser.module.css';

import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

const TYPE_ICON: Record<ContentType, IconName> = {
  post:     'post',
  carousel: 'carousel',
  reel:     'video',
  story:    'story',
};

const TYPE_FILTERS = ['', 'post', 'carousel', 'reel', 'story'] as const;

// Degradados de relleno para las ideas sin imagen (placeholders, no estados).
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
  const locale = toLocale(lang);
  const t = locale === 'en' ? enT : esT;
  const common = locale === 'en' ? enCommon : esCommon;

  const [items, setItems]           = useState<LibraryItemWithIndustry[]>([]);
  // Empieza en `true`: fetchItems recién marca `true` dentro de un useEffect
  // posterior al montaje — con `false` de partida, el primer render mostraba
  // "sin resultados" antes de que el fetch siquiera empezara.
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState(false);
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
        name: locale === 'en' ? ind.name_en : ind.name_es,
        icon: ind.icon,
      })));
    } catch { /* non-critical */ }
  }, [locale]);

  const fetchItems = useCallback(async (newOffset: number, append: boolean) => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({
        limit:    '12',
        offset:   String(newOffset),
        language: locale,
      });
      if (filterIndustry) params.set('industry_id', filterIndustry);
      if (filterType)     params.set('content_type', filterType);

      const res = await fetch(`/api/content-library?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json() as { items?: LibraryItemWithIndustry[]; total?: number };
      // Una respuesta sin `items` (proxy, versión vieja del API) no debe
      // tumbar la pantalla entera: se trata como vacía.
      const page = Array.isArray(data.items) ? data.items : [];
      setItems((prev) => append ? [...prev, ...page] : page);
      setTotal(typeof data.total === 'number' ? data.total : page.length);
    } catch {
      if (!append) setItems([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [locale, filterIndustry, filterType]);

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
  const filtered = !!filterIndustry || !!filterType;

  return (
    <div>
      {/* Filters */}
      <div className={styles.filters}>
        <Select
          aria-label={t.libraryIndustryLabel}
          value={filterIndustry}
          onChange={(e) => setFilterIndustry(e.target.value)}
          className={styles.industry}
        >
          <option value="">{t.libraryAllIndustries}</option>
          {industries.map((ind) => (
            <option key={ind.id} value={ind.id}>{ind.icon} {ind.name}</option>
          ))}
        </Select>

        <div className="ui-segmented" role="group" aria-label={t.libraryTypeLabel}>
          {TYPE_FILTERS.map((ct) => (
            <button
              key={ct || 'all'}
              type="button"
              aria-pressed={filterType === ct}
              onClick={() => setFilterType(ct)}
              className={styles.typeBtn}
            >
              {ct === '' ? t.libraryAllTypes : (
                <>
                  <Icon name={TYPE_ICON[ct]} size={14} />
                  {t.typeLabels[ct]}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="danger">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>{t.libraryLoadError}</span>
              <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={() => fetchItems(0, false)}>
                {common.actions.retry}
              </Button>
            </div>
          </Notice>
        </div>
      )}

      {/* Grid */}
      {loading && items.length === 0 ? (
        <div className={styles.grid} aria-busy="true" aria-label={t.libraryLoading}>
          {[...Array(6)].map((_, i) => (
            <SkeletonBlock key={i} height={160} borderRadius={10} />
          ))}
        </div>
      ) : items.length === 0 ? (
        loadError ? null : (
          <EmptyState
            compact
            icon={<Icon name="library" size={28} />}
            title={t.libraryEmpty}
            action={filtered ? (
              <Button size="sm" variant="secondary" onClick={() => { setFilterIndustry(''); setFilterType(''); }}>
                {t.clearFilters}
              </Button>
            ) : undefined}
          />
        )
      ) : (
        <>
          <div className={styles.grid} aria-busy={loading || undefined} style={{ opacity: loading ? 0.5 : 1 }}>
            {items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className={`${styles.card} ui-link-card`}
              >
                <div
                  className={styles.thumb}
                  style={{
                    backgroundImage: item.image_url
                      ? `url(${JSON.stringify(item.image_url)})`
                      : PLACEHOLDER_GRADIENTS[idx % PLACEHOLDER_GRADIENTS.length],
                  }}
                >
                  <span className={styles.overlayBadge} style={{ top: 8, right: 8 }}>
                    <Icon name={TYPE_ICON[item.content_type]} size={12} />
                    {t.typeLabels[item.content_type]}
                  </span>
                  <span className={styles.overlayBadge} style={{ bottom: 8, left: 8, fontWeight: 500, fontSize: 11 }}>
                    <span aria-hidden="true">{item.industry_icon}</span> {item.industry_name}
                  </span>
                </div>

                <div className={styles.body}>
                  <p className={styles.title}>{item.title}</p>
                  <p className={styles.excerpt}>{item.body}</p>
                  <span className={styles.use}>
                    {t.libraryUseBtn}
                    <Icon name="arrow-right" size={14} />
                  </span>
                </div>
              </button>
            ))}
          </div>

          {hasMore && (
            <div className={styles.more}>
              <Button variant="secondary" loading={loading} onClick={handleLoadMore}>
                {loading ? t.libraryLoading : t.libraryLoadMore}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
