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
//   FAIL:WITNESS:<slug>:b:<table>[.<col>]           written tables must EQUAL declared write tables (R-HA: a derived
//                                                    target is not required per trace)
//   FAIL:WITNESS:<slug>:b:derived-unwitnessed:<table>  an R-DY derived target no fresh post trace wrote (R-HA)
//   FAIL:WITNESS:<slug>:c:statements:<d>!=<t>       distinct write fingerprints vs write_inventory (by_mode[mode] when declared, R-BK/R-DB)
//   FAIL:WITNESS:<slug>:c:statements:<lo>..<hi>!=<t>  the R-HA range: statements .. statements + derived_statements
//   FAIL:INPUT:<slug>:<invocation>:c:mode-unresolved  by_mode declared but the invocation's resolved mode is unknown (never a guess)
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
// trace, so a trace-less slug stays UNWITNESSED). Since P1-C9 (folded into LDG-10, Spec 124 R-DI,
// 2026-10-17) `hardStop` is true for a pending OR converted slug whose rows carry a FAIL:, check (e)
// included — the witnessed ledger IS the effective ledger.

import { writeInventoryForMode, declaresWriteInventoryByMode } from './schema-homes.mjs';

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
  // #44 G13 (Spec 124 R-BL(iv), McDonald's Airtight V3): an outputs.invalidates[] row carrying
  // set_null_on_change_of is EXECUTED by codegen (`<column> = CASE … THEN NULL` in that write's DO UPDATE
  // SET), so its column is this step's declared write — the same rule deriveMeta applies
  // (scripts/lib/step/index.js, the LDG-10 invalidates loop). Other `by` values are someone else's write.
  const invalidates = descriptor && descriptor.outputs && Array.isArray(descriptor.outputs.invalidates)
    ? descriptor.outputs.invalidates
    : [];
  for (const inv of invalidates) {
    // RE-FREEZE #37 (Spec 124 R-EA): a by "set_null_unless" row is the same codegen-executed write.
    const executed = typeof inv?.set_null_on_change_of === 'string' || (inv?.by === 'set_null_unless' && inv?.set_null_unless);
    if (!inv || typeof inv.table !== 'string' || typeof inv.column !== 'string' || !executed) continue;
    let entry = out.find((e) => e.table === inv.table);
    if (!entry) {
      entry = { table: inv.table, cols: [], dbDefault: new Set() };
      out.push(entry);
    }
    if (!entry.cols.includes(inv.column)) entry.cols.push(inv.column);
  }
  return out;
}

/**
 * R-HA (Spec 124, provisional id; operator y 2026-10-20): the R-DY DERIVED write targets
 * (`outputs.writes[i].derive`), written only when their prior-state read differs. Pure.
 */
export function derivedWriteTables(descriptor) {
  const writes = descriptor && descriptor.outputs && Array.isArray(descriptor.outputs.writes) ? descriptor.outputs.writes : [];
  return new Set(writes.filter((w) => w && typeof w.table === 'string' && w.derive && typeof w.derive === 'object').map((w) => w.table));
}

/** R-HA: `write_inventory.derived_statements` when declared (an integer >= 0), else null. Pure. */
function derivedStatements(descriptor) {
  const inv = descriptor && descriptor.outputs && descriptor.outputs.write_inventory;
  return inv && Number.isInteger(inv.derived_statements) && inv.derived_statements >= 0 ? inv.derived_statements : null;
}

/**
 * #44 (c) expected count for ONE invocation (Spec 124 R-BK, wired by R-DB — McDonald's Airtight V3):
 * `writeInventoryForMode(descriptor, mode)` — `by_mode[mode].statements` when declared, else the
 * mode-agnostic `statements`. A by_mode declarer whose mode is unresolved has NO expected count
 * (`{unresolved: true}`), which the caller reports as FAIL:INPUT rather than guessing a mode.
 */
