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
}

const accent = '#C6FF4B';
const bg = '#08080A';
const surface = '#111113';
const muted = '#6B6B78';
const text = '#F0EFE8';

export default function WaitlistConfirmation({ name, email }: WaitlistConfirmationProps) {
  const greeting = name ? `Hola, ${name} 👋` : 'Hola 👋';

  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>Ya estás en la lista de Kefy — te avisamos antes del lanzamiento 🎉</Preview>
      <Body style={{ backgroundColor: bg, fontFamily: 'DM Sans, Helvetica, Arial, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: '520px', margin: '0 auto', padding: '40px 20px' }}>

          {/* Logo */}
          <Section style={{ marginBottom: '32px' }}>
            <Text style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '26px', letterSpacing: '-0.03em', color: text, margin: 0 }}>
              Kef<span style={{ color: accent }}>y</span>
            </Text>
          </Section>

          {/* Card */}
          <Section style={{ backgroundColor: surface, borderRadius: '16px', border: `1px solid #1E1E24`, padding: '40px' }}>

            {/* Badge */}
            <Section style={{ marginBottom: '24px' }}>
              <Text style={{ display: 'inline-block', backgroundColor: 'rgba(198,255,75,0.1)', border: `1px solid rgba(198,255,75,0.25)`, borderRadius: '20px', padding: '5px 14px', fontSize: '12px', color: accent, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
                Beta · Lista de espera
              </Text>
            </Section>

            <Heading style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '28px', letterSpacing: '-0.03em', color: text, margin: '0 0 16px' }}>
              {greeting}
            </Heading>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 20px' }}>
              Tu registro fue confirmado. Eres parte de los primeros{' '}
              <strong style={{ color: text }}>600+ negocios</strong> en la lista de espera de Kefy.
            </Text>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 28px' }}>
              Cuando abramos el acceso beta, serás de los primeros en saberlo —{' '}
              <strong style={{ color: text }}>antes que nadie</strong> y sin costo hasta el lanzamiento.
            </Text>

            {/* What to expect */}
            <Section style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid #1E1E24', padding: '20px 24px', marginBottom: '28px' }}>
              <Text style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 700, fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, margin: '0 0 14px' }}>
                Qué sigue
              </Text>
              <Text style={{ fontSize: '14px', color: '#BCBBB1', margin: '0 0 8px', lineHeight: '1.6' }}>
                ✅ &nbsp;Recibirás tu invitación de acceso anticipado por correo
              </Text>
              <Text style={{ fontSize: '14px', color: '#BCBBB1', margin: '0 0 8px', lineHeight: '1.6' }}>
                🚀 &nbsp;Lanzamiento previsto para <strong style={{ color: text }}>Q3 2026</strong>
              </Text>
              <Text style={{ fontSize: '14px', color: '#BCBBB1', margin: 0, lineHeight: '1.6' }}>
                💳 &nbsp;Sin tarjeta de crédito requerida
              </Text>
            </Section>

            <Button
              href="https://kefy.app"
              style={{ backgroundColor: accent, color: '#0A0A0A', borderRadius: '8px', padding: '14px 28px', fontWeight: 700, fontSize: '14px', textDecoration: 'none', display: 'inline-block' }}
            >
              Visitar kefy.app
            </Button>
          </Section>

          {/* Footer */}
          <Hr style={{ borderColor: '#1E1E24', margin: '32px 0 24px' }} />
          <Text style={{ fontSize: '12px', color: muted, textAlign: 'center', margin: 0 }}>
            Recibiste este correo porque registraste el email{' '}
            <span style={{ color: text }}>{email}</span> en la lista de espera de Kefy.
            <br />
            © 2026 Kefy · Hecho en LATAM, para el mundo
          </Text>

        </Container>
      </Body>
    </Html>
  );
}
