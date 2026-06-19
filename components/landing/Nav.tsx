'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useScrolled } from '@/hooks/useScrolled';
import { useWaitlistOpen } from '@/components/ui/WaitlistContext';
import type { KefyCopy } from '@/types/locales';

interface NavProps {
  lang: string;
  copy: KefyCopy['nav'];
}

export default function Nav({ lang, copy }: NavProps) {
  const scrolled = useScrolled(40);
  const [langOpen, setLangOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const openWaitlist = useWaitlistOpen();

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className={`nav${scrolled ? ' scrolled' : ''}${menuOpen ? ' menu-open' : ''}`}>
      <div className="nav-inner">
        <Link href={`/${lang}`} className="logo" onClick={closeMenu}>
          <Image src="/apple-touch-icon.png" alt="Kefy" width={24} height={24} />
          <span>Kef<span className="y">y</span></span>
        </Link>

        <div className="nav-links">
          {copy.links.map((link) =>
            link.path ? (
              <a key={link.id} href={`/${lang}${link.path}`}>
                {link.label}
              </a>
            ) : (
              <a key={link.id} href={`#${link.id}`}>
                {link.label}
              </a>
            )
          )}
        </div>

        <div className="nav-right">
          <div className="lang">
            <button
              className="lang-btn"
              onClick={() => setLangOpen((o) => !o)}
              aria-label="Select language"
            >
              {lang.toUpperCase()} <span className="chev">▾</span>
            </button>
            <div className={`lang-menu${langOpen ? ' open' : ''}`}>
              <button
                className={lang === 'es' ? 'active' : ''}
                onClick={() => setLangOpen(false)}
              >
                <Link href="/es" onClick={() => setLangOpen(false)}>
                  🇪🇸 Español
                </Link>
              </button>
              <button
                className={lang === 'en' ? 'active' : ''}
                onClick={() => setLangOpen(false)}
              >
                <Link href="/en" onClick={() => setLangOpen(false)}>
                  🇺🇸 English
                </Link>
              </button>
            </div>
          </div>

          <button className="btn btn-primary nav-cta-desktop" onClick={openWaitlist}>{copy.primary}</button>

          <button
            className="nav-burger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
          >
            <span className={`burger-icon${menuOpen ? ' open' : ''}`} />
          </button>
        </div>
      </div>

      <div className={`nav-mobile${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
        {copy.links.map((link) =>
          link.path ? (
            <a key={link.id} href={`/${lang}${link.path}`} className="nav-mobile-link" onClick={closeMenu}>
              {link.label}
            </a>
          ) : (
            <a key={link.id} href={`#${link.id}`} className="nav-mobile-link" onClick={closeMenu}>
              {link.label}
            </a>
          )
        )}
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          onClick={() => { openWaitlist(); closeMenu(); }}
        >
          {copy.primary}
        </button>
      </div>
    </nav>
  );
}