function expectedStatements(descriptor, mode) {
  if (declaresWriteInventoryByMode(descriptor) && mode === null) return { count: null, unresolved: true };
  return { count: writeInventoryForMode(descriptor, mode === null ? undefined : mode), unresolved: false };
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

/**
 * LDG-10 (Spec 124 R-DI, McDonald's Airtight V3): the descriptor's DECLARED mixture of write
 * disciplines. A step whose execution scope is transactional (`step`/`batch`) and which declares at
 * least one `outputs.writes[].write_discipline.txn_scope` of `none`/`statement` (enrich_parcels pass 5,
 * a separate autocommit connection by design) declares a mixed trace, so an observed `mixed` is the
 * declaration witnessed, not a drift. Every other combination keeps the strict table below.
 */
function declaresMixedScope(descriptor) {
  const exec = descriptor && descriptor.execution ? descriptor.execution.txn_scope : null;
  if (exec !== 'step' && exec !== 'batch') return false;
  const writes = descriptor && descriptor.outputs && Array.isArray(descriptor.outputs.writes) ? descriptor.outputs.writes : [];
  return writes.some((w) => {
    const s = w && w.write_discipline && typeof w.write_discipline === 'object' ? w.write_discipline.txn_scope : null;
    return s === 'none' || s === 'statement';
  });
}

/**
 * LDG-10 (Spec 124 R-DI; R-BG "observes what a step really does", R-BZ attribution): a statement whose
 * fingerprint is in the RUNNER set is the runner's own SQL (e.g. scope-retire.js's pass3_scope hygiene on
 * a step-owned table), so it is the runner's in checks (a) traced ⊆ declared, (b), (c) and (d) — never
 * the step's — exactly as attributionRows already treats it for excluded tables. The returned trace keeps
 * every other statement; `touched` is re-derived the way assemble.cjs builds it (reads = reads ∪ writes),
 * transaction blocks and autocommit lists drop the runner fingerprints. The declared ⊆ witnessed half of
 * (a) still reads the FULL trace (a column the runner really touched stays witnessed).
 */
export function withoutRunnerStatements(trace, runnerSet) {
  if (!trace || typeof trace !== 'object' || !runnerSet || typeof runnerSet.has !== 'function' || runnerSet.size === 0) return trace;
  const all = Array.isArray(trace.statements) ? trace.statements : [];
  const statements = all.filter((s) => !(s && typeof s.fingerprint === 'string' && runnerSet.has(s.fingerprint)));
  if (statements.length === all.length) return trace;
  const union = (lists) => {
    const out = {};
    for (const map of lists) {
      for (const [table, cols] of Object.entries(map && typeof map === 'object' ? map : {})) {
        const set = new Set(out[table] || []);
        for (const c of Array.isArray(cols) ? cols : []) set.add(c);
        out[table] = [...set].sort();
      }
    }
    return out;
  };
  const writes = union(statements.map((s) => s && s.writes));
  const reads = union([...statements.map((s) => s && s.reads), writes]);
  const keep = (fp) => !(typeof fp === 'string' && runnerSet.has(fp));
  return {
    ...trace,
    statements,
    touched: { reads, writes },
    transactions: (Array.isArray(trace.transactions) ? trace.transactions : []).map((b) => ({
      ...b,
      write_fingerprints: (Array.isArray(b && b.write_fingerprints) ? b.write_fingerprints : []).filter(keep),
    })),
    autocommit_writes: (Array.isArray(trace.autocommit_writes) ? trace.autocommit_writes : []).filter(keep),
  };
}

/**
 * #44 check (h) — version pins are witnessed and verified (Spec 124 R-BL (v), armed after P1-C9 by LDG-10 / R-DI). PURE.
 * For every EVALUATED `staleness.pins[]` row of the READING step (one declaring `op`, `equals` or `bound` —
 * the only pins the runner reads, `producer.js` evaluatePins; a bare watermark pin is a producer-edge
 * declaration, R-BL (i), and is not read):
 *   h:unwitnessed:<producer>.<stamp>  — no fresh trace statement reads `pipeline_runs` (the runner's pin read; the
 *                                       resolver records `pipeline_runs` as runner-owned, read OR excluded);
 *   h:mismatch:<producer>.<path>:<pinned>!=<stamped> — the pin's `equals` differs from the value at <path> in ANY
 *                                       producer POST golden carrying it (the golden's `summary.records_meta`);
 *   h:unverifiable:<producer>.<path>  — a pin with `equals` whose <path> NO producer POST golden carries (no vacuous
 *                                       pass, lens 13).
 * `producerSummaries`: { <producer>: [POST golden `summary` objects] }; absent → mismatch/unverifiable are not
 * evaluated. h:undeclared is evaluated separately, declaration-driven and narrow (Spec 124 R-DI as amended
 * 2026-10-17): see `undeclaredPinItems` below.
 */
function valueAtPath(obj, dotted) {
  let cur = obj;
  for (const k of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, k)) return { found: false };
    cur = cur[k];
  }
  return { found: true, value: cur };
}

/** Does any fresh trace statement touch `pipeline_runs` (as a read or as a runner-owned exclusion)? */
export function tracesTouchRuns(freshTraces) {
  return (Array.isArray(freshTraces) ? freshTraces : []).some((tr) => (Array.isArray(tr && tr.statements) ? tr.statements : []).some((s) => s
    && ((Array.isArray(s.excluded) && s.excluded.includes('pipeline_runs')) || (s.reads && Object.prototype.hasOwnProperty.call(s.reads, 'pipeline_runs')))));
}

export function pinItems(descriptor, runsTouched, producerSummaries) {
  const pins = descriptor && descriptor.staleness && Array.isArray(descriptor.staleness.pins) ? descriptor.staleness.pins : [];
  const out = [];
  for (const pin of pins) {
    if (!pin || typeof pin.step !== 'string' || typeof pin.stamp !== 'string') continue;
    const evaluated = pin.op !== undefined || pin.equals !== undefined || pin.bound !== undefined;
    if (!evaluated) continue;
    const label = `${pin.step}.${pin.stamp}`;
    if (runsTouched === false) out.push(`h:unwitnessed:${label}`);
    if (pin.equals !== undefined && pin.stamp.startsWith('records_meta.') && producerSummaries && typeof producerSummaries === 'object') {
      const summaries = Array.isArray(producerSummaries[pin.step]) ? producerSummaries[pin.step] : [];
      const found = summaries.map((s) => valueAtPath(s, pin.stamp)).filter((v) => v.found);
      if (found.length === 0) out.push(`h:unverifiable:${label}`);
      for (const v of found) {
        if (String(v.value) !== String(pin.equals)) out.push(`h:mismatch:${label}:${pin.equals}!=${v.value}`);
      }
    }
  }
  return [...new Set(out)].sort();
}

