// Vista 2: plan y producción de video (ui://kefy/video-plan.html).
//
//   A. Plan: storyboard por plano, nivel de animación con el total de créditos
//      de cada uno y los créditos que quedan. «Producir video» llama a
//      produce_video (con force si ya hay video, tras confirmarlo).
//      Una story sin guion pasa antes por «Preparar guion» (prepare_story_video).
//   B. Produciendo: barra de progreso y pasos. Llama a get_video_status cada
//      5 s mientras corre: esa herramienta también AVANZA el trabajo, así que el
//      polling es parte del mecanismo. Se detiene al desmontar la vista (el
//      host la desmonta en ui/resource-teardown).
//   C. Listo: reproductor 9:16, aprobar y publicar; avisa al chat una vez.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Motion, VideoView } from '@/lib/mcp-app/contract';
import { useEnv } from '../context';
import { LONG_CALL_MS } from '../host';
import { useFailToast, useRepeater, useRunner } from '../hooks';
import { displayTitle, percent } from '../format';
import { VideoPlayer } from '../components/previews';
import { PublishPanel, type PublishOutcome } from '../components/PublishPanel';
import type { Call } from '../components/panels';
import { Button, Chip, CreditConfirm, Icon, Notice } from '../components/ui';

// Solo tipos de lib/mcp-app/contract: la vista no arrastra los esquemas zod.
const MOTION_LEVELS: readonly Motion[] = ['none', 'key', 'full'];

const POLL_MS = 5000;
/** Una hora de polling como máximo: una producción normal tarda minutos. */
const POLL_MAX_TRIES = 720;

type Confirm = 'script' | 'produce' | 'retry' | null;

