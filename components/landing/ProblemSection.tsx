import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['problem'];
}

// Lista de dolores. Antes cada uno pintaba un <p> vacío (la descripción no
// tenía texto) y el número decorativo ocupaba una columna fija de 64px que en
// móvil se comía un sexto del ancho.
export default function ProblemSection({ copy }: Props) {
  return (
    <section className="section" id="problem" aria-labelledby="problem-title">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 id="problem-title" className="h2">{copy.h2}</h2>
        </div>

        <ul className="pain-list problem-grid no-stats" style={{ listStyle: 'none', padding: 0 }}>
          {copy.pains.map((pain, i) => (
            <li key={pain.num} className="pain reveal" style={{ animationDelay: `${i * 0.06}s` }}>
              <span className="pain-num" aria-hidden="true">{pain.num}</span>
              <h3>{pain.t}</h3>
            </li>
          ))}
        </ul>

        <p className="problem-result reveal">{copy.result}</p>
      </div>
    </section>
  );
}
