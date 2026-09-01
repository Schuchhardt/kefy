# Formatos de contenido: conversiones, texto en la imagen y zonas seguras

Una pieza de contenido se puede publicar como **post**, **carrusel**, **reel** o
**story**. El formato con el que se creó vive en las columnas del propio ítem
(`kefy_content_items`); los demás se generan a demanda y se guardan en
`kefy_content_renditions`.

Este documento cubre tres decisiones que están acopladas entre sí y que es fácil
romper por separado.

---

## 1. Toda conversión parte de la pieza original

> **Regla:** convertir un formato en otro es *adaptar* la pieza existente, nunca
> escribir una nueva sobre un tema parecido.

`POST /api/content/[itemId]/renditions` construye el contexto de origen con
[`buildSourceContext()`](../lib/content-source.ts) y se lo pasa a los
generadores en `opts.source`:

| Campo | De dónde sale | Para qué |
|-------|---------------|----------|
| `body` | cuerpo **completo** del ítem | que el texto nuevo diga lo mismo |
| `title` | título del ítem | encabezar la adaptación |
| `slideTexts` | título + cuerpo de cada slide/escena | conservar la estructura del original |
| `hashtags` | hashtags del ítem | mantener el encuadre |
| `imageUrls` | portada + imágenes de slides (máx. 3) | continuidad visual |

`buildSourceBlock()` convierte eso en un bloque que se **antepone** al system
prompt (`withSourceBlock`). Va delante y fuera de las plantillas de `prompts/`
a propósito: si viviera dentro de un `.prompt.md`, editar la plantilla lo
perdería sin que nada fallara.

Las imágenes viajan además como `referenceImages` a `generateContentImage()`,
que las manda por `images.edit` en vez de `images.generate`.

### Qué pasaba antes

El endpoint pasaba sólo `topic = (title || body).slice(0, 500)` y generaba cada
imagen desde cero. El modelo lo leía como «escribe algo sobre esto» y devolvía
una pieza distinta, con fotos sin ninguna relación con el original.

> Cubierto por `tests/unit/api/content-renditions.test.ts`, que recorre **todas**
> las combinaciones de origen y destino, no sólo post→carrusel.

---

## 2. El texto se quema al publicar, no al generar

Las redes no dibujan texto propio sobre cada slide de un carrusel: lo único que
viaja es la imagen. Aun así, el texto **no** se escribe sobre los píxeles en el
momento de generar.

| Momento | Qué pasa |
|---------|----------|
| Generación | La imagen se guarda **limpia**. El slide lleva `text_baked: false`. |
| Vista previa | El título/cuerpo se dibujan como **overlay HTML** sobre la imagen. |
| Publicación | `lib/publish-images.ts` recorta para la red y **entonces** compone el texto. |

Razones: al generar todavía no se sabe a qué red va (y cada una tapa una zona
distinta), el texto quemado no se puede editar ni corregir, y en la app se veía
**dos veces** — los píxeles más el overlay del preview.

### `text_baked`

| Valor | Significado |
|-------|-------------|
| `false` | Imagen limpia. Preview con overlay; se compone al publicar. |
| `true` | Los píxeles ya llevan el texto. |
| ausente | Pieza anterior a este cambio: **se trata como quemada**, para no escribir el texto encima del que ya tiene. |

Esa última fila es la que evita destrozar los carruseles antiguos. Está en
`needsTextBake()` y cubierta por `tests/unit/lib/publish-images.test.ts`.

---

## 3. Tipografía: la de la marca, y por qué salían cuadraditos

### El bug

`sharp` compone el texto vía librsvg/pango, que resuelve las familias
tipográficas con **fontconfig**. En el runtime de Vercel no hay ninguna fuente
instalada: pedir `Arial, Helvetica, sans-serif` no resolvía a nada y cada
carácter se dibujaba con el glifo `.notdef` — un rectángulo vacío. Sin errores,
sin logs, sin nada.

### Qué fuente se usa

**La que la marca eligió en su Brand Kit**: `font_heading` para los titulares y
`font_body` para el cuerpo. Son Google Fonts del catálogo de
[`lib/google-fonts.ts`](../lib/google-fonts.ts) — el mismo que alimenta el
selector, para que servidor y cliente no puedan divergir.

