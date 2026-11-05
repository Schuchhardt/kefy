// Paneles de acción de la tarjeta de revisión: editar texto, regenerar imagen,
// pedir cambios al asistente y convertir de formato. La publicación tiene su
// propio panel (PublishPanel.tsx).
//
// Cada panel llama a UNA herramienta del servidor MCP por el host; la tarjeta
// recarga la pieza después (no asume el resultado).

import { useId, useState } from 'react';
import type { ContentItemView, ContentType, ContentView } from '@/lib/mcp-app/contract';
import { useEnv } from '../context';
import { LONG_CALL_MS, type ToolOutcome } from '../host';
import { hashtagsText, parseHashtags, regeneratePrompt } from '../format';
import { Button, CreditConfirm, Field, Panel } from './ui';

export type Call = (name: string, args: Record<string, unknown>, opts?: { timeoutMs?: number }) => Promise<ToolOutcome>;

interface PanelProps {
  view: ContentView;
  item: ContentItemView;
  call: Call;
  onClose: () => void;
  /** La acción terminó: la tarjeta recarga (y espera si quedó en curso). */
  onDone: (r: ToolOutcome, message?: string) => void;
}

export function EditPanel({ item, call, onClose, onDone }: PanelProps) {
  const { t } = useEnv();
  const id = useId();
  const [title, setTitle] = useState(item.title ?? '');
  const [body, setBody] = useState(item.body ?? '');
  const [tags, setTags] = useState(hashtagsText(item.hashtags));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const patch: Record<string, unknown> = {};
    if (title !== (item.title ?? '')) patch.title = title;
    if (body !== (item.body ?? '')) patch.body = body;
    const nextTags = parseHashtags(tags);
    if (nextTags.join(' ') !== item.hashtags.join(' ')) patch.hashtags = nextTags;
    if (!Object.keys(patch).length) return onClose();
    setBusy(true);
    const r = await call('update_content', { item_id: item.id, ...patch });
    setBusy(false);
    onDone(r, t.done.saved);
  };

  return (
    <Panel title={t.edit.title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label={t.edit.titleField} htmlFor={`${id}-title`}>
          <input id={`${id}-title`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t.edit.bodyField} htmlFor={`${id}-body`}>
          <textarea id={`${id}-body`} value={body} rows={6} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label={t.edit.hashtagsField} help={t.edit.hashtagsHelp} htmlFor={`${id}-tags`}>
          <input id={`${id}-tags`} value={tags} aria-describedby={`${id}-tags-help`} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <div className="k-row">
          <Button type="submit" variant="primary" icon="check" busy={busy}>{t.save}</Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t.cancel}</Button>
        </div>
      </form>
    </Panel>
  );
}

export function RegeneratePanel({ view, item, call, onClose, onDone }: PanelProps) {
  const { t } = useEnv();
  const id = useId();
  const [instruction, setInstruction] = useState('');
  const [size, setSize] = useState(item.default_image_size);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const reference = item.image_url;
    const r = await call('generate_content_image', {
      item_id: item.id,
      prompt: regeneratePrompt(instruction, item.title || item.body, !!reference),
      size,
      ...(reference ? { reference_image_urls: [reference] } : {}),
    }, { timeoutMs: LONG_CALL_MS });
    setBusy(false);
    onDone(r, t.done.imageReady);
  };

  return (
    <Panel title={t.regenerate.title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (instruction.trim()) setConfirming(true); }}>
        <Field label={t.regenerate.instruction} help={t.regenerate.instructionHelp} htmlFor={`${id}-instr`}>
          <textarea id={`${id}-instr`} value={instruction} rows={3} maxLength={600} required
            aria-describedby={`${id}-instr-help`} onChange={(e) => { setInstruction(e.target.value); setConfirming(false); }} />
        </Field>
        <Field label={t.regenerate.size} htmlFor={`${id}-size`}>
          <select id={`${id}-size`} value={size} onChange={(e) => setSize(e.target.value)}>
            {view.image_sizes.map((s) => <option key={s} value={s}>{t.regenerate.sizes[s] ?? s}</option>)}
          </select>
        </Field>
        {confirming ? (
          <CreditConfirm credits={view.credits.image} remaining={view.credits.remaining} busy={busy}
            confirmLabel={t.actions.regenerate} onConfirm={() => void submit()} onCancel={() => setConfirming(false)} />
        ) : (
          <div className="k-row">
            <Button type="submit" variant="primary" icon="image" disabled={!instruction.trim()}>
              {`${t.actions.regenerate} · ${t.credits.cost(view.credits.image)}`}
            </Button>
          </div>
        )}
      </form>
    </Panel>
  );
}

export function AskPanel({ item, onClose, onSend }: { item: ContentItemView; onClose: () => void; onSend: (text: string) => Promise<void> }) {
  const { t } = useEnv();
  const id = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Panel title={t.ask.title} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        await onSend(t.ask.message(item.id, text.trim()));
        setBusy(false);
      }}>
        <Field label={t.ask.field} help={t.ask.help} htmlFor={`${id}-ask`}>
          <textarea id={`${id}-ask`} value={text} rows={3} maxLength={1000} required
            aria-describedby={`${id}-ask-help`} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="k-row">
          <Button type="submit" variant="primary" icon="send" busy={busy} disabled={!text.trim()}>{t.ask.send}</Button>
        </div>
      </form>
    </Panel>
  );
}

export function ConvertPanel({ view, item, call, onClose, onDone }: PanelProps) {
  const { t } = useEnv();
  const [target, setTarget] = useState<ContentType | null>(null);
  const [busy, setBusy] = useState(false);
  const formats = (['post', 'carousel', 'reel', 'story'] as const).filter((f) => f !== item.content_type);
  const ready = (f: ContentType) => item.renditions.some((r) => r.format === f && r.status === 'ready');
  const cost = (f: ContentType) => (ready(f) ? 0 : view.credits.convert[f]);

  const submit = async (format: ContentType) => {
    setBusy(true);
    const r = await call('convert_content_format', { item_id: item.id, format }, { timeoutMs: LONG_CALL_MS });
    setBusy(false);
    onDone(r, t.done.converted(t.formats[format]));
  };

  return (
    <Panel title={t.convert.title} onClose={onClose}>
      <p className="k-help">{t.convert.help}</p>
      <div className="k-options" role="radiogroup" aria-label={t.convert.title}>
        {formats.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={target === f}
            className={`k-option${target === f ? ' is-selected' : ''}`} onClick={() => setTarget(f)} disabled={busy}>
            <strong>{t.formats[f]}</strong>
            <span>{ready(f) ? t.convert.ready : t.credits.cost(cost(f))}</span>
          </button>
        ))}
      </div>
      {target ? (
        cost(target) > 0 ? (
          <CreditConfirm credits={cost(target)} remaining={view.credits.remaining} busy={busy}
            confirmLabel={t.formats[target]} onConfirm={() => void submit(target)} onCancel={() => setTarget(null)} />
        ) : (
          <div className="k-row">
            <Button variant="primary" icon="convert" busy={busy} onClick={() => void submit(target)}>{t.formats[target]}</Button>
          </div>
        )
      ) : null}
    </Panel>
  );
}
