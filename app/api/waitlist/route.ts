import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import WaitlistConfirmation from '@/emails/WaitlistConfirmation';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Kefy <no-reply@emai.kefy.app>';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseServiceKey || !resendApiKey) {
    console.error('Missing environment variables for waitlist API');
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, name, interest } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const sanitizedEmail = email.trim().toLowerCase();
  const sanitizedName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : null;
  const sanitizedInterest = typeof interest === 'string' && interest.trim() ? interest.trim().slice(0, 50) : null;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error: dbError } = await supabase
    .from('kefy_waitlist')
    .insert({ email: sanitizedEmail, name: sanitizedName, interest: sanitizedInterest });

  if (dbError) {
    if (dbError.code === '23505') {
      // Unique constraint — email already registered
      return NextResponse.json({ error: 'duplicate' }, { status: 409 });
    }
    console.error('Supabase insert error:', dbError.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // Send confirmation email
  try {
    const resend = new Resend(resendApiKey);
    const html = await render(
      WaitlistConfirmation({ name: sanitizedName, email: sanitizedEmail })
    );

    await resend.emails.send({
      from: fromEmail,
      to: sanitizedEmail,
      subject: '¡Ya estás en la lista de Kefy! 🎉',
      html,
    });
  } catch (emailError) {
    // Don't fail the registration if email sending fails
    console.error('Resend email error:', emailError);
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
