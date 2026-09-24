/**
 * `pipeline.step(descriptor, compute)` — S2-min.
 *
 * THE MINIMAL LIBRARY THE `assert_schema` PILOT NEEDS, and deliberately nothing
 * more. Spec 122 R4 makes S2 a vertical slice that GROWS per pilot; the growth
 * waves are named at the bottom of this header so a missing behaviour reads as
 * scheduled rather than forgotten.
 *
 * ⚠️ IT IS A FACTORY (claim #86). `require`ing a step file opens no pool and
 * issues no query. Construction does exactly one thing: AJV-validate the
 * descriptor and THROW (Spec 122 §4.2 — that throw IS the loader property).
 * Everything that touches a socket lives behind `.run()`.
 *
 * What S2-min owns, from Spec 122 §4.3's list:
 *   1. descriptor validation, at construction, before compute exists       (§4.2)
 *   2. the ledger row — opened at start, finalized in a `finally`;
 *      `crashed` NEVER written in-process (see ledger.js)                  (§4.1 ①㉝)
 *   3. the verdict — row-derived, once, here; never a parallel boolean     (§7.1)
 *   4. the txn-scoped advisory lock on `identity.lock`                     (§4.1 ②)
 *   5. `records_meta` / `PIPELINE_META`, both derived FROM the descriptor  (§4.1 ㉙)
 *   6. per-chain check selection from `checks[].chains`                    (§1.7)
 *   7. the `database` guard — floor + `current_database()`                 (§4.1 ③④)
 *   8. `ctx.config` — the declared logic variables, present in the registry, resolved
 *      and bounds-checked BEFORE compute, stamped into `records_meta.config`
 *                                                            (§1.2a P4, config.js)
 *
 * ⚠️ RECONCILE (A3) IS NOT IMPLEMENTED AND NOTHING HERE ASSUMES IT RAN.
 * The Step-0 reconcile that reaps stale `running` rows to `crashed` is a
 * `reconcile` step at the head of `manifest.chains.sources` (Spec 122 §7.4), not
 * a library concern. This file reads no prior-run state, waits on no reaper, and
 * behaves identically whether or not a previous run left a row stranded — the
 * ledger open is an unconditional INSERT, never an upsert over a prior row.
 *
 * GROWTH WAVES (Spec 122 §S2, R4) — each with its pilot:
 *   ✅ generated write SQL from `write_discipline`           → INGESTOR (./write.js)
 *   ✅ staleness/gating axes, two positions                  → INGESTOR (./staleness.js, ./acquire.js)
 *   ✅ the acquisition seam (`ctx.acquire`, ruling A-2)      → INGESTOR (./acquire.js)
 *   ✅ `pct <=` limits + `limit_from_config` (ruling A-4)    → INGESTOR (./verdict.js)
 *   ✅ counters resolved FROM `counters[].source`            → INGESTOR
 *   ✅ terminal selection + `records_meta.terminal`          → INGESTOR
 *   ✅ `when: "pre_write"` — abort BEFORE any write (LR-D9) → INGESTOR (Fold C)
 *   · the run-ledger gate (upstream/own slugs)               → ENRICHER
 *   · invalidation + counters scoped by `writes.key`         → LINK/MATCHER
 *   · quarantine / checkpoint / partial_fill                 → BACKFILL
 *   · publish pointer / WAP                                  → RECORDER
 *   · scope-defer                                            → ENRICHER
 *   · ledger-row consolidation out of run-chain (claim #39)  → run-chain wave
 *   · `pop` / `ratio` limit forms                            → validator wave
 *
 * WHAT THE INGESTOR WAVE ADDED, in one sentence: for a descriptor that DECLARES an
 * acquire→write shape (`isIngestStep`), the library now runs the whole
 * prior-read → gate → acquire → gate → RLS preflight → validate → write pipeline
 * and hands the compute a RESULT to observe (`ctx.acquired` / `ctx.written` /
 * `ctx.prior` / `ctx.overrides`). Every other step reaches `compute` on exactly the
 * path pilot 1 established — the branch is entered by declaration, never by guess.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4, §7
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §4.1
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R6, §R10, §R11
 */
'use strict';

const pipeline = require('../pipeline');
// Module-top alias — see the pass-5 statement_timeout restore in runEnrichPhase for why this
// value getter must not be spelled `pipeline.getPoolStatementTimeoutMs(` inside a runner body.
const { getPoolStatementTimeoutMs } = pipeline;
const { assertDbTarget } = require('../resolve-db');
const { validateDescriptor } = require('./validate');
const { buildAuditTable, deriveVerdict, selectChecks } = require('./verdict');
const { RUN_STATUS, ownsLedgerRow, openLedgerRow, finalizeLedgerRow } = require('./ledger');
const { resolveConfig, retiredVarRow } = require('./config');
const staleness = require('./staleness');
const acquire = require('./acquire');
const write = require('./write');
const { finalizeStrandedRun } = require('../ledger-window');
// R-T addendum (Spec 124 §2 Rule 13, commit 3) — the invariants[]/plausibility[] executor.
// EP-D17 (WF3, 2026-09-10, C1/C4) — parseDurationMs resolves the step's own declared
// execution.statement_timeout into the every_run ceiling default; runMaintenance is
// the rung-(d) library executor for execution.maintenance (previously a dead declared
// field — no executor existed anywhere in scripts/lib, per this WF3's own P11 grounding).
const { runInvariants, runPlausibility, parseDurationMs, runMaintenance } = require('./plausibility');
// STA-2/STA-3 (WF1 "state tables reset", 2026-09-03) — generateReset + the three
// destructive-reset guards. Export only: reset.js owns the implementation.
const {
  generateReset, assertBeforeImageDeclared, assertForceFullAuthorized,
  assertAdvisoryLockAvailable, applyGeneratedReset,
} = require('./reset');

/** The `config: "none"` projection — one shared frozen empty object, never a fresh `{}` per run. */
const EMPTY_CONFIG = Object.freeze(Object.create(null));

/**
 * LW-D11 (2026-08-28) — the CLOSED list of keys the library ever assigns onto `stepCtx`
 * (the literal below is exactly the `stepCtx = { ... }` object's own key set, `report`
 * included). A test harness's `runCompute`/ctx-builder mirror (`src/tests/steps/*\/
 * violations.test.ts`) may only ever SET a key from this list — a fixture that injects an
 * extra key (e.g. `link_wsib`'s pre-LW-D11 `ctx.fanin`) can make a check pass in the test
 * suite while the identical check reads `undefined` from the real runner forever, because
 * the runner never plumbs anything the descriptor/library didn't declare a channel for.
 * Enforced by `src/tests/step-conformance.infra.test.ts`'s harness-fidelity lock.
 */
const STEP_CTX_KEYS = Object.freeze([
  'pool', 'chainId', 'runId', 'descriptor', 'checks', 'log', 'fetch', 'clock', 'config',
  'probePresence', 'acquired', 'written', 'prior', 'overrides', 'gate', 'matched',
  'cumulative', 'elapsed_ms', 'report',
]);

/**
 * LW-D13 (2026-08-28, pilot 3's own §R Reflection item, carried into pilot 4) — the closed
 * enum for `records_meta.ledger_row`, a RUNNER-STAMPED (never per-step-declared) fact:
 * whether THIS process owns the `pipeline_runs` row it is finalizing (`owned`, standalone —
 * `ownsLedgerRow`/`!chainId`) or the row belongs to an enclosing `run-chain.js` invocation
 * that owns it instead (`chain_owned`). Ledger ownership was already computed (`const owns =
 * ownsLedgerRow(chainId)`, below) and used to gate `openLedgerRow`/`finalizeLedgerRow` — this
 * makes the already-computed fact OBSERVABLE in the run's own record (§1.2a "nothing
 * hidden") rather than leaving it inferable only from `chainId`/log lines. Stamped
 * unconditionally, like `terminal`/`checks_passed`/`config` — a runner default, not a
 * per-step `emits[]` entry (`step.schema.json`'s `emits` category is explicitly "records_meta
 * keys BEYOND runner defaults"; this key, like those three, applies identically to every
 * converted step and carries no step-specific data, so it has no per-step declaration site).
 */
const LEDGER_ROW_VALUES = Object.freeze(['owned', 'chain_owned']);

/** `PIPELINE_META` reads/writes/externals, derived from the descriptor — never hand-maintained. */
function deriveMeta(descriptor) {
  const reads = {};
  const tables = (descriptor.inputs && descriptor.inputs.reads && descriptor.inputs.reads.tables) || [];
  for (const t of tables) reads[t.table] = t.columns || [];
  const writes = {};
  if (descriptor.outputs && descriptor.outputs !== 'none') {
    // UNION across same-table entries (D-2). A LINK declares TWO targets on ONE table —
    // a one-column set-based clear and a seven-column upsert — and assigning per entry
    // let the LAST one win, so PIPELINE_META would have advertised whichever target
    // happened to be declared second. The union is the honest answer to "which columns
    // of this table does the step write", which is the question emitMeta asks.
    for (const w of descriptor.outputs.writes) {
      const seen = writes[w.table] || [];
      for (const c of w.columns) if (!seen.includes(c.name)) seen.push(c.name);
      writes[w.table] = seen;
    }
  }
  const externals = (descriptor.inputs && descriptor.inputs.reads && descriptor.inputs.reads.externals) || [];
  return { reads, writes, external: externals.map((e) => e.id) };
}

/**
 * §4.1 ③④ — the P0 defect class, applied at the step. "A step pointed at a
 * 222-migration database REFUSES." Delegates wholesale to P0's one resolver.
 */
async function assertDatabaseTarget(pool, descriptor) {
  const db = descriptor.database;
  if (!db || db.class === 'none') return;
  await assertDbTarget(pool, {
    label: descriptor.identity.name,
    minMigration: db.min_migration === 'none' ? null : db.min_migration,
    expectDatabase: db.assert_current_database === 'none' ? undefined : db.assert_current_database,
    description: `${descriptor.identity.name} (descriptor.database)`,
    logger: {
      log: (msg) => pipeline.log.info(`[${descriptor.identity.name}]`, msg),
      warn: (msg) => pipeline.log.warn(`[${descriptor.identity.name}]`, msg),
    },
  });
}

/**
 * Resolve one `counters.<slot>.source` against the run's measured scope.
 *
 * §11's Counter Semantic Contract exists because `records_total` had NINE distinct
 * measured meanings across the estate. The descriptor now NAMES the variable that
 * feeds each slot — `acquired.feature_count`, `written.inserted` — and the runner
 * resolves it. A compute never assigns a counter, so it can never disagree with the
 * declaration; a source naming nothing measurable resolves to null, which reads as
 * "not counted" rather than as a silent zero.
 */
function resolveCounterSource(slot, scope) {
  if (!slot || slot === 'none' || typeof slot.source !== 'string') return null;
  let node = scope;
  for (const part of slot.source.split('.')) {
    if (node == null || typeof node !== 'object') return null;
    node = node[part];
  }
  return typeof node === 'number' && Number.isFinite(node) ? node : null;
}

/**
 * Counters: `counters: "none"` means the step declares it counts nothing (§1.10,
 * normative for ASSERT). Otherwise each slot's `source` is resolved against
 * `{acquired, written, records_meta}` — the library's own measurements plus whatever
 * the compute returned — never against a value the compute assigned by that name.
 */
function deriveCounters(descriptor, computeResult, scope = null) {
  if (!descriptor.counters || descriptor.counters === 'none') {
    return { records_total: null, records_new: null, records_updated: null };
  }
  const c = (computeResult && computeResult.counters) || {};
  const resolveScope = {
    ...(scope || {}),
    records_meta: (computeResult && computeResult.records_meta) || {},
  };
  const d = descriptor.counters;
  return {
    records_total: c.records_total ?? resolveCounterSource(d.records_total, resolveScope),
    records_new: c.records_new ?? resolveCounterSource(d.records_new, resolveScope),
    records_updated: c.records_updated ?? resolveCounterSource(d.records_updated, resolveScope),
  };
}

/** `emits: "none"` → `[]`. */
function emitsList(descriptor) {
  return Array.isArray(descriptor.emits) ? descriptor.emits : [];
}

/**
 * TERMINAL SELECTION (§1.2a P1 — R6's 18th category earns its keep).
 *
 * `terminals[]` had no runtime consumer at pilot 1: the exit paths were declared and
 * the runner picked none, so the declaration could drift from the code forever. The
 * runner now selects one by OUTCOME and stamps its id into `records_meta.terminal`,
 * which makes an undeclared exit path a visible null rather than a silent shape.
 *
 * Minimal on purpose: kind + status, plus a `discriminator` the terminal's id must
 * CONTAIN — the trigger `signal` for the two gated skips, the failing check id for a
 * `fail_check`. Mechanical containment rather than a mapping table, so a terminal
 * that no outcome can select is visible as a never-stamped id.
 */
function selectTerminal(descriptor, { kind, status, discriminator }) {
  const all = Array.isArray(descriptor.terminals) ? descriptor.terminals : [];
  const byKind = all.filter((t) => t.kind === kind);
  const narrowed = discriminator ? byKind.filter((t) => t.id.includes(discriminator)) : [];
  const pool = narrowed.length > 0 ? narrowed : byKind;
  return pool.find((t) => t.status === status) || pool[0] || null;
}

/**
 * Is this descriptor an ACQUIRE→WRITE step the library should drive end to end?
 *
 * Declared, never guessed: it writes somewhere, it declares a pre-acquisition gate,
 * and it names an external with a URL to gate against. An ASSERT (`outputs: "none"`)
 * and every step whose triggers are all `pre_compute` take the pilot-1 path
 * unchanged — this branch adds nothing to their run.
 */
function isIngestStep(descriptor) {
  if (descriptor.execution && descriptor.execution.shape) return descriptor.execution.shape === 'ingest';
  return descriptor.outputs !== 'none'
    && Array.isArray(descriptor.outputs.writes)
    && descriptor.outputs.writes.length > 0
    && staleness.triggersAt(descriptor, 'pre_acquisition').length > 0
    && ((descriptor.inputs.reads.externals || []).some((e) => typeof e.url === 'string' && e.url.length > 0));
}

/**
 * Is this a LINK — read, join, write, with NO acquisition? (Ruling A-1(a).)
 *
 * ⚠️ DECLARED, NEVER SNIFFED, and that is the whole finding. `isIngestStep` above
 * required an external with a URL, so a pure DB→DB join matched nothing and fell to the
 * ASSERT path — where `compute(ctx)` iterates checks and the library writes NOTHING. A
 * LINK's join and write therefore had no home in the library at all: the branch was
 * decided by a predicate over unrelated fields rather than by the step saying what it
 * is. `execution.shape` (C3 pre-pull) makes it a declaration, so a step that means
 * "link" cannot silently be run as something else.
 */
function isLinkStep(descriptor) {
  // LG-15 (MATCHER pilot, 2026-08-28): a LINK/MATCHER step may ALSO declare a
  // staleness-driven gated-skip path (staleness.ledgerGatedSkip, generalizing the B3
  // run-ledger gate) alongside its full/incremental mode decision — this predicate
  // stays scoped to `shape === "link"`; `isCascadeStep` below is the MATCHER sibling and
  // shares the same gated-skip mechanism rather than re-deriving it.
  return Boolean(descriptor.execution && descriptor.execution.shape === 'link');
}

/**
 * Is this a composite-key LINK — read, join, write, with a COMPOSITE-KEY keyset
 * pagination and a compound (upsert + keyed-DELETE) write target? (Ruling A-4, LINK
 * pilot 7, `link_parcels`, 2026-08-30, Fold B item 4.)
 *
 * ⚠️ FORKED FROM `isLinkStep`/`runLinkPhase` UNCONDITIONALLY, NOT A BRANCH INSIDE THEM.
 * Measured at commit 7: `runLinkPhase`'s single-integer `id` keyset cannot page a table
 * whose PK is `(permit_num, revision_num)` with no surrogate `id`; its ONE primary +
 * ONE fallback pass cannot express a 4-strategy cascade; its `executeOrderedWrites`
 * cannot express class F's compound upsert-then-keyed-DELETE (LG-24). The pilot-4 fork
 * precedent this predicate mirrors (`isCascadeStep`, above) was never itself gated on a
 * line-count threshold either of the two prior times it applied — this is the THIRD
 * unconditional instance, not a fourth conditional one. `execution.shape` is still the
 * ONE declared field selecting the runner branch (§4.1a); `runLinkPhase` (245 lines,
 * this file) is untouched — `link_massing` keeps using it exactly as before.
 */
function isLinkKeyedStep(descriptor) {
  return Boolean(descriptor.execution && descriptor.execution.shape === 'link_keyed');
}

/**
 * Is this a MATCHER — a bulk N-tier cascade over `execution.tiers[]`, with NO
 * batching/pagination and MORE THAN ONE write target per tier? (Ruling A-1, SHOULD-FIX
 * d, MATCHER pilot 2026-08-28.)
 *
 * ⚠️ FORKED FROM `isLinkStep`/`runLinkPhase`, NOT A BRANCH INSIDE THEM. Measured at
 * commit 7: `runLinkPhase`'s keyset batch loop (`eligible_batch_sql` + a `lastId`
 * cursor) and its flat hardcoded `parcels_*` counters do not serve a step with no
 * pagination anywhere and THREE write statements per tier across TWO tables — extending
 * `runLinkPhase` with a `tiers[]` branch would fork its write loop internally, which the
 * A-1 SHOULD-FIX ruling names as the exact condition for a separate phase instead.
 * `execution.shape` is still the ONE declared field selecting the runner branch (§4.1a);
 * this predicate mirrors `isLinkStep`'s shape, not its mechanism.
 */
function isCascadeStep(descriptor) {
  return Boolean(descriptor.execution && descriptor.execution.shape === 'cascade');
}

/**
 * Is this a MATERIALIZER — ONE unconditional bulk INSERT, no retraction, no
 * primary/fallback split, no tiers? (Ruling A-1, MATERIALIZER pilot 2026-08-29.)
 *
 * ⚠️ FORKED FROM `runCascadePhase`'s PHASE-ORDER SHAPE, NOT AN EXTENSION OF
 * `runLinkPhase`. Measured at commit 7: `runLinkPhase`'s write path is SELECT → JS rows
 * → `executeUpsertBatch` (a per-row batched upsert) — `link_parcel_addresses`'s real
 * write is ONE server-side `INSERT ... SELECT ... JOIN ST_Within ... ON CONFLICT DO
 * NOTHING` statement; fitting it into `runLinkPhase` would split that statement into a
 * SELECT plus a batched INSERT, breaking the G2 "verbatim SQL" guarantee. `runCascadePhase`
 * is the closer sibling (guards → LG-15 gated-skip → RUN_AT → pre_write gate → write →
 * post checks) but still wrong to extend: it has no per-batch pagination and dispatches
 * MULTIPLE write targets per tier, where a MATERIALIZER has exactly one target and
 * batches over a keyset cursor. `execution.shape` is still the ONE declared field
 * selecting the runner branch (§4.1a); this predicate mirrors `isCascadeStep`'s shape,
 * not its mechanism.
 */
function isMaterializeStep(descriptor) {
  return Boolean(descriptor.execution && descriptor.execution.shape === 'materialize');
}

/**
 * Is this descriptor a COLUMN-STAMPING LINK — ONE scoped, change-guarded set-based JOIN
 * UPDATE that writes ONE column on an EXISTING row, no junction, no retraction, no batch
 * loop? (Ask 1 ruling (B) FORK, I4 `link_neighbourhoods`, re-ruled 2026-09-16.)
 *
 * ⚠️ FORKED UNCONDITIONALLY, NOT A BRANCH INSIDE ANY EXISTING RUNNER. Three shapes were
 * tried against this step and all three are refuted STRUCTURALLY, not stylistically:
 *
 *   (a) `link_keyed` — UNRUNNABLE, not merely awkward. `runLinkKeyedPhase` destructures
 *       TWO write plans unconditionally (`const deletePlan = plans[1]`) and dereferences
 *       `deletePlan.table` before its loop, so a one-target descriptor TypeErrors inside
 *       the advisory lock; it normalises `street_num`/`street_name`/`street_type` off every
 *       batch row, columns this step neither reads nor declares; it calls
 *       `compute.classifyPrimary`/`classifySpatialContainment`/`classifySpatialFallback` by
 *       name across a fixed four-strategy cascade; and `link_keyed`'s own frozen
 *       `phase_order` contains no `write.executeSetBasedJoinUpdate` at all.
 *   (b) `link` — `runLinkPhase` pages an integer `lastId` over a surrogate `id` column
 *       `permits` does not have (its PK is the composite `(permit_num, revision_num)`), and
 *       hard-codes a `parcels_*` counter vocabulary.
 *   (c) `backfill` — the closest phase-order match, and still not shareable. FOUR reasons,
 *       each measured: `runBackfillPhase` hard-codes `compute_centroids`' matched vocabulary
 *       (`parcels_processed`/`centroids_computed`/`failed_geometries`/`new_rows`); it
 *       EARLY-RETURNS on `backlogCount === 0` with a `zeroWork` result, which this step must
 *       not do (its eligible set is 0 in the measured steady state, so an early return would
 *       suppress the post checks — including a standing WARN and the whole `failed_link_rate`
 *       arm — on every single run); it dispatches through `executeBackfillUpdate` (LG-20,
 *       class E `write_once_backfill`), which is UPDATE-only by construction and is NOT the
 *       class-N `executeSetBasedJoinUpdate` (LG-11) this target declares; and its
 *       `force_full` branch requires a declared SECOND write target this step does not have.
 *       Widening it would make a CONVERTED step's (`compute_centroids`) golden captures
 *       collateral for an unconverted step's convenience — the inversion LG-21's ratified
 *       fork-over-share decision exists to prevent, applied here for the fifth time.
 *
 * What it TAKES from `runBackfillPhase` is the PHASE ORDER, not the mechanism: guards →
 * overrides → RLS preflight → prior read → pre-read counts → pre_write gate → ONE
 * statement → post read → return. `link_neighbourhoods` is the first and, as of this
 * conversion, only link_column-shaped step.
 */
function isLinkColumnStep(descriptor) {
  return Boolean(descriptor.execution && descriptor.execution.shape === 'link_column');
}

/**
 * Is this a BACKFILL — ONE conditional set-based UPDATE, no retraction, no
 * batching in the surviving path, no ledger-gated skip? (Ruling A-4, BACKFILL
 * pilot 6, 2026-08-29.)
 *
 * ⚠️ ACCEPT AT FOLD D: a thin FORK of `isCascadeStep`/`isMaterializeStep`'s own
 * shape, NOT an extension of `runLinkPhase` or `runMaterializePhase`. Measured at
 * commit 7: `compute_centroids`'s write is a SINGLE, UNPAGINATED, unconditional
 * `UPDATE ... WHERE <scope> RETURNING id` — `runMaterializePhase`'s keyset batch
 * loop exists specifically because `link_parcel_addresses`'s write is MANY
 * statements (one INSERT...SELECT per batch); fitting a one-statement BACKFILL
 * into that loop would either fake a batch count of 1 forever or split a
 * verbatim-ported statement that has no batches to split. `runCascadePhase`'s
 * LG-15 ledger-gated-skip has no analogue here either: this step's own "nothing
 * to do" completion is DATA-driven (a zero pre-run backlog count, scoped by
 * `centroid_lat IS NULL`), never a staleness/ledger gate (R-P N/A — no
 * `terminals[].kind === "skip_gated"` entry exists for this step). LG-21's
 * shared phase-runner scaffold (a candidate 4th-duplication refactor of the
 * guards→gate→RUN_AT→pre_write→write→post shape shared by all four runners) is
 * explicitly DEFERRED to a post-pilot-8 library WF (Fold D, 2026-08-29) and not
 * built here. `execution.shape` is still the ONE declared field selecting the
 * runner branch (§4.1a); this predicate mirrors `isMaterializeStep`'s shape, not
 * its mechanism.
 */
function isBackfillStep(descriptor) {
  return Boolean(descriptor.execution && descriptor.execution.shape === 'backfill');
}

/**
 * Is this a RECORDER — ONE row, ONE single-statement guarded upsert, no
 * batching, no carried-rows loop, no ledger gate? (Fold B RULING, RECORDER
 * pilot 8, `refresh_snapshot`, 2026-08-31.)
 *
 * ⚠️ ZERO-GROWTH REFUTED BY DIRECT TRACE (Fold B, `.cursor/active_task.md`)
 * before this predicate was added: every one of the six existing shapes was
 * checked against `refresh_snapshot`'s real write and none fit —
 * `ingest`/`link`/`link_keyed` all need an acquisition or join/carried-rows
 * seam this step has none of; `cascade`/`materialize` both require
 * `staleness.ledgerGatedSkip`, a gate this step (verdict always PASS, no skip
 * path, Spec 122 `:1112`) does not have; `backfill`'s own executor
 * (`executeBackfillUpdate`) structurally refuses any INSERT token, and this
 * step's write IS an `INSERT ... ON CONFLICT ... DO UPDATE`. `execution.shape`
 * is still the ONE declared field selecting the runner branch (§4.1a); this
 * predicate mirrors `isBackfillStep`'s shape, not its mechanism.
 */
function isRecorderStep(descriptor) {
  return Boolean(descriptor.execution && descriptor.execution.shape === 'recorder');
}

/**
 * Is this an ENRICHER — N heterogeneous per-parcel passes, some sharing ONE
 * transaction, at least one running AFTER that transaction commits, no
 * ledger-gated skip, its own declared pre-transaction scope-defer mechanism?
 * (Ask 1/Ask 2 RULING, ENRICHER pilot 9, `enrich_parcels`, 2026-09-04.)
 *
 * ⚠️ FORKED, NOT AN EXTENSION OF ANY EXISTING RUNNER. Measured at commit 7
 * (Ask 1): `runCascadePhase`'s `execution.tiers[]` loop is a single-write-target
 * convergence loop inside one txn; `enrich_parcels` has FIVE heterogeneous
 * passes over MULTIPLE write targets, four sharing one transaction and a FIFTH
 * that must run on a SEPARATE connection strictly AFTER that transaction
 * commits (Spec 78 §P3A.1 — a same-txn read of what the first four just wrote
 * would be invisible) — no existing `phase_order` value expresses a post-commit
 * second phase. None of the five archetype runners use `staleness.
 * ledgerGatedSkip`/`selectMode` either: this archetype's own staleness axis is
 * Spec 122 §3.0b's scope-defer (a pre-transaction row-count check that, over
 * threshold, makes the run a genuine zero-write no-op rather than a gated
 * skip). `execution.shape` is still the ONE declared field selecting the
 * runner branch (§4.1a); this predicate mirrors every sibling `is*Step`'s
 * shape, not its mechanism.
 */
function isEnrichStep(descriptor) {
  return Boolean(descriptor.execution && descriptor.execution.shape === 'enrich');
}

/** One requirement kind → the catalog probe that answers "is it there?". */
const REQUIREMENT_PROBES = {
  extension: { sql: 'SELECT 1 FROM pg_extension WHERE extname = $1', args: (r) => [r.name] },
  index: { sql: 'SELECT 1 FROM pg_indexes WHERE indexname = $1', args: (r) => [r.name] },
  fk: { sql: "SELECT 1 FROM pg_constraint WHERE conname = $1 AND contype = 'f'", args: (r) => [r.name] },
  function: { sql: 'SELECT 1 FROM pg_proc WHERE proname = $1', args: (r) => [r.name] },
  column: {
    sql: 'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
    args: (r) => r.name.split('.'),
  },
};

/**
 * Probe ONE `guards.requires[]` entry against the live catalog.
 *
 * CLOUD-PRE (Spec 123 §7.2 A5, 2026-09-21) — EXTRACTED VERBATIM from the body of
 * `assertRequirements` below, so the pre-dispatch cloud-state checklist
 * (`scripts/analysis/cloud-pre-dispatch.mjs`) probes a declared requirement with
 * the SAME SQL the runner uses, rather than a second copy that can drift from
 * it. Behaviour is byte-for-byte what the runner did inline: one query, `present
 * = rows.length > 0`. The `detail` field carries the probe's own SQL text so an
 * audit row can name what was asked, not merely what came back.
 *
 * A requirement whose `kind` has no probe (`rls_bypass_or_policy`) is NOT this
 * function's concern — `assertRequirements` skips it (owned by
 * `write.assertWritePrivileges`), and it returns `present: true` here so a
 * caller iterating a descriptor's requires[] never reads an unprobed kind as a
 * missing precondition. Callers that want the skip explicitly should test
 * `REQUIREMENT_PROBES[r.kind]` first, as the runner does.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {{kind: string, name: string}} requirement
 * @returns {Promise<{present: boolean, detail: string}>}
 */
async function probeRequirement(pool, requirement) {
  const probe = REQUIREMENT_PROBES[requirement.kind];
  if (!probe) return { present: true, detail: `no catalog probe for kind "${requirement.kind}"` };
  const { rows } = await pool.query(probe.sql, probe.args(requirement));
  return { present: rows.length > 0, detail: probe.sql };
}

/**
 * `guards.requires[]` — THE PRECONDITIONS, CHECKED BEFORE THE FIRST READ.
 *
 * ⚠️ B-4 IS THE REASON THIS RUNS WHERE IT RUNS. The pre-conversion step asserted its
 * GiST index inline and threw — "refusing the building-centroid-in-parcel join (would
 * seq-scan 486K parcels)". A missing index there is not a slower run, it is an
 * unbounded one; a missing extension is worse, because before the A-8 override the step
 * ANSWERED a missing extension by silently switching to a second algorithm with
 * different confidences and no `is_primary` clear. `on_missing: "fail"` is what makes
 * "no degraded algorithm survives" a property of the declaration rather than of a
 * branch nobody reads.
 *
 * `rls_bypass_or_policy` is excluded here and owned by `write.assertWritePrivileges`,
 * which MEASURES the privilege so a check can report it on the happy path too.
 *
 * CLOUD-PRE (Spec 123 §7.2 A5) — the per-requirement probe now lives in
 * `probeRequirement` above; this loop's behaviour is unchanged (it calls that
 * function and keeps the same skip, the same throw, the same warn).
 */
async function assertRequirements(pool, descriptor, { log, tag }) {
  const requires = (descriptor.guards && descriptor.guards.requires) || [];
  const measured = {};
  for (const r of requires) {
    if (!REQUIREMENT_PROBES[r.kind]) continue; // rls_bypass_or_policy — measured by the write preflight
    const { present } = await probeRequirement(pool, r);
    measured[r.name] = present;
    if (present) continue;
    if (r.on_missing === 'fail') {
      throw new Error(`${tag} required ${r.kind} "${r.name}" is ABSENT from this database. `
        + 'guards.requires declares on_missing "fail": the step refuses rather than running a query plan, '
        + 'or an algorithm, that the declaration does not describe.');
    }
    log.warn(tag, `required ${r.kind} "${r.name}" is absent and on_missing is "${r.on_missing}"`);
  }
  return measured;
}

/**
 * The chain-scoped pipeline name run-chain records (`${chainId}:${slug}`). A
 * STANDALONE run must read the SAME history an in-chain run writes, or every manual
 * invocation looks like a first run and every drift guard degrades to "no baseline".
 * The fallback chain is the first declared `execution.invocation` key.
 */
/**
 * The check ids whose FAIL is a standing, ACKNOWLEDGED anomaly (ruling A-5).
 *
 * One home, because the pre-write gate and the terminal/status cascade must agree on
 * it exactly: a FAIL the gate refuses to accept but the cascade accepts (or the
 * reverse) is a step that aborts the write and then reports `completed`.
 */
function acceptedCheckIds(descriptor) {
  return new Set(staleness.acceptAnomalies(descriptor).filter((a) => a.standing).map((a) => a.check_id));
}

/**
 * Split the FAIL rows into "every FAIL that happened" and "the FAILs no standing
 * `override.accept_anomaly` covers" — the ONE place that partition is computed, so
 * the status cascade and the pre_write gate cannot disagree about what acceptance
 * means (they did not before; this keeps it that way by construction).
 *
 * POST-B1-1 Guardian fold (operator ruling, 2026-09-15) — **an errored check QUERY is
 * NEVER covered by acceptance.** `override.accept_anomaly[].why` prices a MEASURED
 * anomaly ("when the city genuinely re-publishes the layer at a different size, an
 * operator must be able to accept the drift for ONE run" — load-ravines
 * `ravine_count_drift_pct`): the operator looked at a number and accepted it. A check
 * whose query THREW measured nothing, so there is no anomaly to accept — the standing
 * flag would silently convert "we could not look" into "we looked and it was fine",
 * which is the Spec 121 §12b.6 green-because-it-never-looked class the whole verdict
 * library exists to close. Such a row therefore stays in `unaccepted`, which makes the
 * `COMPLETED_WITH_ERRORS` acceptance branch unreachable for it and lands the run on
 * `FAILED` / terminal `fail_check`. The row is identified by the `errored: true` marker
 * `scripts/lib/step/verdict.js` `checkRow` stamps on the errored arm ONLY (never a
 * string-sniff of the row's rendered `value`, which is operator-facing prose).
 *
 * @param {Array<{metric:string,status:string,errored?:boolean}>} rows
 * @param {Set<string>} accepted - `acceptedCheckIds(descriptor)`
 * @returns {{failedIds:Set<string>, unaccepted:string[]}}
 */
function partitionFailedRows(rows, accepted) {
  const failed = (rows || []).filter((r) => r.status === 'FAIL');
  const failedIds = new Set(failed.map((r) => r.metric));
  const unaccepted = [...new Set(
    failed.filter((r) => r.errored === true || !accepted.has(r.metric)).map((r) => r.metric),
  )];
  return { failedIds, unaccepted };
}

function ledgerPipelineName(descriptor, chainId) {
  const inv = descriptor.execution.invocation;
  const declared = inv && inv !== 'none' ? Object.keys(inv)[0] : null;
  const chain = chainId || declared;
  return chain ? `${chain}:${descriptor.identity.name}` : descriptor.identity.name;
}

/**
 * The ACQUIRE → VALIDATE → WRITE phase (ruling A-1(b)).
 *
 * Everything here was, in every loader, ~290 lines of hand-written `main()`. It is
 * the runner's now, driven by `inputs.reads.externals` + `staleness.trigger` +
 * `outputs.writes` + `guards`, and it hands the compute a RESULT to observe rather
 * than a pipeline to execute: `ctx.acquired`, `ctx.written`, `ctx.prior`,
 * `ctx.overrides`. The compute reaches no socket, no file and no env.
 *
 * ⚠️ PHASE ORDER IS A GUARANTEE, NOT A CONVENIENCE (Fold C, operator ruling §7.1
 * 2026-08-26 — LR-D9). The pre-conversion loader evaluated L7 (count drift) and L8
 * (invalid geometry) INLINE and `return`ed before `withTransaction` ever opened, so
 * "FAIL ⇒ zero rows touched" was carried by STATEMENT ORDER. Lifting the loop into an
 * archetype reordered it to acquire → validate → write → score, which silently retired
 * that guarantee: the write was already committed by the time the FAIL row existed.
 * `preWriteGate` restores it structurally — the `when: "pre_write"` checks are scored
 * HERE, between the (read-only) geometry validation and the first write statement, and
 * an unaccepted FAIL means `write.executeWrite` is never called at all.
 *
 * @returns {Promise<object>} `{skipped, reason, terminal, acquired, written, prior, overrides, emitBlock}`
 */
async function runIngestPhase({ descriptor, pool, compute, config, fetchImpl, chainId, log, tag, clockNow, preWriteGate }) {
  // ⚠️ ONE WRITE TARGET, REFUSED BY NAME AT PLAN TIME. Every line below indexes
  // `writes[0]`: the write plan, the key column, the geometry validation and the scoped
  // departure DELETE. A second declared target would be acquired for, gated over and then
  // NEVER WRITTEN — a table declared in `outputs.writes` and in PIPELINE_META, silently
  // empty, with a green verdict over it. The multi-target loop is real work (one txn or
  // several? whose keys does the departure DELETE scope by?); until it exists the throw
  // names the tables rather than letting the descriptor claim something the runner
  // does not do. This fires BEFORE the HEAD, so a mis-declared step costs no network.
  const writes = descriptor.outputs.writes;
  if (writes.length !== 1) {
    throw new Error(`${tag} the INGESTOR archetype drives exactly ONE write target, and this descriptor declares `
      + `${writes.length} (${writes.map((w) => w.table).join(', ') || 'none'}). Only outputs.writes[0] would be `
      + 'written; the rest would be declared, gated over and left empty under a green verdict.');
  }
  const writeSpec = writes[0];
  const emit = emitsList(descriptor)[0] || null;
  const emitKey = emit ? emit.key : null;
  const skeleton = emit && emit.skeleton && emit.skeleton !== 'none' ? { ...emit.skeleton } : {};
  const external = descriptor.inputs.reads.externals.find((e) => typeof e.url === 'string' && e.url.length > 0);
  // ⚠️ EVERY EXTERNAL THAT CARRIES A RECORD OWES A SHAPE, DECLARED BEFORE THE FIRST
  // NETWORK CALL. Both parsers hand back the publisher's per-feature data verbatim —
  // `parseCsv` as the row object, `parseShapefile` (since 0f) as the DBF properties on
  // `record` — and neither can know which columns the write plan binds.
  // `compute.shapeRecord(record, { geojson, config, run_at })` is that mapping: the
  // step's own pure function from ONE parsed record to the column values
  // `write.executeWrite` binds, i.e. the `{ ...columns, geojson }` shape the plan's
  // `bind` fields address — `geojson` is the GEOMETRY FIELD NAME every geometry-binding
  // column reads (`columnValues(row)` spreads the record into the upsert's bound
  // values, and `validateGeometries` regexes the `geojson` string out of it), so a
  // step's `shapeRecord` must return `geojson` for its geometry column or the row
  // validates as geometry-less. A shapefile's given `geojson` is handed IN so the step
  // may return it unchanged. Returning `null` is how the step says "this row is NOT
  // loadable" — the departure is counted (`shaped_skipped`, below), never silently
  // dropped. `config` is the step's RESOLVED config (the same `ctx.config` object the
  // checks read, INGESTOR prerequisite 0n) — a shaping rule that legitimately depends
  // on a Rule 3 tunable (e.g. `parcels_irregularity_threshold`) reads it from here
  // rather than re-resolving logic variables itself. `run_at` is the runner's own clock
  // (the SAME `Date` `columnValues` stamps into `updated_at` below) — compute may not
  // read the wall clock directly (the compute-shape rule), so a date-relative shaping
  // rule (an expiry filter) is handed the RUN's time, not `new Date()`.
  //
  // ⚠️ THE TWO FORMATS DIFFER ON ABSENCE, DELIBERATELY. A `csv` external with NO
  // `shapeRecord` is a HARD ERROR — the CSV arm produces no `geojson` at all, so the
  // step would write geometry-less rows. A `shapefile_zip` external with no
  // `shapeRecord` is LEGAL and keeps today's behaviour exactly: `parseShapefile`
  // already emits `{[keyColumn], geojson, record}` and the feature passes straight
  // through (`load_ravines` is this arm — it binds only key + geom and exports no
  // `shapeRecord`). What replaced the old "the shapefile arm is untouched" sentence:
  // the shapefile arm now RESOLVES `shapeRecord` too (so an attribute-carrying
  // INGESTOR like load_centreline/massing can bind DBF columns), and merely tolerates
  // its absence. Refused here, above the HEAD, for the same reason the
  // `writes.length !== 1` guard is: a mis-declared step must cost no network.
  const shapeRecord = typeof compute.shapeRecord === 'function' ? compute.shapeRecord : null;
  if (external.format === 'csv' && typeof shapeRecord !== 'function') {
    throw new Error(`${tag} the external "${external.id}" declares format "csv", so this INGESTOR must export `
      + '`shapeRecord(record)` — the pure mapping from ONE parsed CSV row to the column values '
      + `outputs.writes[0] ("${writeSpec.table}") binds, \`null\` for a row the step refuses to load. `
      + 'compute.shapeRecord is ' + (compute.shapeRecord === undefined ? 'undefined' : typeof compute.shapeRecord) + '.');
  }
  // ONE source for the timeout (peel 8c): `execution.network.timeout_from_config` names
  // the logic variable, the resolved value wins, and the `timeout` literal is the stated
  // fallback for an un-seeded database rather than a second source of truth.
  const timeoutMs = acquire.resolveTimeoutMs(descriptor, config);
  const overrides = staleness.resolveOverrides(descriptor);
  const forced = overrides.force_run === true;
  const plan = write.buildWritePlan(writeSpec, descriptor);
  const keyColumn = plan.keys[0];

  // ── THE COMPUTE-AUTHORED UPSERT (batch-2 Phase 3 prerequisite 0k, 2026-09-24) ─────
  // `write_discipline.set_source:"compute"` on a `guarded_upsert` target (an EXISTING
  // declared mechanism the RECORDER pilot 8 / LG-27 uses, Spec 124 Rule 1 rung (a) — no
  // new field) means the compute AUTHORS the whole INSERT...ON CONFLICT...DO UPDATE...
  // WHERE text; the runner only EXECUTES it (Spec 122 §5.5). `parcels` needs this: its
  // legacy UPSERT carries `COALESCE(NULLIF(EXCLUDED.x,''), parcels.x)` ×5 and three
  // `CASE WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb THEN NULL
  // ELSE … END` lineage-stamp arms the default codegen cannot express.
  //
  // ⚠️ RESOLVED AND ATTACHED HERE, ABOVE THE HEAD, for the same reason the `shapeRecord`
  // guard is: a compute-authored plan whose compute exports no `buildWriteSql` is a
  // MIS-DECLARED step and must cost no network and no pool access. The throw is named
  // (the export, the table, what it owes) rather than a downstream `TypeError` on
  // `plan.upsertSqlFor` inside `executeWrite`, which is what an unguarded compute plan
  // produced before this runner change.
  //
  // The contract, in the RECORDER's own vocabulary: `compute.buildWriteSql({ table,
  // columns: plan.step_columns, keys: plan.keys, geometry_column, geometry_kind })`
  // returns `{ upsertSqlFor: (rowCount) => string, bindRow: (columnValues) => any[] }`.
  // `columns` is the INSERT/bind list in the plan's column ORDER — `$n` placeholders run
  // in that order, `columnsPerRow` per row — and the statement MUST end in
  // `RETURNING (xmax = 0) AS is_insert`, which is exactly what `executeWrite` filters on
  // for its inserted/updated accounting (D-8). Everything downstream
  // (`validateGeometries`, `executeWrite`) is untouched: they read the same plan fields
  // the default codegen has always carried.
  if (plan.set_source === 'compute') {
    if (typeof compute.buildWriteSql !== 'function') {
      throw new Error(`${tag} outputs.writes[0] ("${writeSpec.table}") declares write_discipline.set_source "compute", `
        + 'so the whole INSERT...ON CONFLICT...DO UPDATE statement is authored by the compute — this INGESTOR must '
        + 'export `buildWriteSql({ table, columns, keys, geometry_column, geometry_kind })` returning '
        + '`{ upsertSqlFor(rowCount) => string, bindRow(columnValues) => any[] }` (the statement must end in '
        + '`RETURNING (xmax = 0) AS is_insert`). compute.buildWriteSql is '
        + (compute.buildWriteSql === undefined ? 'undefined' : typeof compute.buildWriteSql) + '.');
    }
    const authored = compute.buildWriteSql({
      table: plan.table,
      columns: plan.step_columns,
      keys: plan.keys,
      geometry_column: plan.geometry_columns[0] || null,
      geometry_kind: plan.geometry_kind ?? null,
    });
    if (!authored || typeof authored.upsertSqlFor !== 'function' || typeof authored.bindRow !== 'function') {
      throw new Error(`${tag} compute.buildWriteSql for "${writeSpec.table}" returned `
        + `${authored === null ? 'null' : typeof authored} — the set_source "compute" contract requires an object with `
        + '`upsertSqlFor(rowCount)` and `bindRow(columnValues)` callables (the same shape write.js\'s default '
        + 'codegen returns); the runner attaches them to the plan and calls them directly.');
    }
    // Attached to the SAME plan the rest of runIngestPhase already holds — nothing
    // downstream branches on `set_source`; it only ever reads `upsertSqlFor`/`bindRow`/
    // `columnsPerRow`, which every plan now carries whichever way the SQL was authored.
    plan.upsertSqlFor = authored.upsertSqlFor;
    plan.bindRow = authored.bindRow;
  }

  // LR-D2 — the prior-run read is NOT swallowed, and WHAT HAPPENS when it fails is
  // DECLARED (`staleness.on_prior_run_error`) rather than decided in a catch block.
  // The pre-conversion `.catch(warn => null)` degraded every drift guard to "first run"
  // behind a single log.warn; the two legal postures are refuse (`fail_step`, the
  // absent default) and proceed-and-say-so (`warn_row`, which owes the audit row
  // below). Neither is silent.
  const posture = staleness.priorRunErrorPosture(descriptor);
  const { prior, error: priorError } = await staleness.readPriorEmitWithPosture(
    pool, ledgerPipelineName(descriptor, chainId), emitKey, posture,
  );
  if (priorError) {
    log.warn(tag, `prior-run read failed under posture "${posture}" — continuing with NO baseline: ${priorError.message}`);
  }

  // The RLS preflight runs BEFORE anything is downloaded: refusing early is cheaper
  // than discovering after a 7 MB download that every write would affect 0 rows.
  const privilege = await write.assertWritePrivileges(pool, descriptor, { log, tag });

  const result = await acquire.acquireExternal({
    ctxFetch: fetchImpl,
    log,
    tag,
    slug: descriptor.identity.name,
    external,
    descriptor,
    config,
    prior,
    timeoutMs,
    keyProperty: external.key_property,
    keyColumn,
    coerceKey: compute.coerceKey,
    forced,
    emitSkeleton: skeleton,
    preAcquisitionGate: (head) => staleness.preAcquisitionDecision({
      descriptor,
      validators: { lastModified: head.lastModified, etag: head.etag },
      prior,
      forced,
    }),
  });

  const gate = result.tier1.skip ? result.tier1 : result.tier2;
  if (gate.skip) {
    const signal = result.tier1.skip ? 'source_validator' : 'content_hash';
    return {
      skipped: true,
      reason: gate.reason,
      signal,
      acquired: result.acquired,
      written: null,
      prior,
      priorError,
      overrides,
      emitKey,
      // Built by the acquisition seam, where the gate actually fired (DS4).
      emitBlock: result.emitBlock,
    };
  }

  // ── THE SHAPE MAPPING, BEFORE THE DEDUPE ─────────────────────────────────────
  // Order is the guarantee: both parsers yield `{[keyColumn]: key, record}` (a
  // shapefile also carries a pre-stringified `geojson`), and only a SHAPED record has
  // the column values the write plan binds (`geojson` included). A `null` from
  // `shapeRecord` is a row the step refuses to load — counted on the acquired block as
  // `shaped_skipped` and dropped BEFORE the dedupe, so the dedupe and every counter
  // below describe the rows actually going to the write rather than the rows the
  // publisher sent. `{ geojson }` is handed IN so a shapefile's geometry (already a
  // GeoJSON string from `parseShapefile`) can be returned unchanged. NO `shapeRecord`
  // (a shapefile INGESTOR like load_ravines): every feature passes through as-is.
  // Hoisted here (rather than declared once, later, alongside the write dispatch) so
  // `shapeRecord` below and `columnValues`'s `updated_at` further down read the exact
  // same `Date` — ONE run clock, not two independent reads of `clockNow`.
  const runAt = clockNow;
  let features = result.features;
  let shapedSkipped = 0;
  // ── SKIP REASONS + ROW TAGS (INGESTOR prerequisite 0p, 2026-09-24) ───────────
  // Two additive, ALWAYS-{} counters. `shapeRecord` may return a row (kept), `null`
  // (a skip, reason `"unspecified"`) or a NON-EMPTY STRING (a skip, that string as
  // its reason — the legacy load-centreline vocabulary, e.g. `non_street`/`federal`),
  // and a KEPT row may tag itself through `ctx.tag(name)` (e.g. an
  // `unknown_jurisdiction` bucket). Neither widens the descriptor schema, and
  // `Σ shaped_skipped_by_reason === shaped_skipped` by construction.
  const skippedByReason = {};
  const shapedTags = {};
  const tagRecord = (name) => { shapedTags[name] = (shapedTags[name] || 0) + 1; };
  if (shapeRecord) {
    const shaped = [];
    for (const f of features) {
      const record = shapeRecord(f.record, { geojson: f.geojson, config, run_at: runAt, tag: tagRecord });
      if (record == null || typeof record === 'string') {
        const r = typeof record === 'string' && record ? record : 'unspecified';
        skippedByReason[r] = (skippedByReason[r] || 0) + 1;
        shapedSkipped++;
        continue;
      }
      shaped.push({ [keyColumn]: f[keyColumn], ...record });
    }
    features = shaped;
  }
  // `rows_shaped` (INGESTOR prerequisite 0o, 2026-09-24) — the count of features that
  // SURVIVED `shapeRecord` (or every parsed feature, for a step with none), taken here,
  // BEFORE the dedupe below can remove any of them. Distinct from `feature_count`
  // (post-dedupe, below) and from `rows_read` (pre-shapeRecord, raw): three different
  // denominators, three different questions, none of them collapsed into one number.
  const rowsShaped = features.length;

  // Dedupe BEFORE the upsert: `ON CONFLICT` cannot affect the same row twice in one
  // statement, so a duplicated source key is a hard error, not a warning, unguarded.
  const { kept, duplicateCount } = compute.dedupeBySourceId(features);
  // Read-only SQL, and it ran before the write in the pre-conversion loader too
  // (`pool.query(VALIDATION_SQL)` at 33786d1a:scripts/load-ravines.js:422). Its counters
  // are what L8 measures, which is why the pre_write gate sits immediately below it.
  const validated = await write.validateGeometries(pool, plan, kept, compute.validatorCounterDelta, { log, tag });

  // ── COLUMN-NULL COUNTERS (INGESTOR prerequisite 0o, filed
  // docs/reports/review_followups.md "2026-09-24 — batch-2 row 3.7 ... commit ②")
  // ─────────────────────────────────────────────────────────────────────────────
  // Generic over EVERY declared step column (`plan.step_columns`), never a per-step
  // name — a check reading a specific column (e.g. `null_address_number_pct`) reads
  // `acquired.column_nulls.<column>` instead of a dedicated, ungeneralizable counter.
  // Counted on `validated.carried` — the EXACT shape `columnValues` binds into the
  // write, so every column name here (including the geometry column, which only
  // carries its TRUE name — `plan.geometry_columns[0]` — after `validateGeometries`;
  // a pre-validation shaped row still carries it as the seam name `geojson`) lines up
  // with `plan.step_columns` byte for byte. `''` counts alongside `null`/`undefined`:
  // a CSV loader hands back an empty string for a blank cell, never SQL NULL, at parse
  // time (`load-parcels.js`'s pre-conversion `nullAddressCount` counted the same way).
  const columnNulls = {};
  for (const col of plan.step_columns) {
    let n = 0;
    for (const row of validated.carried) {
      const v = row[col];
      if (v === null || v === undefined || v === '') n++;
    }
    columnNulls[col] = n;
  }

  const acquired = {
    ...result.acquired,
    // Two names for two different counts, BOTH real: `result.acquired.rows_parsed` is
    // the raw feature count `parseCsv`/`parseShapefile` produced, unrenamed here so the
    // acquisition seam's own vocabulary survives; `rows_read` is the SAME number under
    // the name the two legacy-loader computes' `rows_read_floor`/`skip_rate_pct` checks
    // already read (`numberOrNull(a.rows_read) ?? numberOrNull(a.feature_count)`), which
    // before this line always fell through to the POST-filter `feature_count`.
    rows_read: result.acquired.rows_parsed,
    rows_shaped: rowsShaped,
    column_nulls: columnNulls,
    feature_count: kept.length,
    duplicate_key_count: duplicateCount,
    shaped_skipped: shapedSkipped,
    shaped_skipped_by_reason: skippedByReason,
    shaped_tags: shapedTags,
    invalid_geometry_repaired: validated.repaired,
    // The rows this run STORES with an invalid geometry (prerequisite 0t) — structurally 0
    // under the default `make_valid` arm, non-zero only for a write that DECLARED
    // `geometry_repair: "none"` (legacy-source parity). Golden-neutral: a descriptor that
    // declares nothing acquires the same value it always had.
    invalid_geometry_stored: validated.invalidStored ?? 0,
    invalid_geometry_skipped: validated.skipped,
    geometry_collection_extracted: validated.collectionExtracted,
    skipped_keys: validated.skippedKeys,
  };

  // ── THE PRE-WRITE GATE (LR-D9) ───────────────────────────────────────────────
  // Everything above this line is a read. Everything below it writes. A `pre_write`
  // check that FAILs with no standing acceptance stops the run HERE: no transaction is
  // opened, no upsert and no departure DELETE is issued, and the prior table state is
  // preserved exactly as the pre-conversion `return { failed: true }` preserved it.
  const gateDecision = preWriteGate
    ? await preWriteGate({ acquired, prior, overrides, written: null })
    : { abort: false, skipWrite: false, failed: [] };
  if (gateDecision.abort) {
    log.error(tag, `pre_write check(s) FAILED with no standing override, the write is SKIPPED — `
      + `${plan.table} is untouched: ${gateDecision.failed.join(', ')}`);
    return {
      skipped: false,
      writeSkipped: true,
      reason: 'pre_write_check_failed',
      failedPreWrite: gateDecision.failed,
      acquired,
      // "An empty `written`" — every counter zero, so the remaining `post` checks score
      // over what actually happened (nothing) rather than over a null they would read as
      // "not reported". The MEASURED privilege is carried because it WAS measured, above
      // the acquisition; zeroing it would manufacture a second, spurious FAIL row.
      written: {
        inserted: 0,
        updated: 0,
        deleted: 0,
        rows_scanned: 0,
        rows_changed: 0,
        delete_skipped_empty_guard: false,
        write_skipped_pre_write_fail: true,
        privilege: privilege[writeSpec.table] || null,
      },
      prior,
      priorError,
      overrides,
      emitKey,
      emitBlock: null,
    };
  }
  // ── THE THIRD ARM (prerequisite 0h, Fold A F1): a WARN-severity pre_write check that
  // DECLARED `on_warn: "skip_write"`. This is the legacy load-centreline F-C1 "warn and
  // preserve" arm, made declared and observable: NO transaction is opened, the target table
  // is untouched, and every write counter stays zero — but the run COMPLETES (verdict WARN
  // from the row that caused it, not FAIL from a gate abort), so `post` checks still score.
  // `write_skipped_pre_write_warn` is carried for the audit row (§preWriteSkipRows) and the
  // `failedPreWrite` field is deliberately ABSENT: an abort it is not.
  if (gateDecision.skipWrite) {
    const skipWriteChecks = gateDecision.skipWriteChecks || [];
    log.warn(tag, `pre_write WARN on a check declaring on_warn "skip_write" — the write is SKIPPED, `
      + `${plan.table} is untouched and the run completes: ${skipWriteChecks.join(', ') || 'floor not met'}`);
    return {
      skipped: false,
      writeSkipped: true,
      reason: 'pre_write_warn_skip_write',
      writeSkippedPreWriteWarn: true,
      failedPreWriteWarn: skipWriteChecks,
      acquired,
      written: {
        inserted: 0,
        updated: 0,
        deleted: 0,
        rows_scanned: 0,
        rows_changed: 0,
        delete_skipped_empty_guard: false,
        write_skipped_pre_write_warn: true,
        privilege: privilege[writeSpec.table] || null,
      },
      prior,
      priorError,
      overrides,
      emitKey,
      emitBlock: null,
    };
  }

  // ── THE WRITE DISPATCH (Fold A F6). Class C is a REPLACE, not an upsert: it has no
  // `ON CONFLICT` and no per-row insert-vs-update question, so it gets its own executor.
  // Everything else — A, B, and the compute-authored A — stays on `executeWrite` unchanged.
  const writeArgs = {
    plan,
    writeSpec,
    carried: validated.carried,
    columnValues: (row) => ({
      ...row,
      source_dataset_version: result.acquired.source_dataset_version,
      updated_at: runAt,
    }),
    log,
    tag,
  };
  const written = writeSpec.write_discipline.class === write.STAGING_FULL_REPLACE_CLASS
    ? await write.executeStagingReplace(pool, { ...writeArgs, prior })
    : await write.executeWrite(pool, { ...writeArgs, shouldSkipDelete: compute.shouldSkipDelete });

  return {
    skipped: false,
    writeSkipped: false,
    reason: 'loaded',
    acquired,
    written: { ...written, privilege: privilege[writeSpec.table] || null },
    prior,
    priorError,
    overrides,
    emitKey,
    emitBlock: null,
  };
}

/**
 * THE READ → GATE → ORDERED-WRITE PHASE (ruling A-1(a), LINK/MATCHER wave).
 *
 * This file's own header scheduled the wave by name — "invalidation + counters scoped by
 * `writes.key` → LINK/MATCHER" — and pilot 3 measured why it could not wait: a LINK reads
 * two domain tables, joins them on a spatial predicate and writes a junction, and NONE of
 * that had a home. `isIngestStep` wanted an external URL, so `link_massing` fell to the
 * ASSERT path where the library writes nothing; §5.5 (1) forbids the join living in the
 * compute; so the 740-line island was the only place it could be.
 *
 * PHASE ORDER IS THE GUARANTEE, and every step of it is one of the 13 before/after
 * guarantees re-derived from the step's own three specs BEFORE the archetype was chosen
 * (tasks/lessons.md's last line — pilot 2 silently retired Spec 59 L7/L8 by reordering):
 *
 *   guards.requires        preconditions BEFORE the first read       (B-4: a missing GiST
 *                                                                     index turns a 22-min
 *                                                                     run into an unbounded one)
 *   prior + selectMode     the gate reads the LAST COMPLETED PRIOR    (B-5, B-6: the ledger
 *                          run and outputs a MODE, before anything     row was opened as
 *                          is deleted                                  `running` above, so the
 *                                                                      step cannot read itself)
 *   RUN_AT                 the DB clock, captured ONCE, before any    (B-11: two batches must
 *                          write                                       not straddle a second —
 *                                                                      linked_at is a watermark)
 *   RLS preflight          refuse a write that would affect 0 rows    (A-7)
 *   PRE_WRITE GATE         scored BEFORE writes[0], i.e. before the   (D-20: today the FULL
 *                          mass retraction                             DELETE has no guard at
 *                                                                      all and would happily
 *                                                                      empty the junction
 *                                                                      against an empty corpus)
 *   writes[] IN ORDER      the declared retraction, then the declared (B-7: ONE delete, before
 *                          targets 1..N per batch                      the loop, in a txn,
 *                                                                      scoped identically to
 *                                                                      the parcels re-evaluated.
 *                                                                      B-8: the primary clear
 *                                                                      precedes the upsert or
 *                                                                      the partial unique index
 *                                                                      throws when a primary
 *                                                                      moves)
 *   post checks            over `ctx.matched` / `ctx.written`
 *
 * The compute never reaches the pool. It contributes exactly three pure things — the SQL
 * TEXT of the domain join (`buildMatchSql`, ruling A-2 option 2), the row classifiers, and
 * one observer per declared check — and the rest is descriptor data.
 *
 * @returns {Promise<object>} `{mode, gate, matched, cumulative, written, prior, overrides}`
 */
async function runLinkPhase({ descriptor, pool, compute, config, chainId, log, tag, clockNow, preWriteGate, ownRunId }) {
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  const prior = await staleness.readPriorEmit(pool, ledgerPipelineName(descriptor, chainId), null);
  const overrides = staleness.resolveOverrides(descriptor);
  // LW-D15 — declared dry-run semantics for the LINK phase too (link_massing declares
  // `override.dry_run: "none"` today, so this is currently inert for it, but the write
  // suppression below is the generic mechanism every LINK/MATCHER descriptor gets the
  // moment it declares a dry-run flag — never a per-step branch).
  const dryRun = overrides.dry_run;
  const gate = await staleness.selectMode({ descriptor, pool, prior, ownRunId });
  const privilege = await write.assertWritePrivileges(pool, descriptor, { log, tag });
  log.info(tag, `mode gate: explicit_full=${gate.explicit_full} forced=${gate.forced} `
    + `changed=${gate.changed} → ${gate.mode.toUpperCase()} (${gate.reason})`);

  // The declared targets, planned up front so a mis-declared write costs no query.
  const specs = descriptor.outputs.writes;
  const plans = specs.map((w) => write.buildWritePlan(w, descriptor));
  const written = {};
  for (let i = 0; i < plans.length; i++) {
    written[write.targetKey(i)] = { scanned: 0, inserted: 0, updated: 0, deleted: 0, retracted: 0, rows_changed: 0 };
  }
  written.privilege = privilege[plans[plans.length - 1].table] || null;
  written.requirements = requirements;
  // R-M / LG-17 — one entry per destructive-retraction target this run actually wrote
  // a before-image for (W1, below); surfaces as `before_image_written` audit rows.
  const beforeImage = [];

  const match = compute.buildMatchSql(descriptor, config, gate.mode);
  const eligible = await pool.query(match.eligible_count_sql);
  // ⚠️ THE RUNNER NAMES NOTHING THE STEP DID NOT DECLARE (Gate 0 / claim #149). The four
  // counters below are the LINK vocabulary itself — rows walked, rows linked, rows that
  // matched nothing — but the two PASS counters and the upstream corpus size are
  // step-specific quantities, so their KEYS come from the step: the pass names from the
  // compute's own match plan, the gate signals from the descriptor's trigger `emit_key`.
  // Hard-coding either here would put a domain word in a generic runner, which is the
  // "one step gets a special case, then there are 27" failure this gate exists to stop.
  const matched = {
    parcels_eligible: Number(eligible.rows[0].total),
    parcels_processed: 0,
    parcels_linked: 0,
    no_match: 0,
    [match.primary_counter]: 0,
    [match.fallback_counter]: 0,
  };
  for (const s of gate.signals) {
    if (s.current === null) continue;
    matched[s.key] = Number.isNaN(Number(s.current)) ? s.current : Number(s.current);
  }

  // ── THE PRE-WRITE GATE, BEFORE writes[0] ────────────────────────────────────
  // Everything above is a read. The next statement retracts. A `pre_write` FAIL with no
  // standing acceptance stops the run HERE, with the junction exactly as the prior run
  // left it — which is the guarantee an unguarded `DELETE FROM …` cannot make.
  const decision = preWriteGate
    ? await preWriteGate({ matched, gate, prior, overrides, written: null })
    : { abort: false, failed: [] };
  if (decision.abort) {
    log.error(tag, `pre_write check(s) FAILED with no standing override — no write was issued and `
      + `${plans[0].table} is untouched: ${decision.failed.join(', ')}`);
    return {
      mode: gate.mode,
      gate,
      matched,
      cumulative: null,
      written: { ...written, write_skipped_pre_write_fail: true },
      prior,
      overrides,
      writeSkipped: true,
      failedPreWrite: decision.failed,
    };
  }

  // ── W1 — the declared retraction, ONE statement, before the loop ─────────────
  // LW-D15 — a dry-run issues ZERO write statements, including the retraction: it is
  // as destructive as the ordered writes below and the whole point of the flag is that
  // nothing in the run persists.
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    if (dryRun || !write.retractionFires(plan, gate.mode)) continue;
    const removed = await pipeline.withTransaction(pool, async (client) => {
      // R-M / LG-17 — the before-image read+write happens on the SAME client, inside
      // the SAME transaction, strictly BEFORE the retraction call below: a throw here
      // (disk full, permissions) aborts the transaction and the retraction never runs.
      const bi = await write.writeBeforeImage(client, plan, [], descriptor.identity.name, clockNow);
      if (bi.written) beforeImage.push({ ...bi, table: plan.table });
      return write.executeRetraction(client, plan);
    });
    written[write.targetKey(i)].retracted = removed;
    written[write.targetKey(i)].deleted = removed;
    log.info(tag, `${plan.table}: retracted ${removed.toLocaleString()} row(s) for re-evaluation `
      + `(retract "${plan.retract}", retract_when "${plan.retract_when}", mode ${gate.mode})`);
  }

  // ── The keyset-paginated batch loop: match, classify, then writes[] IN ORDER ──
  const batchSize = descriptor.execution.batch === 'none' ? pipeline.BATCH_SIZE : descriptor.execution.batch;
  let lastId = 0;
  for (;;) {
    const batch = await pool.query(match.eligible_batch_sql, [batchSize, lastId]);
    if (batch.rows.length === 0) break;
    lastId = batch.rows[batch.rows.length - 1].id;
    const ids = batch.rows.map((r) => r.id);

    const primary = await pool.query(match.primary_match_sql, [ids]);
    const classified = compute.classifyMatches(primary.rows, config);
    const linkedIds = new Set(classified.rows.map((r) => r[plans[0].keys[0]]));

    const unmatched = ids.filter((id) => !linkedIds.has(id));
    let fallback = { rows: [], parcels: 0 };
    if (unmatched.length > 0 && match.fallback_match_sql) {
      const near = await pool.query(match.fallback_match_sql, [unmatched, match.fallback_bbox_degrees, match.fallback_max_distance]);
      fallback = compute.classifyFallback(near.rows, config);
      for (const r of fallback.rows) linkedIds.add(r[plans[0].keys[0]]);
    }

    const rows = [...classified.rows, ...fallback.rows];
    // LW-D15 — the write is skipped entirely in dry-run; `rows.length` (the match
    // SELECTs' own result) is the "would-write" count, same fidelity the pre-conversion
    // `link-wsib.js` dry-run reported (read-only COUNT queries over the same match
    // predicate, 5de41cc1) — `written` stays genuinely zero, which is correct: nothing
    // was written.
    if (rows.length > 0 && !dryRun) await executeOrderedWrites(pool, plans, rows, clockNow, written, specs);

    matched.parcels_processed += batch.rows.length;
    matched.parcels_linked += classified.parcels + fallback.parcels;
    matched[match.primary_counter] += classified.matches;
    matched[match.fallback_counter] += fallback.rows.length;
    matched.no_match += ids.filter((id) => !linkedIds.has(id)).length;
  }

  // ONE post-write query for the cumulative rate AND the table invariants the checks
  // assert BY COUNT. Its extra scalars are what make "the constraint exists" and "the
  // constraint held on this run" two different claims.
  const cumulative = await pool.query(match.cumulative_sql, match.cumulative_params || []);
  const row = cumulative.rows[0];
  for (const k of Object.keys(row)) {
    if (k === 'linked' || k === 'total') continue;
    // A scalar is coerced; a STRUCTURED value (a jsonb object the step's own query built —
    // a count broken down by one of its own vocabularies) is carried through untouched.
    // `Number({})` is NaN, so coercing everything silently destroyed any observation that
    // was not a bare integer, and the compute would report NaN with nothing saying why.
    const v = row[k];
    matched[k] = v !== null && typeof v === 'object' ? v : Number(v);
  }
  return {
    mode: gate.mode,
    gate,
    matched,
    cumulative: {
      linked_parcels: Number(row.linked),
      parcels_with_centroid: Number(row.total),
    },
    written,
    prior,
    overrides,
    writeSkipped: false,
    beforeImage,
  };
}

/**
 * THE COMPOSITE-KEY LINK PHASE (LINK pilot 7, `link_parcels`, 2026-08-30 — ruling A-4,
 * Fold B item 4: forked from `runLinkPhase` UNCONDITIONALLY, not a branch inside it).
 *
 * Three reasons `runLinkPhase` cannot serve `link_parcels` unmodified (Fold A B-1/B-2/B-3):
 *   1. `permits`' PK is a composite `(permit_num, revision_num)`, no surrogate `id` —
 *      `runLinkPhase`'s `eligible_batch_sql` + `lastId` cursor cannot page it (LG-25).
 *   2. FOUR match strategies (address UNION ALL primary, spatial containment, spatial
 *      KNN fallback), not `runLinkPhase`'s ONE primary + ONE fallback pass.
 *   3. Class F (`link_full_retraction`, LG-24) is a COMPOUND write — upsert THEN a
 *      keyed DELETE of superseded rows, both inside ONE batch transaction (Fold B item
 *      5's declared `writes[]` order) — `runLinkPhase`'s `executeOrderedWrites` only
 *      knows a set-based clear or a guarded upsert, never a compute-authored keyed DELETE.
 *
 * PHASE ORDER (mirrors `runLinkPhase`'s own, adapted): guards.requires → prior read →
 * overrides → tri-state mode gate → RLS preflight → the declared plans → the pre-write
 * gate → W1 (the FULL-mode-only scoped mass retraction, `retract_when: full_only`,
 * unchanged from `runLinkPhase`'s own generic loop) → the composite-key keyset batch
 * loop (primary → spatial containment → spatial KNN fallback, each excluding rows the
 * earlier pass already matched) → per-batch ordered writes (upsert, THEN LG-24's keyed
 * delete, ONE transaction) → the cumulative post-write query → return.
 *
 * @returns {Promise<object>} `{mode, gate, matched, cumulative, written, prior, overrides, writeSkipped, beforeImage}`
 */
async function runLinkKeyedPhase({ descriptor, pool, compute, config, chainId, log, tag, clockNow, preWriteGate, ownRunId }) {
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  const prior = await staleness.readPriorEmit(pool, ledgerPipelineName(descriptor, chainId), null);
  const overrides = staleness.resolveOverrides(descriptor);
  const dryRun = overrides.dry_run;
  const gate = await staleness.selectMode({ descriptor, pool, prior, ownRunId });
  const privilege = await write.assertWritePrivileges(pool, descriptor, { log, tag });
  log.info(tag, `mode gate: explicit_full=${gate.explicit_full} forced=${gate.forced} `
    + `changed=${gate.changed} → ${gate.mode.toUpperCase()} (${gate.reason})`);

  // Two declared targets: e1 = guarded_upsert (permit_parcels, composite key), e2 =
  // link_full_retraction (LG-24's keyed DELETE, descriptive-only).
  const specs = descriptor.outputs.writes;
  const plans = specs.map((w) => write.buildWritePlan(w, descriptor));
  const written = {};
  for (let i = 0; i < plans.length; i++) {
    written[write.targetKey(i)] = { scanned: 0, inserted: 0, updated: 0, deleted: 0, retracted: 0, rows_changed: 0 };
  }
  written.privilege = privilege[plans[0].table] || null;
  written.requirements = requirements;
  const beforeImage = [];

  const match = compute.buildMatchSql(descriptor, config, gate.mode);
  const eligible = await pool.query(match.eligible_count_sql);
  const matched = {
    permits_eligible: Number(eligible.rows[0].total),
    permits_processed: 0,
    address_points_exact: 0,
    exact_legacy: 0,
    name_only: 0,
    spatial_polygon: 0,
    spatial: 0,
    no_match: 0,
    null_coordinate_permits: 0,
    street_type_mismatch: 0,
  };
  for (const s of gate.signals) {
    if (s.current === null) continue;
    matched[s.key] = Number.isNaN(Number(s.current)) ? s.current : Number(s.current);
  }

  // ── THE PRE-WRITE GATE, BEFORE writes[0] ────────────────────────────────────
  const decision = preWriteGate
    ? await preWriteGate({ matched, gate, prior, overrides, written: null })
    : { abort: false, failed: [] };
  if (decision.abort) {
    log.error(tag, `pre_write check(s) FAILED with no standing override — no write was issued and `
      + `${plans[0].table} is untouched: ${decision.failed.join(', ')}`);
    return {
      mode: gate.mode,
      gate,
      matched,
      cumulative: null,
      written: { ...written, write_skipped_pre_write_fail: true },
      prior,
      overrides,
      writeSkipped: true,
      failedPreWrite: decision.failed,
    };
  }

  // ── W1 — the declared FULL-mode-only scoped mass retraction, ONE statement, before
  //    the loop (Fold A I-1: `retract:"all"`, scope `match_type='spatial'`,
  //    `retract_when:"full_only"`) — byte-for-byte `runLinkPhase`'s own generic loop.
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    if (dryRun || !write.retractionFires(plan, gate.mode)) continue;
    const removed = await pipeline.withTransaction(pool, async (client) => {
      const bi = await write.writeBeforeImage(client, plan, [], descriptor.identity.name, clockNow);
      if (bi.written) beforeImage.push({ ...bi, table: plan.table });
      return write.executeRetraction(client, plan);
    });
    written[write.targetKey(i)].retracted = removed;
    written[write.targetKey(i)].deleted = removed;
    log.info(tag, `${plan.table}: retracted ${removed.toLocaleString()} row(s) for re-evaluation `
      + `(retract "${plan.retract}", retract_when "${plan.retract_when}", mode ${gate.mode})`);
  }

  const upsertPlan = plans[0];
  const deletePlan = plans[1];
  // LG-24's own before-image is DESCRIPTIVE (its SQL is compute-authored, not a
  // `buildWritePlan`-generated `delete_sql`) — a minimal scope covering every row the
  // batch's own DELETE could touch (a superset of what actually deletes is a safe,
  // honest audit trail; the DELETE's own `IS NULL`-vs-`!=` branching is not re-derived
  // here).
  const deleteBeforeImagePlan = {
    table: deletePlan.table,
    scope: 'permit_num = ANY($1::text[]) AND revision_num = ANY($2::text[])',
    keys: ['permit_num', 'revision_num'],
    step_columns: ['permit_num', 'revision_num', 'parcel_id', 'match_type', 'confidence', 'linked_at'],
  };

  // ── The composite-key keyset-paginated batch loop (LG-25) ────────────────────
  const batchSize = descriptor.execution.batch === 'none' ? pipeline.BATCH_SIZE : descriptor.execution.batch;
  let lastPermitNum = '';
  let lastRevisionNum = '';
  for (;;) {
    const batch = await pool.query(match.eligible_batch_sql, [batchSize, lastPermitNum, lastRevisionNum]);
    if (batch.rows.length === 0) break;
    const lastRow = batch.rows[batch.rows.length - 1];
    lastPermitNum = lastRow.permit_num;
    lastRevisionNum = lastRow.revision_num;

    const permitKeys = batch.rows.map((p) => ({
      permit_num: p.permit_num,
      revision_num: p.revision_num,
      num: (p.street_num || '').trim().toUpperCase().replace(/^0+(?=\d)/, ''),
      name: (p.street_name || '').trim().toUpperCase(),
      type: (p.street_type || '').trim().toUpperCase(),
      lat: p.latitude !== null && p.latitude !== undefined ? Number(p.latitude) : null,
      lng: p.longitude !== null && p.longitude !== undefined ? Number(p.longitude) : null,
    }));

    const matchedByKey = new Map(); // "permit_num|revision_num" -> {parcel_id, match_type, confidence}

    // Primary pass — Strategies 1a/1b/2, folded via UNION ALL (A-4 ruling).
    const addrPermits = permitKeys.filter((p) => p.num && p.name);
    if (addrPermits.length > 0) {
      const primary = await pool.query(match.primary_match_sql, [
        addrPermits.map((p) => p.permit_num),
        addrPermits.map((p) => p.revision_num),
        addrPermits.map((p) => p.num),
        addrPermits.map((p) => p.name),
        addrPermits.map((p) => p.type),
      ]);
      const classified = compute.classifyPrimary(primary.rows);
      for (const r of classified.rows) {
        matchedByKey.set(`${r.permit_num}|${r.revision_num}`, { parcel_id: r.parcel_id, match_type: r.match_type, confidence: r.confidence });
      }
      matched.address_points_exact += classified.addressPointsExact;
      matched.exact_legacy += classified.exactLegacy;
      matched.name_only += classified.nameOnly;
    }

    // Strategy 3 Step 1 — polygon containment, UNCHANGED, already geometry-correct.
    const spatialCandidates = permitKeys.filter((p) => !matchedByKey.has(`${p.permit_num}|${p.revision_num}`) && p.lat !== null && p.lng !== null);
    if (spatialCandidates.length > 0) {
      const containment = await pool.query(match.spatial_containment_sql, [
        spatialCandidates.map((p) => p.permit_num),
        spatialCandidates.map((p) => p.revision_num),
        spatialCandidates.map((p) => p.lng),
        spatialCandidates.map((p) => p.lat),
      ]);
      const classified = compute.classifySpatialContainment(containment.rows);
      for (const r of classified.rows) {
        matchedByKey.set(`${r.permit_num}|${r.revision_num}`, { parcel_id: r.parcel_id, match_type: r.match_type, confidence: r.confidence });
      }
      matched.spatial_polygon += classified.matched;
    }

    // Strategy 3 Step 2 — THE FIX. Fed EVERY remaining permit (including NULL-
    // coordinate ones) — the SQL's own `WHERE v.lng IS NOT NULL AND v.lat IS NOT NULL`
    // guard (LP-D6, Fold B item 2) is the SOLE exclusion mechanism, never a JS-level
    // pre-filter, so the guard is genuinely exercised on every run, not merely declared.
    const fallbackCandidates = permitKeys.filter((p) => !matchedByKey.has(`${p.permit_num}|${p.revision_num}`));
    matched.null_coordinate_permits += fallbackCandidates.filter((p) => p.lat === null || p.lng === null).length;
    if (fallbackCandidates.length > 0) {
      const fallback = await pool.query(match.spatial_fallback_sql, [
        fallbackCandidates.map((p) => p.permit_num),
        fallbackCandidates.map((p) => p.revision_num),
        fallbackCandidates.map((p) => p.lng),
        fallbackCandidates.map((p) => p.lat),
        config.spatial_match_max_distance_m,
        config.spatial_match_confidence,
      ]);
      const classified = compute.classifySpatialFallback(fallback.rows);
      for (const r of classified.rows) {
        matchedByKey.set(`${r.permit_num}|${r.revision_num}`, { parcel_id: r.parcel_id, match_type: r.match_type, confidence: r.confidence });
      }
      matched.spatial += classified.matched;
    }

    // ── writes[] IN ORDER: upsert, THEN LG-24's keyed delete, THEN LP-D10's
    //    permits watermark, ONE transaction (Fold B item 5, extended commit 10)
    //    ──────────────────────────────────────────────────────────────────
    if (!dryRun) {
      const upsertRows = [];
      const delPermitNums = [];
      const delRevisionNums = [];
      const delKeepParcelIds = [];
      for (const p of permitKeys) {
        const key = `${p.permit_num}|${p.revision_num}`;
        const m = matchedByKey.get(key);
        if (m) {
          upsertRows.push({
            permit_num: p.permit_num, revision_num: p.revision_num,
            parcel_id: m.parcel_id, match_type: m.match_type, confidence: m.confidence,
            linked_at: clockNow,
          });
        } else {
          matched.no_match += 1;
        }
        delPermitNums.push(p.permit_num);
        delRevisionNums.push(p.revision_num);
        // NULL "keep" means "delete every existing link for this permit" — the
        // zero-match cleanup half of LG-24's compound DELETE (see
        // `delete_by_key_sql`'s own comment in compute/link-parcels.js).
        delKeepParcelIds.push(m ? m.parcel_id : null);
      }
      await pipeline.withTransaction(pool, async (client) => {
        if (upsertRows.length > 0) {
          const result = await write.executeUpsertBatch(client, upsertPlan, upsertRows);
          written.e1.scanned += upsertRows.length;
          written.e1.inserted += result.inserted;
          written.e1.updated += result.updated;
          written.e1.rows_changed += result.inserted + result.updated;
        }
        // R-M / LG-17, extended to LG-24 (Fold A I-3) — before-image the rows THIS
        // batch's DELETE is about to touch, BEFORE the delete, appended into the SAME
        // per-run file every batch (Fold B item 5).
        const bi = await write.writeBeforeImage(client, deleteBeforeImagePlan,
          [delPermitNums, delRevisionNums], descriptor.identity.name, clockNow);
        if (bi.written) beforeImage.push({ ...bi, table: deletePlan.table });
        const deleted = await write.executeGuardedDeleteByKey(client, match.delete_by_key_sql,
          [delPermitNums, delRevisionNums, delKeepParcelIds]);
        written.e2.scanned += delPermitNums.length;
        written.e2.deleted += deleted;
        written.e2.rows_changed += deleted;
        // LP-D10 (WF6 output-panel finding, restored commit 10) — the "evaluated"
        // watermark, ORDERED LAST (after upsert + delete, same transaction): every
        // permit THIS BATCH processed, matched or not, gets parcel_linked_at
        // stamped to clockNow — fence a21b7b01's own reason to exist (the
        // incremental filter above can only ever EXCLUDE a no-match permit
        // because this statement ran). delPermitNums/delRevisionNums already
        // cover the WHOLE batch (built from permitKeys before any match
        // filtering), so no new key arrays are needed here.
        const watermarked = await write.executeGuardedUpdate(client, match.watermark_update_sql,
          [delPermitNums, delRevisionNums, clockNow]);
        written.e3.scanned += delPermitNums.length;
        written.e3.updated += watermarked.length;
        written.e3.rows_changed += watermarked.length;
      });
    } else {
      matched.no_match += permitKeys.filter((p) => !matchedByKey.has(`${p.permit_num}|${p.revision_num}`)).length;
    }

    matched.permits_processed += batch.rows.length;
  }

  const cumulative = await pool.query(match.cumulative_sql);
  const row = cumulative.rows[0];
  // LP-D9 (commit 8a) OBSERVABILITY — a standing whole-table audit, run every invocation
  // (not gated on mode), same posture as cumulative_sql above: "this class must never be
  // invisible again."
  if (match.street_type_mismatch_sql) {
    const mismatch = await pool.query(match.street_type_mismatch_sql);
    matched.street_type_mismatch = Number(mismatch.rows[0].n);
  }
  return {
    mode: gate.mode,
    gate,
    matched,
    cumulative: {
      linked_parcels: Number(row.linked),
      parcels_with_link_eligibility: Number(row.total),
    },
    written,
    prior,
    overrides,
    writeSkipped: false,
    beforeImage,
  };
}

/**
 * LW-D10 (commit 8b, 2026-08-28) — a cascade tier's ONE-PASS-vs-LOOP-TO-CONVERGENCE
 * mechanism, extracted to its own function so the LOOP LOGIC is independently
 * unit-testable without mocking `runCascadePhase`'s pool/transaction/staleness-gate
 * machinery. `runOnePass` performs ONE pass (whatever that means for the caller — a
 * cascade tier's wsib join-update + entities flag + entities contacts, in
 * `runCascadePhase`'s case) and resolves the counts it produced; `linked` is what the
 * loop condition watches.
 *
 * `loops === false` (a tier with no declared `max_iterations_from_config`, or any tier
 * outside mode "full") runs the pass EXACTLY ONCE, unconditionally — the pre-LW-D10
 * behaviour, byte-identical (S3's `LIMIT 1000` single-pass cap in incremental mode is
 * untouched). `loops === true` repeats while the LAST pass's `linked` count was > 0 AND
 * `iterations < maxIterations` — Fold B's ruling (`TIER3_SELECT`'s `LIMIT 1000` cap means
 * one pass cannot relink more than 1,000 rows per invocation, so a mode-"full" repair
 * must keep passing until nothing is left or the declared bound is hit).
 *
 * `exhausted` is true ONLY when the bound stopped the loop WHILE the final pass still
 * found matches (`iterations >= maxIterations && lastLinked > 0`) — reaching the bound on
 * a pass that itself matched 0 is a normal, converged stop, never exhaustion, and
 * `loops === false` can never report `exhausted: true` (there is no bound to exhaust).
 *
 * @param {() => Promise<{linked: number, flagged: number, contacts: number}>} runOnePass
 * @param {boolean} loops
 * @param {number} maxIterations
 * @returns {Promise<{iterations: number, linked_total: number, flagged_total: number, contacts_total: number, exhausted: boolean}>}
 */
async function runTierToConvergence(runOnePass, loops, maxIterations) {
  let iterations = 0;
  let linkedTotal = 0;
  let flaggedTotal = 0;
  let contactsTotal = 0;
  let lastLinked = 0;
  do {
    const pass = await runOnePass();
    iterations += 1;
    linkedTotal += pass.linked;
    flaggedTotal += pass.flagged;
    contactsTotal += pass.contacts;
    lastLinked = pass.linked;
  } while (loops && lastLinked > 0 && iterations < maxIterations);
  const exhausted = loops && iterations >= maxIterations && lastLinked > 0;
  return { iterations, linked_total: linkedTotal, flagged_total: flaggedTotal, contacts_total: contactsTotal, exhausted };
}

/**
 * THE BULK N-TIER CASCADE PHASE (ruling A-1, SHOULD-FIX d — MATCHER pilot 2026-08-28).
 *
 * Forked from `runLinkPhase` rather than folded into it (see `isCascadeStep`'s header):
 * `link_wsib` is a bulk cascade over a declared `execution.tiers[]` array, no
 * batching/pagination anywhere, THREE write statements per tier across TWO tables, all
 * inside ONE step-scoped transaction (G-11) — not `runLinkPhase`'s keyset-paginated
 * single-target-per-batch shape.
 *
 * PHASE ORDER, and the guarantee each step carries (the assessment's G-1..G-19 table):
 *   guards.requires         preconditions before the first read
 *   LEDGER GATED SKIP        LG-15 — generalizes this step's own pre-existing B3 SKIP
 *                            (staleness.ledgerGatedSkip), folding the config_version
 *                            signal (G-6/A-3) so an operator threshold edit is never
 *                            invisible behind a green SKIP forever
 *   tri-state mode            A-8 — mode "full" ONLY by the load_wsib corpus signal or
 *                            LINK_WSIB_FORCE_FULL, never by schedule
 *   RUN_AT                    the DB clock, captured once, before any write (G-7)
 *   RLS preflight              refuse a write that would affect 0 rows
 *   PRE_WRITE GATE             scored before writes[0] — before the mode-full-only LG-16
 *                            retraction, which is the destructive write in this step
 *   [mode full only] LG-16    the tier-3 UPDATE-to-NULL retraction + the
 *                            entities.is_wsib_registered cascade + the copyContacts
 *                            reverse pass (A-7) — declared and wired here, exercised only
 *                            when mode resolves full (A-8 keeps mode incremental absent a
 *                            genuine corpus/FORCE_FULL signal)
 *   tiers[], IN ORDER          for each tier: wsib_registry join-update (LG-11) → the
 *                            entities.is_wsib_registered flag → entities contacts,
 *                            EXACTLY the order G-9 names, each tier excluding rows a
 *                            higher tier already claimed (the tiers[] declaration order
 *                            IS the confidence hierarchy, G-8). A tier declaring
 *                            `max_iterations_from_config` LOOPS this sequence in mode full
 *                            (LW-D10, commit 8b) — while the pass's matched count > 0 and
 *                            iterations < the declared bound — instead of running once;
 *                            every other tier, and every tier in incremental mode, is
 *                            unchanged (a single pass)
 *   post checks                over the cumulative/invariant query, run once after the
 *                            transaction commits
 *
 * @returns {Promise<object>} `{mode, gate, matched, cumulative, written, prior, overrides, skipped, gatedSkip}`
 */
async function runCascadePhase({ descriptor, pool, compute, config, chainId, log, tag, clockNow, preWriteGate, ownRunId }) {
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  // LW-D15 — `overrides.dry_run` is now the single source (staleness.resolveOverrides
  // itself calls dryRunArgPresent internally); `dryRun` below is a local alias, not a
  // second read.
  const overrides = staleness.resolveOverrides(descriptor);
  const dryRun = overrides.dry_run;
  // R-B (LW-D20/LG-19) — MEASURED LIVE 2026-08-29: a live kill-and-rerun proof against
  // link_wsib found the interrupted-retraction check placed ONLY inside selectMode was
  // unreachable dead code, because ledgerGatedSkip's SKIP branch returns BEFORE
  // selectMode is ever called — "mode resolves FULL regardless of code/data signals"
  // (R-B's own text) cannot be true if the gate skips past the check entirely. Checked
  // HERE, before the gate, and folded into `bypassed` so an interrupted retraction
  // structurally cannot be skipped past — mirrors dry_run/force_full's own bypass shape,
  // never a second code path.
  const interruptedRetraction = await staleness.detectInterruptedRetraction(pool, descriptor, { ownRunId });
  const bypassed = dryRun || overrides.force_full === true || interruptedRetraction.interrupted;

  // ── LG-15 — THE LEDGER GATED SKIP, generalizing link_wsib's own pre-existing B3 gate ──
  const gatedSkip = await staleness.ledgerGatedSkip(pool, descriptor, { now: clockNow, bypassed });
  if (gatedSkip.skip) {
    log.info(tag, `cascade ledger gate: SKIP (${gatedSkip.reason})`);
    return {
      mode: null,
      gate: { mode: null, reason: gatedSkip.reason, skipped: true, configVersionUpdatedAt: null },
      matched: null,
      cumulative: null,
      written: null,
      prior: gatedSkip.gate ? gatedSkip.gate.ownLastRecordsMeta : null,
      overrides,
      skipped: true,
      gatedSkip,
    };
  }

  const prior = gatedSkip.gate
    ? gatedSkip.gate.ownLastRecordsMeta
    : await staleness.readPriorEmit(pool, ledgerPipelineName(descriptor, chainId), null);
  const gate = await staleness.selectMode({ descriptor, pool, prior, ownRunId });
  const configTrigger = staleness.triggersAt(descriptor, 'pre_compute').find((t) => t.signal === 'config_version');
  const configVersionUpdatedAt = configTrigger ? (await staleness.measureTrigger(pool, descriptor, configTrigger)).current : null;
  const privilege = await write.assertWritePrivileges(pool, descriptor, { log, tag });
  log.info(tag, `cascade mode gate: ${gate.mode.toUpperCase()} (${gate.reason})`);

  const specs = descriptor.outputs.writes;
  const wsibJoinPlan = specs.find((w) => w.write_discipline.class === 'set_based_join_update' && w.table === 'wsib_registry');
  // LW-D19 — TWO set_based_scoped targets now share this class (the fill-true target and
  // the new unconditional self-heal correction), distinguished the same structural way
  // every other spec in this file is found: a declared column property, never a string
  // match on "is_wsib_registered" or "link_wsib" (Gate 0, zero new bespoke runner paths).
  const entitiesFlagSpec = specs.find((w) => w.write_discipline.class === 'set_based_scoped' && w.columns.some((c) => c.set_value === true));
  const entitiesUnflagSpec = specs.find((w) => w.write_discipline.class === 'set_based_scoped' && w.columns.some((c) => c.set_value === false));
  const entitiesContactsSpec = specs.find((w) => w.write_discipline.class === 'set_based_join_update' && w.table !== 'wsib_registry');
  const nullRetractSpec = specs.find((w) => w.write_discipline.class === 'set_based_null_retract');
  const entitiesFlagPlan = entitiesFlagSpec ? write.buildWritePlan(entitiesFlagSpec, descriptor) : null;
  const entitiesUnflagPlan = entitiesUnflagSpec ? write.buildWritePlan(entitiesUnflagSpec, descriptor) : null;
  const nullRetractPlan = nullRetractSpec ? write.buildWritePlan(nullRetractSpec, descriptor) : null;

  const written = {};
  for (let i = 0; i < specs.length; i++) {
    written[write.targetKey(i)] = { scanned: 0, inserted: 0, updated: 0, deleted: 0, retracted: 0, rows_changed: 0 };
  }
  // LW-D19 — adding a 5th write target (the entities self-heal correction) broke the
  // previous "last spec's table" heuristic (it silently started reading entities'
  // RLS state instead of wsib_registry's). Anchored on nullRetractSpec.table instead —
  // stable regardless of how many more write targets this step ever declares, since
  // the null-retract target's table (wsib_registry) is what write_privilege's own
  // declared `why.liveness` names. Falls back to the old heuristic if a future cascade
  // step ever lacks a null-retract target (this function is not link_wsib-specific).
  written.privilege = privilege[(nullRetractSpec || specs[specs.length - 1]).table] || null;
  written.requirements = requirements;
  // R-M / LG-17 — one entry per destructive-retraction target this run actually wrote
  // a before-image for (the LG-16 mode="full" repair, below); surfaces as
  // `before_image_written` audit rows.
  const beforeImage = [];

  const tiers = descriptor.execution.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error(`${tag} execution.shape "cascade" requires a non-empty execution.tiers[] array`);
  }

  const beforeCounts = await pool.query('SELECT '
    + '(SELECT COUNT(*) FROM wsib_registry WHERE linked_entity_id IS NULL) AS unlinked_start, '
    + '(SELECT COUNT(*) FROM entities) AS entities_count');
  const matched = {
    unlinked_start: Number(beforeCounts.rows[0].unlinked_start),
    entities_count: Number(beforeCounts.rows[0].entities_count),
    tiers: {},
  };

  // ── THE PRE-WRITE GATE, before the (mode-full-only) LG-16 retraction ────────
  const decision = preWriteGate
    ? await preWriteGate({ matched, gate, prior, overrides, written: null })
    : { abort: false, failed: [] };
  if (decision.abort) {
    log.error(tag, `pre_write check(s) FAILED with no standing override — cascade write SKIPPED: ${decision.failed.join(', ')}`);
    return {
      mode: gate.mode,
      gate: { ...gate, configVersionUpdatedAt },
      matched,
      cumulative: null,
      written: { ...written, write_skipped_pre_write_fail: true },
      prior,
      overrides,
      writeSkipped: true,
      failedPreWrite: decision.failed,
      gatedSkip,
    };
  }

  const runAt = clockNow;
  await pipeline.withTransaction(pool, async (client) => {
    // ── LG-16 — A-7's tier-3 repair, mode "full" ONLY. The retracted rows' contact
    // values are read BEFORE the retraction (provenance-by-equality needs the values the
    // retraction is about to erase), then the retraction, then the entities cascade, then
    // the reverse clear. LW-D10 (commit 8b, 2026-08-28): `iterations`/`exhausted` below are
    // no longer hardcoded — the tier loop, further down, fills them in for real once the
    // (possibly looping) tier whose `max_iterations_from_config` is declared has run.
    const isFullRepair = gate.mode === 'full' && nullRetractPlan;
    let tier3Full = null;
    if (isFullRepair) {
      const scopeParams = compute.buildRetractionScopeParams(config, tiers);
      // The read stays live in dry-run — it is a SELECT, and its row count IS the
      // "would retract" count LW-D15 needs (the exact predicate the retraction targets).
      const priorContacts = await client.query(
        'SELECT linked_entity_id, primary_phone, primary_email, website FROM wsib_registry WHERE match_confidence = $1 AND linked_entity_id IS NOT NULL',
        scopeParams,
      );
      if (dryRun) {
        // LW-D15 — zero UPDATE/DELETE issued. `contacts_cleared` is a DECLARED
        // limitation in dry-run mode (limitations[], descriptor): the reverse-clear
        // count depends on each entity's CURRENT column values, which a read-only
        // simulation would need a second full mirror query to reproduce faithfully;
        // the primary retraction count (the one operators check before a live repair)
        // is exact.
        tier3Full = { retracted: priorContacts.rows.length, contacts_cleared: 0 };
      } else {
        // R-M / LG-17 — the before-image read+write happens on the SAME client, inside
        // the SAME transaction, strictly BEFORE the retraction call below: a throw here
        // aborts the transaction and the retraction never runs. Separate from
        // `priorContacts` above (that read serves copyContacts' reverse-clear; this one
        // is the declared key-columns + nulled-columns audit trail, LG-16's own scope).
        const bi = await write.writeBeforeImage(client, nullRetractPlan, scopeParams, descriptor.identity.name, runAt);
        if (bi.written) beforeImage.push({ ...bi, table: nullRetractPlan.table });
        const retracted = await write.executeSetBasedClear(client, nullRetractPlan, scopeParams);
        const nullRetractIdx = specs.indexOf(nullRetractSpec);
        written[write.targetKey(nullRetractIdx)].retracted = retracted;
        written[write.targetKey(nullRetractIdx)].deleted = 0;
        await client.query(compute.buildEntitiesUnflagSql());
        const affectedIds = [...new Set(priorContacts.rows.map((r) => r.linked_entity_id))];
        let contactsCleared = 0;
        if (affectedIds.length > 0) {
          const phones = [...new Set(priorContacts.rows.map((r) => r.primary_phone).filter(Boolean))];
          const emails = [...new Set(priorContacts.rows.map((r) => r.primary_email).filter(Boolean))];
          const sites = [...new Set(priorContacts.rows.map((r) => r.website).filter(Boolean))];
          const clearResult = await client.query(compute.buildContactsReverseClearSql(), [phones, emails, sites, affectedIds]);
          contactsCleared = clearResult.rowCount || 0;
        }
        tier3Full = { retracted, contacts_cleared: contactsCleared };
      }
    }
    matched.tier3_full = tier3Full;

    for (const tier of tiers) {
      // LW-D10 (commit 8b, 2026-08-28) — a tier LOOPS in mode "full" iff it declares
      // `max_iterations_from_config` (a generic, per-tier, DECLARED signal — no
      // "tier3_fuzzy" string anywhere in this library file, per Gate 0's "zero new
      // bespoke runner paths"). Every other tier, and every tier in incremental mode
      // (S3's LIMIT-1000 single pass is a deliberate incremental-mode property, unchanged),
      // runs the pass exactly once — the pre-LW-D10 behaviour, byte-identical.
      // LW-D15 — a dry-run NEVER loops: convergence depends on rows actually leaving
      // the `linked_entity_id IS NULL` scope between passes, which cannot happen when
      // nothing is written, so a simulated "pass 2" would just re-count pass 1's rows.
      // Declared limitation: a full-mode dry-run reports ONE simulated pass, never
      // `exhausted`/multi-iteration convergence.
      const loopsInFullMode = !dryRun && isFullRepair && typeof tier.max_iterations_from_config === 'string';
      const maxIterations = loopsInFullMode ? config[tier.max_iterations_from_config] : 1;

      const runOnePass = async () => {
        const sql = compute.buildTierSql(descriptor, config, tier, runAt);
        const wsibIdx = specs.indexOf(wsibJoinPlan);
        let linked;
        if (dryRun) {
          const r = await client.query(sql.wsib_count_sql, sql.wsib_count_params);
          linked = Number(r.rows[0].n);
        } else {
          linked = await write.executeSetBasedJoinUpdate(client, sql.wsib_update_sql, sql.wsib_update_params);
          written[write.targetKey(wsibIdx)].scanned += linked;
          written[write.targetKey(wsibIdx)].updated += linked;
          written[write.targetKey(wsibIdx)].rows_changed += linked;
        }

        let flagged = 0;
        if (entitiesFlagPlan) {
          if (dryRun) {
            const r = await client.query(sql.entities_flag_count_sql, sql.entities_flag_count_params);
            flagged = Number(r.rows[0].n);
          } else {
            flagged = await write.executeSetBasedClear(client, entitiesFlagPlan, sql.entities_flag_scope_params);
            const flagIdx = specs.indexOf(entitiesFlagSpec);
            written[write.targetKey(flagIdx)].updated += flagged;
            written[write.targetKey(flagIdx)].rows_changed += flagged;
          }
        }

        let contacts = 0;
        if (entitiesContactsSpec) {
          if (dryRun) {
            const r = await client.query(sql.entities_contacts_count_sql, sql.entities_contacts_count_params);
            contacts = Number(r.rows[0].n);
          } else {
            contacts = await write.executeSetBasedJoinUpdate(client, sql.entities_contacts_sql, sql.entities_contacts_params);
            const contactsIdx = specs.indexOf(entitiesContactsSpec);
            written[write.targetKey(contactsIdx)].updated += contacts;
            written[write.targetKey(contactsIdx)].rows_changed += contacts;
          }
        }
        return { linked, flagged, contacts };
      };

      const result = await runTierToConvergence(runOnePass, loopsInFullMode, maxIterations);
      matched.tiers[tier.id] = { linked: result.linked_total, flagged: result.flagged_total, contacts: result.contacts_total };
      if (loopsInFullMode) {
        tier3Full = { ...tier3Full, iterations: result.iterations, relinked_total: result.linked_total, exhausted: result.exhausted };
      }
    }
    matched.tier3_full = tier3Full;

    // ── LW-D19 (2026-08-29 operator ruling) — the is_wsib_registered self-heal
    // correction. Runs EXACTLY ONCE per invocation, UNCONDITIONAL of mode (unlike LG-16's
    // retraction above, never gated to mode "full"): an entity currently flagged
    // registered whose wsib_registry link(s) are all fuzzy (0.60) is corrected back to
    // false every run — the fill-true target only ever transitions false→true, so this is
    // the sole mechanism that closes the loop the other direction. Same declared
    // set_based_scoped / is_distinct_from shape as the fill-true target, just the opposite
    // constant, so a re-run over an already-corrected corpus changes 0 rows.
    if (entitiesUnflagPlan) {
      const correctionParams = compute.exactTierConfidences(descriptor, config);
      if (dryRun) {
        const r = await client.query(compute.buildEntitiesUnflagCorrectionCountSql(), correctionParams);
        matched.is_wsib_registered_corrected = Number(r.rows[0].n);
      } else {
        const corrected = await write.executeSetBasedClear(client, entitiesUnflagPlan, correctionParams);
        const unflagIdx = specs.indexOf(entitiesUnflagSpec);
        written[write.targetKey(unflagIdx)].updated += corrected;
        written[write.targetKey(unflagIdx)].rows_changed += corrected;
        matched.is_wsib_registered_corrected = corrected;
      }
    }
  });

  // LW-D14 — every cascade compute's CUMULATIVE_SQL is a function of `descriptor` (was
  // a bare string), so a step whose invariant needs declared descriptor data (e.g.
  // link_wsib's token-overlap stopword list) can read it the same way the write phase's
  // own SQL builders do — a generic widening of the cascade contract, not a per-step
  // branch here (Gate 0: link_wsib is still the only cascade compute this runs for).
  const cumulativeResult = await pool.query(compute.buildCumulativeSql(descriptor));
  const c = cumulativeResult.rows[0];
  for (const k of Object.keys(c)) {
    if (k === 'linked' || k === 'total') continue;
    const v = c[k];
    matched[k] = v !== null && typeof v === 'object' ? v : Number(v);
  }

  return {
    mode: gate.mode,
    gate: { ...gate, configVersionUpdatedAt },
    matched,
    cumulative: { linked: Number(c.linked), total: Number(c.total) },
    written,
    prior,
    overrides,
    writeSkipped: false,
    gatedSkip,
    beforeImage,
  };
}

/**
 * THE MATERIALIZE PHASE (ruling A-1, MATERIALIZER pilot 2026-08-29).
 *
 * Forked from `runCascadePhase`'s phase-order shape (see `isMaterializeStep`'s header)
 * rather than an extension of `runLinkPhase`: ONE write target, ONE server-side
 * `INSERT ... SELECT ... JOIN <spatial predicate> ... ON CONFLICT (...) DO NOTHING`
 * statement (LG-18's `executeInsertSelectNoRetract`), no retraction, no per-row
 * classification — the join and the ON CONFLICT short-circuit ARE the match/no-match
 * decision. The write is keyset-paginated over the target's own declared key column
 * (mirroring `link-parcel-addresses.js`'s pre-conversion `id > lastId` cursor,
 * §1.4-derivation `txn_scope: "batch"`: each batch commits independently) — the ONE
 * structural difference from `runCascadePhase`'s single unpaginated step-scoped
 * transaction.
 *
 * PHASE ORDER, mirroring `runCascadePhase`:
 *   guards.requires            preconditions before the first read
 *   LEDGER GATED SKIP           LG-15 — `staleness.ledgerGatedSkip`, reused, not
 *                              re-hand-rolled a third time (Fold A SHOULD-FIX 5)
 *   RUN_AT                      the DB clock, captured once, before any write
 *   RLS preflight                refuse a write that would affect 0 rows
 *   PRE_WRITE GATE               scored before the batch loop, same contract as the
 *                              other two phases (this step declares no `pre_write`
 *                              check today — `makePreWriteGate` returns null and this
 *                              is a no-op, kept for shape parity and future-proofing)
 *   the keyset-paginated batch loop  each batch is its OWN transaction
 *                              (LG-18's `executeInsertSelectNoRetract`, compute-
 *                              authored SQL, batch size from `ctx.config`)
 *   post checks                  over the post-run counts + invariants query, once
 *
 * @returns {Promise<object>} `{mode, gate, matched, written, prior, overrides, skipped, gatedSkip}`
 */
async function runMaterializePhase({ descriptor, pool, compute, config, chainId, log, tag, clockNow, preWriteGate, ownRunId }) {
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  const overrides = staleness.resolveOverrides(descriptor);
  // R-B (LW-D20/LG-19 recurrence) — MATERIALIZER shares CASCADE's exact `ledgerGatedSkip`
  // early-return shape (LG-15): checked HERE, before the gate, and folded into `bypassed`
  // so an interrupted retraction structurally cannot be skipped past — mirrors
  // runCascadePhase's own placement/comment verbatim (8adf5d19). `detectInterruptedRetraction`
  // is self-gating on `recovery.interrupted === "force_full_on_next_run"` (staleness.js),
  // so this is a no-op for every MATERIALIZER that, like link_parcel_addresses today
  // (LPA-D1, retract:"none"), declares no destructive retraction to recover.
  const interruptedRetraction = await staleness.detectInterruptedRetraction(pool, descriptor, { ownRunId });
  const bypassed = overrides.force_full === true || interruptedRetraction.interrupted;

  // ── LG-15 — THE LEDGER GATED SKIP, generalizing this step's own pre-existing B3 gate ──
  const gatedSkip = await staleness.ledgerGatedSkip(pool, descriptor, { now: clockNow, bypassed });
  if (gatedSkip.skip) {
    log.info(tag, `materialize ledger gate: SKIP (${gatedSkip.reason})`);
    return {
      mode: null,
      gate: { mode: null, reason: gatedSkip.reason, skipped: true },
      matched: null,
      written: null,
      prior: gatedSkip.gate ? gatedSkip.gate.ownLastRecordsMeta : null,
      overrides,
      skipped: true,
      gatedSkip,
    };
  }

  const prior = gatedSkip.gate
    ? gatedSkip.gate.ownLastRecordsMeta
    : await staleness.readPriorEmit(pool, ledgerPipelineName(descriptor, chainId), null);
  const privilege = await write.assertWritePrivileges(pool, descriptor, { log, tag });
  log.info(tag, `materialize gate: RUN (${gatedSkip.reason})`);

  const specs = descriptor.outputs.writes;
  const spec = specs[0];
  const plan = write.buildWritePlan(spec, descriptor);
  const written = {};
  written[write.targetKey(0)] = { scanned: 0, inserted: 0, updated: 0, deleted: 0, retracted: 0, rows_changed: 0 };
  written.privilege = privilege[plan.table] || null;
  written.requirements = requirements;

  const sql = compute.buildMaterializeSql(descriptor, config);

  // ── THE PRE-WRITE GATE, before the batch loop ────────────────────────────────
  const gateForPreWrite = { mode: 'incremental', reason: gatedSkip.reason, skipped: false };
  const decision = preWriteGate
    ? await preWriteGate({ matched: null, gate: gateForPreWrite, prior, overrides, written: null })
    : { abort: false, failed: [] };
  if (decision.abort) {
    log.error(tag, `pre_write check(s) FAILED with no standing override — no write was issued and `
      + `${plan.table} is untouched: ${decision.failed.join(', ')}`);
    return {
      mode: 'incremental',
      gate: gateForPreWrite,
      matched: null,
      written: { ...written, write_skipped_pre_write_fail: true },
      prior,
      overrides,
      writeSkipped: true,
      failedPreWrite: decision.failed,
      gatedSkip,
    };
  }

  const pre = await pool.query(sql.pre_sql);
  const preRow = pre.rows[0] || {};

  // ── THE KEYSET-PAGINATED BATCH LOOP — each batch its OWN transaction ─────────
  const batchSize = config[sql.batch_size_config_key] || 1000;
  let lastId = -1;
  let batchesProcessed = 0;
  let newLinksTotal = 0;
  let errors = 0;
  let completedNaturally = false;
  for (;;) {
    let row;
    try {
      row = await pipeline.withTransaction(pool, async (client) => {
        const result = await write.executeInsertSelectNoRetract(client, sql.batch_sql, [lastId, batchSize, clockNow]);
        return result;
      });
    } catch (err) {
      errors += 1;
      log.error(tag, err, { batch: batchesProcessed + 1, lastId });
      break;
    }
    const newLinks = Number(row.new_links) || 0;
    const maxId = row.max_id === null || row.max_id === undefined ? null : Number(row.max_id);
    const rowsInBatch = Number(row.rows_in_batch) || 0;
    if (rowsInBatch === 0) {
      completedNaturally = true;
      break;
    }
    batchesProcessed += 1;
    newLinksTotal += newLinks;
    written[write.targetKey(0)].scanned += rowsInBatch;
    written[write.targetKey(0)].inserted += newLinks;
    written[write.targetKey(0)].rows_changed += newLinks;
    lastId = maxId ?? lastId;
  }

  const post = await pool.query(sql.post_sql);
  const postRow = post.rows[0] || {};
  const invariantsResult = await pool.query(sql.invariants_sql, sql.invariants_params || []);
  const invariantsRow = invariantsResult.rows[0] || {};

  const matched = {};
  for (const row of [preRow, postRow, invariantsRow]) {
    for (const k of Object.keys(row)) {
      const v = row[k];
      matched[k] = v !== null && typeof v === 'object' ? v : Number(v);
    }
  }
  matched.new_links_written = newLinksTotal;
  matched.errors = errors;
  matched.batches_processed = batchesProcessed;
  matched.completed_naturally = completedNaturally;

  return {
    mode: 'incremental',
    gate: gateForPreWrite,
    matched,
    written,
    prior,
    overrides,
    writeSkipped: false,
    gatedSkip,
  };
}

/**
 * THE COLUMN-STAMPING LINK PHASE (I4, `link_neighbourhoods`, 2026-09-16 — Ask 1 ruling (B),
 * re-ruled after the plan panel established the single-statement shape).
 *
 * See `isLinkColumnStep` for why all three candidate runners are refuted structurally.
 * This one is a fork of `runBackfillPhase`'s PHASE ORDER with a class-N executor and this
 * step's own counter vocabulary.
 *
 * PHASE ORDER: `guards.requires` → overrides → RLS preflight → prior read (under its
 * DECLARED posture) → the corpus count and the eligible count → the pre_write gate → ONE
 * `set_based_join_update` statement → the post-write round trip → return.
 *
 * ⚠️ NO TRANSACTION WRAPPER, and that is the declaration, not an omission.
 * `execution.txn_scope` and the target's own `write_discipline.txn_scope` are both
 * `"statement"`: a single server-side statement IS its own transaction, so it either commits
 * whole or rolls back whole — there is no partial state for a recovery posture to describe,
 * which is what makes `recovery.interrupted: "none"` truthful here rather than merely
 * convenient. NOT, however, "a kill leaves `permits` untouched": killing the NODE CLIENT does
 * not cancel the server-side statement (tasks/lessons.md, 2026-05-31 — Postgres only notices
 * a dead client when it next tries to send results), so a SIGKILL mid-UPDATE can still COMMIT.
 * That is still not PARTIAL — the estate ends up either fully stamped or untouched and the next
 * run's `IS NULL` predicate is correct either way — but only `pg_terminate_backend` actually
 * rolls it back. The executor
 * is handed the POOL, exactly as `runBackfillPhase` hands `executeBackfillUpdate` the pool,
 * and exactly as the pre-conversion script's own bare `pool.query` did.
 *
 * ⚠️ NO ZERO-WORK EARLY RETURN, and that is load-bearing. `runBackfillPhase` returns early
 * on a zero backlog; this step must NOT, because its eligible set is 0 in the measured
 * steady state (every coordinate-bearing permit is already linked). An early return would
 * suppress every `when: "post"` check on every ordinary run — including the standing
 * `link_rate` WARN and the entire `failed_link_rate` arm — exactly while the estate sits
 * 0.17 points under its own warn bound. The statement is issued regardless (it matches 0
 * rows, which is the honest answer), the post round trip always runs, and `zeroWork` is
 * returned as a TERMINAL DISCRIMINATOR only, never as a narrowing signal.
 *
 * @returns {Promise<object>} `{mode, gate, matched, cumulative, written, prior, priorError, overrides, writeSkipped, zeroWork}`
 */
async function runLinkColumnPhase({ descriptor, pool, compute, config, chainId, log, tag, preWriteGate }) {
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  const overrides = staleness.resolveOverrides(descriptor);
  const privilege = await write.assertWritePrivileges(pool, descriptor, { log, tag });
  // LR-D2's posture, honoured rather than merely declared: the raw `readPriorEmit` every
  // LINK runner calls would make `staleness.on_prior_run_error` a declaration with no
  // consumer (a descriptor asking for `warn_row` would be silently ignored).
  const posture = staleness.priorRunErrorPosture(descriptor);
  const { prior, error: priorError } = await staleness.readPriorEmitWithPosture(
    pool, ledgerPipelineName(descriptor, chainId), null, posture,
  );
  if (priorError) {
    log.warn(tag, `prior-run read failed under posture "${posture}" — continuing with NO baseline: ${priorError.message}`);
  }

  const specs = descriptor.outputs.writes;
  const plan = write.buildWritePlan(specs[0], descriptor);
  const written = {};
  written[write.targetKey(0)] = { scanned: 0, inserted: 0, updated: 0, deleted: 0, retracted: 0, rows_changed: 0 };
  written.privilege = privilege[plan.table] || null;
  written.requirements = requirements;

  const sql = compute.buildMatchSql(descriptor, config, 'incremental');

  // The corpus count comes FIRST because the pre_write gate's whole job is to refuse an
  // empty one before the UPDATE is issued (G-1). Pre-conversion this number was taken at
  // the top of the run and only REPORTED after every write.
  const corpus = await pool.query(sql.corpus_sql);
  const neighbourhoodsLoaded = compute.scalar(corpus.rows[0], 'n');
  const eligible = await pool.query(sql.eligible_count_sql);
  const eligibleCount = compute.scalar(eligible.rows[0], 'total');

  // ⚠️ THE RUNNER NAMES NOTHING THE STEP DID NOT DECLARE. These five are this step's own
  // vocabulary, taken from its descriptor's `emits[]` and `checks[]` — no `parcels_*`, no
  // match-strategy names, nothing a different step would have to inherit.
  const matched = {
    // TWO fields, not one, and the duplication is load-bearing. `neighbourhoods_loaded` is
    // re-read AFTER the write (the post row's subject); `neighbourhoods_loaded_before_write`
    // is frozen here and never touched again. The `neighbourhoods_loaded_before_write` CHECK
    // is scored TWICE on a writing run — once by the pre_write gate and once in the final
    // pass — so a single shared field made the second scoring publish the AFTER-write count
    // under a row id that asserts the opposite. Found by the output panel; invisible on the
    // measured estate (the corpus reads 158 on both sides) and a lie the moment it moves.
    neighbourhoods_loaded_before_write: neighbourhoodsLoaded,
    neighbourhoods_loaded: neighbourhoodsLoaded,
    permits_eligible: eligibleCount,
    permits_processed: 0,
    permits_linked: 0,
    no_match: 0,
    negative_ids: 0,
  };
  const gate = { mode: 'incremental', reason: 'link_column', skipped: false };

  // ── THE PRE-WRITE GATE, BEFORE the one statement ──────────────────────────
  const decision = preWriteGate
    ? await preWriteGate({ matched, gate, prior, overrides, written: null })
    : { abort: false, failed: [] };
  if (decision.abort) {
    log.error(tag, 'pre_write check(s) FAILED with no standing override — no write was issued and '
      + `${plan.table} is untouched: ${decision.failed.join(', ')}`);
    return {
      mode: gate.mode,
      gate,
      matched,
      cumulative: null,
      written: { ...written, write_skipped_pre_write_fail: true },
      prior,
      priorError,
      overrides,
      writeSkipped: true,
      failedPreWrite: decision.failed,
      zeroWork: false,
    };
  }

  // ── THE ONE STATEMENT — no transaction wrapper, no batch loop, no retraction ─────
  // `executeSetBasedJoinUpdate` (LG-11) refuses at execution time any statement text
  // containing INSERT INTO or ON CONFLICT, checked on the ACTUAL text about to run:
  // `permits` rows may only ever be CREATED by load_permits, and an accidental INSERT here
  // would violate that ownership boundary far worse than a missed match.
  const changed = await write.executeSetBasedJoinUpdate(pool, sql.update_sql, []);

  written[write.targetKey(0)].updated = changed;
  written[write.targetKey(0)].rows_changed = changed;
  matched.permits_linked = changed;

  // ── ONE post-write round trip for the cumulative rate AND every table-wide count ──
  // `compute.scalar` refuses a missing/NaN column rather than coercing it to a plausible 0
  // (a renamed alias would otherwise read as a healthy zero on every gate).
  const cumulative = await pool.query(sql.cumulative_sql);
  const row = cumulative.rows[0];
  matched.no_match = compute.scalar(row, 'no_match_remaining');
  matched.negative_ids = compute.scalar(row, 'negative_ids');
  matched.neighbourhoods_loaded = compute.scalar(row, 'neighbourhoods_loaded');

  // `scanned` is derived from the POST-WRITE snapshot, NOT from the pre-write eligible
  // count. The count, the gate, the UPDATE and the post read are four separate snapshots, so
  // a permit geocoded by another chain between the count and the statement would make a
  // pre-write `scanned` DISAGREE with `updated` — and `scanned < updated` is nonsense on its
  // face. Everything eligible at write time is now either stamped (`changed`) or still NULL
  // and unmatchable (`no_match_remaining`), both read from the SAME post-write snapshot, so
  // this sum is internally consistent by construction and can never read below `updated`.
  // The pre-write eligible count survives as its own observation (`permits_eligible`).
  const processed = changed + matched.no_match;
  written[write.targetKey(0)].scanned = processed;
  matched.permits_processed = processed;
  log.info(tag, `${plan.table}: ${processed.toLocaleString()} permit(s) in scope at write time, `
    + `${changed.toLocaleString()} stamped, ${matched.no_match.toLocaleString()} matched no polygon `
    + `(pre-write eligible count was ${eligibleCount.toLocaleString()})`);

  return {
    mode: gate.mode,
    gate,
    matched,
    cumulative: { linked: Number(row.linked) || 0, total: Number(row.total) || 0 },
    written,
    prior,
    priorError,
    overrides,
    writeSkipped: false,
    // TERMINAL DISCRIMINATOR ONLY — never a check-narrowing signal (see the header).
    zeroWork: eligibleCount === 0,
  };
}

/**
 * THE BACKFILL PHASE (ruling A-4, ACCEPT at Fold D — BACKFILL pilot 6, 2026-08-29).
 *
 * Forked from `runMaterializePhase`'s phase-order shape, not an extension of it —
 * see `isBackfillStep`'s header for why the keyset batch loop does not fit a
 * single-statement write. `compute_centroids` is the first and, as of this pilot,
 * only backfill-shaped step.
 *
 * PHASE ORDER:
 *   guards.requires        preconditions before the first read (this step's own
 *                          `guards.requires: postgis`/`on_missing: "fail"`,
 *                          A-1(a) — a no-PostGIS DB now HALTS rather than
 *                          silently falling back to the retired JS algorithm)
 *   PRE COUNT               the pre-run backlog count (`backlog_count`, a
 *                          `when: "pre"` INFO check so a zero-work run persists
 *                          WHY, R-P's spirit — this step declares no ledger gate)
 *   ZERO-WORK COMPLETION    mirrors the pre-conversion script's own early return
 *                          (`totalParcels === 0`): when the backlog is empty, the
 *                          UPDATE statement is never issued at all (matching the
 *                          OLD code's own shape exactly, not merely its outcome)
 *                          and only `when: "pre"` checks are scored, same
 *                          narrowing every other archetype's gated-skip uses —
 *                          this is a normal `completed` success terminal, never
 *                          a `skip_gated` one (R-P N/A: no ledger gate exists to
 *                          skip past)
 *   RLS preflight            no `rls_bypass_or_policy` requirement is declared
 *                          for this step (no RLS on `parcels`); measures nothing
 *                          and returns `{}` — kept for shape parity with the
 *                          other three phase runners
 *   PRE_WRITE GATE           this step declares no `pre_write` check today —
 *                          `makePreWriteGate` returns null and this is a no-op,
 *                          the same shape-parity note `runMaterializePhase`
 *                          carries for its own no-`pre_write`-check case
 *   THE ONE STATEMENT        `write.executeBackfillUpdate`, compute-authored SQL
 *                          text (`buildBackfillSql`) — VERBATIM the pre-conversion
 *                          script's own PostGIS `UPDATE ... RETURNING id`
 *                          (finding 1 / Fold D bucket (1)) — UPDATE-only
 *                          structurally enforced, no transaction wrapper (a
 *                          single server-side statement IS the transaction,
 *                          `txn_scope: "statement"`)
 *   post checks              the post-run failed-geometry count, over the
 *                          statement's own scope
 *
 * @returns {Promise<object>} `{matched, written, prior, overrides, writeSkipped, zeroWork}`
 */
async function runBackfillPhase({ descriptor, pool, compute, config, chainId, log, tag, preWriteGate, clockNow }) {
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  const overrides = staleness.resolveOverrides(descriptor);
  const privilege = await write.assertWritePrivileges(pool, descriptor, { log, tag });
  const prior = await staleness.readPriorEmit(pool, ledgerPipelineName(descriptor, chainId), null);

  const specs = descriptor.outputs.writes;
  const spec = specs[0];
  const plan = write.buildWritePlan(spec, descriptor);
  const written = {};
  written[write.targetKey(0)] = { scanned: 0, updated: 0, rows_changed: 0 };
  written.privilege = privilege[plan.table] || null;
  written.requirements = requirements;

  // ── CC-D3 (2026-08-30) — FULL mode, declared via `override.force_full` ───────
  // Selected INSTEAD OF the incremental one-statement path below. Only reachable
  // when the descriptor declares a SECOND write target (`set_based_scoped` /
  // `set_source: "compute"`, LG-22) — a step that has not declared one cannot
  // reach this branch even with the env var standing, so a misconfigured
  // descriptor fails loud instead of silently no-op'ing a forced run.
  if (overrides.force_full) {
    if (specs.length < 2 || typeof compute.buildFullRecomputeSql !== 'function') {
      throw new Error(`[${tag}] override.force_full is standing but this step declares no second write target `
        + '(write_discipline.set_source:"compute") or compute has no buildFullRecomputeSql — refusing to run a '
        + 'forced FULL with no declared repair target rather than silently falling back to the incremental path.');
    }
    const repairPlan = write.buildWritePlan(specs[1], descriptor);
    return runBackfillFullRecompute({
      descriptor, pool, compute, config, log, tag, written, prior, overrides, plan: repairPlan, clockNow,
    });
  }

  const sql = compute.buildBackfillSql(descriptor, config);
  const pre = await pool.query(sql.pre_sql);
  const preRow = pre.rows[0] || {};
  const backlogCount = Number(preRow.backlog_count) || 0;

  // ── ZERO-WORK COMPLETION — mirrors the pre-conversion script's own early
  // return (`totalParcels === 0`) VERBATIM: the UPDATE is never issued. ──────
  if (backlogCount === 0) {
    log.info(tag, 'backfill: 0 eligible rows — nothing to compute');
    return {
      matched: {
        backlog_count: 0, parcels_processed: 0, centroids_computed: 0, failed_geometries: 0, new_rows: 0,
      },
      written,
      prior,
      overrides,
      writeSkipped: false,
      zeroWork: true,
    };
  }

  // ── THE PRE-WRITE GATE, before the one statement ─────────────────────────
  const gateForPreWrite = { mode: 'incremental', reason: 'backfill', skipped: false };
  const decision = preWriteGate
    ? await preWriteGate({
      matched: { backlog_count: backlogCount }, gate: gateForPreWrite, prior, overrides, written: null,
    })
    : { abort: false, failed: [] };
  if (decision.abort) {
    log.error(tag, `pre_write check(s) FAILED with no standing override — no write was issued and `
      + `${plan.table} is untouched: ${decision.failed.join(', ')}`);
    return {
      matched: { backlog_count: backlogCount },
      written: { ...written, write_skipped_pre_write_fail: true },
      prior,
      overrides,
      writeSkipped: true,
      failedPreWrite: decision.failed,
      zeroWork: false,
    };
  }

  // ── THE ONE STATEMENT — no transaction wrapper, no batch loop ────────────
  const result = await write.executeBackfillUpdate(pool, sql.update_sql, []);
  const computed = result.length;
  written[write.targetKey(0)].scanned = computed;
  written[write.targetKey(0)].updated = computed;
  written[write.targetKey(0)].rows_changed = computed;

  const post = await pool.query(sql.post_sql);
  const postRow = post.rows[0] || {};
  const failed = Number(postRow.failed_geometries) || 0;
  const processed = computed + failed;

  return {
    matched: {
      backlog_count: backlogCount,
      parcels_processed: processed,
      centroids_computed: computed,
      failed_geometries: failed,
      new_rows: 0,
    },
    written,
    prior,
    overrides,
    writeSkipped: false,
    zeroWork: false,
  };
}

/**
 * CC-D3 (2026-08-30) — the FULL-mode branch `runBackfillPhase` forks into when
 * `override.force_full` is standing. Never scheduled (Spec 124 §7 rung (a): the
 * descriptor's `staleness.mode_select` stays `"none"` — this mode exists ONLY
 * through the operator's own env-var override, never a corpus-signal trigger, per
 * R-L's precedent for a destructive-repair step's autonomous-mode gate).
 *
 * Shape, per Spec 124 §7 rung (a)+(d):
 *   1. `drift_select_sql` — ONE unbatched read. It IS the guard predicate
 *      (`centroid_lat IS DISTINCT FROM ST_Y(ST_Centroid(geom)) OR ...`) — every row
 *      this run WILL touch, read exactly once, so the before-image and the update
 *      can never disagree about which rows are in scope.
 *   2. R-M, GENERALIZED (this ruling): before-image persisted from those SAME rows,
 *      FAIL LOUD (no try/catch — `persistBeforeImageRows` throws synchronously on a
 *      write failure, well before the loop below issues its first UPDATE).
 *   3. A keyset batch loop over the ALREADY-FETCHED id list (not a re-derived
 *      DB-side cursor over the guard predicate — chunking the ids the before-image
 *      already covers is what guarantees a batch can never touch an un-imaged row).
 *      `execution.batch_size_from_config` (T3) sizes each chunk; `executeGuardedUpdate`
 *      (LG-22) enforces the UPDATE-only token boundary per batch, matching LG-20's
 *      structural guarantee for the incremental path.
 */
async function runBackfillFullRecompute({ descriptor, pool, compute, config, log, tag, written, prior, overrides, plan, clockNow }) {
  const sql = compute.buildFullRecomputeSql(descriptor, config);
  // Spec 47 §R3.5 / B-11 — REUSE the caller's own single DB-clock capture
  // (`clockNow`, taken once for whichever phase drives the write) rather than
  // reading the clock a second time. `isBackfillStep` is already a `drivesWrites`
  // member (scripts/lib/step/index.js), so `clockNow` is always non-null here.
  const runAt = clockNow;

  const pre = await pool.query(compute.buildPreSql());
  const backlogCount = Number((pre.rows[0] || {}).backlog_count) || 0;

  const { rows: drift } = await pool.query(sql.drift_select_sql);

  // ── R-M, generalized to a value-overwriting guarded write (2026-08-30) ────────
  // Unwrapped by any try/catch, BEFORE any UPDATE below — a write failure aborts
  // the run before a single row is touched.
  const beforeImageRows = drift.map((r) => ({ id: r.id, centroid_lat: r.centroid_lat, centroid_lng: r.centroid_lng }));
  const bi = write.persistBeforeImageRows(beforeImageRows, plan.table, descriptor.identity.name, runAt);
  log.info(tag, `full recompute: before-image written (${bi.rows.toLocaleString()} row(s)) -> ${bi.path}`);

  let maxShift = null;
  for (const r of drift) {
    const s = r.shift_m === null || r.shift_m === undefined ? null : Number(r.shift_m);
    if (s !== null && (maxShift === null || s > maxShift)) maxShift = s;
  }

  const ids = drift.map((r) => r.id);
  const batchSize = Math.max(1, Number(sql.batch_size) || 10000);
  let touched = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const result = await write.executeGuardedUpdate(pool, sql.update_sql, [chunk]);
    touched += result.length;
  }

  written[write.targetKey(1)] = {
    scanned: drift.length, updated: touched, rows_changed: touched, before_image: bi,
  };

  const post = await pool.query(compute.buildPostSql());
  const failed = Number((post.rows[0] || {}).failed_geometries) || 0;

  return {
    matched: {
      backlog_count: backlogCount,
      parcels_processed: drift.length,
      centroids_computed: touched,
      failed_geometries: failed,
      new_rows: 0,
      recompute_rows_changed: touched,
      recompute_max_shift_m: maxShift,
    },
    written,
    prior,
    overrides,
    writeSkipped: false,
    zeroWork: false,
  };
}

/**
 * THE RECORDER PHASE (Fold B RULING, RECORDER pilot 8, `refresh_snapshot`,
 * 2026-08-31 — zero-growth hypothesis REFUTED by direct trace, `.cursor/active_task.md`).
 *
 * The simplest runner in the library — no batching, no carried-rows loop, no
 * ledger gate, no zero-work path (a RECORDER's whole job is to record current
 * state every run — verdict is always PASS, Spec 122 `:1112`). Mode/staleness
 * derivation, `chain_run_id`, `records_meta`, the verdict cascade, and synthetic
 * invariant/plausibility execution all reuse the SAME generic paths every other
 * archetype uses, unchanged — this phase adds no new mechanism beyond driving
 * compute's own declared read plan and the one write statement.
 *
 * Forked from `runBackfillPhase`'s phase-order shape (guards -> pre-write gate ->
 * the one statement -> post checks), NOT an extension of it: `executeBackfillUpdate`
 * structurally refuses any INSERT token (UPDATE-only, LG-20); a RECORDER's write
 * IS an `INSERT ... ON CONFLICT ... DO UPDATE`, a different mechanic (LG-27).
 *
 * PHASE ORDER:
 *   guards.requires          preconditions before the first read (this step
 *                          declares none — R-W is not engaged, no PostGIS)
 *   RLS preflight             assertWritePrivileges
 *   compute.buildReads()      compute AUTHORS the read plan (SQL text + an
 *                          optional session-GUC bracket per "main" step) —
 *                          Rule 2: compute never touches the pool itself, it
 *                          only returns `{main: [{key, sql, params, guc}],
 *                          optional: [{key, sql, params}]}`
 *   the MAIN reads            executed by THIS runner, sequentially, on one
 *                          pinned REPEATABLE READ READ ONLY client — mirrors
 *                          the pre-conversion WF3-F1 shape verbatim (Spec 118
 *                          §1/§7.1), including the `enable_indexscan` bracket
 *   the OPTIONAL reads         executed by THIS runner via plain `pool.query`,
 *                          each independently caught; a failure never aborts
 *                          the run — the generic carry-forward fallback is the
 *                          write target's own PRIOR row (fetched once,
 *                          unconditionally, ordered by the declared key DESC),
 *                          not a per-step-hardcoded implementation
 *   THE PRE-WRITE GATE         before the one statement
 *   compute.buildRow()        pure JS — assembles the write's column values
 *                          from the collected read results + the prior row
 *   compute.buildWriteSql()   pure JS — authors the whole `INSERT ... ON
 *                          CONFLICT ... DO UPDATE` statement + bind params
 *                          (`guarded_upsert`/`set_source:"compute"`, LG-27) —
 *                          a server-side literal key (e.g. `CURRENT_DATE`) and
 *                          a `guard:"none"` target don't fit the DEFAULT
 *                          (unnamed) `guarded_upsert` codegen in `write.js`,
 *                          which always binds the key and always guards
 *   THE ONE STATEMENT          `write.executeRecorderUpsert`, inside ONE
 *                          transaction (`pipeline.withTransaction`)
 *   post checks                 scored by the generic `compute(ctx)` dispatch
 *                          against `ctx.matched`, same as every other shape
 *
 * @returns {Promise<object>} `{matched, written, prior, overrides, writeSkipped}`
 */
/**
 * WF3 2026-09-18 (Peel 2, deep_scrapes cause B, Spec 118 §1/§7.1/§7.2) — finite-or-throw
 * resolution for `runRecorderPhase`'s two new read-phase bounds (statement timeout, phase
 * deadline). Deliberately a THIRD, LOCAL, unexported copy of the same pattern
 * `resolveInterval` and the `phaseTimeouts` for-loop already carry for the ENRICHER shape
 * (`b69541b3`) — those two are ENRICHER-only and untouched by this WF3; extracting a shared
 * resolver was weighed and rejected here because it would touch goldens for steps outside
 * this WF3's scope for zero behavioural gain (Peel plan's own "prefer the simplest close").
 * Dedupe filed: docs/reports/review_followups.md.
 *
 * `Number.isFinite`, never `!x` — an explicitly declared 0 is a deliberate disable, distinct
 * from a typo/unset name that would otherwise silently resolve to an unbounded NaN (ER-D1,
 * Spec 48 §3.6).
 *
 * @param {object} descriptor
 * @param {Record<string, unknown>} config
 * @param {string} field - the `execution.<field>` name (a `*_from_config` field)
 * @param {string} tag
 * @returns {{ms: number, minutes: number|null}}
 */
function resolveRecorderBoundMinutes(descriptor, config, field, tag) {
  const varName = descriptor.execution && descriptor.execution[field];
  if (varName === 'none' || varName === undefined || varName === null) return { ms: 0, minutes: null };
  const raw = config[varName];
  const minutes = Number(raw);
  const ms = Math.round(minutes * 60000);
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error(
      `${tag} execution.${field} names "${varName}", which resolved to ${JSON.stringify(raw)}. A declared `
      + 'recorder read-phase bound must resolve to a finite, non-negative number of minutes; a non-finite '
      + 'value would silently leave the read phase unbounded (ER-D1, Spec 48 §3.6). Declare the literal '
      + '"none" to disable it deliberately.',
    );
  }
  return { ms, minutes };
}

/**
 * WF3 2026-09-18 (fold-validation V1) — pure arithmetic for the ONE shared wall-clock
 * phase-deadline budget across `runRecorderPhase`'s main AND optional read blocks: how
 * much of `phaseDeadlineMs` remains after `elapsedMs` has already passed. Exported and
 * pure so the "budget already exhausted before the optional block starts" branch is
 * unit-testable directly, without racing real wall-clock sleeps to land on a precise
 * near-zero remainder (inherently flaky — sleeping 2500ms against a 3000ms deadline
 * lands on a real remainder that varies with host scheduling jitter every run).
 *
 * A disabled deadline (`phaseDeadlineMs <= 0`, the declared-"none"/explicit-0 case)
 * always returns 0 — "stays disabled for both blocks" falls out of this same
 * arithmetic rather than needing a second disabled-check at the call site.
 * `Math.max(0, …)` — never negative; an elapsed time past the deadline reads as
 * "nothing remains", not as a negative budget `startPhaseDeadline` would have to
 * special-case.
 *
 * @param {number} phaseDeadlineMs
 * @param {number} elapsedMs
 * @returns {number}
 */
function remainingBudgetMs(phaseDeadlineMs, elapsedMs) {
  if (!(phaseDeadlineMs > 0)) return 0;
  return Math.max(0, phaseDeadlineMs - elapsedMs);
}

/**
 * WF3 2026-09-18 (output-panel fold-validation V2) — `runRecorderPhase` needs TWO
 * connections per phase (the phase's own client + a dedicated cancel client, since a
 * cancel sent down the very session that is blocked could never be delivered). Two bare
 * `await pool.connect()` calls with no try between them leak the FIRST client if the
 * SECOND connect throws (pool exhaustion, a network blip) — nothing ever calls
 * `.release()` on it. This wraps the pair so the first is always released on that path.
 * @param {import('pg').Pool} pool
 * @returns {Promise<[import('pg').PoolClient, import('pg').PoolClient]>}
 */
async function connectPair(pool) {
  const a = await pool.connect();
  try {
    const b = await pool.connect();
    return [a, b];
  } catch (err) {
    a.release();
    throw err;
  }
}

async function runRecorderPhase({ descriptor, pool, compute, config, chainId, log, tag, preWriteGate, clockNow }) {
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  const overrides = staleness.resolveOverrides(descriptor);
  const privilege = await write.assertWritePrivileges(pool, descriptor, { log, tag });
  const prior = await staleness.readPriorEmit(pool, ledgerPipelineName(descriptor, chainId), null);

  const specs = descriptor.outputs.writes;
  const spec = specs[0];
  const plan = write.buildWritePlan(spec, descriptor);
  const written = {};
  written[write.targetKey(0)] = { scanned: 0, inserted: 0, updated: 0, rows_changed: 0 };
  written.privilege = privilege[plan.table] || null;
  written.requirements = requirements;

  // WF3 2026-09-18 — resolved ABOVE the connections, same reasoning as ENRICHER's
  // phaseTimeouts: a throw after `pool.connect()` would leak the held client.
  const { ms: statementTimeoutMs } = resolveRecorderBoundMinutes(descriptor, config, 'statement_timeout_minutes_from_config', tag);
  const { ms: phaseDeadlineMs, minutes: phaseDeadlineMinutes } = resolveRecorderBoundMinutes(descriptor, config, 'phase_deadline_minutes_from_config', tag);

  // ── THE READS — compute authors the SQL text, THIS RUNNER executes it ────
  const reads = compute.buildReads(config);
  const results = {};
  const readTimings = [];

  // The main reads: one pinned REPEATABLE READ READ ONLY client, sequential,
  // an optional session-GUC bracket per step (mirrors the pre-conversion
  // WF3-F1 shape verbatim — Spec 118 §1/§7.1, point-in-time consistency).
  //
  // WF3 2026-09-18 (Peel 2) — TWO new bounds, closing review_followups.md:20 for this
  // runner: (1) a per-statement `SET LOCAL statement_timeout`, re-armed by Postgres on
  // EVERY statement issued on this session; (2) a WALL-CLOCK phase deadline over the
  // WHOLE loop, armed on a SEPARATE `cancelClient` via `startPhaseDeadline` (the same
  // pg_cancel_backend mechanism EP-PHASE-DEADLINE established for the enrich shape,
  // generalized here to the recorder shape's single implicit phase). A per-statement
  // bound alone cannot catch 8 reads that are each individually fast but sum past the
  // budget (Spec 118 §3's own documented layer-3 gap) — hence both.
  const [snapClient, cancelClient] = await connectPair(pool);
  let currentReadKey = null;
  const phaseStartMs = Date.now();
  let deadline = { stop: () => {}, fired: () => false };
  try {
    const pidRow = await snapClient.query('SELECT pg_backend_pid() AS pid');
    const pid = pidRow.rows[0] ? Number(pidRow.rows[0].pid) : null;
    deadline = startPhaseDeadline(cancelClient, pid, phaseDeadlineMs, { phase: 'reads', tag, log });
    try {
      await snapClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      if (statementTimeoutMs > 0) await snapClient.query(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
      try {
        for (const step of (reads.main || [])) {
          currentReadKey = step.key;
          if (step.guc) await snapClient.query(step.guc.set);
          const readStartMs = Date.now();
          try {
            const r = await snapClient.query(step.sql, step.params || []);
            results[step.key] = r.rows;
            // WF3 2026-09-18 — the trace review_followups.md:20 named absent: one line
            // per read, surviving the process via records_meta.read_timings[] (Peel 2.1).
            readTimings.push({ key: step.key, elapsed_ms: Date.now() - readStartMs, row_count: r.rows.length, phase: 'main' });
          } catch (err) {
            // Same SQLSTATE-disambiguation shape EP-PHASE-DEADLINE established: a cancel
            // and a genuine per-statement timeout both arrive as 57014, and `deadline.fired()`
            // is what tells them apart. The read's own error is NEVER swallowed — it is
            // named and rethrown, never caught-and-continued.
            if (err && (err.code === '57014' || err.code === '55P03')) {
              const kind = err.code === '55P03' ? 'lock_timeout' : (deadline.fired() ? 'phase_deadline' : 'statement_timeout');
              const elapsedMs = Date.now() - phaseStartMs;
              const wrapped = new Error(
                `${tag} recorder reads aborted by ${kind} while reading "${currentReadKey}" after ${elapsedMs}ms `
                + `(declared phase bound ${phaseDeadlineMinutes == null ? 'none' : `${phaseDeadlineMinutes}min`}): ${err.message}`,
              );
              wrapped.code = err.code;
              wrapped.cause = err;
              throw wrapped;
            }
            throw err;
          } finally {
            // A RESET issued after a cancel/timeout aborted this session's transaction
            // would itself throw ("current transaction is aborted") and, from inside a
            // `finally`, REPLACE the meaningful error above — swallowed the same way the
            // ROLLBACK below already is, so housekeeping failure never masks the real cause.
            if (step.guc) await snapClient.query(step.guc.reset).catch(() => {});
          }
        }
        await snapClient.query('COMMIT');
      } catch (err) {
        await snapClient.query('ROLLBACK').catch(() => {});
        throw err;
      }
    } finally {
      deadline.stop();
    }
  } finally {
    snapClient.release();
    cancelClient.release();
  }

  // The optional reads: independently caught, each on its own AUTOCOMMIT
  // statement — a failure (query error OR a new bound below) never aborts the
  // run and never touches any sibling read, it carries forward the WRITE
  // TARGET's own PRIOR row instead (declared generic, not a step-specific
  // implementation; Finding 5/RS-D2's own policy, now a library mechanism
  // every future RECORDER inherits for free).
  //
  // FENCE (git-blamed, WF3 2026-09-18 output-panel fold R1): this loop has run
  // OUTSIDE the pinned REPEATABLE READ transaction since BEFORE the RECORDER
  // conversion (`c19cf224^:scripts/refresh-snapshot.js:308-503`, itself
  // predating `fd14dc53`) — every one of these 6 reads is independently
  // try/caught with its own carry-forward fallback, while the main block is
  // ALL-OR-NOTHING (one shared try/catch around the whole transaction, one
  // ROLLBACK). Moving an optional read inside the shared transaction would
  // mean ITS failure aborts the successful main reads too via Postgres'
  // aborted-transaction-until-ROLLBACK semantics (no per-statement recovery
  // without a SAVEPOINT per read) — exactly the failure-isolation guarantee
  // "optional" exists to give up. This fold ADDS bounds and a trace to this
  // loop without touching that isolation: still autocommit, still one
  // independent try/catch per read, never inside `snapClient`'s transaction.
  // WF3 2026-09-18 (fold-validation V1) — ONE wall-clock budget across main + optional
  // reads, not two. The main block above already spent (Date.now() - phaseStartMs) of
  // the SAME phaseDeadlineMs; arming a FRESH full-length timer here would let a step
  // whose descriptor/registry text says "bounds the WHOLE read phase, under the
  // 15-minute step ceiling" actually run for up to 2x that (worst case ~24min against a
  // 12min-default/15min-ceiling declaration) — contradicting the very bound it declares.
  // `statementTimeoutMs`/`phaseDeadlineMs`/`phaseDeadlineMinutes` are the SAME resolved
  // values the main block used (not re-resolved) — "the same logic variable" means the
  // same VALUE, not a second call that could in principle diverge.
  const elapsedBeforeOptional = Date.now() - phaseStartMs;
  const remainingPhaseDeadlineMs = remainingBudgetMs(phaseDeadlineMs, elapsedBeforeOptional);
  if (phaseDeadlineMs > 0 && remainingPhaseDeadlineMs <= 0) {
    // The main reads alone consumed the WHOLE declared budget (Postgres' own cancel
    // dispatch can race a main read's own successful completion at exactly the deadline
    // boundary — Spec 118 §3's "the platform axe is the backstop, never the mechanism"
    // cuts both ways: a mechanism that fires a hair too late must not then silently run
    // unbounded). Nothing remains for ANY optional read — skip them all via the EXISTING
    // carry-forward path, loud and named, without opening a connection that would have
    // nothing left to spend.
    for (const step of (reads.optional || [])) {
      log.warn(tag, `${step.key} SKIPPED — the shared ${phaseDeadlineMinutes}min phase deadline was already exhausted by the main reads — carrying forward the previous row`);
      results[step.key] = null;
      readTimings.push({ key: step.key, elapsed_ms: 0, row_count: null, phase: 'optional', cancelled: true, cancel_kind: 'phase_deadline' });
    }
  } else {
    const [optionalClient, optionalCancelClient] = await connectPair(pool);
    let optionalRestoreFailed = false;
    try {
      if (statementTimeoutMs > 0) await optionalClient.query(`SET statement_timeout = ${statementTimeoutMs}`);
      const optionalPidRow = await optionalClient.query('SELECT pg_backend_pid() AS pid');
      const optionalPid = optionalPidRow.rows[0] ? Number(optionalPidRow.rows[0].pid) : null;
      // Armed with the REMAINING budget, not the full `phaseDeadlineMs` — a disabled
      // deadline (phaseDeadlineMs 0/"none") keeps remainingPhaseDeadlineMs at 0, which
      // `startPhaseDeadline`'s own `!timeoutMs` guard already treats as inert, so
      // "disabled stays disabled for both blocks" falls out of the same arithmetic.
      const optionalDeadline = startPhaseDeadline(optionalCancelClient, optionalPid, remainingPhaseDeadlineMs, { phase: 'optional_reads', tag, log });
      try {
        for (const step of (reads.optional || [])) {
          const readStartMs = Date.now();
          try {
            const r = await optionalClient.query(step.sql, step.params || []);
            results[step.key] = r.rows;
            readTimings.push({ key: step.key, elapsed_ms: Date.now() - readStartMs, row_count: r.rows.length, phase: 'optional' });
          } catch (err) {
            // A cancel/timeout on an AUTOCOMMIT statement aborts only THAT
            // statement — the connection stays usable for the next optional
            // read, unlike the shared-transaction case above. So this still
            // takes the pre-existing carry-forward path (never fails the step),
            // now LOUD about *why* (cancelled vs a genuine query error) and
            // named in `read_timings[]` — the existing `optional_query_failed`
            // WARN check already reports this key from `results[key] === null`
            // regardless of cause, so no compute.js change is needed for the
            // audit-visible marker.
            const isBoundHit = err && (err.code === '57014' || err.code === '55P03');
            const kind = !isBoundHit ? null : (err.code === '55P03' ? 'lock_timeout' : (optionalDeadline.fired() ? 'phase_deadline' : 'statement_timeout'));
            log.warn(tag, isBoundHit
              ? `${step.key} CANCELLED by ${kind} after ${Date.now() - readStartMs}ms — carrying forward the previous row`
              : `${step.key} query failed — carrying forward the previous row: ${err.message}`);
            results[step.key] = null;
            readTimings.push({
              key: step.key, elapsed_ms: Date.now() - readStartMs, row_count: null, phase: 'optional',
              ...(isBoundHit ? { cancelled: true, cancel_kind: kind } : {}),
            });
          }
        }
      } finally {
        optionalDeadline.stop();
      }
    } finally {
      // EP-D16's own precedent (scripts/lib/step/index.js runEnrichPhase pass 5) —
      // a session-level SET must not survive back into the pool for the NEXT
      // checkout to inherit; RESET (not a bare '0' literal — RESET reverts to
      // the server default, which is what a step declaring no bound at all
      // already runs under) before release, and destroy the client rather than
      // pool it if the restore itself fails.
      try {
        if (statementTimeoutMs > 0) await optionalClient.query('RESET statement_timeout');
      } catch (err) {
        optionalRestoreFailed = true;
        log.warn(tag, `optional-reads statement_timeout restore failed (${err.message}) — destroying the client so the pool never reuses it capped`);
      }
      optionalClient.release(optionalRestoreFailed ? new Error('optional-reads statement_timeout restore failed — client destroyed, not pooled') : undefined);
      optionalCancelClient.release();
    }
  }

  let prevRow = null;
  const keyCol = Array.isArray(spec.key) ? spec.key[0] : spec.key;
  const getPrevRow = async () => {
    if (prevRow !== null) return prevRow;
    try {
      const r = await pool.query(`SELECT * FROM ${plan.table} ORDER BY ${keyCol} DESC LIMIT 1`);
      prevRow = r.rows[0] || {};
    } catch { prevRow = {}; }
    return prevRow;
  };
  const prevRowResolved = await getPrevRow();

  // ── THE PRE-WRITE GATE, before the one statement ─────────────────────────
  const gateForPreWrite = { mode: 'incremental', reason: 'recorder', skipped: false };
  const decision = preWriteGate
    ? await preWriteGate({
      matched: { results }, gate: gateForPreWrite, prior, overrides, written: null,
    })
    : { abort: false, failed: [] };
  if (decision.abort) {
    log.error(tag, `pre_write check(s) FAILED with no standing override — no write was issued and `
      + `${plan.table} is untouched: ${decision.failed.join(', ')}`);
    return {
      matched: null,
      written: { ...written, write_skipped_pre_write_fail: true },
      prior,
      overrides,
      writeSkipped: true,
      failedPreWrite: decision.failed,
    };
  }

  // ── assemble the row + author the write statement — compute, pure JS ─────
  const assembled = compute.buildRow(results, prevRowResolved, prior, config);
  const authored = compute.buildWriteSql(assembled.row, clockNow);

  // ── THE ONE STATEMENT ──────────────────────────────────────────────────
  let isInsert = false;
  await pipeline.withTransaction(pool, async (txClient) => {
    const returned = await write.executeRecorderUpsert(txClient, authored.sql, authored.params);
    isInsert = Boolean(returned && returned.is_insert);
  });
  written[write.targetKey(0)].scanned = 1;
  written[write.targetKey(0)].inserted = isInsert ? 1 : 0;
  written[write.targetKey(0)].updated = isInsert ? 0 : 1;
  written[write.targetKey(0)].rows_changed = 1;

  return {
    // WF3 2026-09-18 (Peel 2.1) — `read_timings` survives the process via
    // records_meta (compute.js's own `compute()` return threads ctx.matched.read_timings
    // into `records_meta.read_timings`), so a slow read is diagnosable AFTER the fact
    // instead of only distinguishable-from-a-hang while the process is still running.
    matched: { ...assembled.matched, is_insert: isInsert, is_update: !isInsert, read_timings: readTimings },
    written,
    prior,
    overrides,
    writeSkipped: false,
  };
}

// ---------------------------------------------------------------------------
// THE ENRICH PHASE (LG-28, ENRICHER pilot 9, `enrich_parcels`, execution.shape:"enrich")
// ---------------------------------------------------------------------------

/**
 * WF3 enrich_parcels stall commits 1/3 (2026-09-03), moved into the library at LG-28
 * (Fold D3 — first-of-kind, zero prior hits in scripts/lib/). Writes
 * `pipeline_runs.records_meta.{last_heartbeat_at,current_pass,rows_processed}` via a
 * COALESCE merge so an earlier phase's own fields survive. Never throws (§3.6 "never
 * crash the pass it is instrumenting") — a failed write is caught and logged. No-ops
 * when `runId` is null (a standalone invocation with no `pipeline_runs` row to update).
 * EP-D12 fix (pilot 9 commit 8 P8, 2026-09-08): the caller (`runEnrichPhase`) now always
 * passes a DEDICATED, PRE-ACQUIRED autocommit client (`heartbeatClient`, held for the
 * whole call, never inside BEGIN/COMMIT/ROLLBACK) rather than the bare `pool` — a
 * per-call `pool.query()` checkout can queue behind the phase's own long-held
 * connection(s) under a constrained connection ceiling (measured on cloud: heartbeat
 * fields stayed NULL for an entire run, `pipeline_runs` row 4429), making the write
 * observably invisible for as long as the phase itself runs even though it was never
 * literally inside the phase's own transaction. Duck-typed on `.query()` — works
 * identically whether passed a `Pool` or a checked-out `PoolClient`.
 * @param {import('pg').Pool | import('pg').PoolClient} writer
 * @param {number|null} runId
 * @param {string} currentPhase
 * @param {number} rowsProcessed
 */
async function recordHeartbeat(writer, runId, currentPhase, rowsProcessed) {
  if (runId == null) return;
  try {
    await writer.query(
      `UPDATE pipeline_runs
          SET records_meta = COALESCE(records_meta, '{}'::jsonb) || jsonb_build_object(
                'last_heartbeat_at', now(),
                'current_pass', $1::text,
                'rows_processed', $2::int
              )
        WHERE id = $3`,
      [currentPhase, rowsProcessed, runId],
    );
  } catch (err) {
    pipeline.log.warn('[step/enrich]', `heartbeat pipeline_runs UPDATE failed (run id ${runId}): ${err.message}`);
  }
}

/**
 * WF3 enrich_parcels stall commit 3 — silence-gated `pg_stat_activity` capture, Spec 48
 * §3.10, moved into the library at LG-28. Generalized beyond the legacy pass-5-only
 * version: this one takes the CURRENT phase's own backend `pid` (the runner now manages
 * every phase's client directly, unlike the legacy `pipeline.streamQuery`-hidden
 * connection) and probes `pg_stat_activity` for that exact pid — precise, not a
 * domain-column `ILIKE` guess. Runs on a DEDICATED client (`heartbeatClient`, EP-D12 fix,
 * pilot 9 commit 8 P8) — a FRESH physical connection, not the (possibly stuck) client
 * being probed — so the capture can complete while the probed session is wedged, and its
 * own write is visible immediately rather than queuing behind a per-call pool checkout
 * under a constrained connection ceiling. Never throws; no-ops when `runId` is null.
 * @param {import('pg').Pool | import('pg').PoolClient} writer
 * @param {number|null} runId
 * @param {number|null} pid
 */
async function captureStallDiagnostic(writer, runId, pid) {
  if (runId == null) return;
  try {
    const probe = pid != null
      ? await writer.query(
        `SELECT pid, state, wait_event_type, wait_event, query_start
           FROM pg_stat_activity WHERE pid = $1`,
        [pid],
      )
      : { rows: [] };
    const diag = probe.rows[0] || { note: 'no matching backend found in pg_stat_activity' };
    await writer.query(
      `UPDATE pipeline_runs
          SET records_meta = COALESCE(records_meta, '{}'::jsonb) || jsonb_build_object(
                'stall_diagnostic', $1::jsonb,
                'stall_diagnostic_at', now()
              )
        WHERE id = $2`,
      [JSON.stringify(diag), runId],
    );
  } catch (err) {
    pipeline.log.warn('[step/enrich]', `stall diagnostic capture failed (run id ${runId}): ${err.message}`);
  }
}

/**
 * WF3 enrich_parcels stall commit 3 — starts a silence-gated ticker for ONE phase,
 * moved into the library at LG-28 and generalized from pass-5-only to EVERY phase (the
 * WF3's own filed deliverable: "whole-step ticker... passes-1-4 heartbeat" — this
 * closes both in one mechanism). If a single phase call has not returned within
 * `2 * intervalMs`, one diagnostic capture fires (never spams — `fired` latches until
 * the caller starts a fresh ticker for the NEXT phase). This is the STALL PROBE only
 * (a `pg_stat_activity` snapshot) — the periodic HEARTBEAT WRITE is a separate,
 * UNLATCHED mechanism (`startHeartbeatTicker`, EP-D15, WF3 C4) that advances
 * `last_heartbeat_at`/`rows_processed` on every tick, not once per phase. Returns a
 * `stop()` closure — callers MUST clear it in a `finally` once the phase call settles.
 * @param {import('pg').Pool | import('pg').PoolClient} writer
 * @param {number|null} runId
 * @param {number} intervalMs
 * @param {() => number|null} getPid
 * @returns {() => void}
 */
/**
 * EP-PHASE-DEADLINE (Guardian fold, 2026-09-15) — the CEILING on the phase deadline's
 * cancel-retry cadence. See `startPhaseDeadline` for why a retry exists at all and why
 * this is a derived constant rather than an admin logic variable.
 */
const PHASE_DEADLINE_RECANCEL_MS = 5000;

function startStallTicker(writer, runId, intervalMs, getPid) {
  if (!intervalMs || intervalMs <= 0) return () => {};
  let fired = false;
  const timer = setInterval(() => {
    if (fired) return;
    fired = true;
    captureStallDiagnostic(writer, runId, getPid()).catch((err) => {
      pipeline.log.warn('[step/enrich]', `stall ticker diagnostic dispatch failed: ${err.message}`);
    });
  }, intervalMs * 2);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

/**
 * EP-PHASE-DEADLINE (WF3, .cursor/wf3_enrich_parcels_pass3_backlog_active_task.md C2,
 * 2026-09-15) — a WALL-CLOCK deadline for one PHASE, as opposed to the per-STATEMENT
 * `SET LOCAL statement_timeout` the phase loop also issues (kept — it is a correct and
 * real per-statement fence, just not a phase bound).
 *
 * WHY A CANCEL AND NOT A JS `throw`: a `throw` from a timer cannot interrupt an in-flight
 * `client.query` — the statement would run to completion inside the shared transaction and
 * the abort would arrive minutes late, which is indistinguishable from the defect being
 * fixed. `pg_cancel_backend(pid)` is how Postgres is told: it aborts whatever statement the
 * target backend has in flight with SQLSTATE **57014**, the SAME code the phase loop's
 * existing loud wrapper already catches — so this adds NO new error path and NO new boolean.
 *
 * WHY CANCEL AND NOT TERMINATE (plan Q2, operator ruling 2026-09-15): `pg_cancel_backend`
 * rolls the transaction back cleanly and leaves the pooled client recoverable;
 * `pg_terminate_backend` destroys the connection mid-`withTransaction` with a far less
 * predictable error shape. Rule 12's truthful-crash posture is satisfied either way by the
 * loud, phase-named error the wrapper builds.
 *
 * WHY A SEPARATE CONNECTION: a cancel sent down the very session that is blocked could never
 * be delivered. `cancelClient` is the caller's already-open, autocommit, held-for-the-whole-
 * call heartbeat client (EP-D12) — never a fresh `pool.query()` checkout, which can queue
 * behind the phase's own long-held connection under cloud's Supavisor ceiling (the exact
 * starvation EP-D12 measured on `pipeline_runs` row 4429).
 *
 * FAIL-OPEN ON THE GUARD, NEVER ON THE PHASE: a failed cancel dispatch is logged and
 * swallowed — the phase then runs unbounded exactly as it did before this fix, which is
 * strictly no worse than the status quo. It must never be the thing that kills a healthy run.
 *
 * @param {{query: Function}} cancelClient - a connection OTHER than the phase's own
 * @param {number|null} pid - the phase backend's pid (`SELECT pg_backend_pid()`)
 * @param {number} timeoutMs - the declared phase bound, in ms; <= 0 arms nothing (INERT)
 * @param {{phase: string, tag: string, log: {warn: Function, error: Function}}} meta
 * @returns {{stop: Function, fired: Function}} `fired()` reports whether the deadline
 *   elapsed, so the caller can name `phase_deadline` (not `statement_timeout`) on the 57014.
 */
function startPhaseDeadline(cancelClient, pid, timeoutMs, meta) {
  let fired = false;
  let stopped = false;
  let armTimer = null;
  let recancelTimer = null;
  const stop = () => {
    stopped = true;
    if (armTimer) clearTimeout(armTimer);
    if (recancelTimer) clearInterval(recancelTimer);
  };
  if (!timeoutMs || timeoutMs <= 0 || pid == null || !cancelClient) {
    return { stop: () => {}, fired: () => fired };
  }
  const issueCancel = () => {
    Promise.resolve(cancelClient.query('SELECT pg_cancel_backend($1)', [pid])).catch((err) => {
      // The guard failed, not the phase. Loud in the log, never thrown: rethrowing from a
      // timer callback is an unhandled rejection that would take the process down for a
      // reason unrelated to the work. `log.error(tag, ERR, ctx)` — the SECOND argument is
      // the Error itself (scripts/lib/pipeline.js:288), which is what preserves `stack`
      // and `error_type`; passing a pre-rendered string there silently drops both.
      meta.log.error(meta.tag, err, { phase: meta.phase, guard: 'phase_deadline', pid, note: 'cancel dispatch failed — the phase now runs unbounded, as it did before EP-PHASE-DEADLINE' });
    });
  };
  // Guardian fold (2026-09-15) — RE-ARM, because ONE cancel is not a deadline.
  // `pg_cancel_backend` cancels whatever statement the target backend has IN FLIGHT. A
  // cancel that lands while the backend is IDLE — between two of the phase's statements,
  // which is the whole population this deadline exists for (a phase whose statements each
  // finish under the bound but sum past it is by definition a phase that spends time
  // between statements) — is a NO-OP that Postgres simply consumes. With a single-shot
  // timer that leaves the worst possible state: `fired()` is true, nothing re-arms, the
  // phase runs on unbounded, and whatever 57014 eventually arrives (a genuine
  // PER-STATEMENT timeout, hours later) is mislabelled `phase_deadline` — a deadline that
  // reports success while enforcing nothing, which is the exact §3.6 silence class this
  // whole change closes. So the cancel is RE-ISSUED until the phase promise settles and
  // `stop()` runs in its `finally`.
  //
  // The cadence is DERIVED, not declared: `min(5s, max(50ms, bound/4))`. It is a guard's
  // retry interval, not a bound — deliberately NOT a new admin logic variable, because it
  // changes nothing observable (the DEADLINE is the tunable; the cadence only decides
  // whether the abort lands within 5 s of it against a 75-minute bound) and Rule 3's
  // externalization is for values that change what the step does or decides. Deriving it
  // from the bound also keeps it honest under a tiny test bound instead of hard-coding a
  // production-scale constant a unit lock would have to wait out.
  const recancelMs = Math.min(PHASE_DEADLINE_RECANCEL_MS, Math.max(50, Math.round(timeoutMs / 4)));
  armTimer = setTimeout(() => {
    if (stopped) return;
    fired = true;
    meta.log.warn(meta.tag, `phase ${meta.phase} exceeded its declared ${Math.round(timeoutMs / 60000)}min bound — cancelling backend ${pid}`);
    issueCancel();
    recancelTimer = setInterval(() => {
      if (stopped) return;
      meta.log.warn(meta.tag, `phase ${meta.phase} still running after the deadline cancel (the backend was idle when it landed, or the statement restarted) — re-issuing pg_cancel_backend(${pid})`);
      issueCancel();
    }, recancelMs);
    if (typeof recancelTimer.unref === 'function') recancelTimer.unref();
  }, timeoutMs);
  if (typeof armTimer.unref === 'function') armTimer.unref();
  return { stop, fired: () => fired };
}

/**
 * EP-D15 (WF3 C4, 2026-09-09) — a PERIODIC, UNLATCHED heartbeat write: every `intervalMs`,
 * for as long as the phase runs, `recordHeartbeat` is called again with the CURRENT
 * `rows_processed` value (`getRowsProcessed()`, fed by the runner-owned `ctx.onProgress(n)`
 * seam a pass MAY call — compute stays JUST compute, Rule 2; the progress NUMBER is
 * whatever the pass reports, the WRITE CADENCE/CONNECTION stay the runner's job).
 * Deliberately un-latched (unlike `startStallTicker`'s one-shot probe): a healthy run inside
 * a 50+-minute phase (measured, EP-D15's own defect evidence — `phase max_build completed in
 * 3049335ms`) must advance `last_heartbeat_at` repeatedly, not go silent between the phase's
 * own start/end writes.
 *
 * F5 (output panel, 2026-09-09) — WHOLE-STEP, not post_commit-only: the reaper hazard's own
 * evidence (`phase max_build completed in 3049335ms` = 50.8 min) is a SHARED-txn phase, so a
 * ticker scoped to post_commit alone left every shared-txn phase's own silence gap open. One
 * instance now spans the entire call (started before the shared-txn loop, stopped after the
 * post_commit loop, on the SAME dedicated `heartbeatClient`) — `getPhaseName` reads whichever
 * phase is CURRENTLY running, since a single fixed name can no longer describe every tick.
 * @param {import('pg').Pool | import('pg').PoolClient} writer
 * @param {number|null} runId
 * @param {() => string|null} getPhaseName
 * @param {number} intervalMs
 * @param {() => number} getRowsProcessed
 * @returns {() => void}
 */
function startHeartbeatTicker(writer, runId, getPhaseName, intervalMs, getRowsProcessed) {
  // ER-D1 (batch-2 Phase 0.10, Spec 48 §3.6 silence class) — `!intervalMs` cannot
  // tell a DELIBERATE 0 (an operator disabling the ticker; `runMaintenance` passes
  // a literal 0 for every step that declares no heartbeat variable) from a
  // NON-FINITE value (`Math.round(Number(undefined) * 60000)` — a step whose
  // heartbeat variable did not resolve). `!NaN` is true, so the second case used to
  // install a NO-OP ticker: `last_heartbeat_at` NULL for the whole run, no warning,
  // no audit row, no throw. Latent only because ENRICHER had exactly one member,
  // which is precisely the condition batch 2 removes. `Number.isFinite`, never
  // `!x` — that distinction IS the fix, so the disable case below is untouched.
  if (!Number.isFinite(intervalMs)) {
    throw new Error(
      `[step] startHeartbeatTicker: interval is non-finite (${intervalMs}). A heartbeat interval that does not resolve `
      + 'must FAIL LOUD, never silently install a no-op ticker that leaves last_heartbeat_at NULL for the whole run '
      + '(ER-D1, Spec 48 §3.6). A deliberate 0 still disables the ticker.',
    );
  }
  if (!intervalMs || intervalMs <= 0) return () => {};
  const timer = setInterval(() => {
    const phaseName = getPhaseName();
    if (!phaseName) return; // between phases (or before the first one) — nothing to attribute the tick to
    recordHeartbeat(writer, runId, phaseName, getRowsProcessed()).catch((err) => {
      pipeline.log.warn('[step/enrich]', `heartbeat ticker write failed (phase ${phaseName}): ${err.message}`);
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

/**
 * A `ctx.stream` implementation over a CALLER-SUPPLIED client — same underlying primitive
 * (`pg-query-stream`), same yield-one-row contract as `pipeline.streamQuery`, but taking an
 * already-open client instead of calling `pool.connect()` itself, so the caller decides
 * which connection the cursor lives on.
 *
 * WF3 enrich_parcels pass-5 stream/write deadlock (2026-09-07) — Fold B2's ORIGINAL
 * rationale for this function (superseded, see below) was to pin the cursor to the SAME
 * client pass 5 also writes on, so `SET LOCAL statement_timeout` (bound once, at BEGIN)
 * would provably cover the read too. Measured live against the local DB: a client with an
 * open `pg-query-stream` cursor HANGS FOREVER on any other query issued on that SAME
 * client — pg-query-stream holds the connection's one command slot for the life of the
 * cursor, so a write queued behind it never runs, and the cursor never gets to fetch its
 * next batch because the code awaiting that write never returns control to the loop
 * (`wait_event=ClientRead`, ~0% CPU — this IS the 2026-09-04/09-07 stuck-pass incident).
 * The SAME-client write on a fresh, unrelated client succeeded immediately (10s timeout,
 * both cases reproduced with a 5-row table).
 *
 * FIX: the caller (`runEnrichPhase`'s post-commit loop) now passes a DEDICATED
 * `pool.connect()`'d client for the stream — never the write/txn client — mirroring the
 * LEGACY script's own split: `pipeline.streamQuery` always opened its own client via
 * `pool.connect()`, and legacy pass 5's writes went through `pool.query(...)` (a
 * different client from the pool's rotation), so the two NEVER shared a connection. The
 * one thing that split trades away is exactly Fold B2's original guarantee — the
 * dedicated stream client carries no `SET LOCAL statement_timeout` of its own (same as
 * the legacy script, which never bounded the read either); the write/txn client's bound
 * timeout (asserted via `SHOW` on that session, RE-FREEZE #3) is untouched and still
 * covers every write in this phase.
 * @param {import('pg').PoolClient} client
 * @param {string} sql
 * @param {any[]} params
 * @param {{batchSize?: number}} [options]
 */
async function* streamOverClient(client, sql, params = [], options = {}) {
  const QueryStream = require('pg-query-stream');
  const qs = new QueryStream(sql, params, { batchSize: options.batchSize || 100 });
  const stream = client.query(qs);
  try {
    for await (const row of stream) yield row;
  } finally {
    stream.destroy();
  }
}

/**
 * `matched.compute` — the DECLARED counter-source root for an ENRICHER (batch-2 Phase 0.10b).
 *
 * `counters.<slot>.source: "compute.<name>"` resolves against this block, so a value that is
 * absent or non-finite makes the counter read as "not counted" rather than as the number it
 * is: NULL is not zero (Spec 48 §3.6), and a declared counter that can only ever resolve to
 * null is a measurement nobody takes (Spec 79 C11).
 *
 * A `post_phase` hook that returns its own `compute` block owns it ENTIRELY — including the
 * KEY NAMES, because `total_parcels_scanned` is `enrich_parcels` vocabulary and a generic
 * runner has no business minting a name for a step it knows nothing about. Every value is
 * checked FINITE, not merely present.
 *
 * A step with no hook, or a hook that returns no `compute`, gets the block DERIVED from the
 * declared per-target `written[]` counters the phase loop has just folded.
 *
 * ⚠️ The sum runs over the DISTINCT `execution.phases[].writes_ref` set — the targets a phase
 * actually DECLARES — not over every `outputs.writes[]` entry, and the difference is a real
 * defect rather than a nicety (output-panel Integration seat, 2026-09-16). The two CLASS-BASED
 * targets (`set_based_scoped`, `insert_only_no_retraction`) are filled AFTER the phase loop by
 * the runner's own `stampsIdx`/`scopeIdx` blocks, and the stamp target's `updated` is
 * `zoning.updated + max_build.updated` — rows ALREADY counted on those two phases' own targets.
 * Summing every declared write would therefore double-count them, under the SAME key name
 * (`records_updated_aggregate`) a hook fills with a distinct-id UNION — one key, two semantics,
 * selected by whether a hook happens to be declared. That is a §11 counter-semantics collision,
 * so the derivation takes the declared-phase set and says so here.
 *
 * Derived rather than left absent on purpose: the fallback exists so a counter source can never
 * resolve to null BY ACCIDENT, which is exactly how this region failed before 0.10b.
 *
 * ⚠️ AND KNOW WHICH ROOT ACTUALLY RESOLVES. `counters.<slot>.source` resolves against
 * `{matched, written, records_meta}` for this shape, so `matched.compute.records_updated_aggregate`
 * and `written.e<N>.updated` BOTH resolve (measured), while a bare `compute.*` resolves NULL for
 * EVERY ENRICHER. Declare `matched.compute.*` or `written.*`, never a bare `compute.*`.
 *
 * That filing is now CLOSED (WF3, 2026-09-17): `enrich_parcels`' own three declared counters had
 * read null since conversion (`07afb862`) for exactly this reason, and 0.10b deliberately left it
 * because fixing it moves the emitted summary; the WF3 re-pointed the descriptor at
 * `matched.compute.*`, recaptured the goldens, and made the rule FLEET-ENFORCED rather than
 * advisory — `step-validate.mjs` fast invariant #26 (COUNTER-ROOT) REDs any declared source whose
 * root is not one this ternary actually builds for that shape (+ `records_meta`), parsing the
 * roots out of THIS file rather than copying them.
 *
 * ⚠️ AND KNOW WHICH ARM YOU ARE ON. The two arms below do NOT agree on key NAMES. The hook arm
 * returns `postPhase.compute` VERBATIM — whatever the step's own export names (`enrich_parcels`
 * names `total_parcels_scanned` / `records_new_aggregate` / `records_updated_aggregate`). The
 * DERIVED arm mints its own three: `records_scanned_aggregate` / `records_new_aggregate` /
 * `records_updated_aggregate`. So an ENRICHER that declares NO `post_phase` hook and copies
 * `matched.compute.total_parcels_scanned` from this step's descriptor gets null — it must declare
 * `matched.compute.records_scanned_aggregate`. Invariant #26 checks the ROOT, not the leaf key;
 * the leaf is the author's own to get right.
 */
function resolveEnrichAggregate(postPhase, written, phases, specs, tag) {
  if (postPhase.compute !== undefined) {
    const block = postPhase.compute;
    if (block === null || typeof block !== 'object' || Array.isArray(block)) {
      throw new Error(
        `${tag} execution.enrich_hooks.post_phase returned a \`compute\` block that is not a plain object `
        + `(${Array.isArray(block) ? 'an array' : JSON.stringify(block)}). It is the root every `
        + '`counters.<slot>.source: "compute.*"` declaration resolves against.',
      );
    }
    for (const [k, v] of Object.entries(block)) {
      if (!Number.isFinite(v)) {
        throw new Error(
          `${tag} execution.enrich_hooks.post_phase returned compute.${k} = ${JSON.stringify(v)}, which is not a `
          + 'finite number. A counter whose declared source resolves to a non-number reads as "not counted" rather '
          + 'than as the number it is (Spec 48 §3.6) — report a real measurement, or do not declare the key.',
        );
      }
    }
    return block;
  }
  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  const declaredRefs = [...new Set((phases || []).map((p) => p.writes_ref))].sort((a, b) => a - b);
  for (const i of declaredRefs) {
    const key = write.targetKey(i);
    const c = written[key];
    if (!c) {
      throw new Error(
        `${tag} cannot derive matched.compute: execution.phases[] declares writes_ref ${i}, which has no counter `
        + `block at written.${key} (this descriptor declares ${specs.length} write target(s)). The runner builds `
        + 'one per declared target before the phases run, so this is a library invariant break.',
      );
    }
    scanned += c.scanned || 0;
    inserted += c.inserted || 0;
    updated += c.updated || 0;
  }
  const derived = {
    records_scanned_aggregate: scanned,
    records_new_aggregate: inserted,
    records_updated_aggregate: updated,
  };
  for (const [k, v] of Object.entries(derived)) {
    if (!Number.isFinite(v)) {
      throw new Error(
        `${tag} derived matched.compute.${k} is ${JSON.stringify(v)}, not a finite number — a per-target counter `
        + 'carried a non-numeric value into the aggregate. Fail loud rather than emit a counter source that '
        + 'silently resolves to null (Spec 48 §3.6).',
      );
    }
  }
  return derived;
}

/**
 * THE ENRICH PHASE (LG-28, ENRICHER pilot 9, `enrich_parcels`, `execution.shape:"enrich"`,
 * Ask 1/Ask 2 RULING).
 *
 * Forked from every existing runner (`isEnrichStep`'s own header states why none of the
 * six fit). Phase order, mirroring the descriptor's own `execution.phases[]`:
 *   guards.requires              preconditions before the first read (`assertRequirements`)
 *   Spec 58 §9/§11 consumer protocol   `compute.readZoningContract` — HALTS on a missing/
 *                                 failed producer, BEFORE the transaction opens
 *   R-B interrupted-retraction    `staleness.detectInterruptedRetraction`, folded into
 *                                 `full` UNCONDITIONALLY (no ledger-gated-skip early
 *                                 return exists on this archetype to hide behind —
 *                                 Rule 12 reachability, `step-validate.mjs`'s
 *                                 `runnerReachability`)
 *   Spec 122 §3.0b scope-defer    `compute.computeDeferScope`, `!full` only — a
 *                                 pre-transaction row-count check that, over threshold,
 *                                 makes the run a genuine ZERO-WRITE no-op (never a
 *                                 gated skip — the run still executes to completion)
 *   THE PRE-WRITE GATE            scored before the first write, same contract as every
 *                                 other archetype (this step declares one INFO-severity
 *                                 pre_write check today, which never aborts)
 *   FOUR PASSES, ONE SHARED TXN   `execution.phases[].txn:"shared"`, in declared `order`,
 *                                 each phase wrapped in its OWN `SET LOCAL
 *                                 statement_timeout`/`lock_timeout` (reverts at COMMIT/
 *                                 ROLLBACK, Spec 122 §7.2 — never leaks onto a later
 *                                 pooled checkout); heartbeat + a silence-gated stall
 *                                 ticker around every phase, not just pass 5 (closing
 *                                 the WF3-filed deliverable)
 *   THE SCOPE HAND-OFF INSERT     the `insert_only_no_retraction`-class write target
 *                                 (`enrich_parcels_pass3_scope`) — inside the SAME shared
 *                                 transaction, BEFORE commit (Spec 122 §3.0b's own crash-
 *                                 recoverable trail)
 *   THE FIFTH PASS, POST-COMMIT   `execution.phases[].txn:"post_commit"` — a DEDICATED
 *                                 connection, its OWN transaction (Fold B2: a live
 *                                 `SET LOCAL` needs an open transaction to bind to), the
 *                                 select streamed via `ctx.stream` (`streamOverClient`,
 *                                 above) — Spec 78 §P3A.1's "a same-txn read would be
 *                                 invisible" guarantee, declared as this step's one
 *                                 `pre_write` `order_guarantee`
 *   STEP-LEVEL POST PHASE         `execution.enrich_hooks.post_phase` (batch-2 Phase
 *                                 0.10b) — the STEP's own compute export, called ONCE on
 *                                 `pool` after the last phase has committed, returning
 *                                 `{matched, compute}`. This runner owns `passes`,
 *                                 `before_image`, `<slug>_duration_ms` and the four
 *                                 `scope_*` retirement keys, and NOTHING else; every
 *                                 domain observation is the step's. No hook ⇒ the
 *                                 `compute` aggregate block is DERIVED from the declared
 *                                 per-target counters, finite-or-throw, never left null
 *
 * @returns {Promise<object>} `{deferred, matched, written, prior, overrides, writeSkipped, skipped}`
 */
async function runEnrichPhase({ descriptor, pool, compute, config, chainId, log, tag, clockNow, preWriteGate, ownRunId }) {
  const t0 = Date.now();
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  const overrides = staleness.resolveOverrides(descriptor);
  // Spec 124 R-AV (batch-2 row 2.6) — the SAME local alias the two link runners use
  // (runLinkPhase :798, runLinkKeyedPhase :984). `resolveOverrides` already folds the
  // declaration and the argv read (`dryRunArgPresent`) into one value; reading
  // `process.argv` here instead would make a declared "none" and an absent declaration
  // indistinguishable. Every write region below is gated on THIS.
  const dryRun = overrides.dry_run === true;
  // R-B (Rule 12) — folded UNCONDITIONALLY into `full`: this archetype has no
  // ledger-gated-skip early return to hide behind (runnerReachability's ENRICHER
  // branch, step-validate.mjs), so an interrupted prior run forces this one to treat
  // itself as full, mirroring runCascadePhase's own `bypassed` fold verbatim.
  const interruptedRetraction = await staleness.detectInterruptedRetraction(pool, descriptor, { ownRunId });
  const full = process.argv.includes('--full') || overrides.force_full === true || interruptedRetraction.interrupted;
  const privilege = await write.assertWritePrivileges(pool, descriptor, { log, tag });
  const prior = await staleness.readPriorEmit(pool, ledgerPipelineName(descriptor, chainId), null);

  const specs = descriptor.outputs.writes;
  const written = {};
  for (let i = 0; i < specs.length; i++) {
    written[write.targetKey(i)] = { scanned: 0, inserted: 0, updated: 0, deleted: 0, retracted: 0, rows_changed: 0 };
  }
  // RV-D4 (WF3, 2026-09-20) — per-RUN (function-local, never module scope — see the
  // WF3 enrich_parcels double-run incident (2026-09-07) for why that distinction
  // matters) set of target keys a seam (`ctx.joinUpdate`/`ctx.retract`) has ALREADY
  // incremented `written[key]` for. Filled by `makeWriteSeams` below; read by the
  // PASS_SCANNED_FIELDS reconciliation loop further down.
  const seamOwned = new Set();
  written.privilege = privilege[specs[0].table] || null;
  written.requirements = requirements;
  if (interruptedRetraction.interrupted) written.interrupted_retraction_forced_full = true;

  // ── batch-2 Phase 0.10 — the two PRE-PHASE concerns are DECLARED, not hardcoded ──
  //
  // Until 0.10 both of these were `enrich_parcels`' own compute exports called by
  // literal name, so a second enrich-shaped step died at `TypeError:
  // compute.readZoningContract is not a function` before its first phase, and its
  // defer threshold read `Number(config.enrich_parcels_defer_threshold_rows)` =
  // NaN, whose `scope_count >= NaN` comparison dodged the early return BY ACCIDENT.
  // Accidents are not contracts (Rule 1). Both are now OPTIONAL, step-level
  // declarations (`execution.enrich_hooks`, Ask A1 — both fire ONCE, before phase 1,
  // never per pass, so a per-pass home would declare a lifecycle the runner does not
  // have): absent means the runner does not call them AT ALL, declared-but-missing
  // is a NAMED throw citing the descriptor field.
  const hooks = (descriptor.execution && descriptor.execution.enrich_hooks) || {};
  const resolveHook = (exportName, field) => {
    const fn = compute[exportName];
    if (typeof fn !== 'function') {
      throw new Error(
        `${tag} ${field} names "${exportName}", which this step's compute module does not export. `
        + 'A declared hook that resolves to nothing is a declaration that lies (Rule 1); '
        + 'omit the field if the step has no such concern.',
      );
    }
    return fn;
  };

  // batch-2 Phase 0.10b — the POST-phase hook is RESOLVED HERE, beside its two siblings,
  // and CALLED at the very end of the run. That split IS the row. Until 0.10b the
  // post-phase region called `compute.computeAggregateRecordsUpdated(...)` with no guard at
  // all — unlike `contract_read`/`defer_scope`, which do guard — so an ENRICHER whose
  // compute lacks that export died at `TypeError: compute.computeAggregateRecordsUpdated is
  // not a function` AFTER every pass had run and, on a shared-txn step, AFTER COMMIT. That
  // is the worst place in the whole runner to fail. Resolving the NAME above the work makes
  // a mis-declared hook a named throw before anything happens; guarding it lazily at the
  // call site would only have moved the crash a few lines.
  const postPhaseHook = hooks.post_phase && hooks.post_phase !== 'none' ? hooks.post_phase : null;
  const postPhaseFn = postPhaseHook ? resolveHook(postPhaseHook, 'execution.enrich_hooks.post_phase') : null;

  // ── Spec 58 §9/§11 consumer protocol — HALTS on a missing/failed producer ────
  const contractHook = hooks.contract_read && hooks.contract_read !== 'none' ? hooks.contract_read : null;
  let staleOverlays = new Set();
  // batch-2 row 2.1 (Ask A2 (a), enrich_ravines, 2026-09-18) — hoisted out of the `if` block
  // below and threaded onto BOTH `passCtx` object literals as `contract` (one additive key,
  // no schema change): until this change the hook's return value was read ONLY for its
  // `staleOverlays` side effect and otherwise DISCARDED, so a step declaring `contract_read`
  // for a value beyond `layers` (e.g. enrich_ravines' `sourceDatasetVersion`) had no seam to
  // reach it from a pass. `null` when no contract_read hook is declared, so a pass that reads
  // `ctx.contract` on a step with no hook fails loudly rather than reading `undefined` fields.
  let contract = null;
  if (contractHook) {
    contract = await resolveHook(contractHook, 'execution.enrich_hooks.contract_read')(pool);
    staleOverlays = new Set(
      (compute.OVERLAY_LAYERS || []).filter((l) => l.col && contract.layers[l.key] === false).map((l) => l.key),
    );
  }

  // ── Spec 122 §3.0b — the pre-transaction scope-defer decision (ZERO writes if deferred) ──
  const deferHook = hooks.defer_scope && hooks.defer_scope !== 'none' ? hooks.defer_scope : null;
  if (!full && deferHook) {
    const deferFn = resolveHook(deferHook.export, 'execution.enrich_hooks.defer_scope.export');
    const deferThreshold = Number(config[deferHook.threshold_from_config]);
    if (!Number.isFinite(deferThreshold)) {
      throw new Error(
        `${tag} execution.enrich_hooks.defer_scope.threshold_from_config names "${deferHook.threshold_from_config}", `
        + `which resolved to ${JSON.stringify(config[deferHook.threshold_from_config])}. A non-finite threshold makes `
        + 'every `scope_count >= threshold` comparison false, which reads as "never defer" while declaring a bound '
        + '— the accidental escape this row retires (Rule 12).',
      );
    }
    const scope = await deferFn(pool, deferThreshold);
    if (scope.scope_count >= deferThreshold) {
      log.warn(tag, `enrich defer: combined scope ${scope.scope_count} >= threshold ${deferThreshold} (ratio ${scope.ratio})`);
      return {
        deferred: true,
        // `<slug>_duration_ms`, derived from identity.name — a hardcoded
        // `enrich_parcels_duration_ms` key would have leaked that slug's name into
        // every other ENRICHER's telemetry. Identical string for enrich_parcels.
        matched: { defer_scope: scope, [`${descriptor.identity.name}_duration_ms`]: Date.now() - t0 },
        written,
        prior,
        overrides,
        writeSkipped: false,
        skipped: false,
      };
    }
  }

  // ── THE PRE-WRITE GATE, before the first write ───────────────────────────
  const decision = preWriteGate
    ? await preWriteGate({ matched: {}, gate: null, prior, overrides, written: null })
    : { abort: false, failed: [] };
  if (decision.abort) {
    log.error(tag, `pre_write check(s) FAILED with no standing override — enrich write SKIPPED: ${decision.failed.join(', ')}`);
    return {
      matched: {},
      written: { ...written, write_skipped_pre_write_fail: true },
      prior,
      overrides,
      writeSkipped: true,
      failedPreWrite: decision.failed,
    };
  }

  const phases = descriptor.execution.phases;
  if (!Array.isArray(phases) || phases.length === 0) {
    throw new Error(`${tag} execution.shape "enrich" requires a non-empty execution.phases[] array`);
  }
  const sharedPhases = phases.filter((p) => p.txn === 'shared').slice().sort((a, b) => a.order - b.order);
  const postCommitPhases = phases.filter((p) => p.txn === 'post_commit').slice().sort((a, b) => a.order - b.order);
  const passByName = (name) => {
    const spec = compute.passes.find((p) => p.name === name);
    if (!spec) throw new Error(`${tag} execution.phases[] names "${name}", which compute.passes[] does not declare`);
    return spec;
  };

  const runAt = clockNow;
  const scopeRunId = Math.floor(runAt.getTime() / 1000);
  // pilot 9 commit 7e/2 (2026-09-04) — a `config.logic_variables[]`-declared date-anchor
  // override (enrich_parcels_comps_as_of_date, commit 7b) was REMOVED: the entry is a
  // string/nullable value, and resolveConfig's invalidReason (scripts/lib/step/config.js:76-81)
  // is unconditionally numeric-only (`typeof raw !== 'number'` => 'non_finite') across every
  // archetype — a live `--full` run threw "on_invalid \"fail\" refuses the step" before any
  // pass could execute (discovered running commit 7e's own G2' golden capture). Fold G3 already
  // flagged this half as "a reasonable but NOT literally mandated extension" (not one of Rule
  // 3's seven closed categories) — the MANDATORY half (§5.5's injected-clock ban on a bare
  // now()::date literal) stands unconditionally below; only the OPTIONAL operator-override
  // capability is dropped. Widening resolveConfig to a typed/nullable tunable class is a
  // followup for whichever pilot next needs one, not this commit's scope.
  const clock = {
    now: () => runAt,
    asOfDate: () => runAt.toISOString().slice(0, 10),
  };
  // ── batch-2 Phase 0.10 / ER-D1 — both intervals come from the DESCRIPTOR ──────
  //
  // These were `Number(config.enrich_parcels_heartbeat_minutes)` and
  // `Number(config.enrich_parcels_lock_timeout_ms)` — two hardcoded keys no other
  // step declares, so a second enrich-shaped step resolved BOTH to NaN. NaN is
  // falsy, so `startHeartbeatTicker`/`startStallTicker` silently returned a no-op
  // and `if (lockTimeoutMs > 0)` silently issued no `SET LOCAL lock_timeout` —
  // three declared guards, none of them armed, nothing anywhere saying so
  // (Spec 48 §3.6). `*_from_config` suffix is MANDATORY, not cosmetic:
  // step-conformance.infra.test.ts's `fromConfigRefs` scan matches that suffix, so
  // any other spelling reads as a dead declaration (the LW-D10 blind spot).
  //
  // FAIL LOUD, above the lock: a non-finite resolution throws here, before the
  // heartbeat client is opened and before any transaction. `Number.isFinite`, never
  // `!x` — an explicitly declared 0 stays a deliberate disable.
  const resolveInterval = (field, scale) => {
    const varName = descriptor.execution && descriptor.execution[field];
    // The literal "none" is the DECLARED disable, the same escape
    // `execution.phases[].timeout_minutes_from_config` already carries — a step
    // saying out loud that it wants no ticker / no lock ceiling. It is deliberately
    // NOT the same thing as a name that fails to resolve: the accident stays a throw,
    // only the declaration disables.
    if (varName === 'none') return 0;
    const raw = varName ? config[varName] : undefined;
    const value = Math.round(Number(raw) * scale);
    if (!Number.isFinite(value)) {
      throw new Error(
        `${tag} execution.${field} ${varName ? `names "${varName}", which resolved to ${JSON.stringify(raw)}` : 'is not declared'}. `
        + 'An enrich-shaped step must resolve this interval to a finite number; a non-finite value silently disabled the '
        + 'guard it declares (ER-D1, Spec 48 §3.6). Declare 0 to disable it deliberately.',
      );
    }
    return value;
  };
  const heartbeatMs = resolveInterval('heartbeat_minutes_from_config', 60000);
  const lockTimeoutMs = resolveInterval('lock_timeout_ms_from_config', 1);

  // ── WF3 2026-09-17 (review_followups.md:3788) — the PER-PHASE bound joins them ────
  //
  // `resolveInterval`'s own comment above says the literal "none" is "the same escape
  // `execution.phases[].timeout_minutes_from_config` already carries". It did not: the two
  // call sites below evaluated `Number(config[<declared name>])` bare, so `"none"` — and
  // equally a TYPO — resolved to NaN, `if (timeoutMs > 0)` was false (no `SET LOCAL
  // statement_timeout`), `startPhaseDeadline(..., NaN, ...)` took its `!timeoutMs` arm and
  // returned the no-op stub, and the phase logged `timeout NaNmin`. Three declared guards
  // unarmed and one nonsense log line, none of it distinguishable from a deliberate disable
  // — ER-D1 verbatim, one field over (Spec 48 §3.6).
  //
  // Resolved for EVERY declared phase HERE, above the advisory lock, for the same reason
  // resolveInterval is: a throw at the post_commit call site would fire AFTER the shared
  // transaction had already COMMITTED. `Number.isFinite`, never `!x` — a variable that
  // resolves to 0 is a deliberate disable, not a missing declaration (and `phaseTimeoutLabel`
  // below keeps it distinguishable from a descriptor-level `"none"`, which is a different and
  // permanent thing).
  // phase name → { ms, minutes: number|null, declaredNone: boolean }
  const phaseTimeouts = new Map();
  for (const phase of phases) {
    const varName = phase.timeout_minutes_from_config;
    if (varName === 'none' || varName === undefined || varName === null) {
      phaseTimeouts.set(phase.name, { ms: 0, minutes: null, declaredNone: true });
      continue;
    }
    const raw = config[varName];
    const minutes = Number(raw);
    const value = Math.round(minutes * 60000);
    if (!Number.isFinite(value)) {
      throw new Error(
        `${tag} execution.phases[${phase.name}].timeout_minutes_from_config names "${varName}", `
        + `which resolved to ${JSON.stringify(raw)}. A declared phase bound must resolve to a finite `
        + 'number; a non-finite value silently disabled BOTH the per-statement SET LOCAL '
        + 'statement_timeout and the wall-clock phase deadline it declares (Spec 48 §3.6, '
        + 'review_followups.md:3788). Declare the literal "none" to disable it deliberately.',
      );
    }
    phaseTimeouts.set(phase.name, { ms: value, minutes, declaredNone: false });
  }
  /**
   * Log fragment for a phase's declared bound — never the string "NaN".
   *
   * THREE STATES, THREE RENDERINGS (Regression Guardian, 2026-09-17). The first cut branched on
   * `ms > 0`, which folded a THIRD state into the `"none"` bucket: a variable that resolves to
   * the number 0. `scripts/seeds/logic_variables.json`'s `enrich_parcels_pass5_timeout_minutes`
   * documents `0 = disabled` as a legitimate, admin-settable value with `min: 0`, and
   * `enrich-parcels.descriptor.json`'s `optimal_config` phase consumes exactly that key — so an
   * operator setting it to 0 in the admin UI would have been told the DESCRIPTOR declared
   * `"none"`, which is a different and permanent thing. That is the same distinction
   * `step.schema.json` insists on for the sibling fields: the accident, the declaration and the
   * tunable must not render identically. So the branch is on WHERE the disable came from
   * (`declaredNone`), never on the value:
   *   descriptor literal `"none"` / field absent → `timeout disabled (declared "none")`
   *   variable resolved to 0                     → `timeout 0min`   (the pre-fix bytes)
   *   variable resolved to a finite N            → `timeout Nmin`   (the pre-fix bytes)
   * The last two keep the pre-fix wording BYTE-FOR-BYTE — the raw declared number, not a
   * round-trip through ms — so `enrich_parcels`' committed goldens cannot move on this fix.
   */
  const phaseTimeoutLabel = (phaseName) => {
    const { minutes, declaredNone } = phaseTimeouts.get(phaseName);
    return declaredNone ? 'timeout disabled (declared "none")' : `timeout ${minutes}min`;
  };

  const passRaw = {};
  let scopeInsertCount = 0;
  let sharedTxnLockDenied = false;
  // Observability fold — set by whichever phase loop's deadline fired; consumed by the
  // normal return below and turned into an audit row by runWithPool (§phaseDeadlineRows).
  let phaseDeadlineInfo = null;

  // ── EP-PASS3-BACKLOG (WF3, .cursor/wf3_enrich_parcels_pass3_backlog_active_task.md C1,
  // 2026-09-15) — RETIRE STALE FOREIGN SCOPE COHORTS AT STEP START.
  //
  // The scope hand-off ledger had no expiry. Its only consumer (`consumePendingScope`) and
  // its only pruner (the EP-D10 `consumed_at IS NOT NULL` DELETE) both sit at the END of
  // pass 5, so a run killed INSIDE pass 5 adds a full ~443,023-row cohort that no later run
  // ever retires: measured on cloud 2026-09-15, 886,046 rows / 2 cohorts / 100% unconsumed,
  // nothing ever consumed. Net effect per killed run: +443,023 permanently-unconsumed rows,
  // -0. The descriptor's own `pending_scope_parcels` WARN (bound 50,000) was 8.9x exceeded
  // and never fired — a check that only emits on runs that SUCCEED cannot report a condition
  // created by runs that FAIL.
  //
  // Run HERE — before the shared transaction opens, autocommit, its own statement — for two
  // reasons: (1) a run that dies in pass 5 has already done the hygiene, which is the whole
  // point; (2) the hand-off INSERT is deliberately INSIDE the shared txn (so a crash between
  // COMMIT and pass 5's read never silently drops scope-deferred work — Guardian fence 3),
  // and a DELETE joined into that same transaction would extend its xmin horizon for no gain.
  //
  // FAIL-OPEN: the retirement is hygiene, not the run's purpose. A failure is logged and the
  // step continues; the counters stay NULL, never 0 — "the retirement did not run" and "the
  // retirement retired nothing" are different states and must not render identically in the
  // audit table (Spec 48 §3.6).
  let scopeRetire = { backlog_rows: null, backlog_cohorts: null, retired_rows: null, retired_cohorts: null, retire_after_hours: null, cutoff_at: null };
  let scopeRetireError = null;
  const hasScopeLedger = specs.some((s) => s.write_discipline && s.write_discipline.class === 'insert_only_no_retraction');
  if (hasScopeLedger) {
    try {
      scopeRetire = await compute.retireStaleScope(pool, {
        runId: scopeRunId,
        ownRunId,
        retireAfterHours: Number(config.enrich_parcels_scope_retire_after_hours),
        now: runAt,
      });
      if (scopeRetire.retired_rows > 0) {
        log.warn(tag, `scope retirement: ${scopeRetire.retired_rows} unconsumed rows across ${scopeRetire.retired_cohorts} stale cohort(s) retired (backlog at step start: ${scopeRetire.backlog_rows})`);
      }
    } catch (err) {
      // `log.error(tag, ERR, ctx)` — the Error is the SECOND argument
      // (scripts/lib/pipeline.js:288); that is what preserves `stack` and the
      // auto-classified `error_type`. A rendered string there drops both silently.
      log.error(tag, err, { phase: 'scope_retire', note: 'scope retirement failed — continuing; the backlog is unchanged and every retirement counter reads NULL, not 0' });
      scopeRetire = { backlog_rows: null, backlog_cohorts: null, retired_rows: null, retired_cohorts: null, retire_after_hours: null, cutoff_at: null };
      // Observability fold (2026-09-15) — a log line is not observability. The failure
      // gets its OWN errored WARN row on the audit table (§scopeRetireFailureRows), and
      // `scope_backlog_at_step_start` is deliberately left UNREPORTED so it resolves to
      // "not reported by compute" at its DECLARED severity (WARN) rather than to a PASS
      // built on a measurement that never happened.
      scopeRetireError = err;
    }
  }

  // WF3 enrich_parcels double-run incident (2026-09-07) — the GENERIC outer lock
  // (`runWithPool`'s `withAdvisoryLock(pool, descriptor.identity.lock, ...)`, §4.1 ②)
  // acquires `pg_try_advisory_xact_lock(identity.lock)` on its OWN dedicated connection,
  // separate from the one `pipeline.withTransaction` opens here for the real shared-txn
  // work — exactly the SAME two-connection shape the LEGACY script used
  // (`pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => { ... await
  // pipeline.withTransaction(pool, ...) ... })`, `7e75c50e^:1872/2032` — NOT a fence this
  // conversion dropped; both had it). Measured live: the outer lock's connection died
  // (an external interruption) while this shared-txn's OWN connection kept running,
  // un-protected, for the REST of its 4 passes — and a SECOND invocation's outer lock
  // then legitimately re-acquired `identity.lock` (now released) and started a
  // CONCURRENT `--full` run against the same `parcels` rows.
  //
  // FIX (this connection ALSO holds a lock, tied to ITS OWN transaction): a two-key
  // advisory lock `(identity.lock, ENRICH_INNER_LOCK_SUBKEY)` — a lock ID DISTINCT from
  // the outer's single-key `identity.lock`, so this does not self-conflict with the
  // outer lock this SAME process already holds. Coupled to THIS connection/transaction
  // (`pg_try_advisory_xact_lock`, auto-released at COMMIT/ROLLBACK/disconnect): if this
  // connection dies, the lock dies with it — but critically, if the OUTER lock's
  // connection dies FIRST while this one is still working, a second invocation's own
  // attempt at this SAME two-key lock (from its own shared-txn client) now correctly
  // reports `false` and self-skips, because THIS connection still holds it. The failure
  // mode closed is "a second worker starts while a first is still genuinely working" —
  // not "this worker's own death is undone" (nothing can undo that; Rule 12 truthful
  // crash posture applies as it always did).
  const ENRICH_INNER_LOCK_SUBKEY = 1;

  // ── batch-2 Phase 0.10 — THE ENRICHER WRITE SEAMS (class-O retraction, class-N
  // join update). REACHABILITY GROWTH ONLY: `enrich_parcels` declares neither class
  // and `recovery.before_image: "none"`, so not one line of its path changes.
  //
  // Before 0.10 the enrich path reached NO write executor at all — `write.` appeared
  // in this runner only as `assertWritePrivileges`/`targetKey`, so
  // `recovery.before_image: "generated"` was a NO-OP on an enrich-shaped step
  // (honoured only in runLinkPhase/runCascadePhase/runLinkKeyedPhase) and a declared
  // class-O target could be retracted with no audit trail at all. `geocode_permits`
  // (batch-2 Phase 0.9 I5) is the first enrich-shaped step to need it, and the idiom
  // is established HERE, under a lock, not discovered inside a conversion commit.
  //
  // INJECTED VIA passCtx, mirroring `stream`/`flushBatch` (Spec 122 §5.5): compute
  // stays JUST compute (SQL + scope authorship), while the transaction boundary, the
  // before-image, the class check and the counters stay the RUNNER's job (Rule 2).
  // The scope params come from the PASS, because only the pass knows which rows it
  // is retracting — a runner-driven blanket retraction would be a behaviour no
  // descriptor could parameterise.
  const beforeImage = [];
  const seamTarget = (writesRef, seam) => {
    const spec = specs[writesRef];
    if (!spec) {
      throw new Error(`${tag} ctx.${seam}(${writesRef}) — outputs.writes[${writesRef}] is not declared (this step declares ${specs.length} write target(s))`);
    }
    return spec;
  };
  const makeWriteSeams = (client) => ({
    /** class O — `set_based_null_retract` (or any target declaring retract all/departed). */
    retract: async (writesRef, scopeParams) => {
      const spec = seamTarget(writesRef, 'retract');
      const cls = (spec.write_discipline && spec.write_discipline.class) || 'none';
      if (cls !== 'set_based_null_retract' && spec.retract !== 'all' && spec.retract !== 'departed') {
        throw new Error(
          `${tag} ctx.retract(${writesRef}) — outputs.writes[${writesRef}] declares write_discipline.class "${cls}" and `
          + `retract ${JSON.stringify(spec.retract ?? null)}. Only a class-O target (set_based_null_retract, or retract `
          + '"all"/"departed") may be retracted; a seam that widened itself to any class would make the declared write '
          + 'discipline decorative (Rule 1).',
        );
      }
      // R-M — a retraction with no before image is refused, not silently un-imaged.
      const recovery = descriptor.recovery;
      const declared = recovery && recovery !== 'none' ? recovery.before_image : undefined;
      if (declared !== 'generated') {
        throw new Error(
          `${tag} ctx.retract(${writesRef}) — recovery.before_image is ${JSON.stringify(declared ?? null)}, not "generated". `
          + 'R-M: a destructive retraction must carry a before image; declare it, or do not retract.',
        );
      }
      const plan = write.buildWritePlan(spec, descriptor);
      // DELIBERATELY UNWRAPPED (R-M, and the shape runCascadePhase already proves):
      // a failed before-image FAILS the run BEFORE anything is retracted. A try/catch
      // here would be the silent-skip this mechanism exists to make impossible.
      const bi = await write.writeBeforeImage(client, plan, scopeParams || [], descriptor.identity.name, runAt);
      if (bi.written) beforeImage.push({ ...bi, table: plan.table });
      const retracted = await write.executeSetBasedClear(client, plan, scopeParams || []);
      const key = write.targetKey(writesRef);
      written[key].retracted += retracted;
      written[key].rows_changed += retracted;
      seamOwned.add(key);
      return retracted;
    },
    /** class N — `set_based_join_update`; the executor structurally refuses INSERT/ON CONFLICT text. */
    joinUpdate: async (writesRef, sql, params) => {
      const spec = seamTarget(writesRef, 'joinUpdate');
      const cls = (spec.write_discipline && spec.write_discipline.class) || 'none';
      if (cls !== write.JOIN_UPDATE_CLASS) {
        throw new Error(
          `${tag} ctx.joinUpdate(${writesRef}) — outputs.writes[${writesRef}] declares write_discipline.class "${cls}", `
          + `not "${write.JOIN_UPDATE_CLASS}". The executor's structural refusal of INSERT/ON CONFLICT text is what makes `
          + 'a declared insert-free contract enforceable rather than merely stated; routing another class through it '
          + 'would assert a contract that target never declared.',
        );
      }
      const n = await write.executeSetBasedJoinUpdate(client, sql, params || []);
      const key = write.targetKey(writesRef);
      written[key].updated += n;
      written[key].rows_changed += n;
      seamOwned.add(key);
      return n;
    },
  });

  // EP-D12 fix (pilot 9 commit 8 P8, 2026-09-08) — a DEDICATED, PRE-ACQUIRED, autocommit
  // client for heartbeat/stall_diagnostic writes only, held for this call's ENTIRE
  // lifetime (both the shared-txn phase loop and the post_commit phase loop) and released
  // in the `finally` below. Cloud evidence (pipeline_runs row 4429, live): `current_pass`/
  // `last_heartbeat_at` stayed NULL for the whole run — recordHeartbeat/
  // captureStallDiagnostic already called `pool.query(...)` (a checked-out-then-returned
  // connection per call, never the phase's own pinned `client`/`postClient`), but under
  // cloud's tighter Supavisor-pooled connection ceiling that per-call checkout can queue
  // behind the phase's own long-held connection(s) — invisible-until-released is
  // observably identical to invisible-until-COMMIT from an external monitor's point of
  // view. A client acquired ONCE, up front, and held for the duration cannot starve on a
  // later checkout the way a fresh per-call `pool.query()` can. Never used for BEGIN/
  // COMMIT/ROLLBACK — every write on it is its own autocommit statement, visible to any
  // other session (including this same process's own monitoring query) the instant it
  // executes, regardless of whether the phase's own transaction is still open.
  const heartbeatClient = await pool.connect();
  // F5 (output panel, 2026-09-09) — STEP-LEVEL, cumulative across every phase (shared-txn
  // and post_commit alike) — never reset per-phase. `currentPhaseName` names whichever phase
  // is running RIGHT NOW so the whole-step ticker's own ticks attribute correctly.
  let rowsProcessed = 0;
  let currentPhaseName = null;
  const stopHeartbeatTicker = startHeartbeatTicker(heartbeatClient, ownRunId, () => currentPhaseName, heartbeatMs, () => rowsProcessed);
  try {
  // Spec 124 R-AV (batch-2 row 2.6) — the shared-txn region, INCLUDING the scope hand-off
  // `INSERT` further down, is skipped WHOLE under `dryRun`. Same shape as `runLinkPhase`'s
  // own `if (rows.length > 0 && !dryRun)` / `runLinkKeyedPhase`'s `if (!dryRun) { … }`: the
  // surrounding try/.catch (lock-denial self-skip, deadline capture) and the heartbeat/ticker
  // lifecycle stay OUTSIDE the gate, so the audit assembly still emits its `dry_run_no_writes`
  // row on a truthful run. The write seams (`ctx.joinUpdate`/`ctx.retract`) are simply never
  // constructed, which is what makes them unreachable — no second check inside them.
  if (!dryRun) {
  await pipeline.withTransaction(pool, async (client) => {
    const lockRow = await client.query(
      'SELECT pg_try_advisory_xact_lock($1, $2) AS acquired',
      [descriptor.identity.lock, ENRICH_INNER_LOCK_SUBKEY],
    );
    if (!lockRow.rows[0].acquired) {
      throw Object.assign(
        new Error(`${tag} shared-txn phases: advisory lock (${descriptor.identity.lock}, ${ENRICH_INNER_LOCK_SUBKEY}) held elsewhere`),
        { advisoryLockDenied: true },
      );
    }
    const pidRow = await client.query('SELECT pg_backend_pid() AS pid');
    const pid = pidRow.rows[0] ? Number(pidRow.rows[0].pid) : null;
    for (const phase of sharedPhases) {
      // Spec 122 §7.2 — SET LOCAL is scoped to THIS transaction and reverts at
      // COMMIT/ROLLBACK; re-issued per phase so a future descriptor giving
      // different phases different timeout config names is honoured without
      // further runner changes (today all four share one name).
      // WF3 2026-09-17 — resolved ABOVE the lock (phaseTimeouts), finite-or-throw. Was
      // `Number(config[phase.timeout_minutes_from_config])` here, which made a typo and the
      // declared "none" the same silent NaN (review_followups.md:3788).
      const { ms: timeoutMs, minutes: timeoutMinutes } = phaseTimeouts.get(phase.name);
      if (timeoutMs > 0) await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
      if (lockTimeoutMs > 0) await client.query(`SET LOCAL lock_timeout = ${lockTimeoutMs}`);
      const passSpec = passByName(phase.name);
      // F5 (output panel) — onProgress added for parity with post_commit's own passCtx; none
      // of the four shared-txn passes calls it today — the whole-step ticker still advances
      // last_heartbeat_at every tick regardless (its own tick does not require a progress
      // update, only a live phase name), closing the silence gap by itself.
      //
      // CORRECTED (EP-PHASE-DEADLINE, WF3 2026-09-15) — this comment previously read "the 4
      // shared-txn passes are each a single set-based SQL statement with no natural per-batch
      // progress point". That was FALSE, and the false premise is why a per-STATEMENT timeout
      // was believed to be a phase bound. Counted in scripts/lib/compute/enrich-parcels.js:
      //   zoning             (runPass1) — DROP TEMP + CREATE TEMP + stats + UPDATE
      //   max_build          (runPass2) — DROP TEMP + CREATE TEMP + stats + UPDATE + stamp
      //   existing_structure (runPass3, :987-1009) — FIVE statements: DROP TABLE, the
      //                       CREATE TEMP TABLE, the 16-way COUNT(*) FILTER stats query, the
      //                       parcels UPDATE, the scenario UPDATE
      //   comparable_builds  (runPass4) — EIGHT statements
      // Postgres re-arms `statement_timeout` on EVERY statement, so a declared 75-min bound
      // gave existing_structure an effective 375-min ceiling and comparable_builds 600 —
      // neither was ever capable of firing. `SET LOCAL statement_timeout` is a correct
      // PER-STATEMENT guard and is KEPT; it is not, and never was, a phase bound. The
      // wall-clock phase deadline armed below is what bounds the phase.
      const passCtx = { full, scopeWhere: 'TRUE', staleOverlays, contract, clock, log, config, scopeRunId, onProgress: (n) => { rowsProcessed = n; }, ...makeWriteSeams(client) };
      // WF3 enrich_parcels stall incident (2026-09-07, orchestrator observation) — Spec 48 §3.6
      // silence class: with NO per-phase log line, a `--full` run's own stdout goes silent from
      // the single startup INFO line until the whole step finishes (measured live: a real,
      // healthy 60+-min pass-2 run produced zero further stdout). This is the runner's own
      // boundary logging, independent of (and in addition to) recordHeartbeat's DB-only writes —
      // an operator tailing a log, or this pilot's own golden-capture harness (which tees child
      // stdout live, confirmed not itself at fault), needs a visible phase start/end + duration.
      log.info(tag, `phase ${phase.name} starting (shared txn, ${phaseTimeoutLabel(phase.name)})`);
      const phaseStartMs = Date.now();
      currentPhaseName = phase.name;
      await recordHeartbeat(heartbeatClient, ownRunId, phase.name, rowsProcessed);
      const stopTicker = startStallTicker(heartbeatClient, ownRunId, heartbeatMs, () => pid);
      // EP-PHASE-DEADLINE — the phase bound the declaration always claimed to be. Armed
      // from the SAME `timeout_minutes_from_config` value the `SET LOCAL` above uses (one
      // declared number, two scopes: per statement AND per phase), on the heartbeat client
      // (a connection distinct from `client`, which is the one that will be cancelled).
      const deadline = startPhaseDeadline(heartbeatClient, pid, timeoutMs, { phase: phase.name, tag, log });
      try {
        // WF3 stall commit 1 — a SET LOCAL-triggered abort dies LOUD with the
        // phase's OWN name (Spec 115 §2.2 fail-safe-loud), never a bare
        // 57014/55P03 postgres error that names none of the five phases.
        passRaw[phase.name] = await (async () => {
          try {
            return await passSpec.run(client, passCtx, config);
          } catch (err) {
            if (err && (err.code === '57014' || err.code === '55P03')) {
              // EP-PHASE-DEADLINE — a cancel and a statement timeout arrive as the SAME
              // SQLSTATE (57014). `deadline.fired()` is what distinguishes them, and the
              // distinction is the whole diagnostic value: "this ONE statement ran past
              // 75min" and "this PHASE's statements summed past 75min" are different
              // defects with different remedies. The elapsed ms is named because the
              // declared bound alone does not say how far past it the phase got.
              const kind = err.code === '55P03'
                ? 'lock_timeout'
                : (deadline.fired() ? 'phase_deadline' : 'statement_timeout');
              const elapsedMs = Date.now() - phaseStartMs;
              const wrapped = new Error(`${tag} ${phase.name} aborted by ${kind} after ${elapsedMs}ms (declared bound ${timeoutMinutes}min): ${err.message}`);
              wrapped.code = err.code;
              // Not a boolean flag — the PAYLOAD the audit row is built from, consumed by
              // the `.catch` below (Guardian fold: no write-only fields).
              if (kind === 'phase_deadline') {
                wrapped.phaseDeadline = { phase: phase.name, txn: 'shared', elapsedMs, boundMinutes: timeoutMinutes, message: wrapped.message };
              }
              wrapped.cause = err;
              throw wrapped;
            }
            throw err;
          }
        })();
      } finally {
        // Cleared on EVERY exit path, success or throw — an un-cleared timer would fire
        // against a pid that is no longer running THIS phase's statement (the (f) inverse
        // lock in src/tests/steps/enrich_parcels/violations.test.ts holds the step open
        // past the tightest armed deadline to prove no timer leaks past its own phase).
        deadline.stop();
        stopTicker();
      }
      // F5 (output panel) — the real cumulative step-level count, never the literal `1`
      // (which would clobber whatever the periodic ticker/onProgress already advanced it to).
      await recordHeartbeat(heartbeatClient, ownRunId, phase.name, rowsProcessed);
      log.info(tag, `phase ${phase.name} completed in ${Date.now() - phaseStartMs}ms`);
    }

    // ── Spec 122 §3.0b scope hand-off — the ENRICHER's one LOGGED recovery
    // ledger, left inside THIS transaction by design (a crash between commit
    // and pass 5's own read never silently drops scope-deferred work). Found
    // structurally (write_discipline.class), never by table-name string match
    // — the same lookup shape runCascadePhase uses for its own class-scoped
    // write targets.
    const scopeTarget = specs.find((s) => s.write_discipline.class === 'insert_only_no_retraction');
    const massingTarget = sharedPhases.find((p) => p.name === 'max_build');
    if (scopeTarget && massingTarget) {
      const ins = await client.query(
        `INSERT INTO ${scopeTarget.table} (run_id, parcel_id)
         SELECT $1, e.pid FROM parcel_max_build e
         WHERE e.max_buildable_footprint_sqm IS NOT NULL
         ON CONFLICT (run_id, parcel_id) DO NOTHING`,
        [scopeRunId],
      );
      scopeInsertCount = ins.rowCount || 0;
    }
  }).catch((err) => {
    // The inner lock-denial signal above stops here — a clean, honest self-skip
    // (mirrors the outer `withAdvisoryLock`'s own `{acquired:false}` semantics),
    // never a crash. Every OTHER error (a genuine pass failure, a 55P03 lock
    // timeout, a per-STATEMENT 57014) is rethrown UNCHANGED.
    if (err && err.advisoryLockDenied) { sharedTxnLockDenied = true; return; }
    // Observability fold (2026-09-15) — A PHASE-DEADLINE ABORT IS LOUD *ON THE AUDIT
    // TABLE*, not merely loud in the process's exit code. Until this arm existed the
    // wrapped 57014 escaped all the way to `runWithPool`'s outer catch, which sets
    // `status = FAILED` and an `error_message` but builds NO `records_meta` and NO
    // `audit_table` at all — so the run that the deadline fired on was the ONE run whose
    // own record said nothing about why, and `scope_backlog_at_step_start` (a
    // `when:"post"` check) could only ever surface on this path. The abort is captured
    // here, the post_commit loop is skipped, and the normal return below still builds
    // `matched` — from a transaction that ROLLED BACK, so every write counter honestly
    // reads 0. `runWithPool` turns this into one `errored: true` FAIL row
    // (§phaseDeadlineRows), and the row-derived cascade does the rest — a FAIL verdict then
    // yields RUN_STATUS.FAILED plus the `fail_check` terminal, with the error_message
    // preserved. No new boolean, no second derivation, no swallowed halt.
    // (Deliberately phrased so the word above is never followed by a colon or an equals
    // sign: Rule 10's own checker, `step-validate.mjs`'s VERDICT_SITE_RE, scans this
    // library for verdict DERIVATIONS by text and cannot tell a sentence from an
    // assignment — prose shaped like one reads as an unsanctioned second derivation and
    // hard-stops EVERY scorecard in the estate, not just this step's. Found by the
    // Idempotency/Integration fold, 2026-09-15; the checker's own blind spot is filed.)
    //
    // This CONSUMES `wrapped.phaseDeadline` (Guardian fold: no write-only fields). Only
    // a deadline abort carries it; an ordinary per-statement 57014 does not and is
    // rethrown unchanged, exactly as before — the generic raw-throw gap stays DECLARED,
    // untouched by this fold.
    if (err && err.phaseDeadline) { phaseDeadlineInfo = err.phaseDeadline; return; }
    throw err;
  });
  } // end `if (!dryRun)` — shared-txn write region (Spec 124 R-AV)
  if (sharedTxnLockDenied) {
    return {
      matched: {}, written, prior, overrides, writeSkipped: false, skipped: true,
      lockDenied: true,
    };
  }

  // ── POST-COMMIT PHASE(S) (Spec 78 §P3A.1) — a DEDICATED connection, its OWN
  // transaction (Fold B2): a live SET LOCAL needs an open transaction to bind
  // to, and wrapping the pass in one txn is what makes the bound provable via
  // SHOW on the SAME session, never by inspecting the config value back.
  //
  // WF3 enrich_parcels pass-5 stream/write deadlock (2026-09-07, root-cause fix —
  // see streamOverClient's own doc comment for the full mechanism + live reproduction):
  // `streamClient` is a SEPARATE, dedicated `pool.connect()`'d client used ONLY for
  // `ctx.stream`'s cursor. `postClient` (this loop's BEGIN/SET LOCAL/COMMIT transaction)
  // is reserved for writes — the two must never be the same object, or a write issued
  // mid-stream queues behind the open cursor and hangs forever (H1, proven live).
  try {
  // Observability fold — a shared-txn phase that blew its deadline STOPS THE STEP. The
  // transaction rolled back, so pass 5 would be recomputing against un-enriched columns;
  // running it anyway would spend another hour producing values derived from work that no
  // longer exists. The audit table is still built below, with the abort row on it.
  //
  // Spec 124 R-AV (batch-2 row 2.6) — `dryRun` empties this loop on the SAME reasoning as
  // the phase-deadline arm above: a phase is a WRITE region (its `passCtx.flushBatch` is a
  // BEGIN/COMMIT and its seams bind `postClient`), so a dry run runs NONE of them. The
  // try/.catch (lock-denial self-skip, deadline capture) stays outside the gate, exactly as
  // it does for the shared-txn region.
  for (const phase of (dryRun || phaseDeadlineInfo ? [] : postCommitPhases)) {
    const passSpec = passByName(phase.name);
    // WF3 2026-09-17 — same map, same finite-or-throw resolution as the shared-txn loop above.
    // Resolving it HERE would have been worse than at :3216: this loop runs AFTER the shared
    // transaction has COMMITTED, so a throw on a mis-declared name would fire post-commit.
    const { ms: timeoutMs, minutes: timeoutMinutes } = phaseTimeouts.get(phase.name);
    const postClient = await pool.connect();
    let streamClient = null;
    let lockAcquired = false;
    // EP-D16 (WF3 C3, 2026-09-09) — a SESSION-level `SET statement_timeout` on `postClient`,
    // right after `pool.connect()`, so EVERY autocommit statement this phase issues inherits
    // the declared bound: `consumePendingScope`'s own SELECT/UPDATEs, the ineligibility reset,
    // the citywide backstop check, and the EP-D10 prune DELETE — not just `flushBatch`'s own
    // per-batch `SET LOCAL` (kept below as defence in depth, since a batch's own short
    // transaction is a strictly narrower scope than the whole phase). Before this fix the
    // declared `enrich_parcels_pass5_timeout_minutes` bound (execution.phases[].
    // timeout_minutes_from_config) was READ but applied ONLY inside `flushBatch`'s BEGIN/COMMIT
    // — every other statement on `postClient` ran with NO timeout at all, inheriting
    // `PIPELINE_STATEMENT_TIMEOUT_MS`'s own default of 0 (unbounded) — the mechanism behind the
    // 2026-09-09 pass-5 wedge that could not die (EP-D14). Restored (re-`SET`, never `RESET`
    // — F1 below) in the `finally` before `.release()` — a session-level SET is not
    // auto-cleared like `SET LOCAL` at COMMIT, and this connection returns to the pool for
    // reuse by a later phase/caller. Issued INSIDE the try (F4, output panel 2026-09-09) — a
    // throw from this SET itself, before this fix, skipped the `finally` entirely and leaked
    // `postClient` (never released).
    try {
      if (timeoutMs > 0) await postClient.query(`SET statement_timeout = ${timeoutMs}`);
      let pid = null;
      // WF3 enrich_parcels double-run incident (2026-09-07) — same reasoning as the
      // shared-txn phases above: the outer `withAdvisoryLock` connection can die while
      // this phase is still working, since the outer lock is XACT-scoped and this phase
      // runs on ITS OWN dedicated connection (`postClient`, opened after the shared txn
      // already COMMITted — the shared-txn's own two-key lock is ALSO already released
      // by COMMIT, so there is nothing left to "re-check"; this connection must acquire
      // its OWN copy). Same two-key sub-lock, same subkey (the shared-txn phase and this
      // one never run concurrently within one invocation, so reusing the subkey is safe).
      // EP-D13 H1 fix (pilot 9 commit 8 P9, 2026-09-08): now SESSION-scoped
      // (`pg_try_advisory_lock`, not the `_xact_` variant) — this phase's write side no
      // longer runs inside one wrapping transaction (see `flushBatch` below, each batch
      // is its own short BEGIN/COMMIT), so an xact-scoped lock would release after the
      // FIRST batch's own COMMIT, leaving every subsequent batch unprotected. Explicitly
      // released via `pg_advisory_unlock` in the `finally` below — a session lock is
      // NOT auto-released at any one batch's COMMIT/ROLLBACK, only at explicit unlock or
      // full disconnect, so a leaked lock would otherwise persist across this pooled
      // connection's NEXT reuse by a different client.
      const postLockRow = await postClient.query(
        'SELECT pg_try_advisory_lock($1, $2) AS acquired',
        [descriptor.identity.lock, ENRICH_INNER_LOCK_SUBKEY],
      );
      lockAcquired = !!postLockRow.rows[0].acquired;
      if (!lockAcquired) {
        throw Object.assign(
          new Error(`${tag} post_commit phase "${phase.name}": advisory lock (${descriptor.identity.lock}, ${ENRICH_INNER_LOCK_SUBKEY}) held elsewhere`),
          { advisoryLockDenied: true },
        );
      }
      const pidRow = await postClient.query('SELECT pg_backend_pid() AS pid');
      pid = pidRow.rows[0] ? Number(pidRow.rows[0].pid) : null;
      const streamBatchSize = Number(config.enrich_parcels_pass5_stream_batch_size);
      // Connected eagerly (mirrors postClient above) rather than lazily inside the
      // `stream:` closure — an async generator cannot itself `await` a connect() before
      // yielding without an extra wrapper layer, and every post-commit phase today does
      // stream, so there is no live no-op case this would needlessly cost a connection on.
      streamClient = await pool.connect();
      // EP-D13 H1 fix (P9) — `flushBatch` replaces the single wrapping transaction that
      // held ALL ~2,200 batches' worth of writes open for the pass's ENTIRE duration
      // (measured: hit the 300-min cloud budget, run 34231689122, still in pass 5).
      // Each call is its OWN short transaction (`git show 7e75c50e^`'s legacy
      // `flushOptConfigBatch(pool, ...)` fence: every batch there was its own independent
      // autocommit `pool.query()`, never wrapped in a transaction at all — this restores
      // that same per-batch commit boundary, with a per-batch SET LOCAL safety net legacy
      // never had). Injected via `passCtx`, mirroring `stream`'s own seam-injection
      // pattern (Spec 122 §5.5) — compute stays JUST compute (SQL authorship only),
      // transaction boundaries stay the runner's job (Rule 2).
      const flushBatch = async (sql, params) => {
        await postClient.query('BEGIN');
        try {
          if (timeoutMs > 0) await postClient.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
          if (lockTimeoutMs > 0) await postClient.query(`SET LOCAL lock_timeout = ${lockTimeoutMs}`);
          const result = await postClient.query(sql, params);
          await postClient.query('COMMIT');
          return result;
        } catch (err) {
          await postClient.query('ROLLBACK').catch(() => {});
          throw err;
        }
      };
      // EP-D15 (WF3 C4) — the progress accumulator `ctx.onProgress(n)` writes into.
      // Runner-owned (Rule 2: compute stays JUST compute) — a pass MAY call it after
      // each unit of committed work; if it never does, this simply stays whatever it last
      // was and the periodic heartbeat keeps writing that, which is itself an honest signal
      // (silence-safe, never throws, never blocks the pass on a missed call).
      // F5 (output panel) — `rowsProcessed`/`onProgress`/the heartbeat ticker are now
      // STEP-LEVEL (declared once, before the shared-txn loop, per §2460 above) so the
      // count is cumulative across every phase and one ticker instance covers this phase
      // too — no per-phase re-declaration here.
      const passCtx = {
        full, scopeWhere: 'TRUE', staleOverlays, contract, clock, log, config, scopeRunId,
        stream: (sql, params, opts) => streamOverClient(streamClient, sql, params, { batchSize: streamBatchSize, ...opts }),
        flushBatch,
        onProgress: (n) => { rowsProcessed = n; },
        // batch-2 Phase 0.10 — the same two seams as the shared-txn passes, bound to
        // THIS phase's own dedicated connection. A post_commit pass runs autocommit
        // (each `flushBatch` is its own short transaction), so a retraction issued
        // here commits on its own — which is exactly why the before-image, written
        // strictly first and unwrapped, is the only recoverable record of the prior
        // values on this path.
        ...makeWriteSeams(postClient),
      };
      // EP-D15 (WF3 C4, 2026-09-09) — mirrors the shared-txn phases' own boundary logging
      // (:2452/:2478) — the post_commit loop previously had NEITHER line, so pass 5's
      // duration appeared in no log and no golden capture (post/sources_run1.json carried
      // 4 phase lines, not 5).
      log.info(tag, `phase ${phase.name} starting (post_commit, ${phaseTimeoutLabel(phase.name)})`);
      const phaseStartMs = Date.now();
      currentPhaseName = phase.name;
      await recordHeartbeat(heartbeatClient, ownRunId, phase.name, rowsProcessed);
      const stopTicker = startStallTicker(heartbeatClient, ownRunId, heartbeatMs, () => pid);
      // EP-PHASE-DEADLINE (Observability fold, 2026-09-15) — the post_commit phase gets the
      // SAME wall-clock deadline (and the same re-arm) as the shared-txn phases. It is the
      // phase cloud run 4911 actually died in: `optimal_config` survived >1,900 s past its
      // declared 60-min bound because EP-D16's session-level `SET statement_timeout` is
      // still PER STATEMENT over a batched loop — it bounds one batch, never the pass.
      // Arming it here is strictly additive to that guard, not a replacement: `flushBatch`'s
      // own per-batch `SET LOCAL` and the session-level `SET`/restore path (EP-D16 F1,
      // Guardian fence 5) are untouched. A cancel that lands mid-`flushBatch` aborts that
      // batch, which ROLLBACKs and rethrows through the same wrapper; batches already
      // COMMITted stay committed, exactly as any other pass-5 failure.
      const deadline = startPhaseDeadline(heartbeatClient, pid, timeoutMs, { phase: phase.name, tag, log });
      try {
        passRaw[phase.name] = await (async () => {
          try {
            return await passSpec.run(postClient, passCtx, config);
          } catch (err) {
            if (err && (err.code === '57014' || err.code === '55P03')) {
              const kind = err.code === '55P03'
                ? 'lock_timeout'
                : (deadline.fired() ? 'phase_deadline' : 'statement_timeout');
              const elapsedMs = Date.now() - phaseStartMs;
              const wrapped = new Error(`${tag} ${phase.name} aborted by ${kind} after ${elapsedMs}ms (declared bound ${timeoutMinutes}min): ${err.message}`);
              wrapped.code = err.code;
              if (kind === 'phase_deadline') {
                wrapped.phaseDeadline = { phase: phase.name, txn: 'post_commit', elapsedMs, boundMinutes: timeoutMinutes, message: wrapped.message };
              }
              wrapped.cause = err;
              throw wrapped;
            }
            throw err;
          }
        })();
      } finally {
        deadline.stop();
        stopTicker();
      }
      // F5 (output panel) — the real cumulative step-level count, never the literal `1`
      // (which would clobber whatever the periodic ticker/onProgress already advanced it to).
      await recordHeartbeat(heartbeatClient, ownRunId, phase.name, rowsProcessed);
      log.info(tag, `phase ${phase.name} completed in ${Date.now() - phaseStartMs}ms`);
      // No outer COMMIT/ROLLBACK here — every batch already committed (or rolled back)
      // on its own via `flushBatch`; a genuine failure above leaves whatever batches
      // already succeeded COMMITted, matching legacy's own partial-progress-preserved
      // behaviour (never one giant all-or-nothing rollback of ~90 minutes of work).
    } finally {
      if (lockAcquired) {
        await postClient.query('SELECT pg_advisory_unlock($1, $2)', [descriptor.identity.lock, ENRICH_INNER_LOCK_SUBKEY]).catch(() => {});
      }
      // EP-D16 (C3) — RESTORE before release: a session-level SET statement_timeout must not
      // leak onto whoever reuses this pooled connection next.
      // F1 (output panel, 2026-09-09) — `RESET statement_timeout` reverts to the SERVER
      // session default (2min on cloud, tasks/lessons.md:82), NOT to the pool's own
      // PIPELINE_STATEMENT_TIMEOUT_MS bound: `withPipelineStatementTimeout`'s `configured`
      // WeakSet guard means the wrapped `pool.connect()` never re-issues its own `SET` for an
      // already-configured client, so nothing else would put the pool's bound back. The next
      // caller to check this client out of the pool (e.g. the citywide `COUNT(*)` on
      // `parcels`, `pool.query(...)` at :2722) would silently inherit the 2-min cloud default
      // instead. Re-`SET` to the pool's own resolved value explicitly instead.
      // The resolver is called through the module-top alias `getPoolStatementTimeoutMs` (not
      // `pipeline.getPoolStatementTimeoutMs`) on purpose: generate-template-freeze.mjs's
      // LIBRARY_CALL_RE treats EVERY `pipeline.<fn>(` inside a runner as a frozen phase-order
      // entry, and a config-value getter is not a phase (filed LOW: the extractor should list
      // phase functions explicitly). A failed restore must not hand a capped connection back to
      // the pool silently: log it and destroy the client so the pool discards it (lessons:82).
      let restoreFailed = false;
      if (timeoutMs > 0) {
        try {
          await postClient.query(`SET statement_timeout = ${getPoolStatementTimeoutMs()}`);
        } catch (restoreErr) {
          restoreFailed = true;
          log.warn(tag, `pass-5 statement_timeout restore failed (${restoreErr.message}) — destroying the post_commit client so the pool never reuses it capped`);
        }
      }
      if (streamClient) streamClient.release();
      postClient.release(restoreFailed ? new Error('pass-5 statement_timeout restore failed — client destroyed, not pooled') : undefined);
    }
  }
  } catch (err) {
    // Same contract as the shared-txn phases above: the lock-denial signal is a clean,
    // honest self-skip, never a crash. Every other error (statement_timeout, lock_timeout,
    // a genuine pass failure) is rethrown UNCHANGED.
    if (err && err.advisoryLockDenied) {
      return {
        matched: {}, written, prior, overrides, writeSkipped: false, skipped: true,
        lockDenied: true,
      };
    }
    // Observability fold — same contract as the shared-txn `.catch` above: a phase-deadline
    // abort falls through to the normal return so the audit table is still BUILT (with
    // whatever passes 1-4 committed before it, which on this path is real, committed work),
    // and runWithPool renders it as one errored FAIL row. Every other error is rethrown
    // UNCHANGED.
    if (err && err.phaseDeadline) { phaseDeadlineInfo = err.phaseDeadline; }
    else throw err;
  }

  // ── STEP-LEVEL POST PHASE — the fully-committed tables, on `pool` ─────────
  //
  // batch-2 Phase 0.10b. Everything between here and the `matched` assembly used to be
  // ~80 lines of `enrich_parcels`: three unconditional `SELECT COUNT(*) … FROM parcels`
  // queries every ENRICHER paid for and only one could use, five pass-result lookups by
  // LITERAL pass name (a step whose passes are named anything else got five `{}`s and a
  // row of zeros), a hand-written ~30-key `matched` literal with no per-step contribution
  // seam, and an UNGUARDED `compute.computeAggregateRecordsUpdated(...)`. 0.10 generalised
  // the PRE-phase hooks, the write seams and the per-target counters; this completes the
  // same job for the post-phase, by the same mechanism — a DECLARED, optional compute
  // export — rather than by a second, differently-shaped one.
  //
  // Called HERE, outside the try/catch above, on purpose and unchanged from the retired
  // code's position: a phase-deadline abort falls THROUGH to this point so the audit table
  // is still BUILT over whatever passes committed before it.
  //
  // ⚠️ HONEST LIMIT ON THE FIX (output-panel Observability seat, 2026-09-16, MED — stated
  // rather than glossed). Resolving the hook NAME above the phases fixes the failure mode
  // that actually bit: a mis-DECLARED hook now throws before any work. But the three
  // SHAPE validations below — reserved-key collision, non-object return, non-finite
  // `compute.*` — can only fire once the hook has RUN, which is here, after COMMIT. They
  // are three NEW failure surfaces this row introduces (no validation of a hook's return
  // value existed before it), and a raw throw from this position inherits the library's
  // DECLARED GAP: `runWithPool` never assigns `recordsMeta` on that path, so the ledger
  // row carries `status='failed'` + `error_message` and ZERO audit rows — unlike the two
  // purpose-built post-commit precedents beside it (`phaseDeadlineRows`,
  // `scopeRetireFailureRows`), which synthesize a row precisely so an operator can read
  // one. That gap is archetype-generic, accepted and pinned
  // (`src/tests/step-library.logic.test.ts` — "DECLARED GAP: a raw compute throw emits
  // ZERO audit rows"), so it is not widened here; but it is not closed here either, and a
  // hook author should know that a malformed return costs the run its audit table.
  const postPhase = postPhaseFn
    ? await postPhaseFn(pool, { passRaw, specs, full, runAt, config, descriptor, staleOverlays })
    : {};
  if (postPhase === null || typeof postPhase !== 'object' || Array.isArray(postPhase)) {
    throw new Error(
      `${tag} execution.enrich_hooks.post_phase ("${postPhaseHook}") returned `
      + `${Array.isArray(postPhase) ? 'an array' : JSON.stringify(postPhase)}. The contract is a plain object `
      + '`{matched?, compute?}`; anything else has no declared meaning (Rule 1).',
    );
  }

  // The RUNNER owns these keys and ONLY these. A hook returning one of them would either be
  // silently overwritten or silently overwrite the runner, and both are a declaration that
  // lies — so a collision THROWS, naming the key, rather than picking a winner in silence.
  const runnerOwnedMatchedKeys = new Set([
    'passes', 'compute', 'before_image', `${descriptor.identity.name}_duration_ms`,
    'scope_backlog_at_step_start', 'scope_retired_rows', 'scope_retired_cohorts', 'scope_retire_window',
  ]);
  const hookMatched = postPhase.matched === undefined ? {} : postPhase.matched;
  if (hookMatched === null || typeof hookMatched !== 'object' || Array.isArray(hookMatched)) {
    throw new Error(
      `${tag} execution.enrich_hooks.post_phase returned a \`matched\` that is not a plain object `
      + `(${Array.isArray(hookMatched) ? 'an array' : JSON.stringify(hookMatched)}).`,
    );
  }
  for (const k of Object.keys(hookMatched)) {
    if (runnerOwnedMatchedKeys.has(k)) {
      throw new Error(
        `${tag} execution.enrich_hooks.post_phase returned the key "${k}", which the RUNNER owns and fills `
        + 'itself. A step cannot contribute a runner-owned observation and the runner must not silently '
        + 'discard one a step reported (Rule 1) — rename the key.',
      );
    }
  }

  const matched = {
    ...hookMatched,
    // batch-2 Phase 0.10 — derived from identity.name, never the literal slug (the
    // defer-return above does the same). Byte-identical for `enrich_parcels`.
    [`${descriptor.identity.name}_duration_ms`]: Date.now() - t0,
    passes: passRaw,
  };

  // EP-PASS3-BACKLOG (WF3 C1, 2026-09-15) — the step-start retirement, made LOUD. A DELETE
  // of 443,023 rows that no row records is invisible (Spec 48 §3.6). The three counters
  // reconcile by construction: `retired + surviving = scope_backlog_at_step_start`, and
  // `pending_scope_parcels` — which `execution.enrich_hooks.post_phase` now contributes,
  // observed at pass-5 start, AFTER this retirement — is the surviving half; a retirement
  // that does not reconcile against it is a defect.
  //
  // 0.10b — gated on `hasScopeLedger`, the SAME declared write-class predicate that gates
  // the retirement itself (above). `enrich_parcels` declares that target, so all four keys
  // and all four values are unchanged, INCLUDING the failure path where every one of them
  // is deliberately NULL rather than 0. A step with no scope ledger stops emitting four
  // permanent nulls for a mechanism it does not have.
  if (hasScopeLedger) {
    matched.scope_backlog_at_step_start = scopeRetire.backlog_rows;
    matched.scope_retired_rows = scopeRetire.retired_rows;
    matched.scope_retired_cohorts = scopeRetire.retired_cohorts;
    // Observability fold — the WINDOW travels WITH the count, so a reader of the audit
    // table alone can tell a 0 that means "nothing was old enough" from a 0 that means
    // "the window is misconfigured". Both halves are DB-derived (the cutoff is computed
    // in the retirement's own SQL from the injected clock), never re-derived here.
    matched.scope_retire_window = { hours: scopeRetire.retire_after_hours, cutoff_at: scopeRetire.cutoff_at };
  }

  // batch-2 Phase 0.10 — the before-image artifacts the class-O seam persisted, if
  // any. Added ONLY when non-empty, on purpose: a step that retracts nothing (every
  // ENRICHER today, `enrich_parcels` included) emits the SAME `matched` object it
  // always did, byte for byte — an always-present `before_image: []` key would move
  // every committed golden for a mechanism that did not run.
  if (beforeImage.length > 0) matched.before_image = beforeImage;

  // ── batch-2 Phase 0.10 (fold, ruled 2026-09-15) — THE PER-TARGET COUNTERS,
  // DRIVEN BY THE DECLARATION.
  //
  // This block used to be fifteen hardcoded assignments over `write.targetKey(0)`
  // … `targetKey(4)`, sourced from five pass-result variables looked up by literal
  // pass name. An ENRICHER declaring FEWER than five write targets died here at
  // `TypeError: Cannot set properties of undefined` — AFTER every pass had run and,
  // for a shared-txn step, after the transaction had already COMMITted, which is the
  // worst place in the whole runner to fail. `geocode_permits` (batch-2 Phase 0.9)
  // declares TWO targets, so the row that exists to unblock it had to close this too.
  //
  // The loop reads the SAME declaration the phase loops above already sequence on:
  // each `execution.phases[]` entry names its pass (`name` → `passRaw`) and the write
  // target it fills (`writes_ref` → `outputs.writes[]`). For `enrich_parcels` the five
  // phases declare writes_ref 0..4, so this reproduces the retired block's numbers
  // exactly — verified per pass, not asserted: `zoning`/`max_build`/`existing_structure`
  // report `scoped`, `comparable_builds` reports `candidates`, `optimal_config` reports
  // neither and falls to `updated` (which is what the retired code read for it too).
  //
  // ⚠️ THE FIELD NAMES ARE A CODE CONTRACT, NOT A DECLARED ONE. `PASS_SCANNED_FIELDS`
  // is an ORDERED resolution over the four names this estate's passes actually use,
  // stated here rather than left implicit. The honest end state is a per-phase declared
  // counter source in the descriptor; that is a schema field and its own re-freeze, and
  // it is filed rather than smuggled in here.
  //
  // RV-D4 (WF3, 2026-09-20) — COUNTER OWNERSHIP IS BY USE, NOT BY DECLARED CLASS
  // (Spec 124 R-AK: "class-checked, counter-owned by the runner"). A target a pass
  // reached through `ctx.joinUpdate`/`ctx.retract` this run (`seamOwned`) takes its
  // `updated`/`retracted`/`rows_changed` from the seam ALONE — the seam already
  // incremented them at the point of the write, so this fallback would double them.
  // This fallback applies `updated`/`rows_changed` only to a target NO seam touched
  // this run (every ENRICHER's non-seam targets, e.g. `enrich_parcels`
  // `comparable_builds`, which declares class `set_based_join_update` but reports
  // via its own pass result — M1f is that fence). `scanned` is UNCONDITIONAL below:
  // no seam ever writes `scanned`, so a seam-owned target still needs it from the
  // pass result (M1h).
  const PASS_SCANNED_FIELDS = ['scanned', 'scoped', 'candidates', 'updated'];
  for (const phase of phases) {
    const key = write.targetKey(phase.writes_ref);
    if (!written[key]) {
      throw new Error(
        `${tag} execution.phases[] entry "${phase.name}" declares writes_ref ${phase.writes_ref}, which this `
        + `descriptor's outputs.writes[] (${specs.length} target(s)) does not have. A pass whose counters have no `
        + 'declared home is a write nothing can report (Rule 1) — fix the reference, do not skip the counter.',
      );
    }
    const r = passRaw[phase.name] || {};
    const scannedField = PASS_SCANNED_FIELDS.find((f) => typeof r[f] === 'number');
    written[key].scanned += scannedField ? r[scannedField] : 0;
    if (!seamOwned.has(key)) {
      const passUpdated = (r.updated || 0) + (r.scenarioUpdated || 0);
      written[key].updated += passUpdated;
      written[key].rows_changed += passUpdated;
    }
  }
  // ⚠️ RESIDUE, NARROWED AND NAMED (batch-2 Phase 0.10b). The two CLASS-BASED targets
  // below are declared by NO `execution.phases[]` entry — nothing names a `writes_ref` for
  // them — so the declaration-driven loop above structurally cannot reach them, and the two
  // literal `enrich_parcels` pass names they need survive here. 0.10 retired fifteen such
  // hardcoded assignments and 0.10b retired the five pass-name lookups in the `matched`
  // build; these two are what is left, and they are stated rather than hidden. The honest
  // fix is a declared "which passes feed this class-based target" source in the descriptor,
  // which is its own schema field and its own re-freeze — filed MED, not smuggled in here.
  // For a step that declares neither class both blocks are skipped entirely (`findIndex`
  // returns -1), so this residue costs a non-`enrich_parcels` ENRICHER nothing.
  const zoning = passRaw.zoning || {};
  const maxBuild = passRaw.max_build || {};
  const stampsIdx = specs.findIndex((s) => s.write_discipline.class === 'set_based_scoped');
  if (stampsIdx >= 0) {
    written[write.targetKey(stampsIdx)].updated = (zoning.updated || 0) + (maxBuild.updated || 0);
    written[write.targetKey(stampsIdx)].rows_changed = written[write.targetKey(stampsIdx)].updated;
  }
  const scopeIdx = specs.findIndex((s) => s.write_discipline.class === 'insert_only_no_retraction');
  if (scopeIdx >= 0) {
    written[write.targetKey(scopeIdx)].inserted = scopeInsertCount;
    written[write.targetKey(scopeIdx)].rows_changed = scopeInsertCount;
  }

  // ── `matched.compute` — THE DECLARED COUNTER-SOURCE ROOT ──────────────────
  // Assigned HERE, after the per-target fold above, because the derived arm reads the
  // numbers that fold produces. See resolveEnrichAggregate for the contract; the short
  // version is that on THIS path the block is never absent and never carries a non-finite
  // value, because a counter whose declared source resolves to nothing reads as "not
  // counted" rather than as the number it is (Spec 48 §3.6, Spec 79 C11).
  //
  // "THIS path" is meant literally (output-panel Integration seat, 2026-09-16): the four
  // EARLY returns above — scope-defer, pre-write-gate abort, shared-txn lock denied,
  // post_commit lock denied — return a `matched` with no `compute` block at all, so their
  // counters resolve null. That is correct and deliberate: each is a zero-work path where
  // "not counted" is the honest reading, and adding a block there would move the deferred
  // return's shape. The guarantee is scoped to the normal completion and the
  // phase-deadline fall-through, which are the paths that actually did work.
  matched.compute = resolveEnrichAggregate(postPhase, written, phases, specs, tag);

  return {
    deferred: false,
    matched,
    written,
    prior,
    overrides,
    writeSkipped: false,
    skipped: false,
    // Observability fold — both are CONSUMED by runWithPool's `extraRows`
    // (§phaseDeadlineRows / §scopeRetireFailureRows); neither is a write-only field.
    // Null on every healthy run, so a healthy audit table is unchanged byte for byte.
    phaseDeadline: phaseDeadlineInfo,
    scopeRetireError,
  };
  } finally {
    // F5 (output panel) — the whole-step periodic heartbeat ticker stops before the
    // client it writes on is released, on every exit path (same reasoning as EP-D12 below).
    stopHeartbeatTicker();
    // EP-D12 (P8) — released on EVERY exit path from the try above (both early
    // returns — shared-txn lock denied, post_commit lock denied — and the
    // normal-completion return just above it), never leaked back to the pool.
    heartbeatClient.release();
  }
}

/**
 * `outputs.writes[]` EXECUTED IN DECLARATION ORDER, in ONE transaction (§1.4: "Order is
 * declared and the runner executes it in order").
 *
 * For link_massing the order IS the fence: E1's `is_primary = false` clear must land
 * before E2's upsert, or migration 081's partial unique index throws the moment a
 * parcel's primary structure moves to a different building (5bb31faf / B-8). Declaring
 * the order rather than writing it makes a reordering a DIFF instead of an incident.
 */
async function executeOrderedWrites(pool, plans, rows, runAt, written, specs) {
  const clockColumns = specs.map((w) => (w.columns || []).filter((c) => c.source === 'run_at').map((c) => c.name));
  await pipeline.withTransaction(pool, async (client) => {
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const key = write.targetKey(i);
      if (plan.clear_sql) {
        // The scope's one placeholder is the DISTINCT leading key of the rows about to be
        // written — "the batch's parcels", derived from the data rather than named here.
        const scoped = [...new Set(rows.map((r) => r[plan.keys[0]]))];
        const cleared = await write.executeSetBasedClear(client, plan, [scoped]);
        written[key].scanned += scoped.length;
        written[key].updated += cleared;
        written[key].rows_changed += cleared;
        continue;
      }
      // The run clock is stamped by the RUNNER, from the single capture above, onto the
      // columns that DECLARED `source: "run_at"` — so the compute never sees a clock and
      // two batches can never straddle a second (B-11 / Spec 47 §R3.5).
      const stamped = clockColumns[i].length === 0
        ? rows
        : rows.map((r) => Object.assign({}, r, Object.fromEntries(clockColumns[i].map((c) => [c, runAt]))));
      const result = await write.executeUpsertBatch(client, plan, stamped);
      written[key].scanned += stamped.length;
      written[key].inserted += result.inserted;
      written[key].updated += result.updated;
      written[key].rows_changed += result.inserted + result.updated;
    }
  });
}

/**
 * THE `when: "pre_write"` GATE (LR-D9 — operator ruling §7.1, 2026-08-26).
 *
 * Returns the callback `runIngestPhase` invokes between the last read and the first
 * write, or `null` when the descriptor declares no `pre_write` check (in which case the
 * ingest phase is byte-for-byte the pre-Fold-C one — the gate adds nothing to a step
 * that does not ask for it).
 *
 * It scores those checks through THE SAME two mechanisms the final table uses — the
 * compute's own dispatch (`ctx.checks` narrowed to the pre_write ids) and
 * `buildAuditTable` — so the gate can never disagree with the audit row it is gating
 * on. The rows it builds are DISCARDED: the compute is re-run over the full selection
 * afterwards and those checks report identically, because a `pre_write` check reads
 * only `ctx.acquired` / `ctx.prior`, which the write does not touch.
 *
 * Acceptance (ruling A-5) is applied to the DECISION only, never to the row: an
 * accepted FAIL proceeds to the write and still lands its FAIL row downstream.
 *
 * @returns {null|(function({acquired: object, prior: object|null, overrides: object}):
 *   Promise<{abort: boolean, failed: string[], skipWrite?: true, skipWriteChecks?: string[]}>)}
 *
 * THE THREE-WAY DECISION (INGESTOR prerequisite 0h, 2026-09-24, Fold A F1). Before this the
 * gate was BINARY — `abort` on an unaccepted FAIL, else write — and `checks[].on_warn:
 * "skip_write"` adds a THIRD arm. It exists because a declared WARN that must ALSO refuse
 * the write had no honest way to say so: raising the severity to FAIL would change a legacy
 * verdict (load-centreline's F-C1 later-run arm is a WARN and the run must stay WARN), and
 * an early `return` from compute would put the refusal in the step, where the ONE place a
 * write is refused — this gate — cannot see it. So the check DECLARES the arm and the gate
 * honours it. Precedence is FAIL-first (`abort` wins if both fire — a standing hard FAIL may
 * not be turned write-free by a second arm), then `skipWrite`, then the write. `skipWrite`/
 * `skipWriteChecks` are OMITTED from the object entirely (not `false`/`[]`) when the arm
 * does not fire, so the pre-0h `{abort, failed}` shape stays byte-identical for every caller
 * and lock (LR-D9) that predates it. The caller decides what `skipWrite` means for its own
 * shape; only `runIngestPhase` acts on it today.
 */
function makePreWriteGate({ descriptor, chainId, stepCtx, compute, config }) {
  const preWriteIds = selectChecks(descriptor, chainId)
    .filter((c) => c.when === 'pre_write')
    .map((c) => c.id);
  const gated = preWriteIds.filter((id) => stepCtx.checks.includes(id));
  if (gated.length === 0) return null;
  const only = new Set(gated);
  const accepted = acceptedCheckIds(descriptor);

  // `phaseState` is whatever the driving phase has MEASURED so far and nothing else:
  // `{acquired, prior, overrides}` from the ingest phase, `{matched, gate, prior,
  // overrides}` from the link phase. Spread rather than destructured so one gate serves
  // both shapes without the runner inventing keys a compute would read as undefined.
  return async function preWriteGate(phaseState) {
    const observations = Object.create(null);
    // `written: null` is the whole point — a pre_write check that reached for it would
    // read undefined here and a real value in the final pass, which is the disagreement
    // this position exists to make impossible.
    const probeCtx = {
      ...stepCtx,
      written: null,
      gate: { skipped: false, reason: 'pre_write' },
      ...phaseState,
      checks: gated,
      report(checkId, observation) {
        if (!only.has(checkId)) {
          throw new Error(`[${descriptor.identity.name}] pre_write gate: compute reported "${checkId}", which is not a when:"pre_write" check`);
        }
        observations[checkId] = observation;
      },
    };
    await compute(probeCtx);
    const built = buildAuditTable(descriptor, chainId, observations, [], config, only);
    // ONE derivation of "which FAILs acceptance does not cover", shared with the
    // status cascade below (§partitionFailedRows) — an errored check query is never
    // accepted here either, or the gate would let a write proceed on the strength of
    // a check that measured nothing.
    const { unaccepted: failed } = partitionFailedRows(built.rows, accepted);
    // ── THE THIRD ARM (prerequisite 0h): a WARN row from a check that DECLARED
    // `on_warn: "skip_write"`. Read from the DESCRIPTOR (the declared axis), never inferred
    // from the row's severity — a WARN without the declaration proceeds exactly as it always
    // has (pinned by T5b), and a FAIL is never rescued by it (FAIL-first precedence above).
    const skipWriteIds = selectChecks(descriptor, chainId)
      .filter((c) => c.on_warn === 'skip_write')
      .map((c) => c.id);
    const skipWriteCheckIds = built.rows
      .filter((r) => skipWriteIds.includes(String(r.metric).split(':')[0]) && r.status === 'WARN')
      .map((r) => String(r.metric).split(':')[0]);
    // The decision is BYTE-FOR-BYTE the pre-0h shape ({abort, failed}) on every descriptor
    // that never triggers the third arm — the LR-D9 locks pin that exact shape with
    // `toEqual` and must keep passing unchanged. `skipWrite`/`skipWriteChecks` are added to
    // the object ONLY when the arm actually fires (never as an always-present `false`/`[]`),
    // so a descriptor with no `on_warn:"skip_write"` check — or one that has it but did not
    // WARN — is invisible to every caller that predates this arm.
    const decision = { abort: failed.length > 0, failed };
    if (!decision.abort && skipWriteCheckIds.length > 0) {
      decision.skipWrite = true;
      decision.skipWriteChecks = skipWriteCheckIds;
    }
    return decision;
  };
}

/**
 * R-U (Fold B-5) — parse `process.env.CHAIN_RUN_ID` (set by run-chain.js at
 * spawn time, `scripts/run-chain.js:638`) into a finite integer, or `null`
 * when absent/malformed. A malformed value (never emitted by run-chain.js
 * itself, but a defensive read for anything else that might set the env var)
 * degrades to `null` rather than throwing — chain-run correlation is an
 * observability nicety, not a run-blocking contract.
 */
function parseChainRunIdEnv() {
  const raw = process.env.CHAIN_RUN_ID;
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * WF3 enrich_parcels stall incident (2026-09-07, orchestrator observation) — the SAME contract
 * `pipeline.js`'s legacy `run()` has carried since the 2026-09-03 cloud-parity FIX 3 remediation
 * (its own comment: "ctx.runId is THIS step's own pipeline_runs.id when run-chain.js spawned it
 * via STEP_RUN_ID, else null"), but `runWithPool` never read it — a converted step running inside
 * a REAL `run-chain.js` chain (`owns=false`, since run-chain.js itself owns finalization) had
 * `runId` permanently `null` for the step's own lifetime, even though run-chain.js had ALREADY
 * INSERTed this step's own `pipeline_runs` row (`run-chain.js:606`) and threaded its id via
 * `STEP_RUN_ID` (`run-chain.js:658`) specifically so the step could address it. Every converted
 * step's `recordHeartbeat`/`captureStallDiagnostic` (LG-28) — and any future one — was silently
 * unreachable during a real chain run for this reason; standalone (`owns=true`) was never
 * affected (`openLedgerRow` already gives it a fresh id at start). Absent/blank/non-numeric ->
 * null, never NaN — mirrors `parseChainRunIdEnv` immediately below and `pipeline.js`'s own
 * STEP_RUN_ID parsing verbatim.
 */
function parseStepRunIdEnv() {
  const raw = process.env.STEP_RUN_ID;
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The SKIP terminal's records_meta — verdict row-derived like every other path
 * (no hardcoded terminal value). VRD-SKIP (Spec 124 §2 Rule 10 R-H addendum,
 * rung b): a self-skip is the maximal case of "a check the library could not
 * evaluate" — zero declared checks ran — so it must never fold to PASS. The
 * 'status' row's declared severity is WARN with its real threshold ('ran'),
 * which `deriveVerdict` folds to a WARN verdict through the unchanged
 * SEVERITY_RANK lattice; the non-halting posture is preserved exactly (only
 * FAIL/blockingFailures halt). 'reason' stays a purely descriptive INFO row
 * (R-H: no threshold possible for it).
 */
function skipRecordsMeta(descriptor, reason) {
  const rows = [
    { metric: 'status', value: 'SKIPPED', threshold: 'ran', status: 'WARN' },
    { metric: 'reason', value: reason, threshold: null, status: 'INFO' },
  ];
  return {
    skipped: true,
    reason,
    audit_table: {
      phase: 0,
      name: descriptor.identity.display_name,
      verdict: deriveVerdict(rows),
      rows,
    },
  };
}

/** R-M / LG-17 — the INFO audit row per destructive-retraction target a before-image was written for. */
function beforeImageRow(bi) {
  return {
    metric: `before_image_written:${bi.table}`,
    value: { path: bi.path, rows: bi.rows },
    threshold: null,
    status: 'INFO',
  };
}

/**
 * EP-D17 (WF3, 2026-09-10, C1, lock 6) — one INFO cost row per EXECUTED
 * invariants[]/plausibility[] entry, keyed by entry id (Spec 48 §3.5's
 * `sys_duration_ms` precedent: an INFO cost row with `threshold: null` is
 * explicitly legal). `durationMs` can be `undefined` when a caller (a fixture,
 * or a future entry type) never ran `executeEntry` at all for this id — the row
 * still appears (never silently dropped) with `value: null` rather than a
 * misleading 0, so a missing measurement is visibly missing, not visibly fast.
 *
 * OUTPUT-PANEL FIX F1 (CRITICAL, 2026-09-10) — the metric is `sys_${entryId}_duration_ms`,
 * NOT `${entryId}_duration_ms`. `scripts/analysis/capture-step-golden.js`'s `scrub()`
 * drops a WHOLE `audit_table.rows[]` entry only when its `metric` starts with the
 * declared `sys_` prefix (`VOLATILE_METRIC_PREFIXES`) — a bare `duration_ms` SUFFIX on
 * an otherwise-arbitrary metric name is invisible to that filter, and `VOLATILE_KEYS`
 * matches the literal KEY `duration_ms`, never a metric NAME containing it. Without the
 * prefix, this row's raw wall-clock `value` would have made every converted step's golden
 * master non-reproducible the instant this ran against a real DB. `sys_duration_ms`
 * itself (emitSummary's own auto-injected row, §3.5) is the existing precedent for
 * exactly this naming mechanism — this row generalises it per-entry rather than
 * inventing a second one.
 */
function durationRow(entryId, durationMs) {
  return {
    metric: `sys_${entryId}_duration_ms`,
    value: typeof durationMs === 'number' ? durationMs : null,
    threshold: null,
    status: 'INFO',
  };
}

/**
 * POST-B1-1 Observability fold (2026-09-15) — ONE FAIL row for a `pre_write` gate abort.
 *
 * The gate already did the right thing: an unaccepted FAIL among the `when:"pre_write"`
 * checks means `write.executeWrite` is never called (§makePreWriteGate, the LR-D9 fence).
 * What it did NOT do is SAY so on the audit table. The gate's own rows are discarded, the
 * cascade scores only the FINAL pass's observations, and compute runs twice — so a check
 * that threw on the gate pass and succeeded on the final pass skipped the entire write
 * while the run ended `completed`/PASS with not one row recording it. Every runner
 * produced `failedPreWrite` and `written.write_skipped_pre_write_fail`; until this fold
 * NOTHING read either of them. A write-only field is not observability.
 *
 * One row, never one per failed id (the audit table's row count stays bounded by the
 * check count — LR-D1's own rule). FAIL, so the ROW-DERIVED cascade fails the step with
 * no new boolean and no second derivation. `errored: true` for the same reason an
 * errored check row carries it: a gate that aborted measured a refusal, not an anomaly
 * an operator could have looked at and accepted (§partitionFailedRows). Absent entirely
 * when no gate aborted — a healthy run's audit table is unchanged, byte for byte.
 *
 * @param {Array<{failedPreWrite?:string[]}|null>} phaseResults - the per-shape runner results
 * @returns {Array<object>} zero or one row
 */
function preWriteAbortRows(phaseResults) {
  const aborted = (phaseResults || []).find((p) => p && Array.isArray(p.failedPreWrite) && p.failedPreWrite.length > 0);
  if (!aborted) return [];
  return [{
    metric: 'pre_write_gate',
    value: `aborted: ${aborted.failedPreWrite.join(', ')}`,
    threshold: 'zero unaccepted FAIL rows among the when:"pre_write" checks',
    status: 'FAIL',
    source: 'gate',
    errored: true,
  }];
}

/**
 * INGESTOR prerequisite 0h (2026-09-24, Fold A F1) — ONE WARN row for a `skip_write` gate stop.
 *
 * The exact `preWriteAbortRows` idiom (POST-B1-1) with the arms swapped: the gate refused the
 * write because a `pre_write` check DECLARED `on_warn: "skip_write"` and reported WARN, and
 * the run must SAY so on the audit table while STILL COMPLETING — this is the legacy
 * load-centreline F-C1 "warn and preserve" arm, not a failure. So the row is WARN (the
 * row-derived cascade yields a WARN verdict with no new boolean and no second derivation),
 * `source: 'gate'` marks where it came from, and `errored` is deliberately ABSENT: a gate
 * that skipped measured a DECLARED refusal, not an anomaly, and there is nothing for an
 * operator to accept — `override.accept_anomaly` must not be able to turn it off
 * (contrast `preWriteAbortRows`, whose FAIL carries `errored: true` for the same reason).
 *
 * Absent entirely when no gate skip-wrote — a healthy run's audit table is unchanged, byte
 * for byte.
 *
 * @param {Array<{writeSkippedPreWriteWarn?:boolean, failedPreWriteWarn?:string[]}|null>} phaseResults - the per-shape runner results
 * @returns {Array<object>} zero or one row
 */
function preWriteSkipRows(phaseResults) {
  const skipped = (phaseResults || []).find((p) => p && p.writeSkippedPreWriteWarn === true);
  if (!skipped) return [];
  const ids = Array.isArray(skipped.failedPreWriteWarn) ? skipped.failedPreWriteWarn : [];
  return [{
    metric: 'write_skipped_pre_write_warn',
    value: `skipped: ${ids.join(', ')}`,
    threshold: 'zero WARN rows among the when:"pre_write" checks declaring on_warn "skip_write"',
    status: 'WARN',
    source: 'gate',
  }];
}

/**
 * INGESTOR prerequisite 0r (2026-09-24, Fold IC-1) — ONE WARN row when the acquisition seam
 * PROCEEDED past a HEAD failure by declaration.
 *
 * `inputs.reads.externals[].on_head_error: "warn_row"` makes the seam swallow a HEAD 4xx/5xx,
 * hand the tier-1 gate null validators, and (usually) download — the legacy load-centreline
 * arm (Spec 62 §3.9, `load-centreline.js:433-439`) made declared. Because that posture chose
 * to proceed ANYWAY, the run must SAY so on the audit table: `acquired.head_error` carries the
 * message, and this renders it as a WARN row.
 *
 * Exactly the `preWriteSkipRows` idiom (one WARN row, `source: 'gate'`, `errored` deliberately
 * ABSENT — a declared posture is not an anomaly `accept_anomaly` could switch off; the
 * row-derived cascade yields an honest WARN verdict with no new boolean and no second
 * derivation). Rule 10: the row is LIBRARY-owned, never step-declared, because only the library
 * that swallowed the throw can be trusted to report it. Absent entirely on the default
 * `"fail_step"` posture and on every healthy run — a healthy audit table is byte-for-byte
 * unchanged.
 *
 * @param {Array<{acquired?:{head_error?:string|null}}|null>} phaseResults - the per-shape runner results
 * @returns {Array<object>} zero or one row
 */
function headErrorRows(phaseResults) {
  const hit = (phaseResults || []).find((p) => p && p.acquired && p.acquired.head_error);
  if (!hit) return [];
  return [{
    metric: 'head_error',
    value: hit.acquired.head_error,
    threshold: 'HEAD returns 2xx (else on_head_error "warn_row" proceeds and says so)',
    status: 'WARN',
    source: 'gate',
  }];
}

/**
 * EP-PHASE-DEADLINE (Observability fold, 2026-09-15) — the phase-deadline abort, said out
 * loud ON THE AUDIT TABLE. Exactly the `preWriteAbortRows` idiom above (POST-B1-1): one
 * `errored: true` FAIL row, `source: 'gate'`, so the ROW-DERIVED cascade fails the step
 * with no new boolean and no second derivation — `errored` also keeps it out of
 * `override.accept_anomaly`, because a deadline measured a REFUSAL, not an anomaly an
 * operator could have looked at and accepted (§partitionFailedRows).
 *
 * Before this, the wrapped 57014 escaped to `runWithPool`'s outer catch, which sets
 * `status = FAILED` and an `error_message` but builds NO `records_meta` and NO
 * `audit_table` — so the one run the deadline fired on was the one run whose own record
 * said nothing about why. Absent entirely when no deadline fired.
 *
 * @param {Array<{phaseDeadline?:{phase:string,txn:string,elapsedMs:number,boundMinutes:number}}|null>} phaseResults
 * @returns {Array<object>} zero or one row
 */
function phaseDeadlineRows(phaseResults) {
  const hit = (phaseResults || []).find((p) => p && p.phaseDeadline);
  if (!hit) return [];
  const d = hit.phaseDeadline;
  return [{
    metric: 'phase_deadline',
    value: `${d.phase} (${d.txn}) aborted after ${d.elapsedMs}ms`,
    threshold: `each phase completes within its declared ${d.boundMinutes}min bound`,
    status: 'FAIL',
    source: 'gate',
    errored: true,
  }];
}

/**
 * EP-PASS3-BACKLOG (Observability fold, 2026-09-15) — the step-start scope retirement is
 * FAIL-OPEN by an authorized plan ruling ("the retirement is hygiene, not the run's
 * purpose"), so its failure may not fail the step. WARN, not FAIL, for exactly that
 * reason — and `errored: true` all the same, because the instrument threw rather than
 * measured, which is the distinction `accept_anomaly` must not be allowed to blur.
 *
 * This is why the failure does NOT travel as `ctx.report(id, {error})`: this step declares
 * `execution.on_check_error: "fail_step"`, which is severity-INDEPENDENT (POST-B1-1), so
 * that route would turn a hygiene failure into a halted run and contradict the ruling.
 * `scope_backlog_at_step_start` is instead left UNREPORTED, which `checkRow` renders as
 * "not reported by compute" at its DECLARED severity (WARN) — never PASS, never a halt.
 *
 * @param {Array<{scopeRetireError?:Error|null}|null>} phaseResults
 * @returns {Array<object>} zero or one row
 */
function scopeRetireFailureRows(phaseResults) {
  const hit = (phaseResults || []).find((p) => p && p.scopeRetireError);
  if (!hit) return [];
  const msg = hit.scopeRetireError instanceof Error ? hit.scopeRetireError.message : String(hit.scopeRetireError);
  return [{
    metric: 'scope_retire_failed',
    value: `step-start scope retirement errored: ${msg}`,
    threshold: 'the retirement runs, or says so — the backlog counters are NULL, not 0',
    status: 'WARN',
    source: 'gate',
    errored: true,
  }];
}

/** LW-D15 — the INFO audit row every `--dry-run` run carries, naming the posture explicitly (Rule 1: nothing hidden). */
function dryRunRow() {
  return {
    metric: 'dry_run_no_writes',
    value: true,
    threshold: 'dry_run implies zero write statements issued',
    status: 'INFO',
  };
}

async function runWithPool(runnable, pool, ctx) {
  const descriptor = runnable.descriptor;
  const slug = descriptor.identity.name;
  const chainId = ctx.chainId !== undefined ? ctx.chainId : (process.env.PIPELINE_CHAIN || null);
  // R-U (Fold B-5) — same override-then-env-fallback shape as `chainId` above.
  // `null` both when standalone (no CHAIN_RUN_ID set, e.g. a manual
  // run-step.mjs invocation, Fold A-4e) AND when the chain's own tracking
  // row failed to insert (run-chain.js never emits the env var in that case).
  const chainRunId = ctx.chainRunId !== undefined ? ctx.chainRunId : parseChainRunIdEnv();
  const startMs = Date.now();
  const owns = ownsLedgerRow(chainId);

  let runId = null;
  let status = RUN_STATUS.FAILED;
  let recordsMeta = null;
  let counters = { records_total: null, records_new: null, records_updated: null };
  let errorMessage = null;

  // ── LEDGER STRAND WINDOW (P3, ported into the library at pilot 1) ──────────
  // Declared BEFORE the try so nothing throwable sits between them. Semantics
  // are the ones the pre-conversion step carried at its :594-601: the `finally`
  // closes a THROWN error only — process kills bypass it entirely, and that is
  // reaper work, not this. `ledgerFinalized` exists because the normal finalize
  // swallows its own UPDATE failure; without the flag the window would either
  // double-write the happy path or leave a `running` row behind a log line.
  let ledgerFinalized = false;
  let windowError = null;

  // WF3 enrich_parcels double-run incident (2026-09-07) - the inner advisory-lock denial
  // (runEnrichPhase own coupled lock) is a clean, honest self-skip, NOT a crash: mirrors
  // !lockResult.acquired own terminal exactly (same status, same records_meta shape, same
  // emitSummary call) - the ONLY difference is which connection detected contention first.
  // Kept as a helper (not inlined in the catch below) so the catch block itself stays within
  // the ledger-window regression lock own regex window (src/tests/quality-ledger-window.
  // logic.test.ts) - windowError = err; ... throw err; must stay close to catch (err) {.
  function emitInnerLockDeniedSkip() {
    status = RUN_STATUS.SELF_SKIPPED;
    recordsMeta = { ...skipRecordsMeta(descriptor, 'advisory_lock_held_elsewhere'), ledger_row: owns ? LEDGER_ROW_VALUES[0] : LEDGER_ROW_VALUES[1], chain_run_id: chainRunId, pool_errors: pool.__buildoPoolErrorCount ?? 0 };
    pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null, records_meta: recordsMeta });
    return { status, recordsMeta, runId, acquired: false };
  }

  // ── §1.2a P4 — `ctx.config`, and WHERE it is resolved ──────────────────────
  // `hoisted_above_gate` is link-wsib's A1/A2 fence, generalized: a SKIP-eligible
  // step must never let an invalid threshold hide behind a green SKIPPED summary,
  // so a hoisted config is resolved ABOVE the advisory lock — the refusal happens
  // whether or not this process wins the lock. Un-hoisted, it resolves inside the
  // lock, immediately before compute, so a contended run pays no config query.
  // Either way it is INSIDE the try: a config failure is a `failed` ledger row with
  // an `error_message`, never a silent no-op.
  const declaresConfig = descriptor.config && descriptor.config !== 'none';
  const hoisted = declaresConfig && descriptor.config.hoisted_above_gate === true;
  let configValues = EMPTY_CONFIG;
  let configStamp = null;
  // R-A (2026-08-28) — every `config.retired[]` entry, annotated with whether its
  // `logic_variables` row still exists. Carried alongside `configStamp` so the
  // `retired_var_row_present` audit row can be built once compute has run, exactly
  // like the LR-D2 `prior_run_read_failed` row below.
  let configRetiredStatus = [];
  // R-D (2026-08-28) — every `config.probe_presence[]` name, annotated the same way.
  // Handed to the compute as `ctx.probePresence` (claim #175: the compute issues no
  // SQL, so the presence read happens here and only the RESULT crosses the seam).
  let configProbeStatus = [];

  // ⚠️ DECLARED AUDIT GAP, S2-min. A compute that throws BEFORE any
  // `ctx.report()` emits ZERO audit rows — the failure survives only as the
  // ledger row's `error_message`. The pre-conversion assert-schema avoided this
  // by wrapping EACH source fetch in its own try/catch, so one unreachable
  // archive reddens one row instead of erasing the whole table.
  //
  // That per-check granularity is a PROPERTY OF THE COMPUTE, not of the
  // library, and every conversion must preserve it at PH-0: a compute that
  // lets a fetch escape to the top level trades nine audit rows for one error
  // string. Library-side protection — running each check in its own boundary
  // and synthesizing an errored observation — is the validator growth wave,
  // where `on_check_error` becomes the runner's to apply rather than the
  // compute's to honour. Pinned by `src/tests/step-library.logic.test.ts`
  // ("DECLARED GAP — a raw compute throw emits ZERO audit rows, only the
  // ledger error_message") so it cannot regress unnoticed.
  try {
    await assertDatabaseTarget(pool, descriptor);
    if (owns) runId = await openLedgerRow(pool, slug);
    else runId = parseStepRunIdEnv();
    if (hoisted) ({ values: configValues, stamp: configStamp, retiredStatus: configRetiredStatus, probeStatus: configProbeStatus } = await resolveConfig(pool, descriptor));

    // §4.1 ② — txn-scoped advisory lock on identity.lock. `skipEmit: false`
    // because the SKIP summary is the library's to emit: the SDK's built-in one
    // carries no audit_table, which is what makes a contention skip land as
    // verdict UNKNOWN today instead of a row-derived verdict.
    const lockResult = await pipeline.withAdvisoryLock(pool, descriptor.identity.lock, async () => {
      if (declaresConfig && !hoisted) {
        ({ values: configValues, stamp: configStamp, retiredStatus: configRetiredStatus, probeStatus: configProbeStatus } = await resolveConfig(pool, descriptor));
      }
      const observations = Object.create(null);
      const declared = new Set(descriptor.checks.map((c) => c.id));
      // batch2 P1.1 — see stepCtx.contextRow() below.
      const contextRows = [];
      const stepCtx = {
        pool,
        chainId,
        // The lock's fencing token (Spec 120 §4.1 ②). S2-min CARRIES it and
        // records it; REFUSING a lower run_id needs the holder column that
        // arrives with the S4 state tables, so it is not claimed here.
        runId,
        descriptor,
        // §1.7 — the SELECTED check ids, in declaration order. The SAME selection
        // `buildAuditTable` scores below, handed to the compute so a compute never
        // re-derives chain gating for itself: peel 8a removed the last
        // `chainId === 'permits'` branch from a compute by reading this instead.
        checks: selectChecks(descriptor, chainId).map((c) => c.id),
        log: pipeline.log,
        // §5.5 (3) — the INJECTED I/O SEAMS. A compute reaches the network and the
        // clock only through these, so a test drives it by passing a ctx rather than
        // monkey-patching `globalThis`, and the compute-shape rule can ban the bare
        // globals outright. Defaults here, overridable by the caller's ctx.
        fetch: ctx.fetch || ((input, init) => globalThis.fetch(input, init)),
        clock: ctx.clock || (() => Date.now()),
        // §1.2a P4 — the ONLY way a compute reaches a tunable. Frozen, and
        // projected to the DECLARED names: `validation: "strict"` is not a checker
        // that could be skipped, it is an object that does not have the key.
        config: configValues,
        // R-D (2026-08-28) — `config.probe_presence[]` measured BEFORE compute runs
        // (claim #175: the compute issues no SQL), frozen, read-only. `[]` for a step
        // that declares no probe names. Never merged into `config`: a probed name is
        // observed for presence, never projected as a value a compute could consume.
        probePresence: Object.freeze(configProbeStatus.map((p) => Object.freeze({ ...p }))),
        // §5.5 / ruling A-1(b) — the LIBRARY-PROVIDED RESULT the checks observe.
        // Null for a step the library does not drive end to end (an ASSERT fetches
        // its own subjects); populated by `runIngestPhase` for an acquire→write step.
        acquired: null,
        written: null,
        prior: null,
        overrides: null,
        gate: null,
        // ── The LINK phase's own result surface (ruling A-1(a)) ────────────────
        // `matched` is what the JOIN produced, `cumulative` the link-rate numerator and
        // its denominator. Null for every other shape, exactly as `acquired` is null for
        // a step the library does not acquire for — a compute reads a null and reports
        // "not measured" rather than a zero it cannot tell apart from a real one.
        matched: null,
        cumulative: null,
        elapsed_ms: 0,
        report(checkId, observation) {
          if (!declared.has(checkId)) {
            throw new Error(`[${slug}] compute reported check "${checkId}", which the descriptor does not declare`);
          }
          observations[checkId] = observation;
        },
        // batch2 P1.1 (assert_parcel_sanity) — a generic, opt-in seam: a compute may
        // push a LITERAL audit row (bypassing checkRow's limit evaluation entirely)
        // for a population/context count that is not itself a checks[]/plausibility[]
        // entry (e.g. "N residential parcels scanned"). Declaring it as a 43rd check
        // would inflate the fleet's own checks.length locks for no verdict benefit —
        // this preserves the row without touching the schema. Collected here,
        // appended to `extraRows` below; absent for every step that never calls it.
        contextRow(row) { contextRows.push({ source: 'context', ...row }); },
      };

      // ── ACQUIRE → VALIDATE → WRITE (ruling A-1(b), INGESTOR wave) ───────────
      // Only for a descriptor that DECLARES the shape; every other step reaches
      // `runnable.compute` on exactly the path pilot 1 established.
      let ingest = null;
      let link = null;
      let linkKeyed = null;
      let cascade = null;
      let materialize = null;
      let backfill = null;
      let linkColumn = null;
      let recorder = null;
      let enrich = null;
      let onlyChecks = null;
      // R-T addendum (Fold A-3/B-2) — the SAME gated-skip narrowing a real `checks[]`
      // entry gets, extended to invariants[]/plausibility[]. `onlyChecks` narrows by id
      // (checks[]-scoped, unusable for a synthetic entry whose id lives in a different
      // space); `onlyWhen` narrows by the `when` VALUE itself, which both categories
      // share — set alongside `onlyChecks` in every branch below. null = unrestricted
      // (score every declared `when`), matching `onlyChecks`'s own null-means-everything.
      let onlyWhen = null;
      const drivesWrites = isIngestStep(descriptor) || isLinkStep(descriptor) || isLinkKeyedStep(descriptor)
        || isLinkColumnStep(descriptor)
        || isCascadeStep(descriptor) || isMaterializeStep(descriptor) || isBackfillStep(descriptor)
        || isRecorderStep(descriptor) || isEnrichStep(descriptor);
      // Spec 47 §R3.5 / B-11 — the DB clock, captured ONCE, inside the lock, for
      // WHICHEVER phase drives the write. One capture is not a tidiness preference: it is
      // what makes the written timestamp a single watermark, so two batches of one run
      // cannot straddle a second (or a midnight) and a downstream consumer scoping on
      // `> last_stamp` cannot see half a run.
      const clockNow = drivesWrites ? await pipeline.getDbTimestamp(pool) : null;
      if (isLinkStep(descriptor)) {
        link = await runLinkPhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          chainId, log: pipeline.log, tag: `[${slug}]`, clockNow, ownRunId: runId,
          preWriteGate: makePreWriteGate({ descriptor, chainId, stepCtx, compute: runnable.compute, config: configValues }),
        });
        stepCtx.matched = link.matched;
        stepCtx.cumulative = link.cumulative;
        stepCtx.written = link.written;
        stepCtx.prior = link.prior;
        stepCtx.overrides = link.overrides;
        stepCtx.gate = link.gate;
        stepCtx.elapsed_ms = Date.now() - startMs;
        if (link.writeSkipped) {
          // The write never happened, so the `post` checks have no subject. Scoring them
          // would turn one honest pre_write FAIL into a table of "not reported" rows at
          // their declared severities — the same reasoning as the gated-skip narrowing.
          onlyChecks = new Set(descriptor.checks.filter((c) => c.when !== 'post').map((c) => c.id));
          onlyWhen = ['pre', 'pre_write'];
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      } else if (isLinkKeyedStep(descriptor)) {
        linkKeyed = await runLinkKeyedPhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          chainId, log: pipeline.log, tag: `[${slug}]`, clockNow, ownRunId: runId,
          preWriteGate: makePreWriteGate({ descriptor, chainId, stepCtx, compute: runnable.compute, config: configValues }),
        });
        stepCtx.matched = linkKeyed.matched;
        stepCtx.cumulative = linkKeyed.cumulative;
        stepCtx.written = linkKeyed.written;
        stepCtx.prior = linkKeyed.prior;
        stepCtx.overrides = linkKeyed.overrides;
        stepCtx.gate = linkKeyed.gate;
        stepCtx.elapsed_ms = Date.now() - startMs;
        if (linkKeyed.writeSkipped) {
          // Same reasoning as isLinkStep's own writeSkipped narrowing, above.
          onlyChecks = new Set(descriptor.checks.filter((c) => c.when !== 'post').map((c) => c.id));
          onlyWhen = ['pre', 'pre_write'];
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      } else if (isLinkColumnStep(descriptor)) {
        linkColumn = await runLinkColumnPhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          chainId, log: pipeline.log, tag: `[${slug}]`,
          preWriteGate: makePreWriteGate({ descriptor, chainId, stepCtx, compute: runnable.compute, config: configValues }),
        });
        stepCtx.matched = linkColumn.matched;
        stepCtx.cumulative = linkColumn.cumulative;
        stepCtx.written = linkColumn.written;
        stepCtx.prior = linkColumn.prior;
        stepCtx.overrides = linkColumn.overrides;
        stepCtx.gate = linkColumn.gate;
        stepCtx.elapsed_ms = Date.now() - startMs;
        // ONLY the pre_write-fail path narrows. A zero-eligible run does NOT (see
        // runLinkColumnPhase's header): its post checks are the whole point, because the
        // measured steady state IS zero eligible and the cumulative rate is what the run
        // exists to report.
        if (linkColumn.writeSkipped) {
          onlyChecks = new Set(descriptor.checks.filter((c) => c.when !== 'post').map((c) => c.id));
          onlyWhen = ['pre', 'pre_write'];
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      } else if (isIngestStep(descriptor)) {
        ingest = await runIngestPhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          fetchImpl: stepCtx.fetch, chainId, log: pipeline.log, tag: `[${slug}]`, clockNow,
          preWriteGate: makePreWriteGate({ descriptor, chainId, stepCtx, compute: runnable.compute, config: configValues }),
        });
        stepCtx.acquired = ingest.acquired;
        stepCtx.written = ingest.written;
        stepCtx.prior = ingest.prior;
        stepCtx.overrides = ingest.overrides;
        stepCtx.gate = { skipped: ingest.skipped, reason: ingest.reason };
        if (ingest.skipped) {
          // A GATED SKIP still reports every `when: "pre"` check, so the run says
          // WHY it was allowed to skip instead of emitting a bare SKIPPED row. The
          // `when: "post"` checks are not scored: nothing was written, so scoring
          // them would turn the normal, correct outcome into a table of
          // not-reported rows at their declared severity. `when: "pre_write"` is on
          // the same footing: the gate fires AFTER acquisition, and a gated skip
          // never acquires, so those checks have no subject to observe either.
          onlyChecks = new Set(descriptor.checks.filter((c) => c.when === 'pre').map((c) => c.id));
          onlyWhen = ['pre'];
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      } else if (isCascadeStep(descriptor)) {
        cascade = await runCascadePhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          chainId, log: pipeline.log, tag: `[${slug}]`, clockNow, ownRunId: runId,
          preWriteGate: makePreWriteGate({ descriptor, chainId, stepCtx, compute: runnable.compute, config: configValues }),
        });
        stepCtx.matched = cascade.matched;
        stepCtx.cumulative = cascade.cumulative;
        stepCtx.written = cascade.written;
        stepCtx.prior = cascade.prior;
        stepCtx.overrides = cascade.overrides;
        stepCtx.gate = cascade.gate;
        stepCtx.elapsed_ms = Date.now() - startMs;
        if (cascade.skipped || cascade.writeSkipped) {
          // LG-15's gated skip scores only `when: "pre"` checks (same reasoning as
          // isIngestStep's own gated skip, above); a pre_write-fail scores everything
          // except `post` (same reasoning as isLinkStep's writeSkipped, above).
          const positions = cascade.skipped ? ['pre'] : ['pre', 'pre_write'];
          onlyChecks = new Set(descriptor.checks.filter((c) => positions.includes(c.when)).map((c) => c.id));
          onlyWhen = positions;
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      } else if (isMaterializeStep(descriptor)) {
        materialize = await runMaterializePhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          chainId, log: pipeline.log, tag: `[${slug}]`, clockNow, ownRunId: runId,
          preWriteGate: makePreWriteGate({ descriptor, chainId, stepCtx, compute: runnable.compute, config: configValues }),
        });
        stepCtx.matched = materialize.matched;
        stepCtx.written = materialize.written;
        stepCtx.prior = materialize.prior;
        stepCtx.overrides = materialize.overrides;
        stepCtx.gate = materialize.gate;
        stepCtx.elapsed_ms = Date.now() - startMs;
        if (materialize.skipped || materialize.writeSkipped) {
          // Same reasoning as isCascadeStep's own gated skip / pre_write-fail narrowing
          // above — a MATERIALIZER shares the identical two failure-to-reach shapes.
          const positions = materialize.skipped ? ['pre'] : ['pre', 'pre_write'];
          onlyChecks = new Set(descriptor.checks.filter((c) => positions.includes(c.when)).map((c) => c.id));
          onlyWhen = positions;
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      } else if (isBackfillStep(descriptor)) {
        backfill = await runBackfillPhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          chainId, log: pipeline.log, tag: `[${slug}]`, clockNow,
          preWriteGate: makePreWriteGate({ descriptor, chainId, stepCtx, compute: runnable.compute, config: configValues }),
        });
        stepCtx.matched = backfill.matched;
        stepCtx.written = backfill.written;
        stepCtx.prior = backfill.prior;
        stepCtx.overrides = backfill.overrides;
        stepCtx.elapsed_ms = Date.now() - startMs;
        if (backfill.zeroWork || backfill.writeSkipped) {
          // ZERO-WORK COMPLETION narrows to `pre` only (mirrors every other
          // archetype's gated-skip narrowing) — this is NOT a skip_gated
          // terminal (R-P N/A), just a normal completion with fewer checks to
          // score. A pre_write-fail narrows to `pre` + `pre_write`, same
          // reasoning as isCascadeStep/isMaterializeStep above.
          const positions = backfill.zeroWork ? ['pre'] : ['pre', 'pre_write'];
          onlyChecks = new Set(descriptor.checks.filter((c) => positions.includes(c.when)).map((c) => c.id));
          onlyWhen = positions;
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      } else if (isRecorderStep(descriptor)) {
        recorder = await runRecorderPhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          chainId, log: pipeline.log, tag: `[${slug}]`, clockNow,
          preWriteGate: makePreWriteGate({ descriptor, chainId, stepCtx, compute: runnable.compute, config: configValues }),
        });
        stepCtx.matched = recorder.matched;
        stepCtx.written = recorder.written;
        stepCtx.prior = recorder.prior;
        stepCtx.overrides = recorder.overrides;
        stepCtx.elapsed_ms = Date.now() - startMs;
        if (recorder.writeSkipped) {
          // A RECORDER has no zero-work path (it always has work — recording
          // current state IS the work); only a pre_write-fail narrows the
          // scored checks, same reasoning as every other archetype's own
          // pre_write-fail narrowing above.
          const positions = ['pre', 'pre_write'];
          onlyChecks = new Set(descriptor.checks.filter((c) => positions.includes(c.when)).map((c) => c.id));
          onlyWhen = positions;
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      } else if (isEnrichStep(descriptor)) {
        enrich = await runEnrichPhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          chainId, log: pipeline.log, tag: `[${slug}]`, clockNow, ownRunId: runId,
          preWriteGate: makePreWriteGate({ descriptor, chainId, stepCtx, compute: runnable.compute, config: configValues }),
        });
        // WF3 enrich_parcels double-run incident (2026-09-07) — `runEnrichPhase`'s OWN
        // inner advisory lock (coupled to its shared-txn/post-commit connections, unlike
        // the outer `withAdvisoryLock` above which is already held by THIS connection)
        // found a genuinely concurrent invocation already working. Thrown here, INSIDE
        // the outer lock's callback, so `withAdvisoryLock` ROLLBACKs/releases the outer
        // lock's own connection normally; the outer catch block below (marked
        // `advisoryLockDenied`) converts this into the SAME self-skip terminal
        // `!lockResult.acquired` already produces — never a crash.
        if (enrich.lockDenied) {
          throw Object.assign(
            new Error(`[${slug}] enrich inner advisory lock held elsewhere`),
            { advisoryLockDenied: true },
          );
        }
        stepCtx.matched = enrich.matched;
        stepCtx.written = enrich.written;
        stepCtx.prior = enrich.prior;
        stepCtx.overrides = enrich.overrides;
        stepCtx.elapsed_ms = Date.now() - startMs;
        if (enrich.writeSkipped) {
          // Same reasoning as isCascadeStep/isMaterializeStep's own pre_write-fail
          // narrowing above — an ENRICHER shares the identical failure-to-reach shape.
          const positions = ['pre', 'pre_write'];
          onlyChecks = new Set(descriptor.checks.filter((c) => positions.includes(c.when)).map((c) => c.id));
          onlyWhen = positions;
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        } else if (enrich.deferred) {
          // Spec 122 §3.0b scope-defer — NOT a skip_gated terminal (the run still
          // executed to completion, it just made zero writes): narrows to `pre` only,
          // mirroring every other archetype's zero-work/gated-skip narrowing, since
          // `post` checks have no written subject to observe.
          onlyChecks = new Set(descriptor.checks.filter((c) => c.when === 'pre').map((c) => c.id));
          onlyWhen = ['pre'];
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      }

      // §5.5 (2) — `ctx.report()` is the ONLY observation path. A returned
      // `observations` object is NOT merged (fold D, pilot 1 output panel): two
      // paths meant a compute could bypass the declared-check guard above. The
      // return value carries `records_meta` / counters only.
      const computeResult = await runnable.compute(stepCtx);

      // R-T addendum (Spec 124 §2 Rule 13, commit 3) — the invariants[]/plausibility[]
      // EVERY_RUN executor. Runs AFTER compute (every checks[] observation is already
      // in hand) and BEFORE buildAuditTable, on the SAME pool the step already has
      // (Spec 122 §7.2's "same PoolClient" rule, extended to invariants/plausibility).
      // `validate_only` entries do NOT fire here — Fold A-1's own cost-adjudication
      // measured most candidates at tens of seconds to minutes, unsafe for the
      // run-end hook; those execute only from `step:validate --write` / chain-end
      // synthesis (Ask 6b). `onlyWhen` is the SAME gated-skip narrowing `onlyChecks`
      // just computed above (Fold A-3/B-2) — an `every_run` invariant must not fire
      // on a `skip_gated`/`writeSkipped`/zero-work run any more than a real check does.
      // EP-D17 (WF3, 2026-09-10, C1) — the ceiling an every_run entry inherits when
      // it declares no `statement_timeout` of its own. Before this, that entry took
      // the bare `pool.query` branch inside `executeEntry` and ran with NO ceiling at
      // all (`PIPELINE_STATEMENT_TIMEOUT_MS` defaults to 0), so the step's own
      // declared `execution.statement_timeout` bound nothing here — these run AFTER
      // `runnable.compute` returns, outside every pass/session-level SET this library
      // applies elsewhere. `step_post_check_statement_timeout_minutes` (new Rule-3
      // tunable) takes priority when a step declares it; the step's own
      // `execution.statement_timeout` is the fallback for a step that has not
      // (Rule 3 externalises this ONLY for the one declared consumer today,
      // enrich_parcels — a step that never reads the var is unaffected).
      const postCheckDefaultTimeoutMs = typeof configValues.step_post_check_statement_timeout_minutes === 'number'
        ? configValues.step_post_check_statement_timeout_minutes * 60000
        : parseDurationMs(descriptor.execution.statement_timeout);
      // OUTPUT-PANEL FIX F7 (MED, 2026-09-10) — caps simultaneous post-check clients;
      // see plausibility.js's runValidatorEntries docblock for the corrected pool-
      // headroom reasoning (link_wsib alone declares 9 entries).
      const postCheckConcurrency = typeof configValues.step_post_check_concurrency === 'number'
        ? configValues.step_post_check_concurrency
        : 4;

      // OUTPUT-PANEL FIX F2 (HIGH, 2026-09-10) — execution.maintenance now runs
      // BEFORE the run-end invariants[]/plausibility[] checks, not after. The
      // ORIGINAL ordering let the 5 bloat-sensitive post checks scan the heap the
      // step's own write phases had just bloated; C1's new declared ceiling turns
      // that "slow but eventually green" run into a loud FAIL, which is strictly
      // worse than the pre-fix behaviour for the exact runs this executor exists to
      // clean up first. Retired fence, stated honestly: the pre-fix code carried NO
      // ceiling on those checks at all, so a long scan simply ran to completion
      // (successfully, if slowly, per EP-D17's own grounded facts) — this reorder
      // does not merely restore that tolerance, it removes the NEED for it by
      // cleaning the heap before the checks that scan it ever run.
      //
      // F5 (MED) — keeps the step's own heartbeat/stall ticker ALIVE across the
      // maintenance call, on the SAME dedicated writer that already exists for this
      // purpose (`heartbeatClient`/`enrich_parcels_heartbeat_minutes`, EP-D15) —
      // never a new mechanism — and stops it again once maintenance returns, so a
      // long VACUUM does not open a silent, unmonitored window between the runner's
      // own ticker teardown and the step's final summary write. `heartbeatWriter`/
      // `heartbeatRunId`/`maintenanceHeartbeatMs` are `null`/`0` for every step but
      // enrich_parcels today (no other converted step declares `execution.maintenance`
      // or `enrich_parcels_heartbeat_minutes`), so `startHeartbeatTicker`'s own
      // `intervalMs <= 0` guard makes this a no-op everywhere else.
      const maintenanceHeartbeatMs = typeof configValues.enrich_parcels_heartbeat_minutes === 'number'
        ? Math.round(configValues.enrich_parcels_heartbeat_minutes * 60000)
        : 0;
      const stopMaintenanceHeartbeat = startHeartbeatTicker(
        pool, runId, () => (descriptor.execution.maintenance !== 'none' ? 'maintenance' : null),
        maintenanceHeartbeatMs, () => 0,
      );
      let maintenanceRows;
      try {
        // EP-D17 (WF3, 2026-09-10, C4) — rung (d): execution.maintenance's library
        // executor (previously a dead declared field — P11 grounding found zero
        // callers anywhere in scripts/lib). Runs AFTER the step's own write phases
        // (compute has already returned above, so enrich_parcels' shared passes-1-4
        // txn has committed and pass 5's post_commit write is done), never inside a
        // step-scoped transaction — the VACUUM/ANALYZE statement itself always runs
        // autocommit on its own dedicated connection (never `pool.query()` directly),
        // which is what makes the txn_scope:"step" relaxation (RE-FREEZE #6) safe. A
        // "none" declaration (every step but enrich_parcels, today) short-circuits to
        // an empty array — zero cost, zero rows, for every other converted step.
        maintenanceRows = await runMaintenance(
          pool, descriptor.execution.maintenance, configValues,
          { log: pipeline.log, tag: `[${slug}]` },
        );
      } finally {
        stopMaintenanceHeartbeat();
      }

      // batch2 P1.1 (Fold B-7) — a `kind:"distribution"` plausibility entry needs a
      // residential-scope predicate + a zone-bucket expression that is domain
      // knowledge, not derivable from the descriptor alone. A step's compute module
      // MAY export `DISTRIBUTION_SCOPE = {resScope, zoneExpr, fieldExprById,
      // percentileVar, medianMultiplierVar, medianFloorVar}` as a static property
      // (the same convention `descriptor`/`compute` are attached with in a frozen
      // shell) — generic infrastructure any future step can use, absent (undefined)
      // for every step that declares no kind:"distribution" entries today. The three
      // `*Var` fields (Rule 3 conformance, APS-conformance-gap) name REGISTERED
      // logic variables this step's own descriptor declares — resolved here from
      // `configValues` (never a literal baked at descriptor-generation time) and
      // passed as plain numbers; a step that declares none of the three (or no
      // DISTRIBUTION_SCOPE at all) gets `undefined`, and runDistributionScan's own
      // defaults (0.99/3/0.0001, the legacy literals) apply unchanged.
      const distributionScope = (runnable.compute && runnable.compute.DISTRIBUTION_SCOPE) || null;
      const distributionNumericOpts = distributionScope ? {
        percentile: typeof configValues[distributionScope.percentileVar] === 'number' ? configValues[distributionScope.percentileVar] : undefined,
        medianMultiplier: typeof configValues[distributionScope.medianMultiplierVar] === 'number' ? configValues[distributionScope.medianMultiplierVar] : undefined,
        medianFloor: typeof configValues[distributionScope.medianFloorVar] === 'number' ? configValues[distributionScope.medianFloorVar] : undefined,
      } : {};
      const invariantsRun = await runInvariants(pool, descriptor, { frequency: 'every_run', when: onlyWhen, defaultTimeoutMs: postCheckDefaultTimeoutMs, concurrency: postCheckConcurrency, resScope: distributionScope && distributionScope.resScope, zoneExpr: distributionScope && distributionScope.zoneExpr, fieldExprById: distributionScope && distributionScope.fieldExprById, ...distributionNumericOpts });
      const plausibilityRun = await runPlausibility(pool, descriptor, { frequency: 'every_run', when: onlyWhen, defaultTimeoutMs: postCheckDefaultTimeoutMs, concurrency: postCheckConcurrency, resScope: distributionScope && distributionScope.resScope, zoneExpr: distributionScope && distributionScope.zoneExpr, fieldExprById: distributionScope && distributionScope.fieldExprById, ...distributionNumericOpts });
      const synthetic = {
        checks: [...invariantsRun.checks, ...plausibilityRun.checks],
        observations: { ...invariantsRun.observations, ...plausibilityRun.observations },
      };
      // Lock 6 (EP-D17 C1) — one INFO duration_ms row PER EXECUTED invariants[]/
      // plausibility[] entry, keyed by entry id (Spec 48 §3.5's own `sys_duration_ms`
      // worked example is the precedent for a bare cost row, threshold null). Makes
      // §4.9's "self-announcing" posture apply to a category that had no cost
      // observability at all before this WF3 — a future entry cannot be added
      // without its cost becoming visible on the audit table.
      const postCheckDurationRows = [...synthetic.checks].map((c) => durationRow(c.id, (invariantsRun.observations[c.id] || plausibilityRun.observations[c.id] || {}).duration_ms));

      // `extraRows` carries exactly one thing and only on a failure path: the
      // `warn_row` posture's `prior_run_read_failed` row (LR-D2). It is NOT a declared
      // check because there is nothing for a compute to observe — the read failed
      // before any ctx existed — and declaring it would put a row on every healthy run
      // whose only possible value is "fine". Absent = the read succeeded.
      // R-A (2026-08-28) — one `retired_var_row_present` row per declared `config.retired[]`
      // entry, on EVERY run (not gated on the row still existing): absence is the
      // affirmative INFO signal that the retirement is complete, so the row must appear
      // whether it reads WARN or INFO.
      const extraRows = [
        ...(ingest && ingest.priorError ? [staleness.priorRunErrorRow(ingest.priorError)] : []),
        ...(linkColumn && linkColumn.priorError ? [staleness.priorRunErrorRow(linkColumn.priorError)] : []),
        ...configRetiredStatus.map(retiredVarRow),
        // LW-D15 — the declared dry-run posture, on every run that had one, INFO (never a
        // reason to fail — it is the point of the flag, not a defect it found).
        ...(stepCtx.overrides && stepCtx.overrides.dry_run ? [dryRunRow()] : []),
        // R-M / LG-17 — one row per destructive-retraction target this run actually
        // wrote a before-image for (link.beforeImage / linkKeyed.beforeImage /
        // cascade.beforeImage). LG-24 (link_keyed) extends this to a compound-write
        // target's own keyed-DELETE before-image, appended per batch (Fold B item 5).
        ...((link && link.beforeImage) || (linkKeyed && linkKeyed.beforeImage) || (cascade && cascade.beforeImage) || []).map(beforeImageRow),
        // EP-D17 (WF3, 2026-09-10, C1/C4) — per-entry cost rows for every executed
        // invariants[]/plausibility[] entry, plus one row per execution.maintenance
        // target (empty for every step but enrich_parcels today).
        ...postCheckDurationRows,
        ...maintenanceRows,
        // POST-B1-1 Observability fold — the pre_write gate's abort, said out loud
        // (§preWriteAbortRows). Absent on every run that did not abort.
        ...preWriteAbortRows([ingest, link, linkKeyed, linkColumn, cascade, materialize, backfill, recorder, enrich]),
        // Prerequisite 0h (Fold A F1) — the DECLARED skip-write stop, said out loud as a WARN
        // (§preWriteSkipRows). Absent on every run that did not skip-write. Placed AFTER the
        // abort rows so a legal FAIL-first run reads abort-then-nothing, never both.
        ...preWriteSkipRows([ingest]),
        // Prerequisite 0r (Fold IC-1) — the DECLARED HEAD-failure posture, said out loud as a
        // WARN (§headErrorRows). Absent on the default "fail_step" and on every healthy run.
        ...headErrorRows([ingest]),
        // EP-PHASE-DEADLINE / EP-PASS3-BACKLOG Observability fold — the deadline abort and
        // the fail-open retirement failure, each said out loud on the audit table rather
        // than only in a log line. Both absent on every healthy run.
        ...phaseDeadlineRows([enrich]),
        ...scopeRetireFailureRows([enrich]),
        // batch2 P1.1 — compute-supplied literal context rows (stepCtx.contextRow()),
        // e.g. assert_parcel_sanity's "residential_parcels_scanned" population row.
        // Empty for every step that never calls it.
        ...contextRows,
      ];
      const built = buildAuditTable(descriptor, chainId, observations, extraRows, configValues, onlyChecks, synthetic);
      // Observability fold — the deadline abort no longer THROWS (that is what cost the run
      // its audit table), so the ledger's `error_message` must be set here instead. Same
      // text the throw carried, so a reader of `pipeline_runs` sees no change in what the
      // failure says — only that the audit table now exists alongside it.
      if (enrich && enrich.phaseDeadline) errorMessage = enrich.phaseDeadline.message;
      // The counter SCOPE, per phase. §11's Counter Semantic Contract is a scoping
      // contract before it is a naming one: `written.e2.inserted` is only meaningful
      // because `written` is keyed BY DECLARED TARGET (LG-5), so "records_new" can mean
      // the upsert's inserts and not the clear's rewrites.
      const counterScope = link
        ? { matched: link.matched, cumulative: link.cumulative, written: link.written, gate: link.gate }
        : (linkColumn
          ? { matched: linkColumn.matched, cumulative: linkColumn.cumulative, written: linkColumn.written, gate: linkColumn.gate }
          : (linkKeyed
          ? { matched: linkKeyed.matched, cumulative: linkKeyed.cumulative, written: linkKeyed.written, gate: linkKeyed.gate }
          : (cascade
            ? { matched: cascade.matched, cumulative: cascade.cumulative, written: cascade.written, gate: cascade.gate }
            : (materialize
              ? { matched: materialize.matched, written: materialize.written, gate: materialize.gate }
              : (backfill
                ? { matched: backfill.matched, written: backfill.written }
                : (recorder
                  ? { matched: recorder.matched, written: recorder.written }
                  : (enrich
                    ? { matched: enrich.matched, written: enrich.written }
                    : (ingest ? { acquired: ingest.acquired, written: ingest.written } : null))))))));
      counters = (ingest && ingest.skipped) || (cascade && cascade.skipped) || (materialize && materialize.skipped)
        ? { records_total: null, records_new: null, records_updated: null }
        : deriveCounters(descriptor, computeResult, counterScope);

      // ── Terminal + status ───────────────────────────────────────────────────
      // `override.accept_anomaly[]` (ruling A-5): a standing override lets an
      // acknowledged run COMPLETE, and never suppresses the FAIL row that made it
      // necessary. So the rows are read first, then the acceptance is applied to the
      // STATUS only — which is exactly the fence the L7c abort encodes.
      const accepted = acceptedCheckIds(descriptor);
      const { failedIds, unaccepted } = partitionFailedRows(built.rows, accepted);
      const verdict = built.audit_table.verdict;
      let terminal;
      if (ingest && ingest.skipped) {
        status = RUN_STATUS.COMPLETED;
        terminal = selectTerminal(descriptor, { kind: 'skip_gated', status, discriminator: ingest.signal });
      } else if (cascade && cascade.skipped) {
        // LG-15 — the SAME shape as an ingest gated skip: a green `completed` row a
        // downstream HALT gate can read (DS4), never a bare SKIPPED with no audit_table.
        status = RUN_STATUS.COMPLETED;
        terminal = selectTerminal(descriptor, { kind: 'skip_gated', status, discriminator: 'skip' });
      } else if (materialize && materialize.skipped) {
        // LG-15 — same shape as the cascade gated skip, above.
        status = RUN_STATUS.COMPLETED;
        terminal = selectTerminal(descriptor, { kind: 'skip_gated', status, discriminator: 'skip' });
      } else if (enrich && enrich.deferred && verdict !== 'FAIL' && verdict !== 'WARN') {
        // Spec 122 §3.0b scope-defer — a genuine, correct, ZERO-WRITE outcome (never a
        // gated skip: the run executed to completion, it just deferred its writes to a
        // future --full run). `deferred_to_full` is its own ledger status (Spec 120
        // §3.2b vocabulary) — first wired to a runner here (ENRICHER pilot 9). Falls
        // back to the first `success` terminal (selectTerminal), same posture as the
        // WARN branch below, since this descriptor declares no defer-specific terminal.
        status = RUN_STATUS.DEFERRED_TO_FULL;
        terminal = selectTerminal(descriptor, { kind: 'success', status });
      } else if (linkColumn && linkColumn.zeroWork && verdict !== 'FAIL' && verdict !== 'WARN') {
        // A run whose eligible set was empty AND whose checks are all clean. Distinct from
        // the backfill branch below only in which phase produced the flag; identical in
        // posture (a normal `success` completion, never a skip_gated kind). On the measured
        // estate this does NOT fire — the cumulative link_rate stands WARN (LN-D7), so the
        // WARN branch claims the run and stamps `linked_with_warnings`. That is correct and
        // is why the terminal is declared rather than assumed unreachable.
        status = RUN_STATUS.COMPLETED;
        terminal = selectTerminal(descriptor, { kind: 'success', status, discriminator: 'no_eligible' });
      } else if (backfill && backfill.zeroWork && verdict !== 'FAIL' && verdict !== 'WARN') {
        // ZERO-WORK COMPLETION (R-P N/A — NOT a skip_gated kind, a normal
        // `success` completion with a distinct discriminated terminal id, so it
        // does not collide with the `backfilled`/`backfilled_with_warnings`
        // terminals on the same {kind, status} pair).
        status = RUN_STATUS.COMPLETED;
        terminal = selectTerminal(descriptor, { kind: 'success', status, discriminator: 'zero_work' });
      } else if (verdict === 'FAIL' && unaccepted.length === 0 && failedIds.size > 0) {
        status = RUN_STATUS.COMPLETED_WITH_ERRORS;
        terminal = selectTerminal(descriptor, { kind: 'success', status });
      } else if (verdict === 'FAIL') {
        status = RUN_STATUS.FAILED;
        terminal = selectTerminal(descriptor, { kind: 'fail_check', status, discriminator: unaccepted[0] });
      } else if (verdict === 'WARN') {
        status = RUN_STATUS.COMPLETED_WITH_WARNINGS;
        // The ACTUAL status, not `COMPLETED`. Passing the wrong one asked `terminals[]` a
        // question about a run that did not happen: a descriptor declaring a
        // `completed_with_warnings` success terminal could never have it selected, and one
        // declaring only `completed` got a match that claimed the run was clean. Selection
        // falls back to the first success terminal either way (§ selectTerminal), so this
        // is the declaration becoming answerable rather than a change of outcome.
        terminal = selectTerminal(descriptor, { kind: 'success', status });
      } else {
        status = RUN_STATUS.COMPLETED;
        terminal = selectTerminal(descriptor, { kind: 'success', status });
      }

      recordsMeta = {
        ...(computeResult && computeResult.records_meta ? computeResult.records_meta : {}),
        // A gated skip re-emits the PRIOR run's declared block (skeleton ← prior ←
        // pins) so the skip still lands a `completed` row a downstream HALT gate can
        // read (DS4). The compute DOES run on that path — with `ctx.checks` narrowed to
        // the `when: "pre"` ids, which is how a skip still says WHY it was allowed to
        // skip — but it returns `records_meta: {}` when `ctx.written` is null, so it
        // contributes no block of its own and this one is not overwriting anything.
        ...(ingest && ingest.skipped && ingest.emitKey ? { [ingest.emitKey]: ingest.emitBlock } : {}),
        // LG-15 / G-13 — a gated skip re-stamps the SAME self-consumed producer field
        // (`threshold_updated_at`-shaped: whatever the config_version trigger's emit_key
        // names) from the prior run's own block, so the NEXT run's config_version diff
        // still has a baseline to compare against — never silently dropped on a skip.
        ...(cascade && cascade.skipped && cascade.prior && typeof cascade.prior === 'object'
          ? Object.fromEntries(Object.entries(cascade.prior).filter(([k]) => /_updated_at$/.test(k)))
          : {}),
        ...(materialize && materialize.skipped && materialize.prior && typeof materialize.prior === 'object'
          ? Object.fromEntries(Object.entries(materialize.prior).filter(([k]) => /_updated_at$/.test(k)))
          : {}),
        // LPA-D4 — the ledger-gated-skip decision's WHY, ALSO on records_meta (rung (d),
        // belt-and-suspenders to the descriptor-level gate_decision check, rung (b)): every
        // archetype whose gate can genuinely skip (ingest's preAcquisitionDecision, cascade/
        // materialize's ledgerGatedSkip) gets one `staleness.gateRecordsMeta` call, ONE site
        // regardless of which archetype ran. `link` is excluded — `runLinkPhase` drives
        // `selectMode`'s tri-state full/incremental decision, never a skip.
        ...(ingest || cascade || materialize
          ? {
            gate: staleness.gateRecordsMeta(
              descriptor,
              stepCtx.gate,
              (cascade && cascade.gatedSkip) || (materialize && materialize.gatedSkip) || null,
            ),
          }
          : {}),
        // §1.2a P4 — "the value in force is observable in the run's records_meta".
        // Absent entirely for a `config: "none"` step, so the byte cost is paid only
        // by steps that actually consume a tunable (§1.2a P3).
        ...(configStamp ? { config: configStamp } : {}),
        ...(terminal ? { terminal: terminal.id } : {}),
        // LW-D13 — closed enum LEDGER_ROW_VALUES, above.
        ledger_row: owns ? LEDGER_ROW_VALUES[0] : LEDGER_ROW_VALUES[1],
        // R-U (Fold B-5) — always present (never `...(chainRunId ? {...} : {})`):
        // the seam pass and chain-end synthesis (scripts/lib/step/seam.js,
        // scripts/analysis/chain-end-synthesis.mjs) both query
        // `records_meta ? 'chain_run_id'` to find correlatable rows — a row
        // that OMITS the key on a standalone run would be indistinguishable
        // from a row this WF never touched, not one that is legitimately
        // uncorrelated. `null` is the honest, always-observable standalone
        // value (Rule 1: nothing hidden).
        chain_run_id: chainRunId,
        // Pilot 9 commit 8 P5(a), Spec 48 §3.10 — pool.on('error') events (pipeline.js's
        // attachPoolErrorLogger) COALESCE-merged in from the pool's own per-run counter,
        // not log-only: an idle-client error used to be visible ONLY on stdout, invisible
        // in the run's own persisted record (the exact "observability lives in the
        // pipeline's own records" gap §3.6 exists to close). 0 on the common case — always
        // present, never omitted when zero, matching chain_run_id's own "nothing hidden" rule.
        pool_errors: pool.__buildoPoolErrorCount ?? 0,
        // LW-D15 — declared, never inferred: a downstream reader must not have to guess
        // "were these counts real?" from the presence/absence of other fields.
        ...(stepCtx.overrides && stepCtx.overrides.dry_run ? { dry_run: true } : {}),
        // LPA-D6 (WF3-C) — `checks_failed`/`errors[]` are FAIL-only; `checks_warned`/
        // `warnings[]` are WARN-only (verdict.js's buildAuditTable now severity-separates
        // them, mirroring the un-converted scripts/quality/assert-data-bounds.js's own
        // established shape). `checks_passed: 'all'` requires BOTH empty — a WARN-only run
        // is not "all passed" (assert-data-bounds.js's `allMessages.length === 0` parity).
        checks_passed: (built.errors.length === 0 && built.warnings.length === 0) ? 'all' : undefined,
        checks_failed: built.errors.length,
        checks_warned: built.warnings.length,
        errors: built.errors.length > 0 ? built.errors : undefined,
        warnings: built.warnings.length > 0 ? built.warnings : undefined,
        audit_table: built.audit_table,
      };

      pipeline.emitSummary({ ...counters, records_meta: recordsMeta });
      const meta = deriveMeta(descriptor);
      pipeline.emitMeta(meta.reads, meta.writes, meta.external);

      // Thrown INSIDE the lock, AFTER the emit: the audit rows are already on
      // stdout, and the enclosing transaction rolls back — the Write-Audit-
      // Publish shape (§7.2), and the behaviour assert-schema.js:567 has today.
      if (built.blockingFailures.length > 0) {
        errorMessage = `blocking checks failed: ${built.blockingFailures.join(', ')}`;
        throw new Error(`[${slug}] ${errorMessage}`);
      }
    }, { skipEmit: false });

    if (!lockResult.acquired) {
      // The SKIP meta carries NO config stamp, deliberately: the terminal declares
      // `{skipped, reason}` and nothing ran on a resolved value. What `hoisted_above_gate`
      // buys is upstream of here — an out-of-bounds threshold has ALREADY thrown above
      // the lock, so it can never hide behind this green SKIPPED summary.
      status = RUN_STATUS.SELF_SKIPPED;
      // LW-D13 — ledger_row is a fact about THIS invocation's chainId, well-defined even
      // when the advisory lock was never acquired (no ledger row was opened, but ownership
      // of the CONTEXT is still an observable fact — never left unstamped on this path
      // just because the happy path is the one that got built first).
      // R-U (Fold B-5) — chain_run_id stamped on the contention-skip path too:
      // a lock-held skip is still a real chain-spawned (or standalone) row,
      // and the seam pass / chain-end synthesis must see the SAME key on
      // every row regardless of which branch produced it.
      recordsMeta = { ...skipRecordsMeta(descriptor, 'advisory_lock_held_elsewhere'), ledger_row: owns ? LEDGER_ROW_VALUES[0] : LEDGER_ROW_VALUES[1], chain_run_id: chainRunId, pool_errors: pool.__buildoPoolErrorCount ?? 0 };
      pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null, records_meta: recordsMeta });
    }
    return { status, recordsMeta, runId, acquired: lockResult.acquired };
  // `failed`, never `crashed`: this code ran and reached a verdict. The capture-
  // and-rethrow is the strand window's: the halt must still propagate, because
  // swallowing here would let a chain proceed past a step that failed.
  } catch (err) {
    if (err && err.advisoryLockDenied) return emitInnerLockDeniedSkip();
    errorMessage = errorMessage || (err && err.message ? err.message : String(err));
    status = RUN_STATUS.FAILED;
    windowError = err;
    throw err;
  } finally {
    if (owns) {
      if (await finalizeLedgerRow(pool, runId, {
        slug,
        status,
        durationMs: Date.now() - startMs,
        errorMessage,
        recordsMeta,
        recordsTotal: counters.records_total,
        recordsNew: counters.records_new,
        recordsUpdated: counters.records_updated,
      })) ledgerFinalized = true;
      await finalizeStrandedRun(pool, {
        runId,
        finalized: ledgerFinalized,
        slug,
        durationMs: Date.now() - startMs,
        error: windowError,
        log: pipeline.log,
      });
      // Window CLOSE, above. Inert unless the normal finalize did NOT land: the
      // helper's own `AND status = 'running'` predicate makes it a no-op on a row
      // some other path already closed, and it never throws out of a `finally`.
    }
  }
}

/**
 * Auto-run when the step file IS the process entry point.
 *
 * The frozen file shape (Spec 122 §5.1) permits no executable statement beyond
 * the `pipeline.step()` call, so `node scripts/<slug>.js` needs a trigger the
 * step file cannot spell. `require.main.exports === runnable` is the exact
 * discriminator claim #86 draws: a file being REQUIRED is not `require.main`,
 * so requiring still opens no pool. The check is deferred to `nextTick` because
 * `module.exports` is only assigned after this factory returns.
 */
function scheduleAutoRun(runnable) {
  process.nextTick(() => {
    if (!require.main || require.main.exports !== runnable) return;
    runnable.run().catch((err) => {
      pipeline.log.error(`[${runnable.descriptor.identity.name}]`, err, { phase: 'fatal' });
      process.exitCode = 1;
    });
  });
}

/**
 * @param {object} descriptor - validated against step.schema.json, or this throws
 * @param {(ctx: object) => Promise<{records_meta?: object}|void>} compute -
 *   reports observations ONLY via `ctx.report(checkId, observation)` (§5.5 (2));
 *   a returned `observations` key is ignored, never merged
 * @returns {{descriptor: object, compute: Function, run: (ctx?: object) => Promise<object>}}
 */
function step(descriptor, compute) {
  validateDescriptor(descriptor);
  if (typeof compute !== 'function') {
    throw new Error(`pipeline.step: compute for "${descriptor.identity.name}" must be a function (got ${typeof compute})`);
  }
  const runnable = {
    descriptor,
    compute,
    /**
     * @param {{pool?: import('pg').Pool, chainId?: string|null, chainRunId?: number|null}} [ctx]
     */
    run(ctx = {}) {
      if (ctx.pool) return runWithPool(runnable, ctx.pool, ctx);
      return pipeline.run(descriptor.identity.name, (pool) => runWithPool(runnable, pool, ctx));
    },
  };
  scheduleAutoRun(runnable);
  return runnable;
}

module.exports = {
  step,
  STEP_CTX_KEYS,
  LEDGER_ROW_VALUES,
  deriveMeta,
  deriveCounters,
  resolveCounterSource,
  skipRecordsMeta,
  assertDatabaseTarget,
  emitsList,
  selectTerminal,
  isIngestStep,
  isLinkStep,
  isLinkKeyedStep,
  isCascadeStep,
  isMaterializeStep,
  isBackfillStep,
  isRecorderStep,
  isEnrichStep,
  assertRequirements,
  probeRequirement,
  REQUIREMENT_PROBES,
  ledgerPipelineName,
  runIngestPhase,
  runLinkPhase,
  runLinkKeyedPhase,
  runLinkColumnPhase,
  runCascadePhase,
  runMaterializePhase,
  runBackfillPhase,
  runRecorderPhase,
  // WF3 2026-09-18 (Peel 2) — exported so the finite-or-throw arm can be driven directly
  // without standing up a whole runRecorderPhase call, mirroring startPhaseDeadline's own
  // export-for-testing rationale below.
  resolveRecorderBoundMinutes,
  remainingBudgetMs,
  connectPair,
  runEnrichPhase,
  recordHeartbeat,
  captureStallDiagnostic,
  startStallTicker,
  // batch-2 Phase 0.10 — exported so ER-D1's own both-directions lock can drive
  // the non-finite/zero/positive arms directly, without standing up a whole runner.
  startHeartbeatTicker,
  startPhaseDeadline,
  streamOverClient,
  runTierToConvergence,
  executeOrderedWrites,
  acceptedCheckIds,
  partitionFailedRows,
  preWriteAbortRows,
  preWriteSkipRows,
  headErrorRows,
  phaseDeadlineRows,
  scopeRetireFailureRows,
  makePreWriteGate,
  generateReset,
  assertBeforeImageDeclared,
  assertForceFullAuthorized,
  assertAdvisoryLockAvailable,
  applyGeneratedReset,
};
