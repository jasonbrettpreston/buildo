// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (calibration source)
//             docs/specs/02-web-admin/86_control_panel.md §4 (chain step 21.5)
//
// SQL-shape regression-lock for scripts/compute-phase-calibration.js.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/compute-phase-calibration.js — Spec 47 §R1-R12 skeleton (WF1 #B 2026-05-09)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/compute-phase-calibration.js'),
      'utf-8',
    );
  });

  it('uses pipeline.run wrapper with the canonical name', () => {
    expect(src).toMatch(/pipeline\.run\(\s*['"]compute-phase-calibration['"]/);
  });

  it('declares ADVISORY_LOCK_ID = 93 (registry-assigned — owning spec 84 already taken)', () => {
    // The Bundle G registry in pipeline-advisory-lock.infra.test.ts
    // enforces global uniqueness across all scripts. Owning spec 84
    // was claimed by classify-lifecycle-phase.js (the ledger writer);
    // 93 is the registry-assigned free ID for this consumer.
    expect(src).toMatch(/const\s+ADVISORY_LOCK_ID\s*=\s*93\b/);
  });

  it('captures RUN_AT via pipeline.getDbTimestamp (Spec 47 §R3.5)', () => {
    // RUN_AT must be captured once and parameterized into every timestamp
    // write — never inline NOW() inside an INSERT loop. Prevents recompute
    // runs spanning a midnight boundary from producing inconsistent
    // computed_at values across the table.
    expect(src).toMatch(/pipeline\.getDbTimestamp\(\s*pool\s*\)/);
    // No inline NOW() anywhere in the script — RUN_AT is the single source of truth.
    // Strip line comments before checking (narrative explanations may reference NOW()).
    const executableOnly = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
      // Strip inline /* */ comments
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(executableOnly).not.toMatch(/\bNOW\s*\(\s*\)/i);
  });

  it('PERCENTILE_CONT results are ROUNDed before ::INTEGER cast (avoids truncation bias)', () => {
    // Postgres ::INTEGER truncates; without ROUND(), a true median of
    // 10.9 days becomes 10. Systematic downward bias on every metric.
    // Each of the three percentiles must be wrapped in ROUND().
    //
    // Phase E.3 v5: 6 matches total — permit-side aggregate (3 percentiles)
    // + CoA-side aggregate (3 percentiles). Pre-E.3 this was 3 (permit-side only).
    const percentileMatches = src.match(/ROUND\(\s*PERCENTILE_CONT/g);
    expect(percentileMatches?.length).toBe(6);
  });

  it('uses pipeline.withAdvisoryLock (Spec 47 §R6)', () => {
    expect(src).toMatch(/pipeline\.withAdvisoryLock\(\s*pool\s*,\s*ADVISORY_LOCK_ID/);
  });

  it('loads logicVars + validates via Zod (Spec 47 §R4)', () => {
    expect(src).toMatch(/loadMarketplaceConfigs\(/);
    expect(src).toMatch(/z\.object\(/);
    expect(src).toMatch(/calibration_freshness_warn_hours/);
  });

  it('reads from permit_phase_transitions (the ledger that powers calibration)', () => {
    expect(src).toMatch(/permit_phase_transitions/);
  });

  it('uses PERCENTILE_CONT for median + p25 + p75', () => {
    expect(src).toMatch(/PERCENTILE_CONT\(\s*0\.5/i);
    expect(src).toMatch(/PERCENTILE_CONT\(\s*0\.25/i);
    expect(src).toMatch(/PERCENTILE_CONT\(\s*0\.75/i);
  });

  it('uses LAG window function for phase duration computation', () => {
    expect(src).toMatch(/LAG\(\s*transitioned_at/i);
  });

  it('writes to phase_stay_calibration table via withTransaction (Spec 47 §R9 atomic write)', () => {
    expect(src).toMatch(/pipeline\.withTransaction\(/);
    expect(src).toMatch(/INSERT\s+INTO\s+phase_stay_calibration/i);
  });

  it('atomic table-replacement pattern — full table rebuild per run (v5: TRUNCATE+INSERT replaces DELETE+INSERT)', () => {
    // v5 fold v3-G-CRIT (Gemini): the original DELETE+INSERT exposed a transient
    // empty-table window to downstream consumers. The v5 atomic temp-table swap
    // uses TRUNCATE inside withTransaction (ACCESS EXCLUSIVE — readers block,
    // never observe empty). Either DELETE+INSERT (pre-E.3) or TRUNCATE+INSERT
    // (E.3+) satisfies the "full table rebuild" contract.
    expect(src).toMatch(/(DELETE\s+FROM\s+phase_stay_calibration|TRUNCATE\s+phase_stay_calibration)\b/i);
  });

  it('emits PIPELINE_SUMMARY with audit_table (Spec 47 §R10)', () => {
    expect(src).toMatch(/pipeline\.emitSummary\(/);
    expect(src).toMatch(/audit_table\s*:/);
    expect(src).toMatch(/permit_types_calibrated/);
    expect(src).toMatch(/phases_calibrated/);
    expect(src).toMatch(/total_buckets/);
  });

  it('emits PIPELINE_META with reads + writes (Spec 47 §R11)', () => {
    expect(src).toMatch(/pipeline\.emitMeta\(/);
    // Reads: ledger
    const meta = src.split('pipeline.emitMeta(')[1] ?? '';
    expect(meta).toContain('permit_phase_transitions');
    // Writes: phase_stay_calibration
    expect(meta).toContain('phase_stay_calibration');
  });

  it('SPEC LINK header points to Spec 84 §7 (calibration source mandate)', () => {
    expect(src).toMatch(/SPEC LINK[\s\S]*?84_lifecycle_phase_engine/);
  });

  it('require.main === module guard so the script can be required from tests', () => {
    expect(src).toMatch(/require\.main\s*===\s*module/);
  });
});

// ---------------------------------------------------------------------------
// Phase E.3 (v5) — CoA-side granular cohort calibration extension
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.7 step 6 + §6.11 Phase E.3
// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 + §8.7 (cohort blind-spot)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R10 (verdict derivation)
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.1 (audit_table.rows)
//
// v5 plan trajectory: v1=18, v2=14, v3=15, v4=13 findings folded. The CRIT
// caught by 4/4 reviewers at v4: `coaTypeClassNullTransitionCount` was
// declared but never populated. v5 folds the dedicated SQL query.
// ---------------------------------------------------------------------------

describe('Phase E.3 v5 — CoA-side granular cohort calibration (WF1 #lifecycle-phase-engine-migration-E.3)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/compute-phase-calibration.js'),
      'utf-8',
    );
  });

  // ─── Aggregate SQL extension ──────────────────────────────────────────

  it('reads from lifecycle_transitions for CoA-side aggregate (Spec 42 §6.6.B)', () => {
    expect(src).toMatch(/FROM\s+lifecycle_transitions/i);
  });

  it('CoA-side WHERE filter uses lead_id LIKE coa:% AND seq-range (defense-in-depth)', () => {
    // Both predicates must hold (AND), not OR. Per v5 fold v4-M4 analysis:
    // the seq-range is a DEFENSIVE secondary check, lead_id LIKE 'coa:%' is canonical.
    expect(src).toMatch(/lead_id\s+LIKE\s+'coa:%'/i);
    expect(src).toMatch(/from_seq\s+BETWEEN\s+1\s+AND\s+22/i);
    expect(src).toMatch(/to_seq\s+BETWEEN\s+1\s+AND\s+22/i);
  });

  it('CoA aggregate GROUP BY is the 5-tuple cohort key (project_type, coa_type_class, from_seq, to_seq)', () => {
    // permit_type is fixed NULL on CoA side, so GROUP BY skips it.
    // MIN(from_phase) provides legacy column for backward-compat.
    const grouping = src.match(/GROUP\s+BY\s+project_type\s*,\s*coa_type_class\s*,\s*from_seq\s*,\s*to_seq/i);
    expect(grouping).not.toBeNull();
    expect(src).toMatch(/MIN\(\s*from_phase\s*\)/i);
  });

  it('CoA aggregate does NOT filter `coa_type_class IS NOT NULL` (v5 fold v3-G-HIGH-3 — data-destructive)', () => {
    // The removed filter is the heart of v4's CRIT chain: removing the filter
    // requires a replacement observability metric (coa_type_class_null_transition_count).
    // Stripping comments first since the rationale block mentions the removed filter.
    const executableOnly = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('--') && !line.trim().startsWith('//'))
      .join('\n');
    expect(executableOnly).not.toMatch(/AND\s+coa_type_class\s+IS\s+NOT\s+NULL/i);
  });

  it('CoA aggregate does NOT filter `project_type IS NOT NULL` (v3 fold v2-DS-1 — data-destructive)', () => {
    const executableOnly = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('--') && !line.trim().startsWith('//'))
      .join('\n');
    expect(executableOnly).not.toMatch(/AND\s+project_type\s+IS\s+NOT\s+NULL/i);
  });

  it('LAG window functions have `, id` tiebreaker on both permit-side AND CoA-side (v2 fold #8 — idempotency)', () => {
    // Two LAG windows exist (permit-side over permit_phase_transitions, CoA-side over lifecycle_transitions).
    // Both must use the `, id` tiebreaker for deterministic ordering across tied transitioned_at.
    // The CoA aggregate uses a `lt.` table alias prefix; permit-side uses bare column names.
    const lagMatches = src.match(/LAG\([\s\S]*?ORDER\s+BY\s+[^)]*?transitioned_at\s*,\s*(?:lt\.)?id/gi);
    expect(lagMatches?.length).toBeGreaterThanOrEqual(2);
  });

  it('NO `HAVING COUNT(*) >= 3` filter (v2 fold #2 — data-destructive against tier counters)', () => {
    expect(src).not.toMatch(/HAVING\s+COUNT\s*\(\s*\*\s*\)\s*>=\s*3/i);
  });

  // ─── Bulk INSERT helper + COHORT_INSERT_COLS ──────────────────────────

  it('declares COHORT_INSERT_COLS constant (v2 fold #4 — eliminates manual placeholder arithmetic)', () => {
    // Accepts `COHORT_INSERT_COLS = [...]` or `COHORT_INSERT_COLS = Object.freeze([...])`
    expect(src).toMatch(/COHORT_INSERT_COLS\s*=\s*(?:Object\.freeze\(\s*)?\[/);
    // Must include the 4 new cohort-dim columns from mig 135
    expect(src).toMatch(/['"]project_type['"]/);
    expect(src).toMatch(/['"]coa_type_class['"]/);
    expect(src).toMatch(/['"]from_seq['"]/);
    expect(src).toMatch(/['"]to_seq['"]/);
  });

  it('exports a buildBulkInsertSQL helper (placeholder generation by column count)', () => {
    expect(src).toMatch(/function\s+buildBulkInsertSQL\s*\(/);
  });

  it('flattenBuckets uses name-based lookup (NOT positional) — v5 fold v3-G-MED-1', () => {
    // Must use COHORT_INSERT_COLS.map(col => b[col] ?? null) — order-independent.
    expect(src).toMatch(/COHORT_INSERT_COLS\.map\s*\(/);
    expect(src).toMatch(/b\s*\[\s*col\s*\]/);
  });

  // ─── Atomic temp-table swap (v5 fold v3-G-CRIT — eliminates empty-table window) ─

  it('uses atomic temp-table swap pattern (CREATE TEMP TABLE + TRUNCATE + INSERT FROM staging)', () => {
    expect(src).toMatch(/CREATE\s+TEMP\s+TABLE/i);
    expect(src).toMatch(/phase_stay_calibration_staging/);
    expect(src).toMatch(/TRUNCATE\s+phase_stay_calibration\b/i);
    expect(src).toMatch(/INSERT\s+INTO\s+phase_stay_calibration\s+SELECT\s+\*\s+FROM\s+phase_stay_calibration_staging/i);
  });

  it('staging table uses ON COMMIT DROP for guaranteed cleanup', () => {
    expect(src).toMatch(/ON\s+COMMIT\s+DROP/i);
  });

  // ─── Bucket-count safety cap (v5 fold v4-M3 — param-limit defense) ───

  it('asserts bucket-count safety cap before INSERT (v5 fold v4-M3 — < 65535/11 param ceiling)', () => {
    // The script must FAIL the run rather than silently truncate when bucket
    // cardinality grows past the param-limit headroom.
    expect(src).toMatch(/allBuckets\.length\s*>\s*5000/);
  });

  // ─── coa_transition_count + coa_type_class_null_transition_count queries ─

  it('coa_transition_count query applies seq-range filter (v5 fold v4-H1 — regression fix)', () => {
    // v3-DS-MED-3 fold required this filter; v4 regressed; v5 re-applies.
    // The COUNT(*) FROM lifecycle_transitions query for coa_transition_count
    // MUST match the aggregate's WHERE clause for metric/aggregate reconcilability.
    const countQueries = src.match(/SELECT\s+COUNT\(\*\)[\s\S]*?FROM\s+lifecycle_transitions[\s\S]*?WHERE[\s\S]*?lead_id\s+LIKE\s+'coa:%'[\s\S]*?BETWEEN\s+1\s+AND\s+22/gi);
    expect(countQueries?.length).toBeGreaterThanOrEqual(1);
  });

  it('coa_type_class_null_transition_count is populated by SEPARATE SQL query (v5 fold v4-C1 — CRITICAL)', () => {
    // The v4 CRIT: variable was declared `let ... = 0` and never incremented in the
    // aggregate loop (aggregate buckets collapse NULL rows). v5 requires a dedicated
    // query against lifecycle_transitions filtering coa_type_class IS NULL.
    const queryShape = src.match(/SELECT\s+COUNT\(\*\)[\s\S]*?FROM\s+lifecycle_transitions[\s\S]*?coa_type_class\s+IS\s+NULL/gi);
    expect(queryShape?.length).toBeGreaterThanOrEqual(1);
    // The variable must be assigned via DESTRUCTURING from query result, NOT initialized to 0 and left alone.
    expect(src).toMatch(/\{\s*n\s*:\s*coaTypeClassNullTransitionCount\s*\}/);
  });

  // ─── coa_applications EXISTS guard (v5 fold v4-H2) ──────────────────

  it('wraps coa_applications query in information_schema.tables EXISTS check (v5 fold v4-H2)', () => {
    // Otherwise: relation-not-exist crash + advisory lock leak on stripped DBs.
    expect(src).toMatch(/information_schema\.tables[\s\S]*?coa_applications/i);
  });

  // ─── Audit table — 15 rows / 6 thresholded (v5 fold v4-L2) ──────────

  it('audit_table.rows includes 15 metrics with 6 thresholded WARN/FAIL gates (v5 fold v4-L2)', () => {
    // Existing 4: total_buckets (FAIL), permit_types_calibrated, phases_calibrated, unreliable_buckets (WARN)
    // New 7 INFO: permit_cohort_count, coa_cohort_count, coa_transition_count, high/mid/low/outlier_volume_buckets
    // New 4 thresholded WARN: coa_cohort_presence, coa_project_type_coverage_pct, unknown_cohort_count, coa_type_class_null_transition_count
    expect(src).toMatch(/['"]permit_cohort_count['"]/);
    expect(src).toMatch(/['"]coa_cohort_count['"]/);
    expect(src).toMatch(/['"]coa_transition_count['"]/);
    expect(src).toMatch(/['"]high_volume_buckets['"]/);
    expect(src).toMatch(/['"]mid_volume_buckets['"]/);
    expect(src).toMatch(/['"]low_volume_buckets['"]/);
    expect(src).toMatch(/['"]outlier_buckets['"]/);
    expect(src).toMatch(/['"]coa_cohort_presence['"]/);
    expect(src).toMatch(/['"]coa_project_type_coverage_pct['"]/);
    expect(src).toMatch(/['"]unknown_cohort_count['"]/);
    expect(src).toMatch(/['"]coa_type_class_null_transition_count['"]/);
  });

  it('audit_table.verdict DERIVED from row statuses per Spec 47 §R10 (v2 fold #6 — fixes pre-existing bug)', () => {
    // The pre-existing bug at script line 155 hardcoded verdict from
    // inserted/unreliable counters; v5 must derive it from auditRows.some(r => r.status === 'FAIL'/'WARN').
    expect(src).toMatch(/auditRows\.some\(\s*\(?\s*r\s*\)?\s*=>\s*r\.status\s*===\s*['"]FAIL['"]/);
    expect(src).toMatch(/auditRows\.some\(\s*\(?\s*r\s*\)?\s*=>\s*r\.status\s*===\s*['"]WARN['"]/);
  });

  // ─── records_meta distributions (Spec 48 §3.2) ──────────────────────

  it('records_meta includes sample_size_distribution + cohort_dimension_coverage (Spec 48 §3.2)', () => {
    expect(src).toMatch(/sample_size_distribution/);
    expect(src).toMatch(/cohort_dimension_coverage/);
  });

  // ─── emitMeta extension (v2 fold #11) ───────────────────────────────

  it('emitMeta reads include lifecycle_transitions + coa_applications + id columns (v2 fold #11)', () => {
    const metaBlock = src.split('pipeline.emitMeta(')[1] ?? '';
    expect(metaBlock).toContain('lifecycle_transitions');
    expect(metaBlock).toContain('coa_applications');
  });

  // ─── Startup guard (v2 fold #10 + v5 fold v4-H2) ────────────────────

  it('startup guard: information_schema.tables check for lifecycle_transitions', () => {
    expect(src).toMatch(/information_schema\.tables[\s\S]*?lifecycle_transitions/i);
  });

  // ─── Spec 48 pre-ack: empty-table window wording (v5 fold v4-H3) ───

  it('atomic temp-table swap comment references ACCESS EXCLUSIVE lock (v5 fold v4-H3 wording accuracy)', () => {
    // The "<1ms" claim was technically inaccurate (Observability v4 finding J).
    // The corrected wording must reference ACCESS EXCLUSIVE / zero empty-state visibility.
    expect(src).toMatch(/ACCESS\s+EXCLUSIVE/i);
  });
});

// ---------------------------------------------------------------------------
// Phase E.3 v5 — manifest CoA chain assertion
// ---------------------------------------------------------------------------

describe('Phase E.3 v5 — manifest.json CoA chain includes compute_phase_calibration (v2 fold #12)', () => {
  it('manifest "coa" chain includes compute_phase_calibration after assert_lifecycle_phase_distribution', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../scripts/manifest.json'),
        'utf-8',
      ),
    ) as { chains: Record<string, string[]> };
    const coaSteps = manifest.chains.coa;
    expect(coaSteps, 'manifest.chains.coa must exist').toBeDefined();
    expect(coaSteps!).toContain('compute_phase_calibration');
    // Position: must come AFTER assert_lifecycle_phase_distribution per the
    // Spec 48 audit-table reader order (calibration consumes the freshly
    // classified phase distribution).
    const distIdx = coaSteps!.indexOf('assert_lifecycle_phase_distribution');
    const calibIdx = coaSteps!.indexOf('compute_phase_calibration');
    expect(distIdx).toBeGreaterThanOrEqual(0);
    expect(calibIdx).toBeGreaterThan(distIdx);
  });
});
