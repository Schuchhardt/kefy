import { describe, it, expect } from 'vitest';
import es from '@/locales/es/landing';
import en from '@/locales/en/landing';
import esAssistant from '@/locales/es/dashboard/assistant';
import enAssistant from '@/locales/en/dashboard/assistant';
import esSettings from '@/locales/es/dashboard/settings';
import enSettings from '@/locales/en/dashboard/settings';
import { ASSISTANT_TOOL_NAMES, summarizeTool } from '@/lib/assistant/summaries';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { allToolNames } from '@/lib/assistant/registry';

// La copy de la landing vive duplicada en dos idiomas. Cuando alguien añade un
// plan, una fila de la tabla comparativa o una pregunta del FAQ en un idioma y
// se olvida del otro, la página se rompe en silencio: React pinta menos celdas
// que cabeceras, o una sección aparece vacía solo en inglés.
//
// Estos tests comparan la forma de ambos objetos, no su texto.

type Ruta = string;

/** Aplana un objeto a rutas de clave, anotando los arrays con su longitud. */
function rutas(valor: unknown, prefijo = ''): Ruta[] {
  if (Array.isArray(valor)) {
    const propias: Ruta[] = [`${prefijo}[] (${valor.length})`];
    return propias.concat(
      valor.flatMap((v, i) => rutas(v, `${prefijo}[${i}]`)),
    );
  }

  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor as Record<string, unknown>).flatMap(([k, v]) =>
      rutas(v, prefijo ? `${prefijo}.${k}` : k),
    );
  }

  return [prefijo];
}

/** Lee el valor de una ruta generada por `rutas()`. */
function leer(objeto: unknown, ruta: string): unknown {
  return ruta
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], objeto);
}

