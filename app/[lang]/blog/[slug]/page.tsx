import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase';
import type { BlogPost } from '@/lib/supabase';
import { KEFY_COPY } from '@/lib/content';
import BlogNav from '@/components/blog/BlogNav';
import BlogCoverImage from '@/components/blog/BlogCoverImage';
import Footer from '@/components/landing/Footer';

const labels: Record<string, { back: string; by: string }> = {
  es: { back: 'Volver al blog', by: 'Por' },
  en: { back: 'Back to blog', by: 'By' },
};

function formatDate(dateStr: string, lang: string): string {
  return new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

async function getPost(slug: string, lang: string): Promise<BlogPost | null> {
  try {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('lang', lang)
      .single();

    if (error) return null;
    return data as BlogPost;
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  try {
    const supabase = createSupabaseServer();
    const { data } = await supabase
      .from('blog_posts')
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

  return (
    <>
      <BlogNav lang={lang} nav={copy.nav} waitlist={copy.waitlist} />
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
