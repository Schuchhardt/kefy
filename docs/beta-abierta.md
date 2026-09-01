# Beta abierta — límites, cuotas y observabilidad

Documento de referencia para todo lo que se añadió al abrir la beta.
Leerlo antes de tocar `lib/rate-limit.ts`, `lib/usage.ts`, `lib/ai-guard.ts`,
`lib/observability.ts`, `lib/sentry-scrub.ts` o cualquier ruta de generación.

## 1. Planes y mes gratis

**Kefy no tiene plan gratuito.** Toda cuenta nueva entra en **Starter con el
primer mes gratis**. Por eso hay dos preguntas que no hay que confundir:

| Pregunta | La responde | Dónde |
|---|---|---|
| ¿Cuántos créditos y marcas le tocan? | El **plan** | `kefy_organizations.plan` |
| ¿Puede crear contenido? | El **estado de la suscripción** | `kefy_subscriptions.status` |

Al registrarse se crea la suscripción con `status: 'trialing'` y
`current_period_end` a 30 días (`TRIAL_DAYS`). No hizo falta migrar nada: la
tabla ya tenía ambas columnas.

| Plan | Precio | Marcas | Créditos IA/mes | Miembros |
|---|---|---|---|---|
| Starter | US$49/mes — **primer mes gratis** | 1 | 150 | 1 |
| Pro | US$99/mes | 5 | 500 | 1 |
| Business | US$199/mes | 15 | 2000 | 5 |

Cada operación descuenta según su coste: texto 1 crédito, imagen 3, video 10
(`CREDIT_COSTS` en `lib/usage.ts`).

Estos números son los que anuncia la página de precios. Si cambian en
`lib/usage.ts`, `lib/brands.ts` o `lib/team.ts`, hay que cambiarlos también en
la landing — `tests/unit/lib/usage.test.ts` y `tests/unit/lib/team.test.ts` lo
verifican.

### Equipo

`lib/team.ts` + `app/api/team/**`. Los miembros por plan se anunciaban en la
tabla comparativa pero no existía forma de invitar a nadie. Ahora el dueño y los
administradores invitan por correo (`kefy_org_invitations`, token hasheado, 7
días de validez), y las invitaciones pendientes ocupan cupo — si no, se podrían
emitir cien con un plan de un solo miembro y el tope se saltaría al aceptarlas.

> El código decía otra cosa que la página: Pro tenía 3 marcas (se vendían 5),
> Business ilimitadas (se vendían 15) y existía un plan Agency solo en la copy.
> Ahora coinciden, y Agency se quitó de la página.

### Qué pasa al terminar el mes gratis

La cuenta **no se bloquea entera**: deja de poder **crear** (generar contenido y
publicar), pero entra al dashboard y conserva todo lo que hizo. Perder el acceso
al propio contenido es la forma más rápida de que alguien que dudaba no vuelva.

`lib/subscription.ts` traduce la fila de suscripción a un `Entitlement`:

| `status` | ¿Puede crear? | `reason` |
|---|---|---|
| `trialing`, período vigente | sí | — |
| `trialing`, período vencido | no | `trial_expired` |
| `active` | sí | — |
| `past_due` | no | `payment_failed` |
| `unpaid` | no | `payment_failed` |
| `canceled` | no | `canceled` |
| sin fila | no | `no_subscription` |

Dos detalles deliberados:

- **`active` con período vencido sigue pudiendo crear.** Stripe renueva
  `current_period_end` en cada cobro; que esté vencido significa que el webhook
  de renovación no llegó, no que el usuario deba dinero. El error se resuelve a
  favor de quien paga.
- **Al cancelar, el plan no cambia.** No hay plan gratuito al que caer: lo que
  corta la creación es el `status`. Así basta con reactivar el pago para que
  todo vuelva sin recalcular nada.

## 2. Rate limiting

`lib/rate-limit.ts`. El conteo vive en Postgres (`kefy_rate_limit_hit`), no en
memoria: en Vercel cada request puede caer en una instancia distinta, así que un
contador en proceso no limitaría nada.

