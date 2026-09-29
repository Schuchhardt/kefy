'use client';

// /{lang}/dashboard/brand/setup — «Completa tu marca». Antes el wizard solo
// existía incrustado en el home de las cuentas nuevas y no se podía retomar;
// ahora tiene su página, enlazada desde Mi marca y desde la lista de
// bienvenida del home.

import { useParams, useRouter } from 'next/navigation';
import BrandKitWizard from '@/components/dashboard/BrandKitWizard';
import { useBrand } from '@/lib/brand-context';
import esSetup from '@/locales/es/dashboard/brand-setup';
import enSetup from '@/locales/en/dashboard/brand-setup';

export default function BrandSetupPage() {
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const { activeBrand } = useBrand();
  const t = lang === 'en' ? enSetup : esSetup;

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <header className="page-header">
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
      </header>
      <BrandKitWizard
        locale={lang}
        orgName={activeBrand?.name}
        onComplete={() => router.push(`/${lang}/dashboard/brand/identity`)}
        onExit={() => router.push(`/${lang}/dashboard`)}
      />
    </div>
  );
}
