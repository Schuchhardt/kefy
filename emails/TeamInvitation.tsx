import {
  Html, Head, Body, Container, Section, Heading, Text, Button, Hr, Preview,
} from '@react-email/components';

interface TeamInvitationProps {
  orgName: string;
  inviterName?: string | null;
  inviteUrl: string;
  lang?: 'es' | 'en';
}

const accent = '#C6FF4B';
const bg = '#08080A';
const surface = '#111113';
const muted = '#6B6B78';
const textColor = '#F0EFE8';

const copy = {
  es: {
    preview: 'Te invitaron a un equipo en Kefy — el enlace expira en 7 días',
    badge: 'Invitación · Equipo',
    greeting: (org: string) => `Te invitaron a ${org}`,
    body1: (inviter: string | null | undefined, org: string) =>
      inviter
        ? `${inviter} te invitó a colaborar en ${org} dentro de Kefy.`
        : `Te invitaron a colaborar en ${org} dentro de Kefy.`,
    body2: 'Al aceptar podrás crear contenido, publicar en las redes conectadas y ver las métricas del equipo.',
    cta: 'Aceptar invitación',
    expiry: 'Este enlace expira en 7 días. Si ya venció, pide que te reenvíen la invitación.',
    ignore: 'Si no esperabas esta invitación, puedes ignorar este correo. No se creará ninguna cuenta a tu nombre.',
    footer: '© 2026 Kefy · Hecho en LATAM, para el mundo',
  },
  en: {
    preview: 'You were invited to a team on Kefy — the link expires in 7 days',
    badge: 'Invitation · Team',
    greeting: (org: string) => `You've been invited to ${org}`,
    body1: (inviter: string | null | undefined, org: string) =>
      inviter
        ? `${inviter} invited you to collaborate on ${org} in Kefy.`
        : `You've been invited to collaborate on ${org} in Kefy.`,
    body2: 'Once you accept you can create content, publish to the connected networks and see the team metrics.',
    cta: 'Accept invitation',
    expiry: 'This link expires in 7 days. If it has already lapsed, ask for the invitation to be sent again.',
    ignore: "If you weren't expecting this invitation, you can ignore this email. No account will be created in your name.",
    footer: '© 2026 Kefy · Made in LATAM, for the world',
  },
} as const;

export default function TeamInvitation({
  orgName, inviterName, inviteUrl, lang = 'es',
}: TeamInvitationProps) {
  const t = copy[lang];

  return (
    <Html lang={lang} dir="ltr">
      <Head />
      <Preview>{t.preview}</Preview>
      <Body style={{ backgroundColor: bg, fontFamily: 'DM Sans, Helvetica, Arial, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: '520px', margin: '0 auto', padding: '40px 20px' }}>

          <Section style={{ marginBottom: '32px' }}>
            <Text style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '26px', letterSpacing: '-0.03em', color: textColor, margin: 0 }}>
              Kef<span style={{ color: accent }}>y</span>
            </Text>
          </Section>

          <Section style={{ backgroundColor: surface, borderRadius: '16px', border: '1px solid #1E1E24', padding: '40px' }}>

            <Section style={{ marginBottom: '24px' }}>
              <Text style={{ display: 'inline-block', backgroundColor: 'rgba(198,255,75,0.1)', border: '1px solid rgba(198,255,75,0.25)', borderRadius: '20px', padding: '5px 14px', fontSize: '12px', color: accent, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
                {t.badge}
              </Text>
            </Section>

            <Heading style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '28px', letterSpacing: '-0.03em', color: textColor, margin: '0 0 16px' }}>
              {t.greeting(orgName)}
            </Heading>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 16px' }}>
              {t.body1(inviterName, orgName)}
            </Text>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 28px' }}>
              {t.body2}
            </Text>

            <Button
              href={inviteUrl}
              style={{ backgroundColor: accent, color: '#0A0A0A', borderRadius: '8px', padding: '14px 28px', fontWeight: 700, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginBottom: '28px' }}
            >
              {t.cta}
            </Button>

            <Hr style={{ borderColor: '#1E1E24', margin: '0 0 20px' }} />

            <Text style={{ fontSize: '13px', lineHeight: '1.6', color: muted, margin: '0 0 12px' }}>
              {t.expiry}
            </Text>
            <Text style={{ fontSize: '13px', lineHeight: '1.6', color: muted, margin: 0 }}>
              {t.ignore}
            </Text>
          </Section>

          <Hr style={{ borderColor: '#1E1E24', margin: '32px 0 24px' }} />
          <Text style={{ fontSize: '12px', lineHeight: '1.6', color: muted, textAlign: 'center', margin: 0 }}>
            {t.footer}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
