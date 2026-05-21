import { AuthProvider } from '@/lib/auth-context';
import DashboardSidebar from '@/components/dashboard/Sidebar';
import BottomNav from '@/components/dashboard/BottomNav';
import UserAvatar from '@/components/dashboard/UserAvatar';
import { ReactNode } from 'react';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  return (
    <AuthProvider lang={lang}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
        <DashboardSidebar lang={lang} />
        <main className="dashboard-main" style={{ flex: 1, overflowY: 'auto', height: '100vh' }}>
          {children}
        </main>
      </div>
      <UserAvatar lang={lang} />
      <BottomNav lang={lang} />
    </AuthProvider>
  );
}
