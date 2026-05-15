'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'pro' | 'business';
}

interface AuthState {
  user: User | null;
  org: Org | null;
  role: string | null;
  plan: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, lang }: { children: ReactNode; lang: string }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null, org: null, role: null, plan: null, loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setState({ user: data.user, org: data.org, role: data.role, plan: data.plan, loading: false });
      } else if (res.status === 401) {
        // Try to refresh the access token
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
        if (refreshRes.ok) {
          const meRes = await fetch('/api/auth/me');
          if (meRes.ok) {
            const data = await meRes.json();
            setState({ user: data.user, org: data.org, role: data.role, plan: data.plan, loading: false });
            return;
          }
        }
        setState({ user: null, org: null, role: null, plan: null, loading: false });
        router.push(`/${lang}/login`);
      } else {
        setState({ user: null, org: null, role: null, plan: null, loading: false });
      }
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [lang, router]);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setState({ user: null, org: null, role: null, plan: null, loading: false });
    router.push(`/${lang}/login`);
  }, [lang, router]);

  return (
    <AuthContext.Provider value={{ ...state, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
