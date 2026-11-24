import Image from 'next/image';
import Link from 'next/link';
import Icon from '@/components/ui/icons';
import { NICHE_IDS, nicheImage, nichePath } from '@/lib/niches';
import type { NichesCopy } from '@/locales/es/niches';

/** «Hecho para tu rubro»: una tarjeta por landing de rubro (home). */
export default function NicheGrid({ copy, lang }: { copy: NichesCopy; lang: string }) {
  return (
    <section className="section" id="niches" aria-labelledby="niches-title">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.index.tag}</span>
          <h2 id="niches-title" className="h2">{copy.index.h2}</h2>
          <p className="intro">{copy.index.sub}</p>
        </div>
        <ul className="niche-grid reveal">
          {NICHE_IDS.map((id) => (
            <li key={id}>
              <Link href={nichePath(id, lang)} className="niche-card">
                {/* Decorativa: el nombre del rubro ya está en el texto. */}
                <span className="niche-card-media">
                  <Image src={nicheImage(id).hero} alt="" fill sizes="(max-width: 640px) 72px, 300px" />
                </span>
                <span className="niche-card-name">
                  {copy.niches[id].name}
                  <Icon name="arrow-right" size={16} className="niche-card-arrow" />
                </span>
                <span className="niche-card-line">{copy.niches[id].card}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
