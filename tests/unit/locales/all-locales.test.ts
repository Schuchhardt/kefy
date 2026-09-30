/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

// Paridad es/en de TODOS los archivos de locales/, descubiertos solos: un
// locale nuevo queda cubierto sin tocar este test. parity.test.ts sigue con
// las reglas específicas de la landing (precios, promesas, formatos).
//
// Antes solo se vigilaban la landing, el asistente y los ajustes: las pantallas
// de auth no tenían locales y el resto del dashboard podía divergir sin aviso.

const esModules = import.meta.glob('../../../locales/es/**/*.ts', { eager: true }) as Record<string, { default?: unknown }>;
const enModules = import.meta.glob('../../../locales/en/**/*.ts', { eager: true }) as Record<string, { default?: unknown }>;

const rel = (path: string, lang: 'es' | 'en') => path.split(`/locales/${lang}/`)[1];

const esFiles = Object.fromEntries(Object.entries(esModules).map(([p, m]) => [rel(p, 'es'), m.default]));
const enFiles = Object.fromEntries(Object.entries(enModules).map(([p, m]) => [rel(p, 'en'), m.default]));

/** Rutas de clave de un objeto; los arrays anotan su longitud y las funciones su aridad. */
function rutas(valor: unknown, prefijo = ''): string[] {
  if (Array.isArray(valor)) {
    return [`${prefijo}[] (${valor.length})`].concat(valor.flatMap((v, i) => rutas(v, `${prefijo}[${i}]`)));
  }
  if (typeof valor === 'function') return [`${prefijo}() /${valor.length}`];
  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor as Record<string, unknown>).flatMap(([k, v]) => rutas(v, prefijo ? `${prefijo}.${k}` : k));
  }
  return [prefijo];
}

function hojas(valor: unknown, prefijo = ''): Array<[string, unknown]> {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => hojas(v, `${prefijo}[${i}]`));
  if (valor !== null && typeof valor === 'object' && typeof valor !== 'function') {
    return Object.entries(valor as Record<string, unknown>).flatMap(([k, v]) => hojas(v, prefijo ? `${prefijo}.${k}` : k));
  }
  return [[prefijo, valor]];
}

describe('locales: los dos idiomas tienen los mismos archivos', () => {
  it('cada archivo de es tiene su par en en, y al revés', () => {
    const soloEs = Object.keys(esFiles).filter((f) => !(f in enFiles)).sort();
    const soloEn = Object.keys(enFiles).filter((f) => !(f in esFiles)).sort();
    expect({ soloEs, soloEn }).toEqual({ soloEs: [], soloEn: [] });
  });
});

// Listas que pueden tener distinto largo en cada idioma a propósito (las
// palabras clave de SEO no se traducen una a una).
const LARGO_LIBRE: Record<string, string[]> = {
  'common.ts': ['metadata.keywords'],
};

function sinListasLibres(file: string, lista: string[]): string[] {
  const libres = LARGO_LIBRE[file] ?? [];
  return lista.filter((r) => !libres.some((l) => r === l || r.startsWith(`${l}[`)));
}

describe.each(Object.keys(esFiles).filter((f) => f in enFiles).sort())('locales/%s', (file) => {
  const es = esFiles[file];
  const en = enFiles[file];

  it('misma estructura en ambos idiomas', () => {
    const rutasEs = sinListasLibres(file, rutas(es)).sort();
    const rutasEn = sinListasLibres(file, rutas(en)).sort();
    expect({
      soloEs: rutasEs.filter((r) => !rutasEn.includes(r)),
      soloEn: rutasEn.filter((r) => !rutasEs.includes(r)),
    }).toEqual({ soloEs: [], soloEn: [] });
  });

  it('ningún texto está vacío en un idioma y lleno en el otro', () => {
    const mapaEn = new Map(hojas(en));
    const desalineados = hojas(es)
      .filter(([ruta, v]) => typeof v === 'string' && typeof mapaEn.get(ruta) === 'string')
      .filter(([ruta, v]) => ((v as string).trim() === '') !== ((mapaEn.get(ruta) as string).trim() === ''))
      .map(([ruta]) => ruta);
    expect(desalineados).toEqual([]);
  });

  // Un texto copiado del español y sin traducir es el error más común.
  it('el inglés no tiene signos de apertura del español', () => {
    const sospechosos = hojas(en)
      .filter(([, v]) => typeof v === 'string' && /[¿¡]/.test(v as string))
      .map(([ruta, v]) => `${ruta}: ${v}`);
    expect(sospechosos).toEqual([]);
  });
});
