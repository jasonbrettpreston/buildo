// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1
//            (Phase 1 WITNESS, gate #44, slice A)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 3 (slice A subset)
//
// Gate #44, slice A: a step's committed SQL trace (`scripts/.../post/<invocation>.trace.json`,
// brief p1c3-trace-format.md) is compared against its DESCRIPTOR at column level. Pure ESM:
// no fs/pg/network/process — the caller reads the traces and hands in plain objects; `selfTest`
// is the only entry that fabricates fixtures, and it does so in memory.
//
// Answer strings (closed grammar, brief p1c3c-contract.md):
//   UNWITNESSED:<slug>                              no post trace captured at all
//   FAIL:INPUT:<slug>:<invocation>:<error>          a trace carried errors[] entries
//   FAIL:STALE:<slug>:<invocation>                  source_fingerprint != currentFingerprint
//   FAIL:WITNESS:<slug>:a:<table>.<col>|a:<table>.* traced read/write not declared
//   FAIL:WITNESS:<slug>:b:<table>[.<col>]           written tables must EQUAL declared write tables
//   FAIL:WITNESS:<slug>:c:statements:<d>!=<t>       distinct write fingerprints vs write_inventory
//   FAIL:WITNESS:<slug>:d:txn_scope:<declared>:<observed>
//   FAIL:WITNESS:<slug>:g:<key>                     PRE key absent from POST and unexplained
//   FAIL:PRODUCER:<slug>:<invocation-param>:status  a pipeline_runs read filtered to completed-only
//
// OUT of slice A (never implemented here): check (e), the declared ⊆ witnessed half of (a), and
// the C9 marker string — a later commit owns those. `status === 'converted'` is REPORT-ONLY until
// P1-C8/C9, so `hardStop` is only ever true for a `pending` slug whose rows carry a FAIL:.

const FAIL_PREFIX = 'FAIL:';

/** A column list is "whole table" when it carries `*` (brief §(a)); true only for arrays. */
function isWholeTable(cols) {
  return Array.isArray(cols) && cols.includes('*');
}

/** `descriptor.inputs.reads.tables[]` → `[{table, cols: string[]}]`; `*` preserved verbatim. */
function declaredReads(descriptor) {
  const tables = descriptor && descriptor.inputs && descriptor.inputs.reads
    ? descriptor.inputs.reads.tables
    : null;
  if (!Array.isArray(tables)) return [];
  const out = [];
  for (const t of tables) {
    if (!t || typeof t.table !== 'string') continue;
    out.push({ table: t.table, cols: Array.isArray(t.columns) ? t.columns : [] });
  }
  return out;
}

/** Every declared table a write may target: `outputs.writes[].table` ∪ the read tables. */
function declaredTables(descriptor) {
  const set = new Set(declaredReads(descriptor).map((r) => r.table));
  for (const w of declaredWrites(descriptor)) set.add(w.table);
  return set;
}

/** `outputs.writes[]` → `[{table, cols: string[], dbDefault: Set<string>}]` with `columns[].name`. */
function declaredWrites(descriptor) {
  const writes = descriptor && descriptor.outputs && Array.isArray(descriptor.outputs.writes)
    ? descriptor.outputs.writes
    : [];
  const out = [];
  for (const w of writes) {
    if (!w || typeof w.table !== 'string') continue;
    const cols = Array.isArray(w.columns)
      ? w.columns.map((c) => (c && typeof c.name === 'string' ? c.name : null)).filter(Boolean)
      : [];
    // `written: "db_default"` (step.schema.json: a DDL default the step never writes) is
    // carried so check (b) can honour the declaration in both directions (WF3 C1).
    const dbDefault = new Set(
      Array.isArray(w.columns)
        ? w.columns
          .filter((c) => c && typeof c.name === 'string' && c.written === 'db_default')
          .map((c) => c.name)
        : [],
    );
    out.push({ table: w.table, cols, dbDefault });
  }
  return out;
}

/** `descriptor.outputs.write_inventory.statements` when it is a real number, else null. */
function declaredStatements(descriptor) {
  const inv = descriptor && descriptor.outputs ? descriptor.outputs.write_inventory : null;
  return inv && typeof inv.statements === 'number' && Number.isFinite(inv.statements)
    ? inv.statements
    : null;
}

/** `touched` with non-object members defaulted, so a malformed trace never throws. */
function touchedOf(trace) {
  const t = trace && typeof trace.touched === 'object' && trace.touched ? trace.touched : {};
  return {
    reads: t.reads && typeof t.reads === 'object' ? t.reads : {},
    writes: t.writes && typeof t.writes === 'object' ? t.writes : {},
  };
}

