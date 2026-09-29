'use client';

// ─── Precios: una sola implementación ────────────────────────────────────────
//
// La home usaba PricingSimple y /precios usaba este componente, con sus propias
// tarjetas cada uno. Ahora ambos son este: `compact` para la home (tarjetas
// resumidas + enlace a la página completa) y completo para /precios.
//
// Lo que se quitó por no existir: el toggle mensual/anual (Stripe solo tiene
// precios mensuales), el modo «beta» con precios «Gratis» y los botones que
// decían «Hablar con ventas» pero llevaban al registro. Ahora el plan con
// `contact` y el bloque de empresas abren un contacto real (lib/contact.ts).

import type { KefyCopy, PlanFeature } from '@/types/locales';
import { useSignup } from '@/components/ui/SignupContext';
import { salesContactHref } from '@/lib/contact';
import { pricingPath } from '@/lib/localized-paths';

interface Props {
  copy: KefyCopy['pricing'];
  cta: KefyCopy['cta'];
  lang: string;
  /** Versión resumida para la home, con enlace a la página de precios. */
  compact?: boolean;
}

export default function PricingSection({ copy, cta, lang, compact = false }: Props) {
  const goToRegister = useSignup();

  const planButton = (plan: KefyCopy['pricing']['plans'][number], size: 'sm' | 'lg') => {
    const cls = `btn ${plan.featured ? 'btn-primary' : compact ? 'btn-ghost' : 'btn-secondary'} btn-${size}`;
    const style = { width: '100%', justifyContent: 'center' } as const;
    if (plan.contact) {
      return (
        <a className={cls} style={style} href={salesContactHref(lang, plan.name)}>
          {plan.cta}
        </a>
      );
    }
    return (
      <button type="button" className={cls} style={style} onClick={goToRegister}>
        {plan.cta}
      </button>
    );
  };

  return (
    <section className="section" id="pricing" aria-labelledby="pricing-title">
      <div className="container">

        {/* ── Cabecera ───────────────────────────────────── */}
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 id="pricing-title" className="h2" style={{ whiteSpace: 'pre-line' }}>{copy.h2}</h2>
          <p className="pricing-sub">{copy.sub}</p>
        </div>

        {/* ── Mes gratis: el CTA principal, con la nota de siempre ── */}
        <div className="trial-banner reveal" style={{ animationDelay: '0.05s' }}>
          <div className="trial-text">
            <p className="trial-title">{copy.trialBadge}</p>
            <p className="trial-sub">{copy.trialSub}</p>
          </div>
          <div className="trial-action">
            <button type="button" className="btn btn-primary btn-lg" onClick={goToRegister}>
              {cta.label}
            </button>
            <p className="trial-note">{cta.note}</p>
          </div>
        </div>

        {compact ? (
          <>
            {/* ── Resumen de planes (home) ───────────────── */}
            <div className="pricing-simple-plans reveal" style={{ animationDelay: '0.1s' }}>
              {copy.plans.map((plan) => (
                <div key={plan.name} className={`pricing-simple-plan${plan.featured ? ' featured' : ''}`}>
                  {plan.badge && <span className="plan-badge">{plan.badge}</span>}
                  <span className="pricing-simple-name">{plan.name}</span>
                  <span className="pricing-simple-price">
                    ${plan.price}<span className="pricing-simple-per">{plan.per}</span>
                  </span>
                  <p className="pricing-simple-tagline">{plan.tagline}</p>
                  {planButton(plan, 'sm')}
                </div>
              ))}
            </div>

            <div className="pricing-simple-more reveal" style={{ animationDelay: '0.15s' }}>
              <a href={pricingPath(lang)} className="btn btn-ghost btn-sm">{copy.compareAll}</a>
            </div>
          </>
        ) : (
          <>
            {/* ── Planes ──────────────────────────────────── */}
            <div className="plans reveal" style={{ animationDelay: '0.1s' }}>
              {copy.plans.map((plan, i) => (
                <div
                  key={plan.name}
                  className={`plan${plan.featured ? ' featured' : ''}`}
                  style={{ transitionDelay: `${i * 0.08}s` }}
                >
                  {plan.badge && <div className="plan-badge">{plan.badge}</div>}
                  <h3 className="plan-name">{plan.name}</h3>
                  <div className="plan-price">
                    <span className="num">${plan.price}</span>
                    <span className="per">{plan.per}</span>
                  </div>
                  <p className="plan-tagline">{plan.tagline}</p>
                  <ul className="plan-features">
                    {plan.features.map((feat, fi) =>
                      typeof feat === 'string'
                        ? <li key={fi}>{feat}</li>
                        : <li key={fi} className="dim">{(feat as PlanFeature).t}</li>,
                    )}
                  </ul>
                  {planButton(plan, 'lg')}
                </div>
              ))}
            </div>

            <div className="plan-included reveal">
              <p className="plan-included-title">{copy.included.title}</p>
              <ul>
                {copy.included.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>

            <p className="pricing-closer">{copy.closer}</p>

            {/* ── Créditos ───────────────────────────────── */}
            <div className="credit-explainer reveal" style={{ animationDelay: '0.15s' }}>
              <h3 className="h3">{copy.creditTitle}</h3>
              <ul className="credit-items" style={{ listStyle: 'none', padding: 0 }}>
                {copy.creditItems.map((item) => (
                  <li key={item.label} className="credit-item">
                    <span className="credit-ic" aria-hidden="true">{item.ic}</span>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
              <p className="credit-note">{copy.creditNote}</p>
            </div>

            {/* ── Tabla comparativa ─────────────────────── */}
            <div className="pricing-cmp reveal" style={{ animationDelay: '0.25s' }}>
              <p className="pricing-cmp-hint" aria-hidden="true">{copy.cmpScrollHint} →</p>
              <div className="pricing-cmp-scroll" role="region" aria-label={copy.cmpFeature} tabIndex={0}>
                <table className="pricing-cmp-table">
                  <thead>
                    <tr>
                      <th scope="col">{copy.cmpFeature}</th>
                      {copy.plans.map((p) => (
                        <th key={p.name} scope="col" className={p.featured ? 'featured' : ''}>{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {copy.cmpRows.map((row) => (
                      <tr key={row.feature}>
                        <th scope="row">{row.feature}</th>
                        {row.values.map((v, j) => (
                          <td key={j} className={copy.plans[j]?.featured ? 'featured' : ''}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── FAQ ────────────────────────────────────── */}
            <div className="pricing-faq reveal" style={{ animationDelay: '0.3s' }}>
              <h3 className="h3">{copy.faqTitle}</h3>
              <div className="faq-list">
                {copy.faq.map((item) => (
                  <div key={item.q} className="faq-item">
                    <p className="faq-q">{item.q}</p>
                    <p className="faq-a">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Más de 15 marcas ───────────────────────── */}
            <div className="enterprise-cta reveal" style={{ animationDelay: '0.35s' }}>
              <p className="enterprise-title">{copy.enterpriseTitle}</p>
              <p className="enterprise-sub">{copy.enterpriseSub}</p>
              <a className="btn btn-secondary btn-lg" href={salesContactHref(lang)}>
                {copy.enterpriseCta}
              </a>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
