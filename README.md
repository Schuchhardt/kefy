# Kefy

**Kefy** es una plataforma SaaS de gestión de contenido para redes sociales potenciada con IA. Permite a creadores, agencias y marcas generar posts, carruseles y reels con IA, publicarlos simultáneamente en 15 plataformas sociales, gestionar múltiples marcas con Brand Kit propio y monitorear métricas de engagement, todo desde un dashboard unificado en español e inglés.

## Características principales

### Creación de contenido con IA
- **Posts** — genera captions, hashtags y texto optimizado por plataforma (Claude Opus 4.5 / GPT-4o)
- **Carruseles** — genera 3–10 slides con título, cuerpo e imagen por diapositiva
- **Reels** — crea scripts de video animados con escenas, transiciones y gradientes dinámicos usando Remotion
- **Imágenes** — genera imágenes promocionales adaptadas a la identidad visual de la marca

### Publicación y programación
- **15 plataformas** — Instagram, Facebook, LinkedIn, X/Twitter, TikTok, YouTube, Threads, Reddit, Pinterest, Bluesky, Google Business, Snapchat, Discord, Telegram, WhatsApp (vía Zernio API)
- **Publicación inmediata o programada** — selecciona fecha/hora por plataforma
- **Adaptación automática** — cada borrador se ajusta al formato de cada canal (límites de texto, hashtags, dimensiones de imagen)

### Gestión de marcas y Brand Kit
- **Multi-marca** — hasta 3 marcas en Pro, ilimitadas en Business
- **Brand Kit** — define identidad visual: colores, fuentes, tono de voz, industria y logo
- **Contexto de IA** — la generación usa automáticamente el nombre, tagline y tono de cada marca

### Analytics
- **Métricas consolidadas** — impresiones, alcance, likes, comentarios, compartidos y clics (últimos 30 días)
- **Engagement por post** — tasa de engagement, vistas y guardados
- **Sincronización bajo demanda** — actualización de datos desde cada plataforma social

### Automatizaciones
- Reglas de engagement automático y generación de leads
- Autopilot con ejecución programada vía cron seguro

### Infraestructura
- **Autenticación JWT personalizada** — tokens en cookies HttpOnly (`kefy_access` / `kefy_refresh`)
- **Multi-tenant** — usuarios agrupados por organización (`org_id`) con RLS en Supabase
- **i18n completa** — rutas `/es/` y `/en/` en todas las páginas de usuario y landing

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| UI | React 19 + Tailwind CSS 4 + Three.js |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Auth | JWT custom (`jose` + `bcryptjs`) |
| IA — Texto e imagen | Anthropic Claude Opus 4.5 / OpenAI GPT-4o |
| Redes sociales | Zernio API |
| Video | Remotion (compositor) + Mux (hosting/player) |
| Procesamiento de imágenes | Sharp |
| Pagos | Stripe |
| Emails | Resend + React Email |
| Despliegue | Vercel (cron jobs nativos) |

## Estructura del proyecto

