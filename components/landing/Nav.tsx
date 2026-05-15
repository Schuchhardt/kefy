'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useScrolled } from '@/hooks/useScrolled';
import type { KefyCopy } from '@/lib/content';

interface NavProps {
  lang: string;
  copy: KefyCopy['nav'];
}

export default function Nav({ lang, copy }: NavProps) {
  const scrolled = useScrolled(40);
  const [langOpen, setLangOpen] = useState(false);

  return (
    <nav className={`nav${scrolled ? ' scrolled' : ''}`}>
      <div className="nav-inner">
        <Link href={`/${lang}`} className="logo">
          Kef<span className="y">y</span>
        </Link>

        <div className="nav-links">
          {copy.links.map((link) => (
            <a key={link.id} href={`#${link.id}`}>
              {link.label}
            </a>
          ))}
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

          <button className="btn btn-ghost">{copy.signin}</button>
          <button className="btn btn-primary">{copy.primary}</button>
        </div>
      </div>
    </nav>
  );
}
