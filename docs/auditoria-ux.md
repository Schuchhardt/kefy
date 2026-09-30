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

## 0. Estado: implementada (septiembre 2026)

Todo el roadmap de la sección 7 (sprints 0 a 5) está implementado. Lo que
queda fuera y por qué está al final de esta sección. Las cifras son de un render
real con Playwright (Chromium) contra `next dev`, no estimaciones.

### Métricas

| Métrica | Antes | Objetivo | Ahora |
|---|---|---|---|
| Ancho del documento a 390px (landing) | 687px | 390px | **390px** (también 320 y 360: sin desborde) |
| Alto de la landing en móvil | ~16.000px | <8.000px | **7.862px** (es) · 7.839px (en) |
| Interacciones hasta el primer post generado | ≥25 | ≤5 | **2** desde la cuenta creada (web o frase + «Crear mis 3 posts»); 8 contando el registro |
| Elementos interactivos <44px en landing | 31/34 | <5 | **0** |
| Inputs <16px | 100% | 0 | **0** (landing, auth y las 16 pantallas del dashboard) |
| Animaciones simultáneas en landing | 33 | <10 (0 con reduced-motion) | **5** por tiempo al cargar, **1** en reposo, **0** con reduced-motion (las entradas son por scroll: `animation-timeline: view()`) |
| Pantallas de auth traducidas | 1/5 | 5/5 | **5/5** (+ onboarding) |
| Promesas de precios sin flujo detrás | 8 | 0 | **0** (vigilado por `tests/unit/locales/parity.test.ts`) |
| Dashboard: desborde horizontal a 390px | varias pantallas | 0 | **0** en las 16 pantallas |
| Violaciones de axe (WCAG 2.x A/AA) | sin medir | 0 | **0** en 21 pantallas, tema claro y oscuro |

Lo vigilan: `tests/e2e/mobile-a11y.spec.ts` (sin scroll horizontal a 390 y
320px y axe en landing, auth y dashboard, en los dos temas),
`tests/unit/locales/all-locales.test.ts` (paridad es/en de todos los locales) y
`parity.test.ts` (promesas de la landing).

### Qué se hizo, por sprint

- **Sprint 0.** Sin desborde (blur acotado, `overflow-x: clip`), enlaces rotos
  del dashboard arreglados (`/settings#social`), anclas y selector de idioma
  que conservan la página, JSON-LD con precios reales y `<title>` por pantalla
  de auth, precios sin nada que no exista, inputs a 16px y `:focus-visible`
  global, `viewportFit: 'cover'` con safe-area, escala de z-index
  (`--z-*`), ruido del fondo detrás del contenido y fuera en móvil.
- **Sprint 1.** Landing en móvil: nada de vídeo (póster en SVG), sin el blur
  de 82px del hero (en escritorio, acotado al ancho), `prefers-reduced-motion`
  respetado, demo del hero honesta y ligera, objetivos táctiles de 44px, textos
  de 12px o más.
- **Sprint 2.** Una sola promesa y un solo CTA («Probar gratis» · «30 días
  gratis · Sin tarjeta · Cancela cuando quieras»), 8 secciones en vez de 14,
  11 redes en todos lados, precios con una sola implementación (`compact` en la
  home), `lib/plans.ts` como única fuente de precios y topes (también Ajustes),
  «Hablar con ventas» con contacto real.
- **Sprint 3.** Auth traducida con `locales/*/auth.ts` y `AuthShell` único;
  errores por código (`lib/auth-errors.ts`), ver contraseña, reglas en vivo,
  `inputMode`/`autoComplete`/`autoFocus`, `role="alert"`, spinner; ante un
  email ya registrado ofrece entrar o recuperar. `?next=` en login y registro.
  Registrarse desde una invitación entra en el equipo que invitó (sin
  organización ni trial propios). Reset valida el enlace al abrirse. El
  **onboarding «pega tu web o describe tu negocio → 3 posts»**
  (`/{lang}/onboarding`, `lib/services/onboarding.ts`) sustituye al modal y al
  wizard como primera pantalla; el wizard pasa a **«Completa tu marca»**
  (`/dashboard/brand/setup`): 5 pantallas, «Terminar más tarde», sugerencias
  de IA solo con botón. El home tiene **«Primeros pasos»** con estado real.