describe('paridad es / en de la landing', () => {
  it('ambos idiomas tienen exactamente la misma estructura', () => {
    const rutasEs = rutas(es).sort();
    const rutasEn = rutas(en).sort();

    const soloEs = rutasEs.filter((r) => !rutasEn.includes(r));
    const soloEn = rutasEn.filter((r) => !rutasEs.includes(r));

    // Se informan las dos direcciones a la vez: si solo se afirma una, la
    // segunda nunca llega a evaluarse y el diagnóstico sale a medias.
    expect({ soloEs, soloEn }).toEqual({ soloEs: [], soloEn: [] });
  });

  it('las secciones de primer nivel coinciden', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  // Los planes se pintan como columnas y la tabla comparativa como filas de
  // valores: si no coinciden, las celdas se desalinean de las cabeceras.
  it('la tabla comparativa tiene un valor por plan, en ambos idiomas', () => {
    for (const [idioma, copy] of [['es', es], ['en', en]] as const) {
      const planes = copy.pricing.plans.length;
      for (const fila of copy.pricing.cmpRows) {
        expect(
          fila.values.length,
          `[${idioma}] la fila "${fila.feature}" tiene ${fila.values.length} valores para ${planes} planes`,
        ).toBe(planes);
      }
    }
  });

  it('ambos idiomas anuncian los mismos planes, en el mismo orden', () => {
    expect(en.pricing.plans.map((p) => p.name)).toEqual(es.pricing.plans.map((p) => p.name));
  });

  it('ambos idiomas anuncian los mismos precios', () => {
    expect(en.pricing.plans.map((p) => p.price)).toEqual(es.pricing.plans.map((p) => p.price));
    expect(en.pricing.plans.map((p) => p.annualPrice)).toEqual(
      es.pricing.plans.map((p) => p.annualPrice),
    );
  });

  // Un campo vacío en los dos idiomas suele ser intencional: el diseño no usa
  // ese hueco (los `.d` de `problem.pains`, por ejemplo). Lo que sí delata un
  // olvido es que tenga texto en un idioma y esté vacío en el otro.
  it('ningún campo tiene texto en un idioma y está vacío en el otro', () => {
    const desalineados: string[] = [];

    for (const ruta of rutas(es)) {
      if (ruta.includes('[] (')) continue;
      const valorEs = leer(es, ruta);
      const valorEn = leer(en, ruta);
      if (typeof valorEs !== 'string' || typeof valorEn !== 'string') continue;

      const vacioEs = valorEs.trim() === '';
      const vacioEn = valorEn.trim() === '';
      if (vacioEs !== vacioEn) {
        desalineados.push(`${ruta} (es:${vacioEs ? 'vacío' : 'con texto'}, en:${vacioEn ? 'vacío' : 'con texto'})`);
      }
    }

    expect(desalineados, desalineados.join(', ')).toEqual([]);
  });

  // La copy no puede prometer formatos que el producto no genera. Los tipos
  // reales son los del CHECK de kefy_content_items.
  it('no se anuncian formatos de contenido que no existen', () => {
    const inexistentes = [
      'thread', 'ad copy', 'banner', 'miniatura', 'thumbnail',
      'descripción producto', 'product description',
    ];

    for (const [idioma, copy] of [['es', es], ['en', en]] as const) {
      const outputs = copy.mult.outputs.map((o) => `${o.k} ${o.sub}`.toLowerCase());
      for (const termino of inexistentes) {
        const encontrado = outputs.filter((o) => o.includes(termino));
        expect(encontrado, `[${idioma}] se anuncia "${termino}", que el producto no genera`).toEqual([]);
      }
    }
  });
});

// ─── Dashboard: asistente y ajustes ──────────────────────────────────────────

/** Rutas que están en un idioma y no en el otro, en las dos direcciones. */
function diferencias(a: unknown, b: unknown) {
  const rutasA = rutas(a).sort();
  const rutasB = rutas(b).sort();
  return {
    soloEs: rutasA.filter((r) => !rutasB.includes(r)),
    soloEn: rutasB.filter((r) => !rutasA.includes(r)),
  };
}

describe('paridad es / en del asistente', () => {
  it('ambos idiomas tienen exactamente la misma estructura', () => {
    expect(diferencias(esAssistant, enAssistant)).toEqual({ soloEs: [], soloEn: [] });
  });

  // El `satisfies` de los locales obliga a tener una entrada por nombre de
  // ASSISTANT_TOOL_NAMES; esto comprueba que esa lista sea la del registro real.
  // Si se añade una herramienta al registro y no a la lista, el widget mostraría
  // su nombre técnico y la tarjeta de confirmación no tendría resumen.
  it('ASSISTANT_TOOL_NAMES coincide con las herramientas registradas', () => {
    ensureToolsRegistered();
    expect([...ASSISTANT_TOOL_NAMES].sort()).toEqual(allToolNames());
  });

  it('cada herramienta tiene etiqueta y resumen en ambos idiomas', () => {
    for (const [idioma, copy] of [['es', esAssistant], ['en', enAssistant]] as const) {
      const etiquetas = copy.toolLabels as Record<string, string>;
      const resumenes = copy.toolSummaries as Record<string, unknown>;
      for (const nombre of ASSISTANT_TOOL_NAMES) {
        expect(etiquetas[nombre]?.trim(), `[${idioma}] falta la etiqueta de ${nombre}`).toBeTruthy();
        expect(typeof resumenes[nombre], `[${idioma}] falta el resumen de ${nombre}`).toBe('function');
      }
    }
  });

  // El servidor llama a los resúmenes con la entrada del modelo y la vista
  // previa de la herramienta, que pueden venir incompletas. Un resumen que
  // revienta cae al título genérico y la persona confirma sin saber qué.
  it('los resúmenes devuelven texto aunque la entrada y la vista previa vengan vacías', () => {
    for (const [idioma, copy] of [['es', esAssistant], ['en', enAssistant]] as const) {
      const resumenes = copy.toolSummaries as Record<string, (i: unknown, p: unknown) => string>;
      for (const nombre of ASSISTANT_TOOL_NAMES) {
        let texto: unknown;
        expect(() => { texto = resumenes[nombre]({}, {}); }, `[${idioma}] ${nombre}`).not.toThrow();
        expect(typeof texto === 'string' && texto.trim().length > 0, `[${idioma}] ${nombre} devolvió «${String(texto)}»`).toBe(true);
      }
    }
  });

  it('los resúmenes no dejan pasar las etiquetas <untrusted_content>', () => {
    const recipient = '<untrusted_content source="comment">Juan</untrusted_content>';
    for (const idioma of ['es', 'en'] as const) {
      const texto = summarizeTool('reply_to_comment', idioma, {}, { account: '@kefy', recipient });
      expect(texto).toContain('Juan');
      expect(texto).not.toContain('untrusted_content');
    }
  });

  it('ningún texto del asistente está vacío en un idioma y lleno en el otro', () => {
    const desalineados: string[] = [];
    for (const ruta of rutas(esAssistant)) {
      if (ruta.includes('[] (')) continue;
      const valorEs = leer(esAssistant, ruta);
      const valorEn = leer(enAssistant, ruta);
      if (typeof valorEs !== 'string' || typeof valorEn !== 'string') continue;
      if ((valorEs.trim() === '') !== (valorEn.trim() === '')) desalineados.push(ruta);
    }
    expect(desalineados, desalineados.join(', ')).toEqual([]);
  });
});

describe('paridad es / en de los ajustes', () => {
  it('ambos idiomas tienen exactamente la misma estructura', () => {
    expect(diferencias(esSettings, enSettings)).toEqual({ soloEs: [], soloEn: [] });
  });

  it('la sección de API keys tiene las mismas claves en ambos idiomas', () => {
    expect(diferencias(esSettings.apiKeys, enSettings.apiKeys)).toEqual({ soloEs: [], soloEn: [] });
  });
});
