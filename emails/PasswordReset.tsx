import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button,
  Hr,
  Preview,
} from '@react-email/components';

interface PasswordResetProps {
  name?: string | null;
  email: string;
  resetUrl: string;
  lang?: 'es' | 'en';
}

const accent = '#C6FF4B';
const bg = '#08080A';
const surface = '#111113';
const muted = '#6B6B78';
const textColor = '#F0EFE8';

const copy = {
  es: {
    preview: 'Restablece tu contraseña de Kefy — el enlace expira en 1 hora',
    subject: 'Restablecer contraseña de Kefy',
    greeting: (name: string | null | undefined) => name ? `Hola, ${name} 👋` : 'Hola 👋',
    badge: 'Seguridad · Contraseña',
    body1: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta de Kefy.',
    body2: 'Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace expira en 1 hora.',
    cta: 'Restablecer contraseña',
    ignore: 'Si no solicitaste restablecer tu contraseña, puedes ignorar este correo. Tu cuenta está segura.',
    footer: (email: string) => (
      <>
        Recibiste este correo porque se solicitó un restablecimiento de contraseña para{' '}
        <span style={{ color: textColor }}>{email}</span>.
        <br />
        © 2026 Kefy · Hecho en LATAM, para el mundo
      </>
    ),
  },
  en: {
    preview: 'Reset your Kefy password — the link expires in 1 hour',
    subject: 'Reset your Kefy password',
    greeting: (name: string | null | undefined) => name ? `Hey, ${name} 👋` : 'Hey there 👋',
    badge: 'Security · Password',
    body1: 'We received a request to reset the password for your Kefy account.',
    body2: 'Click the button below to create a new password. This link expires in 1 hour.',
    cta: 'Reset password',
    ignore: "If you didn't request a password reset, you can safely ignore this email. Your account is secure.",
    footer: (email: string) => (
      <>
        You received this email because a password reset was requested for{' '}
        <span style={{ color: textColor }}>{email}</span>.
        <br />
        © 2026 Kefy · Made in LATAM, for the world
      </>
    ),
  },
} as const;

export default function PasswordReset({ name, email, resetUrl, lang = 'es' }: PasswordResetProps) {
  const t = copy[lang];

  return (
    <Html lang={lang} dir="ltr">
      <Head />
      <Preview>{t.preview}</Preview>
      <Body style={{ backgroundColor: bg, fontFamily: 'DM Sans, Helvetica, Arial, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: '520px', margin: '0 auto', padding: '40px 20px' }}>

          {/* Logo */}
          <Section style={{ marginBottom: '32px' }}>
            <Text style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '26px', letterSpacing: '-0.03em', color: textColor, margin: 0 }}>
              Kef<span style={{ color: accent }}>y</span>
            </Text>
          </Section>

          {/* Card */}
          <Section style={{ backgroundColor: surface, borderRadius: '16px', border: '1px solid #1E1E24', padding: '40px' }}>

            {/* Badge */}
            <Section style={{ marginBottom: '24px' }}>
              <Text style={{ display: 'inline-block', backgroundColor: 'rgba(198,255,75,0.1)', border: '1px solid rgba(198,255,75,0.25)', borderRadius: '20px', padding: '5px 14px', fontSize: '12px', color: accent, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
                {t.badge}
              </Text>
            </Section>

            <Heading style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '28px', letterSpacing: '-0.03em', color: textColor, margin: '0 0 16px' }}>
              {t.greeting(name)}
            </Heading>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 16px' }}>
              {t.body1}
            </Text>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 28px' }}>
              {t.body2}
            </Text>

            <Button
              href={resetUrl}
              style={{ backgroundColor: accent, color: '#0A0A0A', borderRadius: '8px', padding: '14px 28px', fontWeight: 700, fontSize: '14px', textDecoration: 'none', display: 'inline-block', marginBottom: '28px' }}
            >
              {t.cta}
            </Button>

            <Hr style={{ borderColor: '#1E1E24', margin: '0 0 20px' }} />

            <Text style={{ fontSize: '13px', lineHeight: '1.6', color: muted, margin: 0 }}>
              {t.ignore}
            </Text>
          </Section>

          {/* Footer */}
          <Hr style={{ borderColor: '#1E1E24', margin: '32px 0 24px' }} />
          <Text style={{ fontSize: '12px', color: muted, textAlign: 'center', margin: 0 }}>
            {t.footer(email)}
          </Text>

        </Container>
      </Body>
    </Html>
  );
}