- **Sprint 4.** `.page`/`.page-header`, `SectionTabs`, `Modal` único (hoja
  inferior, foco atrapado, Escape solo cierra el de arriba), rejillas que
  colapsan, calendario en agenda en móvil, conversaciones master-detail, leads
  como hoja inferior, BottomNav con los nombres del sidebar y no leídos,
  Ajustes accesible en móvil.
- **Sprint 5.** Tokens semánticos con contraste AA en los dos temas,
  componentes compartidos (`components/ui`), iconos SVG, i18n del dashboard
  sin ternarios, tema claro por defecto según el sistema con `theme-color`
  dinámico, tests de paridad, desborde y axe.

### Decisiones tomadas (revisables)

- **Leer una web cuesta 1 crédito.** `POST /api/brand-kit/enrich-url` llamaba a
  Firecrawl sin guardia; ahora pasa por `chargeOrThrow` (ver
  `docs/beta-abierta.md`). Las sugerencias con IA del Brand Kit ya costaban 1
  crédito, pero se pedían solas: ahora solo con botón.
- **El onboarding genera 3 posts con imagen**: ~12 créditos (13 con web) de
  los 150 del mes gratis, dicho antes de gastar. Texto primero (segundos) e
  imágenes después, una por post.
- **Contacto de ventas**: `mailto:ventas@kefy.app` o
  `NEXT_PUBLIC_SALES_CONTACT_URL` si está definido (`lib/contact.ts`).
- **Quitado de precios por no existir**: facturación anual, «Soporte
  prioritario», ads, white-label, migración, «Email» como canal. Los topes de
  cuentas sociales por plan (`socialConnections` en `lib/plans.ts`) se
  anuncian pero todavía no se hacen cumplir en el API.
- **La landing es siempre oscura** (está diseñada sobre negro); el dashboard
  sigue la preferencia guardada o la del sistema.

### Pendiente

- **Borrar el código muerto** del punto 7 del resumen (secciones de landing no
  montadas, `ColorBends` + three.js, copy `mult/killer/engage/strategy/
  features/who/cmp/lang`, `locales/*/dashboard/{ads,analytics}.ts`). Está
  aislado y no se carga, pero sigue en el repo: borrarlo necesita una
  aprobación explícita que esta sesión no tenía.
- **Respuestas automáticas con `{nombre}`**: la UI prometía sustituir el nombre
  y `lib/engagement-executor.ts` envía el texto literal. Se cambió el texto de
  la UI; implementar la sustitución es una decisión de producto.
- **Cambio de plan de un cliente que ya paga**: hoy pasa por un checkout nuevo
  y podría acabar con dos suscripciones; conviene llevarlo al portal de Stripe.
- **Reels antiguos solo con `mux_playback_id`** siguen mostrando «El video se
  está generando…» sin forma de regenerarlos desde la interfaz.

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

Dato que condiciona todo: **56 archivos del dashboard usan `style={{}}`
inline y solo 13 usan `className`; ninguno usa prefijos responsive de
Tailwind**. Las únicas reglas mobile son `globals.css:103-111` (oculta
sidebar, muestra BottomNav, padding de `.dashboard-main`) y `:1019-1028`
(asistente). Por eso casi todo lo de 5.2 se repite página por página.

### 5.1 Navegación y arquitectura

