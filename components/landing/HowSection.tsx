import Icon, { type IconName } from '@/components/ui/icons';
import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['how'];
}

const ICONS = new Set<string>(['brand', 'content', 'inbox', 'sparkles', 'calendar', 'bolt']);

// Tres pasos (antes «Un sistema. Tres capas.» presentaba cinco, con el detalle
// del scoring en puntos que a quien tiene una tienda no le dice nada).
export default function HowSection({ copy }: Props) {
  return (
    <section className="section" id="how" aria-labelledby="how-title">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 id="how-title" className="h2">{copy.h2}</h2>
        </div>

        <ol className="steps" style={{ listStyle: 'none', padding: 0 }}>
          {copy.steps.map((step, i) => (
            <li key={step.n} className="step reveal" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="step-ic" aria-hidden="true">
                {ICONS.has(step.ic) ? <Icon name={step.ic as IconName} size={20} /> : step.ic}
              </div>
              <h3>{step.t}</h3>
              <p>{step.d}</p>
              {/* Número «fantasma» decorativo (contraste bajo a propósito): va en
                  un pseudo-elemento para que no cuente como texto. */}
              <div className="step-num" aria-hidden="true" data-num={step.n} />
            </li>
          ))}
        </ol>

        <p className="how-closer reveal">
          {copy.closer[0]}{' '}
          <span className="how-closer-pill">{copy.closer[1]}</span>{' '}
          {copy.closer[2]}
        </p>
      </div>
    </section>
  );
}
