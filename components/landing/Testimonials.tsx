import ChannelsSection from './ChannelsSection';
import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['testi'];
  channels: KefyCopy['channels'];
}

/**
 * Prueba de producto + redes.
 *
 * Esta sección mostraba testimonios firmados por personas y negocios que no
 * existen. Mientras no haya clientes de la beta que hayan dado permiso para
 * citarlos, muestra hechos comprobables en el propio producto: a qué redes se
 * publica, qué formatos genera, en qué idiomas y qué incluye el mes gratis.
 * Canales y prueba van juntos para no repetir la cifra de redes.
 */
export default function Testimonials({ copy, channels }: Props) {
  return (
    <section className="section" id="proof" aria-labelledby="proof-title">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 id="proof-title" className="h2">{copy.h2}</h2>
          <p className="intro">{copy.sub}</p>
        </div>

        <ChannelsSection copy={channels} />

        <ul className="proof-grid reveal" style={{ listStyle: 'none', padding: 0 }}>
          {copy.proof.map((p) => (
            <li key={p.lbl} className="proof-item">
              <span className="proof-k">{p.k}</span>
              <span className="proof-lbl">{p.lbl}</span>
              <p className="proof-d">{p.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
