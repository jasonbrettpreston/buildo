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
 *   8. `ctx.config` — the declared logic variables, resolved and bounds-checked
 *      BEFORE compute, stamped into `records_meta.config`     (§1.2a P4, config.js)
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
const { resolveConfig } = require('./config');
const staleness = require('./staleness');
const acquire = require('./acquire');
const write = require('./write');
const { finalizeStrandedRun } = require('../ledger-window');

/** The `config: "none"` projection — one shared frozen empty object, never a fresh `{}` per run. */
const EMPTY_CONFIG = Object.freeze(Object.create(null));

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
  return Boolean(descriptor.execution && descriptor.execution.shape === 'link');
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
async function runLinkPhase({ descriptor, pool, compute, config, chainId, log, tag, clockNow, preWriteGate }) {
  const requirements = await assertRequirements(pool, descriptor, { log, tag });
  const prior = await staleness.readPriorEmit(pool, ledgerPipelineName(descriptor, chainId), null);
  const overrides = staleness.resolveOverrides(descriptor);
  const gate = await staleness.selectMode({ descriptor, pool, prior });
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
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    if (!write.retractionFires(plan, gate.mode)) continue;
    const removed = await pipeline.withTransaction(pool, (client) => write.executeRetraction(client, plan));
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
    if (rows.length > 0) await executeOrderedWrites(pool, plans, rows, clockNow, written, specs);

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
    matched[k] = Number(row[k]);
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

async function runWithPool(runnable, pool, ctx) {
  const descriptor = runnable.descriptor;
  const slug = descriptor.identity.name;
  const chainId = ctx.chainId !== undefined ? ctx.chainId : (process.env.PIPELINE_CHAIN || null);
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
    if (hoisted) ({ values: configValues, stamp: configStamp } = await resolveConfig(pool, descriptor));

    // §4.1 ② — txn-scoped advisory lock on identity.lock. `skipEmit: false`
    // because the SKIP summary is the library's to emit: the SDK's built-in one
    // carries no audit_table, which is what makes a contention skip land as
    // verdict UNKNOWN today instead of a row-derived verdict.
    const lockResult = await pipeline.withAdvisoryLock(pool, descriptor.identity.lock, async () => {
      if (declaresConfig && !hoisted) {
        ({ values: configValues, stamp: configStamp } = await resolveConfig(pool, descriptor));
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
      let onlyChecks = null;
      const drivesWrites = isIngestStep(descriptor) || isLinkStep(descriptor);
      // Spec 47 §R3.5 / B-11 — the DB clock, captured ONCE, inside the lock, for
      // WHICHEVER phase drives the write. One capture is not a tidiness preference: it is
      // what makes the written timestamp a single watermark, so two batches of one run
      // cannot straddle a second (or a midnight) and a downstream consumer scoping on
      // `> last_stamp` cannot see half a run.
      const clockNow = drivesWrites ? await pipeline.getDbTimestamp(pool) : null;
      if (isLinkStep(descriptor)) {
        link = await runLinkPhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          chainId, log: pipeline.log, tag: `[${slug}]`, clockNow,
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
          stepCtx.checks = stepCtx.checks.filter((id) => onlyChecks.has(id));
        }
      }

      // §5.5 (2) — `ctx.report()` is the ONLY observation path. A returned
      // `observations` object is NOT merged (fold D, pilot 1 output panel): two
      // paths meant a compute could bypass the declared-check guard above. The
      // return value carries `records_meta` / counters only.
      const computeResult = await runnable.compute(stepCtx);

      // `extraRows` carries exactly one thing and only on a failure path: the
      // `warn_row` posture's `prior_run_read_failed` row (LR-D2). It is NOT a declared
      // check because there is nothing for a compute to observe — the read failed
      // before any ctx existed — and declaring it would put a row on every healthy run
      // whose only possible value is "fine". Absent = the read succeeded.
      const extraRows = ingest && ingest.priorError ? [staleness.priorRunErrorRow(ingest.priorError)] : [];
      const built = buildAuditTable(descriptor, chainId, observations, extraRows, configValues, onlyChecks);
      // The counter SCOPE, per phase. §11's Counter Semantic Contract is a scoping
      // contract before it is a naming one: `written.e2.inserted` is only meaningful
      // because `written` is keyed BY DECLARED TARGET (LG-5), so "records_new" can mean
      // the upsert's inserts and not the clear's rewrites.
      const counterScope = link
        ? { matched: link.matched, cumulative: link.cumulative, written: link.written, gate: link.gate }
        : (ingest ? { acquired: ingest.acquired, written: ingest.written } : null);
      counters = ingest && ingest.skipped
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
        // §1.2a P4 — "the value in force is observable in the run's records_meta".
        // Absent entirely for a `config: "none"` step, so the byte cost is paid only
        // by steps that actually consume a tunable (§1.2a P3).
        ...(configStamp ? { config: configStamp } : {}),
        ...(terminal ? { terminal: terminal.id } : {}),
        checks_passed: built.errors.length === 0 ? 'all' : undefined,
        checks_failed: built.errors.length,
        errors: built.errors.length > 0 ? built.errors : undefined,
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
      recordsMeta = skipRecordsMeta(descriptor, 'advisory_lock_held_elsewhere');
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
     * @param {{pool?: import('pg').Pool, chainId?: string|null}} [ctx]
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
  deriveMeta,
  deriveCounters,
  resolveCounterSource,
  skipRecordsMeta,
  assertDatabaseTarget,
  emitsList,
  selectTerminal,
  isIngestStep,
  isLinkStep,
  assertRequirements,
  REQUIREMENT_PROBES,
  ledgerPipelineName,
  runIngestPhase,
  runLinkPhase,
  executeOrderedWrites,
  acceptedCheckIds,
  makePreWriteGate,
};
