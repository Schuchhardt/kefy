'use client';

// ─── Lista editable de chips ─────────────────────────────────────────────────
// Ubicaciones, competidores, diferenciadores… Sustituye a las tres copias de
// ArrayChips (wizard, identidad, mercado). Las sugerencias con IA se piden con
// un botón explícito que dice cuánto cuestan: antes el wizard las pedía solo
// al entrar en cada paso y gastaba créditos sin avisar.

import { useId, useState } from 'react';
import Icon from '@/components/ui/icons';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

export interface ArrayChipsProps {
  value: string[];
  onChange: (next: string[]) => void;
  lang: string;
  /** Nombre accesible del campo de texto (si no hay <label> asociado). */
  label?: string;
  id?: string;
  placeholder?: string;
  max?: number;
  suggestions?: string[];
  loadingSuggestions?: boolean;
  /** Si se da, muestra el botón «Sugerir con IA». */
  onRequestSuggestions?: () => void;
  'aria-describedby'?: string;
}

export default function ArrayChips({
  value, onChange, lang, label, id, placeholder, max = 10,
  suggestions, loadingSuggestions, onRequestSuggestions, ...rest
}: ArrayChipsProps) {
  const t = lang === 'en' ? enCommon : esCommon;
  const autoId = useId();
  const inputId = id ?? `chips${autoId.replace(/:/g, '')}`;
  const [draft, setDraft] = useState('');
  const full = value.length >= max;

  function add(item: string) {
    const trimmed = item.trim();
    if (!trimmed || value.includes(trimmed) || full) return;
    onChange([...value, trimmed]);
    setDraft('');
  }

  const pending = (suggestions ?? []).filter((s) => !value.includes(s));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.length > 0 && (
        <ul className="ui-chips" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {value.map((v) => (
            <li key={v} className="ui-chip">
              <span>{v}</span>
              <button
                type="button"
                className="ui-chip-remove"
                onClick={() => onChange(value.filter((x) => x !== v))}
                aria-label={t.actions.remove(v)}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(pending.length > 0 || loadingSuggestions || onRequestSuggestions) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {loadingSuggestions ? (
            <span role="status" style={{ fontSize: 12, color: 'var(--muted)' }}>{t.chips.loadingSuggestions}</span>
          ) : pending.length > 0 ? (
            pending.map((s) => (
              <button key={s} type="button" className="ui-chip-suggestion" onClick={() => add(s)} disabled={full}>
                <Icon name="plus" size={14} />
                <span>{s}</span>
              </button>
            ))
          ) : onRequestSuggestions ? (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onRequestSuggestions}>
              <Icon name="sparkles" size={14} />
              {t.chips.loadSuggestions}
            </button>
          ) : null}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id={inputId}
          className="ui-input"
          style={{ flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          placeholder={full ? t.chips.limit(max) : (placeholder ?? t.chips.placeholder)}
          aria-label={label}
          disabled={full}
          aria-describedby={rest['aria-describedby']}
        />
        <button
          type="button"
          className="ui-btn ui-btn--secondary ui-btn--icon"
          onClick={() => add(draft)}
          disabled={!draft.trim() || full}
          aria-label={t.actions.add}
        >
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}
