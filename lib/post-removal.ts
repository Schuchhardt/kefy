import { getChannelLabel } from '@/lib/channels';
import { msg } from '@/lib/services/errors';
import type { Channel } from '@/types/channels';

type Lang = Parameters<typeof msg>[0];

/** Dónde se abre la publicación en cada red sin borrado por API. */
const OPEN_STEP: Record<string, { es: string; en: string }> = {
  snapchat: {
    es: 'Ve a tu perfil y abre la historia o el Spotlight.',
    en: 'Go to your profile and open the Story or Spotlight.',
  },
};

/** Dónde está la opción de borrar, en las redes que la tienen en otro sitio. */
const DELETE_STEP: Record<string, { es: string; en: string }> = {
  instagram: {
    es: 'Toca los tres puntos de la publicación y elige «Eliminar».',
    en: 'Tap the three dots on the post and choose "Delete".',
  },
  tiktok: {
    es: 'Toca los tres puntos o la flecha de compartir del video y elige «Eliminar».',
    en: 'Tap the three dots or the share arrow on the video and choose "Delete".',
  },
};

/**
 * Pasos para bajar a mano una publicación que Kefy no puede borrar. Los menús
 * de cada red cambian sin aviso: por eso son genéricos y no nombran pantallas.
 */
export function manualRemovalSteps(
  platform: string | null,
  lang: Lang,
  opts: { username?: string | null; postUrl?: string | null } = {},
): string[] {
  const label = platform ? getChannelLabel(platform as Channel) : msg(lang, 'la red social', 'the social network');
  const account = opts.username ? ` ${msg(lang, 'con la cuenta', 'with the account')} @${opts.username.replace(/^@/, '')}` : '';
  const open = platform ? OPEN_STEP[platform] : undefined;
  const del = platform ? DELETE_STEP[platform] : undefined;
  return [
    msg(lang, `Inicia sesión en ${label}${account}.`, `Sign in to ${label}${account}.`),
    opts.postUrl
      ? msg(lang, `Abre la publicación: ${opts.postUrl}`, `Open the post: ${opts.postUrl}`)
      : open ? msg(lang, open.es, open.en)
        : msg(lang, 'Busca la publicación en tu perfil y ábrela.', 'Find the post on your profile and open it.'),
    del ? msg(lang, del.es, del.en)
      : msg(lang, 'Abre el menú de opciones de la publicación y elige eliminar.', 'Open the post\'s options menu and choose delete.'),
  ];
}
