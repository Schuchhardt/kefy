'use client';

// ─── «Redes»: dónde está un contenido y dónde más puede ir ───────────────────
// La tarjeta de la ficha del contenido. Por cada cuenta de la marca dice si el
// contenido ya salió ahí, si está programado, si todavía no está (y entonces
// se recomienda) o por qué su red no admite el formato. El botón abre el modal
// de publicar con las compatibles que faltan ya marcadas.
//
// Sirve para cualquier estado: un borrador se puede llevar a todas las redes a
// la vez, y uno publicado o programado a las que todavía no lo tienen. Los
// datos salen de GET /api/content/[itemId]/publish-targets (lib/publish-targets.ts).

import { useEffect, useId, useState } from 'react';
import Button, { ButtonLink, Spinner } from '@/components/ui/Button';
import Icon from '@/components/ui/icons';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { NET_LABEL } from '@/components/dashboard/NetworkPreview';
import { formatScheduledDate } from './RescheduleModal';
import { hasCoverage, type PublishTarget } from '@/lib/publish-targets';
import type { ContentType } from '@/types/content';
import esPublish from '@/locales/es/dashboard/publish';
import enPublish from '@/locales/en/dashboard/publish';
import styles from './PublishTargetsCard.module.css';

const COPY = { es: esPublish, en: enPublish } as const;
type Copy = typeof esPublish;

interface Props {
  itemId: string;
  lang: 'es' | 'en';
  /** Cambia cuando el contenido se publica, programa o cancela: vuelve a leer. */
  refreshKey: string;
  /** Abre el modal de publicar con estas cuentas marcadas. */
  onPublish: (accountIds: string[]) => void;
}

/** Qué dice cada cuenta, en una línea. */
function stateLine(t: PublishTarget, copy: Copy, lang: 'es' | 'en'): string {
  const tt = copy.targets;
  switch (t.state) {
    case 'published': return tt.published;
    case 'scheduled': return t.scheduled_at ? tt.scheduled(formatScheduledDate(t.scheduled_at, lang, { short: true })) : tt.alreadyScheduled;
    case 'inactive': return tt.inactive;
    case 'incompatible':
      if (t.issue === 'too_many_images') return tt.issues.too_many_images(t.max_images ?? 1);
      return t.issue ? tt.issues[t.issue] : tt.issues.no_publishing;
    default: return t.as_post ? tt.asPost : tt.available;
  }
}

export default function PublishTargetsCard({ itemId, lang, refreshKey, onPublish }: Props) {
  const copy = COPY[lang];
  const tt = copy.targets;
  const titleId = useId();
  const [targets, setTargets] = useState<PublishTarget[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/content/${encodeURIComponent(itemId)}/publish-targets`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`targets ${r.status}`))))
      .then((d: { targets?: PublishTarget[] }) => {
        if (!alive) return;
        setTargets(d.targets ?? []);
        setFailed(false);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [itemId, refreshKey]);

  // Sin cuentas no hay nada que decir: el modal de publicar ya invita a conectar.
  if (targets && targets.length === 0) return null;

  const suggested = (targets ?? []).filter((t) => t.state === 'available').map((t) => t.social_account_id);
  const covered = !!targets && hasCoverage(targets);

  return (
    <section className="ui-card" aria-labelledby={titleId}>
      <div className="ui-card-head">
        <h2 id={titleId} className="ui-card-title">{tt.title}</h2>
      </div>

      {failed && !targets ? (
        <p className={styles.muted}>{tt.loadError}</p>
      ) : !targets ? (
        <p className={styles.muted}><Spinner size={12} /> {tt.loading}</p>
      ) : (
        <>
          <p className={styles.intro}>{covered ? tt.intro : tt.draftIntro}</p>
          <ul className={styles.list}>
            {targets.map((t) => (
              <li key={t.social_account_id} className={styles.row} data-state={t.state}>
                <ChannelIcon name={t.platform} size={16} />
                <div className={styles.rowText}>
                  <span className={styles.rowName}>
                    {NET_LABEL[t.platform] ?? t.platform}
                    {t.username ? ` · @${t.username.replace(/^@/, '')}` : ''}
                  </span>
                  <span className={styles.rowState}>
                    {stateLine(t, copy, lang)}
                    {t.other_formats.length > 0 && t.state !== 'published' && t.state !== 'scheduled'
                      ? ` · ${tt.otherFormats(t.other_formats.map((f: ContentType) => copy.formats[f]).join(', '))}`
                      : ''}
                  </span>
                </div>
                {t.state === 'published' && <Icon name="check-circle" size={16} className={styles.stateIcon} />}
                {t.state === 'scheduled' && <Icon name="clock" size={16} className={styles.stateIcon} />}
              </li>
            ))}
          </ul>

          {suggested.length > 0 ? (
            <Button
              variant={covered ? 'primary' : 'secondary'}
              block
              icon={<Icon name="send" size={16} />}
              onClick={() => onPublish(suggested)}
            >
              {covered ? tt.publishMore(suggested.length) : tt.publishAll(suggested.length)}
            </Button>
          ) : covered ? (
            <div className={styles.done}>
              <p className={styles.muted}>{tt.allCovered}</p>
              <ButtonLink
                href={`/${lang}/dashboard/settings#social`}
                variant="ghost"
                size="sm"
                icon={<Icon name="plus" size={14} />}
              >
                {tt.connectMore}
              </ButtonLink>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
