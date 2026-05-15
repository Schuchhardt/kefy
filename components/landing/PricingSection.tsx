'use client';

import { useReveal } from '@/hooks/useReveal';
import type { KefyCopy, PlanFeature } from '@/lib/content';

interface Props {
  copy: KefyCopy['pricing'];
}

export default function PricingSection({ copy }: Props) {
  const [headRef, headSeen] = useReveal();
  const [plansRef, plansSeen] = useReveal();

  return (
    <section className="section" id="pricing">
      <div className="container">
        <div
          ref={headRef as React.RefObject<HTMLDivElement>}
          className={`section-head reveal${headSeen ? ' is-in' : ''}`}
        >
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
        </div>

        <div
          ref={plansRef as React.RefObject<HTMLDivElement>}
          className={`plans reveal${plansSeen ? ' is-in' : ''}`}
        >
          {copy.plans.map((plan, i) => (
            <div
              key={i}
              className={`plan${plan.featured ? ' featured' : ''}`}
              style={{ transitionDelay: `${i * 0.1}s` }}
            >
              {plan.badge && <div className="plan-badge">{plan.badge}</div>}
              <div className="plan-name">{plan.name}</div>
              <div className="plan-price">
                <span className="num">${plan.price}</span>
                <span className="per">{plan.per}</span>
              </div>
              <div className="plan-tagline">{plan.tagline}</div>
              <ul className="plan-features">
                {plan.features.map((feat, fi) => {
                  if (typeof feat === 'string') {
                    return <li key={fi}>{feat}</li>;
                  }
                  return (
                    <li key={fi} className="dim">
                      {(feat as PlanFeature).t}
                    </li>
                  );
                })}
              </ul>
              <button
                className={`btn ${plan.featured ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="pricing-closer">{copy.closer}</p>
      </div>
    </section>
  );
}
