import { AuthProvider } from '@/lib/auth-context';
import DashboardSidebar from '@/components/dashboard/Sidebar';
import BottomNav from '@/components/dashboard/BottomNav';
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
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <DashboardSidebar lang={lang} />
        <main className="dashboard-main" style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </main>
      </div>
      <BottomNav lang={lang} />
    </AuthProvider>
  );
}
