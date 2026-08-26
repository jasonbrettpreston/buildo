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
    for (const w of descriptor.outputs.writes) writes[w.table] = w.columns.map((c) => c.name);
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
  return descriptor.outputs !== 'none'
    && Array.isArray(descriptor.outputs.writes)
    && descriptor.outputs.writes.length > 0
    && staleness.triggersAt(descriptor, 'pre_acquisition').length > 0
    && ((descriptor.inputs.reads.externals || []).some((e) => typeof e.url === 'string' && e.url.length > 0));
}

/**
 * The chain-scoped pipeline name run-chain records (`${chainId}:${slug}`). A
 * STANDALONE run must read the SAME history an in-chain run writes, or every manual
 * invocation looks like a first run and every drift guard degrades to "no baseline".
 * The fallback chain is the first declared `execution.invocation` key.
 */
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
 * @returns {Promise<object>} `{skipped, reason, terminal, acquired, written, prior, overrides, emitBlock}`
 */
async function runIngestPhase({ descriptor, pool, compute, config, fetchImpl, chainId, log, tag, clockNow }) {
  const writeSpec = descriptor.outputs.writes[0];
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
  const validated = await write.validateGeometries(pool, plan, kept, compute.validatorCounterDelta, { log, tag });
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
    reason: 'loaded',
    acquired: {
      ...result.acquired,
      feature_count: kept.length,
      duplicate_key_count: duplicateCount,
      invalid_geometry_repaired: validated.repaired,
      invalid_geometry_skipped: validated.skipped,
      geometry_collection_extracted: validated.collectionExtracted,
      skipped_keys: validated.skippedKeys,
    },
    written: { ...written, privilege: privilege[writeSpec.table] || null },
    prior,
    priorError,
    overrides,
    emitKey,
    emitBlock: null,
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
      let onlyChecks = null;
      if (isIngestStep(descriptor)) {
        // Spec 47 §R3.5 — the DB clock, captured ONCE, inside the lock. It becomes
        // the written rows' `updated_at`, so two rows from one run can never
        // straddle a second (or a midnight).
        const clockNow = await pipeline.getDbTimestamp(pool);
        ingest = await runIngestPhase({
          descriptor, pool, compute: runnable.compute, config: configValues,
          fetchImpl: stepCtx.fetch, chainId, log: pipeline.log, tag: `[${slug}]`, clockNow,
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
          // not-reported rows at their declared severity.
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
      counters = ingest && ingest.skipped
        ? { records_total: null, records_new: null, records_updated: null }
        : deriveCounters(descriptor, computeResult, ingest ? { acquired: ingest.acquired, written: ingest.written } : null);

      // ── Terminal + status ───────────────────────────────────────────────────
      // `override.accept_anomaly[]` (ruling A-5): a standing override lets an
      // acknowledged run COMPLETE, and never suppresses the FAIL row that made it
      // necessary. So the rows are read first, then the acceptance is applied to the
      // STATUS only — which is exactly the fence the L7c abort encodes.
      const failedIds = new Set(built.rows.filter((r) => r.status === 'FAIL').map((r) => r.metric));
      const accepted = new Set(
        staleness.acceptAnomalies(descriptor).filter((a) => a.standing).map((a) => a.check_id),
      );
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
        terminal = selectTerminal(descriptor, { kind: 'success', status: RUN_STATUS.COMPLETED });
      } else {
        status = RUN_STATUS.COMPLETED;
        terminal = selectTerminal(descriptor, { kind: 'success', status });
      }

      recordsMeta = {
        ...(computeResult && computeResult.records_meta ? computeResult.records_meta : {}),
        // A gated skip re-emits the PRIOR run's declared block (skeleton ← prior ←
        // pins) so the skip still lands a `completed` row a downstream HALT gate can
        // read (DS4) — the compute never runs on that path.
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
  ledgerPipelineName,
  runIngestPhase,
};
