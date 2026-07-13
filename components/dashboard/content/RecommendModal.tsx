'use client';

import Modal from './Modal';
import FormatExample from './FormatExample';
import type { Recommendation } from '@/types/strategy';
import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

const T = { es: esT, en: enT } as const;

interface RecommendModalProps {
  open:       boolean;
  onClose:    () => void;
  lang:       'es' | 'en';
  recs:       Recommendation[];
  loading:    boolean;
  error:      string | null;
  sourceText: string;
  /** Picking a card generates that idea immediately — no extra click. */
  onSelect:   (r: Recommendation) => void;
  onRotate:   () => void;
}

export default function RecommendModal({
  open, onClose, lang, recs, loading, error, sourceText, onSelect, onRotate,
}: RecommendModalProps) {
  const t = T[lang];
  const showEmpty = !loading && recs.length === 0 && !error;

  return (
    <Modal open={open} onClose={onClose} title={t.recommendBlockTitle} subtitle={sourceText || t.recommendBlockSubtitle} maxWidth={760}>
      <div style={{ padding: '16px 24px 24px' }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 16px' }}>
          {t.recommendModalHint}
        </p>

        {error && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {loading && recs.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>{t.recommendLoading}</p>
        ) : showEmpty ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>{t.recommendNoneTitle}</p>
        ) : (
          <div
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14,
              opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto',
            }}
          >
            {recs.map((r, i) => (
              <button
                key={`${r.template_id ?? 'ai'}-${i}`}
                type="button"
                onClick={() => onSelect(r)}
                style={{
                  textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 14, cursor: 'pointer', color: 'var(--text)',
                  display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <FormatExample format={r.content_type} lang={lang} />
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                    color: 'var(--accent)', background: 'rgba(198,255,75,0.12)',
                    padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                  }}>
                    {r.week_num && r.post_num ? t.weekBadge(r.week_num, r.post_num) : 'IA'}
                  </span>
                </div>
                <p style={{
                  fontSize: 13, lineHeight: 1.4, margin: 0,
                  display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {r.topic}
                </p>
                {(r.rationale.goal || r.rationale.rationale_short) && (
                  <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>
                    {r.rationale.goal || r.rationale.rationale_short}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
          <button
            type="button"
            onClick={onRotate}
            disabled={loading}
            style={{
              background: 'transparent', color: 'var(--accent)',
              border: '1px solid rgba(198,255,75,0.4)', borderRadius: 8,
              padding: '8px 16px', fontSize: 12.5, fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? t.recommendLoading : t.recommendMoreBtn}
          </button>
        </div>
      </div>
    </Modal>
  );
}
