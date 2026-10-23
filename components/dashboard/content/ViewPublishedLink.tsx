// «Ver publicado»: abre en una pestaña nueva el post en la red donde salió.
// La URL viene de kefy_scheduled_posts.platform_post_url (ver docs/zernio.md,
// «URL pública del post»); sin URL no se pinta nada.

import { ButtonLink } from '@/components/ui/Button';
import Icon from '@/components/ui/icons';
import { NET_LABEL } from '@/components/dashboard/NetworkPreview';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

const COMMON = { es: esCommon, en: enCommon } as const;

interface Props {
  url: string | null | undefined;
  platform: string | null | undefined;
  lang: 'es' | 'en';
  size?: 'sm' | 'md';
  variant?: 'secondary' | 'ghost';
  /** «Ver en Instagram» en vez de «Ver publicado»: cuando hay varios juntos. */
  withNetwork?: boolean;
}

export default function ViewPublishedLink({
  url, platform, lang, size = 'sm', variant = 'secondary', withNetwork = false,
}: Props) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const t = COMMON[lang].actions;
  const network = platform ? (NET_LABEL[platform] ?? platform) : '';
  const label = withNetwork && network ? t.viewOn(network) : t.viewPublished;
  // El nombre accesible empieza por el texto visible (WCAG 2.5.3).
  const name = `${!withNetwork && network ? t.viewPublishedOn(network) : label} (${t.opensInNewTab})`;
  return (
    <ButtonLink
      href={url}
      external
      target="_blank"
      rel="noopener noreferrer"
      variant={variant}
      size={size}
      icon={<Icon name="external" size={14} />}
      aria-label={name}
    >
      {label}
    </ButtonLink>
  );
}
