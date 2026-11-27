// ─── Eventos que el webhook de Zernio tiene que tener suscritos ──────────────
//
// Zernio solo entrega los eventos que lista el webhook (`events` en
// PUT /v1/webhooks/settings): no hay comodín ni lista por defecto. Si falta uno,
// Kefy no se entera. Así pasó con account.disconnected: Instagram venció el
// token, Zernio dio la cuenta por desconectada y en Kefy siguió «Activa».
//
// La lista la usa scripts/zernio-webhook-events.ts (revisar y corregir la
// suscripción) y un test comprueba que cada evento tenga su `case` en
// app/api/webhooks/zernio/route.ts. Ver docs/zernio.md («Eventos suscritos»).

export const REQUIRED_ZERNIO_WEBHOOK_EVENTS = [
  // Estado y URL de las publicaciones.
  'post.scheduled',
  'post.published',
  'post.failed',
  'post.partial',
  'post.cancelled',
  'post.recycled',
  'post.platform.published',
  'post.platform.failed',
  'post.tiktok.url_resolved',
  // Estado de las cuentas: sin estos, una cuenta desconectada sigue «Activa».
  'account.connected',
  'account.disconnected',
  // Bandeja y reglas de respuesta automática.
  'message.received',
  'message.sent',
  'message.edited',
  'message.deleted',
  'message.read',
  'comment.received',
] as const;
