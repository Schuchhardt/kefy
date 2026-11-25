# Landings por rubro y las dos ofertas

Cada rubro al que se le escribe en frío tiene su página, y la home presenta las
dos formas de trabajar con Kefy. Este documento explica por qué, cómo está
armado y qué no se puede romper.

## Por qué

Los correos SDR (desde `email@kefy.app`, ver `docs/admin-mcp.md` § ventas) se
segmentan por rubro con `utm_campaign=sdr_<rubro>` y venden sobre todo el
**servicio gestionado**: «nos encargamos de tus redes: publicamos todas las
semanas, llevamos los anuncios y respondemos las consultas, también de noche».
Todos enlazaban a la home, que solo vendía la **plataforma** («Probar gratis»).
Quien llegaba desde el correo no encontraba lo que se le había ofrecido, ni su
rubro, ni el precio.

| Rubro (id = campaña) | Página en español | Página en inglés | Oferta principal |
|---|---|---|---|
| `dental` | `/es/para/clinicas-dentales` | `/en/for/dental-clinics` | servicio |
| `estetica` | `/es/para/clinicas-esteticas` | `/en/for/aesthetic-clinics` | servicio |
| `fitness` | `/es/para/estudios-de-pilates-yoga-y-fitness` | `/en/for/pilates-yoga-and-fitness-studios` | servicio |
| `academias` | `/es/para/institutos-y-academias` | `/en/for/schools-and-academies` | servicio |
| `turismo` | `/es/para/alojamientos-turisticos` | `/en/for/vacation-rentals-and-lodges` | servicio |
| `hogar` | `/es/para/proyectos-para-el-hogar` | `/en/for/home-improvement` | servicio |
| `agencias` | `/es/para/agencias-de-marketing` | `/en/for/marketing-agencies` | plataforma (Pro / Business) |

## Las dos ofertas

| | Servicio («lo hacemos nosotros») | Plataforma («lo haces tú») |
|---|---|---|
| Precio | `MANAGED_SERVICE_PRICE_USD` (USD 200/mes) | `PLAN_PRICES_USD` (desde USD 49/mes) |
| Dónde se cobra | Fuera de la app | Stripe |
| CTA | WhatsApp con el primer mensaje escrito (`whatsappHref`, `lib/contact.ts`) | Registro (`/{lang}/access`) |
| Anuncios | Sí: los lleva el equipo | **No**: no hay UI de anuncios |

`OffersSection` las pinta lado a lado: en la home la plataforma va primero; en
los rubros de servicio, el servicio; en agencias muestra Pro y Business con los
topes de `lib/plans.ts`.

El número de WhatsApp es el de la firma de los correos. Se cambia con
`NEXT_PUBLIC_SALES_WHATSAPP` (solo dígitos, con código de país).

## Cómo está armado

- **`lib/niches.ts`**: ids, slugs por idioma, oferta principal y rutas. Sin
  dependencias: lo importa el proxy.
- **`locales/{es,en}/niches.ts`**: toda la copy (rubros, ofertas, FAQ comunes).
  Las respuestas con precio son funciones que reciben los números de
  `lib/plans.ts`.
- **Rutas**: `app/[lang]/para/[niche]` y `app/[lang]/for/[niche]`, las dos con
  `components/landing/niche-route.tsx`. Un slug por idioma, como precios:
  cualquier combinación que no sea la canónica (`/en/para/clinicas-dentales`,
  `/es/para/dental-clinics`) redirige a la buena; un slug que no existe da 404.
- **Página**: `components/landing/NicheLanding.tsx`. Siete secciones: hero →
  lo que pasa hoy → qué hacemos → ideas de publicaciones → precios → FAQ →
  CTA final. Sin vídeo ni demo animada: se llega desde el móvil. Lleva JSON-LD
  (`BreadcrumbList`, `Service` u `SoftwareApplication`, `FAQPage`).
