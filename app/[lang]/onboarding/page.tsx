'use client';

import { useRouter, useParams } from 'next/navigation';

const steps = [
  { key: 'brand',    icon: '◈', title: 'Configura tu Brand Kit', desc: 'Sube tu logo, colores y define cómo se comunica tu marca.' },
  { key: 'content',  icon: '✦', title: 'Crea tu primer contenido', desc: 'Genera un post, imagen o carrusel con IA en segundos.' },
  { key: 'calendar', icon: '◫', title: 'Conecta tus redes', desc: 'Enlaza Instagram, LinkedIn, TikTok y más para publicar directamente.' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>
        {/* Logo */}
        <div style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 28, color: 'var(--accent)', marginBottom: 8 }}>
          kefy
        </div>

        <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700, marginBottom: 12 }}>
          ¡Bienvenido a Kefy!
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15, marginBottom: 40 }}>
          Tu plataforma está lista. Sigue estos pasos para sacarle el máximo provecho.
        </p>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
          {steps.map((step, i) => (
            <div
              key={step.key}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                textAlign: 'left',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: i === 0 ? 'rgba(198,255,75,0.12)' : 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>
                {step.icon}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{step.title}</p>
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>{step.desc}</p>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>Paso {i + 1}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => router.push(`/${lang}/dashboard/brand`)}
          style={{
            background: 'var(--accent)',
            color: 'var(--bg)',
            border: 'none',
            borderRadius: 10,
            padding: '13px 32px',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginBottom: 16,
            width: '100%',
          }}
        >
          Empezar con el Brand Kit →
        </button>

        <button
          onClick={() => router.push(`/${lang}/dashboard`)}
          style={{
            background: 'transparent',
            color: 'var(--muted)',
            border: 'none',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Ir al dashboard ahora
        </button>
      </div>
    </div>
  );
}
