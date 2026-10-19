'use client';

// Plan de producción de un video: las herramientas que va a correr su guion
// (imágenes, animación, voces, lipsync, montaje), cuánto cuesta cada una y el
// total con cada nivel de animación. Es la confirmación antes de gastar —
// openfilm pide permiso antes de cada clip de video; aquí se aprueba el plan
// entero de una vez (ver lib/services/video.ts).
//
// También pinta el avance de una producción en curso (VideoProgressSteps).

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import { Field, Select } from '@/components/ui/Field';
import Icon from '@/components/ui/icons';
import esVideo from '@/locales/es/dashboard/video';
import enVideo from '@/locales/en/dashboard/video';
import type { VideoPlanView, PlanStepView } from '@/lib/services/video';
import type { VideoJobSnapshot } from '@/lib/video/engine';
import type { MotionLevel } from '@/lib/video/plan';
import styles from './VideoPlanPanel.module.css';

const MOTIONS: MotionLevel[] = ['none', 'key', 'full'];

function groupByShot(steps: Array<{ scene_order: number | null }>): Map<number | null, number[]> {
  const groups = new Map<number | null, number[]>();
  steps.forEach((s, i) => {
    const list = groups.get(s.scene_order) ?? [];
    list.push(i);
    groups.set(s.scene_order, list);
  });
  return groups;
}

export interface VideoPlanPanelProps {
  itemId:     string;
  format?:    'reel' | 'story';
  lang?:      'es' | 'en';
  busy?:      boolean;
  onProduce:  (motion: MotionLevel) => void;
}

export function VideoPlanPanel({ itemId, format, lang = 'es', busy = false, onProduce }: VideoPlanPanelProps) {
  const t = (lang === 'en' ? enVideo : esVideo).plan;
  const [motion, setMotion] = useState<MotionLevel>('key');
  const [plan, setPlan]     = useState<VideoPlanView | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async (m: MotionLevel) => {
    setError(null);
    try {
      const qs = new URLSearchParams({ itemId, motion: m, lang });
      if (format) qs.set('format', format);
      const res = await fetch(`/api/content/reel/plan?${qs}`, { credentials: 'include' });
      const data = await res.json() as VideoPlanView & { error?: string };
      if (!res.ok) { setError(data.error ?? t.loadError); return; }
      setPlan(data);
    } catch {
      setError(t.loadError);
    }
  }, [itemId, format, lang, t.loadError]);

  useEffect(() => { void load(motion); }, [load, motion]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!plan) {
    return (
      <div className={styles.panel} aria-busy="true">
        <p className={styles.muted}>{t.loading}</p>
      </div>
    );
  }

  const enough = plan.credits <= plan.credits_remaining;
  const groups = groupByShot(plan.steps);

  return (
    <section className={styles.panel} aria-labelledby={`video-plan-${itemId}`}>
      <div>
        <h3 id={`video-plan-${itemId}`} className={styles.title}>{t.title}</h3>
        <p className={styles.muted}>{t.intro}</p>
      </div>

      <div className={styles.meta}>
        <span>{t.shots(plan.script.scenes.length)}</span>
        <span>{t.duration(plan.script.duration_seconds)}</span>
        {plan.script.characters.length > 0 && (
          <span>{t.characters(plan.script.characters.map((c) => c.name).join(', '))}</span>
        )}
      </div>

      <Field label={t.motionLabel}>
        <Select value={motion} onChange={(e) => setMotion(e.target.value as MotionLevel)} disabled={busy}>
          {MOTIONS.map((m) => (
            <option key={m} value={m}>{`${t.motion[m]} (${t.credits(plan.credits_by_motion[m])})`}</option>
          ))}
        </Select>
      </Field>

      <ul className={styles.tools}>
        {plan.tools.map((tool) => (
          <li key={tool.tool} className={styles.tool}>
            <span>
              {t.toolCount(tool.label, tool.count)}
              <span className={styles.toolSummary}>{tool.summary}</span>
            </span>
            <span className={styles.toolCredits}>{t.credits(tool.credits)}</span>
          </li>
        ))}
      </ul>

      <div className={styles.total}>
        <span>{t.total(plan.credits)}</span>
        <span>{t.remaining(plan.credits_remaining)}</span>
      </div>

      {plan.notes.map((note) => <Notice key={note} tone="info">{note}</Notice>)}
      {!enough && <Notice tone="warning">{t.notEnough}</Notice>}

      <details className={styles.steps}>
        <summary>{t.stepsToggle(plan.steps.length)}</summary>
        {[...groups.entries()].map(([order, idx]) => (
          <div key={String(order)} className={styles.group}>
            <p className={styles.groupTitle}>{order === null ? t.general : t.shot(order)}</p>
            <ul className={styles.stepList}>
              {idx.map((i) => {
                const s: PlanStepView = plan.steps[i]!;
                return (
                  <li key={s.key} className={styles.step}>
                    <span className={styles.stepLabel}>{s.label}</span>
                    <span className={styles.stepDetail}>{s.detail}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </details>

      <p className={styles.muted}>{t.fallback}</p>

      <Button
        variant="primary"
        block
        loading={busy}
        disabled={busy || !enough}
        icon={<Icon name="video" size={16} />}
        onClick={() => onProduce(motion)}
      >
        {t.produce(plan.credits)}
      </Button>
    </section>
  );
}

/** Avance de una producción: cuántos pasos van y en qué está cada uno. */
export function VideoProgressSteps({ production, lang = 'es' }: { production: VideoJobSnapshot; lang?: 'es' | 'en' }) {
  const t = (lang === 'en' ? enVideo : esVideo).progress;
  const total = production.steps.length;
  const done  = production.steps.filter((s) => s.status === 'done' || s.status === 'failed' || s.status === 'skipped').length;
  const composing = production.steps.some((s) => s.tool === 'compose_video' && s.status === 'running');
  const running = production.steps.filter((s) => s.status === 'running');

  return (
    <div className={styles.panel} aria-live="polite">
      <h3 className={styles.title}>{t.title}</h3>
      <p className={styles.muted}>{composing ? t.composing : t.stepsDone(done, total)}</p>
      {running.length > 0 && !composing && (
        <ul className={styles.stepList}>
          {running.map((s) => (
            <li key={s.key} className={styles.step}>
              <span className={styles.stepLabel}>
                {t.tools[s.tool]}{s.scene_id ? ` · ${t.shot(Number(s.scene_id.slice(1)))}` : ''}
              </span>
              <span className={styles.stepStatus} data-status={s.status}>{t.status[s.status]}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.muted}>{t.slow}</p>
    </div>
  );
}
