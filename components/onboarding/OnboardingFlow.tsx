'use client';

// ─── Onboarding: «pega tu web o describe tu negocio → 3 posts» ──────────────
//
// 1. Formulario: web y/o una frase. Dice cuántos créditos usa antes de gastar.
// 2. POST /api/onboarding/starter: lee la web, completa lo vacío del Brand Kit
//    y escribe 3 borradores (lib/services/onboarding.ts).
// 3. Muestra los 3 posts y pide sus imágenes, una por post, a
//    POST /api/content/image: el texto aparece en segundos y cada imagen llega
//    cuando está lista.
// 4. Siguiente paso: conectar Instagram para publicarlos.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Button, { ButtonLink, Spinner } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import { OPERATION_CREDIT_COSTS } from '@/lib/plans';
import esCopy from '@/locales/es/onboarding';
import enCopy from '@/locales/en/onboarding';
import styles from './OnboardingFlow.module.css';

type Angle = 'intro' | 'tip' | 'benefit';

interface StarterPost {
  id: string;
  angle: Angle;
  body: string;
  hashtags: string[];
}

interface StarterResult {
  brandName: string;
  filled: string[];
  posts: StarterPost[];
  failed: number;
  websiteError?: string;
}

type ImageState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' };

const POSTS = 3;

/** Créditos que se van a usar: lectura de la web + 3 textos + 3 imágenes. */
function estimate(withUrl: boolean): number {
  return (withUrl ? OPERATION_CREDIT_COSTS.text : 0)
    + POSTS * (OPERATION_CREDIT_COSTS.text + OPERATION_CREDIT_COSTS.image);
}

