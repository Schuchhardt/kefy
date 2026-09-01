import { describe, it, expect } from 'vitest';
import { resolveBuildId, sanitizeBuildId } from '@/lib/build-id';

const sha = () => 'abcdef1234567890';

describe('resolveBuildId', () => {
  it('combina commit y despliegue sin necesidad de configurar nada', () => {
    const id = resolveBuildId({}, sha, () => 1_700_000_000_000);
    expect(id).toBe('abcdef12-loyw3v28');
  });

  it('da versiones distintas para dos builds del mismo commit', () => {
    const a = resolveBuildId({}, sha, () => 1_700_000_000_000);
    const b = resolveBuildId({}, sha, () => 1_700_000_060_000);
    expect(a).not.toBe(b);
    expect(a.startsWith('abcdef12-')).toBe(true);
    expect(b.startsWith('abcdef12-')).toBe(true);
  });

  it('usa el id de despliegue de Vercel cuando existe', () => {
    const id = resolveBuildId(
      { VERCEL_GIT_COMMIT_SHA: '1234567890abcdef', VERCEL_DEPLOYMENT_ID: 'dpl_ABCdef1234' },
      sha
    );
    expect(id).toBe('12345678-ABCdef1234');
  });

  it('usa el id de despliegue de Netlify cuando existe', () => {
    const id = resolveBuildId({ COMMIT_REF: 'fedcba9876543210', DEPLOY_ID: 'deploy1234' }, sha);
    expect(id).toBe('fedcba98-deploy1234');
  });

  it('sigue funcionando sin git y sin CI', () => {
    const id = resolveBuildId({}, () => null, () => 1_700_000_000_000);
    expect(id.startsWith('local-')).toBe(true);
  });

  it('respeta NEXT_PUBLIC_APP_VERSION para propagar el valor a los workers del build', () => {
    const id = resolveBuildId({ NEXT_PUBLIC_APP_VERSION: 'abcdef12-loyw3v28' }, sha);
    expect(id).toBe('abcdef12-loyw3v28');
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