- **Estructura**: 5 secciones (Dashboard, Mi marca, Contenido, Conversaciones,
  Automatizaciones) + Ajustes abajo; tres tienen sub-tabs (Crear/Calendario/
  Librería, Identidad/Mercado/Estrategia, Autopilot/Engagement/Leads). 11
  pantallas + Perfil + 6 modales. Es razonable, pero:
- **Nombres distintos en escritorio y mobile**: `Sidebar.tsx:86-93` dice
  «Dashboard / Conversaciones / Automatizaciones»; `BottomNav.tsx:6-12` dice
  «Home / Chat / Auto». «Chat» se confunde con el asistente IA flotante, que
  también es un chat. Dos diccionarios `NAV_LABELS` duplicados. **P1.**
- **Enlaces rotos**: `ScheduleModal.tsx:339` enlaza a
  `/${lang}/dashboard/social` («Conectar cuentas →»), **ruta que no existe**,
  justo cuando el usuario intenta publicar sin cuentas. `calendar/page.tsx:193`
  usa `<a href="settings">` relativo → resuelve a `/dashboard/content/settings`
  (404). **P0.**
- **Sin indicador de mensajes en mobile**: el badge de no leídos vive en el
  Sidebar (`Sidebar.tsx:131-155`), que en mobile está `display: none`; el
  polling sigue corriendo pero `BottomNav` no lo muestra. **P1.**
- **Sub-tabs en mobile**: `padding: 0 48px` + `white-space: nowrap` sin
  `overflow-x` en los tres `layout.tsx` (72 líneas copiadas ×3). A 360px
  «Identidad · Mercado · Estrategia» provoca scroll horizontal de toda la
  página. Además son `sticky; z-index: 10` y el selector de marca y el avatar
  son `fixed; top: 13; z-index: 300`: al hacer scroll los pills se pintan encima
  de las tabs. **P1.**
- **Dos nombres para lo mismo**: la tab «Librería» y el botón «📚 Biblioteca»
  abren el mismo `ContentLibraryBrowser`; la lista de *mis* contenidos vive en
  la tab «Crear» sin nombre propio. «Perfil» y «Ajustes» duplican el campo
  nombre. **P2.**
- **El home no dice qué hace la app**: «Bienvenido a tu dashboard»; la
  propuesta (generar → aprobar → publicar) solo se infiere de las «Acciones
  rápidas». No hay CTA primario «Crear» en el sidebar. **P1.**
- Locales sin uso: `locales/*/dashboard/home.ts` (que además dice «Plan
  gratuito activo · 20 piezas/mes»), `ads.ts`, `analytics.ts`. **P2.**

### 5.2 Mobile (360–390px)

