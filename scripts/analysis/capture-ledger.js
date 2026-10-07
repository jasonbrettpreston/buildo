/**
 * capture-ledger — every step run the golden-capture harness (or an analysis script) spawns
 * leaves exactly ONE `pipeline_runs` row, identifiable as a capture.
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3 (golden-master differential)
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.2b (run-status vocabulary: `captured`)
 *
 * WHY (WF3 capture-ledger gap, 2026-10-06; tasks/lessons.md 2026-10-01; review_followups
 * "Golden captures can mutate data with no pipeline_runs row"): a step run under PIPELINE_CHAIN
 * skips its OWN ledger row (`scripts/lib/step/ledger.js` ownsLedgerRow — run-chain owns it), and
 * a legacy `pipeline.run()` step never writes one standalone, so a capture wrote real data with
 * no record. The parcels PRE capture of 2026-09-24 NULLed ~8.4K lot sizes untraceably.
 *
 * THE ROW (option D, operator ruling 2026-10-06):
 *   - `pipeline` = the BARE slug (Spec 47 §10.4 standalone form), never `<chain>:<slug>`;
 *   - `status`   = `captured`, the ONLY status this module writes. It is outside every
 *     baseline filter (`status IN ('completed','completed_with_warnings')` / `= 'completed'`),
 *     so a capture is never a prior, own_last, interrupted-retraction anchor or version
 *     baseline; and it is `<> 'completed'`, so `runLedgerGateDecision` counts it as upstream
 *     activity and a downstream gate RUNs (fail-safe: a capture causes more work, never less);
 *   - counters copied from the child's PIPELINE_SUMMARY verbatim, NULL when absent (the INSERT
 *     names every counter column, so the DB default 0 never substitutes);
 *   - `records_meta` = the child's records_meta + last PIPELINE_META (as run-chain does) + a
 *     `capture` stamp naming who recorded it and how the child ended (`child_status`).
 *   A row the step wrote ITSELF during a standalone run (a converted step's owned row, a legacy
 *   step's own INSERT, or a crashed child's stranded `running` row) is STAMPED with `capture`,
 *   never re-statused (EC-D10's ruling stands), so a run is never recorded twice.
 *   `CAPTURED` lives here, not in `RUN_STATUS`: no step ever writes it, and `scripts/lib/step/**`
 *   is hashed into every golden's `lib_fingerprint` (an edit there marks the fleet for recapture).
 *
 * The row is written AFTER the child exits (never a pre-spawn `running` row: lessons.md LW-D20),
 * from the parent, which is never traced. This module never writes `crashed` or `running`
 * (Spec 120 §3.2b: `crashed` has one writer, the reaper). It does NOT require `run-chain.js`:
 * that file installs a SIGINT handler that calls process.exit(1) at load.
 */
'use strict';

const { execFileSync } = require('child_process');
const { RUN_STATUS } = require('../lib/step/ledger');
const { MAX_ERROR_MESSAGE } = require('../lib/ledger-window');

/** The one status this module writes (Spec 120 §3.2b row `captured`). */
const CAPTURED = 'captured';

/** A child's own outcome, recorded in the stamp: the vocabulary minus the non-terminal and reaper statuses. */
const CHILD_STATUSES = Object.freeze(
  Object.values(RUN_STATUS).filter((s) => s !== RUN_STATUS.RUNNING && s !== RUN_STATUS.CRASHED),
);

const RECORDED_BY_HARNESS = 'harness';
const RECORDED_BY_STEP = 'step';

function toPosix(p) {
  return String(p).split('\\').join('/');
}

/**
 * The ledger slug for a spawned step. Candidates: every manifest `scripts[slug]` whose `file` is the
 * step's repo-relative path, then the descriptor's `identity.name`, then an explicit override. A named
 * candidate must be in the manifest set when that set is non-empty. Throws on a contradiction, on no
 * candidate, and on an ambiguous manifest (one file, several slugs: enrich-permits.js,
 * enrich-web-search.js) with no descriptor/override to pick one.
 * @param {{stepRel:string, manifest?:object|null, descriptor?:object|null, override?:string|null}} input
 * @returns {string}
 */
