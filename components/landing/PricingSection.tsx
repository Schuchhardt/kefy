'use client';

import { useWaitlistOpen } from '@/components/ui/WaitlistContext';
import type { KefyCopy, PlanFeature } from '@/lib/content';

interface Props {
  copy: KefyCopy['pricing'];
}

export default function PricingSection({ copy }: Props) {
  const openWaitlist = useWaitlistOpen();

  return (
    <section className="section" id="pricing">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
        </div>

        <div className="plans reveal" style={{ animationDelay: '0.1s' }}>
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
                onClick={openWaitlist}
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
