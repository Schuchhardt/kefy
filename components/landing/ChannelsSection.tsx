import ChannelIcon from '@/components/ui/ChannelIcon';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['channels'];
}

export default function ChannelsSection({ copy }: Props) {
  return (
    <section className="channels-section" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="container">
        <div className="channels-inner reveal">
          <div>
            <h3 className="h3">
              {copy.h3[0]}{' '}
              <em className="em">{copy.h3[1]}</em>
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '15px', marginTop: '14px', maxWidth: '42ch' }}>
              {copy.sub}
            </p>
          </div>

          <div className="channels-list">
            {copy.items.map((ch, i) => (
              <div key={i} className="channel-chip">
                <span className="channel-ic">
                  <ChannelIcon name={ch} size={16} />
                </span>
                {ch}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
