import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
} from '@/lib/auth';
import type { JWTPayload } from '@/types/auth';

const samplePayload: JWTPayload = {
  userId: 'user-123',
  orgId: 'org-456',
  role: 'owner',
  plan: 'pro',
};

describe('signAccessToken / verifyAccessToken', () => {
  it('devuelve el payload original en un round-trip', async () => {
    const token = await signAccessToken(samplePayload);
    const decoded = await verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(samplePayload.userId);
    expect(decoded?.orgId).toBe(samplePayload.orgId);
    expect(decoded?.role).toBe(samplePayload.role);
    expect(decoded?.plan).toBe(samplePayload.plan);
  });

  it('devuelve null para un token inválido', async () => {
    const result = await verifyAccessToken('token.invalido.aqui');
    expect(result).toBeNull();
  });

  it('devuelve null para un token con firma alterada', async () => {
    const token = await signAccessToken(samplePayload);
    const parts = token.split('.');
    // Alterar la firma
    parts[2] = parts[2].split('').reverse().join('');
    const tampered = parts.join('.');
    const result = await verifyAccessToken(tampered);
    expect(result).toBeNull();
  });

  it('produce tokens diferentes en llamadas sucesivas (iat distinto)', async () => {
    const t1 = await signAccessToken(samplePayload);
    await new Promise(r => setTimeout(r, 1100)); // esperar >1 segundo para que iat difiera
    const t2 = await signAccessToken(samplePayload);
    expect(t1).not.toBe(t2);
  });
});

describe('generateRefreshToken', () => {
  it('devuelve un raw de 96 caracteres hex', () => {
    const { raw } = generateRefreshToken();
    expect(raw).toMatch(/^[0-9a-f]{96}$/);
  });

  it('el hash difiere del raw', () => {
    const { raw, hash } = generateRefreshToken();
    expect(hash).not.toBe(raw);
  });

  it('el hash tiene 64 caracteres (SHA-256 hex)', () => {
    const { hash } = generateRefreshToken();
    expect(hash).toHaveLength(64);
  });

  it('expiresAt es en el futuro', () => {
    const { expiresAt } = generateRefreshToken();
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('cada llamada genera valores distintos', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('hashToken', () => {
  it('es determinista', () => {
    expect(hashToken('test-token')).toBe(hashToken('test-token'));
  });

  it('produce 64 caracteres hex', () => {
    expect(hashToken('algo')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tokens distintos producen hashes distintos', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});
