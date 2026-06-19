import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['testi'];
}

export default function Testimonials({ copy }: Props) {
  if (copy.items.length === 0) {
    return (
      <section className="section" id="testimonials">
        <div className="container">
          <div className="section-head reveal">
            <span className="label">{copy.tag}</span>
            <h2 className="h2">{copy.h2}</h2>
            {copy.placeholder && (
              <p className="testi-placeholder">{copy.placeholder}</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Duplicate for seamless marquee loop
  const items = [...copy.items, ...copy.items];

  return (
    <section className="section" id="testimonials">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
        </div>
      </div>

      <div className="marquee">
        <div className="marquee-track">
          {items.map((t, i) => (
            <div key={i} className="testi">
              <p className="testi-q">{t.q}</p>
              <div className="testi-who">
                <div className="testi-avatar">{t.avatar}</div>
                <div>
                  <div className="testi-name">{t.name}</div>
                  <div className="testi-role">{t.role}</div>
                </div>
                <div className="testi-flag">{t.flag}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
