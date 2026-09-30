'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useScrolled } from '@/hooks/useScrolled';
import { useSignup } from '@/components/ui/SignupContext';
import { switchLocalePath } from '@/lib/localized-paths';
import type { KefyCopy, NavLink } from '@/types/locales';

interface NavProps {
  lang: string;
  copy: KefyCopy['nav'];
  cta: KefyCopy['cta'];
}

/**
 * Destino de un enlace del nav. Las anclas van siempre a la home del idioma
 * (`/es#how`): desde /es/precios, /blog o los legales, `#how` a secas no
 * existía y el clic no hacía nada.
 */
function linkHref(lang: string, link: NavLink): string {
  return link.path ? `/${lang}${link.path}` : `/${lang}#${link.id}`;
}

export default function Nav({ lang, copy, cta }: NavProps) {
  const scrolled = useScrolled(40);
  const pathname = usePathname() ?? `/${lang}`;
  const [langOpen, setLangOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const goToRegister = useSignup();
  const langRef = useRef<HTMLDivElement>(null);
  const langButtonRef = useRef<HTMLButtonElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const langMenuId = useId();
  const mobileMenuId = useId();

  const closeMenu = () => setMenuOpen(false);

  // Selector de idioma: se cierra al tocar fuera y con Escape.
  useEffect(() => {
    if (!langOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setLangOpen(false); langButtonRef.current?.focus(); }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [langOpen]);

  // Menú móvil: bloquea el scroll del fondo y se cierra con Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setMenuOpen(false); burgerRef.current?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <nav className={`nav${scrolled ? ' scrolled' : ''}${menuOpen ? ' menu-open' : ''}`} aria-label={copy.ariaLabel}>
      <div className="nav-inner">
        <Link href={`/${lang}`} className="logo" onClick={closeMenu}>
          <Image src="/apple-touch-icon.png" alt="" width={24} height={24} />
          <span>Kef<span className="y">y</span></span>
        </Link>

        <div className="nav-links">
          {copy.links.map((link) => (
            <a key={link.id} href={linkHref(lang, link)}>{link.label}</a>
          ))}
        </div>

        <div className="nav-right">
          {/* Cambiar de idioma lleva a la misma página en el otro idioma. */}
          <div className="lang" ref={langRef}>
            <button
              ref={langButtonRef}
              type="button"
              className="lang-btn"
              onClick={() => setLangOpen((o) => !o)}
              aria-label={`${copy.languageLabel}: ${copy.languages[lang === 'en' ? 'en' : 'es']}`}
              aria-expanded={langOpen}
              aria-controls={langMenuId}
            >
              {lang.toUpperCase()} <span className="chev" aria-hidden="true">▾</span>
            </button>
            <ul id={langMenuId} className={`lang-menu${langOpen ? ' open' : ''}`} hidden={!langOpen}>
              {(['es', 'en'] as const).map((l) => (
                <li key={l}>
                  <Link
                    href={switchLocalePath(pathname, l)}
                    hrefLang={l}
                    lang={l}
                    aria-current={lang === l ? 'true' : undefined}
                    className={lang === l ? 'active' : ''}
                    onClick={() => setLangOpen(false)}
                  >
                    {copy.languages[l]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA siempre visible: en móvil en versión compacta (antes solo
              aparecía dentro del menú hamburguesa). */}
          <button type="button" className="btn btn-primary nav-cta" onClick={goToRegister}>
            {cta.label}
          </button>

          <button
            ref={burgerRef}
            type="button"
            className="nav-burger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? copy.menuClose : copy.menuOpen}
            aria-expanded={menuOpen}
            aria-controls={mobileMenuId}
          >
            <span className={`burger-icon${menuOpen ? ' open' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div id={mobileMenuId} className={`nav-mobile${menuOpen ? ' open' : ''}`} hidden={!menuOpen}>
        {copy.links.map((link) => (
          <a key={link.id} href={linkHref(lang, link)} className="nav-mobile-link" onClick={closeMenu}>
            {link.label}
          </a>
        ))}
        <button
          type="button"
          className="btn btn-primary btn-lg"
          style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
          onClick={() => { goToRegister(); closeMenu(); }}
        >
          {cta.label}
        </button>
        <p className="nav-mobile-note">{cta.note}</p>
      </div>
    </nav>
  );
}
