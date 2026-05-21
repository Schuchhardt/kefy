import { redirect } from 'next/navigation';

export default async function BrandPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/dashboard/brand/identity`);
}
