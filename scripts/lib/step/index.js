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
const { runInvariants, runPlausibility } = require('./plausibility');

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
 */
async function assertRequirements(pool, descriptor, { log, tag }) {
  const requires = (descriptor.guards && descriptor.guards.requires) || [];
  const measured = {};
  for (const r of requires) {
    const probe = REQUIREMENT_PROBES[r.kind];
    if (!probe) continue; // rls_bypass_or_policy — measured by the write preflight
    const { rows } = await pool.query(probe.sql, probe.args(r));
    const present = rows.length > 0;
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
  // ONE source for the timeout (peel 8c): `execution.network.timeout_from_config` names
  // the logic variable, the resolved value wins, and the `timeout` literal is the stated
  // fallback for an un-seeded database rather than a second source of truth.
  const timeoutMs = acquire.resolveTimeoutMs(descriptor, config);
  const overrides = staleness.resolveOverrides(descriptor);
  const forced = overrides.force_run === true;
  const plan = write.buildWritePlan(writeSpec, descriptor);
  const keyColumn = plan.keys[0];

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

  // Dedupe BEFORE the upsert: `ON CONFLICT` cannot affect the same row twice in one
  // statement, so a duplicated source key is a hard error, not a warning, unguarded.
  const { kept, duplicateCount } = compute.dedupeBySourceId(result.features);
  // Read-only SQL, and it ran before the write in the pre-conversion loader too
  // (`pool.query(VALIDATION_SQL)` at 33786d1a:scripts/load-ravines.js:422). Its counters
  // are what L8 measures, which is why the pre_write gate sits immediately below it.
  const validated = await write.validateGeometries(pool, plan, kept, compute.validatorCounterDelta, { log, tag });
  const acquired = {
    ...result.acquired,
    feature_count: kept.length,
    duplicate_key_count: duplicateCount,
    invalid_geometry_repaired: validated.repaired,
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
    : { abort: false, failed: [] };
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

  const runAt = clockNow;
  const written = await write.executeWrite(pool, {
    plan,
    writeSpec,
    carried: validated.carried,
    columnValues: (row) => ({
      ...row,
      source_dataset_version: result.acquired.source_dataset_version,
      updated_at: runAt,
    }),
    shouldSkipDelete: compute.shouldSkipDelete,
    log,
    tag,
  });

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

    // ── writes[] IN ORDER: upsert THEN LG-24's keyed delete, ONE transaction
    //    (Fold B item 5) ──────────────────────────────────────────────────────
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
async function runMaterializePhase({ descriptor, pool, compute, config, chainId, log, tag, clockNow, preWriteGate }) {
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  const overrides = staleness.resolveOverrides(descriptor);
  const bypassed = overrides.force_full === true;

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
 * @returns {null|((phase: {acquired: object, prior: object|null, overrides: object}) =>
 *   Promise<{abort: boolean, failed: string[]}>)}
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
    const failed = built.rows
      .filter((r) => r.status === 'FAIL' && !accepted.has(r.metric))
      .map((r) => r.metric);
    return { abort: failed.length > 0, failed };
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

/** The SKIP terminal's records_meta — verdict row-derived like every other path (no hardcoded 'PASS'). */
function skipRecordsMeta(descriptor, reason) {
  const rows = [
    { metric: 'status', value: 'SKIPPED', threshold: null, status: 'INFO' },
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
      let onlyChecks = null;
      // R-T addendum (Fold A-3/B-2) — the SAME gated-skip narrowing a real `checks[]`
      // entry gets, extended to invariants[]/plausibility[]. `onlyChecks` narrows by id
      // (checks[]-scoped, unusable for a synthetic entry whose id lives in a different
      // space); `onlyWhen` narrows by the `when` VALUE itself, which both categories
      // share — set alongside `onlyChecks` in every branch below. null = unrestricted
      // (score every declared `when`), matching `onlyChecks`'s own null-means-everything.
      let onlyWhen = null;
      const drivesWrites = isIngestStep(descriptor) || isLinkStep(descriptor) || isLinkKeyedStep(descriptor)
        || isCascadeStep(descriptor) || isMaterializeStep(descriptor) || isBackfillStep(descriptor);
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
          chainId, log: pipeline.log, tag: `[${slug}]`, clockNow,
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
      const invariantsRun = await runInvariants(pool, descriptor, { frequency: 'every_run', when: onlyWhen });
      const plausibilityRun = await runPlausibility(pool, descriptor, { frequency: 'every_run', when: onlyWhen });
      const synthetic = {
        checks: [...invariantsRun.checks, ...plausibilityRun.checks],
        observations: { ...invariantsRun.observations, ...plausibilityRun.observations },
      };

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
        ...configRetiredStatus.map(retiredVarRow),
        // LW-D15 — the declared dry-run posture, on every run that had one, INFO (never a
        // reason to fail — it is the point of the flag, not a defect it found).
        ...(stepCtx.overrides && stepCtx.overrides.dry_run ? [dryRunRow()] : []),
        // R-M / LG-17 — one row per destructive-retraction target this run actually
        // wrote a before-image for (link.beforeImage / linkKeyed.beforeImage /
        // cascade.beforeImage). LG-24 (link_keyed) extends this to a compound-write
        // target's own keyed-DELETE before-image, appended per batch (Fold B item 5).
        ...((link && link.beforeImage) || (linkKeyed && linkKeyed.beforeImage) || (cascade && cascade.beforeImage) || []).map(beforeImageRow),
      ];
      const built = buildAuditTable(descriptor, chainId, observations, extraRows, configValues, onlyChecks, synthetic);
      // The counter SCOPE, per phase. §11's Counter Semantic Contract is a scoping
      // contract before it is a naming one: `written.e2.inserted` is only meaningful
      // because `written` is keyed BY DECLARED TARGET (LG-5), so "records_new" can mean
      // the upsert's inserts and not the clear's rewrites.
      const counterScope = link
        ? { matched: link.matched, cumulative: link.cumulative, written: link.written, gate: link.gate }
        : (linkKeyed
          ? { matched: linkKeyed.matched, cumulative: linkKeyed.cumulative, written: linkKeyed.written, gate: linkKeyed.gate }
          : (cascade
            ? { matched: cascade.matched, cumulative: cascade.cumulative, written: cascade.written, gate: cascade.gate }
            : (materialize
              ? { matched: materialize.matched, written: materialize.written, gate: materialize.gate }
              : (backfill
                ? { matched: backfill.matched, written: backfill.written }
                : (ingest ? { acquired: ingest.acquired, written: ingest.written } : null)))));
      counters = (ingest && ingest.skipped) || (cascade && cascade.skipped) || (materialize && materialize.skipped)
        ? { records_total: null, records_new: null, records_updated: null }
        : deriveCounters(descriptor, computeResult, counterScope);

      // ── Terminal + status ───────────────────────────────────────────────────
      // `override.accept_anomaly[]` (ruling A-5): a standing override lets an
      // acknowledged run COMPLETE, and never suppresses the FAIL row that made it
      // necessary. So the rows are read first, then the acceptance is applied to the
      // STATUS only — which is exactly the fence the L7c abort encodes.
      const failedIds = new Set(built.rows.filter((r) => r.status === 'FAIL').map((r) => r.metric));
      const accepted = acceptedCheckIds(descriptor);
      const unaccepted = [...failedIds].filter((id) => !accepted.has(id));
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
      recordsMeta = { ...skipRecordsMeta(descriptor, 'advisory_lock_held_elsewhere'), ledger_row: owns ? LEDGER_ROW_VALUES[0] : LEDGER_ROW_VALUES[1], chain_run_id: chainRunId };
      pipeline.emitSummary({ records_total: null, records_new: null, records_updated: null, records_meta: recordsMeta });
    }
    return { status, recordsMeta, runId, acquired: lockResult.acquired };
  // `failed`, never `crashed`: this code ran and reached a verdict. The capture-
  // and-rethrow is the strand window's: the halt must still propagate, because
  // swallowing here would let a chain proceed past a step that failed.
  } catch (err) {
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
  assertRequirements,
  REQUIREMENT_PROBES,
  ledgerPipelineName,
  runIngestPhase,
  runLinkPhase,
  runLinkKeyedPhase,
  runCascadePhase,
  runMaterializePhase,
  runBackfillPhase,
  runTierToConvergence,
  executeOrderedWrites,
  acceptedCheckIds,
  makePreWriteGate,
};
