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
//   FAIL:WITNESS:<slug>:a:<table>.<col>|a:<table>.* traced read/write not declared (declared = inputs.reads ∪ checks[].reads ∪ writes, R-BJ)
//   FAIL:WITNESS:<slug>:a:unwitnessed:<table>.<col>|.*  a declared read touched by no fresh trace and no fixture record (P1-C4a)
//   FAIL:WITNESS:<slug>:b:<table>[.<col>]           written tables must EQUAL declared write tables
//   FAIL:WITNESS:<slug>:c:statements:<d>!=<t>       distinct write fingerprints vs write_inventory
//   FAIL:WITNESS:<slug>:d:txn_scope:<declared>:<observed>
//   FAIL:WITNESS:<slug>:g:<key>                     PRE key absent from POST and unexplained
//   FAIL:WITNESS:<slug>:e:missing:<step>|e:extra:<step>  inputs.reads.steps != the derived producer set (P1-C5)
//   FAIL:WITNESS:<slug>:full_rescan:arm:<table>.<col>    an invalidates[] row declares `by: "full_rescan"` but the descriptor's write targets do NOT re-derive it every run (O4 fold 14)
//   UNWITNESSED:<slug>:full_rescan:<table>.<col>         ...and no fresh post trace witnesses the write (declared but unproven)
//   FAIL:PRODUCER:<slug>:<invocation-param>:status  a pipeline_runs read filtered to completed-only
//   FAIL:FIXTURE:<slug>:<suite>:<item>              a fixture-guard violation (a:<t>.<c>) or input:<error> (P1-C4a)
//
// OUT of slice A (still implemented later): the C9 marker string — a later commit
// owns those. The declared ⊆ witnessed half of (a) IS armed here at P1-C4a (it needs a fresh post
// trace, so a trace-less slug stays UNWITNESSED). `status === 'converted'` is REPORT-ONLY until
// P1-C8/C9, so `hardStop` is only ever true for a `pending` slug whose rows carry a FAIL:.
// Check (e) lands at P1-C5: report-only for converted slugs, hard for a pending slug (the same
// hardStop rule), until P1-C9.

const FAIL_PREFIX = 'FAIL:';

/** A column list is "whole table" when it carries `*` (brief §(a)); true only for arrays. */
function isWholeTable(cols) {
  return Array.isArray(cols) && cols.includes('*');
}

