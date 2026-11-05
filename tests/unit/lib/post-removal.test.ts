import { describe, expect, it } from 'vitest';
import { manualRemovalSteps } from '@/lib/post-removal';

describe('manualRemovalSteps', () => {
  it('Instagram: cuenta, link y dónde se elimina', () => {
    const steps = manualRemovalSteps('instagram', 'es', { username: '@kefy', postUrl: 'https://instagram.com/p/1' });
    expect(steps[0]).toBe('Inicia sesión en Instagram con la cuenta @kefy.');
    expect(steps[1]).toContain('https://instagram.com/p/1');
    expect(steps[2]).toContain('«Eliminar»');
  });

  it('en inglés', () => {
    const steps = manualRemovalSteps('tiktok', 'en', { postUrl: 'https://tiktok.com/v/1' });
    expect(steps[0]).toBe('Sign in to TikTok.');
    expect(steps[2]).toContain('"Delete"');
  });

  it('Snapchat sin link: indica desde dónde abrirla', () => {
    expect(manualRemovalSteps('snapchat', 'es')[1]).toContain('Spotlight');
  });

  it('sin red conocida: pasos genéricos', () => {
    const steps = manualRemovalSteps(null, 'es');
    expect(steps[0]).toBe('Inicia sesión en la red social.');
    expect(steps).toHaveLength(3);
  });
});
