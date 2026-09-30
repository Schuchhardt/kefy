'use client';

// Acceso directo a Ajustes en móvil. El sidebar (donde vive Ajustes en
// escritorio) se oculta en móvil y el BottomNav tiene cinco destinos: sin esto
// Ajustes solo se encontraba abriendo el menú del avatar.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/icons';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

export default function MobileSettingsLink({ lang }: { lang: string }) {
  const pathname = usePathname() ?? '';
  const t = lang === 'en' ? enCommon : esCommon;
  const href = `/${lang}/dashboard/settings`;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className="mobile-settings-link top-fixed"
      aria-label={t.nav.settings}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name="settings" size={17} />
    </Link>
  );
}