/** `descriptor.inputs.reads.tables[]` → `[{table, cols: string[]}]`; `*` preserved verbatim. */
export function declaredReads(descriptor) {
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

/**
 * R-BJ (fold 9 C7-1; MQ-A9 a): every `checks[i].reads` entry → `[{table, cols}]` — the reads a check's
 * own measurement executes, declared OUTSIDE inputs.reads (never an ordering edge). #44 (a) accounts a
 * traced read against inputs.reads ∪ checks[].reads; the declared ⊆ witnessed half stays inputs-only.
 */
export function declaredCheckReads(descriptor) {
  const checks = descriptor && Array.isArray(descriptor.checks) ? descriptor.checks : [];
  const out = [];
  for (const c of checks) {
    for (const r of c && Array.isArray(c.reads) ? c.reads : []) {
      if (!r || typeof r.table !== 'string') continue;
      out.push({ table: r.table, cols: Array.isArray(r.columns) ? r.columns : ['*'] });
    }
  }
  return out;
}

/** Every declared table a write may target: `outputs.writes[].table` ∪ the read tables. */
export function declaredTables(descriptor) {
  const set = new Set(declaredReads(descriptor).map((r) => r.table));
  for (const w of declaredWrites(descriptor)) set.add(w.table);
  return set;
}

/** `outputs.writes[]` → `[{table, cols: string[], dbDefault: Set<string>}]` with `columns[].name`. */
export function declaredWrites(descriptor) {
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
 * (a) traced ⊆ declared, for reads AND writes alike. Declared columns are the UNION of
 * `inputs.reads.tables[]` and `outputs.writes[]` — a traced write to a declared column is
 * declared too (brief §(a)); `*` in a read column list means the whole table.
 * Declared = inputs.reads ∪ outputs.writes; checks[].reads (R-BJ) additionally allows traced READS only (amendment A1).
 *
 * @param {unknown} descriptor
 * @param {{reads?: object, writes?: object}} touched a trace's `touched` map (may be malformed)
 * @returns {string[]} sorted unique items WITHOUT the `FAIL:WITNESS:<slug>:` prefix:
 *   `a:<table>.*` for an undeclared table (one per table, not per column),
 *   `a:<table>.<col>` for a declared table's undeclared column.
 */
export function undeclaredItems(descriptor, touched) {
  const t = touchedOf({ touched });
  const tables = declaredTables(descriptor);
  const reads = declaredReads(descriptor);
  const items = [];

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
  // R-BJ / MQ-A9 amendment A1: checks[].reads widens the allowed traced READS only — never declaredTables
  // and never the writes-accepted set (a traced WRITE to a check-read column still fails (a)).
  const checkCols = new Map();
  const checkWhole = new Set();
  for (const r of declaredCheckReads(descriptor)) {
    if (isWholeTable(r.cols)) checkWhole.add(r.table);
    const set = checkCols.get(r.table) || new Set();
    for (const c of r.cols) if (c !== '*') set.add(c);
    checkCols.set(r.table, set);
  }
  for (const kind of ['reads', 'writes']) {
    for (const [table, cols] of Object.entries(t[kind])) {
      const checkRead = kind === 'reads' && checkCols.has(table);
      if (!tables.has(table) && !checkRead) {
        items.push(`a:${table}.*`); // one row per table, not per column
        continue;
      }
      if (whole.has(table) || (kind === 'reads' && checkWhole.has(table))) continue;
      const allowed = new Set([...(declaredCols.get(table) || []), ...(kind === 'reads' ? (checkCols.get(table) || []) : [])]);
      for (const col of Array.isArray(cols) ? cols : []) {
        if (!allowed.has(col)) items.push(`a:${table}.${col}`);
      }
    }
  }
  return [...new Set(items)].sort();
}

/**
 * The declared ⊆ witnessed half of (a): every DECLARED READ column absent from the witnessed
 * union yields an item. A `*` read is witnessed only when its table appears in
 * `witnessed.reads` OR `witnessed.writes` (a whole-table read covers every column); one column
 * of a `*`-less read is witnessed when it appears in `witnessed.reads[table] ∪
 * witnessed.writes[table]`.
 *
 * @param {unknown} descriptor
 * @param {{reads?: Record<string, string[]>, writes?: Record<string, string[]>}} witnessed
 * @returns {string[]} sorted unique items `a:unwitnessed:<table>.<col>` / `a:unwitnessed:<table>.*`
 */
export function unwitnessedItems(descriptor, witnessed) {
  const w = witnessed && typeof witnessed === 'object' ? witnessed : {};
  const wReads = w.reads && typeof w.reads === 'object' ? w.reads : {};
  const wWrites = w.writes && typeof w.writes === 'object' ? w.writes : {};
  const tablesSeen = new Set([...Object.keys(wReads), ...Object.keys(wWrites)]);
  const colUnion = (table) => new Set([
    ...(Array.isArray(wReads[table]) ? wReads[table] : []),
    ...(Array.isArray(wWrites[table]) ? wWrites[table] : []),
  ]);
  const items = [];
  for (const r of declaredReads(descriptor)) {
    if (isWholeTable(r.cols)) {
      if (!tablesSeen.has(r.table)) items.push(`a:unwitnessed:${r.table}.*`);
      continue;
    }
    const seen = colUnion(r.table);
    for (const col of r.cols) {
      if (col === '*') continue;
      if (!seen.has(col)) items.push(`a:unwitnessed:${r.table}.${col}`);
    }
  }
  return [...new Set(items)].sort();
}

/**
 * (a)+(b)+(c)+(d) for ONE post trace. The caller has already skipped a stale trace.
 * @returns {string[]} violation strings, without rows for a trace with no writes at all.
 */
function checkTraceAgainstDescriptor(slug, descriptor, trace) {
  const rows = [];
  const touched = touchedOf(trace);

  // (a) traced ⊆ declared (see undeclaredItems).
  for (const item of undeclaredItems(descriptor, touched)) rows.push(`FAIL:WITNESS:${slug}:${item}`);

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
 * Gate #44 (e) (plan PHASE 1 item 3(e), Fold 9 D-B/D-E): `inputs.reads.steps` must EQUAL the
 * derived producer set the caller computes with `scripts/lib/ledger.js derivedReadsSteps` over
 * `effectiveLedger()` (column level, chain-scoped, declared reads). Pure: the caller hands in the
 * list. `declared` = unique `descriptor.inputs.reads.steps[].step` strings (missing/malformed →
 * `[]`); `derivedSet` = unique strings of `derived`.
 *
 * @param {unknown} descriptor
 * @param {string[]} derived the caller-computed derived producer-step set
 * @returns {string[]} sorted unique items WITHOUT the `FAIL:WITNESS:<slug>:` prefix:
 *   `e:missing:<p>` for each derived `p` not declared, `e:extra:<s>` for each declared `s`
 *   not derived.
 */
export function readsStepsItems(descriptor, derived) {
  const steps = descriptor && descriptor.inputs && descriptor.inputs.reads
    ? descriptor.inputs.reads.steps
    : null;
  const declaredSet = new Set();
  for (const s of Array.isArray(steps) ? steps : []) {
    if (s && typeof s.step === 'string') declaredSet.add(s.step);
  }
  const derivedSet = new Set();
  for (const d of Array.isArray(derived) ? derived : []) {
    if (typeof d === 'string') derivedSet.add(d);
  }
  const items = [];
  for (const p of derivedSet) if (!declaredSet.has(p)) items.push(`e:missing:${p}`);
  for (const s of declaredSet) if (!derivedSet.has(s)) items.push(`e:extra:${s}`);
  return [...new Set(items)].sort();
}

/** `IS NULL` / `NOT EXISTS` markers in a declared write scope (case-insensitive). */
const IS_NULL_RE = /\bIS\s+NULL\b/i;
const NOT_EXISTS_RE = /\bNOT\s+EXISTS\b/i;

/**
 * `outputs.writes[]` entries (with their index) whose table is `table` and whose
 * `columns[].name` includes `column`.
 * @returns {Array<{index: number, write: object}>}
 */
function writersFor(writes, table, column) {
  const out = [];
  writes.forEach((w, index) => {
    if (!w || w.table !== table) return;
    const cols = Array.isArray(w.columns) ? w.columns : [];
    if (cols.some((c) => c && c.name === column)) out.push({ index, write: w });
  });
  return out;
}

/**
 * A `write_discipline.scope` as a string, or `''` for a missing/non-string/`'none'` scope.
 * @returns {string}
 */
function disciplineScope(write) {
  const wd = write && write.write_discipline;
  const scope = wd ? wd.scope : null;
  return typeof scope === 'string' && scope !== 'none' ? scope : '';
}

/**
 * Does ONE raw post-trace object witness a write of `<table>.<column>`? TRUE iff some
 * `statements[]` entry has `kind === 'write'` whose `writes[<table>]` array includes
 * `<column>`.
 *
 * @param {unknown} trace a raw post-trace object
 * @param {string} table
 * @param {string} column
 * @returns {boolean}
 */
function traceWitnessesWrite(trace, table, column) {
  if (!trace || typeof trace !== 'object') return false;
  const statements = Array.isArray(trace.statements) ? trace.statements : [];
  for (const s of statements) {
    if (!s || s.kind !== 'write') continue;
    const writes = s.writes;
    if (writes && Array.isArray(writes[table]) && writes[table].includes(column)) return true;
  }
  return false;
}

/**
 * The WITNESSED half: does any fresh trace write `<table>.<column>`?
 *
 * Two input shapes are accepted, so both a direct caller and `evaluateWitness` can use the
 * same rule: a flat `{table: string[]}` write union (the `touchedOf` shape, e.g. the test
 * fixtures) is consulted by table key; otherwise each member of the map/array is treated as a
 * raw post-trace object and checked statement-by-statement (`kind === 'write'`).
 *
 * @param {Array<object>|Record<string, object>} freshTraces
 * @param {string} table
 * @param {string} column
 * @returns {boolean}
 */
function witnessedBy(freshTraces, table, column) {
  if (!freshTraces || typeof freshTraces !== 'object') return false;
  const values = Array.isArray(freshTraces) ? freshTraces : Object.values(freshTraces);
  const flat = !Array.isArray(freshTraces)
    && values.length > 0
    && values.every((v) => Array.isArray(v));
  if (flat) return Array.isArray(freshTraces[table]) && freshTraces[table].includes(column);
  return values.some((t) => traceWitnessesWrite(t, table, column));
}

/**
 * O4 ruling 2026-10-03, registry-truth fold 14 — the `full_rescan` EVIDENCE rule.
 *
 * An `outputs.invalidates[]` row with `by === 'full_rescan'` claims the writer re-derives the
 * named column on EVERY run, so no other invalidator is needed. That claim is ARMED only when
 * BOTH halves hold:
 *   (1) DECLARED — the descriptor's own write targets really do a full rewrite. For an ENRICHER
 *       this is its `execution.phases[]`: every phase whose `writes_ref` points at a write target
 *       that writes `<table>.<column>` must declare `scope === 'full'`, and at least one such
 *       phase must exist. For any other archetype, `staleness.mode_select === 'none'` AND every
 *       write target writing `<table>.<column>` has a `write_discipline.scope` carrying neither an
 *       `IS NULL` predicate nor a `NOT EXISTS` anti-join (case-insensitive; `IS NOT NULL` /
 *       `IS DISTINCT FROM` are fine) — a narrowed scope is the incremental write, not a full one.
 *   (2) WITNESSED — at least one FRESH (non-stale) post trace writes `<table>.<column>`.
 *
 * UNWITNESSED until traced: a declared-but-unwitnessed row is an open obligation, not a pass.
 *
 * @param {unknown} descriptor the step descriptor
 * @param {Array<object>|Record<string, object>} freshTraces the FRESH (non-stale) post traces —
 *   raw trace objects (`{statements: [...]}`) or a flat `{table: string[]}` write union
 * @returns {string[]} sorted unique items WITHOUT the `FAIL:WITNESS:<slug>:` prefix:
 *   `full_rescan:arm:<table>.<column>` when (1) FAILS (including when no declared write target
 *   writes the column at all), `full_rescan:unwitnessed:<table>.<column>` when (1) holds and (2)
 *   fails; NOTHING for an armed row, a row without `by`, or a row with a different `by`.
 */
export function fullRescanItems(descriptor, freshTraces) {
  const invalidates = descriptor && descriptor.outputs
    && Array.isArray(descriptor.outputs.invalidates)
    ? descriptor.outputs.invalidates
    : [];
  const writes = descriptor && descriptor.outputs && Array.isArray(descriptor.outputs.writes)
    ? descriptor.outputs.writes
    : [];
  const archetype = descriptor && descriptor.identity ? descriptor.identity.archetype : null;
  const modeSelect = descriptor && descriptor.staleness ? descriptor.staleness.mode_select : null;
  const phases = descriptor && descriptor.execution && Array.isArray(descriptor.execution.phases)
    ? descriptor.execution.phases
    : [];

  const items = [];
  for (const row of invalidates) {
    if (!row || row.by !== 'full_rescan') continue;
    const table = row.table;
    const column = row.column;
    if (typeof table !== 'string' || typeof column !== 'string') continue;
    const writers = writersFor(writes, table, column);

    let armed;
    if (archetype === 'ENRICHER') {
      const writerIdx = new Set(writers.map((w) => w.index));
      const filling = phases.filter(
        (p) => p && typeof p === 'object' && writerIdx.has(p.writes_ref),
      );
      armed = writers.length > 0
        && filling.length > 0
        && filling.every((p) => p.scope === 'full');
    } else {
      armed = writers.length > 0
        && modeSelect === 'none'
        && writers.every(({ write }) => {
          const scope = disciplineScope(write);
          return !IS_NULL_RE.test(scope) && !NOT_EXISTS_RE.test(scope);
        });
    }

    if (!armed) {
      items.push(`full_rescan:arm:${table}.${column}`);
      continue;
    }
    if (!witnessedBy(freshTraces, table, column)) {
      items.push(`full_rescan:unwitnessed:${table}.${column}`);
    }
  }
  return [...new Set(items)].sort();
}

/**
 * Gate #44 (slice A) for ONE slug.
 *
 * @param {{slug: string, descriptor: unknown, status: 'pending'|'converted',
 *   currentFingerprint: string, postTraces: Record<string, object>,
 *   preTraces: Record<string, object>, explainedDiffs: string[],
 *   derivedReadsSteps?: string[],
 *   fixtureRecords?: Record<string, {reads: object, writes: object,
 *     violations: string[], errors: string[]}>}} args
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
  derivedReadsSteps,
  fixtureRecords,
} = {}) {
  const posts = postTraces && typeof postTraces === 'object' ? postTraces : {};
  const pres = preTraces && typeof preTraces === 'object' ? preTraces : {};
  const fixtures = fixtureRecords && typeof fixtureRecords === 'object' && !Array.isArray(fixtureRecords)
    ? fixtureRecords
    : {};
  const invocations = Object.keys(posts);
  const rows = [];
  const witnessedTouched = [];
  const freshTraces = [];

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
      witnessedTouched.push(touchedOf(trace));
      freshTraces.push(trace);
    }
  }

  // (a) declared ⊆ witnessed — ONLY when at least one fresh (non-stale) post trace was
  // evaluated. witnessed = the column union of those traces' `touched` maps ∪ every fixture
  // suite's reads/writes, so a column proven read by the fixture guard counts too.
  if (witnessedTouched.length > 0) {
    const witnessed = { reads: {}, writes: {} };
    const merge = (kind, table, cols) => {
      if (typeof table !== 'string' || !Array.isArray(cols)) return;
      const set = new Set(witnessed[kind][table] || []);
      for (const c of cols) if (typeof c === 'string') set.add(c);
      witnessed[kind][table] = [...set];
    };
    for (const t of witnessedTouched) {
      for (const kind of ['reads', 'writes']) {
        for (const [table, cols] of Object.entries(t[kind])) merge(kind, table, cols);
      }
    }
    for (const suite of Object.keys(fixtures).sort()) {
      const rec = fixtures[suite];
      if (!rec || typeof rec !== 'object') continue;
      for (const kind of ['reads', 'writes']) {
        const map = rec[kind] && typeof rec[kind] === 'object' ? rec[kind] : {};
        for (const [table, cols] of Object.entries(map)) merge(kind, table, cols);
      }
    }
    for (const item of unwitnessedItems(descriptor, witnessed)) {
      rows.push(`FAIL:WITNESS:${slug}:${item}`);
    }
  }

  // O4 fold 14 — full_rescan EVIDENCE. Declaration-only for the arm half (so it fires with no
  // traces at all); the unwitnessed half uses the FRESH (non-stale) post traces only.
  for (const item of fullRescanItems(descriptor, freshTraces)) {
    if (item.startsWith('full_rescan:arm:')) {
      rows.push(`FAIL:WITNESS:${slug}:${item}`);
    } else {
      // `full_rescan:unwitnessed:<t>.<c>` → `UNWITNESSED:<slug>:full_rescan:<t>.<c>`
      rows.push(`UNWITNESSED:${slug}:full_rescan:${item.slice('full_rescan:unwitnessed:'.length)}`);
    }
  }

  // FIXTURE GUARD rows — emitted for every suite whether or not the slug has any trace.
  for (const suite of Object.keys(fixtures).sort()) {
    const rec = fixtures[suite];
    if (!rec || typeof rec !== 'object') continue;
    for (const v of Array.isArray(rec.violations) ? rec.violations : []) {
      if (typeof v === 'string') rows.push(`FAIL:FIXTURE:${slug}:${suite}:${v}`);
    }
    for (const e of Array.isArray(rec.errors) ? rec.errors : []) {
      if (typeof e === 'string') rows.push(`FAIL:FIXTURE:${slug}:${suite}:input:${e}`);
    }
  }

  for (const invocation of Object.keys(pres)) {
    if (!Object.prototype.hasOwnProperty.call(posts, invocation)) continue;
    rows.push(...checkOneWay(slug, pres[invocation] || {}, posts[invocation] || {}, explainedDiffs));
  }

  // (e) reads.steps == derived (P1-C5). Evaluated from declarations, so it runs with or without
  // post traces; absent input → not evaluated (callers that do not pass it are unchanged).
  if (Array.isArray(derivedReadsSteps)) {
    for (const item of readsStepsItems(descriptor, derivedReadsSteps)) {
      rows.push(`FAIL:WITNESS:${slug}:${item}`);
    }
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
