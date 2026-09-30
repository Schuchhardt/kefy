'use client';

// ─── Primeros pasos (home del dashboard) ─────────────────────────────────────
//
// Sustituye al modal «Bienvenido», que listaba tres pasos informativos sin
// enlaces, se reabría en cada visita y estaba en otro orden que la página
// (docs/auditoria-ux.md §5.6). Aquí cada paso tiene su estado real, van en el
// orden en que se hacen y solo el siguiente pendiente lleva el botón
// principal: un solo CTA por estado.

import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/icons';
import esHome from '@/locales/es/dashboard/home';
import enHome from '@/locales/en/dashboard/home';
import styles from './WelcomeChecklist.module.css';

export type WelcomeStepKey = 'posts' | 'brand' | 'social' | 'publish';

export interface WelcomeStep {
  key: WelcomeStepKey;
  done: boolean;
  href: string;
  /** Texto propio (p. ej. con el porcentaje de la marca). */
  desc?: string;
}

export default function WelcomeChecklist({ lang, steps, onHide }: {
  lang: string;
  steps: WelcomeStep[];
  onHide: () => void;
}) {
  const t = (lang === 'en' ? enHome : esHome).welcome;
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done);

  return (
    <section className={styles.card} aria-labelledby="welcome-title">
      <div className={styles.head}>
        <div>
          <h2 id="welcome-title" className={styles.title}>{t.title}</h2>
          <p className={styles.progressText}>{t.progress(doneCount, steps.length)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onHide} aria-label={t.hideLabel}>{t.hide}</Button>
      </div>
      <div
        className={styles.bar} role="progressbar" aria-label={t.title}
        aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}
      >
        <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ol className={styles.steps}>
        {steps.map((step, i) => {
          const copy = t.steps[step.key];
          const isCurrent = step === current;
          return (
            <li key={step.key} className={styles.step} data-done={step.done} data-current={isCurrent}>
              <span className={styles.mark} aria-hidden="true">
                {step.done ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <div className={styles.text}>
                <p className={styles.stepTitle}>
                  {copy.title}
                  <span className="sr-only"> ({step.done ? t.done : t.pending})</span>
                </p>
                {!step.done && <p className={styles.desc}>{step.desc ?? copy.desc}</p>}
              </div>
              {isCurrent ? (
                <ButtonLink href={step.href} variant="primary" size="sm" className={styles.cta}>{copy.cta}</ButtonLink>
              ) : !step.done ? (
                <Link href={step.href} className={styles.link}>{copy.cta}</Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
