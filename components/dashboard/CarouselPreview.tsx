'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icons';
import { networkFrame, safeAreaCss } from '@/lib/preview-layout';
import { brandFontStack, ensureGoogleFontLoaded } from '@/lib/google-fonts';
import type { ContentChannel } from '@/types/ai';
import type { CarouselSlide, ContentType, ReelScene } from '@/types/content';
import esPublish from '@/locales/es/dashboard/publish';
import enPublish from '@/locales/en/dashboard/publish';
import styles from './CarouselPreview.module.css';

type PreviewCopy = typeof esPublish.preview;

/** Textos de las vistas previas en el idioma de la interfaz. */
export function previewCopy(lang: 'es' | 'en' = 'es'): PreviewCopy {
  return (lang === 'en' ? enPublish : esPublish).preview;
}

/** Puntos + anterior/siguiente para recorrer los slides de un carrusel o las
 *  escenas de un reel. Cada punto es un botón con nombre («Slide 2 de 5») y
 *  36px de alto; las flechas miden 36×36. */
export function SlideDots({
  total, idx, onSelect, lang = 'es',
}: {
  total:    number;
  idx:      number;
  onSelect: (i: number) => void;
  lang?:    'es' | 'en';
}) {
  const t = previewCopy(lang);
  return (
    <div className={styles.slideNav} role="group" aria-label={t.slidesLabel}>
      <button
        type="button"
        className={styles.slideArrow}
        aria-label={t.prevSlide}
        disabled={idx <= 0}
        onClick={() => onSelect(idx - 1)}
      >
        <Icon name="chevron-left" size={16} />
      </button>
      <div className={styles.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            type="button"
            className={styles.dot}
            aria-label={t.slide(i + 1, total)}
            aria-current={i === idx ? 'true' : undefined}
            onClick={() => onSelect(i)}
          >
            <span className={styles.dotMark} aria-hidden="true" />
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.slideArrow}
        aria-label={t.nextSlide}
        disabled={idx >= total - 1}
        onClick={() => onSelect(idx + 1)}
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </div>
  );
}

// Gradient palette for slides without images
const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #96fbc4 0%, #f9f586 100%)',
];

/** The media area of a carousel slide: the generated image with its text
 *  overlay, or a gradient card with the slide copy when there's no image yet.
 *  Extracted so channel-specific chrome (Instagram, LinkedIn, TikTok…) can
 *  reuse the exact same slide rendering.
 *
 *  El texto va SIEMPRE como HTML encima de la imagen limpia — no quemado en los
 *  píxeles. Se posiciona dentro de la zona segura de la red (`lib/preview-layout`),
 *  la misma que usa el servidor al componerlo de verdad en la publicación, así
 *  que lo que se ve acá es donde va a quedar. */
export function SlideCanvas({
  slide, index, total, showCounter = true, platform = 'instagram', format = 'carousel', brandFont,
}: {
  slide:        CarouselSlide | ReelScene;
  index:        number;
  total:        number;
  showCounter?: boolean;
  platform?:    ContentChannel;
  format?:      ContentType;
  /** Tipografía del Brand Kit (`font_heading`), la misma con la que el
   *  servidor escribirá este texto dentro de la imagen al publicar. */
  brandFont?:   string | null;
}) {
  const frame = networkFrame(platform, format);
  const safe  = safeAreaCss(platform, format);
  const font  = brandFontStack(brandFont);

  useEffect(() => { ensureGoogleFontLoaded(brandFont); }, [brandFont]);

  return (
    <div
      style={{
        position: 'relative', width: '100%',
        aspectRatio: frame.css, overflow: 'hidden', background: '#000',
      }}
    >
      {slide.image_url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.image_url}
            alt={slide.title}
            style={{ width: '100%', height: '100%', objectFit: frame.fit, display: 'block' }}
          />
          {/* Degradado de legibilidad, debajo del texto. */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0) 100%)',
            pointerEvents: 'none',
          }} />
          {/* Overlay HTML: el mismo texto que el servidor quema al publicar,
              acotado a la zona que la interfaz de la red no tapa. */}
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              boxSizing: 'border-box',
              pointerEvents: 'none',
              ...safe,
            }}
          >
            <p style={{
              margin: '0 0 5px', fontSize: 17, fontWeight: 800,
              color: '#fff', lineHeight: 1.25, fontFamily: font,
              textShadow: '0 1px 6px rgba(0,0,0,0.85), 0 0 18px rgba(0,0,0,0.6)',
            }}>
              {slide.title}
            </p>
            {slide.body && (
              <p style={{
                margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.92)', fontFamily: font,
                lineHeight: 1.45, textShadow: '0 1px 6px rgba(0,0,0,0.85), 0 0 14px rgba(0,0,0,0.6)',
              }}>
                {slide.body}
              </p>
            )}
          </div>
        </>
      ) : (
        /* Gradient card with text */
        <div
          style={{
            width: '100%', height: '100%',
            background: GRADIENTS[index % GRADIENTS.length],
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '28px 24px', boxSizing: 'border-box',
          }}
        >
          <span
            style={{
              fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
              textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18,
            }}
          >
            {index + 1} / {total}
          </span>
          <p
            style={{
              fontSize: index === 0 ? 26 : 22, fontWeight: 800, color: '#fff', fontFamily: font,
              textAlign: 'center', lineHeight: 1.25,
              margin: '0 0 16px', textShadow: '0 2px 10px rgba(0,0,0,0.25)',
            }}
          >
            {slide.title}
          </p>
          <p
            style={{
              fontSize: 15, color: 'rgba(255,255,255,0.85)', fontFamily: font,
              textAlign: 'center', lineHeight: 1.55, margin: 0, maxWidth: 260,
            }}
          >
            {slide.body}
          </p>
        </div>
      )}

      {/* Slide counter badge (only when image is present) */}
      {showCounter && slide.image_url && (
        <div
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            fontSize: 12, fontWeight: 600, borderRadius: 20,
            padding: '3px 9px', backdropFilter: 'blur(6px)',
          }}
        >
          {index + 1}/{total}
        </div>
      )}
    </div>
  );
}

