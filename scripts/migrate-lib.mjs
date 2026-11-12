// Lógica pura del runner de migraciones (scripts/migrate.mjs): leer los
// archivos, validarlos y decidir qué falta aplicar. Sin conexión a la base,
// para poder probarla en tests/unit/scripts/migrate.test.ts.
//
// La base de Supabase es COMPARTIDA con AI Tickets, así que:
//   * El historial vive en `kefy_schema_migrations`, no en
//     `supabase_migrations.schema_migrations` (que comparten las dos apps).
//   * Las migraciones nuevas solo pueden crear o tocar objetos `kefy_*`.
// Ver docs/migraciones.md.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MIGRATIONS_TABLE = 'kefy_schema_migrations';

// Todo lo que está en producción hasta esta versión se aplicó a mano antes de
// que existiera el runner. Al crear `kefy_schema_migrations` se registran como
// aplicadas sin ejecutarlas. Incluye 20261111000002_sales_demo_brands, que se
// aplicó desde la rama feat/admin-prospect-profile antes de mergearse.
export const BASELINE_VERSION = '20261111000002';

// Clave del advisory lock: dos despliegues no migran a la vez. Constante para
// no chocar con los locks de AI Tickets.
export const ADVISORY_LOCK_KEY = 726_100_001;

const FILE_RE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

// Escape explícito para una sentencia que sí tiene que tocar algo compartido
// (un bucket de storage, una extensión). Va en el archivo con el motivo:
//   -- migrate:allow-shared crea el bucket kefy-video-assets
const ALLOW_SHARED_RE = /--[ \t]*migrate:allow-shared[ \t]+\S/;

export function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

export function parseFilename(file) {
  const m = FILE_RE.exec(file);
  return m ? { version: m[1], name: m[2] } : null;
}

/** Lee db/migrations. Los archivos con nombre inválido se devuelven aparte. */
export function loadMigrations(dir) {
  const migrations = [];
  const invalid = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.sql')) continue;
    const parsed = parseFilename(file);
    if (!parsed) {
      invalid.push(file);
      continue;
    }
    const sql = readFileSync(path.join(dir, file), 'utf8');
    migrations.push({ ...parsed, id: `${parsed.version}_${parsed.name}`, file, sql, checksum: checksum(sql) });
  }
  return { migrations, invalid };
}

/** Quita comentarios, literales y cuerpos $$…$$ para analizar solo la DDL. */
export function stripSql(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      i = end === -1 ? sql.length : end + dollar[0].length;
      out += " '' ";
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      i = j + 1;
      out += "''";
      continue;
    }
    out += sql[i];
    i++;
  }
  return out;
}

const IDENT = String.raw`((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)`;

// Sentencias que crean o modifican un objeto con nombre: el nombre tiene que
// empezar por kefy_ (y estar en public).
const NAMED_OBJECT_RULES = [
  [String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`, 'CREATE TABLE'],
  [String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?`, 'CREATE VIEW'],
  [String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+`, 'CREATE FUNCTION'],
  [String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\s+`, 'CREATE PROCEDURE'],
  [String.raw`CREATE\s+TYPE\s+`, 'CREATE TYPE'],
  [String.raw`CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?`, 'CREATE SEQUENCE'],
  [String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?`, 'CREATE INDEX'],
  [String.raw`ALTER\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|TYPE|SEQUENCE|INDEX)\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?`, 'ALTER'],
  [String.raw`DROP\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|TYPE|SEQUENCE|INDEX)\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?`, 'DROP'],
  [String.raw`TRUNCATE\s+(?:TABLE\s+)?(?:ONLY\s+)?`, 'TRUNCATE'],
  [String.raw`DELETE\s+FROM\s+(?:ONLY\s+)?`, 'DELETE'],
  [String.raw`INSERT\s+INTO\s+`, 'INSERT'],
  [String.raw`UPDATE\s+(?:ONLY\s+)?`, 'UPDATE'],
  [String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(?:\S+\s+)+?ON\s+`, 'CREATE TRIGGER … ON'],
  [String.raw`CREATE\s+POLICY\s+(?:"[^"]+"|\S+)\s+ON\s+`, 'CREATE POLICY … ON'],
  [String.raw`DROP\s+(?:TRIGGER|POLICY)\s+(?:IF\s+EXISTS\s+)?(?:"[^"]+"|\S+)\s+ON\s+`, 'DROP … ON'],
  [String.raw`(?:GRANT|REVOKE)\s+[\w\s,]+?\s+ON\s+(?:TABLE\s+|FUNCTION\s+|SEQUENCE\s+)?`, 'GRANT/REVOKE … ON'],
];

// Palabras que siguen a UPDATE/INSERT sin ser un nombre: «BEFORE UPDATE ON»,
// «FOR UPDATE USING», «DO UPDATE SET», «INSERT OR UPDATE»…
const NOT_A_NAME = new Set(['on', 'or', 'of', 'set', 'using', 'with', 'to', 'for', 'all', 'nowait', 'skip']);