| Problema | Dónde | Nivel |
|---|---|---|
| **Gutters de escritorio** `padding: '40px 48px'` sin media query → 264px útiles a 360px; dentro del wizard 200px | `dashboard/page.tsx:341`, `calendar:143`, `settings:237`, `profile:173`, `brand/identity:375`, `brand/market:254`, `autopilot:178`, `leads:523`, `create:784`, `library:25`, `strategy:372`, `engagement:158`, `BrandKitWizard.tsx:697` | P1 |
| **Grids fijos** `repeat(3, 1fr)` que no colapsan: métricas, planes (con badge «Más popular» absoluto solapado), colores, plataformas («Google Business» en 75px) | `page.tsx:539,545`, `settings:323`, `identity:506`, `BrandKitWizard:550`, `SocialConnectionPanel:280,372`; `'1fr 1fr'` en otros 12 sitios | P1 |
| **Calendario** `repeat(7, 1fr)`: celdas de ~37px con padding 8 + círculo 26px → desborda; 6 semanas × 84px de alto | `calendar:240-285` | P1 |
| **Conversaciones**: lista `width: 320; flexShrink: 0` + panel → el hilo queda con ~40px; `height: 100vh` dentro de un main que ya suma 56+64px → el compositor queda bajo el BottomNav, doble scroll | `conversations/page.tsx:533,529,756` | P0 |
| **Leads**: panel lateral `fixed; width: 360; z-index: 50` (bajo el BottomNav 100); stats sin wrap; tabla de 6 columnas con `overflow: hidden` sin scroll | `leads/page.tsx:276-278,542,672-680` | P1 |
| **Modales**: `Modal.tsx` con `100vh`, sin `dvh`, sin safe-area, sin bottom-sheet; onboarding `z-index: 60` y conversación `z-index: 50` **por debajo** del BottomNav (100) y de los pills (300): se puede tocar el nav con el modal abierto | `Modal.tsx:41-53`, `page.tsx:351`, `conversations:853`, `leads:80` | P1 |
| **`viewportFit: 'cover'` no declarado** → todos los `env(safe-area-inset-*)` valen 0 en iOS; con `black-translucent` en PWA el selector de marca y el avatar (`top: 13`) quedan bajo el notch | `app/layout.tsx:14-19`, `MobileBrandSwitcher:39`, `UserAvatar:79` | P1 |
| **Inputs a 14px** (12 `inputStyle`) y 12–13px en otros 15 sitios → zoom en iOS; solo el asistente lo corrige | `create:120`, `settings:24`, `identity:45`, `market:24`, `profile:74`… | P1 |
| **Touch targets**: acciones de tarjeta 28px (`ContentActions.tsx:16`), botones de slide 24px (`EditContentModal:979`), idioma ~20px, tema 26px, filtros 27px, «Hoy» del calendario, cierres de modal | varios | P1 |
| **Solo hover**: `onMouseEnter` en 9 archivos sin `:active`/`:focus-visible`; tooltips `title` como único significado | `Sidebar`, `UserAvatar`, `leads`, `calendar`, `ContentActions` | P2 |
| `EditContentModal` preview `width: 300` > 280px disponibles; `ScheduleModal` con reel de 560px de alto → «Publicar» a 3 pantallas; `FormatPicker` 4 botones en 76px | `EditContentModal:448`, `ScheduleModal:729,542-560` | P1 |
| Header de Crear `space-between` sin wrap: h1 + dos botones → título comprimido | `create:786-810` | P2 |
| Iconos como emoji/unicode (◎ ◉ ♡ ◫ ↗ ⊕ ✦) se ven distintos en iOS/Android | `page.tsx:222-253`, `create:46-51`, `ScheduleModal:525` | P2 |

Lo que sí está bien: asistente a pantalla completa en mobile, BottomNav con
safe-area, `MobileBrandSwitcher` con `maxWidth: 52vw`, el `EmptyState` de
Conversaciones (icono + título + hint) que debería ser el compartido.

### 5.3 Formularios y flujos

**Crear contenido (`content/create/page.tsx`, 1.511 líneas)**

1. La página abre con la lista existente y el formulario **oculto**; hay que
   pulsar «Generar con IA», que muta a «Cancelar» y al cancelar borra las
   referencias. Con lista vacía el empty dice «Usa el botón Generar con IA»,
   que está fuera de vista.
2. Tipo Imagen/Video: si `genType` es `carousel`/`story` (vía `?type=`),
   «Imagen» aparece activo por `active = genType !== 'reel'` (`:831`).
3. Tema: textarea + «Biblioteca» + «Recomendarme un tema» + un input «hint»
   cuyo Enter dispara recomendaciones y no la generación. Tres formas de
   rellenar un campo.
4. Feedback repartido en **tres lugares**: «Generando…» bajo el textarea, un
   skeleton con progreso estimado por tiempo, y el resultado como `<pre>`
   dentro del form. Sin «siguiente paso»: para publicar hay que descubrir que
   la tarjeta es clicable.
5. Errores con strings hardcoded (`'Error al generar'`) aunque
   `t.errorGenerate` existe; fallo de imagen silencioso; borrar con
   `confirm()` nativo.

**Otros**