Las ventanas son fijas, no deslizantes: se trunca el instante actual al múltiplo
de `windowSeconds` y esa marca identifica la fila. Menos preciso en los bordes,
pero cuesta una sola escritura atómica.

| Regla | Tope | Ventana | Sujeto |
|---|---|---|---|
| `login` | 10 | 5 min | IP |
| `register` | 5 | 1 h | IP |
| `forgotPassword` | 5 | 1 h | IP |
| `resetPassword` | 10 | 1 h | IP |
| `aiGeneration` | 20 | 1 min | organización |
| `publish` | 30 | 1 min | organización |

**Falla abierto.** Si Supabase no responde, la petición pasa y el fallo va a
Sentry. Un limitador caído no puede dejar a todo el mundo fuera del login: el
riesgo de una caída total supera al de un rato sin límite.

En login el freno actúa **antes** de consultar la base y de comparar con bcrypt,
que es lento a propósito y es justo lo que un ataque quiere provocar.

`collectExpiredWindows` limpia las ventanas viejas; la llama el cron de
autopilot, que ya corre cada 5 minutos.

## 3. Créditos de IA

`lib/usage.ts`. Un **único pool mensual** por organización, que es exactamente
lo que vende la página de precios («150 créditos IA / mes»). El período es el
mes calendario en UTC (`2026-09`).

Cada operación descuenta según lo que cuesta de verdad:

| Operación | Créditos | Qué incluye |
|---|---|---|
| `text` | 1 | una llamada a Claude/GPT |
| `image` | 3 | generación + procesado + subida |
| `video` | 10 | render en Remotion Lambda + alojamiento |

Sin ponderar, los 150 créditos de Starter podrían gastarse en 150 renders de
video, que cuestan órdenes de magnitud más que 150 captions. Los pesos viven en
`CREDIT_COSTS` y no en la base de datos para poder recalibrarlos sin migrar.

Una imagen por slide de carrusel o por escena de reel descuenta por separado. Si
los créditos se agotan a mitad de un carrusel, los slides restantes salen sin
imagen en vez de fallar: el texto ya está generado y es preferible entregarlo.

**Falla cerrado**, al revés que el rate limiter: sin poder verificar el saldo no
se autoriza gasto. Un limitador caído deja el servicio sin freno un rato; un
contador caído deja la factura de IA abierta. El usuario recibe un 503
(«reintenta»), no un 429 («mejora tu plan»).

El consumo es atómico: `kefy_credits_consume` hace el chequeo y el incremento en
la misma sentencia, así dos peticiones simultáneas al borde del tope no pueden
pasar ambas.

### Reembolsos

Si la generación falla **después** de descontar, se devuelve con
`refundCredits`. Un fallo del proveedor no se le cobra al usuario. Aplica a
texto, imagen suelta, cada imagen de carrusel/reel/story y el disparo del render.

### La guardia

`lib/ai-guard.ts` reúne los tres frenos en una llamada, de más barato a más caro
de deshacer:

1. **Suscripción** → 402. Ni una cuenta impaga debe gastar créditos.
2. **Rate limit** → 429 con `retryAfter`. Una ráfaga no debe consumir créditos.
3. **Créditos** → 429 con `creditsExhausted`.

```ts
const guard = await guardAiRequest(req, {
  auth, operation: 'text', route: 'POST /api/content/generate', language,
});
if (guard.blocked) return guard.blocked;

try {
  result = await generateContentText({ ... });
} catch (err) {
  await guard.refund();   // no se le cobra un fallo nuestro
  reportError(err, { route: '...', auth, service: 'ai' });
  return NextResponse.json({ error: msg }, { status: 502 });
}
```

Publicar y programar no gastan créditos pero también son «crear»: usan
`requireActiveSubscription` (`lib/subscription.ts`) más el rate limit de
`publish`.

**Al añadir una ruta que gaste dinero, hay que pasarla por `guardAiRequest`.**
`tests/unit/api/ai-quotas.test.ts` es la red que avisa si se olvida en las rutas
ya cubiertas.

### Los tres bloqueos, y qué debe hacer la UI

