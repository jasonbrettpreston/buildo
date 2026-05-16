// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
//             docs/specs/02-web-admin/86_control_panel.md §1
//
// Regression lock: scripts/quality/assert-lifecycle-phase-distribution.js must read
// its thresholds + per-phase distribution bands from logicVars rather than hardcoding:
//   - lifecycle_unclassified_max (E12): hard FAIL limit for unclassified non-terminal permits
//   - lifecycle_band_<phase>_min/_max (WF2 2026-05-07): per-phase ±-tolerance bands
//   - lifecycle_cross_<dimension>_threshold (WF2 2026-05-07): Strangler Fig drift thresholds
//
// EXPECTED_BANDS used to be a hardcoded constant; promoted to logic_variables
// in migration 119 so operators can tune via the admin Control Panel without a
// redeploy.
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-lifecycle-phase-distribution.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('assert-lifecycle-phase-distribution.js — unclassified threshold externalization (§6.4)', () => {
  it('seed has lifecycle_unclassified_max (default 100, bounds sane)', () => {
    const entry = SEED.lifecycle_unclassified_max;
    if (!entry) throw new Error('lifecycle_unclassified_max missing from seed JSON');
    expect(entry.default).toBe(100);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThanOrEqual(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads lifecycle_unclassified_max from logicVars — no hardcoded UNCLASSIFIED_MAX = 100', () => {
    expect(SRC).toMatch(/logicVars\.lifecycle_unclassified_max/);
    expect(SRC).not.toMatch(/UNCLASSIFIED_MAX\s*=\s*100/);
    expect(SRC).not.toMatch(/const UNCLASSIFIED_MAX/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });

  it('reads cross-status drift thresholds from logicVars — no hardcoded 1000/500', () => {
    // WF2 2026-05-07 — Spec 47 §R4 prohibits hardcoded thresholds.
    expect(SRC).toMatch(/logicVars\.lifecycle_cross_stalled_threshold/);
    expect(SRC).toMatch(/logicVars\.lifecycle_cross_active_inspection_threshold/);
    expect(SRC).toMatch(/logicVars\.lifecycle_cross_issued_threshold/);
    // Original threshold strings — confirm they no longer appear as numeric literals
    // inside the threshold string templates. (The string `< 1000 (WARN)` is what
    // the old hardcoded form rendered; matches none of the dynamically-built
    // `< ${stalledThreshold}` strings.)
    expect(SRC).not.toMatch(/threshold:\s*['"`]<\s*1000\s*\(WARN\)/);
    expect(SRC).not.toMatch(/threshold:\s*['"`]<\s*500\s*\(WARN\)/);
  });

  it('builds EXPECTED_BANDS dynamically from logicVars — no hardcoded literal map', () => {
    // The dynamic builder reads bands via lifecycle_band_<suffix>_min/_max.
    // A hardcoded literal map would have lines like `P3:  { min: 200, max: 400 }`
    // — assert that style of literal is NOT present.
    expect(SRC).toMatch(/lifecycle_band_\$\{suffix\}_min/);
    expect(SRC).toMatch(/lifecycle_band_\$\{suffix\}_max/);
    expect(SRC).not.toMatch(/P3:\s*\{\s*min:\s*\d+,\s*max:\s*\d+\s*\}/);
    expect(SRC).not.toMatch(/'P9-P17':\s*\{\s*min:\s*\d+,\s*max:\s*\d+\s*\}/);
  });

  it('seed has all 36 lifecycle_band_<phase>_<min|max> keys + 3 cross-status thresholds', () => {
    const expectedBandSuffixes = [
      'p3', 'p4', 'p5', 'p6',
      'p7a', 'p7b', 'p7c', 'p7d',
      'p8', 'p18', 'p19', 'p20',
      'p9_p17_agg',
      'o1', 'o2', 'o3',
      'coa_p1', 'coa_p2',
    ];
    for (const suffix of expectedBandSuffixes) {
      expect(SEED[`lifecycle_band_${suffix}_min`], `seed missing lifecycle_band_${suffix}_min`).toBeDefined();
      expect(SEED[`lifecycle_band_${suffix}_max`], `seed missing lifecycle_band_${suffix}_max`).toBeDefined();
    }
    expect(SEED.lifecycle_cross_stalled_threshold).toBeDefined();
    expect(SEED.lifecycle_cross_active_inspection_threshold).toBeDefined();
    expect(SEED.lifecycle_cross_issued_threshold).toBeDefined();
  });

  it('cross-check #1 (Stalled drift) handles NULL + case (WF3 2026-05-08)', () => {
    // Spec 84 §3.5 + Spec 47 §10.3 + Spec 85 §3.5 — silent-failure-mode hardening.
    //
    // Two silent-failure modes the original query had:
    //   1. `lifecycle_stalled = false` excludes NULL rows via SQL three-valued logic.
    //      Even though the column is currently NOT NULL (mig 085), this regression-locks
    //      the query against a future schema relaxation. Cross-checks #2/#3 already
    //      adopted the equivalent `OR ... IS NULL` shape; this aligns #1.
    //   2. `enriched_status = 'Stalled'` is case-sensitive. Mixed-case DB drift would
    //      silently miss rows. `LOWER(enriched_status)` is consistent with the existing
    //      CoA unclassified query at line ~195 (`lower(trim(...))`).
    //
    // Locate cross-check #1 — it's the single SELECT that joins `enriched_status` (any
    // case) and `lifecycle_stalled`. Use a multiline regex to pull the WHERE clause.
    const crossStalled = SRC.match(
      /SELECT[\s\S]*?lifecycle_stalled[\s\S]*?(?=`,)/i,
    );
    if (!crossStalled) throw new Error('cross-check #1 query block not found in source');
    const block = crossStalled[0];

    // Required: NULL-safe predicate on lifecycle_stalled.
    // Accept either `IS NOT TRUE` or an explicit `(... = false OR ... IS NULL)`.
    const hasNullSafePredicate =
      /lifecycle_stalled\s+IS\s+NOT\s+TRUE/i.test(block) ||
      /\blifecycle_stalled\s*=\s*false\s+OR\s+lifecycle_stalled\s+IS\s+NULL/i.test(block);
    expect(
      hasNullSafePredicate,
      'cross-check #1 must use `lifecycle_stalled IS NOT TRUE` (or equivalent NULL-safe form). ' +
        'Bare `= false` silently excludes NULL rows via SQL three-valued logic.',
    ).toBe(true);

    // Required: case-insensitive predicate on enriched_status (LOWER() or canonical-array).
    const hasCaseInsensitiveStatus =
      /LOWER\s*\(\s*enriched_status\s*\)\s*=\s*'stalled'/i.test(block) ||
      /LOWER\s*\(\s*enriched_status\s*\)\s*IN\s*\(/i.test(block);
    expect(
      hasCaseInsensitiveStatus,
      'cross-check #1 must compare `LOWER(enriched_status)` against a lowercase literal. ' +
        'Bare `enriched_status = \'Stalled\'` silently misses mixed-case rows.',
    ).toBe(true);

    // Negative regression-lock — the old shape MUST NOT reappear.
    expect(block).not.toMatch(/lifecycle_stalled\s*=\s*false(?!\s+OR)/i);
    expect(block).not.toMatch(/enriched_status\s*=\s*'Stalled'/);
  });

  it('cross-checks #2 and #3 also use case-insensitive enriched_status (WF3 2026-05-08 sibling concern)', () => {
    // Same case-sensitivity gap as #1 — extending the fix to the whole class
    // per WF3 protocol Pre-Review Self-Checklist ("fixed the symptom, missed
    // the class" antipattern).
    expect(SRC).toMatch(/LOWER\s*\(\s*enriched_status\s*\)\s*=\s*'active inspection'/i);
    expect(SRC).toMatch(/LOWER\s*\(\s*enriched_status\s*\)\s*=\s*'permit issued'/i);
    // Negative regression-lock — scoped to SQL `WHERE` context to avoid matching
    // error-message templates (which legitimately contain the literal phrase).
    expect(SRC).not.toMatch(/WHERE\s+enriched_status\s*=\s*'Active Inspection'/);
    expect(SRC).not.toMatch(/WHERE\s+enriched_status\s*=\s*'Permit Issued'/);
  });
});

// ---------------------------------------------------------------------------
// Phase E.4 v4 — per-seq distribution band assertion extension
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4
// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.1-§3.2
//
// v4 plan trajectory: v1=14 → v2=8 → v3=9 plan-review findings folded across
// 3 rounds. 2 CRITs from v3 round: (a) catalog query crashes if table missing;
// (b) formula consistency between mig SQL + seed examples + parity test.
// ---------------------------------------------------------------------------

describe('Phase E.4 v4 — per-seq band assertion extension', () => {
  // ─── Dynamic catalog query + guard (v4 fold v3-DS-CRIT) ─────────────

  it('queries universal_stream_catalog dynamically for the seq list (no hardcoded 110)', () => {
    expect(SRC).toMatch(/SELECT\s+seq\s*,\s*rows_count\s+FROM\s+universal_stream_catalog/i);
  });

  it('guards the catalog query behind catalogExists check (v4 fold v3-DS-CRIT)', () => {
    // v3 fold defeated by unconditional catalog SELECT; v4 wraps it.
    expect(SRC).toMatch(/if\s*\(\s*catalogExists\s*\)/i);
  });

  it('does NOT contain a hardcoded `expectedSeqCount = 110` or `for.*n.*110` loop', () => {
    expect(SRC).not.toMatch(/expectedSeqCount\s*=\s*110/);
    expect(SRC).not.toMatch(/for\s*\(\s*let\s+n\s*=\s*1\s*;\s*n\s*<=\s*110\s*;/);
  });

  // ─── Orphan-key detection (v4 fold v3-G-CRIT) ────────────────────────

  it('detects orphan band keys via BAND_KEY_PATTERN regex + throws with explicit recovery (v4 fold v3-G-CRIT)', () => {
    expect(SRC).toMatch(/BAND_KEY_PATTERN/);
    expect(SRC).toMatch(/lifecycle_seq_band_/);
    expect(SRC).toMatch(/Orphan band keys/i);
    expect(SRC).toMatch(/DELETE\s+FROM\s+logic_variables/i);  // recovery hint
  });

  // ─── 2-branch continuous formula (v4 fold v3-G-CRIT-formula) ─────────

  it('uses null-aware band classification (band.max === null short-circuits assertion)', () => {
    expect(SRC).toMatch(/band\.max\s*===\s*null\s*\|\|\s*actual\s*<=\s*band\.max/i);
  });

  // ─── Bidirectional symmetric-difference (v4 fold v3-G-HIGH + v2 fold v1-DS-HIGH-2) ─

  it('Direction 1: seqs in data but not in bands emit kind: no_band_configured', () => {
    expect(SRC).toMatch(/no_band_configured/);
  });

  it('Direction 2: seqs in bands but not in data with band.min > 0 emit kind: expected_data_missing', () => {
    expect(SRC).toMatch(/expected_data_missing/);
    expect(SRC).toMatch(/!distributionSeqs\.has\(\s*seq\s*\)/);
    expect(SRC).toMatch(/band\.min\s*>\s*0/);
  });

  // ─── 6 new audit_table rows (v4: 29 total = 23 existing + 6 new) ─────

  it('audit_table.rows includes the 6 new aggregate counters', () => {
    expect(SRC).toMatch(/['"]seq_bands_total['"]/);
    expect(SRC).toMatch(/['"]seq_bands_passing['"]/);
    expect(SRC).toMatch(/['"]seq_bands_null_catalog_count['"]/);  // v2 fold v1-I-HIGH-1
    expect(SRC).toMatch(/['"]seq_bands_warn['"]/);
    expect(SRC).toMatch(/['"]seq_bands_failing['"]/);
    expect(SRC).toMatch(/['"]seq_unclassified_count['"]/);
  });

  it('seq_bands_failing is hardwired to 0 in E.4 v1 posture (E.5 promotion hook)', () => {
    // The variable should be declared with `let ... = 0` but never incremented
    // anywhere in the script (E.4 reserved the FAIL path for E.5 promotion).
    expect(SRC).toMatch(/let\s+seqBandsFailing\s*=\s*0/);
    // E.5 v4 update: the descriptor now references the per-kind flags (the
    // E.4 "always 0 in E.4 v1" wording was retired by v4 fold v2-conv-MED-descriptor).
    // The seq_bands_failing audit row block must reference the per-kind posture mechanism.
    const sbfBlock = SRC.match(/metric:\s*['"]seq_bands_failing['"][\s\S]*?threshold:\s*['"][^'"]+['"]/)?.[0] ?? '';
    expect(sbfBlock).toMatch(/E\.5/);
    // E.5 v4 makes the FAIL path REACHABLE — `seqBandsFailing++` is now expected
    // in the per-kind branch routing (was forbidden in the E.4 regression-lock).
    expect(SRC).toMatch(/seqBandsFailing\s*\+\+/);
  });

  // ─── records_meta — seq_distribution + structured violations + truncated count ─

  it('emits seq_distribution map in records_meta (NOT in audit_table.rows per Spec 48 §3.2)', () => {
    expect(SRC).toMatch(/seq_distribution/);
  });

  it('emits structured seq_violations array (objects, not strings) in records_meta', () => {
    expect(SRC).toMatch(/seq_violations\b/);
    // Structured shape: {seq, actual, band_min, band_max, kind} — JS shorthand
    // form `{ seq, actual, ... }` is equivalent to `{ seq: seq, actual: actual }`.
    expect(SRC).toMatch(/\bband_min\b/);
    expect(SRC).toMatch(/\bband_max\b/);
    expect(SRC).toMatch(/kind\s*:\s*['"](band_violation|no_band_configured|expected_data_missing)['"]/);
  });

  it('caps seq_violations at SEQ_VIOLATIONS_CAP (50) + surfaces truncated count', () => {
    expect(SRC).toMatch(/SEQ_VIOLATIONS_CAP/);
    expect(SRC).toMatch(/seq_violations_truncated_count/);
  });

  // ─── Truncation math fix (v4 fold v3-Indep-HIGH-F) ───────────────────

  it('warnings preview uses seqViolationsCapped.length (not seqViolations.length) for "in records_meta" count', () => {
    // The warning suffix must reference the CAPPED array length, not the
    // uncapped full violations array. Otherwise operators see misleading
    // "+N more in records_meta" counts.
    expect(SRC).toMatch(/seqViolationsCapped\.length\s*-\s*previewCount/);
  });

  // ─── Empty-catalog override (v4 fold v3-Indep-MED-A) ─────────────────

  it('detects empty-catalog state (catalogExists && rows.length === 0) and forces WARN', () => {
    expect(SRC).toMatch(/catalogEmptyButPresent/);
  });

  // ─── Posture-prefixed warnings (v4 fold v3-Obs-HIGH-2) ───────────────

  it('warnings include the [E.4 WARN-ONLY POSTURE] prefix for first-deploy operator triage', () => {
    expect(SRC).toMatch(/\[E\.4 WARN-ONLY POSTURE/);
  });

  it('empty-catalog WARN uses distinct [E.4 STARTUP STATE] prefix', () => {
    expect(SRC).toMatch(/\[E\.4 STARTUP STATE\]/);
  });

  // ─── Removed linked_permit_num filter (v2 fold v1-I-HIGH-3) ──────────

  it('seqUnclassifiedCoa query does NOT filter linked_permit_num IS NULL (post-E.1 Rule 0 removal)', () => {
    // The phase-keyed unclassified_count query keeps the filter; the new
    // seq_unclassified_count query removes it. Find the seq-keyed query
    // (which references lifecycle_seq IS NULL) and assert NO linked_permit_num
    // predicate in the same block.
    const seqUnclassifiedBlock = SRC.match(
      /seqUnclassifiedCoa[\s\S]*?WHERE\s+lifecycle_seq\s+IS\s+NULL[\s\S]*?NORMALIZED_DEAD_DECISIONS_ARRAY/i,
    )?.[0] ?? '';
    expect(seqUnclassifiedBlock, 'seqUnclassifiedCoa block not found').toBeTruthy();
    expect(seqUnclassifiedBlock).not.toMatch(/linked_permit_num\s+IS\s+NULL/i);
  });

  // ─── lifecycle_seq_unclassified_max (v4 fold v1-I-MED-3) ─────────────

  it('reads lifecycle_seq_unclassified_max from logicVars + validates via Zod', () => {
    expect(SRC).toMatch(/lifecycle_seq_unclassified_max/);
  });

  // ─── universal_stream_catalog EXISTS guard (v2 fold from R5) ─────────

  it('startup guard: information_schema.tables EXISTS check for universal_stream_catalog', () => {
    expect(SRC).toMatch(/information_schema\.tables[\s\S]*?universal_stream_catalog/i);
  });
});

// ---------------------------------------------------------------------------
// Phase E.4 v4 — seed JSON completeness
// ---------------------------------------------------------------------------

describe('Phase E.4 v4 — scripts/seeds/logic_variables.json completeness', () => {
  let seed: Record<string, { default: unknown; type?: string }>;

  beforeAll(() => {
    seed = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'),
        'utf-8',
      ),
    ) as Record<string, { default: unknown; type?: string }>;
  });

  it('seed contains all 110 lifecycle_seq_band_<N>_min entries (seqs 1-110)', () => {
    const missing: string[] = [];
    for (let n = 1; n <= 110; n++) {
      const key = `lifecycle_seq_band_${n}_min`;
      if (!(key in seed)) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('seed contains all 110 lifecycle_seq_band_<N>_max entries (seqs 1-110)', () => {
    const missing: string[] = [];
    for (let n = 1; n <= 110; n++) {
      const key = `lifecycle_seq_band_${n}_max`;
      if (!(key in seed)) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('seed contains lifecycle_seq_unclassified_max with default 5000', () => {
    expect(seed.lifecycle_seq_unclassified_max).toBeDefined();
    expect(seed.lifecycle_seq_unclassified_max!.default).toBe(5000);
  });

  it('lifecycle_seq_band_<N>_max may be null for NULL-rows_count seqs (v4 fold v3-G-CRIT-formula)', () => {
    // v4 uses NULL (not magic 999999) for no-upper-bound seqs. At least one
    // band in the catalog snapshot has NULL rows_count → seed max must be null.
    const nullMaxKeys = Object.entries(seed)
      .filter(([k, v]) => k.startsWith('lifecycle_seq_band_') && k.endsWith('_max') && v.default === null);
    expect(nullMaxKeys.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Phase E.5 v4 — band recalibration operational gate (per-kind posture flags)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.5
// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.1
//
// v4 plan trajectory: v1=12 → v2=14 → v3=10 plan-review findings folded across
// 3 rounds. v4 = mechanical scrub of remaining v1 leftovers + Observability's
// 3 MEDs + Gemini MED (kind-specific prefix) + Gemini LOW (rollback DOWN).
// ---------------------------------------------------------------------------

describe('Phase E.5 v4 — per-kind posture flag promotion gate', () => {
  // ─── Zod schema — 3 new required keys ───────────────────────────────

  it('LOGIC_VARS_SCHEMA declares all 3 per-kind posture keys with .int().min(0).max(1)', () => {
    expect(SRC).toMatch(/lifecycle_seq_band_promote_to_fail_band_violation\s*:\s*z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(1\)/);
    expect(SRC).toMatch(/lifecycle_seq_band_promote_to_fail_no_band_configured\s*:\s*z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(1\)/);
    expect(SRC).toMatch(/lifecycle_seq_band_promote_to_fail_expected_data_missing\s*:\s*z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(1\)/);
  });

  // ─── Per-kind flag extraction + anyPromotePostureActive ──────────────

  it('extracts 3 per-kind booleans from logicVars', () => {
    expect(SRC).toMatch(/const\s+promoteToFail_band_violation\s*=\s*logicVars\.lifecycle_seq_band_promote_to_fail_band_violation\s*===\s*1/);
    expect(SRC).toMatch(/const\s+promoteToFail_no_band_configured\s*=\s*logicVars\.lifecycle_seq_band_promote_to_fail_no_band_configured\s*===\s*1/);
    expect(SRC).toMatch(/const\s+promoteToFail_expected_data_missing\s*=\s*logicVars\.lifecycle_seq_band_promote_to_fail_expected_data_missing\s*===\s*1/);
  });

  it('computes anyPromotePostureActive as OR of the 3 per-kind flags', () => {
    expect(SRC).toMatch(/const\s+anyPromotePostureActive\s*=[\s\S]*?promoteToFail_band_violation[\s\S]*?promoteToFail_no_band_configured[\s\S]*?promoteToFail_expected_data_missing/);
  });

  it('defines POSTURE_FLAG_BY_KIND map with 3 kind→flag entries', () => {
    expect(SRC).toMatch(/POSTURE_FLAG_BY_KIND/);
    // Each kind key maps to its corresponding boolean. The map is consulted
    // by renderPrefix() and at violation push sites.
    const block = SRC.match(/POSTURE_FLAG_BY_KIND\s*=\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(block).toMatch(/band_violation\s*:\s*promoteToFail_band_violation/);
    expect(block).toMatch(/no_band_configured\s*:\s*promoteToFail_no_band_configured/);
    expect(block).toMatch(/expected_data_missing\s*:\s*promoteToFail_expected_data_missing/);
  });

  // ─── 3 separate per-kind posture audit rows ──────────────────────────

  it('emits 3 separate per-kind posture audit rows', () => {
    expect(SRC).toMatch(/['"]lifecycle_seq_band_promote_to_fail_band_violation['"]/);
    expect(SRC).toMatch(/['"]lifecycle_seq_band_promote_to_fail_no_band_configured['"]/);
    expect(SRC).toMatch(/['"]lifecycle_seq_band_promote_to_fail_expected_data_missing['"]/);
  });

  it('each posture audit row transitions INFO↔WARN per its own flag (status: flag ? WARN : INFO)', () => {
    // Each row's status must depend on its specific kind's flag — checking the
    // pattern `promoteToFail_<kind> ? 'WARN' : 'INFO'` appears for each kind.
    expect(SRC).toMatch(/promoteToFail_band_violation\s*\?\s*['"]WARN['"]\s*:\s*['"]INFO['"]/);
    expect(SRC).toMatch(/promoteToFail_no_band_configured\s*\?\s*['"]WARN['"]\s*:\s*['"]INFO['"]/);
    expect(SRC).toMatch(/promoteToFail_expected_data_missing\s*\?\s*['"]WARN['"]\s*:\s*['"]INFO['"]/);
  });

  // ─── Per-kind branch routing at violation push sites ─────────────────

  it('main loop band_violation push reads promoteToFail_band_violation (not a shared flag)', () => {
    // Find the kind='band_violation' push block and assert the SAME block reads the band_violation flag.
    expect(SRC).toMatch(/kind\s*:\s*['"]band_violation['"][\s\S]{0,400}?promoteToFail_band_violation/);
  });

  it('Direction 1 no_band_configured push reads promoteToFail_no_band_configured', () => {
    expect(SRC).toMatch(/kind\s*:\s*['"]no_band_configured['"][\s\S]{0,400}?promoteToFail_no_band_configured/);
  });

  it('Direction 2 expected_data_missing push reads promoteToFail_expected_data_missing', () => {
    expect(SRC).toMatch(/kind\s*:\s*['"]expected_data_missing['"][\s\S]{0,400}?promoteToFail_expected_data_missing/);
  });

  // ─── renderPrefix(kind) helper for per-violation prefix selection ────

  it('renderPrefix(kind) helper exists + uses POSTURE_FLAG_BY_KIND lookup + includes kind name in FAIL prefix', () => {
    expect(SRC).toMatch(/function\s+renderPrefix\s*\(\s*kind\s*\)/);
    expect(SRC).toMatch(/POSTURE_FLAG_BY_KIND\s*\[\s*kind\s*\]/);
    // v4 fold v3-G-MED-prefix-kind: kind name in the FAIL prefix string for operator triage.
    expect(SRC).toMatch(/\$\{kind\}.*kind\s+halts/);
    expect(SRC).toMatch(/E\.5\s+FAIL\s+POSTURE/);
    expect(SRC).toMatch(/E\.4\s+WARN-ONLY\s+POSTURE/);
  });

  // ─── seq_violations gains posture field ──────────────────────────────

  it('violation push includes posture field derived from POSTURE_FLAG_BY_KIND', () => {
    // At least one push site must include the posture field. The kind lookup
    // can be either `POSTURE_FLAG_BY_KIND[kind]` (bare variable) or
    // `POSTURE_FLAG_BY_KIND['<kind>']` (string literal, more explicit).
    expect(SRC).toMatch(/posture\s*:\s*POSTURE_FLAG_BY_KIND\s*\[\s*(?:kind|['"][a-z_]+['"])\s*\]\s*\?\s*['"]fail['"]\s*:\s*['"]warn['"]/);
  });

  // ─── seq_bands_failing descriptor updated ────────────────────────────

  it('seq_bands_failing audit row descriptor references the 3 per-kind flags (NOT "always 0 in E.4 v1")', () => {
    // Find the seq_bands_failing audit row and inspect its threshold descriptor.
    const block = SRC.match(/metric:\s*['"]seq_bands_failing['"][\s\S]*?threshold:\s*['"][^'"]+['"]/)?.[0] ?? '';
    expect(block, 'seq_bands_failing audit row block not found').toBeTruthy();
    expect(block).toMatch(/E\.5/);
    expect(block).not.toMatch(/always\s+0\s+in\s+E\.4\s+v1/i);
  });

  // ─── Emit guard expansion + emitSummary BEFORE throw ─────────────────

  it('emit guard fires on seqBandsWarn > 0 OR (anyPromotePostureActive && seqBandsFailing > 0)', () => {
    expect(SRC).toMatch(/seqBandsWarn\s*>\s*0[\s\S]{0,80}anyPromotePostureActive[\s\S]{0,80}seqBandsFailing\s*>\s*0/);
  });

  it('emitSummary call appears BEFORE the failures-throw check in the source', () => {
    // The script has TWO `if (failures.length > 0)` blocks:
    //   1. LOG block (pipeline.log.error) — fires regardless of emit ordering
    //   2. THROW block (throw new Error) — MUST be after emitSummary so the
    //      audit_table is persisted to pipeline_runs even on FAIL runs.
    // The test specifically targets the THROW block via the `throw new Error` pattern.
    const emitIdx = SRC.search(/pipeline\.emitSummary\(/);
    const throwIdx = SRC.search(/if\s*\(\s*failures\.length\s*>\s*0\s*\)\s*\{[\s\S]{0,120}throw\s+new\s+Error/);
    expect(emitIdx).toBeGreaterThan(0);
    expect(throwIdx).toBeGreaterThan(0);
    expect(emitIdx).toBeLessThan(throwIdx);
  });

  // ─── Reachability of seqBandsFailing under per-kind posture ──────────

  it('seqBandsFailing is incremented when the matching per-kind flag is 1 (not hardwired to 0)', () => {
    // E.4 had `let seqBandsFailing = 0` with NO increment path. E.5 v4 adds
    // increment paths gated on per-kind flags.
    expect(SRC).toMatch(/let\s+seqBandsFailing\s*=\s*0/);
    // At least one `seqBandsFailing++` or `seqBandsFailing +=` somewhere in the script.
    expect(SRC).toMatch(/seqBandsFailing\s*\+\+/);
  });
});

// ---------------------------------------------------------------------------
// Phase E.5 v4 — seed JSON completeness for 3 per-kind posture flags
// ---------------------------------------------------------------------------

describe('Phase E.5 v4 — scripts/seeds/logic_variables.json — 3 posture flag entries', () => {
  let seed: Record<string, { default: unknown }>;

  beforeAll(() => {
    seed = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'),
        'utf-8',
      ),
    ) as Record<string, { default: unknown }>;
  });

  it('seed contains lifecycle_seq_band_promote_to_fail_band_violation with default 0', () => {
    expect(seed.lifecycle_seq_band_promote_to_fail_band_violation).toBeDefined();
    expect(seed.lifecycle_seq_band_promote_to_fail_band_violation!.default).toBe(0);
  });

  it('seed contains lifecycle_seq_band_promote_to_fail_no_band_configured with default 0', () => {
    expect(seed.lifecycle_seq_band_promote_to_fail_no_band_configured).toBeDefined();
    expect(seed.lifecycle_seq_band_promote_to_fail_no_band_configured!.default).toBe(0);
  });

  it('seed contains lifecycle_seq_band_promote_to_fail_expected_data_missing with default 0', () => {
    expect(seed.lifecycle_seq_band_promote_to_fail_expected_data_missing).toBeDefined();
    expect(seed.lifecycle_seq_band_promote_to_fail_expected_data_missing!.default).toBe(0);
  });
});
