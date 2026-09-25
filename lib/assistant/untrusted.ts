// ─── Contenido no confiable ───────────────────────────────────────────────────
//
// Los DMs, los comentarios, el contenido que entra por la API y los campos del
// brand kit que rellenó un scraper los escribe un tercero. Antes de pasárselos
// al modelo se envuelven en <untrusted_content> para que el prompt del sistema
// pueda decirle que son datos, no instrucciones. Se neutraliza cualquier
// etiqueta de cierre dentro del valor para que no pueda «salirse» del bloque.

export type UntrustedSource = 'dm' | 'comment' | 'content' | 'brand_data' | 'strategy';

export function wrapUntrusted(
  source: UntrustedSource,
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const safe = value.replace(/<\/?untrusted_content/gi, (m) => m.replace('<', '&lt;'));
  return `<untrusted_content source="${source}">${safe}</untrusted_content>`;
}

/** Recorta el resultado de una herramienta antes de devolvérselo al modelo. */
export function truncateToolResult(s: string, max = 8000): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}

/**
 * Deja un valor JSON por debajo de `maxBytes` (serializado en UTF-8). Si no
 * cabe, devuelve `{ truncated: true, preview }` con el principio del JSON.
 * Se usa para no guardar resultados enormes en kefy_assistant_actions.
 *
 * Un `tainted: true` de primer nivel se conserva siempre: es lo que, al
 * reanudar un mensaje en pausa, marca la conversación como contaminada
 * (buildToolResultsForMessage). Si se perdiera al recortar, un resultado
 * grande con DMs entraría al historial sin forzar confirmaciones.
 */
export function truncateJson(v: unknown, maxBytes: number): unknown {
  const tainted = !!v && typeof v === 'object' && (v as { tainted?: unknown }).tainted === true;
  const keep = tainted ? { tainted: true as const } : {};
  let json: string;
  try {
    json = JSON.stringify(v) ?? 'null';
  } catch {
    return { truncated: true, ...keep, preview: '[unserializable]' };
  }
  if (Buffer.byteLength(json, 'utf8') <= maxBytes) return v;

  // Margen para el envoltorio { truncated, preview } y el escapado del preview.
  const budget = Math.max(0, Math.floor(maxBytes / 2) - 64);
  let preview = json.slice(0, budget);
  while (preview.length > 0 && Buffer.byteLength(preview, 'utf8') > budget) {
    preview = preview.slice(0, Math.floor(preview.length * 0.9));
  }
  return { truncated: true, ...keep, preview };
}
