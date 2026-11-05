// Previsualizaciones por tipo, tal como se verían publicadas (ancho máx. 420 px):
//
//   story    → StoryFrame: marco 9:16, imagen de fondo o video, caption abajo.
//   post     → FeedCard: cabecera de la marca, imagen, texto y hashtags.
//   carousel → CarouselGallery: galería con scroll-snap e indicador 1/N.
//   reel     → ReelPreview: reproductor 9:16 si hay video; si no, Storyboard.
//
// Todo el texto (título, cuerpo, slides) se pinta como TEXTO: React lo escapa
// y aquí no hay ningún dangerouslySetInnerHTML. Lo cubre el test de XSS.

import { useRef, useState } from 'react';
import type { BrandViewT, ContentItemView, SlideView } from '@/lib/mcp-app/contract';
import { useEnv } from '../context';
import { displayTitle, hashtagsText } from '../format';
import { Icon } from './ui';

function Media({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const { t } = useEnv();
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`k-media-empty ${className ?? ''}`} role="img" aria-label={t.preview.noImage}>
        <Icon name="image" size={28} />
      </div>
    );
  }
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function VideoPlayer({ src, poster, title }: { src: string; poster: string | null; title: string }) {
  const { t } = useEnv();
  return (
    <video
      className="k-video"
      src={src}
      poster={poster ?? undefined}
      controls
      playsInline
      preload="metadata"
      aria-label={t.preview.videoLabel(title)}
    />
  );
}

export function BrandHeader({ brand, dark }: { brand: BrandViewT; dark?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initial = (brand.name ?? 'K').trim().charAt(0).toUpperCase() || 'K';
  return (
    <div className={`k-brand${dark ? ' k-brand--on-media' : ''}`}>
      {brand.avatar_url && !failed ? (
        <img className="k-brand__avatar" src={brand.avatar_url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="k-brand__avatar k-brand__avatar--initial" aria-hidden="true">{initial}</span>
      )}
      <span className="k-brand__name">{brand.name ?? 'Kefy'}</span>
    </div>
  );
}

function Hashtags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <ul className="k-tags">
      {tags.map((tag) => <li key={tag}>{hashtagsText([tag])}</li>)}
    </ul>
  );
}

function Caption({ item }: { item: ContentItemView }) {
  return (
    <div className="k-caption">
      {item.title ? <p className="k-caption__title">{item.title}</p> : null}
      {item.body ? <p className="k-caption__body">{item.body}</p> : null}
      <Hashtags tags={item.hashtags} />
    </div>
  );
}

export function StoryFrame({ item, brand }: { item: ContentItemView; brand: BrandViewT }) {
  const { t } = useEnv();
  const title = displayTitle(item.title, item.body, t.untitled);
  // Con video, el caption va debajo: encima taparía los controles.
  return (
    <div className="k-story">
      <div className="k-frame-916">
        {item.video_url ? (
          <VideoPlayer src={item.video_url} poster={item.image_url} title={title} />
        ) : (
          <>
            <Media src={item.image_url} alt={t.preview.imageAlt(title)} className="k-frame__media" />
            <div className="k-frame__top"><BrandHeader brand={brand} dark /></div>
            {item.body ? (
              <div className="k-frame__bottom">
                <p className="k-frame__caption">{item.body}</p>
              </div>
            ) : null}
          </>
        )}
      </div>
      {item.video_url && item.body ? <p className="k-caption__body k-story__below">{item.body}</p> : null}
    </div>
  );
}

export function FeedCard({ item, brand }: { item: ContentItemView; brand: BrandViewT }) {
  const { t } = useEnv();
  return (
    <article className="k-feed">
      <BrandHeader brand={brand} />
      <Media src={item.image_url} alt={t.preview.imageAlt(displayTitle(item.title, item.body, t.untitled))} className="k-feed__media" />
      <Caption item={item} />
    </article>
  );
}

