import type { ReactNode } from 'react';
import Image from 'next/image';
import SignupButton from './SignupButton';
import WhatsappLink from './WhatsappLink';
import {
  MANAGED_SERVICE_PRICE_USD, PLAN_LIMITS, PLAN_PRICES_USD, formatPlanNumber, planHighlights, planName,
} from '@/lib/plans';
import { OFFER_IMAGES } from '@/lib/niches';
import type { NichesCopy } from '@/locales/es/niches';
import type { OfferCopy } from '@/types/locales';

// ─── Las dos formas de trabajar con Kefy ─────────────────────────────────────
//
// Los correos SDR venden sobre todo el servicio gestionado («lo hacemos
// nosotros», USD 200/mes) y, como alternativa, la plataforma (desde USD 49).
// La landing solo vendía la plataforma: quien llegaba desde un correo que
// decía «nos encargamos de tus redes» encontraba «Probar gratis». Esta sección
// pone las dos ofertas lado a lado.
//
// - `platform-first`: la home (la plataforma destacada).
// - `service-first`: los rubros a los que se les ofrece el servicio.
// - `agency`: agencias; Pro y Business con los topes de lib/plans.ts.

type Variant = 'platform-first' | 'service-first' | 'agency';

interface Props {
  copy: NichesCopy;
  variant: Variant;
  /** Primer mensaje de WhatsApp (el del rubro, o el genérico en la home). */
  whatsapp: string;
  lang: string;
  /** Enlace bajo las tarjetas (en la home, a la comparación de planes). */
  more?: { href: string; label: string };
}

function OfferCard({
  offer, price, featured, action, image,
}: {
  offer: Pick<OfferCopy, 'label' | 'title' | 'features' | 'note' | 'from'>;
  price: string;
  featured: boolean;
  action: ReactNode;
  /** Foto de cabecera (Higgsfield, ilustrativa). Las tarjetas de agencias no la llevan. */
  image?: { src: string; alt: string };
}) {
  return (
    <div className={`plan offer${featured ? ' featured' : ''}${image ? ' offer--media' : ''}`}>
      {image && (
        <div className="offer-media">
          <Image src={image.src} alt={image.alt} fill sizes="(max-width: 760px) 100vw, 460px" />
        </div>
      )}
      <p className="plan-name">{offer.label}</p>
      <h3 className="offer-title">{offer.title}</h3>
      <p className="offer-price">
        {/* Sin «Desde» queda la línea en blanco: así los precios de las dos
            tarjetas quedan a la misma altura. */}
        {offer.from
          ? <span className="offer-price-from">{offer.from}</span>
          : <span className="offer-price-from" aria-hidden="true">{'\u00a0'}</span>}
        {price}
      </p>
      <ul className="plan-features">
        {offer.features.map((f) => <li key={f}>{f}</li>)}
      </ul>
      {action}
      <p className="offer-note">{offer.note}</p>
    </div>
  );
}

export default function OffersSection({ copy, variant, whatsapp, lang, more }: Props) {
  const btn = (featured: boolean) => `btn ${featured ? 'btn-primary' : 'btn-secondary'} btn-lg offer-btn`;
  // Números con el separador de miles del idioma.
  const num = (n: number) => formatPlanNumber(n, lang);

  if (variant === 'agency') {
    const a = copy.offers.agency;
    return (
      <section className="section" id="offers" aria-labelledby="offers-title">
        <div className="container">
          <div className="section-head reveal">
            <span className="label">{copy.labels.offers}</span>
            <h2 id="offers-title" className="h2">{a.h2}</h2>
            <p className="intro">{a.sub}</p>
          </div>
          <div className="offers-grid reveal">
            <OfferCard
              offer={{ label: planName('pro', lang), title: a.proTagline(num(PLAN_LIMITS.pro.brands)), features: planHighlights('pro', lang), note: a.note }}
              price={a.price(num(PLAN_PRICES_USD.pro))}
              featured
              action={<SignupButton className={btn(true)}>{a.proCta}</SignupButton>}
            />
            <OfferCard
              offer={{
                label: planName('business', lang),
                title: a.businessTagline(num(PLAN_LIMITS.business.brands), num(PLAN_LIMITS.business.members)),
                features: planHighlights('business', lang),
                note: a.note,
              }}
              price={a.price(num(PLAN_PRICES_USD.business))}
              featured={false}
              action={(
                <WhatsappLink text={whatsapp} className={btn(false)} newTabLabel={copy.ctas.newTab}>
                  {a.businessCta}
                </WhatsappLink>
              )}
            />
          </div>
        </div>
      </section>
    );
  }

  const serviceFirst = variant === 'service-first';
  const service = (
    <OfferCard
      key="service"
      offer={copy.offers.service}
      price={copy.offers.service.price(num(MANAGED_SERVICE_PRICE_USD))}
      featured={serviceFirst}
      image={{ src: OFFER_IMAGES.service, alt: copy.offers.service.imageAlt }}
      action={(
        <WhatsappLink text={whatsapp} className={btn(serviceFirst)} newTabLabel={copy.ctas.newTab}>
          {copy.offers.service.cta}
        </WhatsappLink>
      )}
    />
  );
  const platform = (
    <OfferCard
      key="platform"
      offer={copy.offers.platform}
      price={copy.offers.platform.price(num(PLAN_PRICES_USD.starter))}
      featured={!serviceFirst}
      image={{ src: OFFER_IMAGES.platform, alt: copy.offers.platform.imageAlt }}
      action={<SignupButton className={btn(!serviceFirst)}>{copy.offers.platform.cta}</SignupButton>}
    />
  );

  return (
    <section className="section" id="offers" aria-labelledby="offers-title">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.labels.offers}</span>
          <h2 id="offers-title" className="h2">{copy.offers.h2}</h2>
          <p className="intro">{copy.offers.sub}</p>
        </div>
        <div className="offers-grid reveal">
          {serviceFirst ? [service, platform] : [platform, service]}
        </div>
        {more && (
          <p className="offers-more">
            <a href={more.href} className="btn btn-ghost btn-sm">{more.label}</a>
          </p>
        )}
      </div>
    </section>
  );
}