/**
 * #44 check (i) — invalidation resolves (Spec 124 R-DO; LDG-10 edge class 4; 122 §6.4a). PURE, declaration-driven
 * (fires with no traces, like the full_rescan arm). `fleet` = { invalidated: Set<"table.column"> over every converted
 * descriptor's outputs.invalidates[], pinReaders: { <step>: [<reader slugs with a staleness.pins row on it>] } };
 * absent → not evaluated.
 *   i:fill-once:<table>.<column>       — a write_once_backfill target fills the column once and NO converted descriptor
 *                                        declares an invalidator for it (the §6.4a centroid gap class);
 *   i:unresolved:pin:<table>.<column>  — this step's `by:"pin"` invalidator resolves by neither arm: (i) a reader pins
 *                                        this step (R-DO; the link_massing → enrich_parcels form), nor (ii) the row is this
 *                                        step's OWN column (it writes it, same table) and its own staleness.pins[] names
 *                                        another step whose stamp is a column of that same table — the §6.3 watermark read
 *                                        from the reader's side (Spec 124 R-ER, operator y 2026-10-19; classify_coa_scope);
 *   i:unresolved:trigger:<table>.<column> — this step's `by:"trigger"` invalidator has no guards.requires trigger
 *                                        on that table (the runner's precondition probe, cloud:pre declared_guards_present).
 * Exact zero-tolerance; no allowlist.
 */
export function invalidationItems(slug, descriptor, fleet) {
  if (!fleet || !(fleet.invalidated instanceof Set)) return [];
  const out = [];
  const outputs = descriptor && descriptor.outputs ? descriptor.outputs : {};
  for (const w of Array.isArray(outputs.writes) ? outputs.writes : []) {
    if (!w || !w.write_discipline || w.write_discipline.class !== 'write_once_backfill') continue;
    for (const c of Array.isArray(w.columns) ? w.columns : []) {
      const name = c && typeof c === 'object' ? c.name : c;
      if (typeof name !== 'string' || (c && c.written === 'db_default')) continue;
      if (!fleet.invalidated.has(`${w.table}.${name}`)) out.push(`i:fill-once:${w.table}.${name}`);
    }
  }
  const triggers = (descriptor && descriptor.guards && Array.isArray(descriptor.guards.requires) ? descriptor.guards.requires : [])
    .filter((g) => g && g.kind === 'trigger' && typeof g.name === 'string');
  const readers = fleet.pinReaders && Array.isArray(fleet.pinReaders[slug]) ? fleet.pinReaders[slug] : [];
  // R-ER arm (ii): the tables whose columns this step's own pins compare (a pin on another step only).
  const ownPinTables = new Set((descriptor && descriptor.staleness && Array.isArray(descriptor.staleness.pins) ? descriptor.staleness.pins : [])
    .filter((pin) => pin && typeof pin.step === 'string' && pin.step !== slug && typeof pin.stamp === 'string' && pin.stamp.includes('.'))
    .map((pin) => pin.stamp.slice(0, pin.stamp.indexOf('.'))));
  const writesOwn = (table, column) => (Array.isArray(outputs.writes) ? outputs.writes : []).some((w) => w && w.table === table
    && (Array.isArray(w.columns) ? w.columns : []).some((c) => (c && typeof c === 'object' ? c.name : c) === column));
  for (const row of Array.isArray(outputs.invalidates) ? outputs.invalidates : []) {
    if (!row || typeof row.table !== 'string' || typeof row.column !== 'string') continue;
    const label = `${row.table}.${row.column}`;
    const readerSide = ownPinTables.has(row.table) && writesOwn(row.table, row.column);
    if (row.by === 'pin' && readers.length === 0 && !readerSide) out.push(`i:unresolved:pin:${label}`);
    if (row.by === 'trigger' && !triggers.some((g) => g.name.startsWith(`${row.table}.`))) out.push(`i:unresolved:trigger:${label}`);
  }
  return [...new Set(out)].sort();
}

/**
 * #44 (h) h:undeclared, NARROW (Spec 124 R-DI as amended, operator y 2026-10-17; R-BJ). PURE, declaration-driven.
 * `fleet.watermarks` = { "<table>.<column>": [<writer slugs declaring that column source:"run_at">] }.
 *   h:undeclared:<writer>.<table>.<column> — a non-ASSERT/RECORDER step declares an ACQUISITION read
 *     (inputs.reads) of another step's run_at watermark column and has no staleness.pins row on that writer.
 * Excluded by rule: a column the reader writes itself (R-BL(v), the #44 G3 exclusion); an ASSERT's or RECORDER's
 * coverage read (a measurement read, R-BJ). Exact zero-tolerance.
 */
export function undeclaredPinItems(slug, descriptor, fleet) {
  if (!fleet || !fleet.watermarks || typeof fleet.watermarks !== 'object') return [];
  return unpinnedWatermarkReads(slug, descriptor, fleet.watermarks, 'h:undeclared');
}