| Respuesta | Campo | Significa | La UI debe |
|---|---|---|---|
| 402 | `subscriptionRequired`, `reason` | Falta pagar | Llevar a planes |
| 429 | `retryAfter` | Demasiadas peticiones | Esperar y reintentar |
| 429 | `creditsExhausted` | Sin créditos este mes | Ofrecer mejorar el plan |
| 503 | — | No se pudo verificar | Reintentar |

`GET /api/auth/me` devuelve `subscription` y `usage` para que el dashboard avise
**antes** de que el usuario se choque con cualquiera de los tres.

## 4. Sentry

Sin `SENTRY_DSN` el SDK queda inerte: no inicializa transporte ni envía nada.
La app funciona igual en desarrollo y en los tests no hay llamadas de red.

| Archivo | Runtime |
|---|---|
| `sentry.server.config.ts` | Node (route handlers, server components, crons) |
| `sentry.edge.config.ts` | Edge (`proxy.ts`) |
| `instrumentation-client.ts` | Navegador |
| `instrumentation.ts` | Carga el que toque + `onRequestError` |

### Datos sensibles

`lib/sentry-scrub.ts` es la última barrera antes de que un evento salga del
proceso. Redacta cabeceras de autenticación, cookies, contraseñas, tokens,
claves de API, credenciales en URLs y datos de breadcrumbs. Del usuario solo
viaja el id: nunca email, IP ni nombre.

`tests/unit/lib/sentry-scrub.test.ts` cubre cada caso. **Si uno de esos tests
falla, hay una fuga de datos**, no un test roto.

### Contexto

`lib/observability.ts` expone `reportError` / `reportWarning` / `addBreadcrumb`.
Etiquetan ruta, servicio, plan y organización: es lo que permite ver si un fallo
afecta a una cuenta o a todas. Nunca lanzan — un fallo del reporte no puede
tumbar la request que lo originó.

Se usan en los `try/catch` que atrapan un error y devuelven un 4xx/5xx. Los
errores que Next deja escapar de un handler los captura `onRequestError`.

### El túnel `/monitoring`

`tunnelRoute` en `next.config.ts` proxea los eventos del navegador por el propio
dominio para que los bloqueadores de anuncios no se los coman. `proxy.ts` tiene
que excluir esa ruta del redirect de idioma o los eventos acabarían en
`/es/monitoring` y no llegarían nunca.

### Session Replay

Se graba solo cuando hay un error, con todo el texto, los inputs y los medios
enmascarados: sirve para ver qué hizo el usuario antes del fallo sin exponer el
contenido de sus marcas ni sus credenciales.

## 5. Error boundaries

| Archivo | Cubre | Conserva |
|---|---|---|
| `app/global-error.tsx` | Fallo del layout raíz | Nada (trae su propio `<html>`) |
| `app/[lang]/error.tsx` | Fallo de una página | El layout y la navegación |
| `app/[lang]/dashboard/error.tsx` | Fallo dentro del dashboard | La barra lateral |

Los tres reportan a Sentry y muestran el `digest`, que es el identificador que
aparece también en los logs del servidor: pedirlo por soporte permite encontrar
el error exacto.

## 6. Registro transaccional

Supabase no expone transacciones desde el cliente REST y el alta toca cinco
tablas. Si un paso intermedio fallaba y se dejaba lo ya creado, quedaba una
cuenta a medias: el usuario existía, el login respondía 500 «No organization
found» para siempre y no podía volver a registrarse porque su email figuraba
como tomado.

Ahora cada fallo deshace lo anterior en orden inverso (`kefy_subscriptions` →
`kefy_org_memberships` → `kefy_brands` → `kefy_organizations` → `kefy_users`,
siguiendo las claves foráneas).

Los cinco pasos son terminales, incluida la suscripción: sin su fila la cuenta
no puede crear nada desde el primer día, que es peor que no haberla creado.

## 7. Puesta en marcha

1. Aplicar la migración
   `db/migrations/20260901000001_create_rate_limits_and_usage.sql`.
2. Configurar en Vercel: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, y para los
   source maps `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
3. Verificar que `/monitoring` responde (el túnel de Sentry).

Sin el paso 1 **toda ruta de generación responde 503**: los créditos fallan
cerrado y sin las funciones SQL no se puede verificar nada.
