'use client';

import { useRef } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import EmptyState from '@/components/ui/EmptyState';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import FormatExample from './FormatExample';
import { toLocale } from '@/lib/i18n';
import type { Recommendation } from '@/types/strategy';
import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

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
  /** Pista opcional para guiar las ideas. Vive aquí, junto a su botón «Buscar
   *  ideas»: en el formulario, su Enter disparaba recomendaciones en vez de
   *  generar y sorprendía. */
  hint?:         string;
  onHintChange?: (hint: string) => void;
  onSearch?:     () => void;
}

export default function RecommendModal({
  open, onClose, lang, recs, loading, error, sourceText, onSelect, onRotate,
  hint = '', onHintChange, onSearch,
}: RecommendModalProps) {
  const t = toLocale(lang) === 'en' ? enT : esT;
  const showEmpty = !loading && recs.length === 0 && !error;
  // El foco entra por la explicación, no por la pista: es opcional y en móvil
  // enfocarla abría el teclado tapando las ideas.
  const introRef = useRef<HTMLParagraphElement>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.recommendBlockTitle}
      subtitle={sourceText || t.recommendBlockSubtitle}
      maxWidth={760}
      padded
      initialFocusRef={introRef}
      footer={
        <Button variant="secondary" icon={<Icon name="refresh" size={16} />} onClick={onRotate} loading={loading}>
          {loading ? t.recommendLoading : t.recommendMoreBtn}
        </Button>
      }
    >
      <p ref={introRef} tabIndex={-1} className="ui-hint" style={{ fontSize: 13, margin: '0 0 16px' }}>{t.recommendModalHint}</p>

      {onSearch && onHintChange && (
        <form
          role="search"
          onSubmit={(e) => { e.preventDefault(); if (!loading) onSearch(); }}
          style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}
        >
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <Field label={t.recommendHintLabel}>
              <Input
                type="text"
                value={hint}
                onChange={(e) => onHintChange(e.target.value.slice(0, 500))}
                placeholder={t.recommendHintPlaceholder}
                maxLength={500}
                enterKeyHint="search"
              />
            </Field>
          </div>
          <Button type="submit" variant="secondary" icon={<Icon name="search" size={16} />} disabled={loading}>
            {t.recommendSearchBtn}
          </Button>
        </form>
      )}

      {error && <div style={{ marginBottom: 12 }}><Notice tone="danger">{error}</Notice></div>}

      {loading && recs.length === 0 ? (
        <p role="status" style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '32px 0', margin: 0 }}>
          {t.recommendLoading}
        </p>
      ) : showEmpty ? (
        <EmptyState compact icon={<Icon name="sparkles" size={28} />} title={t.recommendNoneTitle} hint={t.recommendNoneHint} />
      ) : (
        <div
          aria-busy={loading || undefined}
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14,
            opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto',
          }}
        >
          {recs.map((r, i) => (
            <button
              key={`${r.template_id ?? 'ai'}-${i}`}
              type="button"
              onClick={() => onSelect(r)}
              className="ui-link-card"
              style={{
                textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 14, cursor: 'pointer', color: 'var(--text)',
                display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <FormatExample format={r.content_type} lang={lang} />
                <span
                  className="ui-badge"
                  style={{ ['--badge-color' as string]: 'var(--accent-text)', ['--badge-bg' as string]: 'var(--accent-soft)', flexShrink: 0 }}
                >
                  {r.week_num && r.post_num ? t.weekBadge(r.week_num, r.post_num) : t.aiBadge}
                </span>
              </div>
              <p style={{
                fontSize: 13, lineHeight: 1.4, margin: 0,
                display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {r.topic}
              </p>
              {(r.rationale.goal || r.rationale.rationale_short) && (
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                  {r.rationale.goal || r.rationale.rationale_short}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
