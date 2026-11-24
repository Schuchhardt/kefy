import Icon, { type IconName } from '@/components/ui/icons';
import { SignupProvider } from '@/components/ui/SignupContext';
import { KEFY_COPY, nichesCopy } from '@/lib/content';
import { MANAGED_SERVICE_PRICE_USD, PLAN_PRICES_USD, formatPlanNumber } from '@/lib/plans';
import { NICHE_OFFER, nichePath, type NicheId } from '@/lib/niches';
import { SITE_URL } from '@/lib/share-metadata';
import Nav from './Nav';
import Footer from './Footer';
import OffersSection from './OffersSection';
import SignupButton from './SignupButton';
import WhatsappLink from './WhatsappLink';

// ─── Landing de un rubro ─────────────────────────────────────────────────────
//
// Siete secciones cortas, en el orden en que alguien que llega desde un correo
// decide: (1) esto es para mi rubro y me dice qué gano, (2) sí, eso me pasa,
// (3) qué hacen exactamente, (4) cómo se vería en mi cuenta, (5) cuánto
// cuesta, (6) dudas, (7) hablemos. Los demás rubros están en el pie. Sin vídeo
// ni demo animada: es la página a la que se llega desde el móvil, y tiene que
// cargar rápido.
// Ver docs/landings-por-rubro.md.

const DOES_ICONS: Record<'service' | 'platform', IconName[]> = {
  service: ['calendar', 'target', 'inbox'],
  platform: ['brand', 'calendar', 'inbox'],
};

