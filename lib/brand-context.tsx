'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface Brand {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface BrandState {
  brands: Brand[];
  activeBrand: Brand | null;
  loading: boolean;
  canCreate: boolean;
}

interface BrandContextValue extends BrandState {
  switchBrand: (id: string) => Promise<void>;
  createBrand: (name: string) => Promise<Brand>;
  refresh: () => Promise<void>;
}

const BrandContext = createContext<BrandContextValue | null>(null);

// ─── BrandProvider ────────────────────────────────────────────────────────────

export function BrandProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BrandState>({
    brands: [],
    activeBrand: null,
    loading: true,
    canCreate: false,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/brands');
      if (!res.ok) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      const data = await res.json() as {
        brands: Brand[];
        count: number;
        limit: number;
        canCreate: boolean;
      };

      // Determine the active brand from the httpOnly cookie via the server;
      // since httpOnly cookies can't be read in JS, we call /api/brands/active
      // which returns the current brand id (reading the cookie server-side).
      let activeBrand: Brand | null = null;
      try {
        const activeRes = await fetch('/api/brands/active');
        if (activeRes.ok) {
          const { brand } = await activeRes.json() as { brand: Brand | null };
          activeBrand = brand;
        }
      } catch {
        // ignore
      }

      // Fallback: first brand
      if (!activeBrand && data.brands.length > 0) {
        activeBrand = data.brands[0];
      }

      setState({
        brands: data.brands,
        activeBrand,
        loading: false,
        canCreate: data.canCreate,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const switchBrand = useCallback(async (id: string) => {
    const res = await fetch('/api/brands/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: id }),
    });

    if (!res.ok) {
      const { error } = await res.json() as { error: string };
      throw new Error(error ?? 'Failed to switch brand');
    }

    const { brand } = await res.json() as { brand: Brand };
    setState((s) => ({ ...s, activeBrand: brand }));
  }, []);

  const createBrand = useCallback(async (name: string): Promise<Brand> => {
    const res = await fetch('/api/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const { error } = await res.json() as { error: string };
      throw new Error(error ?? 'Failed to create brand');
    }

    const { brand } = await res.json() as { brand: Brand };

    // Add to list and switch to it
    setState((s) => ({
      ...s,
      brands: [...s.brands, brand],
      activeBrand: brand,
      canCreate: false, // optimistic — refresh will correct this
    }));

    // Switch cookie server-side
    await switchBrand(brand.id);

    // Full refresh to update canCreate correctly
    await refresh();

    return brand;
  }, [switchBrand, refresh]);

  return (
    <BrandContext.Provider value={{ ...state, switchBrand, createBrand, refresh }}>
      {children}
    </BrandContext.Provider>
  );
}

// ─── useBrand ─────────────────────────────────────────────────────────────────

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within a BrandProvider');
  return ctx;
}
