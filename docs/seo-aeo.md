# SEO y AEO de las páginas públicas

SEO: que Google y Bing entiendan e indexen bien cada página. AEO (*answer
engine optimization*): que los motores de respuesta con IA (ChatGPT,
Perplexity, Claude, Gemini, los resúmenes con IA de Google) entiendan qué es
Kefy, a quién sirve y cuánto cuesta, y lo citen. Las dos cosas piden lo mismo:
HTML legible sin JavaScript, una página por intención, respuestas directas y
datos estructurados que digan lo mismo que el texto.

## Lo que se arregló (noviembre 2026)

| Problema | Antes | Ahora |
|---|---|---|
| Idioma del documento | `<html>` sin `lang`; lo ponía `SetLang` con JS en el navegador. Bing y los crawlers de IA no lo veían | `app/[lang]/layout.tsx` es el layout raíz y pinta `<html lang>` en el servidor. `/` tiene su layout mínimo en `app/(root)` |
| Páginas sin metadata | Sobre Kefy, blog, artículos y legales heredaban título y descripción de la home, sin canónica | Todas declaran título, descripción, canónica, hreflang y tarjetas para compartir con `pageMetadata` (`lib/seo.ts`) |
| Artículos del blog | Sin título propio ni datos estructurados | Título y descripción del artículo (extracto), portada al compartir, `BlogPosting` y migas de pan |
| Datos estructurados | Solo en la home y los rubros | En todas las páginas públicas (tabla de abajo) |
| Preguntas frecuentes | Solo en precios y rubros, sin `FAQPage` en precios | FAQ en la home; dos preguntas de buscador al inicio de cada rubro; `FAQPage` en home, precios y rubros |
| Sitemap | Sin precios, artículos ni imágenes; `lastModified` = hora del build | Precios, rubros, blog y artículos, sobre Kefy y legales, con imágenes y la fecha real de revisión |
| Crawlers de IA | Implícitos en `*` | Nombrados en `robots.txt` con las mismas reglas; `/llms.txt` con el resumen del sitio |
| Enlaces internos | Sobre Kefy y legales sin pie | Pie con rubros en todas; migas de pan en cada rubro hacia la home y la lista de rubros |

## Piezas

- **`lib/seo.ts`**: `pageMetadata` (título, descripción, canónica, hreflang,
  Open Graph/X), constructores de JSON-LD (`webPageJsonLd`, `breadcrumbJsonLd`,
  `faqJsonLd`, `graph`) y `serializeJsonLd`, que escapa `<` para que un título
  con `</script>` no rompa la página. `CONTENT_UPDATED` es la fecha de la
  última revisión de la copy: sale en `dateModified`, el sitemap y `llms.txt`.
  **Cámbiala cuando cambie la copy de las landings.**
- **`components/seo/JsonLd.tsx`**: pinta un bloque `application/ld+json`.
- **`locales/{es,en}/seo.ts`**: títulos y descripciones de las páginas, migas
  de pan, la FAQ de la home y los títulos de `llms.txt`.
- **`lib/content.ts`**: `homeFaq(lang)` y `nicheFaq(lang, id)` resuelven las
  respuestas con los precios de `lib/plans.ts`, las redes de la landing y los
  rubros. Lo que se ve en la página y lo que va al JSON-LD sale de ahí: no
  pueden diferir (Google exige que la FAQ marcada sea visible).
- **`components/landing/FaqList.tsx`**: FAQ en acordeón (`<details>`). No
  alarga la página en móvil y las respuestas siguen en el HTML.
- **`lib/llms.ts` y `app/llms.txt/route.ts`**: `/llms.txt`, el resumen del sitio
  para asistentes (ofertas con precios, páginas por rubro, FAQ, en español y en
  inglés), armado con la misma copy.
- **`app/robots.ts`**: todo lo público se rastrea; los crawlers de IA se nombran
  (`AI_CRAWLERS`) porque un grupo propio no hereda las reglas de `*`. Fuera: API,
  demos y dashboard. Las pantallas de auth no se bloquean: llevan `noindex`
  (`lib/auth-metadata.ts`) y un crawler bloqueado no lo leería.
- **`app/sitemap.ts`**: se regenera cada hora para incluir artículos nuevos.

## Datos estructurados por página

| Página | Nodos |
|---|---|
| Home | `Organization`, `WebSite`, `WebPage`, `SoftwareApplication` (planes), `Service` (servicio gestionado), `ItemList` (rubros), `FAQPage` |
| Rubro | `WebPage` (audiencia, imagen, fecha), `BreadcrumbList`, `Service` o `SoftwareApplication` (agencias), `FAQPage` |
| Precios | `WebPage`, `BreadcrumbList`, `SoftwareApplication` con los tres planes, `FAQPage` |
| Sobre Kefy | `AboutPage`, `BreadcrumbList` |
| Blog | `Blog` con sus artículos, `BreadcrumbList` |
| Artículo | `BlogPosting`, `BreadcrumbList` |
| Legales | `WebPage`, `BreadcrumbList` |

## Reglas para el contenido (AEO)

1. **Respuesta primero.** Cada pregunta frecuente responde en la primera frase;
   el detalle va después. Las preguntas se escriben como se las haría alguien a
   un buscador («¿Qué publicar en las redes de una clínica dental?»).
2. **Lo marcado tiene que verse.** Solo van al `FAQPage` preguntas que están en
   la página.
3. **Mismos números en todos lados.** Precios desde `lib/plans.ts`, redes desde
   la lista de canales. `tests/unit/lib/seo.test.ts` comprueba que todo «USD n»
   de la FAQ y de `llms.txt` sea un precio real.
4. **La plataforma no promete anuncios** (no tienen UI). Solo la respuesta del
   servicio gestionado (`service: true`) los nombra.
5. **Una página por intención**, con su canónica. Los artículos del blog no
   declaran hreflang: cada idioma tiene sus propios artículos.

## Añadir una página pública

1. Título y descripción en `locales/{es,en}/seo.ts` (`pages`).
2. `generateMetadata` con `pageMetadata(lang, { title, description, path })`.
3. `<JsonLd data={graph(webPageJsonLd(...), breadcrumbJsonLd(...))} />`.
4. Añadirla a `app/sitemap.ts` y, si es importante, a `lib/llms.ts`.
5. Añadirla a `tests/e2e/seo.spec.ts` (lang, canónica, hreflang, JSON-LD) y a
   `tests/e2e/mobile-a11y.spec.ts`.

## Tests

- `tests/unit/lib/seo.test.ts`: helpers, FAQ de home y rubros (precios,
  promesas, preguntas terminadas en «?» y sin repetir), `llms.txt`, robots y
  sitemap.
- `tests/e2e/seo.spec.ts`: pide el HTML sin navegador, como un crawler, y
  comprueba `<html lang>`, título único, canónica, hreflang, descripción y los
  tipos de JSON-LD de cada página; `llms.txt`, `robots.txt` y `sitemap.xml`.

## Pendiente

- Las páginas Sobre Kefy y legales tienen su copy dentro del componente (no en
  `locales/`), como antes; la metadata nueva sí está en `locales/*/seo.ts`.
- Los artículos del blog no guardan fecha de modificación: `dateModified` usa la
  de publicación.
- Verificar el sitio en Google Search Console y Bing Webmaster Tools y enviar el
  sitemap (no se puede desde el código).