function resolveLedgerSlug({ stepRel, manifest = null, descriptor = null, override = null }) {
  const rel = toPosix(stepRel);
  let set = Object.entries((manifest && manifest.scripts) || {})
    .filter(([, e]) => e && toPosix(e.file || '') === rel)
    .map(([slug]) => slug);
  const named = [
    ['descriptor identity.name', descriptor && descriptor.identity && descriptor.identity.name ? String(descriptor.identity.name) : null],
    ['--ledger-slug', override ? String(override) : null],
  ];
  for (const [source, value] of named) {
    if (!value) continue;
    if (set.length > 0 && !set.includes(value)) {
      throw new Error(`[capture-ledger] REFUSING: ledger slug contradiction for ${rel}: ${source} "${value}" is not among [${set.join(', ')}]`);
    }
    set = [value];
  }
  if (set.length === 0) {
    throw new Error(`[capture-ledger] REFUSING: no ledger slug for ${rel} (no scripts/manifest.json entry, no descriptor identity.name); pass --ledger-slug=<slug>`);
  }
  if (set.length > 1) {
    throw new Error(`[capture-ledger] REFUSING: ambiguous ledger slug for ${rel}: [${set.join(', ')}]; pass --ledger-slug=<slug>`);
  }
  return set[0];
}

/** pre | post | trace_only | adhoc, from the harness invocation. Pure. */
function captureKind({ out = null, isPost = false, traceOnly = false }) {
  if (traceOnly) return 'trace_only';
  if (isPost) return 'post';
  if (out && toPosix(out).includes('/pre/')) return 'pre';
  return 'adhoc';
}

/**
 * How the child ended, as a closed value. A non-zero exit or a signal is `failed` (an in-process
 * observer never writes `crashed`). Otherwise the descriptor terminal the child stamped
 * (`records_meta.terminal` id -> `terminals[].status`) when it names a known status, else
 * `self_skipped` when `records_meta.skipped === true` (a lock skip), else `completed` (run-chain's
 * own posture for an exit-0 child). A non-zero exit or signal always wins.
 */
function childStatusOf({ exit_code, signal, summary, descriptor }) {
  if (exit_code !== 0 || signal) return RUN_STATUS.FAILED;
  const terminalId = summary && summary.records_meta ? summary.records_meta.terminal : null;
  const terminals = descriptor && Array.isArray(descriptor.terminals) ? descriptor.terminals : [];
  const t = terminalId ? terminals.find((x) => x && x.id === terminalId) : null;
  if (t && CHILD_STATUSES.includes(t.status)) return t.status;
  // A lock-contention skip says so in records_meta (scripts/lib/step/index.js skipRecordsMeta;
  // legacy scripts/lib/pipeline.js advisory-lock SKIP summary): it did no work.
  if (summary && summary.records_meta && summary.records_meta.skipped === true) return RUN_STATUS.SELF_SKIPPED;
  return RUN_STATUS.COMPLETED;
}

function errorMessageFor(childStatus, entry) {
  if (childStatus !== RUN_STATUS.FAILED) return null;
  const child = entry.child || {};
  const tail = String(child.stderr || '').trim().split('\n').slice(-5).join('\n');
  const msg = `capture child failed (exit ${child.exit_code}, signal ${child.signal ?? 'none'})${tail ? `: ${tail}` : ''}`;
  return msg.length > MAX_ERROR_MESSAGE ? `${msg.slice(0, MAX_ERROR_MESSAGE - 1)}…` : msg;
}

function counter(summary, key) {
  const v = summary ? summary[key] : undefined;
  return v === undefined || v === null ? null : v;
}

/**
 * One session entry, built at the spawn site right after the child exits.
 * @param {{run:number, kind:string, chain:string, win:{maxIdBefore:number, started_at:any}, completed_at:any,
 *   child:{exit_code:number|null, signal:string|null, stderr?:string}, markers:{summary:object|null, meta:object[]}}} input
 */
function sessionEntry({ run, kind, chain, win, completed_at, child, markers }) {
  return {
    run,
    kind,
    chain,
    maxIdBefore: win.maxIdBefore,
    started_at: win.started_at,
    completed_at,
    child: {
      exit_code: child.exit_code,
      signal: child.signal ?? null,
      stderr: child.stderr ?? '',
      summary: markers && markers.summary ? markers.summary : null,
      meta: markers && Array.isArray(markers.meta) ? markers.meta : [],
    },
  };
}

/** The capture stamp (`records_meta.capture`) for one session entry. */
function captureStamp(entry, ctx, recordedBy) {
  const child = entry.child || {};
  return {
    recorded_by: recordedBy,
    child_status: childStatusOf({ exit_code: child.exit_code, signal: child.signal, summary: child.summary, descriptor: ctx.descriptor }),
    exit_code: child.exit_code ?? null,
    signal: child.signal ?? null,
    harness: ctx.harness,
    chain: entry.chain,
    run: entry.run,
    kind: entry.kind,
    out: ctx.out ?? null,
    git_head: ctx.git_head ?? null,
    worktree_dirty: ctx.worktree_dirty ?? null,
  };
}

