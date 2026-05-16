# Kefy

Landing page de **Kefy** — plataforma de contenido para redes sociales con IA. Gestiona tu presencia en LinkedIn, Meta, X y más desde un solo lugar, en español e inglés.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| 3D | Three.js |
| Base de datos | Supabase (PostgreSQL) |
| Emails | Resend + React Email |
| Despliegue | Netlify |

## Características

- **Internacionalización** — rutas `/es` y `/en` con contenido completo en ambos idiomas
- **Waitlist** — formulario con guardado en Supabase y email de confirmación vía Resend
- **Blog** — artículos guardados en Supabase con rutas dinámicas por slug
- **Landing modular** — secciones independientes: Hero, HowSection, FeaturesGrid, PricingSection, Testimonials, etc.

## Estructura del proyecto

```
app/
  [lang]/           # Rutas internacionalizadas (es/en)
    blog/           # Listado y detalle de posts
    sobre-kefy/     # Página "Sobre nosotros"
  api/
    waitlist/       # Endpoint POST para waitlist
components/
  landing/          # Secciones de la landing page
  ui/               # Componentes reutilizables
lib/
  content.ts        # Contenido bilingüe (tipado)
  i18n.ts           # Configuración de locales
  supabase.ts       # Cliente Supabase
db/
  migrations/       # SQL de esquema
  seeds/            # Datos iniciales del blog
emails/             # Plantillas con React Email
```

## Variables de entorno

Crea un archivo `.env.local` con:

```env
# Supabase (server-only — never expose to client)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# JWT (genera un string aleatorio seguro, mín. 32 caracteres)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Resend
RESEND_API_KEY=re_your_resend_api_key
RESEND_FROM_EMAIL=Kefy <no-reply@email.kefy.app>
```

Copia `.env.example` como `.env.local` y rellena los valores reales.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3097
```

## Build y despliegue

```bash
npm run build      # Verifica tipos y genera build de producción
```

El despliegue se realiza automáticamente en **Netlify** al hacer push a `main` usando el plugin `@netlify/plugin-nextjs`.
