import { describe, it, expect } from 'vitest';
import manifest from '@/app/manifest';

describe('manifest PWA', () => {
  const m = manifest();

  it('es instalable: nombre, scope, start_url y display', () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBe('Kefy');
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
  });

  it('declara los iconos de 192 y 512 requeridos, incluidos los maskable', () => {
    const sizes = (m.icons ?? []).map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toContain('192x192:any');
    expect(sizes).toContain('512x512:any');
    expect(sizes).toContain('192x192:maskable');
    expect(sizes).toContain('512x512:maskable');
  });
});
