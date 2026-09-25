'use client';

// ─── Un mensaje del chat ─────────────────────────────────────────────────────
//
// Usuario: burbuja a la derecha, texto plano. Asistente: a la izquierda, con
// sus partes en orden (texto en markdown, chips de herramientas, tarjetas de
// confirmación y de error).

import esT from '@/locales/es/dashboard/assistant';
import enT from '@/locales/en/dashboard/assistant';
import type { RetryTarget, UiMessage } from '@/lib/assistant/use-assistant';
import Markdown from '@/components/assistant/Markdown';
import ToolChip from '@/components/assistant/ToolChip';
import ConfirmationCard from '@/components/assistant/ConfirmationCard';
import SpendErrorCard from '@/components/assistant/SpendErrorCard';

const T = { es: esT, en: enT } as const;

export default function MessageBubble({
  lang,
  message,
  streaming,
  onConfirm,
  onReject,
  onRetry,
  onNavigate,
}: {
  lang: 'es' | 'en';
  message: UiMessage;
  /** Hay un stream en curso (deshabilita las acciones de las tarjetas). */
  streaming: boolean;
  onConfirm: (actionId: string) => void;
  onReject: (actionId: string) => void;
  /** Repite lo que falló (el mensaje o la decisión) de una tarjeta de bloqueo. */
  onRetry: (target: RetryTarget) => void;
  onNavigate?: () => void;
}) {
  const t = T[lang];

  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          aria-label={t.you}
          style={{
            maxWidth: '85%', padding: '8px 12px', borderRadius: '14px 14px 4px 14px',
            background: 'rgba(198,255,75,0.14)', border: '1px solid rgba(198,255,75,0.28)',
            color: 'var(--text)', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}
        >
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div aria-label={t.assistant} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%' }}>
      {message.parts.map((part, i) => {
        switch (part.kind) {
          case 'text':
            return part.text.trim() ? (
              <div key={i} style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)', maxWidth: '100%' }}>
                <Markdown text={part.text} externalLabel={t.externalLink} onInternalNavigate={onNavigate} />
              </div>
            ) : null;
          case 'tool':
            return (
              <ToolChip
                key={part.toolUseId}
                lang={lang}
                name={part.name}
                status={part.status}
                links={part.links}
                error={part.error}
                onNavigate={onNavigate}
              />
            );
          case 'confirm':
            return (
              <ConfirmationCard
                key={part.actionId}
                lang={lang}
                name={part.name}
                summary={part.summary}
                preview={part.preview}
                credits={part.credits}
                expiresAt={part.expiresAt}
                state={part.state}
                links={part.links}
                error={part.error}
                disabled={streaming}
                onConfirm={() => onConfirm(part.actionId)}
                onCancel={() => onReject(part.actionId)}
                onNavigate={onNavigate}
              />
            );
          case 'spend': {
            const target = part.retry;
            return (
              <SpendErrorCard
                key={i}
                lang={lang}
                status={part.status}
                body={part.body}
                onRetry={target ? () => onRetry(target) : undefined}
                disabled={streaming}
                onNavigate={onNavigate}
              />
            );
          }
          case 'error': {
            const text =
              part.code === 'network' ? t.errors.network
              : part.code === 'refusal' ? t.errors.refusal
              : part.code === 'step_limit' ? t.errors.stepLimit
              : part.message || t.errors.generic;
            return (
              <div
                key={i}
                role="alert"
                style={{
                  fontSize: 12.5, color: 'var(--muted)', padding: '8px 10px', borderRadius: 10,
                  border: '1px dashed var(--border)', lineHeight: 1.45,
                }}
              >
                {text}
              </div>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}
