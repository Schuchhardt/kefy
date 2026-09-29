'use client';

// ─── Demo animada del hero ───────────────────────────────────────────────────
//
// Tres pasos: crear una publicación, responder a quien comenta y escribe por
// DM, y detectar quién quiere comprar. Lo que antes fallaba (auditoría 3.3):
// - Ciclaba sola con ~20 setTimeout aunque estuviera fuera de la pantalla o la
//   pestaña oculta, y cambiaba de paso mientras alguien leía. Ahora solo
//   avanza visible, se pausa (botón) y deja de avanzar sola en cuanto la
//   persona elige un paso.
// - Con movimiento reducido no anima: muestra cada paso completo.
// - En móvil enseñaba dos columnas de ~170px y escondía la tercera (inbox y
//   pipeline, lo que realmente vende). Ahora es una sola columna: el post en el
//   paso 1 y la actividad en los pasos 2 y 3.
// - 58 estilos en línea con texto de 9–11px: ahora son clases (globals.css,
//   «Demo del hero») y nada baja de 12px.
// - Los textos venían con `copy.x ?? 'texto en español'`, que escondía huecos
//   de traducción: ahora son obligatorios en el tipo.

import { useEffect, useRef, useState } from 'react';
import type { KefyCopy } from '@/types/locales';

type DemoStep = 'content' | 'inbox' | 'pipeline';
const STEP_IDS: DemoStep[] = ['content', 'inbox', 'pipeline'];

/** Duración de cada paso antes de pasar al siguiente (si nadie eligió uno). */
const STEP_DURATION: Record<DemoStep, number> = { content: 8000, inbox: 9000, pipeline: 9500 };