/** The INSERT row for one harness-recorded run. Pure. */
function harnessRunRow(entry, ctx) {
  const child = entry.child || {};
  const summary = child.summary || null;
  const stamp = captureStamp(entry, ctx, RECORDED_BY_HARNESS);
  const lastMeta = Array.isArray(child.meta) && child.meta.length > 0 ? child.meta[child.meta.length - 1] : null;
  const started = entry.started_at ? new Date(entry.started_at) : null;
  const completed = entry.completed_at ? new Date(entry.completed_at) : null;
  return {
    pipeline: ctx.slug,
    status: CAPTURED,
    started_at: entry.started_at ?? null,
    completed_at: entry.completed_at ?? null,
    duration_ms: started && completed ? Math.max(0, completed.getTime() - started.getTime()) : null,
    records_total: counter(summary, 'records_total'),
    records_new: counter(summary, 'records_new'),
    records_updated: counter(summary, 'records_updated'),
    records_meta: {
      ...(summary && summary.records_meta && typeof summary.records_meta === 'object' ? summary.records_meta : {}),
      ...(lastMeta ? { pipeline_meta: lastMeta } : {}),
      capture: stamp,
    },
    error_message: errorMessageFor(stamp.child_status, entry),
  };
}

/**
 * The row (if any) the step wrote ITSELF during this run. In-chain: always null; the step never
 * owns a row there (ownsLedgerRow), so no window match runs and a concurrent run-chain row can
 * never be claimed. Standalone: bare-slug rows with id past this run's own max(id) and started_at
 * inside its spawn window. One -> stamp it (a converted step's owned row, a legacy step's own
 * INSERT, a crashed child's stranded `running` row). Several -> the single `ledger_row = 'owned'`
 * one, else throw (a concurrent run of the same step; never guessed).
 * @returns {number|null} the row id to stamp, or null to INSERT
 */
function ownRowFor({ rows, slug, entry }) {
  if (entry.chain !== 'none') return null;
  const lo = entry.started_at ? new Date(entry.started_at).getTime() : -Infinity;
  const hi = entry.completed_at ? new Date(entry.completed_at).getTime() : Infinity;
  const inWindow = (rows || []).filter((r) => r
    && r.pipeline === slug
    && Number(r.id) > Number(entry.maxIdBefore)
    && new Date(r.started_at).getTime() >= lo
    && new Date(r.started_at).getTime() <= hi);
  if (inWindow.length === 0) return null;
  if (inWindow.length === 1) return Number(inWindow[0].id);
  const owned = inWindow.filter((r) => r.records_meta && r.records_meta.ledger_row === 'owned');
  if (owned.length === 1) return Number(owned[0].id);
  const ids = inWindow.map((r) => r.id).join(', ');
  throw new Error(`[capture-ledger] REFUSING: ${inWindow.length} ${slug} rows (ids ${ids}) inside run ${entry.run}'s spawn window: a concurrent run of the same step; not guessing which is ours`);
}

const WINDOW_SQL = 'SELECT COALESCE(max(id), 0)::int AS max_id, now() AS now_db FROM pipeline_runs';
const NOW_SQL = 'SELECT now() AS now_db';
const OWN_ROWS_SQL = `SELECT id, pipeline, started_at, records_meta FROM pipeline_runs
   WHERE id > $1 AND pipeline = $2 ORDER BY id`;
// completed_at is never NULL: source-version.js reads a NULL completed_at as 'infinity', which
// would keep every downstream ledger gate in RUN for good.
const INSERT_SQL = `INSERT INTO pipeline_runs
   (pipeline, status, started_at, completed_at, duration_ms, records_total, records_new, records_updated, records_meta, error_message)
   VALUES ($1, $2, $3, COALESCE($4, now()), $5, $6, $7, $8, $9::jsonb, $10) RETURNING id`;
const STAMP_SQL = `UPDATE pipeline_runs
   SET records_meta = COALESCE(records_meta, '{}'::jsonb) || jsonb_build_object('capture', $2::jsonb)
   WHERE id = $1`;

/** Read `max(id)` and the DB clock immediately before a spawn. */
async function openWindow(pool) {
  const r = await pool.query(WINDOW_SQL);
  return { maxIdBefore: r.rows[0].max_id, started_at: r.rows[0].now_db };
}

/**
 * Read the DB clock immediately after a child exits. Never throws: the caller evaluates this
 * inside `session.push(...)`, so a rejection would drop the run. A failed read is logged and
 * returns null; the INSERT then stamps `now()` (INSERT_SQL's COALESCE).
 */
async function closeWindow(pool, log = console.error) {
  try {
    const r = await pool.query(NOW_SQL);
    return r.rows[0].now_db;
  } catch (err) {
    log(`[capture-ledger] closeWindow failed (completed_at falls back to now() at flush): ${err.message}`);
    return null;
  }
}