/**
 * A STEP write: `kind === 'write'` whose resolver recorded at least one non-excluded relation
 * (`writes` has ≥ 1 key). A write whose every target was runner-owned/excluded (Spec 124 R-BG:
 * the runner's own `pipeline_runs` ledger INSERT/UPDATE of a STANDALONE run, `schema_migrations`,
 * …) carries `writes: {}` and is NOT a step write — same false-positive class as 4cb26dc7. It
 * must not be counted by check (c) nor derive the observed txn_scope of check (d).
 */
function isStepWrite(s) {
  return !!s && s.kind === 'write' && !!s.writes && typeof s.writes === 'object'
    && Object.keys(s.writes).length > 0;
}

/** The fingerprints of a statement list that are step writes, deduped. */
function stepWriteFingerprints(list) {
  const fps = new Set();
  for (const fp of Array.isArray(list) ? list : []) {
    if (typeof fp === 'string') fps.add(fp);
  }
  return fps;
}

/**
 * (d) observed `txn_scope`, per the contract's closed four-value set. `null` when the trace
 * has no step write at all (the caller gates this on "has >= 1 write" before looking). Since
 * Spec 124 R-BG the runner's own excluded-only ledger writes are ignored on BOTH sides: they
 * neither close a transaction block that only ledger writes opened, nor count as autocommit.
 */
function observedTxnScope(trace) {
  const statements = Array.isArray(trace && trace.statements) ? trace.statements : [];
  const stepFps = new Set();
  for (const s of statements) {
    if (isStepWrite(s) && typeof s.fingerprint === 'string') stepFps.add(s.fingerprint);
  }
  const blocks = Array.isArray(trace && trace.transactions) ? trace.transactions : [];
  const withWrites = blocks.filter((b) => {
    const fps = stepWriteFingerprints(b && b.write_fingerprints);
    for (const fp of fps) if (stepFps.has(fp)) return true;
    return false;
  }).length;
  const autocommit = Array.isArray(trace && trace.autocommit_writes) ? trace.autocommit_writes : [];
  const hasAuto = autocommit.some((fp) => stepFps.has(fp));
  if (withWrites > 0 && hasAuto) return 'mixed';
  if (withWrites >= 2) return 'batch';
  if (withWrites === 1) return 'step';
  if (hasAuto) return 'statement';
  return null;
}

/** (d) declared → observed compatibility, per the contract's table. */
function txnScopeOk(declared, observed) {
  if (declared === 'step') return observed === 'step';
  if (declared === 'batch') return observed === 'step' || observed === 'batch';
  if (declared === 'statement') return observed === 'statement';
  return true; // an undeclared/unknown scope is out of slice A's closed set
}

/** (g) key grammar for one touched column. */
const gKey = (kind, table, col) => `${kind}.${table}.${col}`;

/** One trace carrying >= 1 write, per "the trace has >=1 write". */
function hasWrite(trace) {
  return Object.keys(touchedOf(trace).writes).length > 0;
}

/**
 * (a)+(b)+(c)+(d) for ONE post trace. The caller has already skipped a stale trace.
 * @returns {string[]} violation strings, without rows for a trace with no writes at all.
 */
