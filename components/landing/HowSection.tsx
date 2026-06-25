import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['how'];
}

export default function HowSection({ copy }: Props) {
  return (
    <section className="section" id="how">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
          <p className="intro">{copy.intro}</p>
        </div>

        <div className="steps">
          {copy.steps.map((step, i) => {
            const isLast = i === copy.steps.length - 1;
            return (
              <div
                key={i}
                className={`step${isLast ? ' last' : ''} reveal`}
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="step-ic">{step.ic}</div>
                <h3>{step.t}</h3>
                <p>{step.d}</p>
                <div className="step-num">{step.n}</div>
              </div>
            );
          })}
        </div>

        <div className="how-closer reveal">
          {copy.closer[0]}{' '}
          <span className="how-closer-pill">{copy.closer[1]}</span>{' '}
          {copy.closer[2]}
        </div>

        {copy.noNeeds && copy.noNeeds.length > 0 && (
          <ul className="how-no-needs reveal" style={{ animationDelay: '0.2s' }}>
            {copy.noNeeds.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
