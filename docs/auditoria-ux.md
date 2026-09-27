# Auditoría UX — landing, login y app (septiembre 2026)

Auditoría completa de la landing (`app/[lang]/page.tsx` y `components/landing/**`),
la página de precios, el flujo de autenticación/onboarding y la interfaz del
dashboard, con foco en **mobile**. Termina en un roadmap priorizado (sección 7).

Método: lectura del código, más un render real con Playwright a 390×844
(iPhone 13) y 1440×900 de `/es`, `/en`, `/es/precios`, `/es/login`,
`/es/register` y `/es/forgot-password`. Los números de este documento salen de
ese render (`document.scrollWidth`, `getBoundingClientRect`, `getAnimations`,
`getComputedStyle`), no de estimaciones.

Convención de severidad:

| Nivel | Significa |
|---|---|
| **P0** | Rompe la experiencia o promete algo que no existe (riesgo legal/confianza) |
| **P1** | Pierde conversiones o hace la app confusa en mobile |
| **P2** | Pulido, consistencia, deuda técnica visible para el usuario |

---

## 1. Resumen ejecutivo

1. **La landing no cabe en un móvil.** A 390px el documento mide 687px de
   ancho (297px de desborde). Causa: el blur decorativo del hero de 984px
   (`components/landing/Hero.tsx:72-86`). En Safari iOS el usuario puede
   deslizar la página lateralmente y el selector de idioma y el menú quedan
   fuera de pantalla en emulación. **P0.**
2. **La landing promete cosas que el producto no tiene.** Facturación anual
   con 20% de descuento (Stripe solo tiene precios mensuales), «Ads / convierte
   un post en anuncio con un clic» (hay API pero ninguna pantalla), «Reportes
   white-label», «Migración gratuita», «Analytics básico vs completo»,
   «Email» como canal, y el JSON-LD declara `price: 0` con «Plan gratuito
   disponible» cuando no hay plan gratuito. **P0.** Es justo el patrón que
   `AGENTS.md` dice que ya se limpió una vez.
3. **El CTA principal miente sobre el tiempo hasta el valor.** «Ver cómo
   quedaría mi negocio» y «En menos de un minuto verás publicaciones creadas
   para ti» llevan a un registro de 4 campos, un modal de bienvenida y un
   wizard de Brand Kit de 20 pasos antes de poder generar el primer post
   (≥25 interacciones). **P0 de producto.**
4. **Las pantallas de auth están 100% en español aunque la URL sea `/en/`.**
   Solo los errores de login y la página de invitación están traducidos.
   La landing tiene test de paridad es/en; auth no tiene locales. **P1.**
5. **Mobile en el dashboard**: padding fijo de 48px, grillas de 3 columnas
   fijas, textos de 10px en la barra inferior, inputs de 15px (zoom en iOS),
   modales sin safe-area. Detalle en la sección 5. **P1.**
6. **Rendimiento en mobile**: vídeo MP4 de fondo autoplay en hero + 4
   páginas de auth sin poster ni `preload="none"` ni respeto a
   `prefers-reduced-motion`; overlay de ruido `fixed` con `mix-blend-mode` a
   pantalla completa; 33 animaciones corriendo a la vez en la landing;
   blur de 82px sobre 984×527px. **P1.**
7. **Código muerto que sigue costando**: 5 secciones de landing no montadas
   (Mult, Strategy, Features, AutoEngage, LandingClient), `ColorBends` con
   three.js, copy `mult/strategy/engage/features` en dos idiomas, locales de
   dashboard sin importar (`ads.ts`, `analytics.ts`, `home.ts`). **P2.**

---

## 2. Landing — copy y promesas

### 2.1 Promesas sin producto detrás (P0)

