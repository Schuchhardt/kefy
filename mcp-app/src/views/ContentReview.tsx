// Vista 1: revisor de contenido (ui://kefy/content-review.html).
//
// Pinta la pieza según su tipo y ofrece solo los botones que el servidor
// habilitó en `item.actions`. Después de cada acción que muta, vuelve a pedir
// la pieza con review_content y re-renderiza: nunca asume el resultado. Toda
// acción que gasta créditos muestra el costo y pide confirmación antes.

import { useCallback, useEffect, useState } from 'react';
import type { ContentItemView, ContentView } from '@/lib/mcp-app/contract';
import { useEnv } from '../context';
import type { ToolOutcome } from '../host';
import { useFailToast, useRepeater, useRunner } from '../hooks';
import { displayTitle, formatDate, formatDateTime } from '../format';
import { ContentPreview } from '../components/previews';
import { AskPanel, ConvertPanel, EditPanel, RegeneratePanel, type Call } from '../components/panels';
import { PublishPanel, type PublishOutcome } from '../components/PublishPanel';
import { Button, Chip, Notice } from '../components/ui';

type PanelKind = 'edit' | 'regenerate' | 'ask' | 'convert' | 'publish' | 'archive';

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral', approved: 'success', scheduled: 'info', published: 'success', archived: 'warning',
};

function StatusBar({ item }: { item: ContentItemView }) {
  const { t, locale, timeZone } = useEnv();
  return (
    <div className="k-status" aria-label={t.statuses[item.status] ?? item.status}>
      <Chip tone={STATUS_TONE[item.status] ?? 'neutral'}>{t.statuses[item.status] ?? item.status}</Chip>
      <Chip>{t.formats[item.content_type]}</Chip>
      {item.channel && item.channel !== 'generic' ? <Chip>{item.channel}</Chip> : null}
      {item.image_status && t.imageStatus[item.image_status] ? (
        <Chip tone={item.image_status === 'error' ? 'danger' : 'info'}>{t.imageStatus[item.image_status]}</Chip>
      ) : null}
      {/* Una story se publica como imagen: «video no producido» solo se avisa en un reel. */}
      {item.render_status && t.renderStatus[item.render_status]
        && (item.content_type === 'reel' || (item.content_type === 'story' && item.render_status !== 'not_rendered')) ? (
        <Chip tone={item.render_status === 'ready' ? 'success' : 'neutral'}>{t.renderStatus[item.render_status]}</Chip>
      ) : null}
      {item.created_at ? <span className="k-muted">{t.createdOn(formatDate(item.created_at, locale, timeZone))}</span> : null}
    </div>
  );
}

