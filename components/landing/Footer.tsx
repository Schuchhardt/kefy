'use client';

import Image from 'next/image';
import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['footer'];
  lang: string;
}

export default function Footer({ copy, lang }: Props) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="logo">
              <Image src="/apple-touch-icon.png" alt="Kefy" width={24} height={24} />
              Kef<span className="y">y</span>
            </div>
            <p>{copy.tagline}</p>
          </div>

          {copy.cols.map((col, i) => (
            <div key={i} className="footer-col">
              <h4>{col.h}</h4>
              <ul>
                {col.items.map((item, j) => (
                  <li key={j}>
                    <a href={item.href.startsWith('/') ? `/${lang}${item.href}` : item.href}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <span>{copy.copy} · {copy.origin}</span>
          <div className="footer-socials">
            <a href="https://x.com/kefy.app" aria-label="X / Twitter" target="_blank" rel="noopener noreferrer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="https://linkedin.com/company/kefy-app" aria-label="LinkedIn" target="_blank" rel="noopener noreferrer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                <rect x="2" y="9" width="4" height="12" />
                <circle cx="4" cy="4" r="2" />
              </svg>
            </a>
            <a href="https://instagram.com/kefy.app" aria-label="Instagram" target="_blank" rel="noopener noreferrer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