| Dónde | Dice | Realidad | Acción |
|---|---|---|---|
| `app/[lang]/page.tsx:52-55` (JSON-LD) | `price: '0'`, «Plan gratuito disponible» | No hay plan gratuito; es trial de 30 días (`lib/subscription.ts`) | Cambiar a `price: '49'`, `priceCurrency: 'USD'`, y describir el trial en `description` |
| `locales/es/common.ts:10` (meta description) | «…programación, analytics y **ads** en una sola plataforma» | Ads no tiene UI | Quitar «ads»; alinear con el h1 |
| `locales/*/landing.ts` `pricing.billingToggle`, `annualPrice`, `annualBilled` | Toggle «Anual — 20% OFF», $39/$79/$159, «cobrado $468/año» | `lib/stripe.ts:32-41` y `app/api/billing/checkout/route.ts` solo tienen un `price` mensual por plan | O crear los precios anuales en Stripe y pasar `interval` al checkout, o quitar el toggle. Añadir test como el de créditos |
| `pricing.plans[0].features` Starter | «Ads» y «Modo piloto automático» en gris (no incluidos) | `lib/subscription.ts` no gatea funciones por plan; `/dashboard/automations/autopilot` está abierto a Starter | Quitar los ítems en gris o implementar el gating |
| `pricing.plans[1].features` Pro | «Todos los canales (IG, FB, LinkedIn, TikTok, X, **Email**)», «Multiplicador de contenido», «Analytics **completo**» | Email no es canal de publicación; «Multiplicador» no existe como feature nombrada; no hay analytics básico vs completo | Reescribir la lista con lo que hay: canales, créditos, marcas, miembros, API |
| `pricing.plans[2].features` Business | «Reportes white-label», «Acceso API + soporte prioritario» | White-label no existe; la API (`/api/v1`, api-keys) existe pero para todos los planes | Quitar white-label; decidir si la API se gatea |
| `pricing.closer` | «Migración gratuita desde otras plataformas» | No hay flujo ni servicio | Quitar |
| `pricing.plans[2].cta`, `enterpriseCta` | «Hablar con ventas», «Agendar una llamada →» | Ambos hacen `goToRegister()` (`PricingSection.tsx`, `PricingSimple.tsx:48-53`) | Enlazar a `mailto:` o a un formulario/Calendly real |
| `killer.points[2]`, `features.layers[0]` | «Con un clic, convierte una publicación que funcionó en un anuncio pagado» | `app/api/ads/boost` existe; ningún componente lo llama (`grep Promocionar|/api/ads` en `app/[lang]` y `components` = 0) | Quitar la sección «Métricas/ads» o rebajarla a «Ve qué funciona» sin ads hasta que haya UI |
| `channels.items` (12, incluye «Meta Ads») vs `testi.proof[0]` («**11** redes conectables») | Dos cifras distintas en la misma página | Meta Ads no es una red conectable | Dejar 11 en ambos sitios |
| `pricing.trialSub` | «En menos de un minuto verás publicaciones creadas especialmente para ti» | ≥25 interacciones hasta el primer post (sección 4) | Cumplirlo con un onboarding «pega tu web → 3 posts» o cambiar el copy |
| `hero.h1em` «sin que tengas que hacer nada» vs `how.steps[1]` «Tú apruebas antes de que salga» | Contradicción en la misma página | Autopilot existe, pero el flujo por defecto es manual con aprobación | Elegir un mensaje: «Kefy propone, tú apruebas en 1 toque» o vender el autopilot de verdad |

### 2.2 Copy: claridad y consistencia (P1)

- **Cinco verbos para la misma acción.** Nav «Crear cuenta gratis», hero
  «Ver cómo quedaría mi negocio», precios «Empezar gratis 30 días» / «Empezar
  Pro» / «Hablar con ventas», final «Ver cómo quedaría mi negocio». Todos van a
  `/register`. Un solo CTA primario, repetido igual, convierte mejor.
- **`hero.cta1` y `hero.cta2` son idénticos** y `hero.stats` está definido en
  ambos idiomas pero `Hero.tsx` no lo renderiza (el CSS `.hero-stats` es
  código muerto). Borrar o usar.
- **`how.h2` «Un sistema. Tres capas.»** presenta 5 pasos. El `intro` es una
  cadena de 5 conceptos con flechas («Estrategia y contenido → Publicación
  automática → Inbox unificado → Leads clasificados → Seguimiento»): en mobile
  ocupa 3 líneas y no la lee nadie.
- **`how.steps[3]`** explica el scoring («un DM suma 15 pts, una reseña 10, un
  comentario 5»). Es detalle de implementación; a la dueña de una tienda no le
  dice nada. Basta «Kefy detecta quién quiere comprarte».
- **`problem.pains[*].d` y `who.segments[*].d` vacíos** → `ProblemSection.tsx:66`
  y `WhoSection.tsx:27` pintan `<p></p>` vacíos. El grid `64px 1fr` del
  número decorativo «01» roba un sexto del ancho en mobile.
- **Textos en inglés dentro de la versión en español**: «active» y «Applied»
  (`BrandSection.tsx:49,101`), «Content calendar» (`AutopilotSection.tsx:76`),
  «Engagement trend» (`KillerSection.tsx:121`), «Enviado vía IG DM · Kefy
  Autopilot» hardcoded en `HeroDemo.tsx` (al revés en `/en`). Los fallbacks
  `copy.x ?? 'texto en español'` de `HeroDemo.tsx:105-118` enmascaran huecos
  de traducción.
