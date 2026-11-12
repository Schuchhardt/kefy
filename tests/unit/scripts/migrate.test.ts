// @vitest-environment node
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_VERSION,
  baselineRows,
  checkMigrations,
  lintMigration,
  loadMigrations,
  parseFilename,
  plan,
  stripSql,
} from '../../../scripts/migrate-lib.mjs';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../db/migrations');

const mig = (version: string, sql = 'SELECT 1;') => ({
  version,
  name: `m${version}`,
  id: `${version}_m${version}`,
  file: `${version}_m${version}.sql`,
  sql,
  checksum: `sum-${version}-${sql.length}`,
});

describe('db/migrations', () => {
  it('pasan la validación del runner (nombres, versiones únicas, base compartida)', () => {
    expect(checkMigrations(loadMigrations(MIGRATIONS_DIR))).toEqual([]);
  });

  it('el baseline registra cada archivo, también los que comparten versión', () => {
    const { migrations } = loadMigrations(MIGRATIONS_DIR);
    const rows = baselineRows(migrations);
    expect(rows.length).toBeGreaterThan(40);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(plan(migrations, rows).pending.every((m) => m.version > BASELINE_VERSION)).toBe(true);
    expect(BASELINE_VERSION).toMatch(/^\d{14}$/);
  });
});

describe('parseFilename', () => {
  it('acepta YYYYMMDDNNNNNN_descripcion.sql', () => {
    expect(parseFilename('20261112000001_add_x.sql')).toEqual({ version: '20261112000001', name: 'add_x' });
  });
  it('rechaza otros formatos', () => {
    expect(parseFilename('2026111201_add_x.sql')).toBeNull();
    expect(parseFilename('20261112000001-add-x.sql')).toBeNull();
    expect(parseFilename('20261112000001_Add_X.sql')).toBeNull();
  });
});

describe('stripSql', () => {
  it('quita comentarios, literales y cuerpos $$', () => {
    const sql = `-- DROP TABLE users\nSELECT 'DROP TABLE users'; /* DROP TABLE x */\nCREATE FUNCTION kefy_f() RETURNS void AS $$ DELETE FROM users; $$ LANGUAGE sql;`;
    const out = stripSql(sql);
    expect(out).not.toMatch(/DROP|DELETE/);
    expect(out).toMatch(/CREATE FUNCTION kefy_f/);
  });
});

