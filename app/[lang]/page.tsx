import { KEFY_COPY } from '@/lib/content';
import LandingClient from '@/components/landing/LandingClient';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];

  return <LandingClient lang={lang} copy={copy} />;
}
