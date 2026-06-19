'use client';

import { useState, useEffect, useRef } from 'react';
import type { KefyCopy } from '@/types/locales';

type DemoStep = 'content' | 'inbox' | 'pipeline';
const STEP_IDS: DemoStep[] = ['content', 'inbox', 'pipeline'];

interface HeroDemoProps {
  copy: KefyCopy['demo'];
}

function IgAvatar({ src, name, size = 36, ring = false }: { src?: string; name: string; size?: number; ring?: boolean }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const inner = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  ) : (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', fontSize: size * 0.38, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-syne, serif)' }}>
      {initials}
    </div>
  );
  if (ring) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', padding: 2, flexShrink: 0, background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}>
        <div style={{ borderRadius: '50%', overflow: 'hidden', width: '100%', height: '100%' }}>{inner}</div>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)', background: '#111' }}>
      {inner}
    </div>
  );
}

export default function HeroDemo({ copy }: HeroDemoProps) {
  const [step, setStep] = useState<DemoStep>('content');

  // Step 1 — creation phases:
  //  0=skeleton  1=brand kit done  2=image done  3=caption done
  //  4=post assembled (postReady)  5=scheduled
  const [creationPhase, setCreationPhase] = useState(0);

  // Step 2
  const [commentVisible, setCommentVisible] = useState(false);
  const [brandReplyVisible, setBrandReplyVisible] = useState(false);
  const [dmMsgCount, setDmMsgCount] = useState(0);
  const [botThinking, setBotThinking] = useState<string | null>(null);

  // Step 3
  const [pipelineStage, setPipelineStage] = useState(-1);
  const [scoreBarWidth, setScoreBarWidth] = useState(0);
  const [qualifiedVisible, setQualifiedVisible] = useState(false);
  const [linkSentVisible, setLinkSentVisible] = useState(false);

  const stepRef = useRef<DemoStep>('content');
  useEffect(() => { stepRef.current = step; }, [step]);

  const botThought0 = copy.botThoughts?.[0] ?? 'Analizando intención de compra…';
  const botThought1 = copy.botThoughts?.[1] ?? 'Score +15 · Clasificando como lead caliente 🔥';

  // Step 1
  useEffect(() => {
    if (step !== 'content') { return; }
    setCreationPhase(0);
    const t1 = setTimeout(() => setCreationPhase(1), 900);
    const t2 = setTimeout(() => setCreationPhase(2), 2100);
    const t3 = setTimeout(() => setCreationPhase(3), 3300);
    const t4 = setTimeout(() => setCreationPhase(4), 4400);
    const t5 = setTimeout(() => setCreationPhase(5), 5600);
    const t6 = setTimeout(() => { if (stepRef.current === 'content') setStep('inbox'); }, 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearTimeout(t6); };
  }, [step]);

  // Step 2
  useEffect(() => {
    if (step !== 'inbox') {
      setCommentVisible(false); setBrandReplyVisible(false);
      setDmMsgCount(0); setBotThinking(null); return;
    }
    const t1 = setTimeout(() => setCommentVisible(true), 500);
    const t2 = setTimeout(() => setBrandReplyVisible(true), 1700);
    const t3 = setTimeout(() => setDmMsgCount(1), 2800);
        const t4 = setTimeout(() => setBotThinking(botThought0), 3600);
    const t5 = setTimeout(() => setDmMsgCount(2), 4800);
    const t6 = setTimeout(() => setBotThinking(botThought1), 5600);
    const t7 = setTimeout(() => setDmMsgCount(3), 6600);
    const t8 = setTimeout(() => { if (stepRef.current === 'inbox') setStep('pipeline'); }, 10000);
    return () => { [t1, t2, t3, t4, t5, t6, t7, t8].forEach(clearTimeout); };
  }, [step, botThought0, botThought1]);

  // Step 3
  useEffect(() => {
    if (step !== 'pipeline') {
      setPipelineStage(-1); setScoreBarWidth(0);
      setQualifiedVisible(false); setLinkSentVisible(false); return;
    }
    let s = -1;
    const t0 = setTimeout(() => {
      const id = setInterval(() => { s++; setPipelineStage(s); if (s >= 2) clearInterval(id); }, 700);
    }, 300);
    const t1 = setTimeout(() => setScoreBarWidth(72), 800);
    const t2 = setTimeout(() => setQualifiedVisible(true), 3200);
    const t3 = setTimeout(() => setLinkSentVisible(true), 4000);
    const t4 = setTimeout(() => { if (stepRef.current === 'pipeline') setStep('content'); }, 9500);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [step]);

  const brandName = copy.contextProduct ?? 'HiClothes';
  const handle = copy.brandHandle ?? '@hiclothes';
  const brandInitials = brandName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const labels = copy.stepLabels ?? ['Crear contenido', 'Interacciones', 'Pipeline de leads'];
  const stepDescs = copy.stepDescriptions ?? [
    'Kefy analiza tu marca y genera imagen, caption y programación automáticamente.',
    'Alguien comentó en tu post. Kefy detectó intención de compra y está enviando un DM.',
    'María fue calificada como lead caliente. Kefy le envió el link de compra por DM.',
  ];
  const creationSteps = copy.creationSteps ?? ['Analizando brand kit', 'Generando imagen', 'Generando caption', 'Armando post', 'Programando'];
  const creationStepsLong = copy.creationStepsLong ?? ['Analizando brand kit', 'Generando imagen del post', 'Generando caption', 'Armando post completo', 'Programando publicación'];
  const progressLabel = copy.progressLabel ?? 'Progreso';
  const commentBrandReply = copy.commentBrandReply ?? '¡Hola! Te contactamos por DM 👋';
  const instagramNow = copy.instagramNow ?? 'Instagram · Ahora';
  const stages = copy.pipelineStages ?? [];
  const dmMsgs = copy.dmThread ?? [];
  const commentThread = copy.commentThread ?? [];
  const postReady = step !== 'content' || creationPhase >= 4;

  const skel = (w: string | number, h: number, radius = 4, extra?: React.CSSProperties): React.CSSProperties => ({
    width: w, height: h, borderRadius: radius,
    background: 'rgba(255,255,255,0.08)',
    animation: 'skeletonPulse 1.4s ease-in-out infinite',
    flexShrink: 0, ...extra,
  });

  return (
    <div className="demo reveal is-in">
      <div className="demo-bar">
        <div className="demo-dots"><span /><span /><span /></div>
        <div className="demo-url">
          <span className="acc" />kefy.app /&nbsp;<span>dashboard</span>
        </div>
      </div>

      {/* Fixed 3-column layout */}
      <div className="demo-grid" style={{ overflow: 'hidden' }}>

        {/* COL 1: Steps */}
        <div style={{ borderRight: '1px solid var(--border)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--bg)' }}>
          {STEP_IDS.map((s, i) => {
            const isActive = step === s;
            const isDone = STEP_IDS.indexOf(step) > i;
            return (
              <button key={s} onClick={() => setStep(s)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', background: isActive ? 'var(--surface)' : 'transparent', transition: 'background 0.2s' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-syne, serif)', background: isDone ? 'var(--accent)' : isActive ? 'rgba(198,255,75,0.1)' : 'var(--surface)', border: `1px solid ${isDone ? 'var(--accent)' : isActive ? 'rgba(198,255,75,0.35)' : 'var(--border)'}`, color: isDone ? '#000' : isActive ? 'var(--accent)' : 'var(--muted)' }}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-syne, serif)', fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--text)' : 'var(--muted)', lineHeight: 1.3 }}>
                  {labels[i]}
                </span>
              </button>
            );
          })}

          <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />

          <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.6 }}>
            {step === 'content' && stepDescs[0]}
            {step === 'inbox' && stepDescs[1]}
            {step === 'pipeline' && stepDescs[2]}
          </div>

          {step === 'content' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {creationSteps.map((label, i) => {
                const doneAt = i + 1;
                const done = creationPhase >= doneAt;
                const active = creationPhase === doneAt - 1;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, transition: 'color 0.3s', color: done ? 'var(--accent)' : active ? 'var(--text)' : 'rgba(255,255,255,0.22)' }}>
                    <span style={{ fontSize: 9, width: 11, flexShrink: 0 }}>{done ? '✓' : '·'}</span>
                    {label}
                    {active && <span style={{ marginLeft: 2, width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulseDot 1s ease-in-out infinite' }} />}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
            {copy.brandLogoSrc
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={copy.brandLogoSrc} alt={brandName} style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
              : <div style={{ width: 22, height: 22, borderRadius: 5, background: 'rgba(198,255,75,0.08)', border: '1px solid rgba(198,255,75,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-syne, serif)', flexShrink: 0 }}>{brandInitials}</div>
            }
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-syne, serif)' }}>{brandName}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>{handle}</div>
            </div>
          </div>
        </div>

        {/* COL 2: IG post — always visible */}
        <div style={{ borderRight: '1px solid var(--border)', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface)' }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', gap: 7 }}>
              {!postReady
                ? <div style={skel(26, 26, 13)} />
                : <IgAvatar src={copy.brandLogoSrc} name={brandName} size={26} ring />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                {!postReady ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={skel('65%', 7)} />
                    <div style={skel('45%', 6)} />
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{handle}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>{instagramNow}</div>
                  </>
                )}
              </div>
            </div>

            {/* Image */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', maxHeight: 166, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
              {!postReady ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, animation: 'skeletonPulse 1.4s ease-in-out infinite', background: 'rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 20, opacity: 0.2 }}>🖼</span>
                  <span style={{ fontSize: 9, color: 'var(--muted)', opacity: 0.55, fontFamily: 'var(--font-jetbrains, monospace)' }}>
                    {creationPhase <= 1 ? (copy.imageGenerating ?? 'Generando imagen…') : (copy.imageReady ?? 'Imagen lista ✓')}
                  </span>
                </div>
              ) : copy.brandProductSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={copy.brandProductSrc} alt="producto" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1510, #0f120d)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 24, opacity: 0.18 }}>👗</span>
                </div>
              )}
            </div>

            {/* Caption skeleton */}
            {!postReady && creationPhase >= 2 && (
              <div style={{ padding: '7px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={skel('92%', 6)} />
                <div style={skel('75%', 6)} />
                <div style={skel('52%', 6)} />
              </div>
            )}

            {/* Real caption + actions */}
            {postReady && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px 2px', gap: 9 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  <div style={{ flex: 1 }} />
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div style={{ padding: '2px 10px 2px', fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{copy.likesLabel ?? '247 likes'}</div>
                <div style={{ padding: '0 10px 8px', fontSize: 9, lineHeight: 1.5, color: 'var(--muted)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{handle} </span>
                  {copy.commentPostCaption ?? 'Nueva colección — Invierno Silencioso ❄️'}
                </div>
              </>
            )}

            {/* Comment thread (step 2) */}
            {step === 'inbox' && postReady && commentVisible && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start', animation: 'msgIn 0.3s ease-out' }}>
                  <div style={{ width: 17, height: 17, borderRadius: '50%', background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 700, color: '#a855f7', flexShrink: 0, fontFamily: 'var(--font-syne, serif)' }}>MG</div>
                  <div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text)' }}>@maria.g_shop </span>
                    <span style={{ fontSize: 9, color: '#D6D5CE' }}>{commentThread[0]?.text ?? '¿Tienen talla M? 🔥'}</span>
                  </div>
                </div>
                {brandReplyVisible && (
                  <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start', animation: 'msgIn 0.3s ease-out' }}>
                    <IgAvatar src={copy.brandLogoSrc} name={brandName} size={17} />
                    <div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)' }}>{handle} </span>
                      <span style={{ fontSize: 9, color: '#D6D5CE' }}>{commentBrandReply}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status badge */}
          {step === 'content' && (
            <div style={{ padding: '6px 9px', borderRadius: 7, fontSize: 9, fontFamily: 'var(--font-jetbrains, monospace)', transition: 'all 0.4s', background: creationPhase >= 5 ? 'rgba(198,255,75,0.06)' : 'transparent', border: `1px solid ${creationPhase >= 5 ? 'rgba(198,255,75,0.3)' : 'var(--border)'}`, color: creationPhase >= 5 ? 'var(--accent)' : 'var(--muted)' }}>
              {creationPhase < 4 ? (copy.statusGenerating ?? '⏳ Generando contenido…')
                : creationPhase === 4 ? (copy.statusAssembling ?? '📋 Armando post…')
                : `${copy.postPublished ?? '✓ Publicado'} · ${copy.postScheduledFor ?? 'Sáb 23 may · 18:00'}`}
            </div>
          )}
        </div>

        {/* COL 3: Activity / Inbox / Pipeline */}
        <div className="demo-col3" style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>

          {/* STEP 1 */}
          {step === 'content' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', fontFamily: 'var(--font-syne, serif)', fontWeight: 600, marginBottom: 2 }}>{progressLabel}</div>
              {creationStepsLong.map((label, i) => {
                const doneAt = i + 1;
                const done = creationPhase >= doneAt;
                const active = creationPhase === doneAt - 1;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, transition: 'all 0.35s', background: done ? 'rgba(198,255,75,0.04)' : active ? 'var(--surface)' : 'transparent', border: `1px solid ${done ? 'rgba(198,255,75,0.15)' : active ? 'var(--border)' : 'transparent'}` }}>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-syne, serif)', background: done ? 'var(--accent)' : active ? 'rgba(198,255,75,0.1)' : 'var(--surface)', border: `1px solid ${done ? 'var(--accent)' : 'var(--border)'}`, color: done ? '#000' : active ? 'var(--accent)' : 'var(--muted)' }}>
                      {done ? '✓' : i + 1}
                    </span>
                    <span style={{ fontSize: 12, color: done ? 'var(--accent)' : active ? 'var(--text)' : 'var(--muted)', transition: 'color 0.3s', fontFamily: 'var(--font-jetbrains, monospace)' }}>{label}</span>
                    {active && <span style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, animation: 'pulseDot 1s ease-in-out infinite' }} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* STEP 2: DM inbox */}
          {step === 'inbox' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#a855f7', flexShrink: 0, fontFamily: 'var(--font-syne, serif)' }}>MG</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-syne, serif)' }}>maria.g_shop</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Instagram Direct</div>
                </div>
                <div style={{ padding: '2px 8px', background: 'rgba(198,255,75,0.06)', border: '1px solid rgba(198,255,75,0.22)', borderRadius: 999, fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-jetbrains, monospace)', flexShrink: 0 }}>IG DM</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                {dmMsgs.slice(0, dmMsgCount).map((msg, i) => {
                  const isBrand = msg.sender === 'brand';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: isBrand ? 'row-reverse' : 'row', animation: 'msgIn 0.32s ease-out' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font-syne, serif)', background: isBrand ? 'rgba(198,255,75,0.1)' : 'rgba(168,85,247,0.1)', border: `1px solid ${isBrand ? 'rgba(198,255,75,0.25)' : 'rgba(168,85,247,0.25)'}`, color: isBrand ? 'var(--accent)' : '#a855f7' }}>
                        {isBrand ? brandInitials : 'MG'}
                      </div>
                      <div style={{ maxWidth: '80%', padding: '7px 10px', fontSize: 11, lineHeight: 1.5, color: '#D6D5CE', borderRadius: 10, borderBottomRightRadius: isBrand ? 2 : 10, borderBottomLeftRadius: isBrand ? 10 : 2, background: isBrand ? 'rgba(198,255,75,0.07)' : 'var(--surface)', border: `1px solid ${isBrand ? 'rgba(198,255,75,0.18)' : 'var(--border)'}` }}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {botThinking && (
                <div style={{ padding: '9px 11px', background: 'rgba(198,255,75,0.04)', border: '1px solid rgba(198,255,75,0.18)', borderRadius: 9, flexShrink: 0, animation: 'msgIn 0.3s ease-out' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontFamily: 'var(--font-syne, serif)', fontWeight: 600 }}>🤖 Kefy Autopilot</div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-jetbrains, monospace)', lineHeight: 1.5 }}>{botThinking}</div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Pipeline */}
          {step === 'pipeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="demo-lead-card">
                <div className="demo-lead-hd">
                  <div className="demo-lead-av">{(copy.leadName ?? 'M')[0]}</div>
                  <div className="demo-lead-meta">
                    <div className="demo-lead-name">{copy.leadName}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>@maria.g_shop · Instagram</div>
                  </div>
                  <div className="demo-lead-score-badge">
                    <span className="demo-lead-score-n">{copy.leadScore}</span>
                    <span className="demo-lead-score-lbl">{copy.scoreLabel}</span>
                  </div>
                </div>
                <div className="demo-score-bar-wrap">
                  <div className="demo-score-bar-label">{copy.scoreBarLabel ?? 'Score acumulado'}</div>
                  <div className="demo-score-bar">
                    <div className="demo-score-bar-fill" style={{ width: `${scoreBarWidth}%` }} />
                  </div>
                </div>
                <div className="demo-stage-row">
                  {stages.map((stage, i) => (
                    <div key={i} className={`demo-stage-pill${i === pipelineStage ? ' active' : i < pipelineStage ? ' done' : ''}`}>
                      {i < pipelineStage && <span style={{ marginRight: 3, fontSize: 9 }}>✓</span>}
                      {stage}
                    </div>
                  ))}
                </div>
              </div>
              {qualifiedVisible && (
                <div className="demo-qualified-badge">
                  <span className="demo-qualified-ic">🔥</span>
                  {copy.qualifiedLabel ?? 'Lead autocalificado ✓'}
                </div>
              )}
              {linkSentVisible && (
                <div className="demo-link-sent">
                  <div className="demo-link-sent-head">
                    <div className="demo-link-sent-lbl">{copy.linkSentLabel}</div>
                    <div className="demo-link-sent-time">{copy.linkSentTime}</div>
                  </div>
                  <div className="demo-link-sent-url">
                    <span className="demo-link-sent-ic">🔗</span>
                    <span className="demo-link-sent-href">{copy.linkSentUrl}</span>
                  </div>
                  <div className="demo-link-sent-platform">Enviado vía IG DM · Kefy Autopilot</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