/**
 * #44 (h) copy window (Spec 124 R-ES, operator y 2026-10-19). PURE. The same derivation as h:undeclared over
 * `fleet.owedWatermarks` — the run_at columns of PENDING producers whose declared stage awaits captures (the legacy
 * shell is still the live writer, W4A-R6 / R-EF). `h:owed:<writer>.<table>.<column>` never fails: it is printed,
 * and it becomes h:undeclared when the writer's stage stops awaiting captures (the R-EQ swap, or ③).
 */
export function owedPinItems(slug, descriptor, fleet) {
  if (!fleet || !fleet.owedWatermarks || typeof fleet.owedWatermarks !== 'object') return [];
  return unpinnedWatermarkReads(slug, descriptor, fleet.owedWatermarks, 'h:owed');
}

function unpinnedWatermarkReads(slug, descriptor, watermarks, prefix) {
  const archetype = descriptor && descriptor.identity ? descriptor.identity.archetype : null;
  if (archetype === 'ASSERT' || archetype === 'RECORDER') return [];
  const outputs = descriptor && descriptor.outputs ? descriptor.outputs : {};
  const selfWritten = new Set();
  for (const w of Array.isArray(outputs.writes) ? outputs.writes : []) {
    for (const c of Array.isArray(w && w.columns) ? w.columns : []) {
      const name = c && typeof c === 'object' ? c.name : c;
      if (typeof name === 'string') selfWritten.add(`${w.table}.${name}`);
    }
  }
  const pinned = new Set((descriptor && descriptor.staleness && Array.isArray(descriptor.staleness.pins) ? descriptor.staleness.pins : [])
    .map((pin) => pin && pin.step).filter((s) => typeof s === 'string'));
  const tables = descriptor && descriptor.inputs && descriptor.inputs.reads && Array.isArray(descriptor.inputs.reads.tables)
    ? descriptor.inputs.reads.tables : [];
  const out = [];
  for (const r of tables) {
    for (const col of Array.isArray(r && r.columns) ? r.columns : []) {
      const key = `${r.table}.${col}`;
      if (selfWritten.has(key)) continue;
      for (const writer of Array.isArray(watermarks[key]) ? watermarks[key] : []) {
        if (writer !== slug && !pinned.has(writer)) out.push(`${prefix}:${writer}.${key}`);
      }
    }
  }
  return [...new Set(out)].sort();
}

/**
 * THE #44 fleet derivation (R-DO (i), R-DI h:undeclared, R-ES copy window). PURE; step-validate builds the entries
 * once per process, the same for --all and --staged.
 * @param {Array<{descriptor: object, stage: string|null, member: boolean}>} entries — every converted descriptor
 *   (stage null) and every pending entry with a descriptor (its declared stage); `member` = in this run's converted
 *   view (converted, or overlaid by --staged / --step).
 * @param {(stage: string) => boolean} awaitsCaptures — step-validate's stageAwaitsCaptures (R-EF), injected.
 * invalidated / pinReaders: members only (unchanged). watermarks: a run_at column of a converted step, or of a
 * pending step whose stage does NOT await captures (it is the live writer: R-EQ swap); owedWatermarks: a run_at
 * column of a pending step whose stage awaits captures (R-ES), member or not.
 */
export function buildWitnessFleet(entries, awaitsCaptures) {
  const invalidated = new Set();
  const pinReaders = {};
  const watermarks = {};
  const owedWatermarks = {};
  const push = (map, key, slug) => { (map[key] = map[key] || []).push(slug); };
  for (const e of Array.isArray(entries) ? entries : []) {
    const d = e && e.descriptor;
    const slug = d && d.identity && d.identity.name;
    if (e.member) {
      for (const r of d && d.outputs && Array.isArray(d.outputs.invalidates) ? d.outputs.invalidates : []) {
        if (r && typeof r.table === 'string' && typeof r.column === 'string') invalidated.add(`${r.table}.${r.column}`);
      }
      for (const pin of d && d.staleness && Array.isArray(d.staleness.pins) ? d.staleness.pins : []) {
        if (pin && typeof pin.step === 'string' && slug) push(pinReaders, pin.step, slug);
      }
    }
    const owed = typeof e.stage === 'string' && awaitsCaptures(e.stage);
    for (const w of d && d.outputs && Array.isArray(d.outputs.writes) ? d.outputs.writes : []) {
      for (const c of Array.isArray(w && w.columns) ? w.columns : []) {
        if (c && c.source === 'run_at' && typeof c.name === 'string' && slug) push(owed ? owedWatermarks : watermarks, `${w.table}.${c.name}`, slug);
      }
    }
  }
  return { invalidated, pinReaders, watermarks, owedWatermarks };
}

