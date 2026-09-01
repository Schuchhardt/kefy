// ─── Rate limiting ────────────────────────────────────────────────────────────
//
// El conteo vive en Postgres (`kefy_rate_limit_hit`), no en memoria del proceso.
// En Vercel cada request puede caer en una instancia distinta, así que un
// contador en memoria no limitaría nada: bastaría con abrir conexiones en
// paralelo para saltárselo.
//
// Las ventanas son fijas, no deslizantes: se trunca `now` al múltiplo de
// `windowSeconds` y esa marca identifica la fila. Es menos preciso que una
// ventana deslizante en los bordes, pero cuesta una sola escritura atómica.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export interface RateLimitRule {
  /** Identifica al sujeto limitado. Ej: 'login:ip:1.2.3.4'. */
  bucket: string;
  /** Peticiones permitidas por ventana. */
  limit: number;
  /** Duración de la ventana en segundos. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Segundos hasta que se abra la próxima ventana. */
  retryAfter: number;
}

/** Inicio de la ventana que contiene `now`, truncado a `windowSeconds`. */
export function windowStart(now: number, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now / ms) * ms);
}

/**
 * Registra un intento y decide si se permite.
 *
 * Si la base de datos falla, **deja pasar la petición** y reporta el fallo a
 * Sentry. Un rate limiter caído no puede dejar a todo el mundo fuera del login:
 * el riesgo de una caída total del servicio supera al de un rato sin límite.
 */
export async function checkRateLimit(rule: RateLimitRule, now = Date.now()): Promise<RateLimitResult> {
  const start = windowStart(now, rule.windowSeconds);
  const retryAfter = Math.max(1, Math.ceil((start.getTime() + rule.windowSeconds * 1000 - now) / 1000));

  try {
    const db = createSupabaseServer();
    const { data, error } = await db.rpc('kefy_rate_limit_hit', {
      p_bucket: rule.bucket,
      p_window_start: start.toISOString(),
    });

    if (error) throw new Error(error.message);

    const count = typeof data === 'number' ? data : Number(data);
    if (!Number.isFinite(count)) throw new Error(`Conteo inválido: ${String(data)}`);

    return {
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfter,
    };
  } catch (err) {
    reportError(err, {
      route: 'lib/rate-limit',
      service: 'supabase',
      extra: { bucket: rule.bucket },
    });

    // Fail-open deliberado (ver comentario del bloque de arriba).
    return { allowed: true, limit: rule.limit, remaining: rule.limit, retryAfter };
  }
}

/**
 * Borra las ventanas de rate limit ya caducadas.
 *
 * La tabla acumula una fila por (bucket, ventana) y nada la vacía sola: sin
 * esta limpieza crece indefinidamente. La llama el cron de autopilot, que ya
 * corre cada 5 minutos.
 *
 * `olderThanSeconds` por defecto es un día: muy por encima de la ventana más
 * larga (1 h), así que nunca borra una ventana todavía en uso.
 *
 * No lanza: es mantenimiento, no puede tumbar la ejecución que la invoca.
 */
export async function collectExpiredWindows(
  olderThanSeconds = 24 * 60 * 60,
  now = Date.now(),
): Promise<number> {
  try {
    const db = createSupabaseServer();
    const cutoff = new Date(now - olderThanSeconds * 1000).toISOString();

    const { data, error } = await db.rpc('kefy_rate_limit_gc', { p_older_than: cutoff });
    if (error) throw new Error(error.message);

    return typeof data === 'number' ? data : 0;
  } catch (err) {
    reportError(err, { route: 'lib/rate-limit', service: 'supabase', extra: { operacion: 'gc' } });
    return 0;
  }
}

/**
 * IP del cliente. En Vercel llega en `x-forwarded-for`, donde el primer valor
 * es la IP real y los siguientes son los proxies intermedios.
 *
 * Solo se confía en la cabecera porque Vercel la reescribe en el borde; en un
 * despliegue sin ese proxy delante, un atacante podría falsificarla.
 */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'desconocida';
}

/** Respuesta 429 estándar, con las cabeceras que esperan los clientes HTTP. */
export function rateLimitResponse(result: RateLimitResult, message: string): NextResponse {
  return NextResponse.json(
    { error: message, retryAfter: result.retryAfter },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

// ─── Reglas de la aplicación ──────────────────────────────────────────────────
// Los topes están calibrados para no molestar a un usuario real y sí frenar
// a un script: nadie escribe su contraseña diez veces en cinco minutos.

export const RATE_LIMITS = {
  /** Login por IP: frena la fuerza bruta contra contraseñas. */
  login:          { limit: 10, windowSeconds: 300 },
  /** Registro por IP: frena la creación masiva de cuentas en la beta abierta. */
  register:       { limit: 5,  windowSeconds: 3600 },
  /** Recuperación de contraseña: frena el envío masivo de correos. */
  forgotPassword: { limit: 5,  windowSeconds: 3600 },
  /** Reseteo de contraseña: frena el sondeo de tokens de recuperación. */
  resetPassword:  { limit: 10, windowSeconds: 3600 },
  /** Generación con IA por organización: acota picos de gasto. */
  aiGeneration:   { limit: 20, windowSeconds: 60 },
  /** Publicación en redes por organización. */
  publish:        { limit: 30, windowSeconds: 60 },
} as const;

/** Regla de login para una IP. */
export function loginRule(ip: string): RateLimitRule {
  return { bucket: `login:ip:${ip}`, ...RATE_LIMITS.login };
}

export function registerRule(ip: string): RateLimitRule {
  return { bucket: `register:ip:${ip}`, ...RATE_LIMITS.register };
}

export function forgotPasswordRule(ip: string): RateLimitRule {
  return { bucket: `forgot:ip:${ip}`, ...RATE_LIMITS.forgotPassword };
}

export function resetPasswordRule(ip: string): RateLimitRule {
  return { bucket: `reset:ip:${ip}`, ...RATE_LIMITS.resetPassword };
}

/** Regla de generación con IA para una organización. */
export function aiRule(orgId: string): RateLimitRule {
  return { bucket: `ai:org:${orgId}`, ...RATE_LIMITS.aiGeneration };
}

export function publishRule(orgId: string): RateLimitRule {
  return { bucket: `publish:org:${orgId}`, ...RATE_LIMITS.publish };
}
