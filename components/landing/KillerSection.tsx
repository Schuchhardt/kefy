import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['killer'];
}

const BAR_HEIGHTS = [30, 55, 45, 70, 60, 85, 75, 90, 80, 95, 88, 100];

function EngagementChart() {
  const chartH = 80;
  const barW = 8;
  const gap = 4;
  const total = BAR_HEIGHTS.length;
  const svgW = total * (barW + gap) - gap;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${chartH}`}
      preserveAspectRatio="none"
      className="dash-chart-svg"
    >
      {BAR_HEIGHTS.map((h, i) => {
        const barH = (h / 100) * chartH;
        const x = i * (barW + gap);
        const isAccent = h > 80;
        return (
          <rect
            key={i}
            x={x}
            y={chartH - barH}
            width={barW}
            height={barH}
            rx="2"
            fill={isAccent ? 'var(--accent)' : 'var(--border)'}
            style={{
              transformBox: 'fill-box' as React.CSSProperties['transformBox'],
              transformOrigin: 'bottom center',
              animationName: 'barGrow',
              animationDuration: '0.8s',
              animationTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
              animationDelay: `${i * 0.04}s`,
              animationFillMode: 'both',
              animationTimeline: 'view(block)',
              animationRange: 'entry 0% entry 35%',
            } as React.CSSProperties}
          />
        );
      })}
    </svg>
  );
}

export default function KillerSection({ copy }: Props) {
  return (
    <section className="section" id="metrics">
      <div className="container">
        <div className="killer">
          {/* Left */}
          <div>
            <div className="reveal">
              <span className="label">{copy.tag}</span>
              <h2 className="h2" style={{ marginTop: '18px', marginBottom: '16px' }}>
                {copy.h2[0]}
                <br />
                {copy.h2[1]}
                <br />
                <em className="em">{copy.h2[2]}</em>
              </h2>
              <p className="intro">{copy.sub}</p>
            </div>

            <div className="killer-points">
              {copy.points.map((pt, i) => (
                <div key={i} className="killer-point">
                  <div className="k">{pt.k}</div>
                  <p>{pt.d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Dashboard mock */}
          <div
            className="dash reveal"
            style={{ animationDelay: '0.15s' }}
          >
            <div className="dash-head">
              <div className="dash-title">{copy.dash.title}</div>
              <div className="dash-range">{copy.dash.range}</div>
            </div>

            <div className="dash-stats">
              {copy.dash.stats.map((s, i) => (
                <div key={i} className="dash-stat">
                  <div className="lbl">{s.lbl}</div>
                  <div className="v">{s.v}</div>
                  <div className="delta">{s.d}</div>
                </div>
              ))}
            </div>

            <div className="dash-posts">
              {copy.dash.posts.map((post, i) => (
                <div
                  key={i}
                  className={`dash-post${post.winner ? ' winner' : ''}`}
                >
                  <div className="dash-post-ic">{post.ic}</div>
                  <div className="dash-post-text">{post.text}</div>
                  <div className={`dash-post-eng${post.winner ? ' high' : ''}`}>
                    {post.eng}
                  </div>
                  <button
                    className={`dash-boost${post.winner ? '' : ' ghost'}`}
                  >
                    {post.boost}
                  </button>
                </div>
              ))}
            </div>

            <div className="dash-chart">
              <div className="dash-chart-lbl">Engagement trend</div>
              <EngagementChart />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