/** (d) declared → observed compatibility, per the contract's table. */
function txnScopeOk(declared, observed, descriptor = null) {
  if (observed === 'mixed' && declaresMixedScope(descriptor)) return true;
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
/**
 * #44 G7 (Spec 124 R-DG, McDonald's Airtight V3; amends R-BJ): the step's OWN measurement SQL — every
 * `plausibility[].sql` and `invariants[].sql` string of its descriptor. The runner executes it, the SQL
 * declares itself, so a traced READ statement whose fingerprint equals one of these is accounted against
 * that SQL (its reads are what the resolver resolved, column level) in the traced ⊆ declared half of (a)
 * only. Never an acquisition read: it is not added to inputs.reads and never reaches stepUpstreams /
 * derivedReadsSteps (those read the descriptor, not traces). It still witnesses a declared column it
 * really executed (the declared ⊆ witnessed half is unchanged).
 */
export function ownMeasurementSql(descriptor) {
  const out = [];
  for (const key of ['plausibility', 'invariants']) {
    for (const e of descriptor && Array.isArray(descriptor[key]) ? descriptor[key] : []) {
      if (e && typeof e.sql === 'string' && e.sql.trim() !== '') out.push(e.sql);
    }
  }
  return out;
}

/**
 * `touched` with every read column that ONLY own-measurement statements touched removed (G7). A column also
 * read by any other statement stays; an own-measurement statement that WRITES, or that carried a resolver
 * error, is never accounted (its rows stay). `ownFingerprints` absent/empty → `touched` unchanged.
 */
export function withoutOwnMeasurementReads(trace, ownFingerprints) {
  const touched = touchedOf(trace);
  if (!(ownFingerprints instanceof Set) || ownFingerprints.size === 0) return touched;
  const statements = Array.isArray(trace && trace.statements) ? trace.statements : [];
  const isOwn = (s) => !!s && s.kind === 'read' && !s.error && ownFingerprints.has(s.fingerprint)
    && (!s.writes || Object.keys(s.writes).length === 0);
  const other = new Map();
  for (const s of statements) {
    if (isOwn(s)) continue;
    for (const [table, cols] of Object.entries(s && s.reads && typeof s.reads === 'object' ? s.reads : {})) {
      const set = other.get(table) || new Set();
      for (const c of Array.isArray(cols) ? cols : []) set.add(c);
      other.set(table, set);
    }
  }
  const own = new Map();
  for (const s of statements) {
    if (!isOwn(s)) continue;
    for (const [table, cols] of Object.entries(s.reads && typeof s.reads === 'object' ? s.reads : {})) {
      const set = own.get(table) || new Set();
      for (const c of Array.isArray(cols) ? cols : []) set.add(c);
      own.set(table, set);
    }
  }
  const reads = {};
  for (const [table, cols] of Object.entries(touched.reads)) {
    const o = own.get(table);
    const keep = (Array.isArray(cols) ? cols : []).filter((c) => !o || !o.has(c) || (other.get(table) || new Set()).has(c));
    // A table only an own-measurement statement touched (no column left, not read elsewhere) drops out.
    if (keep.length > 0 || (!o && Array.isArray(cols)) || other.has(table)) reads[table] = keep;
  }
  return { reads, writes: touched.writes };
}

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
function checkTraceAgainstDescriptor(slug, descriptor, trace, invocation = null, mode = null, ownFingerprints = null) {
  const rows = [];
  const touched = withoutOwnMeasurementReads(trace, ownFingerprints);

  // (a) traced ⊆ declared (see undeclaredItems).
  for (const item of undeclaredItems(descriptor, touched)) rows.push(`FAIL:WITNESS:${slug}:${item}`);

  // (b)+(c)+(d) only when the invocation actually wrote something.
  if (!hasWrite(trace)) return rows;

  const tracedWriteTables = new Set(Object.keys(touched.writes));
  const declaredWriteTables = new Set(declaredWrites(descriptor).map((w) => w.table));
  for (const table of tracedWriteTables) {
    if (!declaredWriteTables.has(table)) rows.push(`FAIL:WITNESS:${slug}:b:${table}`);
  }
  const derived = derivedWriteTables(descriptor);
  for (const table of declaredWriteTables) {
    if (!tracedWriteTables.has(table)) {
      // R-HA: a derived target is conditional per trace; the slug-level check in evaluateWitness
      // requires at least one fresh post trace to write it.
      if (!derived.has(table)) rows.push(`FAIL:WITNESS:${slug}:b:${table}`);
      continue; // a table the trace never wrote yields no per-column row
    }
    const tracedCols = new Set(Array.isArray(touched.writes[table]) ? touched.writes[table] : []);
    const declared = declaredWrites(descriptor).find((w) => w.table === table);
    // CHAT-73.swap4 (Spec 132 §core.12/§core.14): the ROWS-arm G keyed UPDATE (set_based_scoped, rows "compute") must declare its
    // key as a step column (write.js buildKeyedUpdateFromRowsSql types only declared step columns) but never SETs it, so the key
    // column is exempt from the declared-column-must-be-traced half for that class only.
    const keyExempt = new Set();
    for (const w of Array.isArray(descriptor && descriptor.outputs && descriptor.outputs.writes) ? descriptor.outputs.writes : []) {
      const wd = (w && w.write_discipline) || {};
      if (w && w.table === table && wd.class === 'set_based_scoped' && wd.rows === 'compute') for (const k of Array.isArray(w.key) ? w.key : [w.key]) keyExempt.add(k);
    }
    for (const col of declared ? declared.cols : []) {
      if (keyExempt.has(col)) continue;
      // db_default: NOT required in the traced write, and a traced write of it IS a
      // violation (same row grammar) — the declaration is checked both ways (WF3 C1).
      const isDbDefault = declared.dbDefault.has(col);
      if (isDbDefault ? tracedCols.has(col) : !tracedCols.has(col)) {
        rows.push(`FAIL:WITNESS:${slug}:b:${table}.${col}`);
      }
    }
  }

  // (c) distinct fingerprint count of STEP writes vs the expected count for this invocation's mode. A `kind:'write'`
  // statement whose only targets were excluded (runner-owned ledger etc., Spec 124 R-BG) is not
  // a step write and is not counted here.
  const expected = expectedStatements(descriptor, mode);
  if (expected.unresolved) rows.push(`FAIL:INPUT:${slug}:${invocation}:c:mode-unresolved`);
  const declaredCount = expected.count;
  if (declaredCount !== null) {
    const fp = new Set();
    for (const s of Array.isArray(trace && trace.statements) ? trace.statements : []) {
      if (isStepWrite(s) && typeof s.fingerprint === 'string') fp.add(s.fingerprint);
    }
    const extra = derivedWriteTables(descriptor).size > 0 ? derivedStatements(descriptor) : null;
    if (extra === null) {
      if (fp.size !== declaredCount) rows.push(`FAIL:WITNESS:${slug}:c:statements:${declaredCount}!=${fp.size}`);
    } else if (fp.size < declaredCount || fp.size > declaredCount + extra) {
      // R-HA: a run that wrote no derived row issues the primary statements only.
      rows.push(`FAIL:WITNESS:${slug}:c:statements:${declaredCount}..${declaredCount + extra}!=${fp.size}`);
    }
  }

  // (d) declared txn_scope vs observed, when the descriptor declares one.
  const declaredScope = descriptor && descriptor.execution ? descriptor.execution.txn_scope : null;
  if (typeof declaredScope === 'string') {
    const observed = observedTxnScope(trace);
    if (observed && !txnScopeOk(declaredScope, observed, descriptor)) {
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

/** Every table a slug declares, at table level: inputs.reads U checks[].reads (R-BJ) U outputs.writes. */
function declaredAnyTables(descriptor) {
  const set = new Set(declaredReads(descriptor).map((r) => r.table));
  for (const r of declaredCheckReads(descriptor)) set.add(r.table);
  for (const w of declaredWrites(descriptor)) set.add(w.table);
  return set;
}

/**
 * Spec 124 R-BZ (amends R-BG), witness attribution for ONE fresh post trace. A statement whose
 * fingerprint is in `runnerSet` is RUNNER-authored and stays excluded (R-BG). Any other statement that
 * carries `excluded[]` is COMPUTE-attributed: each excluded table must be a declared read/write table,
 * else `FAIL:WITNESS:<slug>:a:<table>.*`. `input` = structural REDs (a statement with no fingerprint);
 * `attributed` = the compute-attributed FAILs, kept apart from evaluateWitness `rows` but HARD: step-validate
 * stops on any of them for a blocking slug (Spec 124 R-DI (1), "compute-attributed FAILs hard too, R-BZ").
 */
export function attributionRows(slug, descriptor, invocation, trace, runnerSet) {
  const input = [];
  const attributed = [];
  const declared = declaredAnyTables(descriptor);
  const statements = Array.isArray(trace && trace.statements) ? trace.statements : [];
  for (const s of statements) {
    const fp = s && typeof s.fingerprint === 'string' ? s.fingerprint : '';
    if (fp === '') {
      input.push(`FAIL:INPUT:${slug}:${invocation}:statement-no-fingerprint`);
      continue;
    }
    const excluded = Array.isArray(s.excluded) ? s.excluded : [];
    if (excluded.length === 0 || runnerSet.has(fp)) continue;
    for (const table of excluded) {
      if (typeof table === 'string' && !declared.has(table)) attributed.push(`FAIL:WITNESS:${slug}:a:${table}.*`);
    }
  }
  return { input, attributed };
}

/**
 * Gate #44 (slice A) for ONE slug.
 *
 * @param {{slug: string, descriptor: unknown, status: 'pending'|'converted',
 *   currentFingerprint: string, postTraces: Record<string, object>,
 *   preTraces: Record<string, object>, explainedDiffs: string[],
 *   derivedReadsSteps?: string[],
 *   runnerFingerprints?: Map<string, string>|Set<string>|string[],
 *   modeByInvocation?: Record<string, 'full'|'incremental'|null>,
 *   fixtureRecords?: Record<string, {reads: object, writes: object,
 *     violations: string[], errors: string[]}>}} args
 * @returns {{answer: string, rows: string[], hardStop: boolean, attributed: string[]}}
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
  runnerFingerprints,
  // R-DB: each invocation's resolved `staleness.mode_select` mode ('full' | 'incremental'); absent → null.
  modeByInvocation,
  // R-DG (G7): libpg fingerprints of ownMeasurementSql(descriptor); absent → no accounting.
  ownMeasurementFingerprints,
  // LDG-10 (R-DI) #44 (h): { <producer>: [POST golden summary objects] } for pin mismatch / unverifiable.
  producerSummaries,
  // R-DO #44 (i) + R-DI h:undeclared: { invalidated: Set, pinReaders: {}, watermarks: {} } over the converted
  // fleet; absent → neither is evaluated.
  fleet,
} = {}) {
  const ownFps = ownMeasurementFingerprints instanceof Set ? ownMeasurementFingerprints : null;
  const posts = postTraces && typeof postTraces === 'object' ? postTraces : {};
  const pres = preTraces && typeof preTraces === 'object' ? preTraces : {};
  const fixtures = fixtureRecords && typeof fixtureRecords === 'object' && !Array.isArray(fixtureRecords)
    ? fixtureRecords
    : {};
  const invocations = Object.keys(posts);
  const rows = [];
  const witnessedTouched = [];
  const freshTraces = [];
  // R-BZ attribution. `undefined` = not evaluated (selfTest / legacy callers); step-validate ALWAYS passes it.
  // Provided-but-empty (or not a collection, incl. null) is RED: there is no blanket-exemption fallback.
  const runnerSet = runnerFingerprints instanceof Map || runnerFingerprints instanceof Set
    ? runnerFingerprints
    : (Array.isArray(runnerFingerprints) ? new Set(runnerFingerprints) : null);
  const attributed = [];
  if (runnerFingerprints !== undefined && (!runnerSet || runnerSet.size === 0)) {
    rows.push(`FAIL:INPUT:${slug}:runner-fingerprints:empty`);
  }

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
      const mode = modeByInvocation && typeof modeByInvocation === 'object' && typeof modeByInvocation[invocation] === 'string'
        ? modeByInvocation[invocation]
        : null;
      const stepTrace = runnerSet ? withoutRunnerStatements(trace, runnerSet) : trace;
      rows.push(...checkTraceAgainstDescriptor(slug, descriptor, stepTrace, invocation, mode, ownFps));
      rows.push(...producerRows(slug, stepTrace));
      witnessedTouched.push(touchedOf(trace));
      freshTraces.push(trace);
      if (runnerSet && runnerSet.size > 0) {
        const att = attributionRows(slug, descriptor, invocation, trace, runnerSet);
        rows.push(...att.input);
        attributed.push(...att.attributed);
      }
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
    // R-HA: every R-DY derived target is written by at least one fresh post trace of the slug.
    for (const table of derivedWriteTables(descriptor)) {
      if (!witnessedTouched.some((t) => Object.prototype.hasOwnProperty.call(t.writes, table))) {
        rows.push(`FAIL:WITNESS:${slug}:b:derived-unwitnessed:${table}`);
      }
    }
    // (h) pins witnessed and verified (R-BL (v); LDG-10, Spec 124 R-DI).
    for (const item of pinItems(descriptor, tracesTouchRuns(freshTraces), producerSummaries)) rows.push(`FAIL:WITNESS:${slug}:${item}`);
  }

  // R-DO #44 (i) — invalidation resolves (declaration-driven; Spec 124 R-DO).
  for (const item of [...invalidationItems(slug, descriptor, fleet), ...undeclaredPinItems(slug, descriptor, fleet)]) rows.push(`FAIL:WITNESS:${slug}:${item}`);

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
    // P1-C9 (folded into LDG-10, Spec 124 R-DI, McDonald's Airtight V3): #44 is HARD for a converted slug
    // as for a pending one — the witnessed ledger is the effective ledger only when every FAIL stops.
    hardStop: (status === 'pending' || status === 'converted') && unique.some((r) => r.startsWith(FAIL_PREFIX)),
    attributed: [...new Set(attributed)].sort(),
    // R-ES: pins owed on producers still awaiting captures — printed by step-validate, never a row, never a FAIL.
    owed: owedPinItems(slug, descriptor, fleet),
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
  // P1-C9 (LDG-10, R-DI): the same FAIL on a CONVERTED slug is hard too; a green converted slug is not.
  const redConverted = evaluateWitness({ ...base, status: 'converted', postTraces: { fixture_step: trace({ parcels: ['id', 'geom', 'lot_size_sqm'] }) } });
  const greenConverted = evaluateWitness({ ...base, status: 'converted', postTraces: { fixture_step: trace({ parcels: ['id', 'geom'] }) } });
  // R-DB: (c) reads by_mode[mode] (R-BK) — one traced write is right for incremental, wrong for
  // full, and a by_mode declarer with no resolved mode is FAIL:INPUT, never a guessed mode.
  const byMode = { ...base, descriptor: { ...descriptor, outputs: { ...descriptor.outputs, write_inventory: { statements: 1, by_mode: { full: { statements: 2 }, incremental: { statements: 1 } } } } } };
  const okTrace = { fixture_step: trace({ parcels: ['id', 'geom'] }) };
  const incr = evaluateWitness({ ...byMode, postTraces: okTrace, modeByInvocation: { fixture_step: 'incremental' } });
  const full = evaluateWitness({ ...byMode, postTraces: okTrace, modeByInvocation: { fixture_step: 'full' } });
  const unresolved = evaluateWitness({ ...byMode, postTraces: okTrace });
  // G13 (R-BL(iv)): an invalidates[] set_null_on_change_of column is a declared write (and read) of its table;
  // a `by:"trigger"` row is not (someone else writes it).
  const invDescriptor = (by) => ({ ...descriptor, outputs: { ...descriptor.outputs, invalidates: [by === 'set_null'
    ? { table: 'parcels', column: 'v_when', set_null_on_change_of: 'geom', by: 'set_null_on_change_of' }
    : { table: 'parcels', column: 'v_when', by: 'trigger' }] } });
  const invTouched = { reads: { parcels: ['id', 'geom', 'v_when'] }, writes: { parcels: ['a', 'b', 'v_when'] } };
  const g13ok = undeclaredItems(invDescriptor('set_null'), invTouched).length === 0
    && undeclaredItems(invDescriptor('trigger'), invTouched).includes('a:parcels.v_when');
  // G7 (R-DG): a read statement whose fingerprint is the step's own plausibility SQL is accounted against that
  // SQL; the same column read by any other statement, or by an own-fingerprint WRITE, still fails (a).
  const ownTrace = (extra) => ({
    statements: [
      { fingerprint: 'w1', kind: 'write', reads: { parcels: ['id'] }, writes: { parcels: ['a', 'b'] }, error: null },
      { fingerprint: 'p1', kind: 'read', reads: { permits: ['permit_num'] }, writes: {}, error: null },
      ...extra,
    ],
    touched: { reads: { parcels: ['id', 'geom'], permits: ['permit_num', ...(extra.length ? ['status'] : [])] }, writes: { parcels: ['a', 'b'] } },
  });
  const own = new Set(['p1']);
  const g7ok = undeclaredItems(descriptor, withoutOwnMeasurementReads(ownTrace([]), own)).length === 0
    && undeclaredItems(descriptor, withoutOwnMeasurementReads(ownTrace([]), new Set())).includes('a:permits.*')
    && undeclaredItems(descriptor, withoutOwnMeasurementReads(ownTrace([{ fingerprint: 'c9', kind: 'read', reads: { permits: ['status'] }, writes: {}, error: null }]), own)).includes('a:permits.*');
  // R-DO #44 (i): a write_once_backfill column with no fleet invalidator is RED; one the fleet invalidates is GREEN.
  const onceDesc = { outputs: { writes: [{ table: 't', columns: [{ name: 'c' }], write_discipline: { class: 'write_once_backfill' } }], invalidates: [] } };
  const hu = { identity: { archetype: 'LINK' }, inputs: { reads: { tables: [{ table: 'p', columns: ['stamp'] }] } }, outputs: { writes: [] } };
  const huok = undeclaredPinItems('r', hu, { watermarks: { 'p.stamp': ['w'] } }).includes('h:undeclared:w.p.stamp')
    && undeclaredPinItems('r', { ...hu, staleness: { pins: [{ step: 'w', stamp: 'records_meta.x' }] } }, { watermarks: { 'p.stamp': ['w'] } }).length === 0
    && undeclaredPinItems('r', { ...hu, identity: { archetype: 'ASSERT' } }, { watermarks: { 'p.stamp': ['w'] } }).length === 0;
  const iok = huok && invalidationItems('s', onceDesc, { invalidated: new Set(), pinReaders: {} }).includes('i:fill-once:t.c')
    && invalidationItems('s', onceDesc, { invalidated: new Set(['t.c']), pinReaders: {} }).length === 0
    // R-ER arm (ii): an own column re-armed by this step's own pin on a producer stamp of the same table resolves.
    && invalidationItems('s', { staleness: { pins: [{ step: 'p', stamp: 't.seen' }] }, outputs: { writes: [{ table: 't', columns: [{ name: 'w' }] }], invalidates: [{ table: 't', column: 'w', by: 'pin' }] } }, { invalidated: new Set(), pinReaders: {} }).length === 0
    && invalidationItems('s', { staleness: { pins: [] }, outputs: { writes: [{ table: 't', columns: [{ name: 'w' }] }], invalidates: [{ table: 't', column: 'w', by: 'pin' }] } }, { invalidated: new Set(), pinReaders: {} }).includes('i:unresolved:pin:t.w');
  const ok = green.rows.length === 0
    && g13ok
    && g7ok
    && iok
    && green.answer === 'PASS'
    && green.hardStop === false
    && red.rows.includes('FAIL:WITNESS:fixture_step:a:parcels.lot_size_sqm')
    && red.hardStop === true
    && redConverted.hardStop === true
    && greenConverted.hardStop === false
    && incr.rows.length === 0
    && full.rows.includes('FAIL:WITNESS:fixture_step:c:statements:2!=1')
    && unresolved.rows.includes('FAIL:INPUT:fixture_step:fixture_step:c:mode-unresolved');
  return {
    ok,
    detail: ok
      ? 'self-test ok: declared trace PASSes; an undeclared read column is a hard-stop FAIL:WITNESS:a row (pending and converted, P1-C9); (c) counts by_mode[mode] and refuses an unresolved mode; G13 invalidates set_null columns are declared writes; G7 own-measurement reads are accounted, others are not; (i) fill-once without an invalidator is RED; h:undeclared narrow fires on an unpinned cross-step watermark acquisition read only'
      : `self-test FAILED: g13=${g13ok} g7=${g7ok} i=${iok} green=${JSON.stringify(green)} red=${JSON.stringify(red)}`,
  };
}
