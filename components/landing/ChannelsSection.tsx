import ChannelIcon from '@/components/ui/ChannelIcon';
import type { KefyCopy } from '@/types/locales';

interface Props {
  copy: KefyCopy['channels'];
}

// Redes a las que se publica. Se muestra dentro de la sección de prueba
// (Testimonials): «11 redes» se dice una sola vez, con la misma lista. Antes
// eran 12 chips (incluía «Meta Ads», que no es una red conectable) frente a
// «11 redes conectables» más abajo en la misma página.
export default function ChannelsSection({ copy }: Props) {
  return (
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

      <ul className="channels-list" style={{ listStyle: 'none', padding: 0 }}>
        {copy.items.map((ch) => (
          <li key={ch} className="channel-chip">
            <span className="channel-ic" aria-hidden="true">
              <ChannelIcon name={ch} size={16} />
            </span>
            {ch}
          </li>
        ))}
      </ul>
    </div>
  );
}
