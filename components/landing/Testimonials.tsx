import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['testi'];
}

/**
 * Prueba de producto.
 *
 * Esta sección mostraba testimonios firmados por personas y negocios que no
 * existen. Mientras no haya clientes de la beta que hayan dado permiso para
 * citarlos, muestra hechos comprobables en el propio producto: cuántas redes se
 * pueden conectar, qué formatos genera, en qué idiomas y qué incluye el mes
 * gratis. Todos son verificables abriendo la app.
 */
export default function Testimonials({ copy }: Props) {
  return (
    <section className="section" id="proof">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
          <p className="intro">{copy.sub}</p>
        </div>

        <div className="proof-grid reveal" style={{ animationDelay: '0.1s' }}>
          {copy.proof.map((p, i) => (
            <div key={i} className="proof-item" style={{ transitionDelay: `${i * 0.06}s` }}>
              <span className="proof-k">{p.k}</span>
              <span className="proof-lbl">{p.lbl}</span>
              <p className="proof-d">{p.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