- **Mock incoherente**: la tarjeta dice «Brand Kit · HiClothes» y el logo dice
  «trazo.» (`BrandSection.tsx:66-92`).
- **«Sin Kefy / Con Kefy»** (`cmp`) es genérico («Falta de tiempo» vs «Todo
  funciona solo»). No aporta sobre la sección Problema. Candidata a eliminar.
- **`sobre-kefy`**: tarjetas de equipo «Ingeniería», «Diseño», «Tú → Únete al
  equipo» sin enlace. Parece relleno; quitar o poner personas reales.
- **Tono**: «Kefy» aparece 3–4 veces por sección. Alternar con «la app» o
  segunda persona.

### 2.3 Navegación (P1)

- `Nav.tsx:31-41` y `Footer.tsx:29`: los enlaces «Cómo funciona» (`#how`),
  «Precios» (`#pricing`), «Piloto automático» (`#autopilot`) son anclas. En
  `/es/precios`, `/blog`, `/sobre-kefy` y los legales **no existe el ancla**:
  el clic no hace nada. Usar `/${lang}#how`.
- «Precios» en el nav lleva a la sección resumida (`#pricing`), en el footer a
  `/precios`. Mismo label, dos destinos.
- **Selector de idioma**: un `<button>` que envuelve un `<Link>`
  (`Nav.tsx:56-71`) es HTML inválido (interactivo anidado) y lee doble en
  lectores de pantalla. Además siempre navega a `/es` o `/en` raíz: desde
  `/es/precios` se pierde la página. No cierra con clic fuera ni con Escape.
- Menú mobile: sin bloqueo de scroll del body ni cierre con Escape.
- `/en/pricing` reexporta `/precios` pero los enlaces internos (`PricingSimple`,
  footer) siempre construyen `/${lang}/precios` → `/en/precios`. Elegir un
  slug por idioma y redirigir el otro.

---

## 3. Landing — diseño visual, color y animación

### 3.1 Layout mobile (medido a 390px)

| Hallazgo | Evidencia | Nivel |
|---|---|---|
| Desborde horizontal de **297px** en `/es` y `/en` | `scrollWidth 687` vs `innerWidth 390`; `Hero.tsx:72-86` div 984×527 con `blur(82px)` dentro de `.hero { overflow: visible }` (`globals.css:262`); `body { overflow-x: hidden }` no basta en iOS | P0 |
| Tarjeta «Con Kefy» cortada 21px por la derecha | `.cmp-simple { grid-template-columns: 1fr 1fr }` sin breakpoint (`globals.css:671`) | P1 |
| Input de email del hero queda en **59×25px** (44px en `/en`), placeholder «tu@corr» tapado por el botón | `Hero.tsx:122-157`: fila flex con botón `whiteSpace: nowrap; flexShrink: 0` | P1 |
| Demo del hero: en <640px muestra 2 columnas (pasos + mock IG) de ~170px cada una; la columna 3 (inbox/pipeline, lo que realmente vende) se oculta | la col 1 no tiene la clase `.demo-left` que el CSS oculta a <480 (`HeroDemo.tsx:139`); `.demo-col3 { display: none }` a <640 | P1 |
| 31 de 34 elementos interactivos miden menos de 44px | tabs del demo 36px, `.dash-boost` 32px, `.btn-sm` 33–35px, enlaces de footer 16px de alto, `lang-btn` 36px | P1 |
| `.step-num` «01/02/03» a **88px** también en mobile | sin escala en `@media` | P2 |
| Página de **~16.000px** de alto en mobile (12 pantallas antes de precios) | 14 secciones | P1 |
| `#autopilot` y `#cta` tienen contenido interno más ancho que el viewport (490 y 515px), recortado por `overflow: hidden` | calendario 7 columnas y blobs `::before/::after` de 400–500px | P2 |
| `.pricing-cmp-table` de 517px en un contenedor con scroll horizontal **sin indicador** | `globals.css:759-767` `white-space: nowrap` | P2 |
| Sin CTA persistente en mobile: `.nav-cta-desktop` se oculta a <760 y el único acceso arriba es burger → menú → botón | `globals.css:845` | P1 |

### 3.2 Color y tipografía

