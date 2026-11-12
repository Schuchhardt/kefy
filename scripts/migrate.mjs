#!/usr/bin/env node
// Aplica las migraciones de db/migrations a la base de Supabase COMPARTIDA con
// AI Tickets. Lo corre el CI al mergear a main; ver docs/migraciones.md.
//
//   node scripts/migrate.mjs --check     valida los archivos (sin base)
//   node scripts/migrate.mjs --status    muestra qué falta (no escribe nada)
//   node scripts/migrate.mjs             aplica lo pendiente
//
// Conexión: DATABASE_URL con el *session pooler* de Supabase (puerto 5432 de
// pooler.supabase.com). El host directo db.<ref>.supabase.co es solo IPv6 y
// los runners de GitHub no lo alcanzan; el transaction pooler (6543) no sirve
// porque el advisory lock es de sesión.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADVISORY_LOCK_KEY,
  BASELINE_VERSION,
  MIGRATIONS_TABLE,
  baselineRows,
  checkMigrations,
  loadMigrations,
  plan,
} from './migrate-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(ROOT, 'db', 'migrations');
const inGithub = process.env.GITHUB_ACTIONS === 'true';

// En una base compartida una migración no puede quedarse esperando un lock y
// bloquear de paso a AI Tickets: si no lo consigue en 10 s, falla y se reintenta.
const LOCK_TIMEOUT = process.env.MIGRATE_LOCK_TIMEOUT || '10s';
const STATEMENT_TIMEOUT = process.env.MIGRATE_STATEMENT_TIMEOUT || '5min';

const log = (msg) => console.log(msg);
const warn = (msg) => console.log(inGithub ? `::warning::${msg}` : `⚠ ${msg}`);
const fail = (msg) => {
  console.error(inGithub ? `::error::${msg}` : `✖ ${msg}`);
  process.exitCode = 1;
};

async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL (en GitHub: secreto SUPABASE_DB_URL del environment production).',
    );
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    application_name: 'kefy-migrate',
  });
  await client.connect();
  return client;
}

async function ensureTable(client, migrations) {
  const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${MIGRATIONS_TABLE}`]);
  if (rows[0].t) return;

  // Primera vez: todo hasta BASELINE_VERSION ya está en producción (se aplicó
  // a mano), así que se registra sin ejecutarlo.
  const seed = baselineRows(migrations);
  log(`Creando ${MIGRATIONS_TABLE} y registrando ${seed.length} migraciones del baseline (≤ ${BASELINE_VERSION}).`);
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.${MIGRATIONS_TABLE} (
        id           TEXT        PRIMARY KEY,  -- version_nombre (= archivo sin .sql)
        version      TEXT        NOT NULL,
        name         TEXT        NOT NULL,
        checksum     TEXT,
        applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        applied_by   TEXT        NOT NULL,
        execution_ms INTEGER
      )`);
    // Solo la usa este script (service role / postgres): sin políticas, la API
    // pública no la ve.
    await client.query(`ALTER TABLE public.${MIGRATIONS_TABLE} ENABLE ROW LEVEL SECURITY`);
    for (const row of seed) {
      await client.query(
        `INSERT INTO public.${MIGRATIONS_TABLE} (id, version, name, checksum, applied_by)
         VALUES ($1, $2, $3, $4, 'baseline') ON CONFLICT (id) DO NOTHING`,
        [row.id, row.version, row.name, row.checksum],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function readApplied(client) {
  const { rows } = await client.query(
    `SELECT id, version, name, checksum FROM public.${MIGRATIONS_TABLE} ORDER BY version, id`,
  );
  return rows;
}

function appliedBy() {
  if (inGithub) {
    return `github:${process.env.GITHUB_REPOSITORY}@${(process.env.GITHUB_SHA || '').slice(0, 8)} run ${process.env.GITHUB_RUN_ID}`;
  }
  return `local:${process.env.USER || 'unknown'}`;
}

async function applyOne(client, m) {
  const started = Date.now();
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
    await client.query(m.sql);
    await client.query(
      `INSERT INTO public.${MIGRATIONS_TABLE} (id, version, name, checksum, applied_by, execution_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [m.id, m.version, m.name, m.checksum, appliedBy(), Date.now() - started],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
  log(`  ✓ ${m.file} (${Date.now() - started} ms)`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const loaded = loadMigrations(MIGRATIONS_DIR);

  const errors = checkMigrations(loaded);
  if (errors.length) {
    for (const e of errors) fail(e);
    return;
  }
  if (args.has('--check')) {
    log(`${loaded.migrations.length} migraciones válidas.`);
    return;
  }

  const statusOnly = args.has('--status');
  const client = await connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);

    let applied;
    if (statusOnly) {
      const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${MIGRATIONS_TABLE}`]);
      applied = rows[0].t ? await readApplied(client) : baselineRows(loaded.migrations);
    } else {
      await ensureTable(client, loaded.migrations);
      applied = await readApplied(client);
    }

    const { pending, changed, missing } = plan(loaded.migrations, applied);
    for (const m of changed) {
      warn(`${m.file} cambió después de aplicarse; no se vuelve a ejecutar. Los cambios van en una migración nueva.`);
    }
    for (const v of missing) {
      warn(`${v} está registrada en la base pero no hay archivo (¿aplicada desde una rama sin mergear?).`);
    }

    if (!pending.length) {
      log('La base está al día.');
      return;
    }
    log(`${pending.length} migración(es) pendiente(s):`);
    if (statusOnly) {
      for (const m of pending) log(`  · ${m.file}`);
      return;
    }
    for (const m of pending) {
      try {
        await applyOne(client, m);
      } catch (err) {
        fail(`${m.file} falló y se revirtió: ${err.message}`);
        return;
      }
    }
    log('Migraciones aplicadas.');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  fail(err.message);
});
