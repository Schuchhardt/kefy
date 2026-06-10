import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { randomBytes } from 'crypto';
import { createSupabaseServer } from '@/lib/supabase';
import { hashToken } from '@/lib/auth';
import PasswordReset from '@/emails/PasswordReset';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Kefy <no-reply@email.kefy.app>';
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3097';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, lang } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const sanitizedEmail = email.trim().toLowerCase();
  const emailLang: 'es' | 'en' = typeof lang === 'string' && lang.startsWith('en') ? 'en' : 'es';

  const db = createSupabaseServer();

  // Lookup user — always respond 200 to prevent email enumeration
  const { data: user } = await db
    .from('kefy_users')
    .select('id, name, email')
    .eq('email', sanitizedEmail)
    .maybeSingle();

  if (user) {
    const raw = randomBytes(48).toString('hex');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    // Delete any existing tokens for this user
    await db
      .from('kefy_password_reset_tokens')
      .delete()
      .eq('user_id', user.id);

    // Insert new token
    const { error: insertError } = await db
      .from('kefy_password_reset_tokens')
      .insert({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt.toISOString() });

    if (!insertError && resendApiKey) {
      try {
        const resetUrl = `${appUrl}/${emailLang}/reset-password?token=${raw}`;
        const resend = new Resend(resendApiKey);
        const html = await render(
          PasswordReset({ name: user.name, email: user.email, resetUrl, lang: emailLang })
        );

        const subject = emailLang === 'en'
          ? 'Reset your Kefy password'
          : 'Restablecer contraseña de Kefy';

        await resend.emails.send({ from: fromEmail, to: user.email, subject, html });
      } catch (emailError) {
        console.error('Password reset email error:', emailError);
      }
    }
  }

  // Always return the same response to prevent email enumeration
  return NextResponse.json({ ok: true });
}