export function VideoPlan({
  view, onView, onBack,
}: {
  view: VideoView;
  onView: (update: (prev: VideoView) => VideoView) => void;
  onBack?: () => void;
}) {
  const { host, t, toast } = useEnv();
  const { busy, run } = useRunner();
  const fail = useFailToast();
  const poller = useRepeater();
  const [motion, setMotion] = useState<Motion>(view.plan?.motion ?? 'key');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [publishing, setPublishing] = useState(false);
  const sawRunning = useRef(false);
  const announced = useRef(false);

  const brandId = view.brand.id;
  const itemId = view.item.id;
  // Solo se manda format si el video es de una rendición (otro formato).
  const format = view.format && view.format !== view.item.content_type ? view.format : null;
  const title = displayTitle(view.item.title, view.item.body, t.untitled);

  const call: Call = useCallback(
    (name, args, opts) => host.callTool(name, { brand_id: brandId, item_id: itemId, ...(format ? { format } : {}), ...args }, opts),
    [host, brandId, itemId, format],
  );

  // El estado (get_video_status) no trae plan: se conserva el que ya había.
  const apply = useCallback((v: unknown) => {
    const next = v as VideoView | null;
    if (!next || next.kind !== 'video') return;
    onView((prev) => ({ ...next, plan: next.plan ?? prev.plan }));
  }, [onView]);

  const production = view.production;
  const running = production?.status === 'running';

  useEffect(() => {
    if (!running) return;
    sawRunning.current = true;
    poller.start(async () => {
      const r = await call('get_video_status', {});
      if (!r.ok) return false; // pasajero: se reintenta en la próxima vuelta
      apply(r.view);
      const v = r.view as VideoView | null;
      return v?.production?.status !== 'running';
    }, { intervalMs: POLL_MS, maxTries: POLL_MAX_TRIES });
    return () => poller.stop();
  }, [running, call, apply, poller]);

  // Aviso al chat cuando termina una producción que esta vista vio correr.
  useEffect(() => {
    if (production?.status === 'done' && sawRunning.current && !announced.current) {
      announced.current = true;
      toast(t.video.ready, 'success');
      void host.sendMessage(t.video.chatReady(title));
    }
  }, [production?.status, host, t, title, toast]);

  const changeMotion = (m: Motion) => {
    setMotion(m);
    setConfirm(null);
    // Leer el plan no cuesta nada: se actualiza qué planos se animan.
    void call('get_video_plan', { motion: m }).then((r) => { if (r.ok) apply(r.view); });
  };

  const prepareScript = () => run('script', async () => {
    const r = await call('prepare_story_video', {}, { timeoutMs: LONG_CALL_MS });
    if (!r.ok) return fail(r);
    setConfirm(null);
    const plan = await call('get_video_plan', { motion });
    if (!plan.ok) return fail(plan);
    apply(plan.view);
  });

  const produce = (force: boolean) => run('produce', async () => {
    const r = await call('produce_video', { motion, force }, { timeoutMs: 120_000 });
    if (!r.ok) return fail(r);
    setConfirm(null);
    apply(r.view);
  });

  const approve = () => run('approve', async () => {
    const r = await call('update_content', { status: 'approved' });
    if (!r.ok) return fail(r);
    const s = await call('get_video_status', {});
    if (s.ok) apply(s.view);
    toast(t.done.approved, 'success');
    void host.updateModelContext(t.chatApproved(title));
  });

  const onPublished = async (o: PublishOutcome) => {
    setPublishing(false);
    const s = await call('get_video_status', {});
    if (s.ok) apply(s.view);
    const message = o.mode === 'now' ? t.publish.doneNow(o.ok) : t.publish.doneScheduled(o.ok);
    toast(o.failed ? `${message} ${t.publish.partial(o.failed)}` : message, o.failed ? 'error' : 'success');
    if (o.ok > 0 && o.mode === 'now') void host.sendMessage(t.publish.chatNow(title, o.ok));
  };

  const plan = view.plan;
  const planCredits = plan ? plan.credits_by_motion[motion] : 0;
  const failedStep = production?.steps.find((s) => s.status === 'failed') ?? null;
  const done = production?.status === 'done' || (!production && !!view.item.video_url);
  const videoUrl = view.item.video_url;

  return (
    <div className="k-video-plan">
      <header className="k-video-plan__head">
        {onBack ? <Button variant="ghost" icon="back" onClick={onBack}>{t.back}</Button> : null}
        <h2>{title}</h2>
        <div className="k-status">
          <Chip>{t.formats[view.format ?? view.item.content_type]}</Chip>
          <Chip tone={view.item.status === 'approved' ? 'success' : 'neutral'}>{t.statuses[view.item.status] ?? view.item.status}</Chip>
        </div>
      </header>

      {!view.permissions.write ? <Notice>{t.noPermission}</Notice> : null}

      {/* Story sin guion: primero el guion (1 crédito). */}
      {view.needs_script ? (
        <section className="k-section">
          <Notice>{t.video.needsScript}</Notice>
          <p className="k-help">{t.video.needsScriptHint}</p>
          {confirm === 'script' ? (
            <CreditConfirm credits={view.credits.story_script} remaining={view.credits.remaining} busy={busy === 'script'}
              onConfirm={() => void prepareScript()} onCancel={() => setConfirm(null)} />
          ) : view.permissions.write ? (
            <Button variant="primary" icon="edit" onClick={() => setConfirm('script')}>
              {t.video.prepareScript(t.credits.cost(view.credits.story_script))}
            </Button>
          ) : null}
        </section>
      ) : null}

      {view.plan_error && !plan && !view.needs_script ? (
        <Notice tone="danger">{`${t.errorPrefix} ${view.plan_error.code}: ${view.plan_error.message}`}</Notice>
      ) : null}

      {/* B. Produciendo */}
      {running && production ? (
        <section className="k-section" aria-live="polite">
          <h3>{t.video.producing}</h3>
          <div className="k-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={percent(production.progress)} aria-label={t.video.producing}>
            <div className="k-progress__bar" style={{ width: `${percent(production.progress)}%` }} />
          </div>
          <p className="k-help">{t.video.progress(percent(production.progress))} · {t.video.producingHint}</p>
          <ol className="k-steps">
            {production.steps.map((s) => (
              <li key={s.key} className={`k-step is-${s.status}`}>
                <span>{s.label}{s.scene_order ? ` · ${t.video.shot(s.scene_order)}` : ''}</span>
                <span className="k-muted">{t.video.stepStatus[s.status] ?? s.status}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Falló */}
      {production?.status === 'failed' ? (
        <section className="k-section">
          <Notice tone="danger">
            <strong>{t.video.failed}</strong>
            {failedStep ? <p>{t.video.failedStep(failedStep.label)}{failedStep.error ? ` — ${failedStep.error}` : ''}</p> : null}
            {!failedStep && production.error ? <p>{production.error}</p> : null}
          </Notice>
          {plan && view.permissions.write ? (
            confirm === 'retry' ? (
              <CreditConfirm credits={planCredits} remaining={view.credits.remaining} busy={busy === 'produce'}
                confirmLabel={t.video.retry} onConfirm={() => void produce(true)} onCancel={() => setConfirm(null)} />
            ) : (
              <Button variant="primary" icon="reload" onClick={() => setConfirm('retry')}>{t.video.retry}</Button>
            )
          ) : null}
        </section>
      ) : null}

      {/* C. Listo */}
      {done && videoUrl ? (
        <section className="k-section">
          <div className="k-frame-916"><VideoPlayer src={videoUrl} poster={view.item.image_url} title={title} /></div>
          <div className="k-actions">
            {view.actions.approve ? <Button variant="primary" icon="check" busy={busy === 'approve'} onClick={() => void approve()}>{t.actions.approve}</Button> : null}
            {view.actions.publish ? <Button variant="primary" icon="send" pressed={publishing} onClick={() => setPublishing((p) => !p)}>{t.actions.publish}</Button> : null}
            <Button variant="ghost" icon="external" onClick={() => void host.openLink(view.item.link)}>{t.openInKefy}</Button>
          </div>
          {publishing ? (
            <PublishPanel itemId={itemId} format={format} call={call} onClose={() => setPublishing(false)}
              onPublished={(o) => void onPublished(o)} onError={fail} />
          ) : null}
        </section>
      ) : null}

      {/* A. Plan */}
      {plan && !running ? (
        <section className="k-section">
          <h3>{t.video.planTitle} <span className="k-muted">· {t.video.duration(plan.duration_seconds)}</span></h3>
          <ol className="k-shots" aria-label={t.preview.storyboard}>
            {plan.shots.map((s) => (
              <li key={s.order} className="k-shot">
                {s.image_url ? (
                  <img className="k-shot__thumb" src={s.image_url} alt={t.video.shot(s.order)} loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div className="k-shot__thumb k-media-empty" role="img" aria-label={t.preview.noImage}><Icon name="image" /></div>
                )}
                <div className="k-shot__body">
                  <span className="k-storyboard__meta">
                    {t.video.shot(s.order)}{s.duration_seconds ? ` · ${t.preview.seconds(Math.round(s.duration_seconds))}` : ''}
                  </span>
                  {s.line ? <p>{s.speaker && s.speaker !== 'narrator' ? `${s.speaker}: ` : ''}{s.line}</p> : null}
                  {s.on_screen_text ? <p className="k-muted">{s.on_screen_text}</p> : null}
                  <div className="k-shot__tools">
                    {s.tools.map((tool) => <Chip key={tool}>{t.video.tools[tool] ?? tool}</Chip>)}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {view.permissions.write ? (
            <>
              <fieldset className="k-fieldset">
                <legend>{t.video.motion}</legend>
                <div className="k-options" role="radiogroup" aria-label={t.video.motion}>
                  {MOTION_LEVELS.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={motion === m}
                      className={`k-option${motion === m ? ' is-selected' : ''}`} onClick={() => changeMotion(m)}>
                      <strong>{t.video.motionLevels[m]}</strong>
                      <span>{t.credits.cost(plan.credits_by_motion[m])}</span>
                      <span className="k-muted">{t.video.motionHelp[m]}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {view.credits.remaining !== null ? <p className="k-help">{t.credits.remaining(view.credits.remaining)}</p> : null}
              {plan.notes.length ? <ul className="k-help k-notes">{plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}

              {confirm === 'produce' ? (
                <CreditConfirm credits={planCredits} remaining={view.credits.remaining} busy={busy === 'produce'}
                  confirmLabel={t.actions.produceVideo}
                  extra={videoUrl ? <Notice tone="warning"><strong>{t.video.replaceTitle}</strong><p>{t.video.replaceBody}</p></Notice> : null}
                  onConfirm={() => void produce(!!videoUrl)} onCancel={() => setConfirm(null)} />
              ) : production?.status !== 'failed' ? (
                <Button variant={done ? 'secondary' : 'primary'} icon="video" onClick={() => setConfirm('produce')}>
                  {t.video.produce(t.credits.cost(planCredits))}
                </Button>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
