'use client';

import { createContext, useContext, useState, useEffect, useCallback, Fragment, ReactNode } from 'react';

export interface Brand {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  /** Logo del Brand Kit de la marca. Respaldo cuando no hay `avatar_url`. */
  kit_logo_url?: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface BrandState {
  brands: Brand[];
  activeBrand: Brand | null;
  loading: boolean;
  canCreate: boolean;
  /** Sube cada vez que la marca activa cambia después de la carga inicial
   *  (selector, enlace a contenido de otra marca, cambio en otra pestaña).
   *  BrandScopedContent remonta la página con esta clave: así ningún estado
   *  cargado para la marca anterior sobrevive al cambio. */
  generation: number;
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
    generation: 0,
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

      setState((s) => ({
        brands: data.brands,
        activeBrand,
        loading: false,
        canCreate: data.canCreate,
        generation: s.activeBrand && activeBrand && s.activeBrand.id !== activeBrand.id
          ? s.generation + 1
          : s.generation,
      }));
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // La marca activa vive en una cookie compartida por todas las pestañas: si
  // se cambió en otra, esta seguiría mostrando la anterior mientras las APIs
  // ya responden con la nueva. Al volver a la pestaña se compara con el
  // servidor y, si difiere, se adopta (y la página se remonta).
  useEffect(() => {
    let checking = false;
    async function syncActive() {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const res = await fetch('/api/brands/active');
        if (!res.ok) return;
        const { brand } = await res.json() as { brand: Brand | null };
        if (!brand) return;
        setState((s) => (s.loading || s.activeBrand?.id === brand.id
          ? s
          : { ...s, activeBrand: brand, generation: s.generation + 1 }));
      } catch {
        // ignore
      } finally {
        checking = false;
      }
    }
    window.addEventListener('focus', syncActive);
    document.addEventListener('visibilitychange', syncActive);
    return () => {
      window.removeEventListener('focus', syncActive);
      document.removeEventListener('visibilitychange', syncActive);
    };
  }, []);

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
    setState((s) => (s.activeBrand?.id === brand.id
      ? { ...s, activeBrand: brand }
      : { ...s, activeBrand: brand, generation: s.generation + 1 }));
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
    // switchBrand no ve cambio (el estado ya apuntaba a la nueva): la página
    // se remonta aquí, con la cookie ya cambiada.
    setState((s) => ({ ...s, generation: s.generation + 1 }));

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

// ─── BrandScopedContent ───────────────────────────────────────────────────────
// Envuelve el contenido del dashboard. Casi todas las páginas cargan sus datos
// una vez al montar, de APIs que leen la marca activa de la cookie: sin esto,
// al cambiar de marca seguían mostrando (y editando) lo de la anterior.

export function BrandScopedContent({ children }: { children: ReactNode }) {
  const { generation } = useBrand();
  return <Fragment key={generation}>{children}</Fragment>;
}

// ─── useBrand ─────────────────────────────────────────────────────────────────

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within a BrandProvider');
  return ctx;
}
