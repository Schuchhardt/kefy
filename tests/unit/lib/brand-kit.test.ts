import { describe, it, expect } from 'vitest';
import { validateBrandKitUpdate, validateAssetUpload } from '@/lib/brand-kit';

// ─── validateBrandKitUpdate ───────────────────────────────────────────────────

describe('validateBrandKitUpdate', () => {
  it('devuelve null para un objeto vacío (no hay campos inválidos)', () => {
    expect(validateBrandKitUpdate({})).toBeNull();
  });

  it('acepta un nombre válido', () => {
    expect(validateBrandKitUpdate({ name: 'Mi Marca' })).toBeNull();
  });

  it('rechaza un nombre vacío', () => {
    expect(validateBrandKitUpdate({ name: '' })).toMatch(/name/);
  });

  it('rechaza un nombre de más de 100 caracteres', () => {
    expect(validateBrandKitUpdate({ name: 'x'.repeat(101) })).toMatch(/100/);
  });

  it('acepta tones válidos', () => {
    expect(validateBrandKitUpdate({ tone: ['professional', 'friendly'] })).toBeNull();
  });

  it('rechaza un tone inválido', () => {
    const err = validateBrandKitUpdate({ tone: ['professional', 'agresivo'] });
    expect(err).toMatch(/tone/i);
  });

  it('rechaza tone que no es array', () => {
    expect(validateBrandKitUpdate({ tone: 'professional' })).toMatch(/array/);
  });

  it('acepta un primary_color hex válido', () => {
    expect(validateBrandKitUpdate({ primary_color: '#FF5733' })).toBeNull();
  });

  it('rechaza un primary_color sin hash', () => {
    expect(validateBrandKitUpdate({ primary_color: 'FF5733' })).toMatch(/hex/i);
  });

  it('rechaza un primary_color con 3 dígitos', () => {
    expect(validateBrandKitUpdate({ primary_color: '#F57' })).toMatch(/hex/i);
  });

  it('permite primary_color null (borrar color)', () => {
    expect(validateBrandKitUpdate({ primary_color: null })).toBeNull();
  });

  it('rechaza website_url inválida', () => {
    expect(validateBrandKitUpdate({ website_url: 'no-es-url' })).toMatch(/url/i);
  });

  it('acepta website_url válida', () => {
    expect(validateBrandKitUpdate({ website_url: 'https://ejemplo.com' })).toBeNull();
  });

  it('rechaza uses_emojis no booleano', () => {
    expect(validateBrandKitUpdate({ uses_emojis: 'yes' })).toMatch(/boolean/);
  });

  it('acepta uses_emojis booleano', () => {
    expect(validateBrandKitUpdate({ uses_emojis: true })).toBeNull();
  });

  it('rechaza company_size inválido', () => {
    expect(validateBrandKitUpdate({ company_size: '500-1000' })).toMatch(/company_size/);
  });

  it('acepta todos los company_size válidos', () => {
    for (const size of ['1-10', '11-50', '51-200', '201-500', '500+']) {
      expect(validateBrandKitUpdate({ company_size: size })).toBeNull();
    }
  });

  it('rechaza customer_locations con más de 10 ítems', () => {
    const arr = Array.from({ length: 11 }, (_, i) => `Location ${i}`);
    expect(validateBrandKitUpdate({ customer_locations: arr })).toMatch(/10/);
  });

  it('acepta customer_locations con exactamente 10 ítems', () => {
    const arr = Array.from({ length: 10 }, (_, i) => `Location ${i}`);
    expect(validateBrandKitUpdate({ customer_locations: arr })).toBeNull();
  });

  it('rechaza competitors que no es array', () => {
    expect(validateBrandKitUpdate({ competitors: 'CompetidorA' })).toMatch(/array/);
  });
});

// ─── validateAssetUpload ──────────────────────────────────────────────────────

describe('validateAssetUpload', () => {
  function makeFile(type: string, size: number) {
    const buf = new Uint8Array(size);
    return new File([buf], 'test.file', { type });
  }

  it('acepta image/png dentro del límite', () => {
    expect(validateAssetUpload(makeFile('image/png', 100))).toBeNull();
  });

  it('acepta image/jpeg', () => {
    expect(validateAssetUpload(makeFile('image/jpeg', 100))).toBeNull();
  });

  it('acepta image/webp', () => {
    expect(validateAssetUpload(makeFile('image/webp', 100))).toBeNull();
  });

  it('acepta image/svg+xml', () => {
    expect(validateAssetUpload(makeFile('image/svg+xml', 100))).toBeNull();
  });

  it('rechaza image/bmp', () => {
    expect(validateAssetUpload(makeFile('image/bmp', 100))).toMatch(/Unsupported/);
  });

  it('rechaza application/pdf', () => {
    expect(validateAssetUpload(makeFile('application/pdf', 100))).toMatch(/Unsupported/);
  });

  it('rechaza archivos mayores a 5 MB', () => {
    const sixMB = 6 * 1024 * 1024;
    expect(validateAssetUpload(makeFile('image/png', sixMB))).toMatch(/large/);
  });

  it('acepta archivos de exactamente 5 MB', () => {
    const fiveMB = 5 * 1024 * 1024;
    expect(validateAssetUpload(makeFile('image/png', fiveMB))).toBeNull();
  });
});
