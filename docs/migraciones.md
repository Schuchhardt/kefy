# Migraciones y CI/CD

El CI (`.github/workflows/ci.yml`) corre los tests en cada push y PR, y al
mergear a `main` aplica las migraciones de `db/migrations` en producción con
`scripts/migrate.mjs`.

## La base es compartida

El proyecto de Supabase **«AI Tickets/Kefy»** (`bgsmqjrdryafvlyxywud`) lo usan
las dos apps, en el mismo schema `public`. Por eso:

- **No se usa `supabase db push`.** El historial de Supabase
  (`supabase_migrations.schema_migrations`) es de las dos apps; `db push`
  vería las migraciones del otro como «remotas sin archivo local» y pediría
  repararlas o revertirlas. Kefy lleva su propio historial en
  **`kefy_schema_migrations`**.
- **Las migraciones nuevas solo crean o tocan objetos `kefy_*` de `public`**
  (tablas, vistas, funciones, tipos, índices, triggers y políticas sobre tablas
  `kefy_*`). Un índice o una función con nombre genérico (`idx_…`,
  `set_updated_at`) puede chocar con uno de AI Tickets y `CREATE OR REPLACE` lo
  pisaría sin aviso.
- **Prohibido lo que afecta a toda la base:** `CREATE/ALTER/DROP SCHEMA`,
  extensiones, roles, `ALTER DEFAULT PRIVILEGES`, `GRANT … ON ALL TABLES IN
  SCHEMA`, `ALTER DATABASE/SYSTEM`, `DROP/REASSIGN OWNED`.
- **Locks cortos:** cada migración corre con `lock_timeout = 10s` y
  `statement_timeout = 5min`. Si una tabla está ocupada la migración falla en
  vez de quedarse esperando el lock y bloquear de paso las consultas de AI Tickets.

Si de verdad hace falta tocar algo compartido (p. ej. un bucket en
`storage.buckets`), la migración lleva una línea con el motivo:

```sql
-- migrate:allow-shared crea el bucket kefy-video-assets
```

Eso desactiva las reglas de nombres para ese archivo; revísalo dos veces en el PR.

## Escribir una migración

- Archivo `db/migrations/YYYYMMDDNNNNNN_descripcion.sql` (minúsculas y `_`),
  con una versión que no use otro archivo.
- Idempotente cuando se pueda (`IF NOT EXISTS`, `ON CONFLICT`): una migración
  puede llegar a correr dos veces si alguien la aplicó a mano antes.
- Sin `BEGIN`/`COMMIT`: el runner envuelve cada archivo en una transacción
  junto con su registro en `kefy_schema_migrations`. Si falla, no queda nada a
  medias. Por lo mismo, **no** se puede usar `CREATE INDEX CONCURRENTLY`.
- **Compatible con el código que está en producción.** Vercel despliega en
  paralelo con el job de migraciones, así que durante un minuto conviven la
  base nueva con el código viejo (o al revés). Añadir columnas o tablas no
  rompe nada. Para renombrar o borrar, primero se deja de usar en un deploy y
  después se borra en otro.
- No edites una migración ya aplicada: no se vuelve a ejecutar (el runner
  avisa que el checksum cambió). El cambio va en una migración nueva.
- **No apliques migraciones a mano** (MCP de Supabase, SQL editor): el runner
  no se entera y la vuelve a correr al mergear. Si ya lo hiciste, que sea
  idempotente.

Antes de abrir el PR: `npm run db:migrate:check` (lo mismo que corre el CI).

## Cómo corre en el CI

| Job | Cuándo | Qué hace |
|-----|--------|----------|
| `Unit Tests (Vitest)` | push y PR | `npm run test:coverage` (incluye `tests/unit/scripts/migrate.test.ts`, que valida todo `db/migrations`) |
| `Migraciones (validación)` | push y PR | `node scripts/migrate.mjs --check`: nombres, versiones únicas y reglas de la base compartida. No se conecta a la base |
| `Migraciones (producción)` | push a `main`, después de los dos anteriores | `--status` y luego aplica lo pendiente, con advisory lock y `concurrency` para que no corran dos a la vez |

El job de producción usa el environment **`supabase-production`** de GitHub,
restringido a la rama `main`. Solo ahí está el secreto: ni los PRs ni otras
ramas ven la conexión. Es un environment aparte del `Production` que crea
Vercel: Vercel registra sus deploys con el SHA del commit y una regla de rama
en ese environment podría bloquearlos.

### Configuración (una sola vez)

1. GitHub → Settings → Environments → `supabase-production` (ya creado), con
   *Deployment branches* = solo `main`. Opcional: *Required reviewers* si se
   quiere aprobar cada migración.
2. En ese environment, secreto **`SUPABASE_DB_URL`** con la cadena del
   **session pooler**, copiada de Supabase → Connect → *Session pooler*
   (forma `postgresql://postgres.bgsmqjrdryafvlyxywud:<password>@<host>.pooler.supabase.com:5432/postgres`).
   - No el host directo `db.<ref>.supabase.co`: es solo IPv6 y los runners de
     GitHub no lo alcanzan.
   - No el *transaction pooler* (puerto 6543): el advisory lock es de sesión.

## Baseline

Antes de este runner las migraciones se aplicaban a mano. La primera vez que
corre crea `kefy_schema_migrations` y registra como aplicadas, **sin
ejecutarlas**, todas las que tengan versión ≤ `BASELINE_VERSION`
(`scripts/migrate-lib.mjs`, hoy `20261111000002`). Se comprobó contra
producción que esas ya estaban aplicadas, incluida
`20261111000002_sales_demo_brands`, que todavía estaba en la rama
`feat/admin-prospect-profile` cuando se aplicó.

- La identidad de cada migración es `version_nombre`, no solo la versión: hay
  dos archivos con la versión `20260516000001` y los dos están registrados.
- Las reglas de base compartida y de versión única solo se aplican después del
  baseline. Las migraciones anteriores quedan como están (algunas tienen
  índices `idx_*` y la función `update_updated_at` sin prefijo; hoy solo los
  usa Kefy).

## Uso local

```bash
npm run db:migrate:check                         # sin base
DATABASE_URL=… npm run db:migrate:status         # qué falta, no escribe
DATABASE_URL=… npm run db:migrate                # aplica (preferir el CI)
```

`MIGRATIONS_DIR` cambia la carpeta (útil para probar contra un Postgres local).
