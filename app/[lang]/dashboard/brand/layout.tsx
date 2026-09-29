'use client';

// Mi marca: pestañas Identidad / Mercado / Estrategia y, mientras al Brand Kit
// le falten datos clave, un aviso que lleva a «Completa tu marca»
// (/brand/setup). Antes el wizard solo aparecía en el home de las cuentas
// nuevas y, una vez desaparecido, no había forma de volver a él.
//
// La página del wizard va sin pestañas: es un flujo con su propia navegación.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import SectionTabs from '@/components/dashboard/SectionTabs';
import Icon from '@/components/ui/icons';
import { useBrand } from '@/lib/brand-context';
import { brandCompleteness, type BrandCompleteness } from '@/lib/brand-setup';
import { buttonClass } from '@/components/ui/Button';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

export default function BrandLayout({ children }: { children: ReactNode }) {
  const { lang } = useParams<{ lang: string }>();
  const pathname = usePathname() ?? '';
  const { activeBrand } = useBrand();
  const common = lang === 'en' ? enCommon : esCommon;
  const t = common.sections.brand;
  const base = `/${lang}/dashboard/brand`;
  const inSetup = pathname.startsWith(`${base}/setup`);

  const [completeness, setCompleteness] = useState<BrandCompleteness | null>(null);

  // Se vuelve a leer al cambiar de marca o de pestaña (tras guardar en
  // Identidad o Mercado el porcentaje cambia).
  useEffect(() => {
    if (inSetup) return;
    let cancelled = false;
    fetch('/api/brand-kit', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.kit) setCompleteness(brandCompleteness(data.kit)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [inSetup, pathname, activeBrand?.id]);

  if (inSetup) return <>{children}</>;

  return (
    <SectionTabs
      ariaLabel={t.aria}
      defaultKey="identity"
      tabs={[
        { key: 'identity', label: t.identity, href: `${base}/identity` },
        { key: 'market', label: t.market, href: `${base}/market` },
        { key: 'strategy', label: t.strategy, href: `${base}/strategy` },
      ]}
    >
      {completeness && !completeness.complete && (
        <div className="brand-setup-banner">
          <Icon name="sparkles" size={18} />
          <p>
            <strong>{common.brandSetup.title(completeness.percent)}</strong>{' '}
            {common.brandSetup.body}
          </p>
          <Link href={`${base}/setup`} className={buttonClass({ variant: 'primary', size: 'sm' })}>
            {common.brandSetup.cta}
          </Link>
        </div>
      )}
      {children}
    </SectionTabs>
  );
}