export function CarouselPreview({
  slides,
  username,
  logoUrl,
  description,
  lang = 'es',
}: {
  slides:       CarouselSlide[];
  username?:    string;
  logoUrl?:     string | null;
  description?: string;
  lang?:        'es' | 'en';
}) {
  const t = previewCopy(lang);
  const name = username ?? t.defaultUsername;
  const [idx, setIdx] = useState(0);
  const slide = slides[idx];
  const total = slides.length;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        marginBottom: 16,
      }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 10 }}>
        {/* Avatar with IG-style gradient ring */}
        <div
          style={{
            width: 36, height: 36, borderRadius: '50%', padding: 2, flexShrink: 0,
            background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={name}
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: '100%', height: '100%', borderRadius: '50%',
                background: '#1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff',
              }}
            >
              {name[0]?.toUpperCase()}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{name}</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>Instagram · {t.now}</p>
        </div>
        <Icon name="more" size={18} style={{ color: 'var(--muted)' }} />
      </div>

      {/* ── Image / Content area (1:1) ───────────────── */}
      <div
        style={{
          position: 'relative', width: '100%',
          aspectRatio: '1 / 1', overflow: 'hidden', background: '#000',
        }}
      >
        <SlideCanvas slide={slide} index={idx} total={total} />

        {idx > 0 && (
          <button
            type="button"
            className={`${styles.overlayArrow} ${styles.overlayArrowPrev}`}
            aria-label={t.prevSlide}
            onClick={() => setIdx((i) => i - 1)}
          >
            <Icon name="chevron-left" size={18} strokeWidth={2.4} />
          </button>
        )}

        {idx < total - 1 && (
          <button
            type="button"
            className={`${styles.overlayArrow} ${styles.overlayArrowNext}`}
            aria-label={t.nextSlide}
            onClick={() => setIdx((i) => i + 1)}
          >
            <Icon name="chevron-right" size={18} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {/* ── Actions bar (decorativa: imita la interfaz de Instagram) ─── */}
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', padding: '8px 12px 4px', gap: 14, color: 'var(--text)' }}>
        <Icon name="heart" size={22} strokeWidth={2} />
        <Icon name="inbox" size={22} strokeWidth={2} />
        <Icon name="send" size={22} strokeWidth={2} />
        <div style={{ flex: 1 }} />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>

      {/* ── Slide dots ───────────────────────────────── */}
      {total > 1 && <SlideDots total={total} idx={idx} onSelect={setIdx} lang={lang} />}

      {/* ── Caption ──────────────────────────────────── */}
      <div style={{ padding: '2px 12px 14px', fontSize: 13, lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{name} </span>
          <span style={{ color: 'var(--text)', opacity: 0.9 }}>
            {description ?? slides[0]?.title ?? ''}
          </span>
        </p>
      </div>
    </div>
  );
}