function checkTraceAgainstDescriptor(slug, descriptor, trace) {
  const rows = [];
  const touched = touchedOf(trace);
  const tables = declaredTables(descriptor);
  const reads = declaredReads(descriptor);

  // (a) traced ⊆ declared, for reads AND writes alike. Declared columns are the UNION of
  // `inputs.reads.tables[]` and `outputs.writes[]` — a traced write to a declared column is
  // declared too (brief §(a)); `*` in a read column list means the whole table.
  const declaredCols = new Map();
  const whole = new Set();
  for (const r of reads) {
    if (isWholeTable(r.cols)) whole.add(r.table);
    const set = declaredCols.get(r.table) || new Set();
    for (const c of r.cols) if (c !== '*') set.add(c);
    declaredCols.set(r.table, set);
  }
  for (const w of declaredWrites(descriptor)) {
    const set = declaredCols.get(w.table) || new Set();
    for (const c of w.cols) set.add(c);
    declaredCols.set(w.table, set);
  }
  for (const kind of ['reads', 'writes']) {
    for (const [table, cols] of Object.entries(touched[kind])) {
      if (!tables.has(table)) {
        rows.push(`FAIL:WITNESS:${slug}:a:${table}.*`); // one row per table, not per column
        continue;
      }
      if (whole.has(table)) continue;
      const allowed = declaredCols.get(table) || new Set();
      for (const col of Array.isArray(cols) ? cols : []) {
        if (!allowed.has(col)) rows.push(`FAIL:WITNESS:${slug}:a:${table}.${col}`);
      }
    }
  }

  // (b)+(c)+(d) only when the invocation actually wrote something.
  if (!hasWrite(trace)) return rows;

  const tracedWriteTables = new Set(Object.keys(touched.writes));
  const declaredWriteTables = new Set(declaredWrites(descriptor).map((w) => w.table));
  for (const table of tracedWriteTables) {
    if (!declaredWriteTables.has(table)) rows.push(`FAIL:WITNESS:${slug}:b:${table}`);
  }
  for (const table of declaredWriteTables) {
    if (!tracedWriteTables.has(table)) {
      rows.push(`FAIL:WITNESS:${slug}:b:${table}`);
      continue; // a table the trace never wrote yields no per-column row
    }
    const tracedCols = new Set(Array.isArray(touched.writes[table]) ? touched.writes[table] : []);
    const declared = declaredWrites(descriptor).find((w) => w.table === table);
    for (const col of declared ? declared.cols : []) {
      // db_default: NOT required in the traced write, and a traced write of it IS a
      // violation (same row grammar) — the declaration is checked both ways (WF3 C1).
      const isDbDefault = declared.dbDefault.has(col);
      if (isDbDefault ? tracedCols.has(col) : !tracedCols.has(col)) {
        rows.push(`FAIL:WITNESS:${slug}:b:${table}.${col}`);
      }
    }
  }

  // (c) distinct fingerprint count of STEP writes vs write_inventory.statements. A `kind:'write'`
  // statement whose only targets were excluded (runner-owned ledger etc., Spec 124 R-BG) is not
  // a step write and is not counted here.
  const declaredCount = declaredStatements(descriptor);
  if (declaredCount !== null) {
    const fp = new Set();
    for (const s of Array.isArray(trace && trace.statements) ? trace.statements : []) {
      if (isStepWrite(s) && typeof s.fingerprint === 'string') fp.add(s.fingerprint);
    }
    if (fp.size !== declaredCount) {
      rows.push(`FAIL:WITNESS:${slug}:c:statements:${declaredCount}!=${fp.size}`);
    }
  }

  // (d) declared txn_scope vs observed, when the descriptor declares one.
  const declaredScope = descriptor && descriptor.execution ? descriptor.execution.txn_scope : null;
  if (typeof declaredScope === 'string') {
    const observed = observedTxnScope(trace);
    if (observed && !txnScopeOk(declaredScope, observed)) {
      rows.push(`FAIL:WITNESS:${slug}:d:txn_scope:${declaredScope}:${observed}`);
    }
  }

  return rows;
}

/** (g) one-way PRE → POST, per invocation present in BOTH trace maps. */
function checkOneWay(slug, pre, post, explainedDiffs) {
  const rows = [];
  const explained = new Set(Array.isArray(explainedDiffs) ? explainedDiffs : []);
  const preTouched = touchedOf(pre);
  const postTouched = touchedOf(post);
  for (const kind of ['reads', 'writes']) {
    for (const [table, cols] of Object.entries(preTouched[kind])) {
      const postCols = new Set(
        Array.isArray(postTouched[kind][table]) ? postTouched[kind][table] : [],
      );
      for (const col of Array.isArray(cols) ? cols : []) {
        const key = gKey(kind, table, col);
        if (postCols.has(col) || explained.has(key)) continue;
        rows.push(`FAIL:WITNESS:${slug}:g:${key}`);
      }
    }
  }
  return rows;
}

/** PRODUCER: a `pipeline_runs` read filtered to completed-only (case-insensitive, ws-tolerant). */
const COMPLETED_ONLY_RE = /status\s*=\s*'completed'/i;
const COMPLETED_ANY_RE = /completed_with_warnings/i;

/**
 * SQL text with comments blanked (WF3 C1, O-7): a `--` or block comment must not satisfy
 * the PRODUCER pattern without its intent. String literals ('…', '' escapes) and
 * dollar-quoted bodies ($tag$…$tag$) are kept verbatim, so a `--` inside them is text.
 */
const SQL_TOKEN_RE = /'(?:[^']|'')*'|\$([A-Za-z_][A-Za-z_0-9]*)?\$[\s\S]*?\$\1\$|--[^\n]*|\/\*[\s\S]*?\*\//g;
function stripSqlComments(text) {
  return text.replace(SQL_TOKEN_RE, (m) => (m.startsWith('--') || m.startsWith('/*') ? ' ' : m));
}

