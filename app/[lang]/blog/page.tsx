import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase';
import type { BlogPost } from '@/lib/supabase';
import { KEFY_COPY } from '@/lib/content';
import BlogNav from '@/components/blog/BlogNav';
import Footer from '@/components/landing/Footer';

const blogLabels: Record<string, { title: string; sub: string; readMore: string; empty: string; back: string }> = {
  es: {
    title: 'Blog',
    sub: 'Marketing, contenido y crecimiento para negocios que no tienen un equipo dedicado.',
    readMore: 'Leer artículo →',
    empty: 'Pronto publicaremos nuestros primeros artículos. ¡Vuelve en unos días!',
    back: 'Volver al inicio',
  },
  en: {
    title: 'Blog',
    sub: 'Marketing, content and growth for businesses without a dedicated team.',
    readMore: 'Read article →',
    empty: 'Our first articles are coming soon. Check back in a few days!',
    back: 'Back to home',
  },
};

function formatDate(dateStr: string, lang: string): string {
  return new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

async function getPosts(lang: string): Promise<BlogPost[]> {
  try {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, slug, lang, title, excerpt, author, published_at, cover_url')
      .eq('lang', lang)
      .order('published_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as BlogPost[];
  } catch {
    return [];
  }
}

export default async function BlogPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const labels = blogLabels[lang] ?? blogLabels['es'];
  const posts = await getPosts(lang);

  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];

  return (
    <>
      <BlogNav lang={lang} nav={copy.nav} waitlist={copy.waitlist} />
      <div className="page-layout">
      <div className="container" style={{ maxWidth: '960px' }}>
        <Link href={`/${lang}`} className="back-link">
          ← {labels.back}
        </Link>
        <h1>{labels.title}</h1>
        <p className="page-sub">{labels.sub}</p>

        {posts.length === 0 ? (
          <p className="blog-empty">{labels.empty}</p>
        ) : (
          <div className="blog-grid">
            {posts.map((post) => (
              <Link key={post.id} href={`/${lang}/blog/${post.slug}`} className="blog-card">
                <span className="blog-card-date">{formatDate(post.published_at, lang)}</span>
                <span className="blog-card-title">{post.title}</span>
                <span className="blog-card-excerpt">{post.excerpt}</span>
                <span className="blog-card-cta">{labels.readMore}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
      <Footer copy={copy.footer} lang={lang} />
    </>
  );
}