- `brand/identity`: 14 inputs en 6 tarjetas, un solo «Guardar» al fondo, sin
  autosave; el estado «Guardado» aparece junto a ese botón.
- `BrandKitWizard`: 20 pasos, PATCH completo por paso, sin saltar a un paso
  concreto, sin «Terminar más tarde». En mobile 200px útiles.
- `settings`: 7 secciones en un scroll sin índice; lead scoring expone claves
  crudas (`comment/dm/tibio/caliente`).
- `ScheduleModal`: `canSubmit` deshabilita «Publicar» **sin decir por qué**
  (`t.accountsFirstHint` existe y no se usa); se autocierra a 1,2s.
- `DateTimePicker`: hora con dos `<input type="number">`; en mobile
  `type="time"` sería nativo.

### 5.4 Consistencia visual

- Dos sistemas de tokens (`@theme` y `:root`) y **cero uso** de las clases
  Tailwind de color. `--muted` cambia según cómo se llegó al tema oscuro
  (`ThemeProvider` solo setea `data-theme` si hay `localStorage`).
- Colores ad hoc: `#ff6b6b` ×50, `#000` ×60, `#fff` ×38, `#ff4b4b`,
  `#f87171`, `#4caf50`, `#60a5fa`, `#4fc3f7`, `#ffb74d`. No existen
  `--danger/--warning/--success/--info/--on-accent`. `STATUS_COLORS` da
  colores distintos al mismo estado (`scheduled` naranja en create/calendar,
  azul en home).
- **Texto sobre el acento** en 4 variantes: `#000`, `var(--bg)` (en tema
  claro = beige sobre lima), `#0A0A0C`, y **`#fff`** en los badges de idioma y
  de no leídos (1,3:1).
- `var(--font-geist-sans)` **no existe** (`strategy/page.tsx:372`);
  `'Syne, sans-serif'` literal; `.dashboard-main button { font-family: Syne
  !important }`.
- Duplicados: `Field` ×4, `SectionCard` ×3, `ArrayChips` ×3, `inputStyle`
  ×12, tab-layout ×3, `NAV_LABELS` ×2, iconos de formato ×6, **cuatro
  implementaciones de modal**, botón primario en 4 variantes.
- **i18n**: 36 archivos con diccionarios inline y ~130 ternarios
  `lang === 'en' ? … : …`. Español sin traducir en `Sidebar`, `UserAvatar`,
  `Modal` (aria-label), `create`, `calendar`, `BrandKitWizard`, `leads`;
  inglés para usuarios ES en `ScheduleModal` («Error scheduling»),
  `conversations` («Reply...»), `create` («Loading…»).

### 5.5 Accesibilidad

- 0 `htmlFor` en 12 de los 16 archivos con inputs; selects y search sin
  nombre accesible.
- `Modal.tsx` sin `aria-labelledby`, focus trap ni devolución de foco (el
  `AssistantWidget` sí lo hace: copiarlo). `ScheduleModal` no es `<form>`.
- `outline: 'none'` en los 12 `inputStyle` sin `:focus-visible`.
- Tarjetas, celdas de calendario y filas de leads son `<div onClick>`: no
  operables por teclado. Tabs sin `role=tablist`; navs sin `aria-current`.
- `--muted` 3,3–3,6:1 es el color de casi todo el texto de 10–13px.
- «Guardado»/errores sin `role="status"/"alert"`; emojis-icono sin
  `aria-hidden`.

### 5.6 Cuenta nueva

1. Modal «Bienvenido» con 3 pasos informativos y un botón que solo cierra; se
   reabre en cada visita mientras `isNewAccount`.
2. Wizard de 20 pasos incrustado + panel de redes + acciones rápidas, todo a
   la vez. En cuanto una de las tres condiciones de `isNewAccount` cambia
   (p. ej. crea un post sin brand kit), **el wizard desaparece del home y no
   se puede retomar**.