- **Imágenes** (Higgsfield, `gpt_image_2_6`, calidad alta, 2k; 2 créditos cada
  una): fotos editoriales ilustrativas, sin texto ni logos (no son clientes ni
  casos), en tonos bajos que encajan en la landing oscura y con un acento verde
  lima. Por rubro, dos: la del hero (también en la tarjeta de la home y, en
  1200×630, al compartir el enlace) y la de la sección de ideas. Además, una por
  oferta en las tarjetas de «Dos formas» (plataforma: dueña de una panadería
  aprobando una publicación; servicio: community manager respondiendo de
  noche). `scripts/optimize-niche-images.mjs` las deja en `public/landing/`;
  los PNG originales no se suben. Los textos alternativos están en
  `niches.<id>.image` y `offers.<oferta>.imageAlt`: si cambias una imagen,
  revisa que sigan describiéndola.
- **Migas de pan**: cada rubro enlaza arriba a la home y a la lista de rubros
  (`/#niches`), y declara las mismas migas en JSON-LD.
- **FAQ**: abre con dos preguntas como se las harían a un buscador (`aeo.what`,
  `aeo.post`), respondidas con lo que ya dice la página («qué hacemos» e
  «ideas»). Ver `docs/seo-aeo.md`.
- **Correos ya enviados**: `proxy.ts` redirige la home con
  `utm_campaign=sdr_<rubro>` a la página del rubro, en un salto y con los utm
  (`nicheRedirectPath`). Solo desde `/`, `/es` y `/en`.
- **Enlaces internos**: la home tiene «Hecho para tu rubro» (`NicheGrid`) y el
  pie de todas las páginas lista los rubros. Están en `app/sitemap.ts`.
- El selector de idioma traduce segmento y slug (`switchLocalePath`).

## Reglas

1. **La copy sale del correo.** Lo que el correo de un rubro promete (consultas
   fuera de horario, promociones que vencen, reserva directa, matrícula…) es lo
   que la persona tiene que ver al llegar. Si cambia la secuencia de un rubro,
   revisa su página.
2. **La plataforma no promete anuncios** ni nada de la lista de
   `tests/unit/helpers/landing-promises.ts`. El servicio sí incluye anuncios
   porque los lleva el equipo.
3. **Precios solo desde `lib/plans.ts`.** Los USD escritos a mano (las
   descripciones para Google) tienen que coincidir: lo comprueba el test.
4. **El id es la campaña.** Cambiar un id de `NICHE_IDS` rompe la redirección de
   los correos ya enviados con `sdr_<id>`.

## Añadir un rubro

1. Añadir el id (el sufijo de su campaña SDR), su slug en los dos idiomas y su
   oferta en `lib/niches.ts`.
2. Añadir su copy en `locales/es/niches.ts` y `locales/en/niches.ts` (el tipo
   `Record<NicheId, NicheCopy>` obliga): 3 dolores, 3 «qué hacemos», 6 ideas,
   2 preguntas propias, mensaje de WhatsApp y texto alternativo de la imagen.
3. Generar sus dos imágenes (`<id>.png` para el hero e `<id>-ideas.png` para
   las ideas; mismo estilo: foto editorial, tonos bajos, un acento verde lima,
   sin texto ni logos) y pasarlas por
   `node scripts/optimize-niche-images.mjs <carpeta>`. Escribir sus textos
   alternativos y las dos preguntas `aeo`.
4. Enlazar los correos nuevos de ese rubro directo a su página.
5. `npx vitest run tests/unit/lib/niches.test.ts tests/unit/locales tests/unit/proxy.test.ts`.

## Tests

- `tests/unit/lib/niches.test.ts`: rutas, campañas, selector de idioma,
  imágenes en `public/`, WhatsApp, copy completa, largo de título y descripción, promesas prohibidas,
  precios y números de agencias.
- `tests/unit/proxy.test.ts`: redirección de los correos.
- `tests/e2e/mobile-a11y.spec.ts`: sin scroll horizontal a 390 y 320px y axe
  en `/es/para/clinicas-dentales` y `/en/for/marketing-agencies`.

## Pendiente

- Los términos del servicio que la página afirma salen de los correos (precio,
  publicaciones semanales, anuncios, respuestas también de noche y fines de
  semana, revisión inicial sin costo). Que **el presupuesto de los anuncios lo
  decide el cliente** y que **lo clínico se deriva al equipo** del cliente son
  supuestos razonables a confirmar con el fundador.
- No hay testimonios ni casos por rubro: no se publican hasta tener clientes
  con permiso para citarlos (ver `Testimonials.tsx`).
