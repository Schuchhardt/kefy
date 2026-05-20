'use client';

import { useState } from 'react';
import { useWaitlistOpen } from '@/components/ui/WaitlistContext';
import type { KefyCopy, PlanFeature } from '@/lib/content';

interface Props {
  copy: KefyCopy['pricing'];
}

export default function PricingSection({ copy }: Props) {
  const [annual, setAnnual] = useState(false);
  const openWaitlist = useWaitlistOpen();

  /* ── Beta closed mode ─────────────────────────────────── */
  if (copy.betaMode) {
    return (
      <section className="section" id="pricing">
        <div className="container">

          <div className="section-head reveal">
            <span className="label">{copy.tag}</span>
            <h2 className="h2">{copy.h2}</h2>
          </div>

          <div className="beta-pricing-copy reveal" style={{ animationDelay: '0.05s' }}>
            {copy.sub.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          {/* ── Beta plans ─────────────────────────────────── */}
          <div className="plans plans-3 reveal" style={{ animationDelay: '0.1s' }}>
            {copy.plans.map((plan, i) => (
              <div
                key={i}
                className={`plan${plan.featured ? ' featured' : ''}`}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                {plan.badge && <div className="plan-badge">{plan.badge}</div>}
                <div className="plan-name">{plan.name}</div>
                <div className="plan-price">
                  <span className="num beta-free">Gratis</span>
                  <span className="per">/ beta</span>
                </div>
                {plan.launchPrice && (
                  <p className="plan-launch-price">Al lanzar: {plan.launchPrice}</p>
                )}
                <p className="plan-tagline">{plan.tagline}</p>
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

          {/* ── Beta feature table ─────────────────────────── */}
          <div className="pricing-cmp reveal" style={{ animationDelay: '0.15s' }}>
            <div className="pricing-cmp-scroll">
              <table className="pricing-cmp-table">
                <thead>
                  <tr>
                    <th>{copy.cmpFeature}</th>
                    {copy.plans.map((p, i) => (
                      <th key={i} className={p.featured ? 'featured' : ''}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {copy.cmpRows.map((row, i) => (
                    <tr key={i}>
                      <td>{row.feature}</td>
                      {row.values.map((v, j) => (
                        <td key={j} className={copy.plans[j]?.featured ? 'featured' : ''}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Single beta CTA ────────────────────────────── */}
          <div className="beta-pricing-cta reveal" style={{ animationDelay: '0.2s' }}>
            <button className="btn btn-primary btn-lg" onClick={openWaitlist}>
              {copy.betaCta}
            </button>
            {copy.betaCtaNote && (
              <p className="beta-cta-note">{copy.betaCtaNote}</p>
            )}
          </div>

          {/* ── FAQ ─────────────────────────────────────────── */}
          <div className="pricing-faq reveal" style={{ animationDelay: '0.25s' }}>
            <h3 className="h3">{copy.faqTitle}</h3>
            <div className="faq-list">
              {copy.faq.map((item, i) => (
                <div key={i} className="faq-item">
                  <p className="faq-q">{item.q}</p>
                  <p className="faq-a">{item.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Enterprise CTA ──────────────────────────────── */}
          <div className="enterprise-cta reveal" style={{ animationDelay: '0.3s' }}>
            <p className="enterprise-title">{copy.enterpriseTitle}</p>
            <p className="enterprise-sub">{copy.enterpriseSub}</p>
            <button className="btn btn-secondary btn-lg" onClick={openWaitlist}>
              {copy.enterpriseCta}
            </button>
          </div>

        </div>
      </section>
    );
  }

  /* ── Standard (non-beta) mode ─────────────────────────── */
  return (
    <section className="section" id="pricing">
      <div className="container">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2" style={{ whiteSpace: 'pre-line' }}>{copy.h2}</h2>
          <p className="pricing-sub">{copy.sub}</p>
        </div>

        {/* ── Trial banner ───────────────────────────────── */}
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

        {/* ── Billing toggle ─────────────────────────────── */}
        <div className="billing-toggle reveal" style={{ animationDelay: '0.08s' }}>
          <button
            className={`toggle-opt${!annual ? ' active' : ''}`}
            onClick={() => setAnnual(false)}
          >
            {copy.billingToggle.monthly}
          </button>
          <button
            className={`toggle-opt${annual ? ' active' : ''}`}
            onClick={() => setAnnual(true)}
          >
            {copy.billingToggle.annual}
          </button>
        </div>

        {/* ── Plans grid ─────────────────────────────────── */}
        <div className="plans plans-4 reveal" style={{ animationDelay: '0.1s' }}>
          {copy.plans.map((plan, i) => (
            <div
              key={i}
              className={`plan${plan.featured ? ' featured' : ''}`}
              style={{ transitionDelay: `${i * 0.08}s` }}
            >
              {plan.badge && <div className="plan-badge">{plan.badge}</div>}
              <div className="plan-name">{plan.name}</div>
              <div className="plan-price">
                <span className="num">${annual && plan.annualPrice ? plan.annualPrice : plan.price}</span>
                <span className="per">{plan.per}</span>
              </div>
              {annual && plan.annualBilled && (
                <p className="plan-billed">{plan.annualBilled}</p>
              )}
              <p className="plan-tagline">{plan.tagline}</p>
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

        {/* ── Credits explainer ──────────────────────────── */}
        <div className="credit-explainer reveal" style={{ animationDelay: '0.15s' }}>
          <h3 className="h3">{copy.creditTitle}</h3>
          <div className="credit-items">
            {copy.creditItems.map((item, i) => (
              <div key={i} className="credit-item">
                <span className="credit-ic">{item.ic}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <p className="credit-note">{copy.creditNote}</p>
          <a href="#credit-packs" className="btn btn-ghost btn-sm">{copy.creditPacksCta}</a>
        </div>

        {/* ── Credit packs ───────────────────────────────── */}
        <div className="credit-packs reveal" id="credit-packs" style={{ animationDelay: '0.2s' }}>
          <h3 className="h3">{copy.packTitle}</h3>
          <div className="packs-grid">
            {copy.packs.map((pack, i) => (
              <div key={i} className={`pack-card${pack.popular ? ' popular' : ''}`}>
                {pack.popular && <span className="pack-badge">{copy.packPopular}</span>}
                <span className="pack-credits">{pack.credits}</span>
                <span className="pack-arrow">→</span>
                <span className="pack-price">{pack.price}</span>
              </div>
            ))}
          </div>
          <p className="pack-note">{copy.packNote}</p>
        </div>

        {/* ── Comparison table ───────────────────────────── */}
        <div className="pricing-cmp reveal" style={{ animationDelay: '0.25s' }}>
          <div className="pricing-cmp-scroll">
            <table className="pricing-cmp-table">
              <thead>
                <tr>
                  <th>{copy.cmpFeature}</th>
                  {copy.plans.map((p, i) => (
                    <th key={i} className={p.featured ? 'featured' : ''}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {copy.cmpRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.feature}</td>
                    {row.values.map((v, j) => (
                      <td key={j} className={copy.plans[j]?.featured ? 'featured' : ''}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FAQ ────────────────────────────────────────── */}
        <div className="pricing-faq reveal" style={{ animationDelay: '0.3s' }}>
          <h3 className="h3">{copy.faqTitle}</h3>
          <div className="faq-list">
            {copy.faq.map((item, i) => (
              <div key={i} className="faq-item">
                <p className="faq-q">{item.q}</p>
                <p className="faq-a">{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Enterprise CTA ─────────────────────────────── */}
        <div className="enterprise-cta reveal" style={{ animationDelay: '0.35s' }}>
          <p className="enterprise-title">{copy.enterpriseTitle}</p>
          <p className="enterprise-sub">{copy.enterpriseSub}</p>
          <button className="btn btn-secondary btn-lg" onClick={openWaitlist}>
            {copy.enterpriseCta}
          </button>
        </div>

      </div>
    </section>
  );
}