| Situación | Qué pasa |
|-----------|----------|
| La marca eligió una del catálogo | Se descarga el TTF de Google Fonts y se escribe con ella |
| No eligió ninguna | **Inter**, que viaja en `assets/fonts/` (no toca la red) |
| Eligió una fuera del catálogo | Inter. `font_heading` también lo rellena `/api/brand-kit/enrich-url` leyendo la web de la marca, y puede traer una fuente de pago, una local o basura |
| Sin red / Google caído | Inter |
| Sin `font_body` | Se repite la de titulares: mezclarla con otra cualquiera se ve peor que repetirla |

> **Se pide TTF, no woff2.** La API de Google devuelve woff2 a los navegadores
> modernos y **fontconfig no sabe leer woff2**. Con un `User-Agent` antiguo la
> misma URL responde con TTF y sin partir la fuente por rangos unicode.

Las descargas se cachean en `/tmp` por lambda. La vista previa carga esa misma
familia en el navegador (`ensureGoogleFontLoaded`) y la aplica con
`brandFontStack()`, así que lo que se ve en pantalla es lo que se publica.

[`lib/fonts.ts`](../lib/fonts.ts) escribe un `fonts.conf` en `/tmp` —con el
directorio del repo y el de descargas por delante de los del sistema— y deja
`FONTCONFIG_PATH` apuntando ahí antes de que sharp toque texto.

> **Los `.ttf` se leen del filesystem en runtime**, así que tienen que estar en
> `outputFileTracingIncludes` (`next.config.ts`). El trazado automático de Next
> sólo sigue los `import`. Lo mismo aplica a `prompts/`.

### Salvaguardas

`canRenderFamily(familia)` comprueba que fontconfig resuelva de verdad esa
familia **antes** de escribir con ella, y si no, se cae a Inter. Hace falta
porque fontconfig construye su índice una vez por proceso: una fuente
descargada después de ese momento puede no llegar a verse en esa invocación.

Y `bakeTextIfSupported()` publica la imagen **sin** texto si ni siquiera la
fuente por defecto renderiza. El texto igual viaja en el caption; una foto
limpia siempre es mejor que una con cuadraditos.

Las dos comprobaciones se apoyan en la misma idea: si todo son rectángulos
iguales, dos cadenas del mismo largo dan píxeles idénticos. Una fila de «I» y
una de «W» tienen que salir distintas.

---

## 4. Zonas seguras por red

[`lib/preview-layout.ts`](../lib/preview-layout.ts) es la **única** fuente de
verdad sobre dónde puede caer el texto. La consumen los dos lados:

- la vista previa, vía `safeAreaCss()` (padding del overlay HTML);
- el servidor, vía `safeBoxFor()` dentro de `bakeTextOnImage()`.

Si divergen, lo que el usuario aprueba en pantalla no es lo que se publica.

| Red / formato | Reservado | Por qué |
|---------------|-----------|---------|
| TikTok (cualquier formato) | 22 % derecha, 24 % abajo, 11 % arriba | avatar, corazón, comentarios, compartir, disco de audio; @usuario + descripción + música; buscador y pestañas |
| Story (IG/FB) | 13 % arriba, 17 % abajo | barra de progreso y cabecera; caja de respuesta |
| Reel (IG/FB) | 18 % derecha, 20 % abajo | rail de acciones; caption |
| Feed cuadrado | 5,5 % | sólo margen tipográfico: la red no dibuja nada encima |

`networkFrame()` decide además la forma del marco: reel y story siempre 9:16;
**TikTok también muestra vertical el carrusel de fotos** (la imagen cuadrada se
sube tal cual y la app la encaja), así que el preview lo muestra en 9:16 con
`contain` y la interfaz de TikTok superpuesta.

---

## Archivos

| Archivo | Rol |
|---------|-----|
| `lib/content-source.ts` | Contexto de origen de una conversión (puro) |
| `lib/preview-layout.ts` | Marcos y zonas seguras por red (puro) |
| `lib/google-fonts.ts` | Catálogo de tipografías (compartido cliente/servidor) |
| `lib/fonts.ts` | Descarga de la fuente de la marca + `FONTCONFIG_PATH` |
| `lib/image-processor.ts` | `bakeTextOnImage`, `canRenderBakedText`, recortes |
| `lib/publish-images.ts` | Preparación de imágenes al publicar/programar |
| `app/api/content/[itemId]/renditions/route.ts` | Genera el formato alternativo |
| `components/dashboard/CarouselPreview.tsx` | `SlideCanvas` con el overlay HTML |
| `components/dashboard/NetworkPreview.tsx` | Marco por red, incluido el de TikTok |
| `components/dashboard/content/RenditionGenerating.tsx` | Esqueleto + progreso |
