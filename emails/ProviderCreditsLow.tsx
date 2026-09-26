import {
  Html, Head, Body, Container, Section, Heading, Text, Hr, Preview,
} from '@react-email/components';

interface ProviderCreditsLowProps {
  /** 'anthropic' | 'openai' */
  provider: string;
  /** Fragmento del error real del proveedor, para diagnóstico rápido. */
  detail: string;
}

const accent  = '#C6FF4B';
const warn    = '#FF6B6B';
const bg      = '#08080A';
const surface = '#111113';
const muted   = '#6B6B78';
const text    = '#F0EFE8';

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai:    'OpenAI',
};

export default function ProviderCreditsLow({ provider, detail }: ProviderCreditsLowProps) {
  const label = PROVIDER_LABEL[provider] ?? provider;

  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>{`Kefy: ${label} rechazó una llamada por falta de crédito`}</Preview>
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
                Alerta · Proveedor sin crédito
              </Text>
            </Section>

            <Heading style={{ fontFamily: 'Syne, Georgia, serif', fontWeight: 800, fontSize: '26px', letterSpacing: '-0.03em', color: text, margin: '0 0 16px' }}>
              {label} rechazó una llamada por falta de crédito
            </Heading>

            <Text style={{ fontSize: '15px', lineHeight: '1.7', color: '#BCBBB1', margin: '0 0 16px' }}>
              Esto es un problema de facturación de {label}, no de los créditos de ningún plan de Kefy — todas las
              generaciones (texto, imágenes, guiones de reel) que dependan de este proveedor van a fallar hasta que
              se recargue o revise la cuenta.
            </Text>

            <Text style={{ fontSize: '13px', color: muted, margin: '0 0 8px' }}>Detalle del proveedor:</Text>
            <Text style={{
              fontSize: '13px', lineHeight: '1.6', color: '#BCBBB1', margin: '0 0 28px',
              fontFamily: 'ui-monospace, monospace', backgroundColor: '#0D0D10', border: '1px solid #1E1E24',
              borderRadius: '8px', padding: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {detail}
            </Text>

            <Hr style={{ borderColor: '#1E1E24', margin: '0 0 20px' }} />

            <Text style={{ fontSize: '13px', lineHeight: '1.6', color: muted, margin: 0 }}>
              No se te va a volver a avisar por esto en la próxima hora, aunque siga pasando — para no inundarte de
              correos mientras se resuelve.
            </Text>
          </Section>

          <Hr style={{ borderColor: '#1E1E24', margin: '32px 0 24px' }} />
          <Text style={{ fontSize: '12px', lineHeight: '1.6', color: muted, textAlign: 'center', margin: 0 }}>
            © 2026 Kefy · Alerta interna, no reenviar a clientes
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
