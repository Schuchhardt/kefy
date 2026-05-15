import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['features'];
}

export default function FeaturesGrid({ copy }: Props) {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
        </div>

        <div className="fgrid reveal" style={{ animationDelay: '0.12s' }}>
          {copy.items.map((item, i) => (
            <div key={i} className="fcard">
              <div className="ic">{item.ic}</div>
              <h3>{item.t}</h3>
              <p>{item.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
