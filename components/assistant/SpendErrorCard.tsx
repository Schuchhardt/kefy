'use client';

// ─── Tarjetas de bloqueo de la guardia (402 / 429 / 503) ─────────────────────
//
// Se decide por las banderas del cuerpo, nunca solo por el status: un 429
// puede ser la cuota de mensajes del asistente, los créditos de IA del mes o
// el rate limiting, y cada uno pide algo distinto al usuario.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import esT from '@/locales/es/dashboard/assistant';
import enT from '@/locales/en/dashboard/assistant';

const T = { es: esT, en: enT } as const;

/** Segundos que faltan, bajando de a uno hasta 0. */
function useCountdown(seconds: number | null): number {
  const [left, setLeft] = useState(seconds !== null ? Math.max(0, Math.ceil(seconds)) : 0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return left;
}

export default function SpendErrorCard({
  lang,
  status,
  body,
  onRetry,
  disabled,
  onNavigate,
}: {
  lang: 'es' | 'en';
  status: number;
  body: Record<string, unknown>;
  onRetry?: () => void;
  disabled?: boolean;
  onNavigate?: () => void;
}) {
  const t = T[lang];
  const retryAfter = typeof body.retryAfter === 'number' ? body.retryAfter : null;
  const left = useCountdown(retryAfter);
  const limit = typeof body.limit === 'number' ? body.limit : 0;

  let message: string;
  let showPlans = false;
  let retry = false;

  if (body.subscriptionRequired === true) {
    message = t.errors.subscription;
    showPlans = true;
  } else if (body.assistantQuotaExhausted === true) {
    message = t.errors.assistantQuota(limit);
    showPlans = true;
  } else if (body.creditsExhausted === true) {
    message = t.errors.credits(limit);
    showPlans = true;
  } else if (retryAfter !== null) {
    message = t.errors.rateLimit(left);
    retry = true;
  } else if (status === 503) {
    message = t.errors.unavailable;
    retry = true;
  } else if (status === 409) {
    message = t.errors.expired;
  } else {
    message = typeof body.error === 'string' && body.error.length < 300 ? body.error : t.errors.generic;
    retry = status >= 500;
  }

  return (
    <div
      role="alert"
      style={{
        border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 12,
        padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text)', lineHeight: 1.45,
      }}
    >
      <span>{message}</span>
      {(showPlans || (retry && onRetry)) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {showPlans && (
            <Link href={`/${lang}/dashboard/settings`} className="btn btn-primary btn-sm" onClick={() => onNavigate?.()}>
              {t.viewPlans}
            </Link>
          )}
          {retry && onRetry && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || left > 0} onClick={onRetry}>
              {t.retry}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
