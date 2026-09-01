import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appUrl, absoluteUrl } from '@/lib/app-url';

// Esta resolución es la que rompió en producción: NEXT_PUBLIC_APP_URL no estaba
// configurada en Vercel y los correos de recuperación llevaban a localhost.
// Lo que estos tests protegen es que nada desplegado pueda devolver localhost.

const ORIGINAL = { app: process.env.NEXT_PUBLIC_APP_URL, vercel: process.env.VERCEL_URL };

function setEnv(app?: string, vercel?: string) {
  if (app === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = app;
  if (vercel === undefined) delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL = vercel;
}

beforeEach(() => setEnv(undefined, undefined));
afterEach(() => setEnv(ORIGINAL.app, ORIGINAL.vercel));

describe('appUrl', () => {
  it('usa el dominio canónico cuando está configurado', () => {
    setEnv('https://www.kefy.app');
    expect(appUrl()).toBe('https://www.kefy.app');
  });

  // En un preview lo correcto es apuntar al propio preview, no a producción.
  it('cae en la URL del despliegue de Vercel y le pone el protocolo', () => {
    setEnv(undefined, 'kefy-abc123-depando.vercel.app');
    expect(appUrl()).toBe('https://kefy-abc123-depando.vercel.app');
  });

  it('el dominio configurado gana sobre la URL del despliegue', () => {
    setEnv('https://www.kefy.app', 'kefy-abc123-depando.vercel.app');
    expect(appUrl()).toBe('https://www.kefy.app');
  });

  it('en local, sin ninguna variable, usa el puerto de desarrollo', () => {
    expect(appUrl()).toBe('http://localhost:3099');
  });

  // El fallo original: un despliegue devolviendo enlaces a localhost.
  it('nunca devuelve localhost si hay alguna variable de Vercel', () => {
    setEnv(undefined, 'kefy-abc123-depando.vercel.app');
    expect(appUrl()).not.toContain('localhost');
  });

  it('ignora una variable vacía o con espacios', () => {
    setEnv('   ', 'kefy-abc123-depando.vercel.app');
    expect(appUrl()).toBe('https://kefy-abc123-depando.vercel.app');
  });

  it('quita la barra final para no generar URLs con doble barra', () => {
    setEnv('https://www.kefy.app/');
    expect(appUrl()).toBe('https://www.kefy.app');
  });

  it('respeta el protocolo si la variable de despliegue ya lo trae', () => {
    setEnv(undefined, 'https://kefy-abc123.vercel.app');
    expect(appUrl()).toBe('https://kefy-abc123.vercel.app');
  });
});

describe('absoluteUrl', () => {
  it('une la base con la ruta', () => {
    setEnv('https://www.kefy.app');
    expect(absoluteUrl('/es/reset-password')).toBe('https://www.kefy.app/es/reset-password');
  });

  it('añade la barra si la ruta no la trae', () => {
    setEnv('https://www.kefy.app');
    expect(absoluteUrl('es/dashboard')).toBe('https://www.kefy.app/es/dashboard');
  });

  it('sin ruta devuelve solo la base', () => {
    setEnv('https://www.kefy.app');
    expect(absoluteUrl('')).toBe('https://www.kefy.app');
  });

  it('no genera doble barra con base y ruta con barra', () => {
    setEnv('https://www.kefy.app/');
    expect(absoluteUrl('/es')).toBe('https://www.kefy.app/es');
  });
});
