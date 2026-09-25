// ─── Supabase en memoria para los tests ──────────────────────────────────────
//
// Los tests del asistente (registro, auditoría, conversaciones, API keys, MCP,
// chat) recorren muchas consultas encadenadas. Mockear cada cadena con
// `mockReturnValueOnce` las vuelve frágiles: cualquier consulta nueva desordena
// la secuencia. Este fake guarda filas en memoria y aplica de verdad los
// filtros (eq, is, in, lt, or…), así un test puede afirmar sobre el estado
// final («la acción quedó en succeeded») y sobre el aislamiento («la consulta
// filtró por org_id»: si no lo hiciera, devolvería la fila de otra org).
//
// Uso:
//
//   const db = createFakeDb();
//   vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
//   db.seed('kefy_brands', [{ id: 'b1', org_id: 'o1', archived: false }]);
//
// Limitaciones conocidas (a propósito, para que siga siendo pequeño):
//   - `select(cols)` ignora las columnas: devuelve la fila completa. Los
//     embebidos (kefy_organizations(name, plan)) se siembran ya anidados.
//   - `or()` entiende `col.op.valor` separados por comas y `and(...)`.
//   - No hay RLS ni claves foráneas; solo las restricciones únicas declaradas.

import { randomUUID } from 'node:crypto';
import { fakeRpc } from './quota';

type Row = Record<string, unknown>;
type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';
type Filter = (row: Row) => boolean;

export interface DbError { message: string; code?: string }

export interface LogEntry {
  table: string;
  op: Op;
  filters: string[];
  payload?: unknown;
}

interface TableConfig {
  defaults?: () => Row;
  /** Grupos de columnas únicas (se ignoran si alguna es null, como en Postgres). */
  unique?: string[][];
  /** Columna identidad autoincremental. */
  identity?: string;
}

/** Valor de una columna, admitiendo rutas con punto sobre embebidos. */
function getPath(row: Row, path: string): unknown {
  if (!path.includes('.')) return row[path];
  let cur: unknown = row;
  for (const part of path.split('.')) {
    if (Array.isArray(cur)) cur = cur[0];
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Row)[part];
  }
  return cur;
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function likeToRegex(pattern: string, flags = ''): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, flags);
}

function coerce(v: string): unknown {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

/** Filtro de una operación de PostgREST (`eq`, `is`, `lt`…) sobre una columna. */
function opFilter(col: string, op: string, value: unknown): Filter {
  switch (op) {
    case 'eq': return (r) => { const v = getPath(r, col); return v === value || (v !== null && v !== undefined && String(v) === String(value)); };
    case 'neq': return (r) => getPath(r, col) !== value;
    case 'is': return (r) => {
      const v = getPath(r, col);
      return value === null ? v === null || v === undefined : v === value;
    };
    case 'in': return (r) => (value as unknown[]).some((x) => String(x) === String(getPath(r, col)));
    case 'gt': return (r) => getPath(r, col) != null && cmp(getPath(r, col), value) > 0;
    case 'gte': return (r) => getPath(r, col) != null && cmp(getPath(r, col), value) >= 0;
    case 'lt': return (r) => getPath(r, col) != null && cmp(getPath(r, col), value) < 0;
    case 'lte': return (r) => getPath(r, col) != null && cmp(getPath(r, col), value) <= 0;
    case 'like': return (r) => likeToRegex(String(value)).test(String(getPath(r, col) ?? ''));
    case 'ilike': return (r) => likeToRegex(String(value), 'i').test(String(getPath(r, col) ?? ''));
    default: throw new Error(`fake-db: operador no soportado: ${op}`);
  }
}

/** Parte por comas de primer nivel (respetando paréntesis). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function parseCondition(expr: string): Filter {
  const e = expr.trim();
  if (e.startsWith('and(') && e.endsWith(')')) {
    const parts = splitTop(e.slice(4, -1)).map(parseCondition);
    return (r) => parts.every((f) => f(r));
  }
  if (e.startsWith('or(') && e.endsWith(')')) {
    const parts = splitTop(e.slice(3, -1)).map(parseCondition);
    return (r) => parts.some((f) => f(r));
  }
  const m = /^([\w.]+?)\.(not\.)?(eq|neq|is|in|gte|gt|lte|lt|like|ilike)\.(.*)$/.exec(e);
  if (!m) throw new Error(`fake-db: condición or() no soportada: ${e}`);
  const [, col, not, op, raw] = m;
  const value = op === 'in' ? raw.replace(/^\(|\)$/g, '').split(',').map(coerce) : coerce(raw);
  const f = opFilter(col, op, value);
  return not ? (r) => !f(r) : f;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export interface FakeDb {
  client: FakeClient;
  tables: Record<string, Row[]>;
  log: LogEntry[];
  seed(table: string, rows: Row[]): Row[];
  rows(table: string): Row[];
  find(table: string, pred: (r: Row) => boolean): Row | undefined;
  /** Hace fallar la próxima operación que coincida (tabla + op opcional). */
  failNext(table: string, op: Op | '*', error?: DbError): void;
  /** Sustituye una RPC (el resto va a fakeRpc de helpers/quota). */
  rpcHandlers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: DbError | null }>;
  storage: { uploads: Array<{ bucket: string; path: string; contentType?: string; size: number }>; failUpload: boolean };
  reset(): void;
  /** Operaciones que modificaron `table` (insert/update/delete/upsert). */
  writes(table?: string): LogEntry[];
}

