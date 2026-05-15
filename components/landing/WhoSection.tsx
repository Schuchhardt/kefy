import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['who'];
}

export default function WhoSection({ copy }: Props) {
  return (
    <section className="section" id="who">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2">
            {copy.h2[0]}{' '}
            <em className="em">{copy.h2[1]}</em>{' '}
            {copy.h2[2]}
          </h2>
        </div>

        <div className="who-grid reveal" style={{ animationDelay: '0.12s' }}>
          {copy.segments.map((seg, i) => (
            <div key={i} className="who-card" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="who-ic">{seg.ic}</div>
              <div>
                <h3>{seg.t}</h3>
                <p>{seg.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
