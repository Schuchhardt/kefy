import {
  Html, Head, Body, Container, Section, Heading, Text, Hr, Preview, Button,
} from '@react-email/components';

// Aviso del autopilot al dueño de la regla: la regla se pausó por falta de
// créditos, o el video de un reel no se pudo producir. Ver lib/autopilot-alerts.ts.

export type AutopilotAlertKind = 'paused_credits' | 'paused_no_accounts' | 'video_failed' | 'publish_failed';

export interface AutopilotAlertProps {
  kind: AutopilotAlertKind;
  language: 'es' | 'en';
  ruleName: string;
  /** Texto del motivo (créditos necesarios y restantes, error del video). */
  detail: string;
  /** Para la pausa: cuándo se reanuda sola (fecha ya formateada). */
  resumesOn?: string;
  /** Link absoluto al autopilot (o a la pieza). */
  href: string;
}

const accent  = '#C6FF4B';
const warn    = '#FF6B6B';
const bg      = '#08080A';
const surface = '#111113';
const muted   = '#6B6B78';
const text    = '#F0EFE8';

const COPY = {
  es: {
    paused_credits: {
      badge: 'Piloto automático · En pausa',
      title: (name: string) => `Pausamos «${name}»: no quedan créditos`,
      body: (resumesOn?: string) =>
        'La regla no generó nada en esta ejecución para no dejar una publicación a medias. '
        + (resumesOn ? `Se reanuda sola el ${resumesOn}, cuando se renueven tus créditos. ` : '')
        + 'Puedes reanudarla antes desde el piloto automático si mejoras tu plan.',
    },
    paused_no_accounts: {
      badge: 'Piloto automático · En pausa',
      title: (name: string) => `Pausamos «${name}»: no tiene cuentas donde publicar`,
      body: () =>
        'La cuenta que usaba ya no está conectada. Reconéctala y la regla se reanuda sola, '
        + 'o elige otra cuenta desde el piloto automático.',
    },
    video_failed: {
      badge: 'Piloto automático · Reel',
      title: (name: string) => `El reel de «${name}» no se pudo producir`,
      body: () =>
        'Lo intentamos dos veces y no se publicó nada. Los créditos del video que no salió se devolvieron. '
        + 'La regla sigue con su calendario.',
    },
    publish_failed: {
      badge: 'Piloto automático · Publicación',
      title: (name: string) => `No pudimos publicar el reel de «${name}»`,
      body: () =>
        'El video quedó listo y está en tu biblioteca, pero la red social rechazó la publicación. '
        + 'Revisa que la cuenta siga conectada y publícalo a mano.',
    },
    detail: 'Detalle:',
    cta: 'Abrir piloto automático',
    footer: 'Te avisamos como mucho una vez cada 12 horas por regla.',
  },
  en: {
    paused_credits: {
      badge: 'Autopilot · Paused',
      title: (name: string) => `We paused “${name}”: you're out of credits`,
      body: (resumesOn?: string) =>
        "The rule didn't generate anything this time, so nothing half-done gets posted. "
        + (resumesOn ? `It resumes on its own on ${resumesOn}, when your credits renew. ` : '')
        + 'You can resume it sooner from Autopilot if you upgrade your plan.',
    },
    paused_no_accounts: {
      badge: 'Autopilot · Paused',
      title: (name: string) => `We paused “${name}”: it has no accounts to post to`,
      body: () =>
        'The account it used is no longer connected. Reconnect it and the rule resumes on its own, '
        + 'or pick another account from Autopilot.',
    },
    video_failed: {
      badge: 'Autopilot · Reel',
      title: (name: string) => `The reel for “${name}” couldn't be produced`,
      body: () =>
        'We tried twice and nothing was posted. The credits of the video that failed were refunded. '
        + 'The rule keeps its schedule.',
    },
    publish_failed: {
      badge: 'Autopilot · Publishing',
      title: (name: string) => `We couldn't publish the reel for “${name}”`,
      body: () =>
        'The video is ready and in your library, but the social network rejected the post. '
        + 'Check that the account is still connected and publish it by hand.',
    },
    detail: 'Details:',
    cta: 'Open Autopilot',
    footer: 'We notify you at most once every 12 hours per rule.',
  },
} as const;

export function autopilotAlertSubject(kind: AutopilotAlertKind, language: 'es' | 'en', ruleName: string): string {
  return `Kefy: ${COPY[language][kind].title(ruleName)}`;
}

export default function AutopilotAlert({ kind, language, ruleName, detail, resumesOn, href }: AutopilotAlertProps) {
  const t = COPY[language];
  const k = t[kind];
  return (
    <Html lang={language} dir="ltr">
      <Head />
      <Preview>{k.title(ruleName)}</Preview>
      <Body style={{ backgroundColor: bg, fontFamily: 'DM Sans, Helvetica, Arial, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: '520px', margin: '0 auto', padding: '40px 20px' }}>
          <Section style={{ marginBottom: '32px' }}>
            <Text style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '26px', letterSpacing: '-0.03em', color: text, margin: 0 }}>
              Kef<span style={{ color: accent }}>y</span>
            </Text>
          </Section>

          <Section style={{ backgroundColor: surface, borderRadius: '16px', border: '1px solid #1E1E24', padding: '40px' }}>
            <Section style={{ marginBottom: '24px' }}>
              <Text style={{ display: 'inline-block', backgroundColor: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '20px', padding: '5px 14px', fontSize: '12px', color: warn, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
                {k.badge}
              </Text>
            </Section>

            <Heading style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '24px', letterSpacing: '-0.03em', color: text, margin: '0 0 16px' }}>
              {k.title(ruleName)}
            </Heading>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 16px' }}>
              {k.body(resumesOn)}
            </Text>

            {detail && (
              <>
                <Text style={{ fontSize: '13px', color: muted, margin: '0 0 8px' }}>{t.detail}</Text>
                <Text style={{
                  fontSize: '13px', lineHeight: '1.6', color: '#BCBBB1', margin: '0 0 28px',
                  backgroundColor: '#0D0D10', border: '1px solid #1E1E24',
                  borderRadius: '8px', padding: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {detail}
                </Text>
              </>
            )}

            <Button
              href={href}
              style={{ backgroundColor: accent, color: bg, borderRadius: '10px', padding: '12px 20px', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}
            >
              {t.cta}
            </Button>

            <Hr style={{ borderColor: '#1E1E24', margin: '28px 0 20px' }} />
            <Text style={{ fontSize: '13px', lineHeight: '1.6', color: muted, margin: 0 }}>{t.footer}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