function producerRows(slug, trace) {
  const rows = [];
  const statements = Array.isArray(trace && trace.statements) ? trace.statements : [];
  for (const s of statements) {
    if (!s || typeof s.text !== 'string') continue;
    const text = stripSqlComments(s.text);
    if (!COMPLETED_ONLY_RE.test(text)) continue;
    if (COMPLETED_ANY_RE.test(text)) continue;
    const params = Array.isArray(s.params) ? s.params : [];
    const first = Array.isArray(params[0]) && params[0].length > 0 ? params[0][0] : null;
    rows.push(`FAIL:PRODUCER:${slug}:${first ?? '?'}:status`);
  }
  return rows;
}

/**
 * Gate #44 (slice A) for ONE slug.
 *
 * @param {{slug: string, descriptor: unknown, status: 'pending'|'converted',
 *   currentFingerprint: string, postTraces: Record<string, object>,
 *   preTraces: Record<string, object>, explainedDiffs: string[]}} args
 * @returns {{answer: string, rows: string[], hardStop: boolean}}
 */
export function evaluateWitness({
  slug,
  descriptor,
  status,
  currentFingerprint,
  postTraces,
  preTraces,
  explainedDiffs,
} = {}) {
  const posts = postTraces && typeof postTraces === 'object' ? postTraces : {};
  const pres = preTraces && typeof preTraces === 'object' ? preTraces : {};
  const invocations = Object.keys(posts);
  const rows = [];

  if (invocations.length === 0) {
    // Nothing captured at all: not a FAIL, and nothing else is evaluated.
    rows.push(`UNWITNESSED:${slug}`);
  } else {
    for (const invocation of invocations) {
      const trace = posts[invocation] || {};
      const errors = Array.isArray(trace.errors) ? trace.errors : [];
      for (const err of errors) rows.push(`FAIL:INPUT:${slug}:${invocation}:${err}`);
      if (trace.source_fingerprint !== currentFingerprint) {
        // (f) stale: skip (a)–(d) for this trace entirely.
        rows.push(`FAIL:STALE:${slug}:${invocation}`);
        continue;
      }
      rows.push(...checkTraceAgainstDescriptor(slug, descriptor, trace));
      rows.push(...producerRows(slug, trace));
    }
  }

  for (const invocation of Object.keys(pres)) {
    if (!Object.prototype.hasOwnProperty.call(posts, invocation)) continue;
    rows.push(...checkOneWay(slug, pres[invocation] || {}, posts[invocation] || {}, explainedDiffs));
  }

  const unique = [...new Set(rows)].sort();
  return {
    answer: unique.length === 0 ? 'PASS' : unique[0],
    rows: unique,
    hardStop: status === 'pending' && unique.some((r) => r.startsWith(FAIL_PREFIX)),
  };
}

/** One built-in red/green pair: a fully-declared trace passes, an undeclared read fails. */
export function selfTest() {
  const descriptor = {
    inputs: { reads: { tables: [{ table: 'parcels', columns: ['id', 'geom'] }] } },
    outputs: {
      writes: [{ table: 'parcels', columns: [{ name: 'a' }, { name: 'b' }] }],
      write_inventory: { statements: 1 },
    },
    execution: { txn_scope: 'step' },
  };
  const trace = (reads) => ({
    source_fingerprint: 'fp',
    statements: [
      {
        fingerprint: 'w1',
        kind: 'write',
        count: 1,
        reads: { parcels: ['id'] },
        writes: { parcels: ['a', 'b'] },
        excluded: [],
        error: null,
      },
    ],
    transactions: [{ client: '1:1', write_fingerprints: ['w1'] }],
    autocommit_writes: [],
    touched: { reads, writes: { parcels: ['a', 'b'] } },
    errors: [],
  });
  const base = {
    slug: 'fixture_step',
    descriptor,
    status: 'pending',
    currentFingerprint: 'fp',
    preTraces: {},
    explainedDiffs: [],
  };
  const green = evaluateWitness({ ...base, postTraces: { fixture_step: trace({ parcels: ['id', 'geom'] }) } });
  const red = evaluateWitness({ ...base, postTraces: { fixture_step: trace({ parcels: ['id', 'geom', 'lot_size_sqm'] }) } });
  const ok = green.rows.length === 0
    && green.answer === 'PASS'
    && green.hardStop === false
    && red.rows.includes('FAIL:WITNESS:fixture_step:a:parcels.lot_size_sqm')
    && red.hardStop === true;
  return {
    ok,
    detail: ok
      ? 'self-test ok: declared trace PASSes; an undeclared read column is a hard-stop FAIL:WITNESS:a row'
      : `self-test FAILED: green=${JSON.stringify(green)} red=${JSON.stringify(red)}`,
  };
}
