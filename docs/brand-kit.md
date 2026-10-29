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
| `lib/services/brand-enrich.ts` | Leer la web con Firecrawl (`enrichBrandFromUrl`, **1 crédito**, se devuelve si falla), `collectWebLogos` / `storeWebLogos` (todos los logos de la web a la biblioteca), `fillEmptyFields` (solo rellena campos vacíos y descarta valores inválidos), `importBrandFromWebsite` |
| `lib/brand-setup.ts` | Las 5 pantallas de «Completa tu marca» (`BRAND_SETUP_GROUPS`) y `brandCompleteness` (qué falta), sin dependencias de servidor |
| `app/api/brand-kit/route.ts` | `GET` / `PATCH` (`?syncOrg=1`). Solo dueño y administradores escriben |
| `app/api/brand-kit/enrich-url` | Adapta `enrichBrandFromUrl` a HTTP (devuelve `extracted` y `logos`, sin guardar) |
| `app/api/brand-kit/assets/import` | Guarda los `logos` de la web al aplicar lo leído (`storeWebLogos`, sin créditos) |
| `app/api/brand-kit/ai-suggest` | Sugerencias por campo (1 crédito, `guardAiRequest`) |
| `app/api/brand-kit/assets` | Subida de logos, íconos y otros recursos (`type: 'auto'` los clasifica); `PATCH [assetId]` corrige la clasificación; `POST [assetId]/icon` recorta un ícono |
| `lib/services/brand-assets.ts` | Biblioteca de la marca: subir, clasificar, reclasificar (`updateBrandAsset`), recortar íconos (`createIconFromAsset`), borrar |
| `lib/brand-logos.ts` | Reglas puras de clasificación y recorte (forma, fondo, recorte propuesto); las usa también el navegador |
| `lib/brand-logo-image.ts` | `analyzeLogo` y `cropIcon` con sharp (solo servidor) |
| `components/dashboard/BrandLogoLibrary.tsx`, `IconCropModal.tsx` | Biblioteca de logos e íconos en Identidad y el recorte |
| `lib/assistant/tools/brand.ts` | `get_brand_profile`, `update_brand_profile`, `import_brand_from_website`, assets (`list_brand_assets`, `add_brand_asset`, `update_brand_asset`, `create_brand_icon`, `delete_brand_asset`) |

## Logos e íconos

Una marca puede tener **varios logos e íconos** (`kefy_brand_assets` con
`type` `logo` o `icon`): horizontal y vertical, versión para fondo claro y
para fondo oscuro, isotipo… `kefy_brand_kits.logo_url` sigue siendo **el logo
principal**, el único que usa hoy la generación (imágenes, carruseles, reels).

- **Clasificación al subir, sin IA ni créditos.** Con `type: 'auto'` (la
  biblioteca de Identidad sube así) `analyzeLogo` mide el archivo con sharp:
  quita el margen (transparente, o del color de las esquinas si es opaco) y
  guarda `variant` (forma del contenido: `horizontal` ≥ 1,4:1, `vertical`,
  `square`), `background` (con transparencia: contenido claro → `dark`,
  oscuro → `light`, medio → `any`; sin transparencia, el fondo del archivo) y
  `width`/`height`. Contenido cuadrado → `icon`; lo demás → `logo`. `logo` e
  `icon` explícitos también se miden; `image`/`other` no. Un archivo ilegible
  queda como `logo` sin clasificar. Es una propuesta: «Editar» /
  `update_brand_asset` la corrige.
- **Ícono desde un logo.** `createIconFromAsset` descarga el original del
  bucket, recorta (`crop` en fracciones 0–1 de la imagen, para no depender de
  la resolución de la pantalla; un SVG se rasteriza a ~2048 px antes) y guarda
  un PNG cuadrado de hasta 1024 px como `icon` con `source_asset_id`. Un
  recorte no cuadrado se rellena: transparente si el logo tiene transparencia,
  con su color de fondo si no. Mínimo 16 px del original. Sin `crop`, el
  propuesto por `suggestIconCrop`: el isotipo a la izquierda de un logo
  horizontal, arriba en uno vertical, el centro en uno cuadrado.
- **El ícono va a la marca del logo**, no a la del contexto: las rutas de
  `[assetId]` trabajan en modo `org` sin marca.
- **El logo principal se elige en el formulario**: «Usar como principal»
  cambia `logo_url` y se aplica al guardar, como la subida de antes. La
  biblioteca (subir, editar, recortar, borrar) se guarda al momento.
- **Los logos de la web también entran.** El branding de Firecrawl trae más
  de una imagen de marca (`logo`, `images.logo`, `images.favicon`, otras
  claves con «logo» o «icon» y el `favicon` de los metadatos).
  `collectWebLogos` las junta sin repetir (solo https, sin `.ico`, que sharp
  no lee, ni `ogImage`) e `importBrandLogos` las descarga (tipos de `logo` de
  media-ingest: SVG incluido, 5 MB) y las guarda con `type: 'auto'` y
  `source_url`. Leer la misma web otra vez no duplica: se devuelve el asset
  que ya tenía esa URL. Si una falla se salta; nunca tumba la lectura.
  El `logo_url` extraído pasa a apuntar a la copia de Kefy. El asistente y el
  onboarding lo hacen al leer la web; Identidad y el wizard muestran las
  miniaturas y las importan al pulsar «Aplicar».

## Pantallas

- **Mi marca** (`app/[lang]/dashboard/brand/…`): Identidad y Mercado editan el
  kit con barra de guardado (solo se envía lo que cambió); Estrategia es
  aparte y también es de cada marca (ver `docs/assistant.md`, *Estrategias
  propias*). Mientras falten datos clave, el layout muestra «Tu marca está al
  N %» con enlace al wizard. Al cambiar de marca, el layout vuelve a montar la
  página (`key` con el id de la marca) para leer los datos de la nueva.
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