export type FakeClient = {
  from: (table: string) => QueryBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: DbError | null }>;
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: { byteLength?: number; length?: number }, opts?: { contentType?: string }) => Promise<{ data: unknown; error: DbError | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

const TABLE_CONFIG: Record<string, TableConfig> = {
  kefy_assistant_conversations: {
    defaults: () => ({
      title: null, tainted_through_seq: null, archived_at: null, brand_id: null,
      last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }),
  },
  kefy_assistant_turns: {
    defaults: () => ({
      model_calls: 0, credits_charged: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0,
      status: 'running', updated_at: new Date().toISOString(),
    }),
  },
  kefy_assistant_messages: {
    identity: 'seq',
    defaults: () => ({ text: null, model: null, stop_reason: null, turn_id: null }),
  },
  kefy_assistant_actions: {
    unique: [['api_key_id', 'idempotency_key']],
    defaults: () => ({
      brand_id: null, user_id: null, api_key_id: null, conversation_id: null, turn_id: null,
      message_id: null, tool_use_id: null, input: {}, result: null, tool_result: null, error: null,
      credits_estimated: 0, idempotency_key: null, idempotency_hash: null,
      decided_at: null, completed_at: null, expires_at: null,
    }),
  },
  kefy_api_keys: {
    unique: [['key_hash']],
    defaults: () => ({ brand_id: null, last_used_at: null, expires_at: null, revoked_at: null }),
  },
};

export function createFakeDb(): FakeDb {
  const tables: Record<string, Row[]> = {};
  const log: LogEntry[] = [];
  const failures: Array<{ table: string; op: Op | '*'; error: DbError }> = [];
  const identities: Record<string, number> = {};
  const rpcHandlers: FakeDb['rpcHandlers'] = {};
  const storage: FakeDb['storage'] = { uploads: [], failUpload: false };
  // created_at estrictamente creciente: el orden por created_at es determinista.
  let clock = Date.parse('2026-09-01T00:00:00Z');
  const tick = () => new Date((clock += 1000)).toISOString();

  const table = (name: string) => (tables[name] ??= []);

  function takeFailure(name: string, op: Op): DbError | null {
    const i = failures.findIndex((f) => f.table === name && (f.op === '*' || f.op === op));
    if (i === -1) return null;
    return failures.splice(i, 1)[0].error;
  }

  function withDefaults(name: string, row: Row): Row {
    const cfg = TABLE_CONFIG[name];
    const full: Row = { ...(cfg?.defaults?.() ?? {}), ...clone(row) };
    if (full.id === undefined) full.id = randomUUID();
    if (full.created_at === undefined) full.created_at = tick();
    if (cfg?.identity && full[cfg.identity] === undefined) {
      identities[name] = (identities[name] ?? 0) + 1;
      full[cfg.identity] = identities[name];
    }
    return full;
  }

  function violatesUnique(name: string, row: Row, ignore?: Row): boolean {
    const groups = TABLE_CONFIG[name]?.unique ?? [];
    return groups.some((cols) => {
      if (cols.some((c) => row[c] === null || row[c] === undefined)) return false;
      return table(name).some((r) => r !== ignore && cols.every((c) => r[c] === row[c]));
    });
  }

  function seed(name: string, rows: Row[]): Row[] {
    const added = rows.map((r) => withDefaults(name, r));
    table(name).push(...added);
    return added;
  }

  function builder(name: string): QueryBuilder {
    return new QueryBuilder(name, {
      table, log, takeFailure, withDefaults, violatesUnique,
    });
  }

  const client: FakeClient = {
    from: (name) => builder(name),
    async rpc(fn, args = {}) {
      const custom = rpcHandlers[fn];
      if (custom) return custom(args);
      if (fn === 'kefy_assistant_turn_step') {
        const fail = takeFailure('rpc:kefy_assistant_turn_step', 'update');
        if (fail) return { data: null, error: fail };
        const t = table('kefy_assistant_turns').find((r) => r.id === args.p_turn_id && r.org_id === args.p_org_id);
        if (!t || Number(t.model_calls) >= Number(t.max_model_calls)) return { data: -1, error: null };
        t.model_calls = Number(t.model_calls) + 1;
        return { data: t.model_calls, error: null };
      }
      return fakeRpc(fn, args) as Promise<{ data: unknown; error: DbError | null }>;
    },
    storage: {
      from: (bucket) => ({
        async upload(path, body, opts) {
          if (storage.failUpload) return { data: null, error: { message: 'simulated upload failure' } };
          storage.uploads.push({ bucket, path, contentType: opts?.contentType, size: body.byteLength ?? body.length ?? 0 });
          return { data: { path }, error: null };
        },
        getPublicUrl: (path) => ({
          data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
      }),
    },
  };

  return {
    client,
    tables,
    log,
    seed,
    rows: (name) => table(name),
    find: (name, pred) => table(name).find(pred),
    failNext(name, op, error = { message: 'simulated database failure' }) {
      failures.push({ table: name, op, error });
    },
    rpcHandlers,
    storage,
    reset() {
      for (const k of Object.keys(tables)) delete tables[k];
      for (const k of Object.keys(identities)) delete identities[k];
      for (const k of Object.keys(rpcHandlers)) delete rpcHandlers[k];
      log.length = 0;
      failures.length = 0;
      storage.uploads.length = 0;
      storage.failUpload = false;
    },
    writes: (name) => log.filter((l) => l.op !== 'select' && (!name || l.table === name)),
  };
}

interface BuilderDeps {
  table: (name: string) => Row[];
  log: LogEntry[];
  takeFailure: (name: string, op: Op) => DbError | null;
  withDefaults: (name: string, row: Row) => Row;
  violatesUnique: (name: string, row: Row, ignore?: Row) => boolean;
}

type Result = { data: unknown; error: DbError | null; count?: number | null };

export class QueryBuilder implements PromiseLike<Result> {
  private op: Op = 'select';
  private filters: Filter[] = [];
  private filterDesc: string[] = [];
  private payload: unknown;
  private orders: Array<{ col: string; ascending: boolean }> = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private returning = false;
  private countMode = false;
  private head = false;
  private upsertOpts: { onConflict?: string } | undefined;

  constructor(private name: string, private deps: BuilderDeps) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }): this {
    if (this.op === 'select') {
      this.countMode = !!opts?.count;
      this.head = !!opts?.head;
    } else {
      this.returning = true;
    }
    return this;
  }
  insert(rows: Row | Row[]): this { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this { this.op = 'upsert'; this.payload = rows; this.upsertOpts = opts; return this; }
  update(patch: Row): this { this.op = 'update'; this.payload = patch; return this; }
  delete(): this { this.op = 'delete'; return this; }

  private add(desc: string, f: Filter): this { this.filters.push(f); this.filterDesc.push(desc); return this; }
  eq(col: string, v: unknown) { return this.add(`${col}=eq.${String(v)}`, opFilter(col, 'eq', v)); }
  neq(col: string, v: unknown) { return this.add(`${col}=neq.${String(v)}`, opFilter(col, 'neq', v)); }
  is(col: string, v: unknown) { return this.add(`${col}=is.${String(v)}`, opFilter(col, 'is', v)); }
  in(col: string, v: unknown[]) { return this.add(`${col}=in.(${v.join(',')})`, opFilter(col, 'in', v)); }
  gt(col: string, v: unknown) { return this.add(`${col}=gt.${String(v)}`, opFilter(col, 'gt', v)); }
  gte(col: string, v: unknown) { return this.add(`${col}=gte.${String(v)}`, opFilter(col, 'gte', v)); }
  lt(col: string, v: unknown) { return this.add(`${col}=lt.${String(v)}`, opFilter(col, 'lt', v)); }
  lte(col: string, v: unknown) { return this.add(`${col}=lte.${String(v)}`, opFilter(col, 'lte', v)); }
  like(col: string, v: string) { return this.add(`${col}=like.${v}`, opFilter(col, 'like', v)); }
  ilike(col: string, v: string) { return this.add(`${col}=ilike.${v}`, opFilter(col, 'ilike', v)); }
  not(col: string, op: string, v: unknown) {
    const f = opFilter(col, op, v);
    return this.add(`${col}=not.${op}.${String(v)}`, (r) => !f(r));
  }
  or(expr: string) {
    const parts = splitTop(expr).map(parseCondition);
    return this.add(`or=(${expr})`, (r) => parts.some((f) => f(r)));
  }
  filter(col: string, op: string, v: unknown) { return this.add(`${col}=${op}.${String(v)}`, opFilter(col, op, v)); }
  match(obj: Row) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, ascending: opts?.ascending ?? true }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; }
  abortSignal() { return this; }

  async single(): Promise<Result> {
    const r = await this.run();
    if (r.error) return r;
    const arr = r.data as Row[];
    if (arr.length !== 1) return { data: null, error: { message: `expected 1 row, got ${arr.length}`, code: 'PGRST116' } };
    return { data: arr[0], error: null };
  }

  async maybeSingle(): Promise<Result> {
    const r = await this.run();
    if (r.error) return r;
    const arr = r.data as Row[];
    if (arr.length > 1) return { data: null, error: { message: `expected 0 or 1 rows, got ${arr.length}` } };
    return { data: arr[0] ?? null, error: null };
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    return this.deps.table(this.name).filter((r) => this.filters.every((f) => f(r)));
  }

  private shape(rows: Row[]): Row[] {
    let out = [...rows];
    if (this.orders.length) {
      out.sort((a, b) => {
        for (const o of this.orders) {
          const c = cmp(getPath(a, o.col), getPath(b, o.col));
          if (c !== 0) return o.ascending ? c : -c;
        }
        return 0;
      });
    }
    if (this.rangeFrom !== null) out = out.slice(this.rangeFrom, (this.rangeTo ?? out.length) + 1);
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return out.map(clone);
  }

  private async run(): Promise<Result> {
    const { name, deps } = this;
    deps.log.push({ table: name, op: this.op, filters: [...this.filterDesc], payload: clone(this.payload) });
    const fail = deps.takeFailure(name, this.op);
    if (fail) return { data: null, error: fail, count: null };

    switch (this.op) {
      case 'select': {
        const rows = this.matching();
        if (this.countMode && this.head) return { data: null, error: null, count: rows.length };
        return { data: this.shape(rows), error: null, count: this.countMode ? rows.length : null };
      }
      case 'insert': {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const full = input.map((r) => deps.withDefaults(name, r as Row));
        if (full.some((r) => deps.violatesUnique(name, r))) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
        deps.table(name).push(...full);
        return { data: this.returning ? full.map(clone) : null, error: null };
      }
      case 'upsert': {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const keys = (this.upsertOpts?.onConflict ?? 'id').split(',').map((s) => s.trim());
        const out: Row[] = [];
        for (const r of input as Row[]) {
          const existing = deps.table(name).find((x) => keys.every((k) => x[k] === r[k]));
          if (existing) { Object.assign(existing, clone(r)); out.push(existing); }
          else { const full = deps.withDefaults(name, r); deps.table(name).push(full); out.push(full); }
        }
        return { data: this.returning ? out.map(clone) : null, error: null };
      }
      case 'update': {
        const rows = this.matching();
        const patch = clone(this.payload as Row);
        for (const r of rows) {
          const next = { ...r, ...patch };
          if (deps.violatesUnique(name, next, r)) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          }
        }
        for (const r of rows) Object.assign(r, patch);
        return { data: this.returning ? this.shape(rows) : null, error: null };
      }
      case 'delete': {
        const rows = this.matching();
        const t = deps.table(name);
        for (const r of rows) t.splice(t.indexOf(r), 1);
        return { data: this.returning ? rows.map(clone) : null, error: null };
      }
    }
  }
}
