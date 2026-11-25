// ─── Contacto comercial ──────────────────────────────────────────────────────
//
// «Hablar con ventas» y «Agendar una llamada» llevaban al registro, igual que
// el resto de botones. Ahora abren un contacto real: la URL de
// NEXT_PUBLIC_SALES_CONTACT_URL (p. ej. un Calendly) o, si no está definida,
// un correo a ventas@kefy.app con el asunto ya escrito.
//
// NEXT_PUBLIC_ porque se lee en el cliente (PricingSection es un componente
// de cliente); no es un secreto.

export const SALES_EMAIL = 'ventas@kefy.app';

export function salesContactHref(lang: string, plan?: string): string {
  const configured = process.env.NEXT_PUBLIC_SALES_CONTACT_URL?.trim();
  if (configured) return configured;
  const subject = lang === 'en'
    ? `Kefy${plan ? ` ${plan}` : ''} — sales enquiry`
    : `Kefy${plan ? ` ${plan}` : ''} — consulta comercial`;
  return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────
//
// El servicio gestionado («lo hacemos nosotros») se vende conversando: los
// correos SDR firman con este WhatsApp y las landings por rubro llevan ahí,
// con un primer mensaje que dice de qué rubro viene la persona. Es el número
// público de la firma; NEXT_PUBLIC_SALES_WHATSAPP lo cambia sin tocar código
// (solo dígitos, con código de país).

const DEFAULT_SALES_WHATSAPP = '56982347140';

export function salesWhatsappNumber(): string {
  const configured = process.env.NEXT_PUBLIC_SALES_WHATSAPP?.replace(/\D/g, '');
  return configured || DEFAULT_SALES_WHATSAPP;
}

/** Enlace a WhatsApp con el primer mensaje ya escrito. */
export function whatsappHref(text: string): string {
  return `https://wa.me/${salesWhatsappNumber()}?text=${encodeURIComponent(text)}`;
}
