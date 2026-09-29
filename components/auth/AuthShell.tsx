'use client';

// ─── Marco de las pantallas de auth ──────────────────────────────────────────
// Login, registro, recuperar y restablecer contraseña e invitación copiaban el
// mismo bloque (vídeo de fondo, capa oscura, blur de 700px, logo y pie legal
// en español). Ahora es uno: con `100dvh` para que la barra de Safari no tape
// el pie, sin el blur en móvil y con los textos del idioma de la ruta.

import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import VideoBackdrop from '@/components/ui/VideoBackdrop';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

export default function AuthShell({
  lang, title, children, width = 400,
}: {
  lang: string;
  /** Encabezado de la pantalla, bajo el logo (es el <h1>). */
  title?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const t = lang === 'en' ? enAuth : esAuth;

  return (
    <div data-theme="dark" className="auth-shell">
      <VideoBackdrop overlay={0.78} />
      <div aria-hidden="true" className="auth-glow" />

      <main className="auth-main">
        <div className="auth-card" style={{ maxWidth: width }}>
          <div className="auth-head">
            <Link href={`/${lang}`} className="logo auth-logo" aria-label={t.shell.home}>
              <Image src="/apple-touch-icon.png" alt="" width={28} height={28} />
              <span aria-hidden="true">Kef<span className="y">y</span></span>
            </Link>
            {title && <h1 className="auth-title">{title}</h1>}
          </div>
          {children}
        </div>
      </main>

      <footer className="auth-footer">
        <Link href={`/${lang}/terminos`}>{t.shell.terms}</Link>
        <Link href={`/${lang}/privacidad`}>{t.shell.privacy}</Link>
        <Link href={`/${lang}/cookies`}>{t.shell.cookies}</Link>
        <span>© {new Date().getFullYear()} Kefy</span>
      </footer>
    </div>
  );
}