3. Estado intermedio: `SocialConnectionPanel`, la tarjeta «Conecta redes → Ir
   a Ajustes» y la quick action «Completa tu identidad» aparecen a la vez:
   tres CTAs para lo mismo hacia sitios distintos.
4. El aviso de plan (trial, créditos, **pago fallido**) es lo **último** de la
   página: en mobile 3 pantallas abajo.
5. Hacer clic en un día vacío del calendario abre directamente el modal de
   programar.

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

## 7. Roadmap

Ordenado por retorno: primero lo que rompe o miente (barato), después lo que
convierte, después lo que escala. Cada ítem lleva esfuerzo aproximado en días
de una persona.

### Sprint 0 — Parar la sangría (1–2 días, todo P0)

| # | Cambio | Archivos | Días |
|---|---|---|---|
| 0.1 | Quitar el desborde de 297px: `overflow: hidden` en `.hero` (o `overflow-x: clip` en `html`) y limitar el blur a `width: min(984px, 100vw)` | `globals.css:262`, `Hero.tsx:72-86` | 0,1 |
| 0.2 | Arreglar los dos enlaces rotos del dashboard | `ScheduleModal.tsx:339`, `calendar/page.tsx:193` | 0,1 |
| 0.3 | Arreglar anclas del nav/footer fuera de la home (`/${lang}#how`) y el selector de idioma (mismo path, otro lang; `<Link>` sin `<button>` alrededor) | `Nav.tsx`, `Footer.tsx` | 0,3 |
| 0.4 | JSON-LD con precio real y meta description sin «ads»; `<title>` propio en login/register/forgot/reset | `page.tsx:52-55`, `common.ts`, auth pages | 0,2 |
| 0.5 | Quitar de precios lo que no existe: toggle anual, Ads, white-label, «Multiplicador», «Email», analytics básico/completo, migración gratuita; «Hablar con ventas» → `mailto:`/Calendly. Unificar 11 redes. Añadir a `parity.test.ts` una lista de promesas prohibidas (como ya hace con formatos) | `locales/*/landing.ts`, `tests/unit/locales/parity.test.ts` | 0,5 |
| 0.6 | Regla global `font-size: 16px` en inputs a <768px (dashboard y auth) + `:focus-visible` global | `globals.css` | 0,1 |
| 0.7 | `viewportFit: 'cover'` + `env(safe-area-inset-top)` en los pills fijos | `app/layout.tsx`, `MobileBrandSwitcher`, `UserAvatar`, `globals.css:109` | 0,2 |
| 0.8 | Escala de z-index: nav 100 < overlays 1000; subir onboarding, conversación y leads | `page.tsx:351`, `conversations:853`, `leads:80,278` | 0,1 |
| 0.9 | Bajar `body::before` (ruido) a `z-index: 0` y desactivarlo en mobile | `globals.css:75-86` | 0,1 |

### Sprint 1 — Landing mobile y rendimiento (3–4 días, P1)

1. **Hero**: formulario en columna a <640px (input 100% + botón 100%); demo
   con una sola columna en mobile mostrando la columna 3 (inbox/pipeline) y
   pausando el ciclo fuera del viewport (`IntersectionObserver` +
   `visibilitychange`); botones de paso ≥44px; texto mínimo 12px.
2. **Vídeo**: extraer `components/ui/VideoBackdrop.tsx` (una sola copia),
   `poster` estático, `preload="none"`, no montar si
   `matchMedia('(prefers-reduced-motion: reduce)')` o `(max-width: 767px)`.
   Landing y las 4 páginas de auth.
3. **Animaciones**: `prefers-reduced-motion` global (`*, ::before, ::after {
   animation-duration: 0.01ms !important }` fuera de `.reveal`); quitar
   `will-change` de `.reveal` (dejar que el navegador decida); borrar el
   `pulseDot` duplicado; `scroll-behavior: smooth` solo con `no-preference`.
