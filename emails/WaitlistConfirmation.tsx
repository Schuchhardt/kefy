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

interface WaitlistConfirmationProps {
  name?: string | null;
  email: string;
  lang?: 'es' | 'en';
}

const accent = '#C6FF4B';
const bg = '#08080A';
const surface = '#111113';
const muted = '#6B6B78';
const textColor = '#F0EFE8';

const copy = {
  es: {
    preview: 'Ya estás en la lista de Kefy — te avisamos antes del lanzamiento 🎉',
    greeting: (name: string | null | undefined) => name ? `Hola, ${name} 👋` : 'Hola 👋',
    badge: 'Beta · Lista de espera',
    body1: (
      <>
        Tu registro fue confirmado. Eres parte de los primeros{' '}
        <strong style={{ color: textColor }}>600+ negocios</strong> en la lista de espera de Kefy.
      </>
    ),
    body2: (
      <>
        Cuando abramos el acceso beta, serás de los primeros en saberlo —{' '}
        <strong style={{ color: textColor }}>antes que nadie</strong> y sin costo hasta el lanzamiento.
      </>
    ),
    whatNext: 'Qué sigue',
    step1: '✅ \u00a0Recibirás tu invitación de acceso anticipado por correo',
    step2: (
      <>🚀 \u00a0Lanzamiento previsto para <strong style={{ color: textColor }}>Q3 2026</strong></>
    ),
    step3: '💳 \u00a0Sin tarjeta de crédito requerida',
    cta: 'Visitar kefy.app',
    footer: (email: string) => (
      <>
        Recibiste este correo porque registraste el email{' '}
        <span style={{ color: textColor }}>{email}</span> en la lista de espera de Kefy.
        <br />
        © 2026 Kefy · Hecho en LATAM, para el mundo
      </>
    ),
  },
  en: {
    preview: "You're on the Kefy waitlist — we'll notify you before launch 🎉",
    greeting: (name: string | null | undefined) => name ? `Hey, ${name} 👋` : 'Hey there 👋',
    badge: 'Beta · Waitlist',
    body1: (
      <>
        Your registration is confirmed. You&apos;re among the first{' '}
        <strong style={{ color: textColor }}>600+ businesses</strong> on the Kefy waitlist.
      </>
    ),
    body2: (
      <>
        When we open beta access, you&apos;ll be among the first to know —{' '}
        <strong style={{ color: textColor }}>ahead of everyone else</strong> and free until launch.
      </>
    ),
    whatNext: "What's next",
    step1: '✅ \u00a0You will receive your early-access invitation by email',
    step2: (
      <>🚀 \u00a0Expected launch <strong style={{ color: textColor }}>Q3 2026</strong></>
    ),
    step3: '💳 \u00a0No credit card required',
    cta: 'Visit kefy.app',
    footer: (email: string) => (
      <>
        You received this email because you registered{' '}
        <span style={{ color: textColor }}>{email}</span> on the Kefy waitlist.
        <br />
        © 2026 Kefy · Made in LATAM, for the world
      </>
    ),
  },
} as const;

export default function WaitlistConfirmation({ name, email, lang = 'es' }: WaitlistConfirmationProps) {
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
          <Section style={{ backgroundColor: surface, borderRadius: '16px', border: `1px solid #1E1E24`, padding: '40px' }}>

            {/* Badge */}
            <Section style={{ marginBottom: '24px' }}>
              <Text style={{ display: 'inline-block', backgroundColor: 'rgba(198,255,75,0.1)', border: `1px solid rgba(198,255,75,0.25)`, borderRadius: '20px', padding: '5px 14px', fontSize: '12px', color: accent, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
                {t.badge}
              </Text>
            </Section>

            <Heading style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '28px', letterSpacing: '-0.03em', color: textColor, margin: '0 0 16px' }}>
              {t.greeting(name)}
            </Heading>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 20px' }}>
              {t.body1}
            </Text>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 28px' }}>
              {t.body2}
            </Text>

            {/* What to expect */}
            <Section style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid #1E1E24', padding: '20px 24px', marginBottom: '28px' }}>
              <Text style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 700, fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, margin: '0 0 14px' }}>
                {t.whatNext}
              </Text>
              <Text style={{ fontSize: '14px', color: '#BCBBB1', margin: '0 0 8px', lineHeight: '1.6' }}>
                {t.step1}
              </Text>
              <Text style={{ fontSize: '14px', color: '#BCBBB1', margin: '0 0 8px', lineHeight: '1.6' }}>
                {t.step2}
              </Text>
              <Text style={{ fontSize: '14px', color: '#BCBBB1', margin: 0, lineHeight: '1.6' }}>
                {t.step3}
              </Text>
            </Section>

            <Button
              href="https://kefy.app"
              style={{ backgroundColor: accent, color: '#0A0A0A', borderRadius: '8px', padding: '14px 28px', fontWeight: 700, fontSize: '14px', textDecoration: 'none', display: 'inline-block' }}
            >
              {t.cta}
            </Button>
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