- **Tokens duplicados**: `@theme` (Tailwind) y `:root` definen los mismos
  colores; `--muted` vale `#6B6B78` en `:root` y `#c5c5ca` en
  `[data-theme="dark"]`. La landing fuerza `data-theme="dark"` y ve el gris
  claro; el dashboard sin tema guardado también, pero cualquier página sin
  el atributo (auth) ve `#6B6B78` sobre `#08080A` = **3,4:1**, por debajo de
  AA para texto de 11–13px (labels, notas, footer).
- **Acento `#C6FF4B` como texto en tema claro**: sobre `#FFFFFF` es 1,4:1.
  Ya se parcheó solo para el asistente (`--assistant-accent-text`); el resto
  del dashboard en tema claro sigue usando `var(--accent)` para texto.
- **Tamaños de 9–11px** en `HeroDemo.tsx` (`fontSize: 9/10/11` en ~25
  sitios), `.demo-section-lbl` 10px, «Applied» 10px, `BottomNav` 10px. En un
  móvil real son ilegibles.
- Tres familias (Syne, DM Sans, JetBrains Mono) con 7 pesos cargados; JetBrains
  solo se usa para notas de 12px. Candidato a recortar.
- `body::before`: overlay de ruido `position: fixed` a pantalla completa con
  `mix-blend-mode: overlay` y **`z-index: 200`**, por encima del nav (100) y
  del BottomNav (100). Coste de composición permanente en scroll y se pinta
  sobre la UI. Bajarlo a `z-index: 0` o quitarlo en mobile.

### 3.3 Animación y rendimiento

- **Vídeo de fondo** (`Hero.tsx:8-9`, mismo `VIDEO_SRC` duplicado en login,
  register, forgot y reset): `autoplay` sin `poster`, sin `preload="none"`, sin
  `matchMedia('(prefers-reduced-motion)')`, sin condición de ancho. En 4G el
  hero descarga un MP4 antes del LCP; con la CDN bloqueada (como en este
  render) no hay fallback visual. Además un `requestAnimationFrame` continuo
  para el fade.
- `getAnimations()` en la landing: **54 animaciones, 33 corriendo** a la vez
  tras el scroll (29 `revealUp`, 12 `barGrow`, 7 `skeletonPulse`, 4
  `pulseDot`). `.reveal` pone `will-change: opacity, transform` en decenas de
  nodos → memoria GPU en mobile.
- `prefers-reduced-motion` solo cubre `.reveal` (`globals.css:168-170`). No
  cubre `pulseDot`, `blink`, `skeletonPulse`, `msgIn`, `barGrow`, `spin`, el
  vídeo ni `html { scroll-behavior: smooth }`.
- `@keyframes pulseDot` está definido dos veces (`globals.css:331` y `:815`).
- **HeroDemo** cicla solo (8s + 10s + 9,5s) con ~20 `setTimeout`, sin pausar
  fuera del viewport ni con la pestaña oculta, y cambia de paso mientras el
  usuario lee. Los botones de paso miden 20px de alto.
- `KillerSection.tsx` usa `animationTimeline: 'view(block)'` en estilo inline
  sin el fallback `@supports` que sí tiene `.reveal`.
- `ColorBends.tsx` (three.js, WebGL) no se usa en ninguna página pero `three`
  y `@types/three` están en dependencias.

---

## 4. Login, registro y onboarding

### 4.1 Mapa del flujo real

```
Landing (email opcional) → /register (nombre, negocio, email, contraseña)
  → cookies emitidas, sin verificación de email
  → /dashboard?onboarding=1 → modal «Bienvenido» (solo botón «Empezar»)
  → sección «Configura tu cuenta»: BrandKitWizard (20 pasos, PATCH por paso)
  → SocialConnectionPanel (OAuth) → «Crear primer contenido» → /dashboard/content
```

- Hasta el primer post hay **≥25 interacciones**. El wizard no bloquea, pero
  nada dice que se puede saltar; solo `name`, colores y fuentes son
  obligatorios y no hay «Terminar más tarde» (`BrandKitWizard.tsx:727-730`).
- El modal lista «1. Brand Kit, 2. Crear contenido, 3. Conectar redes»
  (`dashboard/page.tsx:269-292`) pero la página muestra Brand Kit → Redes →
  Contenido. El paso 2 no enlaza a nada. El modal se reabre en cada carga
  mientras `isNewAccount` (`:203-206`) aunque ya se cerró; sin
  `aria-labelledby`, sin Escape ni clic fuera, sin focus trap.
- `?next=` se respeta en login (`login/page.tsx:93,118`) pero **no en
  register** (siempre `/dashboard?onboarding=1`, `register/page.tsx:59`).