describe('lintMigration', () => {
  it('acepta objetos kefy_*', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS kefy_things (id uuid primary key, updated_at timestamptz);
      CREATE INDEX IF NOT EXISTS kefy_things_idx ON kefy_things (id);
      ALTER TABLE public.kefy_things ADD COLUMN IF NOT EXISTS name text;
      ALTER TABLE kefy_things ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "kefy read" ON kefy_things FOR SELECT USING (true);
      CREATE TRIGGER kefy_things_updated_at BEFORE INSERT OR UPDATE ON kefy_things
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      INSERT INTO kefy_things (id) VALUES (gen_random_uuid()) ON CONFLICT (id) DO UPDATE SET name = 'x';
      UPDATE kefy_things SET name = 'y';
      GRANT SELECT, INSERT, UPDATE ON kefy_things TO service_role;
    `;
    expect(lintMigration(sql)).toEqual([]);
  });

  it('rechaza tocar tablas que no son de Kefy', () => {
    expect(lintMigration('ALTER TABLE events ADD COLUMN x int;')[0]).toMatch(/ALTER events/);
    expect(lintMigration('DROP TABLE IF EXISTS orders;')[0]).toMatch(/DROP orders/);
    expect(lintMigration('DELETE FROM users;')[0]).toMatch(/DELETE users/);
    expect(lintMigration('UPDATE public.users SET x = 1;')[0]).toMatch(/UPDATE public\.users/);
    expect(lintMigration('TRUNCATE users;')[0]).toMatch(/TRUNCATE users/);
  });

  it('rechaza crear objetos sin prefijo kefy_ (chocan con AI Tickets)', () => {
    expect(lintMigration('CREATE TABLE leads (id int);')[0]).toMatch(/CREATE TABLE leads/);
    expect(lintMigration('CREATE INDEX idx_x ON kefy_t (a);')[0]).toMatch(/CREATE INDEX idx_x/);
    expect(lintMigration('CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN END $$ LANGUAGE plpgsql;')[0])
      .toMatch(/CREATE FUNCTION set_updated_at/);
  });

  it('rechaza objetos kefy_ fuera de public', () => {
    expect(lintMigration('CREATE TABLE auth.kefy_x (id int);')[0]).toMatch(/auth\.kefy_x/);
  });

  it('rechaza sentencias que afectan a toda la base', () => {
    expect(lintMigration('DROP SCHEMA public CASCADE;').join()).toMatch(/DROP SCHEMA/);
    expect(lintMigration('CREATE EXTENSION IF NOT EXISTS pg_trgm;').join()).toMatch(/EXTENSION/);
    expect(lintMigration('GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;').join()).toMatch(/ON ALL/);
    expect(lintMigration('ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO anon;').join()).toMatch(/DEFAULT PRIVILEGES/);
  });

  it('rechaza CONCURRENTLY y BEGIN/COMMIT propios', () => {
    expect(lintMigration('CREATE INDEX CONCURRENTLY kefy_i ON kefy_t (a);').join()).toMatch(/CONCURRENTLY/);
    expect(lintMigration('BEGIN;\nCREATE TABLE kefy_t (a int);\nCOMMIT;').join()).toMatch(/BEGIN\/COMMIT/);
  });

  it('permite lo compartido con migrate:allow-shared y un motivo', () => {
    const sql = `-- migrate:allow-shared bucket de videos\nINSERT INTO storage.buckets (id, name) VALUES ('kefy-x', 'kefy-x');`;
    expect(lintMigration(sql)).toEqual([]);
    expect(lintMigration(`-- migrate:allow-shared\nINSERT INTO storage.buckets (id) VALUES ('x');`)).not.toEqual([]);
  });

  it('ignora el texto de comentarios y funciones', () => {
    const sql = `-- antes: DROP TABLE users\nCREATE FUNCTION kefy_f() RETURNS void AS $fn$ UPDATE kefy_t SET a = 1; $fn$ LANGUAGE sql;`;
    expect(lintMigration(sql)).toEqual([]);
  });
});

describe('checkMigrations', () => {
  it('detecta versiones repetidas y nombres inválidos', () => {
    const v = '29990101000001';
    const errors = checkMigrations({ migrations: [mig(v), { ...mig(v), id: `${v}_otra`, file: `${v}_otra.sql` }], invalid: ['nueva.sql'] });
    expect(errors.join('\n')).toMatch(/nueva\.sql/);
    expect(errors.join('\n')).toMatch(/ya la usa/);
  });

  it('solo aplica las reglas de base compartida después del baseline', () => {
    const bad = 'ALTER TABLE events ADD COLUMN x int;';
    expect(checkMigrations({ migrations: [mig('20260101000001', bad)], invalid: [] }, '20260101000001')).toEqual([]);
    expect(checkMigrations({ migrations: [mig('20260101000002', bad)], invalid: [] }, '20260101000001')).toHaveLength(1);
  });
});

describe('plan', () => {
  it('separa pendientes, modificadas y sin archivo', () => {
    const a = mig('20260101000001');
    const b = mig('20260101000002');
    const c = mig('20260101000003');
    const result = plan([a, b, c], [
      { id: a.id, checksum: a.checksum },
      { id: b.id, checksum: 'otro' },
      { id: '20250101000001_vieja', checksum: null },
    ]);
    expect(result.pending.map((m) => m.version)).toEqual([c.version]);
    expect(result.changed.map((m) => m.version)).toEqual([b.version]);
    expect(result.missing).toEqual(['20250101000001_vieja']);
  });

  it('aplica una migración vieja que llegó tarde desde otra rama', () => {
    const old = mig('20260101000001');
    const newer = mig('20260101000002');
    const result = plan([old, newer], [{ id: newer.id, checksum: newer.checksum }]);
    expect(result.pending.map((m) => m.version)).toEqual([old.version]);
  });

  it('una fila del baseline sin checksum no cuenta como modificada', () => {
    const a = mig('20260101000001');
    expect(plan([a], [{ id: a.id, checksum: null }]).changed).toEqual([]);
  });
});

describe('baselineRows', () => {
  it('incluye solo hasta la versión del baseline', () => {
    const rows = baselineRows([mig('20260101000001'), mig('20260101000002'), mig('20260101000003')], '20260101000002');
    expect(rows.map((r) => r.version)).toEqual(['20260101000001', '20260101000002']);
  });
});