function SlideCard({ slide, index }: { slide: SlideView; index: number }) {
  const { t } = useEnv();
  return (
    <figure className="k-slide" aria-label={t.preview.slideLabel(index + 1)}>
      <Media src={slide.image_url} alt={t.preview.slideLabel(index + 1)} className="k-slide__media" />
      {slide.title || slide.body ? (
        <figcaption className="k-slide__text">
          {slide.title ? <strong>{slide.title}</strong> : null}
          {slide.body ? <span>{slide.body}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function CarouselGallery({ item, brand }: { item: ContentItemView; brand: BrandViewT }) {
  const { t } = useEnv();
  const track = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0);
  const slides = item.slides.length ? item.slides : [{ slide_order: 1, title: item.title, body: null, image_url: item.image_url, duration_seconds: null }];
  const total = slides.length;

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(total - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setPos(next);
  };

  return (
    <article className="k-feed">
      <BrandHeader brand={brand} />
      <div className="k-carousel">
        <div
          ref={track}
          className="k-carousel__track"
          tabIndex={0}
          aria-roledescription="carousel"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.clientWidth) setPos(Math.round(el.scrollLeft / el.clientWidth));
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); go(pos + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); go(pos - 1); }
          }}
        >
          {slides.map((s, i) => <SlideCard key={i} slide={s} index={i} />)}
        </div>
        {total > 1 ? (
          <div className="k-carousel__nav">
            <button type="button" className="k-btn k-btn--ghost k-btn--icon" onClick={() => go(pos - 1)} disabled={pos === 0} aria-label={t.preview.prevSlide}>
              <Icon name="prev" />
            </button>
            <span className="k-carousel__pos" aria-live="polite">{t.preview.slidePosition(pos + 1, total)}</span>
            <button type="button" className="k-btn k-btn--ghost k-btn--icon" onClick={() => go(pos + 1)} disabled={pos >= total - 1} aria-label={t.preview.nextSlide}>
              <Icon name="next" />
            </button>
          </div>
        ) : null}
      </div>
      <Caption item={item} />
    </article>
  );
}

/** Guion plano a plano de un reel sin video: miniatura, duración y texto. */
export function Storyboard({ slides }: { slides: SlideView[] }) {
  const { t } = useEnv();
  if (!slides.length) return null;
  return (
    <ol className="k-storyboard" aria-label={t.preview.storyboard}>
      {slides.map((s, i) => (
        <li key={i} className="k-storyboard__shot">
          <Media src={s.image_url} alt={t.preview.slideLabel(i + 1)} className="k-storyboard__thumb" />
          <div className="k-storyboard__text">
            <span className="k-storyboard__meta">
              {t.video.shot(i + 1)}{s.duration_seconds ? ` · ${t.preview.seconds(s.duration_seconds)}` : ''}
            </span>
            {s.title ? <strong>{s.title}</strong> : null}
            {s.body ? <span>{s.body}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ReelPreview({ item, onProduce }: { item: ContentItemView; brand: BrandViewT; onProduce?: () => void }) {
  const { t } = useEnv();
  const title = displayTitle(item.title, item.body, t.untitled);
  return (
    <article className="k-feed">
      {item.video_url ? (
        <div className="k-frame-916"><VideoPlayer src={item.video_url} poster={item.image_url ?? item.slides[0]?.image_url ?? null} title={title} /></div>
      ) : (
        <div className="k-reel-pending">
          <div className="k-notice k-notice--info">
            <Icon name="video" size={16} />
            <div>
              <strong>{t.preview.videoNotProduced}</strong>
              <p>{t.preview.videoNotProducedHint}</p>
            </div>
          </div>
          <Storyboard slides={item.slides} />
          {onProduce ? (
            <button type="button" className="k-btn k-btn--primary" onClick={onProduce}>
              <Icon name="video" /><span>{t.actions.produceVideo}</span>
            </button>
          ) : null}
        </div>
      )}
      <Caption item={item} />
    </article>
  );
}

export function ContentPreview({ item, brand, onProduce }: { item: ContentItemView; brand: BrandViewT; onProduce?: () => void }) {
  switch (item.content_type) {
    case 'story': return <StoryFrame item={item} brand={brand} />;
    case 'carousel': return <CarouselGallery item={item} brand={brand} />;
    case 'reel': return <ReelPreview item={item} brand={brand} onProduce={onProduce} />;
    default: return <FeedCard item={item} brand={brand} />;
  }
}