export default function OnboardingFlow({ lang }: { lang: string }) {
  const t = lang === 'en' ? enCopy : esCopy;
  const base = `/${lang}/dashboard`;

  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<'form' | 'working' | 'done'>('form');
  const [error, setError] = useState<{ message: string; plans?: boolean } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [result, setResult] = useState<StarterResult | null>(null);
  const [images, setImages] = useState<Record<string, ImageState>>({});
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  // Créditos que quedan, para decirlo antes de gastar. Si falla, se omite.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!cancelled && typeof me?.usage?.remaining === 'number') setRemaining(me.usage.remaining);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (phase === 'done') doneHeadingRef.current?.focus();
  }, [phase]);

  async function generateImage(post: StarterPost) {
    setImages((prev) => ({ ...prev, [post.id]: { status: 'loading' } }));
    try {
      const res = await fetch('/api/content/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: post.id,
          prompt: post.body.slice(0, 400),
          size: '1024x1024',
          quality: 'medium',
        }),
      });
      const data = await res.json().catch(() => null);
      const imageUrl = data?.image?.url;
      setImages((prev) => ({
        ...prev,
        [post.id]: res.ok && typeof imageUrl === 'string' ? { status: 'ready', url: imageUrl } : { status: 'error' },
      }));
    } catch {
      setImages((prev) => ({ ...prev, [post.id]: { status: 'error' } }));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim() && !description.trim()) {
      setError({ message: t.errors.empty });
      urlRef.current?.focus();
      return;
    }

    setPhase('working');
    try {
      const res = await fetch('/api/onboarding/starter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() || undefined, description: description.trim() || undefined, lang }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // 402 (suscripción) y créditos agotados traen su propio mensaje en el
        // idioma de la petición; se ofrece ir a planes.
        const plans = res.status === 402 || data?.creditsExhausted === true;
        setError({ message: typeof data?.error === 'string' ? data.error : t.errors.generic, plans });
        setPhase('form');
        return;
      }
      const out = data as StarterResult;
      setResult(out);
      setPhase('done');
      // Las imágenes, en paralelo y sin bloquear: cada tarjeta muestra la suya.
      for (const post of out.posts) void generateImage(post);
    } catch {
      setError({ message: t.errors.network });
      setPhase('form');
    }
  }

  if (phase === 'working') {
    return (
      <div className={styles.working} role="status" aria-live="polite">
        <Spinner size={28} />
        <p className={styles.workingTitle}>{t.working.title}</p>
        <ol className={styles.steps}>
          {url.trim() && <li>{t.working.readingWeb}</li>}
          <li>{t.working.writing}</li>
          <li>{t.working.images}</li>
        </ol>
        <p className={styles.hint}>{t.working.hint}</p>
      </div>
    );
  }

  if (phase === 'done' && result) {
    return (
      <div className={styles.done}>
        <div className={styles.doneHead}>
          <h2 ref={doneHeadingRef} tabIndex={-1} className={styles.doneTitle}>{t.done.title}</h2>
          <p className={styles.muted}>{t.done.intro}</p>
        </div>

        {result.websiteError && <Notice tone="warning">{t.done.websiteFailed}</Notice>}
        {result.failed > 0 && <Notice tone="warning">{t.done.partial(result.failed)}</Notice>}

        <ol className={styles.posts}>
          {result.posts.map((post) => {
            const angle = t.done.angles[post.angle];
            const img = images[post.id];
            return (
              <li key={post.id} className={styles.post}>
                <div className={styles.media}>
                  {img?.status === 'ready' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.url} alt={t.done.imageAlt(angle)} className={styles.image}
                      // Si la URL no carga, mejor el botón de reintentar que un icono roto.
                      onError={() => setImages((prev) => ({ ...prev, [post.id]: { status: 'error' } }))}
                    />
                  ) : img?.status === 'error' ? (
                    <div className={styles.mediaEmpty}>
                      <p>{t.done.imageError}</p>
                      <Button size="sm" variant="secondary" onClick={() => generateImage(post)}>
                        {t.done.imageRetry}
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.mediaEmpty} role="status">
                      <Spinner size={18} />
                      <p>{t.done.imageLoading}</p>
                    </div>
                  )}
                </div>
                <div className={styles.postBody}>
                  <span className={styles.angle}>{angle}</span>
                  <p className={styles.text}>{post.body}</p>
                  {post.hashtags.length > 0 && (
                    <p className={styles.hashtags}>{post.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}</p>
                  )}
                  <ButtonLink href={`${base}/content/${post.id}`} size="sm" variant="ghost" icon={<Icon name="edit" size={16} />}>
                    {t.done.edit}
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ol>

        <section className={styles.next} aria-labelledby="onb-connect">
          <h3 id="onb-connect" className={styles.nextTitle}>{t.done.connectTitle}</h3>
          <p className={styles.muted}>{t.done.connectBody}</p>
          <div className={styles.actions}>
            <ButtonLink href={`${base}/settings?connect=instagram`} variant="primary" size="lg" block>
              {t.done.connect}
            </ButtonLink>
            <ButtonLink href={`${base}/settings`} variant="secondary" size="lg" block>
              {t.done.otherNetworks}
            </ButtonLink>
          </div>
          <div className={styles.secondary}>
            <ButtonLink href={`${base}/brand/setup`} variant="ghost" size="sm">{t.done.completeBrand}</ButtonLink>
            <ButtonLink href={base} variant="ghost" size="sm">{t.done.goDashboard}</ButtonLink>
          </div>
        </section>
      </div>
    );
  }

  const credits = estimate(!!url.trim());

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <p className={styles.intro}>{t.intro}</p>

      <div>
        <label htmlFor="onb-url" className="auth-label">{t.urlLabel}</label>
        <input
          ref={urlRef}
          id="onb-url"
          className="auth-input"
          type="url"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t.urlPlaceholder}
          aria-describedby="onb-url-hint"
        />
        <p id="onb-url-hint" className={styles.fieldHint}>{t.urlHint}</p>
      </div>

      <p className={styles.or} aria-hidden="true"><span>{t.or}</span></p>

      <div>
        <label htmlFor="onb-description" className="auth-label">{t.descriptionLabel}</label>
        <textarea
          id="onb-description"
          className={`auth-input ${styles.textarea}`}
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.descriptionPlaceholder}
        />
      </div>

      {error && (
        <div role="alert" className="auth-error">
          {error.message}{' '}
          {error.plans && <a href={`${base}/settings#billing`}>{t.errors.plans}</a>}
        </div>
      )}

      <Button type="submit" variant="primary" size="lg" block icon={<Icon name="sparkles" size={18} />}>
        {t.submit}
      </Button>
      <p className={styles.cost}>
        {remaining !== null ? t.costRemaining(credits, remaining) : t.cost(credits)}
      </p>

      <p className="auth-alt" style={{ marginTop: 0 }}>
        <a href={base}>{t.skip}</a>
      </p>
    </form>
  );
}