export default function NicheLanding({ id, lang }: { id: NicheId; lang: string }) {
  const landing = KEFY_COPY[lang] ?? KEFY_COPY.es;
  const copy = nichesCopy(lang);
  const niche = copy.niches[id];
  const offer = NICHE_OFFER[id];
  const isService = offer === 'service';
  const num = (n: number) => formatPlanNumber(n, lang);
  const prices = [num(MANAGED_SERVICE_PRICE_USD), num(PLAN_PRICES_USD.starter)] as const;
  const faq = [
    ...niche.faq,
    ...(isService ? copy.faqService : copy.faqPlatform).map((f) => ({ q: f.q, a: f.a(...prices) })),
  ];

  // CTA principal y secundario: el servicio se conversa por WhatsApp; la
  // plataforma (agencias) se prueba gratis.
  const ctaButtons = isService ? (
    <>
      <WhatsappLink text={niche.whatsapp} className="btn btn-primary btn-lg" newTabLabel={copy.ctas.newTab}>
        {copy.ctas.whatsapp}
      </WhatsappLink>
      <SignupButton className="btn btn-secondary btn-lg">{copy.ctas.diy}</SignupButton>
    </>
  ) : (
    <>
      <SignupButton className="btn btn-primary btn-lg">{landing.cta.label}</SignupButton>
      <WhatsappLink text={niche.whatsapp} className="btn btn-secondary btn-lg" newTabLabel={copy.ctas.newTab}>
        {copy.ctas.demo}
      </WhatsappLink>
    </>
  );
  const note = isService ? copy.ctas.serviceNote(prices[0]) : landing.cta.note;

  const url = `${SITE_URL}${nichePath(id, lang)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Kefy', item: `${SITE_URL}/${lang}` },
          { '@type': 'ListItem', position: 2, name: niche.name, item: url },
        ],
      },
      isService
        ? {
          '@type': 'Service',
          name: `${copy.offers.service.title} · ${niche.name}`,
          description: niche.meta.description,
          provider: { '@id': `${SITE_URL}/#organization` },
          areaServed: 'CL',
          url,
          offers: {
            '@type': 'Offer',
            price: String(MANAGED_SERVICE_PRICE_USD),
            priceCurrency: 'USD',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: String(MANAGED_SERVICE_PRICE_USD),
              priceCurrency: 'USD',
              unitCode: 'MON',
            },
          },
        }
        : {
          '@type': 'SoftwareApplication',
          name: 'Kefy',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: niche.meta.description,
          url,
          offers: { '@type': 'Offer', price: String(PLAN_PRICES_USD.pro), priceCurrency: 'USD' },
        },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <SignupProvider lang={lang}>
      {/* La landing es siempre oscura, sea cual sea el tema del dashboard. */}
      <div data-theme="dark">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Nav lang={lang} copy={landing.nav} cta={landing.cta} />

        <main>
          {/* 1. Para quién y qué gana */}
          <section className="niche-hero" aria-labelledby="niche-title">
            <div className="container">
              <p className="hero-tag reveal">
                <span className="dot" aria-hidden="true" />
                {niche.hero.tag}
              </p>
              <h1 id="niche-title" className="h1 niche-h1 reveal">
                {niche.hero.h1}
                <br />
                <em className="em">{niche.hero.em}</em>
              </h1>
              <p className="hero-sub reveal">{niche.hero.sub}</p>
              <div className="reveal">
                <div className="cta-row">{ctaButtons}</div>
                <p className="hero-cta-note">{note}</p>
              </div>
            </div>
          </section>

          {/* 2. Lo que le pasa hoy (los ganchos de los correos) */}
          <section className="section" id="problem" aria-labelledby="pains-title">
            <div className="container">
              <div className="section-head reveal">
                <span className="label">{copy.labels.pains}</span>
                <h2 id="pains-title" className="h2">{niche.pains.h2}</h2>
              </div>
              <ol className="pain-list niche-pains">
                {niche.pains.items.map((p, i) => (
                  <li key={p.t} className="pain reveal">
                    <span className="pain-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3>{p.t}</h3>
                      <p>{p.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* 3. Qué hacemos */}
          <section className="section" id="how" aria-labelledby="does-title">
            <div className="container">
              <div className="section-head reveal">
                <span className="label">{copy.labels.does}</span>
                <h2 id="does-title" className="h2">{niche.does.h2}</h2>
              </div>
              <ul className="steps">
                {niche.does.items.map((item, i) => (
                  <li key={item.t} className="step reveal">
                    <div className="step-ic" aria-hidden="true">
                      <Icon name={DOES_ICONS[offer][i] ?? 'check'} size={20} />
                    </div>
                    <h3>{item.t}</h3>
                    <p>{item.d}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 4. Cómo se vería en su cuenta */}
          <section className="section" id="ideas" aria-labelledby="ideas-title">
            <div className="container">
              <div className="section-head reveal">
                <span className="label">{copy.labels.ideas}</span>
                <h2 id="ideas-title" className="h2">{niche.ideas.h2}</h2>
                <p className="intro">{niche.ideas.sub}</p>
              </div>
              <ul className="niche-ideas reveal">
                {niche.ideas.items.map((idea) => (
                  <li key={idea} className="niche-idea">
                    <Icon name="post" size={18} className="niche-idea-ic" />
                    {idea}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 5. Cuánto cuesta */}
          <OffersSection
            copy={copy}
            variant={isService ? 'service-first' : 'agency'}
            whatsapp={niche.whatsapp}
            lang={lang}
          />

          {/* 6. Dudas */}
          <section className="section" id="faq" aria-labelledby="faq-title">
            <div className="container niche-faq">
              <div className="section-head reveal">
                <h2 id="faq-title" className="h2">{copy.labels.faq}</h2>
              </div>
              <dl className="faq-list">
                {faq.map((f) => (
                  <div key={f.q} className="faq-item">
                    <dt className="faq-q">{f.q}</dt>
                    <dd className="faq-a">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* 7. Hablemos */}
          <section className="final reveal" id="cta" aria-labelledby="final-title">
            <h2 id="final-title" className="h2">{niche.final.h2}</h2>
            <p>{niche.final.sub}</p>
            <div className="cta-row cta-row--center">{ctaButtons}</div>
            <p className="final-note">{note}</p>
          </section>

        </main>

        <Footer copy={landing.footer} lang={lang} />
      </div>
    </SignupProvider>
  );
}
