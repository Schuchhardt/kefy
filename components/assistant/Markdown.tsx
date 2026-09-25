'use client';

// ─── Markdown seguro para las respuestas del asistente ──────────────────────
//
// Renderer propio y mínimo (sin dependencias): párrafos, encabezados, listas,
// citas, bloques de código, tablas simples, negrita, cursiva, código en línea
// y enlaces. Todo se construye como elementos React a partir de texto: nunca
// dangerouslySetInnerHTML, así que el HTML que escriba el modelo (o que se
// cuele desde un DM) sale como texto.
//
// Enlaces:
// - Relativos (`/…`, no `//…`): next/link, navegación interna.
// - http(s): se abren en otra pestaña y muestran el dominio al lado, para que
//   se vea a dónde llevan antes de hacer clic.
// - Cualquier otro esquema (javascript:, data:, mailto:…): texto plano.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { stripUntrustedTags } from '@/lib/assistant/summaries';

interface Props {
  text: string;
  externalLabel?: (host: string) => string;
  onInternalNavigate?: () => void;
}

type Ctx = Required<Pick<Props, 'externalLabel'>> & Pick<Props, 'onInternalNavigate'>;

// ─── Enlaces ─────────────────────────────────────────────────────────────────

function SafeLink({ href, children, ctx }: { href: string; children: ReactNode; ctx: Ctx }) {
  const h = href.trim();

  if (h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/\\')) {
    return (
      <Link href={h} onClick={() => ctx.onInternalNavigate?.()} style={{ color: 'var(--assistant-accent-text)', textDecoration: 'underline' }}>
        {children}
      </Link>
    );
  }

  let url: URL | null = null;
  try { url = new URL(h); } catch { url = null; }
  if (url && (url.protocol === 'https:' || url.protocol === 'http:')) {
    const host = url.hostname.replace(/^www\./, '');
    return (
      <>
        <a
          href={url.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={ctx.externalLabel(host)}
          style={{ color: 'var(--assistant-accent-text)', textDecoration: 'underline', wordBreak: 'break-word' }}
        >
          {children}
        </a>
        <span style={{ color: 'var(--muted)', fontSize: '0.85em', marginLeft: 4 }}>({host})</span>
      </>
    );
  }

  return <span>{children}</span>;
}

// ─── Inline ──────────────────────────────────────────────────────────────────

const INLINE = new RegExp(
  [
    '(`[^`\\n]+`)',                               // 1 código
    '(\\*\\*[^*\\n]+?\\*\\*)',                     // 2 negrita **
    '(__[^_\\n]+?__)',                            // 3 negrita __
    '(\\[[^\\]\\n]+\\]\\([^)\\s]+\\))',            // 4 enlace [texto](url)
    '(https?:\\/\\/[^\\s<>()\\[\\]]*[^\\s<>()\\[\\].,;:!?\'"])', // 5 URL suelta
    '(\\*[^*\\s][^*\\n]*?\\*)',                    // 6 cursiva *
  ].join('|'),
  'g',
);

function renderInline(text: string, ctx: Ctx, keyPrefix: string, depth = 0): ReactNode[] {
  if (depth > 4) return [text];
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  const re = new RegExp(INLINE.source, 'g');
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    const [tok] = m;

    if (m[1]) {
      out.push(
        <code key={key} style={{
          fontFamily: 'var(--font-jetbrains), monospace', fontSize: '0.88em',
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px',
        }}>
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2] || m[3]) {
      out.push(<strong key={key}>{renderInline(tok.slice(2, -2), ctx, key, depth + 1)}</strong>);
    } else if (m[4]) {
      const close = tok.indexOf('](');
      const label = tok.slice(1, close);
      const href = tok.slice(close + 2, -1);
      out.push(<SafeLink key={key} href={href} ctx={ctx}>{renderInline(label, ctx, key, depth + 1)}</SafeLink>);
    } else if (m[5]) {
      out.push(<SafeLink key={key} href={tok} ctx={ctx}>{tok}</SafeLink>);
    } else if (m[6]) {
      out.push(<em key={key}>{renderInline(tok.slice(1, -1), ctx, key, depth + 1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Líneas de un párrafo con saltos de línea respetados. */
function renderLines(lines: string[], ctx: Ctx, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) out.push(<br key={`${key}-br${idx}`} />);
    out.push(...renderInline(line, ctx, `${key}-l${idx}`));
  });
  return out;
}

// ─── Bloques ─────────────────────────────────────────────────────────────────

const RE_FENCE = /^\s*```/;
const RE_HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const RE_UL = /^\s*[-*+•]\s+(.*)$/;
const RE_OL = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const RE_QUOTE = /^\s*>\s?(.*)$/;
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const RE_TABLE_ROW = /^\s*\|.*\|\s*$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

const blockGap = { margin: '0 0 8px' } as const;

export default function Markdown({ text, externalLabel, onInternalNavigate }: Props) {
  const ctx: Ctx = { externalLabel: externalLabel ?? ((h) => h), onInternalNavigate };
  const lines = stripUntrustedTags(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;

    if (!line.trim()) { i++; continue; }

    if (RE_FENCE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !RE_FENCE.test(lines[i])) code.push(lines[i++]);
      i++; // cierre (o fin del texto mientras llega el stream)
      blocks.push(
        <pre key={key} style={{
          ...blockGap, padding: '10px 12px', borderRadius: 8, overflowX: 'auto',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          fontFamily: 'var(--font-jetbrains), monospace', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre',
        }}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(RE_HEADING);
    if (heading) {
      blocks.push(<p key={key} style={{ ...blockGap, fontWeight: 700 }}>{renderInline(heading[1], ctx, key)}</p>);
      i++;
      continue;
    }

    if (RE_HR.test(line)) {
      blocks.push(<hr key={key} style={{ border: 0, borderTop: '1px solid var(--border)', margin: '10px 0' }} />);
      i++;
      continue;
    }

    if (RE_TABLE_ROW.test(line) && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && RE_TABLE_ROW.test(lines[i])) rows.push(splitRow(lines[i++]));
      const cell = { padding: '4px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left' as const, verticalAlign: 'top' as const };
      blocks.push(
        <div key={key} style={{ ...blockGap, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: '100%' }}>
            <thead>
              <tr>{head.map((h, c) => <th key={c} style={{ ...cell, fontWeight: 700 }}>{renderInline(h, ctx, `${key}-h${c}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{head.map((_, c) => <td key={c} style={cell}>{renderInline(r[c] ?? '', ctx, `${key}-${ri}-${c}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (RE_UL.test(line) || RE_OL.test(line)) {
      const ordered = !RE_UL.test(line);
      const items: string[][] = [];
      const start = ordered ? Number(line.match(RE_OL)?.[1] ?? 1) : 1;
      while (i < lines.length) {
        const cur = lines[i];
        const mm = ordered ? cur.match(RE_OL) : cur.match(RE_UL);
        if (mm) {
          items.push([ordered ? mm[2] : mm[1]]);
          i++;
        } else if (cur.trim() && /^\s{2,}\S/.test(cur) && items.length > 0) {
          // Continuación indentada del ítem anterior (o sublista, que se aplana).
          const sub = cur.match(RE_UL) ?? cur.match(RE_OL);
          items[items.length - 1].push(sub ? `• ${sub[sub.length - 1]}` : cur.trim());
          i++;
        } else {
          break;
        }
      }
      const listStyle = { ...blockGap, paddingLeft: 20, display: 'flex', flexDirection: 'column' as const, gap: 3 };
      const children = items.map((it, n) => <li key={n}>{renderLines(it, ctx, `${key}-${n}`)}</li>);
      blocks.push(ordered
        ? <ol key={key} start={start} style={{ ...listStyle, listStyleType: 'decimal' }}>{children}</ol>
        : <ul key={key} style={{ ...listStyle, listStyleType: 'disc' }}>{children}</ul>);
      continue;
    }

    if (RE_QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) quoted.push(lines[i++].match(RE_QUOTE)?.[1] ?? '');
      blocks.push(
        <blockquote key={key} style={{ ...blockGap, borderLeft: '3px solid var(--border)', paddingLeft: 10, color: 'var(--muted)' }}>
          {renderLines(quoted, ctx, key)}
        </blockquote>,
      );
      continue;
    }

    // Párrafo: hasta una línea vacía o el comienzo de otro bloque.
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim()
      && !RE_FENCE.test(lines[i]) && !RE_HEADING.test(lines[i]) && !RE_UL.test(lines[i])
      && !RE_OL.test(lines[i]) && !RE_QUOTE.test(lines[i]) && !RE_HR.test(lines[i])
      && !(RE_TABLE_ROW.test(lines[i]) && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1]))
    ) {
      para.push(lines[i++]);
    }
    blocks.push(<p key={key} style={blockGap}>{renderLines(para, ctx, key)}</p>);
  }

  return <div className="assistant-md" style={{ wordBreak: 'break-word' }}>{blocks}</div>;
}
