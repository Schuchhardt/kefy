import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { PostPreview } from '@/components/dashboard/PostPreview';
import { getDemoPreview } from '@/lib/services/demo-preview';
import { salesContactHref } from '@/lib/contact';
import esCopy from '@/locales/es/demo';
import enCopy from '@/locales/en/demo';
import styles from './page.module.css';

// /{lang}/demo/{token}: vista previa pública de una marca demo que el dueño de
// Kefy le manda a un prospecto (lib/services/admin/demo-brands.ts). Sin sesión:
// el token es la credencial. No se indexa (metadata + robots.ts).

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ lang: string; token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lang } = await params;
  const t = lang === 'en' ? enCopy : esCopy;
  // Sin el nombre de la marca: el título no debe revelar a quién es la demo
  // si el link se filtra en una vista previa de chat.
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

export default async function DemoPreviewPage({ params }: Params) {
  const { lang: rawLang, token } = await params;
  const lang = rawLang === 'en' ? 'en' : 'es';
  const t = lang === 'en' ? enCopy : esCopy;
  const preview = await getDemoPreview(token);

  if (!preview) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>{t.notFoundTitle}</h1>
          <p className={styles.muted}>{t.notFoundText}</p>
          <Link className={styles.secondary} href={`/${lang}`}>{t.ctaLearn}</Link>
        </section>
      </main>
    );
  }

  const { brand, posts } = preview;
  const username = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30) || 'brand';
  const expires = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-CL', { dateStyle: 'long' })
    .format(new Date(preview.expiresAt));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.badge}>{t.badge}</p>
        <div className={styles.brand}>
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.logo} src={brand.logoUrl} alt="" width={56} height={56} />
          )}
          <div>
            <h1 className={styles.title}>{t.title(brand.name)}</h1>
            {brand.tagline && <p className={styles.muted}>{brand.tagline}</p>}
          </div>
        </div>
        <p className={styles.intro}>{t.intro}</p>
        {(brand.primaryColor || brand.accentColor) && (
          <div className={styles.swatches} aria-hidden="true">
            {[brand.primaryColor, brand.accentColor].filter(Boolean).map((c) => (
              <span key={c} className={styles.swatch} style={{ background: c as string }} />
            ))}
          </div>
        )}
      </header>

      <section aria-labelledby="demo-posts">
        <h2 id="demo-posts" className={styles.sectionTitle}>{t.postsTitle}</h2>
        {posts.length === 0 ? (
          <p className={styles.muted}>{t.empty}</p>
        ) : (
          <ol className={styles.grid}>
            {posts.map((p, i) => (
              <li key={p.id} aria-label={t.postLabel(i + 1)} className={styles.post}>
                <PostPreview
                  channel={p.channel}
                  body={p.body}
                  imageUrl={p.imageUrl}
                  hashtags={p.hashtags}
                  username={username}
                  logoUrl={brand.logoUrl}
                  lang={lang}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{t.ctaTitle}</h2>
        <p className={styles.muted}>{t.ctaText}</p>
        <div className={styles.actions}>
          <a className={styles.primary} href={salesContactHref(lang)}>{t.ctaContact}</a>
          <Link className={styles.secondary} href={`/${lang}`}>{t.ctaLearn}</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <p className={styles.muted}>{t.expires(expires)}</p>
        <Link href={`/${lang}`} className={styles.made}>
          <Image src="/apple-touch-icon.png" alt="" width={20} height={20} />
          {t.footer}
        </Link>
      </footer>
    </main>
  );
}
