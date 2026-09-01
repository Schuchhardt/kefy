import { describe, it, expect } from 'vitest';
import {
  buildVersion,
  sanitizeBuildId,
  renderModule,
} from '../../../scripts/generate-build-id.mjs';

describe('buildVersion', () => {
  it('combina commit y timestamp sin leer ninguna variable de entorno', () => {
    expect(buildVersion('abcdef1234567890', 1_700_000_000_000)).toBe('abcdef12-loyw3v28');
  });

  it('da versiones distintas para dos builds del mismo commit', () => {
    const a = buildVersion('abcdef1234567890', 1_700_000_000_000);
    const b = buildVersion('abcdef1234567890', 1_700_000_060_000);
    expect(a).not.toBe(b);
  });

  it('funciona sin repo git disponible', () => {
    const id = buildVersion(null, 1_700_000_000_000);
    expect(id).toBe('loyw3v28');
  });
});

describe('sanitizeBuildId', () => {
  it('deja solo caracteres válidos para nombres de cache y URLs', () => {
    expect(sanitizeBuildId('feat/rama con espacios')).toBe('feat-rama-con-espacios');
    expect(sanitizeBuildId('--abc--')).toBe('abc');
    expect(sanitizeBuildId('###')).toBe('build');
  });

  it('acota el largo', () => {
    expect(sanitizeBuildId('a'.repeat(100)).length).toBe(40);
  });
});

describe('renderModule', () => {
  it('genera un módulo con la versión como constante', () => {
    expect(renderModule('abcdef12-loyw3v28')).toContain(
      "export const APP_VERSION = 'abcdef12-loyw3v28';"
    );
  });
});