// Sentencias que afectan a toda la base: nunca en una migración de Kefy.
const FORBIDDEN_RULES = [
  [/\bDROP\s+SCHEMA\b/i, 'DROP SCHEMA'],
  [/\b(?:CREATE|ALTER)\s+SCHEMA\b/i, 'CREATE/ALTER SCHEMA'],
  [/\b(?:DROP|ALTER)\s+EXTENSION\b/i, 'DROP/ALTER EXTENSION'],
  [/\bCREATE\s+EXTENSION\b/i, 'CREATE EXTENSION'],
  [/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER)\b/i, 'CREATE/ALTER/DROP ROLE'],
  [/\bALTER\s+DEFAULT\s+PRIVILEGES\b/i, 'ALTER DEFAULT PRIVILEGES'],
  [/\bON\s+ALL\s+(?:TABLES|FUNCTIONS|SEQUENCES)\s+IN\s+SCHEMA\b/i, 'GRANT/REVOKE … ON ALL … IN SCHEMA'],
  [/\bALTER\s+DATABASE\b/i, 'ALTER DATABASE'],
  [/\bALTER\s+SYSTEM\b/i, 'ALTER SYSTEM'],
  [/\bDROP\s+OWNED\b/i, 'DROP OWNED'],
  [/\bREASSIGN\s+OWNED\b/i, 'REASSIGN OWNED'],
];

function isKefyName(raw) {
  const parts = raw.split('.').map((p) => p.trim().replace(/^"|"$/g, ''));
  if (parts.length === 2 && parts[0].toLowerCase() !== 'public') return false;
  return parts[parts.length - 1].toLowerCase().startsWith('kefy_');
}

/**
 * Valida una migración para la base compartida. Devuelve la lista de errores
 * (vacía si está bien).
 */
export function lintMigration(sql) {
  const errors = [];
  const allowShared = ALLOW_SHARED_RE.test(sql);
  const code = stripSql(sql);

  if (/\bCONCURRENTLY\b/i.test(code)) {
    errors.push('CONCURRENTLY no funciona dentro de la transacción de la migración');
  }
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(code) || /\bSTART\s+TRANSACTION\b/i.test(code)) {
    errors.push('No uses BEGIN/COMMIT: el runner ya envuelve cada migración en una transacción');
  }
  if (allowShared) return errors;

  for (const [re, label] of FORBIDDEN_RULES) {
    if (re.test(code)) {
      errors.push(`${label} afecta a toda la base compartida (AI Tickets incluido)`);
    }
  }
  for (const [prefix, label] of NAMED_OBJECT_RULES) {
    const re = new RegExp(String.raw`\b${prefix}${IDENT}`, 'gi');
    for (const m of code.matchAll(re)) {
      if (NOT_A_NAME.has(m[1].toLowerCase()) && label !== 'GRANT/REVOKE … ON') continue;
      if (!isKefyName(m[1])) {
        errors.push(`${label} ${m[1]}: en la base compartida solo se tocan objetos kefy_* de public`);
      }
    }
  }
  return [...new Set(errors)];
}

/**
 * Compara los archivos con lo registrado en la base.
 *  - pending: archivos sin registrar, en orden de versión.
 *  - changed: archivos ya aplicados cuyo contenido cambió (no se re-ejecutan).
 *  - missing: migraciones registradas sin archivo (p. ej. aplicada desde una
 *    rama que aún no se mergea).
 * La identidad es `version_nombre`, no solo la versión: antes del baseline hay
 * dos archivos con la misma versión (20260516000001).
 */
export function plan(migrations, applied) {
  const byId = new Map(applied.map((row) => [row.id, row]));
  const files = new Set(migrations.map((m) => m.id));
  const pending = [];
  const changed = [];
  for (const m of migrations) {
    const row = byId.get(m.id);
    if (!row) pending.push(m);
    else if (row.checksum && row.checksum !== m.checksum) changed.push(m);
  }
  const missing = applied.filter((row) => !files.has(row.id)).map((row) => row.id);
  return { pending, changed, missing };
}

/** Filas con las que se siembra `kefy_schema_migrations` la primera vez. */
export function baselineRows(migrations, baselineVersion = BASELINE_VERSION) {
  return migrations
    .filter((m) => m.version <= baselineVersion)
    .map((m) => ({ id: m.id, version: m.version, name: m.name, checksum: m.checksum }));
}

/** Validación sin base: nombres, versiones únicas y reglas de la base compartida. */
export function checkMigrations({ migrations, invalid }, baselineVersion = BASELINE_VERSION) {
  const errors = invalid.map(
    (file) => `${file}: el nombre tiene que ser YYYYMMDDNNNNNN_descripcion.sql (minúsculas y _)`,
  );
  const seen = new Map();
  for (const m of migrations) {
    // Las anteriores al baseline ya están en producción tal cual: no se validan
    // (entre ellas hay dos con la misma versión, 20260516000001).
    if (m.version <= baselineVersion) continue;
    if (seen.has(m.version)) {
      errors.push(`${m.file}: la versión ${m.version} ya la usa ${seen.get(m.version)}`);
    }
    seen.set(m.version, m.file);
    for (const e of lintMigration(m.sql)) errors.push(`${m.file}: ${e}`);
  }
  return errors;
}