interface HeroDemoProps {
  copy: KefyCopy['demo'];
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ src, name, size, ring = false }: { src?: string; name: string; size: number; ring?: boolean }) {
  const inner = src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" className="demo-avatar-img" />
    : <span className="demo-avatar-initials">{initials(name)}</span>;
  return (
    <span className={`demo-avatar${ring ? ' demo-avatar--ring' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="demo-avatar-inner">{inner}</span>
    </span>
  );
}

export default function HeroDemo({ copy }: HeroDemoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<DemoStep>('content');

  // Paso 1: 0 esqueleto · 1 marca · 2 imagen · 3 texto · 4 post armado · 5 programado
  const [creationPhase, setCreationPhase] = useState(0);
  // Paso 2
  const [commentVisible, setCommentVisible] = useState(false);
  const [brandReplyVisible, setBrandReplyVisible] = useState(false);
  const [dmMsgCount, setDmMsgCount] = useState(0);
  const [botThinking, setBotThinking] = useState<string | null>(null);
  // Paso 3
  const [pipelineStage, setPipelineStage] = useState(-1);
  const [scoreBarWidth, setScoreBarWidth] = useState(0);
  const [qualifiedVisible, setQualifiedVisible] = useState(false);
  const [linkSentVisible, setLinkSentVisible] = useState(false);

  // Cuándo puede animar.
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const playing = inView && pageVisible && !paused && !reducedMotion;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    if (typeof window.matchMedia !== 'function') return () => document.removeEventListener('visibilitychange', onVisibility);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReducedMotion(mq.matches);
    onMotion();
    mq.addEventListener?.('change', onMotion);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      mq.removeEventListener?.('change', onMotion);
    };
  }, []);

  const dmThread = copy.dmThread;
  const thoughts = copy.botThoughts;

  // Línea de tiempo del paso actual. Sin reproducción (pausa, fuera de vista,
  // movimiento reducido) el paso se muestra completo y quieto; al reanudar se
  // vuelve a reproducir desde el principio.
  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };

    const showFinal = () => {
      if (step === 'content') setCreationPhase(5);
      if (step === 'inbox') {
        setCommentVisible(true); setBrandReplyVisible(true);
        setDmMsgCount(dmThread.length); setBotThinking(thoughts[thoughts.length - 1] ?? null);
      }
      if (step === 'pipeline') {
        setPipelineStage(2); setScoreBarWidth(72); setQualifiedVisible(true); setLinkSentVisible(true);
      }
    };

    if (!playing) {
      showFinal();
      return;
    }

    if (step === 'content') {
      setCreationPhase(0);
      [900, 2100, 3300, 4400, 5600].forEach((ms, i) => at(ms, () => setCreationPhase(i + 1)));
    }
    if (step === 'inbox') {
      setCommentVisible(false); setBrandReplyVisible(false); setDmMsgCount(0); setBotThinking(null);
      at(500, () => setCommentVisible(true));
      at(1700, () => setBrandReplyVisible(true));
      dmThread.forEach((_, i) => at(2800 + i * 2000, () => setDmMsgCount(i + 1)));
      thoughts.forEach((thought, i) => at(3600 + i * 2000, () => setBotThinking(thought)));
    }
    if (step === 'pipeline') {
      setPipelineStage(-1); setScoreBarWidth(0); setQualifiedVisible(false); setLinkSentVisible(false);
      [300, 1000, 1700].forEach((ms, i) => at(ms, () => setPipelineStage(i)));
      at(800, () => setScoreBarWidth(72));
      at(3200, () => setQualifiedVisible(true));
      at(4000, () => setLinkSentVisible(true));
    }

    if (!interacted) {
      at(STEP_DURATION[step], () => {
        setStep((current) => STEP_IDS[(STEP_IDS.indexOf(current) + 1) % STEP_IDS.length]);
      });
    }

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [step, playing, interacted, dmThread, thoughts]);

  function chooseStep(s: DemoStep) {
    setInteracted(true);
    setStep(s);
  }

  const brandName = copy.contextProduct;
  const handle = copy.brandHandle;
  const postReady = step !== 'content' || creationPhase >= 4;
  const stepIndex = STEP_IDS.indexOf(step);

  return (
    <div ref={rootRef} className="demo reveal is-in" role="region" aria-label={copy.ariaLabel}>
      <div className="demo-bar">
        <div className="demo-dots" aria-hidden="true"><span /><span /><span /></div>
        <div className="demo-url" aria-hidden="true">kefy.app / <span>dashboard</span></div>
        {!reducedMotion && (
          <button
            type="button"
            className="demo-pause"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? copy.play : copy.pause}
          >
            {paused ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8V4z" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            )}
          </button>
        )}
      </div>

      <div className="demo-grid" data-step={step}>
        {/* ── Columna 1: pasos ── */}
        <div className="demo-col1">
          <div className="demo-step-list" role="group" aria-label={copy.stepsLabel}>
            {STEP_IDS.map((s, i) => {
              const isActive = step === s;
              const isDone = stepIndex > i;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => chooseStep(s)}
                  aria-pressed={isActive}
                  className={`demo-step${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
                >
                  <span className="demo-step-num" aria-hidden="true">{isDone ? '✓' : i + 1}</span>
                  <span className="demo-step-label">{copy.stepLabels[i]}</span>
                </button>
              );
            })}
          </div>

          <p className="demo-step-desc">{copy.stepDescriptions[stepIndex]}</p>

          {step === 'content' && (
            <ol className="demo-mini-progress" aria-hidden="true">
              {copy.creationSteps.map((label, i) => {
                const done = creationPhase >= i + 1;
                const active = creationPhase === i;
                return (
                  <li key={label} className={done ? 'is-done' : active ? 'is-active' : ''}>
                    <span className="demo-mini-mark">{done ? '✓' : '·'}</span>
                    {label}
                  </li>
                );
              })}
            </ol>
          )}

          <div className="demo-brand-foot">
            <Avatar src={copy.brandLogoSrc} name={brandName} size={26} />
            <div style={{ minWidth: 0 }}>
              <div className="demo-brand-foot-name">{brandName}</div>
              <div className="demo-brand-foot-handle">{handle}</div>
            </div>
          </div>
        </div>

        {/* ── Columna 2: el post de Instagram ── */}
        <div className="demo-col2">
          <div className="demo-ig">
            <div className="demo-ig-head">
              {postReady ? <Avatar src={copy.brandLogoSrc} name={brandName} size={30} ring /> : <span className="demo-skel" style={{ width: 30, height: 30, borderRadius: '50%' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                {postReady ? (
                  <>
                    <div className="demo-ig-handle">{handle}</div>
                    <div className="demo-ig-meta">{copy.instagramNow}</div>
                  </>
                ) : (
                  <>
                    <span className="demo-skel" style={{ width: '65%', height: 9 }} />
                    <span className="demo-skel" style={{ width: '45%', height: 8, marginTop: 5 }} />
                  </>
                )}
              </div>
            </div>

            <div className="demo-ig-media">
              {postReady ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={copy.brandProductSrc} alt={copy.productAlt} />
              ) : (
                <div className="demo-ig-media-loading">
                  <span className="demo-ig-media-text">
                    {creationPhase <= 1 ? copy.imageGenerating : copy.imageReady}
                  </span>
                </div>
              )}
            </div>

            {!postReady && creationPhase >= 2 && (
              <div className="demo-ig-caption-skel" aria-hidden="true">
                <span className="demo-skel" style={{ width: '92%', height: 8 }} />
                <span className="demo-skel" style={{ width: '75%', height: 8 }} />
                <span className="demo-skel" style={{ width: '52%', height: 8 }} />
              </div>
            )}

            {postReady && (
              <>
                <div className="demo-ig-actions" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
                </div>
                <div className="demo-ig-likes">{copy.likesLabel}</div>
                <p className="demo-ig-caption"><strong>{handle}</strong> {copy.commentPostCaption}</p>
              </>
            )}

            {step === 'inbox' && postReady && commentVisible && (
              <div className="demo-ig-comments">
                <div className="demo-ig-comment demo-anim-in">
                  <Avatar name={copy.commenterName} size={22} />
                  <p><strong>{copy.commenterHandle}</strong> {copy.commentThread[0]?.text}</p>
                </div>
                {brandReplyVisible && (
                  <div className="demo-ig-comment demo-anim-in">
                    <Avatar src={copy.brandLogoSrc} name={brandName} size={22} />
                    <p><strong className="demo-accent">{handle}</strong> {copy.commentBrandReply}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {step === 'content' && (
            <div className={`demo-status${creationPhase >= 5 ? ' is-done' : ''}`}>
              {creationPhase < 4 ? copy.statusGenerating
                : creationPhase === 4 ? copy.statusAssembling
                : `${copy.postPublished} · ${copy.postScheduledFor}`}
            </div>
          )}
        </div>

        {/* ── Columna 3: progreso, DMs y pipeline ── */}
        <div className="demo-col3">
          {step === 'content' && (
            <div className="demo-progress">
              <div className="demo-kicker">{copy.progressLabel}</div>
              {copy.creationStepsLong.map((label, i) => {
                const done = creationPhase >= i + 1;
                const active = creationPhase === i;
                return (
                  <div key={label} className={`demo-progress-row${done ? ' is-done' : active ? ' is-active' : ''}`}>
                    <span className="demo-progress-num" aria-hidden="true">{done ? '✓' : i + 1}</span>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {step === 'inbox' && (
            <div className="demo-dm">
              <div className="demo-dm-head">
                <Avatar name={copy.commenterName} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="demo-dm-name">{copy.commenterHandle.replace(/^@/, '')}</div>
                  <div className="demo-dm-channel">{copy.dmChannel}</div>
                </div>
                <span className="demo-chip">{copy.dmBadge}</span>
              </div>
              <div className="demo-dm-thread">
                {dmThread.slice(0, dmMsgCount).map((msg, i) => (
                  <div key={i} className={`demo-dm-msg demo-anim-in${msg.sender === 'brand' ? ' is-brand' : ''}`}>
                    {msg.sender === 'brand' && <span className="demo-dm-auto">{copy.autoReplyLabel}</span>}
                    <p>{msg.text}</p>
                  </div>
                ))}
              </div>
              {botThinking && <div className="demo-thought demo-anim-in">{botThinking}</div>}
            </div>
          )}

          {step === 'pipeline' && (
            <div className="demo-pipeline">
              <div className="demo-lead-card">
                <div className="demo-lead-hd">
                  <div className="demo-lead-av" aria-hidden="true">{copy.leadName[0]}</div>
                  <div className="demo-lead-meta">
                    <div className="demo-lead-name">{copy.leadName}</div>
                    <div className="demo-lead-handle">{copy.leadHandle}</div>
                  </div>
                  <div className="demo-lead-score-badge">
                    <span className="demo-lead-score-n">{copy.leadScore}</span>
                    <span className="demo-lead-score-lbl">{copy.scoreLabel}</span>
                  </div>
                </div>
                <div className="demo-score-bar-wrap">
                  <div className="demo-kicker">{copy.scoreBarLabel}</div>
                  <div className="demo-score-bar"><div className="demo-score-bar-fill" style={{ width: `${scoreBarWidth}%` }} /></div>
                </div>
                <div className="demo-stage-row">
                  {copy.pipelineStages.map((stage, i) => (
                    <span key={stage} className={`demo-stage-pill${i === pipelineStage ? ' active' : i < pipelineStage ? ' done' : ''}`}>
                      {i < pipelineStage && <span aria-hidden="true">✓ </span>}
                      {stage}
                    </span>
                  ))}
                </div>
              </div>
              {qualifiedVisible && (
                <div className="demo-qualified-badge demo-anim-in">
                  <span aria-hidden="true">🔥</span>
                  {copy.qualifiedLabel}
                </div>
              )}
              {linkSentVisible && (
                <div className="demo-link-sent demo-anim-in">
                  <div className="demo-link-sent-head">
                    <div className="demo-link-sent-lbl">{copy.linkSentLabel}</div>
                    <div className="demo-link-sent-time">{copy.linkSentTime}</div>
                  </div>
                  <div className="demo-link-sent-url">
                    <span aria-hidden="true">🔗</span>
                    <span className="demo-link-sent-href">{copy.linkSentUrl}</span>
                  </div>
                  <div className="demo-link-sent-via">{copy.linkSentVia}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
