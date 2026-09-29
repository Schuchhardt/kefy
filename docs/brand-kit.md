# Brand Kit

El perfil de cada marca: identidad, voz, identidad visual y mercado. Kefy lo usa
en todo lo que genera (el nombre, el eslogan, el tono y la industria entran en
cada prompt de texto; colores, tipografías y logo en imágenes, carruseles y
reels).

## Datos

- Tabla `kefy_brand_kits`: **una fila por marca** (`brand_id`), no por
  organización. Leerla siempre con `getBrandKitForBrand(db, brandId)`
  (`lib/services/brand-kit.ts`): un `.eq('org_id').maybeSingle()` falla en
  cuanto la organización tiene más de una marca y deja la generación sin
  contexto.
- La base pone valores por defecto: `name = 'Mi marca'`, `language = 'es'`,
  `uses_emojis = false`, listas vacías. Por eso «rellenado» no es «no nulo»
  (ver `lib/brand-setup.ts`).
- Colores con CHECK `^#[0-9A-Fa-f]{6}$`: un `rgb(…)` hace fallar el UPDATE
  entero. Validar antes con `validateBrandKitUpdate` (`lib/brand-kit.ts`).

## Código

| Archivo | Qué hace |
|---|---|
| `lib/brand-kit.ts` | `validateBrandKitUpdate`, `normalizeWebsiteUrl`, validación de subidas |
| `lib/services/brand-kit.ts` | `getOrCreateBrandKit`, `updateBrandKit` (PATCH parcial; `name` se copia siempre a `kefy_brands`; `syncOrg` renombra la organización solo si tiene una marca), `brandPromptContext` |
| `lib/services/brand-enrich.ts` | Leer la web con Firecrawl (`enrichBrandFromUrl`, **1 crédito**, se devuelve si falla), `fillEmptyFields` (solo rellena campos vacíos y descarta valores inválidos), `importBrandFromWebsite` |
| `lib/brand-setup.ts` | Las 5 pantallas de «Completa tu marca» (`BRAND_SETUP_GROUPS`) y `brandCompleteness` (qué falta), sin dependencias de servidor |
| `app/api/brand-kit/route.ts` | `GET` / `PATCH` (`?syncOrg=1`). Solo dueño y administradores escriben |
| `app/api/brand-kit/enrich-url` | Adapta `enrichBrandFromUrl` a HTTP |
| `app/api/brand-kit/ai-suggest` | Sugerencias por campo (1 crédito, `guardAiRequest`) |
| `app/api/brand-kit/assets` | Subida de logo y otros recursos |
| `lib/assistant/tools/brand.ts` | `get_brand_profile`, `update_brand_profile`, `import_brand_from_website` |

## Pantallas

- **Mi marca** (`app/[lang]/dashboard/brand/…`): Identidad y Mercado editan el
  kit con barra de guardado (solo se envía lo que cambió); Estrategia es
  aparte. Mientras falten datos clave, el layout muestra «Tu marca está al
  N %» con enlace al wizard.
- **Completa tu marca** (`/{lang}/dashboard/brand/setup`,
  `components/dashboard/BrandKitWizard.tsx`): 5 pantallas (tu negocio, tu voz,
  tu imagen, tu público, tu diferencia), retoma en la primera incompleta,
  «Terminar más tarde» guarda y sale.
- **Onboarding** (`/{lang}/onboarding`): pega tu web o describe tu negocio →
  rellena lo vacío del kit y escribe 3 posts (`lib/services/onboarding.ts`).
- **Home**: «Primeros pasos» muestra el paso «Completa tu marca» con el
  porcentaje de `brandCompleteness`.

## Reglas

- **Nunca pisar lo que la persona escribió** con datos automáticos: lo que
  viene de la web pasa por `fillEmptyFields` (onboarding, asistente) o se
  enseña para confirmar antes de aplicarlo (wizard).
- **Nada de IA sin avisar el coste.** Las sugerencias y la lectura de la web
  van detrás de un botón que dice «1 crédito»; antes el wizard pedía
  sugerencias solo al entrar en cada paso.
- El texto del kit lo escribe la persona o sale de su web: el asistente lo
  envuelve como `<untrusted_content>` (datos, no instrucciones), y
  `import_brand_from_website` marca el turno como contaminado.
