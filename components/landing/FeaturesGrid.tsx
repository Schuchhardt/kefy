import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['features'];
}

export default function FeaturesGrid({ copy }: Props) {
  const hasLayers = copy.layers && copy.layers.length > 0;

  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
        </div>

        {hasLayers ? (
          <div className="features-layers reveal" style={{ animationDelay: '0.12s' }}>
            {copy.layers!.map((layer, li) => (
              <div key={li} className={`features-layer features-layer--${layer.badgeColor || 'default'}`}>
                <div className="features-layer-head">
                  <h3 className="features-layer-name">{layer.name}</h3>
                  <span className={`features-layer-badge badge--${layer.badgeColor || 'default'}`}>{layer.badge}</span>
                </div>
                <ul className="features-layer-list">
                  {layer.items.map((item, ii) => (
                    <li key={ii}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="fgrid reveal" style={{ animationDelay: '0.12s' }}>
            {copy.items.map((item, i) => (
              <div key={i} className="fcard">
                <div className="ic">{item.ic}</div>
                <h3>{item.t}</h3>
                <p>{item.d}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
