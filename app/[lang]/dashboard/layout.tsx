import { AuthProvider } from '@/lib/auth-context';
import { BrandProvider } from '@/lib/brand-context';
import DashboardSidebar from '@/components/dashboard/Sidebar';
import BottomNav from '@/components/dashboard/BottomNav';
import UserAvatar from '@/components/dashboard/UserAvatar';
import MobileBrandSwitcher from '@/components/dashboard/MobileBrandSwitcher';
import MobileSettingsLink from '@/components/dashboard/MobileSettingsLink';
import AssistantWidget from '@/components/assistant/AssistantWidget';
import { ReactNode, Suspense } from 'react';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = lang === 'en' ? enCommon : esCommon;

  return (
    <AuthProvider lang={lang}>
      <BrandProvider>
        <a href="#main-content" className="skip-link">{t.nav.skipToContent}</a>
        <div className="dashboard-shell">
          <DashboardSidebar lang={lang} />
          <main id="main-content" tabIndex={-1} className="dashboard-main">
            {children}
          </main>
        </div>
        {/* Franja de fondo tras los controles fijos de arriba (solo móvil). */}
        <div className="mobile-topbar" aria-hidden="true" />
        <MobileBrandSwitcher lang={lang} />
        <MobileSettingsLink lang={lang} />
        <UserAvatar lang={lang} />
        <BottomNav lang={lang} />
        {/* useSearchParams exige Suspense en un layout renderizado en el servidor. */}
        <Suspense fallback={null}>
          <AssistantWidget lang={lang} />
        </Suspense>
      </BrandProvider>
    </AuthProvider>
  );
}