function ScheduledList({ item }: { item: ContentItemView }) {
  const { t, locale, timeZone, host } = useEnv();
  if (!item.scheduled_posts.length) return null;
  return (
    <section className="k-section" aria-label={t.scheduled.title}>
      <h3>{t.scheduled.title}</h3>
      <ul className="k-list">
        {item.scheduled_posts.map((p) => (
          <li key={p.id}>
            <strong>{p.username ? `@${p.username.replace(/^@/, '')}` : p.platform}</strong>
            {' · '}
            {p.published_at
              ? t.scheduled.publishedAt(formatDateTime(p.published_at, locale, timeZone))
              : p.scheduled_at ? t.scheduled.at(formatDateTime(p.scheduled_at, locale, timeZone)) : (t.statuses[p.status] ?? p.status)}
            {p.post_url ? (
              <>
                {' · '}
                <button type="button" className="k-link" onClick={() => void host.openLink(p.post_url!)}>{t.scheduled.viewPost}</button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ContentReview({
  view, onView, onOpenVideo,
}: {
  view: ContentView;
  onView: (update: (prev: ContentView) => ContentView) => void;
  onOpenVideo: (item: ContentItemView) => Promise<void>;
}) {
  const { host, t, toast, locale, timeZone } = useEnv();
  const [active, setActive] = useState(0);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  const { busy, run } = useRunner();
  const fail = useFailToast();
  const watcher = useRepeater();
  const item = view.items[Math.min(active, view.items.length - 1)];
  const title = displayTitle(item.title, item.body, t.untitled);
  const brandId = view.brand.id;

  // Toda llamada lleva brand_id: con varias marcas, sin él sería brand_required.
  const call: Call = useCallback(
    (name, args, opts) => host.callTool(name, { brand_id: brandId, ...args }, opts),
    [host, brandId],
  );

  const reload = useCallback(async (itemId: string, opts: { quiet?: boolean } = {}): Promise<ContentItemView | null> => {
    const r = await call('review_content', { item_id: itemId });
    if (!r.ok) {
      if (!opts.quiet) fail(r);
      return null;
    }
    const v = r.view as ContentView | null;
    if (!v || v.kind !== 'content') return null;
    const fresh = v.items[0];
    onView((prev) => ({
      ...v,
      items: prev.items.map((it) => (it.id === fresh.id ? fresh : it)),
      variant_group_id: prev.variant_group_id,
    }));
    return fresh;
  }, [call, fail, onView]);

  // Una imagen que se está generando (o una acción que superó el tiempo del
  // host) se sigue en segundo plano: la tarjeta se actualiza sola.
  const watchUntil = useCallback((itemId: string, done: (fresh: ContentItemView) => boolean) => {
    watcher.start(async () => {
      const fresh = await reload(itemId, { quiet: true });
      return !!fresh && done(fresh);
    }, { intervalMs: 5000, maxTries: 36 });
  }, [watcher, reload]);

  useEffect(() => {
    if (item.image_status === 'generating') watchUntil(item.id, (f) => f.image_status !== 'generating');
  }, [item.id, item.image_status, watchUntil]);

  const afterAction = async (r: ToolOutcome, message: string | undefined, done?: (fresh: ContentItemView) => boolean) => {
    if (!r.ok && !r.timeout) { fail(r); return; }
    setPanel(null);
    if (!r.ok) {
      toast(t.slow, 'info');
      if (done) watchUntil(item.id, done);
      return;
    }
    await reload(item.id);
    if (message) toast(message, 'success');
  };

  const setStatus = (status: 'approved' | 'draft' | 'archived', message: string) => run(status, async () => {
    const r = await call('update_content', { item_id: item.id, status });
    if (!r.ok) return fail(r);
    setPanel(null);
    await reload(item.id);
    toast(message, 'success');
    if (status === 'approved') void host.updateModelContext(t.chatApproved(title));
  });

  const sendAsk = async (text: string) => {
    const before = item.updated_at;
    const ok = await host.sendMessage(text);
    if (!ok) { toast(t.toolFailed, 'error'); return; }
    setPanel(null);
    toast(t.done.askSent, 'info');
    watchUntil(item.id, (fresh) => fresh.updated_at !== before);
  };

  const onPublished = async (o: PublishOutcome) => {
    setPanel(null);
    await reload(item.id);
    const message = o.mode === 'now' ? t.publish.doneNow(o.ok) : t.publish.doneScheduled(o.ok);
    toast(o.failed ? `${message} ${t.publish.partial(o.failed)}` : message, o.failed ? 'error' : 'success');
    // Para que el modelo sepa que ya salió aunque el usuario no escriba nada.
    if (o.ok > 0) {
      void host.sendMessage(o.mode === 'now'
        ? t.publish.chatNow(title, o.ok)
        : t.publish.chatScheduled(title, formatDateTime(o.when, locale, timeZone)));
    }
  };

  const a = item.actions;
  const toggle = (p: PanelKind) => setPanel((cur) => (cur === p ? null : p));
  const panelProps = { view, item, call, onClose: () => setPanel(null) };

  return (
    <div className="k-review">
      {view.items.length > 1 ? (
        <div className="k-tabs" role="tablist" aria-label={t.variantsLabel}>
          {view.items.map((it, i) => (
            <button key={it.id} type="button" role="tab" aria-selected={i === active}
              className={`k-tab${i === active ? ' is-active' : ''}`}
              onClick={() => { setActive(i); setPanel(null); watcher.stop(); }}>
              {t.variant(i + 1)}
            </button>
          ))}
        </div>
      ) : null}

      <StatusBar item={item} />
      {item.image_error ? <Notice tone="danger">{`${t.errorPrefix} ${item.image_error.code}: ${item.image_error.message}`}</Notice> : null}

      <ContentPreview item={item} brand={view.brand} onProduce={a.produce_video ? () => void run('video', () => onOpenVideo(item)) : undefined} />

      {!view.permissions.write ? <Notice>{t.noPermission}</Notice> : null}

      <div className="k-actions" role="toolbar" aria-label={title}>
        {a.approve ? <Button variant="primary" icon="check" busy={busy === 'approved'} onClick={() => void setStatus('approved', t.done.approved)}>{t.actions.approve}</Button> : null}
        {a.unapprove ? <Button icon="undo" busy={busy === 'draft'} onClick={() => void setStatus('draft', t.done.unapproved)}>{t.actions.unapprove}</Button> : null}
        {a.publish ? <Button variant="primary" icon="send" pressed={panel === 'publish'} onClick={() => toggle('publish')}>{t.actions.publish}</Button> : null}
        {a.edit ? <Button icon="edit" pressed={panel === 'edit'} onClick={() => toggle('edit')}>{t.actions.edit}</Button> : null}
        {a.regenerate_image ? <Button icon="image" pressed={panel === 'regenerate'} onClick={() => toggle('regenerate')}>{t.actions.regenerate}</Button> : null}
        {a.produce_video && item.content_type === 'story' ? (
          <Button icon="video" busy={busy === 'video'} onClick={() => void run('video', () => onOpenVideo(item))}>{t.actions.produceVideo}</Button>
        ) : null}
        <Button icon="chat" pressed={panel === 'ask'} onClick={() => toggle('ask')}>{t.actions.askAgent}</Button>
        {a.convert ? <Button icon="convert" pressed={panel === 'convert'} onClick={() => toggle('convert')}>{t.actions.convert}</Button> : null}
        {a.archive ? <Button variant="ghost" icon="archive" pressed={panel === 'archive'} onClick={() => toggle('archive')}>{t.actions.archive}</Button> : null}
        <Button variant="ghost" icon="external" onClick={() => void host.openLink(item.link)}>{t.openInKefy}</Button>
      </div>

      {item.publish_blocked && t.blocked[item.publish_blocked] && item.status !== 'draft' ? (
        <p className="k-help">{t.blocked[item.publish_blocked]}</p>
      ) : null}

      {panel === 'archive' ? (
        <div className="k-confirm" role="group" aria-label={t.archiveConfirm.title}>
          <p className="k-confirm__title">{t.archiveConfirm.title}</p>
          <p>{t.archiveConfirm.body}</p>
          <div className="k-row">
            <Button variant="danger" icon="archive" busy={busy === 'archived'} onClick={() => void setStatus('archived', t.done.archived)}>{t.actions.archive}</Button>
            <Button variant="ghost" onClick={() => setPanel(null)}>{t.cancel}</Button>
          </div>
        </div>
      ) : null}
      {panel === 'edit' ? <EditPanel {...panelProps} onDone={(r, m) => void afterAction(r, m)} /> : null}
      {panel === 'regenerate' ? (
        <RegeneratePanel {...panelProps} onDone={(r, m) => {
          const before = item.image_url;
          void afterAction(r, m, (f) => f.image_url !== before && f.image_status !== 'generating');
        }} />
      ) : null}
      {panel === 'convert' ? (
        <ConvertPanel {...panelProps} onDone={(r, m) => {
          const before = item.renditions.length;
          void afterAction(r, m, (f) => f.renditions.length > before);
        }} />
      ) : null}
      {panel === 'ask' ? <AskPanel item={item} onClose={() => setPanel(null)} onSend={sendAsk} /> : null}
      {panel === 'publish' ? (
        <PublishPanel itemId={item.id} call={call} onClose={() => setPanel(null)} onPublished={(o) => void onPublished(o)} onError={fail} />
      ) : null}

      <ScheduledList item={item} />
    </div>
  );
}
