import { redirect } from 'next/navigation';

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/dashboard/automations/autopilot`);
}
