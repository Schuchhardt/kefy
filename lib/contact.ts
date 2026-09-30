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
