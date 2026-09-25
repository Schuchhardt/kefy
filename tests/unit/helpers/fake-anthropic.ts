// ─── Anthropic simulado para el chat del asistente ───────────────────────────
//
// lib/assistant/agent.ts llama a `getAnthropic().messages.stream(params,
// { signal })`, escucha `.on('text')` y espera `finalMessage()`. Este fake
// reproduce esa forma con respuestas guionizadas, en orden:
//
//   anthropic.script(textReply('Hola'), toolUseReply('test_publish', {...}));
//
// Cada llamada queda en `anthropic.calls` (los params completos) para afirmar
// sobre el historial, las herramientas o el system prompt que recibió el
// modelo. Sin guion, la llamada falla: un test que no esperaba llamar al
// modelo lo detecta.

type Block = { type: string; [k: string]: unknown };

export interface ScriptedReply {
  content: Block[];
  stop_reason: string;
  /** Lanza en vez de responder (error del proveedor). */
  error?: Error;
}

let toolSeq = 0;

export function textReply(text: string, stop_reason = 'end_turn'): ScriptedReply {
  return { content: [{ type: 'text', text }], stop_reason };
}

export function toolUseReply(
  name: string,
  input: Record<string, unknown>,
  { text, id }: { text?: string; id?: string } = {},
): ScriptedReply {
  const content: Block[] = [{ type: 'thinking', thinking: '', signature: 'sig-opaque' }];
  if (text) content.push({ type: 'text', text });
  content.push({ type: 'tool_use', id: id ?? `toolu_${++toolSeq}`, name, input });
  return { content, stop_reason: 'tool_use' };
}

export function multiToolUseReply(uses: Array<{ name: string; input: Record<string, unknown>; id?: string }>): ScriptedReply {
  return {
    content: uses.map((u) => ({ type: 'tool_use', id: u.id ?? `toolu_${++toolSeq}`, name: u.name, input: u.input })),
    stop_reason: 'tool_use',
  };
}

export function failingReply(message = 'overloaded'): ScriptedReply {
  return { content: [], stop_reason: 'error', error: new Error(message) };
}

export function createFakeAnthropic() {
  const queue: ScriptedReply[] = [];
  const calls: Array<Record<string, unknown>> = [];

  const client = {
    messages: {
      stream(params: Record<string, unknown>) {
        // Copia profunda: el agente sigue mutando sus arrays después.
        calls.push(JSON.parse(JSON.stringify(params)));
        const reply = queue.shift();
        const listeners: Array<(t: string) => void> = [];
        return {
          on(event: string, cb: (t: string) => void) {
            if (event === 'text') listeners.push(cb);
            return this;
          },
          async finalMessage() {
            if (!reply) throw new Error('fake-anthropic: llamada al modelo sin respuesta guionizada');
            if (reply.error) throw reply.error;
            for (const b of reply.content) if (b.type === 'text') for (const l of listeners) l(String(b.text));
            return {
              id: `msg_${calls.length}`,
              type: 'message',
              role: 'assistant',
              model: String(params.model),
              content: reply.content,
              stop_reason: reply.stop_reason,
              stop_sequence: null,
              usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 },
            };
          },
        };
      },
    },
  };

  return {
    client,
    calls,
    script(...replies: ScriptedReply[]) { queue.push(...replies); },
    pending: () => queue.length,
    reset() { queue.length = 0; calls.length = 0; },
  };
}

// ─── Lectura del stream SSE ──────────────────────────────────────────────────

export type SseFrame = { type: string; [k: string]: unknown };

/** Lee la Response SSE entera y devuelve los eventos en orden. */
export async function readSse(res: Response): Promise<SseFrame[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((frame) => frame.split('\n').find((l) => l.startsWith('data: ')))
    .filter((l): l is string => !!l)
    .map((l) => JSON.parse(l.slice(6)) as SseFrame);
}