4. **Grids**: `.cmp-simple` a 1 columna <640; `.step-num` a 48px en mobile;
   `.pricing-cmp-scroll` con sombra/indicador de scroll o formato de tarjetas
   por plan.
5. **CTA persistente en mobile**: botón «Crear cuenta» compacto siempre
   visible en el nav (no solo en el burger) o barra inferior sticky tras el
   hero.
6. **Touch targets** ≥44px en nav, footer, tabs del demo, `.btn-sm`.
7. **Tipografía**: `--muted` a ≥4,5:1 (p. ej. `#8A8A96` en oscuro), un solo
   valor en `:root` y `[data-theme]`; quitar JetBrains Mono si solo sirve
   para notas de 12px.

### Sprint 2 — Mensaje y estructura de la landing (3–5 días, P1, con el fundador)

1. **Una promesa, un CTA**: elegir entre «sin que hagas nada» (autopilot) y
   «Kefy propone, tú apruebas en un toque». Un solo texto de CTA en nav,
   hero, precios y final. La nota «30 días gratis · Sin tarjeta · Cancela
   cuando quieras» siempre debajo.
2. **Recortar de 14 a ~8 secciones**: Hero (demo) → Problema → Cómo funciona
   (3 pasos, no 5) → Tu marca → Autopilot → Canales + prueba (11 redes, 4
   formatos, 2 idiomas, 30 días) → Precios → CTA final. Eliminar
   «Sin/Con Kefy», la banda de banderas y «Métricas/ads» hasta que ads tenga
   UI. Objetivo: <8.000px en mobile.
3. **Copy**: quitar el scoring en puntos del «Cómo funciona»; rellenar o
   eliminar los `d` vacíos; traducir «active/Applied/Content calendar/
   Engagement trend»; arreglar «trazo.» vs HiClothes; `hero.stats` fuera.
4. **Precios**: una sola fuente de verdad (`PricingSection` con `compact`
   prop en lugar de dos componentes); un slug por idioma con redirect.
5. **Borrar código muerto**: `MultSection`, `StrategySection`,
   `FeaturesGrid`, `AutoEngageSection`, `LandingClient`, `BendsSection`,
   `ColorBends` + `three`/`@types/three`, copy `mult/strategy/engage/features`
   (actualizar `parity.test.ts` y `types/locales.ts`), locales `home/ads/
   analytics` del dashboard.

### Sprint 3 — Auth y onboarding (5–7 días, P0 de producto)

1. **Localizar auth**: `locales/*/auth.ts` (login, register, forgot, reset,
   banners, footer) y mapear los errores del API de register como hace
   `resolveLoginError`. Test de paridad. `AuthShell` compartido (logo,
   fondo, footer) para eliminar las 4 copias.
2. **Formulario**: toggle de contraseña, reglas en vivo, `inputMode`,
   `autoCapitalize`, `autoComplete="organization"`, `autoFocus`,
   `role="alert"`, spinner en el botón, `100dvh`; ante 409 ofrecer «Inicia
   sesión / Recupera tu contraseña».
3. **Cumplir «Ver cómo quedaría mi negocio»**: tras registro, un paso «pega
   tu web o describe tu negocio en una frase» que usa el enriquecimiento del
   Brand Kit y `/api/brand-kit/ai-suggest` para mostrar **3 posts de
   ejemplo** en <60s, con «Conectar Instagram para publicar este». El resto
   del wizard pasa a «Completa tu marca» opcional en Mi marca, agrupado en
   ~5 pantallas con «Terminar más tarde».
4. **Checklist de bienvenida real**: sustituir el modal por una tarjeta con
   estado (Marca ✓ / Redes / Primer post) persistida por usuario, en el
   mismo orden que la página; `planNotice` arriba; un solo CTA por estado.
5. **Invitaciones**: `register` y `login` respetan `?next=`; registrarse
   desde una invitación no crea organización propia; alias `/invitation`.