async function writeSession(session, p, ctx) {
  const out = [];
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    for (const entry of session) {
      let ownId = null;
      if (entry.chain === 'none') {
        const rows = (await client.query(OWN_ROWS_SQL, [entry.maxIdBefore, ctx.slug])).rows;
        ownId = ownRowFor({ rows, slug: ctx.slug, entry });
      }
      if (ownId !== null) {
        await client.query(STAMP_SQL, [ownId, JSON.stringify(captureStamp(entry, ctx, RECORDED_BY_STEP))]);
        out.push({ id: ownId, recorded_by: RECORDED_BY_STEP });
      } else {
        const row = harnessRunRow(entry, ctx);
        const res = await client.query(INSERT_SQL, [
          row.pipeline, row.status, row.started_at, row.completed_at, row.duration_ms,
          row.records_total, row.records_new, row.records_updated, JSON.stringify(row.records_meta), row.error_message,
        ]);
        out.push({ id: Number(res.rows[0].id), recorded_by: RECORDED_BY_HARNESS });
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return out;
}

/**
 * Record every run in `session` in ONE transaction. An empty session is a strict no-op that never
 * creates a pool. The first call's promise is memoised on the session, so a second (or concurrent)
 * call returns it: an error-path `finally` or a signal can never double-insert. Errors throw
 * (after ROLLBACK).
 * @param {object[]} session
 * @param {{pool?:object|null, createPool?:Function|null, ctx:object}} deps
 * @returns {Promise<Array<{id:number, recorded_by:string}>>}
 */
function flushSession(session, { pool = null, createPool = null, ctx }) {
  if (session.flushing) return session.flushing;
  session.flushing = (async () => {
    if (session.length === 0) return [];
    const p = pool || createPool();
    try {
      return await writeSession(session, p, ctx);
    } finally {
      if (!pool) await p.end();
    }
  })();
  return session.flushing;
}

/**
 * The error path: flush what the session holds. The original error wins: a flush failure is
 * logged beside it, never instead of it, and this never throws. A null flush (no session yet)
 * is a no-op.
 * @returns {Promise<Array<{id:number, recorded_by:string}>|null>}
 */
async function flushAfterError(flush, log = console.error) {
  if (!flush) return null;
  try {
    return await flush();
  } catch (flushErr) {
    log(`[capture-ledger] ledger flush ALSO failed (the error above wins): ${flushErr.stack || flushErr.message}`);
    return null;
  }
}

/**
 * SIGINT/SIGTERM latch. Replaces Node's default kill-on-signal so a Ctrl-C between a child's exit
 * and the flush cannot drop the run. The FIRST signal only latches: it never flushes while a child
 * is in flight. The child gets the same console signal and exits, its run is appended, and the
 * caller's error path flushes (the caller checks `latched()` before spawning anything new). A
 * SECOND signal flushes what the session holds and re-raises. SIGKILL/OOM cannot be caught and
 * stay a declared residual.
 * @returns {{latched:()=>string|null, dispose:()=>void}}
 */
function installSignalLatch({ signalSource = process, flush, reraise = null, log = console.error }) {
  let latched = null;
  const onInt = () => handler('SIGINT');
  const onTerm = () => handler('SIGTERM');
  const dispose = () => {
    signalSource.removeListener('SIGINT', onInt);
    signalSource.removeListener('SIGTERM', onTerm);
  };
  const doReraise = reraise || ((sig) => { dispose(); process.kill(process.pid, sig); });
  function handler(sig) {
    if (latched) {
      Promise.resolve().then(flush).catch((err) => log(`[capture-ledger] flush on second ${sig} failed: ${err.message}`))
        .finally(() => doReraise(sig));
      return;
    }
    latched = sig;
    log(`[capture-ledger] ${sig} latched: waiting for the child to exit so its run is recorded (send again to stop now)`);
  }
  signalSource.on('SIGINT', onInt);
  signalSource.on('SIGTERM', onTerm);
  return { latched: () => latched, dispose };
}

/** git provenance for the stamp. Never throws: a missing git is recorded as null. */
function gitState(cwd) {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim().length > 0;
    return { git_head: head, worktree_dirty: dirty };
  } catch {
    return { git_head: null, worktree_dirty: null };
  }
}

module.exports = {
  CAPTURED,
  CHILD_STATUSES,
  resolveLedgerSlug,
  captureKind,
  childStatusOf,
  sessionEntry,
  captureStamp,
  harnessRunRow,
  ownRowFor,
  openWindow,
  closeWindow,
  flushSession,
  flushAfterError,
  installSignalLatch,
  gitState,
  INSERT_SQL,
  STAMP_SQL,
};
