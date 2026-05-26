import { redirect } from 'next/navigation';

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v);
  }
  const query = qs.toString();
  redirect(`/${lang}/dashboard/content/create${query ? `?${query}` : ''}`);
}