6. Reset: validar token al cargar; enlace a forgot en el error.

### Sprint 4 — Dashboard mobile (7–10 días, P1)

1. **Layout base**: clase `.page` con `padding: 40px 48px` / `20px 16px`
   en mobile aplicada a las 13 páginas; `SectionTabs` compartido (scroll
   horizontal, `role=tablist`, `aria-current`) en lugar de los 3 layouts.
2. **`Modal.tsx` único**: `100dvh`, bottom-sheet en mobile, safe-area, focus
   trap, `aria-labelledby`, cierre 44px, Escape; migrar los 4 modales ad hoc.
3. **Grids responsive**: `repeat(auto-fit, minmax(140px, 1fr))` en métricas,
   planes, colores, plataformas; calendario con vista agenda en mobile.
4. **Conversaciones master-detail** (lista a ancho completo → hilo con
   «volver»), sin `100vh`. **Leads**: panel como bottom-sheet, tabla con
   `overflow-x: auto` o tarjetas.
5. **BottomNav**: mismos nombres que el sidebar («Inbox», «Automatizar»),
   badge de no leídos (extraer el polling a `useUnreadCount`), Ajustes
   accesible.
6. **Crear contenido**: formulario abierto cuando no hay contenido, un solo
   lugar de feedback, «Publicar» como siguiente paso explícito tras generar,
   `t.errorGenerate`, `Modal` en vez de `confirm`, header con wrap, fix de
   `carousel/story` en el selector de tipo.
7. **ScheduleModal**: explicar por qué «Publicar» está deshabilitado
   (`t.accountsFirstHint`), no autocerrar, reel a altura acotada,
   `type="time"`.
8. **Touch targets** (ContentActions 36–40px, slides 36px, idioma/tema ≥32px)
   y estados `:active` para los 9 archivos con `onMouseEnter`.

### Sprint 5 — Sistema de diseño y deuda (continuo)

1. Tokens semánticos (`--danger/--warning/--success/--info/--accent-soft/
   --on-accent`) y reemplazo de los ~250 hex ad hoc; un solo `STATUS_COLORS`.
2. Componentes compartidos: `Field` (con `useId`/`htmlFor`), `Button`,
   `EmptyState`, `Skeleton`, `SectionCard`, `ArrayChips`, set de iconos SVG.
3. i18n del dashboard a `locales/` con test de paridad; eliminar los ~130
   ternarios.
4. Tema claro: `prefers-color-scheme` como default, `theme-color` dinámico,
   revisar acento como texto.
5. Tests: Playwright mobile (390px) que falle si `scrollWidth > innerWidth`
   en landing, precios, login, register y las 11 pantallas del dashboard;
   axe en las mismas rutas.

### Métricas para saber si funcionó

| Métrica | Hoy | Objetivo |
|---|---|---|
| Ancho del documento a 390px (landing) | 687px | 390px |
| Alto de la landing en mobile | ~16.000px | <8.000px |
| Interacciones hasta el primer post generado | ≥25 | ≤5 |
| Elementos interactivos <44px en landing | 31/34 | <5 |
| Inputs <16px | 100% | 0 |
| Animaciones simultáneas en landing | 33 | <10 (0 con reduced-motion) |
| Pantallas de auth traducidas | 1/5 | 5/5 |
| Promesas de precios sin flujo detrás | 8 | 0 |

## 8. Evidencia

Capturas y mediciones del render (fuera del repo, en el scratchpad de la
sesión): `es-mobile390fixed-viewport-top.png` (nav y hero a 390px),
`es-mobile-section-compare.png` (tarjeta cortada), `es-login-mobile-*.png`,
`es-precios-mobile390fixed-*.png`, `measurements.json`, `overflow.json`.
Para reproducir: `npm run dev` y el script `capture.js` de la sección
«Método».
