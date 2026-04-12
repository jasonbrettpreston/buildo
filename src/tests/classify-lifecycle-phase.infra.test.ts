// 🔗 SPEC LINK: docs/reports/lifecycle_phase_implementation.md §2.3 §2.4 §3.3
//
// File-shape infra tests for the lifecycle-phase pipeline scripts and
// their chain wiring. These tests do not hit a live DB — they regex
// the script source, locking in the shape contracts that the classifier
// (scripts/classify-lifecycle-phase.js), the CoA linker's last_seen_at
// bump (scripts/link-coa.js), and the chain manifest (scripts/manifest.json)
// must all obey.
//
// Why regex instead of live-DB integration:
//   - Matches the pattern of every other *.infra.test.ts file in this
//     repo (compute-cost-estimates.infra.test.ts, etc.)
//   - Deterministic, fast, runs in CI without postgres
//   - Catches the shape-level regressions that are the actual failure
//     mode — e.g., dropping the IS DISTINCT FROM guard, regressing the
//     O(n²) split_part subquery, forgetting the trigger chain step
//
// End-to-end correctness is covered separately by the SQL round-trip
// reproducer (scripts/quality/lifecycle-phase-sql-reproducer.sql) that
// runs against the live backfilled DB.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) =>
  fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

describe('scripts/classify-lifecycle-phase.js — pipeline shape', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/classify-lifecycle-phase.js');
  });

  it('uses pipeline.run wrapper with correct name', () => {
    expect(content).toMatch(
      /pipeline\.run\(\s*['"]classify-lifecycle-phase['"]/,
    );
  });

  it('imports the dual-code-path pure function from scripts/lib/lifecycle-phase.js', () => {
    expect(content).toMatch(
      /require\(\s*['"]\.\/lib\/lifecycle-phase['"]\s*\)/,
    );
    expect(content).toMatch(/classifyLifecyclePhase/);
    expect(content).toMatch(/classifyCoaPhase/);
  });

  it('filters dirty permits incrementally via lifecycle_classified_at vs last_seen_at', () => {
    expect(content).toMatch(/lifecycle_classified_at IS NULL/);
    expect(content).toMatch(/last_seen_at\s*>\s*lifecycle_classified_at/);
  });

  it('drops the O(n²) correlated split_part is_orphan subquery', () => {
    // The legacy query had a correlated subquery that matched
    // split_part(s.permit_num,' ',1) on both sides. That made the
    // dirty-permits query O(n²) over 243K rows and ran for hours.
    // The fix: do orphan detection in JS using a Map.
    const dirtyBlockMatch = content.match(
      /const\s+dirtyPermitsQuery[\s\S]*?`([\s\S]*?)`/,
    );
    // The refactored version no longer defines `dirtyPermitsQuery` as a
    // named const — it inlines the simple SELECT. Assert there is NO
    // correlated subquery over `permits s` with split_part.
    expect(content).not.toMatch(
      /SELECT\s+1\s+FROM\s+permits\s+s[\s\S]*?split_part\(s\.permit_num/,
    );
    // Sanity: dirty permits are loaded as a simple select
    expect(content).toMatch(
      /SELECT\s+permit_num,\s*revision_num,\s*status,\s*enriched_status,\s*issued_date,\s*last_seen_at[\s\S]*?FROM\s+permits/,
    );
    // The match above is just for the dead/live check
    void dirtyBlockMatch;
  });

  it('builds an in-memory BLD/CMB prefix Map for orphan detection', () => {
    expect(content).toMatch(/bldCmbByPrefix/);
    expect(content).toMatch(/new Map\(\)/);
    // Only fetches BLD/CMB permits, not all 243K
    expect(content).toMatch(
      /split_part\(permit_num,\s*' ',\s*3\)\s+IN\s+\('BLD','CMB'\)/,
    );
  });

  it('builds inspection rollup via SQL aggregation (WF3 Bug #2)', () => {
    expect(content).toMatch(/inspByPermit/);
    // WF3: replaced full-table-load + JS-side rollup with SQL-side
    // DISTINCT ON + GROUP BY. Postgres returns ~10K pre-aggregated
    // rows instead of the full 94K raw table.
    expect(content).toMatch(/DISTINCT ON \(permit_num\)/);
    expect(content).toMatch(/BOOL_OR\(status\s*=\s*'Passed'\)/);
    expect(content).toMatch(/GROUP BY permit_num/);
    // Assert no full-table-load pattern (the old approach)
    expect(content).not.toMatch(
      /SELECT\s+permit_num,\s*stage_name,\s*status,\s*inspection_date\s+FROM\s+permit_inspections[^G]/,
    );
  });

  it('wraps permit UPDATE writes in a single transaction via pipeline.withTransaction', () => {
    expect(content).toMatch(/pipeline\.withTransaction\(/);
  });

  it('uses IS DISTINCT FROM guards for permit UPDATE idempotency', () => {
    expect(content).toMatch(/p\.lifecycle_phase IS DISTINCT FROM v\.phase/);
    expect(content).toMatch(
      /p\.lifecycle_stalled IS DISTINCT FROM v\.stalled/,
    );
  });

  it('uses IS DISTINCT FROM guard for CoA UPDATE idempotency', () => {
    expect(content).toMatch(
      /ca\.lifecycle_phase IS DISTINCT FROM v\.phase/,
    );
  });

  it('bumps lifecycle_classified_at on already-correct rows to prevent re-examination', () => {
    // After the batch UPDATE, rows whose phase was already correct
    // won't be touched by the UPDATE (IS DISTINCT FROM is false), so
    // we need a second pass to bump classified_at. Otherwise every
    // run re-examines the same 243K rows.
    expect(content).toMatch(
      /UPDATE permits[\s\S]*?SET\s+lifecycle_classified_at\s*=\s*NOW\(\)/,
    );
    expect(content).toMatch(/unnest\(/);
  });

  it('enforces blocking unclassified threshold of 100', () => {
    // The CQA gate: unclassified_count > 100 throws, failing the
    // pipeline_runs row. Excludes dead/terminal/null statuses.
    expect(content).toMatch(/unclassifiedCount\s*<=\s*100/);
    expect(content).toMatch(/status IS NOT NULL/);
    expect(content).toMatch(/BLOCKING/);
    expect(content).toMatch(
      /throw new Error\([\s\S]*?unclassified[\s\S]*?threshold/,
    );
  });

  it('logs top unhandled statuses when unclassified threshold fails', () => {
    expect(content).toMatch(/unclassifiedByStatus/);
    expect(content).toMatch(/GROUP BY status/);
    expect(content).toMatch(/ORDER BY n DESC/);
  });

  it('emits PIPELINE_SUMMARY with records_total, records_new, records_updated', () => {
    expect(content).toMatch(/pipeline\.emitSummary\(/);
    expect(content).toMatch(/records_total/);
    expect(content).toMatch(/records_new/);
    expect(content).toMatch(/records_updated/);
  });

  it('emits records_meta with phase_distribution + unclassified_count + audit_table', () => {
    expect(content).toMatch(/phase_distribution/);
    expect(content).toMatch(/coa_distribution/);
    expect(content).toMatch(/stalled_count/);
    expect(content).toMatch(/unclassified_count/);
    expect(content).toMatch(/audit_table/);
  });

  it('emits PIPELINE_META with reads + writes maps', () => {
    expect(content).toMatch(/pipeline\.emitMeta\(/);
    expect(content).toMatch(/permit_inspections/);
    expect(content).toMatch(/lifecycle_phase/);
    expect(content).toMatch(/lifecycle_stalled/);
    expect(content).toMatch(/lifecycle_classified_at/);
  });
});

describe('scripts/classify-lifecycle-phase.js — concurrency guard (advisory lock)', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/classify-lifecycle-phase.js');
  });

  it('acquires advisory lock 85 on a DEDICATED client (WF3 Bug #1)', () => {
    // WF3: pool.query for advisory lock uses ephemeral connections
    // that can be reaped by idleTimeoutMillis (10s default) during
    // the 20-60s CPU-bound Map-building phase. Dedicated client
    // stays checked out (not idle) for the full run.
    expect(content).toMatch(/ADVISORY_LOCK_ID\s*=\s*85/);
    expect(content).toMatch(/pool\.connect\(\)/);
    expect(content).toMatch(/lockClient\.query[\s\S]*?pg_try_advisory_lock/);
    // Must NOT use pool.query for the lock (tight window to avoid
    // cross-file false positives from pool.query elsewhere in the file)
    expect(content).not.toMatch(/pool\.query\([^)]*pg_try_advisory_lock/);
  });

  it('releases advisory lock on the SAME dedicated client in finally block', () => {
    expect(content).toMatch(/lockClient\.query[\s\S]*?pg_advisory_unlock/);
    expect(content).toMatch(/lockClient\.release\(\)/);
    expect(content).toMatch(/finally\s*\{/);
  });

  it('emits a no-op summary and exits 0 when another instance holds the lock', () => {
    // The skipped-run summary must have skipped:true so operators
    // can distinguish "ran but did nothing" from "skipped due to lock".
    expect(content).toMatch(/skipped:\s*true/);
    expect(content).toMatch(/advisory_lock_held_elsewhere/);
  });

  it('uses per-batch small transactions instead of a single mega-transaction', () => {
    // Adversarial review C2: the prior design wrapped all 484 batches
    // in one BEGIN/COMMIT, holding row-level locks for ~130s. The fix
    // is per-batch withTransaction calls inside the batch loop.
    // Assert there is NO `pipeline.withTransaction` call that wraps
    // the for-loop (the old pattern) and that the withTransaction
    // call IS inside the loop body.
    //
    // The cleanest check: the content must contain a sequence where
    // `for (... batches ...)` precedes `pipeline.withTransaction` — i.e.,
    // the transaction is per-iteration.
    const forLoopBeforeWithTx =
      /for\s*\([^)]*batches[^)]*\)[\s\S]{0,200}?pipeline\.withTransaction/;
    expect(content).toMatch(forLoopBeforeWithTx);
  });

  it('runs phase UPDATE and classified_at stamp in the same transaction per batch', () => {
    // Independent review Defect 1: the prior design stamped
    // unchanged rows OUTSIDE the transaction, creating a consistency
    // gap on partial failure. The fix runs both inside withTransaction.
    // The batch UPDATE sql/params are constructed before the
    // withTransaction call, so the regex looks for the pattern:
    //   withTransaction ... client.query(sql, params)    // phase
    //                    ... client.query(...stamp SQL)  // classified_at
    // inside the same callback body. No `pool.query` between them.
    const stampInsideTx =
      /pipeline\.withTransaction\(pool,\s*async\s*\(client\)\s*=>\s*\{[\s\S]*?client\.query\(sql,\s*params\)[\s\S]*?client\.query\([\s\S]*?SET\s+lifecycle_classified_at\s*=\s*NOW\(\)[\s\S]*?\}\)/;
    expect(content).toMatch(stampInsideTx);
    // Also assert the stamp UPDATE is NOT called outside a
    // withTransaction via `pool.query` anywhere in the file.
    expect(content).not.toMatch(
      /pool\.query\([\s\S]{0,300}?SET\s+lifecycle_classified_at\s*=\s*NOW\(\)/,
    );
  });

  it('uses TRIM(status) in the unclassified-count gate', () => {
    expect(content).toMatch(/AND TRIM\(status\) <> ''/);
  });

  it('imports DEAD_STATUS_ARRAY from shared lib instead of hardcoding (WF3 Bug #4)', () => {
    // The dead-status list was hardcoded in 3 places (JS pure fn,
    // classifier SQL, assertion SQL). Now both scripts import the
    // canonical array from scripts/lib/lifecycle-phase.js.
    expect(content).toMatch(/require\(['"]\.\/lib\/lifecycle-phase['"]\)/);
    expect(content).toMatch(/DEAD_STATUS_ARRAY/);
    // Must NOT have inline NOT IN with the 13 dead statuses
    expect(content).not.toMatch(
      /NOT IN[\s\S]*?'Cancelled'[\s\S]*?'Revoked'[\s\S]*?'Permit Revoked'/,
    );
    // Uses parameterized $1::text[] instead
    expect(content).toMatch(/<> ALL\(\$1::text\[\]\)/);
  });

  it('checks CoA unclassified count in addition to permits (WF3 Bug #3)', () => {
    expect(content).toMatch(/coa_applications[\s\S]*?lifecycle_phase IS NULL/);
    expect(content).toMatch(/NORMALIZED_DEAD_DECISIONS_ARRAY/);
  });
});

describe('scripts/link-coa.js — permits.last_seen_at bump for downstream re-classification', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/link-coa.js');
  });

  it('bumps permits.last_seen_at on newly-linked permits', () => {
    // The lifecycle classifier's incremental re-classification query
    // uses `last_seen_at > lifecycle_classified_at`. If link-coa.js
    // doesn't bump permits.last_seen_at on the permit side, newly
    // linked CoAs would not trigger re-classification of their permit.
    expect(content).toMatch(/permits\.last_seen_at/);
    expect(content).toMatch(
      /UPDATE\s+permits[\s\S]*?SET\s+last_seen_at\s*=\s*NOW\(\)/,
    );
  });

  it('guards the bump with an idempotency predicate to avoid thundering-herd last_seen updates', () => {
    // The guard filters on (a) the linker-run startTime window, and
    // (b) a 1-second buffer so a row bumped moments ago by the same
    // transaction isn't re-bumped.
    expect(content).toMatch(/INTERVAL\s+'1 second'/);
  });
});

describe('scripts/manifest.json — chain integration', () => {
  let manifest: {
    scripts: Record<string, unknown>;
    chains: Record<string, string[]>;
  };
  beforeAll(() => {
    manifest = JSON.parse(read('scripts/manifest.json'));
  });

  it('registers classify_lifecycle_phase with the correct script path', () => {
    expect(manifest.scripts.classify_lifecycle_phase).toBeDefined();
    const entry = manifest.scripts.classify_lifecycle_phase as {
      file: string;
      telemetry_tables: string[];
    };
    expect(entry.file).toBe('scripts/classify-lifecycle-phase.js');
    expect(entry.telemetry_tables).toContain('permits');
    expect(entry.telemetry_tables).toContain('coa_applications');
  });

  it('has no trigger_lifecycle_sync entry (dropped per adversarial C3)', () => {
    // The trigger script was deleted in favour of wiring
    // classify_lifecycle_phase directly as a chain step. Keeping this
    // assertion catches accidental resurrection of the detached handoff.
    expect(manifest.scripts.trigger_lifecycle_sync).toBeUndefined();
  });

  it('permits chain ends with classify_lifecycle_phase', () => {
    const permitsChain = manifest.chains.permits;
    expect(permitsChain).toBeDefined();
    expect(Array.isArray(permitsChain)).toBe(true);
    const steps = permitsChain as string[];
    expect(steps[steps.length - 1]).toBe('classify_lifecycle_phase');
    expect(steps).not.toContain('trigger_lifecycle_sync');
  });

  it('coa chain ends with classify_lifecycle_phase', () => {
    const coaChain = manifest.chains.coa;
    expect(coaChain).toBeDefined();
    expect(Array.isArray(coaChain)).toBe(true);
    const steps = coaChain as string[];
    expect(steps[steps.length - 1]).toBe('classify_lifecycle_phase');
    expect(steps).not.toContain('trigger_lifecycle_sync');
  });
});

describe('scripts/quality/lifecycle-phase-sql-reproducer.sql — correctness gate shape', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/quality/lifecycle-phase-sql-reproducer.sql');
  });

  it('precomputes BLD/CMB prefix CTE instead of using correlated subquery', () => {
    // Same O(n²) vs O(n) concern as the classifier. The reproducer
    // must not inline the NOT EXISTS subquery with split_part on both
    // sides — that makes it unusable at production scale.
    expect(content).toMatch(/bld_cmb_prefixes\s+AS/);
    expect(content).toMatch(/array_agg\(permit_num\)/);
  });

  it('uses COALESCE(enriched_status, \'\') to avoid null-propagation false positives', () => {
    // Without COALESCE, `enriched_status = 'Stalled'` is NULL when
    // enriched_status IS NULL, and NULL OR <condition> can stay NULL,
    // making IS DISTINCT FROM flag every null-enriched-status row as
    // a disagreement. This bug produced 196,839 false positives before
    // the fix.
    expect(content).toMatch(
      /COALESCE\(\s*enriched_status,\s*''\s*\)\s*=\s*'Stalled'/,
    );
  });

  it('gates the stalled check on non-dead, non-P19, non-P20 status sets', () => {
    // The JS classifier short-circuits dead/terminal/winddown BEFORE
    // computing stalled, so those rows always have stalled=false.
    // The SQL reproducer must mirror the same gate.
    expect(content).toMatch(/WHEN status IN\s*\([^)]*Cancelled[^)]*\)\s+THEN false/);
    expect(content).toMatch(
      /WHEN status IN\s*\([^)]*Closed[^)]*\)\s+THEN false/,
    );
    expect(content).toMatch(
      /WHEN status IN\s*\([^)]*Pending Closed[^)]*\)\s+THEN false/,
    );
  });

  it('reports permit_disagreements and coa_disagreements metrics', () => {
    expect(content).toMatch(/permit_disagreements/);
    expect(content).toMatch(/coa_disagreements/);
  });
});