- `/{lang}/onboarding` es un `router.replace` vacío sin fallback sin JS.

### 4.2 Login (`app/[lang]/login/page.tsx`)

| Hallazgo | Nivel |
|---|---|
| Todo el copy en español fijo («Inicia sesión en tu cuenta», «Contraseña», «¿Olvidaste…», «Regístrate gratis», banners, footer) aunque la ruta sea `/en/login`. Solo `LOGIN_ERROR_MESSAGES` está localizado, comparando strings exactos del API | P1 |
| Inputs `fontSize: 15` (`:293,305`) → **zoom automático en iOS** al enfocar. El proyecto ya lo sabe: `globals.css:1027` usa 16px para el asistente | P1 |
| `outline: 'none'` sin `:focus-visible` alternativo → navegación por teclado invisible | P1 |
| Sin toggle de ver contraseña; sin `inputMode="email"`, `autoCapitalize="none"`, `spellCheck={false}`; sin `autoFocus` | P2 |
| Error en `<p>` sin `role="alert"`; botón «Iniciando sesión...» cambia a gris `var(--border)` y parece deshabilitado, no cargando | P2 |
| Sin `<title>` propio: hereda «Kefy — Tu equipo de marketing…» | P2 |
| Wrapper `minHeight: 100vh` + `overflow: hidden` (`:227`) recorta el footer en Safari iOS con barra de direcciones; usar `100dvh` | P2 |
| Vídeo + blur 700×500 + rAF en la pantalla de login (ver 3.3) | P1 |
| Links pequeños: «Regístrate gratis» 108×15px, footer legal 20px de alto | P2 |

### 4.3 Registro (`app/[lang]/register/page.tsx`)

- Copy en español fijo, igual que login.
- **Errores del API se muestran crudos y en inglés**: «Email already
  registered», «Password must be at least 8 characters» (`:55`,
  `api/auth/register/route.ts:52-61`). Ante un 409 no se ofrece «Inicia
  sesión» ni «Recuperar contraseña».
- Reglas de contraseña solo como placeholder («mínimo 8 caracteres»),
  validadas al enviar; sin indicador en vivo ni toggle.
- Términos como texto pasivo sin checkbox (aceptable, pero no registra
  consentimiento).
- **No se repite la promesa** «30 días gratis · Sin tarjeta · Cancela cuando
  quieras» justo donde aparece la ansiedad. El API devuelve `trial.days` y no
  se usa.
- `orgName` sin `autoComplete="organization"`; inputs a 15px.
- Rate limit 5 registros/hora/IP (`lib/rate-limit.ts:157`): una oficina tras
  NAT choca; el 429 sale en español fijo.

### 4.4 Forgot / reset / invitación

- Forgot: anti-enumeración correcta; copy solo en español; sin
  `RESEND_API_KEY` responde 200 sin enviar nada (silencio).
- Reset: el token expirado se descubre **al enviar**, después de escribir dos
  contraseñas, y el error no enlaza a `/forgot-password`. Validar con un GET al
  cargar (como hace invitación).
- Invitación (`/invitacion`): el único flujo localizado y con estados
  loading/ready/error. Pero sin sesión, al registrarse **se crea una
  organización nueva con trial** y el usuario aterriza en su org vacía, no
  en la invitación (register ignora `next`; `login/route.ts:285-292` toma la
  membresía más reciente). La URL es `/invitacion` también en inglés.

---

## 5. Dashboard — navegación, mobile y consistencia

_(ver sección 5 completa más abajo; se consolidó con la auditoría de código
del dashboard)_

---

## 6. Deuda que el usuario nota

- Componentes no montados: `MultSection`, `StrategySection`, `FeaturesGrid`,
  `AutoEngageSection`, `LandingClient`, `BendsSection`/`ColorBends`. Copy
  `mult`, `strategy`, `engage`, `features` en `locales/*/landing.ts` (~150
  líneas × 2) que el test de paridad sigue vigilando. Locales de dashboard sin
  importar: `ads.ts`, `analytics.ts`, `home.ts`.
- 58 `style={{}}` inline en `HeroDemo.tsx`, 23 en `StrategySection`, 18 en
  `PricingSection`; el dashboard mezcla inline, Tailwind y clases globales.
  Esto es lo que hace que un cambio de color o de padding mobile haya que
  repetirlo en 30 sitios.
- El bloque de vídeo de fondo está copiado 5 veces (~25 líneas idénticas).

---
