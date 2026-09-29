'use client';

import { useSyncExternalStore } from 'react';
import esT from '@/locales/es/dashboard/content';
import enT from '@/locales/en/dashboard/content';

// Idioma del documento (lo fija SetLang en <html lang>). Quien no pasa `lang`
// —NetworkPreview— recibía siempre «Generando imagen…» en español. Con
// useSyncExternalStore la hidratación usa el valor del servidor ('es') y
// después se corrige sin avisos de desajuste.
const noopSubscribe = () => () => {};
const documentLang = (): 'es' | 'en' => (document.documentElement.lang === 'en' ? 'en' : 'es');
const serverLang = (): 'es' | 'en' => 'es';

/** Marcador de «generando imagen» dentro de un marco de vista previa (fondo de
 *  foto/vídeo, siempre oscuro): por eso el texto va en blanco translúcido. */
export function ImageGeneratingSpinner({
  label,
  lang,
  height = 200,
  accentColor = 'var(--accent)',
}: {
  label?:       string;
  lang?:        'es' | 'en';
  height?:      number | string;
  accentColor?: string;
}) {
  const docLang = useSyncExternalStore(noopSubscribe, documentLang, serverLang);
  const fallback = (lang ?? docLang) === 'en' ? enT.progressImage : esT.progressImage;
  const text = label ?? fallback;

  return (
    <div
      role="status"
      style={{
        width: '100%', height, background: '#0a0a0f',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 32, height: 32, borderRadius: '50%',
          // color-mix acepta tanto un hex de marca como una variable CSS.
          border: `3px solid color-mix(in srgb, ${accentColor} 19%, transparent)`,
          borderTop: `3px solid ${accentColor}`,
          animation: 'spin 1s linear infinite',
        }}
      />
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center', margin: 0, padding: '0 12px' }}>
        {text}
      </p>
    </div>
  );
}