```
app/
  [lang]/               # Rutas internacionalizadas (es / en)
    dashboard/          # Dashboard del usuario
      brand/            # Gestión de marcas
      content/          # Creación y historial de contenido
      automations/      # Reglas de automatización
      conversations/    # Mensajería y comentarios
      settings/         # Configuración de cuenta
    blog/               # Blog con rutas dinámicas por slug
    login/ register/    # Autenticación
    onboarding/         # Flujo de incorporación
  api/
    auth/               # Login, registro, refresh de JWT
    content/            # Generación y CRUD de contenido
    social/             # OAuth, publicación, programación
    analytics/          # Métricas y sincronización
    brand-kit/          # Identidad visual
    brands/             # CRUD de marcas
    automations/        # Engagement y leads
    autopilot/          # Ejecución de autopilot (cron)
    billing/            # Suscripciones Stripe
    ads/ comments/ messaging/ reviews/ strategies/ webhooks/ waitlist/
components/
  dashboard/            # Sidebar, BrandKit, PostPreview, CarouselPreview, ReelPlayer…
  landing/              # Hero, Pricing, Testimonials, ChannelsSection…
  ui/                   # Componentes reutilizables
lib/
  ai.ts                 # Generación de contenido (Claude / GPT-4o)
  zernio.ts             # Cliente Zernio (publicación social)
  auth.ts               # Helpers JWT
  brand-kit.ts          # Lógica de identidad visual
  brands.ts             # Gestión de marcas y límites por plan
  supabase.ts           # Cliente Supabase (server)
  image-processor.ts    # Redimensionamiento por plataforma
  mux.ts                # Integración Mux
  stripe.ts             # Pagos
  i18n.ts               # Configuración de locales
remotion/               # Compositor de reels (ReelComposition, Root)
prompts/                # Prompts de IA (post, carousel, reel, recommend)
locales/
  es/                   # Traducciones español
  en/                   # Traducciones inglés
db/
  migrations/           # SQL con prefijo YYYYMMDDNNNNNN_descripcion.sql
  seeds/                # Datos iniciales
tests/
  unit/                 # Vitest + Testing Library
  e2e/                  # Playwright (Chromium + mobile Safari)
emails/                 # Plantillas React Email
docs/
  zernio.md             # Referencia de la Zernio API (leer antes de tocar lib/zernio.ts)
  i18n.md               # Convenciones de internacionalización
```

## Variables de entorno

Copia `.env.example` como `.env.local` y rellena los valores:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# IA
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
OPENAI_API_KEY=sk-your-openai-key

# Zernio — publicación social
ZERNIO_API_KEY=your-zernio-api-key
ZERNIO_API_URL=https://zernio.com/api/v1
ZERNIO_WEBHOOK_SECRET=your-zernio-webhook-secret  # openssl rand -hex 32

# Stripe
STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-stripe-webhook-secret
STRIPE_PRICE_STARTER=price_starter-id
STRIPE_PRICE_PRO=price_pro-id
STRIPE_PRICE_BUSINESS=price_business-id

# Mux
MUX_TOKEN_ID=your-mux-token-id
MUX_TOKEN_SECRET=your-mux-token-secret

# Resend
RESEND_API_KEY=re_your_resend_api_key
RESEND_FROM_EMAIL=Kefy <no-reply@email.kefy.app>

# Firecrawl (opcional)
FIRECRAWL_API_KEY=your-firecrawl-api-key

# Autopilot cron
AUTOPILOT_CRON_SECRET=your-cron-secret  # openssl rand -hex 32
CRON_SECRET=your-vercel-cron-secret    # openssl rand -hex 32 (Vercel Cron)

# URL pública (para callbacks OAuth; omitir en dev)
NEXT_PUBLIC_APP_URL=https://app.kefy.app
```

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3097
```

## Testing

```bash
# Unit tests (Vitest)
npx vitest

# Unit tests con cobertura
npx vitest --coverage

# E2E tests (Playwright — requiere servidor en :3097)
npx playwright test

# Evaluación de prompts IA
npm run test:prompts
```

## Build y despliegue

```bash
npm run build      # Verifica tipos y genera build de producción
npm start          # Arranca el servidor de producción
```

El despliegue se realiza automáticamente en **Vercel** al hacer push a `main`. Configuración en [`vercel.json`](vercel.json):

- `crons` — invoca `/api/autopilot/run` cada 5 minutos (requiere plan Pro).
- `functions` — `maxDuration` por ruta: render de reels = 300 s, autopilot = 300 s, generación de imágenes = 120 s, reel storyboard = 180 s.

Variables de entorno extra requeridas en Vercel:

- `CRON_SECRET` — secreto que Vercel envía automáticamente como `Authorization: Bearer ...` al invocar los cron jobs. Si no se define, se usa `AUTOPILOT_CRON_SECRET` como fallback.
