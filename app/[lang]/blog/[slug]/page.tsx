import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import JsonLd from '@/components/seo/JsonLd';
import { seoCopy } from '@/lib/content';
import { SITE_URL } from '@/lib/share-metadata';
import { ORGANIZATION_ID, absolute, breadcrumbJsonLd, graph, pageMetadata } from '@/lib/seo';
import { createSupabaseServer } from '@/lib/supabase';
import type { BlogPost } from '@/types/blog';
import { KEFY_COPY } from '@/lib/content';
import BlogNav from '@/components/blog/BlogNav';
import BlogCoverImage from '@/components/blog/BlogCoverImage';
import Footer from '@/components/landing/Footer';
import esBlog from '@/locales/es/blog';
import enBlog from '@/locales/en/blog';

const labels: Record<string, typeof esBlog> = { es: esBlog, en: enBlog };

function formatDate(dateStr: string, lang: string): string {
  return new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// cache(): generateMetadata y la página piden el mismo artículo en un solo render.
const getPost = cache(async (slug: string, lang: string): Promise<BlogPost | null> => {
  try {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase
      .from('kefy_blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('lang', lang)
      .single();

    if (error) return null;
    return data as BlogPost;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const post = await getPost(slug, lang);
  if (!post) return {};
  // Cada idioma tiene sus propios artículos (y slugs): sin hreflang, solo canónica.
  return pageMetadata(lang, {
    title: `${post.title} | Kefy`,
    description: post.excerpt,
    path: (l) => `/${l}/blog/${post.slug}`,
    alternates: false,
    type: 'article',
    publishedTime: post.published_at,
    ...(post.cover_url ? { image: { url: post.cover_url, alt: post.title } } : {}),
  });
}

export async function generateStaticParams() {
  try {
    const supabase = createSupabaseServer();
    const { data } = await supabase
      .from('kefy_blog_posts')
      .select('slug, lang');

    return (data ?? []).map((row: { slug: string; lang: string }) => ({
      lang: row.lang,
      slug: row.slug,
    }));
  } catch {
    return [];
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const post = await getPost(slug, lang);
  const l = labels[lang] ?? labels['es'];

  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];

  if (!post) notFound();

  const seo = seoCopy(lang);
  const url = `${SITE_URL}/${lang}/blog/${post.slug}`;
  const jsonLd = graph(
    {
      '@type': 'BlogPosting',
      '@id': `${url}#article`,
      headline: post.title,
      description: post.excerpt,
      datePublished: post.published_at,
      dateModified: post.published_at,
      inLanguage: lang === 'en' ? 'en' : 'es',
      author: { '@type': 'Person', name: post.author },
      publisher: { '@id': ORGANIZATION_ID },
      mainEntityOfPage: url,
      ...(post.cover_url ? { image: absolute(post.cover_url) } : {}),
    },
    breadcrumbJsonLd([
      { name: seo.breadcrumb.home, url: `${SITE_URL}/${lang}` },
      { name: seo.breadcrumb.blog, url: `${SITE_URL}/${lang}/blog` },
      { name: post.title, url },
    ]),
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <BlogNav lang={lang} nav={copy.nav} cta={copy.cta} />
      <div className="page-layout">
      <div className="container">
        <Link href={`/${lang}/blog`} className="back-link">
          ← {l.back}
        </Link>

        <h1>{post.title}</h1>

        <div className="blog-post-meta">
          <span>{l.by} {post.author}</span>
          <span>·</span>
          <span>{formatDate(post.published_at, lang)}</span>
        </div>

        {post.cover_url && (
          <BlogCoverImage src={post.cover_url} alt={post.title} />
        )}

        <div className="prose">
          {post.content.split('\n\n').map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
      <Footer copy={copy.footer} lang={lang} />
    </>
  );
}
