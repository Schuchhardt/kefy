'use client';

import { useWaitlistOpen } from '@/components/ui/WaitlistContext';
import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['pricing'];
  lang: string;
}

export default function PricingSimple({ copy, lang }: Props) {
  const openWaitlist = useWaitlistOpen();
  const pricingHref = `/${lang}/precios`;

  return (
    <section className="section" id="pricing">
      <div className="container">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2" style={{ whiteSpace: 'pre-line' }}>{copy.h2}</h2>
          <p className="pricing-sub">{copy.sub}</p>
        </div>

        {/* ── Trial / main CTA ───────────────────────────── */}
        <div className="trial-banner reveal" style={{ animationDelay: '0.05s' }}>
          <div className="trial-text">
            <p className="trial-title">{copy.trialBadge}</p>
            <p className="trial-sub">{copy.trialSub}</p>
          </div>
          <div className="trial-action">
            <button className="btn btn-primary btn-lg" onClick={openWaitlist}>
              {copy.trialCta}
            </button>
            <p className="trial-note">{copy.trialNote}</p>
          </div>
        </div>

        {/* ── Simple plan list ───────────────────────────── */}
        <div className="pricing-simple-plans reveal" style={{ animationDelay: '0.1s' }}>
          {copy.plans.map((plan, i) => (
            <div key={i} className={`pricing-simple-plan${plan.featured ? ' featured' : ''}`}>
              {plan.badge && <span className="plan-badge">{plan.badge}</span>}
              <span className="pricing-simple-name">{plan.name}</span>
              <span className="pricing-simple-price">${plan.price}<span className="pricing-simple-per">{plan.per}</span></span>
              <p className="pricing-simple-tagline">{plan.tagline}</p>
              <button
                className={`btn ${plan.featured ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                onClick={openWaitlist}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* ── Link to full pricing page ──────────────────── */}
        <div className="pricing-simple-more reveal" style={{ animationDelay: '0.15s' }}>
          <a href={pricingHref} className="btn btn-ghost btn-sm">
            {lang === 'en' ? 'Compare all plans →' : 'Comparar todos los planes →'}
          </a>
        </div>

      </div>
    </section>
  );
}
