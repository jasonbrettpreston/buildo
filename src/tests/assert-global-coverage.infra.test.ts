// SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md
//
// Infra tests for assert-global-coverage.js:
//   (a) Denominator enforcement — assert SQL contains the exact gate conditions
//       mirrored from each source script's WHERE clause
//   (b) Payload shape — audit_table has `columns`, all rows have required keys,
//       records_total = 1
//   (c) Chain count — permits chain = 28 steps, coa chain = 12 steps
//   (d) Advisory lock ID = 111

import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'quality', 'assert-global-coverage.js');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts', 'manifest.json');
const CHAIN_PERMITS_SPEC = path.join(REPO_ROOT, 'docs', 'specs', '01-pipeline', '41_chain_permits.md');
const CHAIN_COA_SPEC = path.join(REPO_ROOT, 'docs', 'specs', '01-pipeline', '42_chain_coa.md');

function src(): string {
  return fs.readFileSync(SCRIPT_PATH, 'utf8');
}

describe('assert-global-coverage.js — file existence', () => {
  it('script file exists', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });
});

describe('assert-global-coverage.js — advisory lock', () => {
  it('uses ADVISORY_LOCK_ID = 111', () => {
    expect(src()).toContain('ADVISORY_LOCK_ID = 111');
  });

  it('calls pipeline.withAdvisoryLock', () => {
    expect(src()).toMatch(/pipeline\.withAdvisoryLock/);
  });
});

describe('assert-global-coverage.js — records_total contract', () => {
  it('emits records_total: 1 (never a DB entity count)', () => {
    expect(src()).toContain('records_total: 1');
  });

  it('does not set records_total to a variable', () => {
    const content = src();
    // records_total must always be the literal 1, not a computed value
    expect(content).not.toMatch(/records_total:\s*[a-zA-Z_][a-zA-Z0-9_]*/);
  });
});

describe('assert-global-coverage.js — audit_table shape', () => {
  it('rows use standard { metric, value, threshold, status } schema (P3 fix: compatible with SDK auto-inject and admin UI)', () => {
    const content = src();
    // Row builders emit metric/value/threshold/status
    expect(content).toMatch(/metric:/);
    expect(content).toMatch(/value:/);
    expect(content).toMatch(/threshold:/);
    // Old columnar schema keys must be absent from row objects
    expect(content).not.toMatch(/step_target:/);
    expect(content).not.toMatch(/\bpopulated:/);
    expect(content).not.toMatch(/\bdenominator:/);
    expect(content).not.toMatch(/coverage_pct:/);
  });

  it('no custom columns declaration (removed in P3 fix — caused SDK auto-inject rows to render as undefined:undefined)', () => {
    expect(src()).not.toContain("columns: ['step_target'");
  });

  it('verdict is computed as worst non-INFO status', () => {
    expect(src()).toMatch(/verdict/);
  });
});

describe('assert-global-coverage.js — denominator gates (source-script mirroring)', () => {
  it('excludes PRE-% synthetic permits from all real-permit denominators', () => {
    expect(src()).toContain("NOT LIKE 'PRE-%'");
  });

  it('geo_id Step 2 coverage uses simple IS NOT NULL (Denom A — permitsTotal; geocodeable regex removed, Step 8 now uses permitsTotal)', () => {
    const content = src();
    // geo_id simple IS NOT NULL present (Step 2 Denom A field coverage)
    expect(content).toContain("geo_id IS NOT NULL");
    // The old geocodeable denominator filter (geo_id != '' AND geo_id ~ '^[0-9]+$') is gone —
    // Step 8 denominator is now permitsTotal (Denom A) to report end-to-end geocode coverage.
    expect(content).not.toContain("geo_id ~ '^[0-9]+$'");
  });

  it('massing denominator uses parcel centroid_lat/centroid_lng (mirrors link-massing.js: processes parcels not permits)', () => {
    const content = src();
    expect(content).toContain('centroid_lat IS NOT NULL');
    expect(content).toContain('centroid_lng IS NOT NULL');
  });

  it('trade_forecasts denominator includes is_active = true join (mirrors compute-trade-forecasts.js SOURCE_SQL)', () => {
    expect(src()).toContain('is_active = true');
  });

  it('trade_forecasts denominator excludes SKIP_PHASES exactly (mirrors compute-trade-forecasts.js)', () => {
    const content = src();
    // SKIP_PHASES_SQL is imported from scripts/lib/lifecycle-phase.js (WF3-D);
    // the literal is no longer defined locally but IS interpolated into SQL.
    // Verify the import exists and the constant is referenced in SQL context.
    expect(content).toMatch(/require\(['"][^'"]*lifecycle-phase['"]\)/);
    expect(content).toContain('SKIP_PHASES_SQL');
    // Must be referenced in SQL as a NOT IN gate
    expect(content).toMatch(/NOT IN.*SKIP_PHASES|lifecycle_phase NOT IN/);
  });

  it('trade_forecasts denominator requires lifecycle_phase IS NOT NULL (mirrors compute-trade-forecasts.js SOURCE_SQL)', () => {
    expect(src()).toMatch(/lifecycle_phase IS NOT NULL/);
  });

  it('trade_forecasts denominator uses COALESCE 3-year recency gate (WF3 2026-04-21: replaces phase_started_at IS NOT NULL)', () => {
    // phase_started_at IS NOT NULL excluded P1/P2 permits (application_date only) and
    // did not enforce the 3-year zombie gate. Replaced with COALESCE gate to mirror
    // compute-trade-forecasts.js SOURCE_SQL exactly.
    expect(src()).toMatch(/COALESCE\(p\.phase_started_at,\s*p\.issued_date,\s*p\.application_date\)\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'3 years'/);
  });

  it('opportunity_score denominator filters urgency IS NULL OR urgency != expired (mirrors compute-opportunity-scores.js WHERE clause)', () => {
    const content = src();
    expect(content).toContain("urgency IS NULL OR urgency <> 'expired'");
  });
});

describe('assert-global-coverage.js — chain-aware behavior', () => {
  it('reads PIPELINE_CHAIN env variable', () => {
    expect(src()).toContain('PIPELINE_CHAIN');
  });

  it('has permits branch (full profile)', () => {
    expect(src()).toMatch(/permits/);
  });

  it('has coa branch (scoped subset)', () => {
    expect(src()).toContain('coa');
  });

  // WF3: the sources-chain parcels-table coverage profile (Spec 49 blind-spot closure).
  it('has a sources branch that profiles the parcels table directly', () => {
    expect(src()).toContain("process.env.PIPELINE_CHAIN === 'sources'");
    expect(src()).toMatch(/else if \(isSourcesChain\)/);
    expect(src()).toContain("'parcels.zoning_class'");            // gated health floor
    expect(src()).toContain('parcels.max_buildable_gfa_sqm');
  });

  it('sources branch emits the envelope_constraint_reason VALUE DISTRIBUTION (dynamic GROUP BY, not hard-coded)', () => {
    expect(src()).toMatch(/GROUP BY envelope_constraint_reason/);
    expect(src()).toMatch(/envelope_constraint_reason='\$\{rr\.reason\}'/); // one legible infoRow per returned value
  });

  it('relocated parcel_cost_menu into the sources branch + gated the VOCAB loop out of sources', () => {
    expect(src()).toMatch(/if \(!isSourcesChain\)\s*\{\s*for \(const t of VOCAB_COVERAGE\)/);
    expect(src()).toContain("'parcels.parcel_cost_menu (residential w/ building)'");
  });
});

describe('assert-global-coverage.js — logic_variables Zod validation', () => {
  it('validates profiling_coverage_pass_pct', () => {
    expect(src()).toContain('profiling_coverage_pass_pct');
  });

  it('validates profiling_coverage_warn_pct', () => {
    expect(src()).toContain('profiling_coverage_warn_pct');
  });

  it('uses z.number().int() constraint (not just z.number())', () => {
    expect(src()).toContain('.int()');
  });
});

describe('manifest.json — chain wiring', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  it('assert_global_coverage registered in scripts', () => {
    expect(manifest.scripts).toHaveProperty('assert_global_coverage');
    expect(manifest.scripts.assert_global_coverage.file).toBe(
      'scripts/quality/assert-global-coverage.js',
    );
  });

  it('assert_global_coverage is second-to-last in permits chain; backup_db is last (step 29 post-Phase G)', () => {
    // WF3 2026-04-25: backup_db appended as final step 28 (OP4 fix).
    // WF1 #B 2026-05-09: compute_phase_calibration inserted between
    // assert_lifecycle_phase_distribution and compute_trade_forecasts;
    // chain length 28 → 29.
    // WF3 #realtor-backfill 2026-05-09: backfill_realtor_permit_trades
    // inserted between classify_permits and compute_cost_estimates;
    // chain length 29 → 30.
    // Spec 66 WF3 (2026-05-31): +1 step (enrich_permits after link_parcels). Length 30.
    const permitsChain: string[] = manifest.chains.permits;
    expect(permitsChain[permitsChain.length - 1]).toBe('backup_db');
    expect(permitsChain[permitsChain.length - 2]).toBe('assert_global_coverage');
    expect(permitsChain).toHaveLength(33); // +compute_storey_norms (Spec 65 §8 WF3-C1); +compute_build_norms (Spec 78 P1); +dispatch_notifications (P25 25A)
  });

  it('assert_global_coverage is last step in coa chain (step 15 post-Phase G retirement of create_pre_permits + assert_pre_permit_aging)', () => {
    // WF2 2026-05-14 R5.2 — +1 step (link_coa_to_parcels). Chain length 13.
    // WF1 2026-05-14 R5.3 — +1 step (classify_coa_scope). Chain length now 14.
    // WF1 2026-05-14 R5.4 — +1 step (classify_coa_trades). Chain length now 15.
    // WF1 2026-05-14 R5.5 — +1 step (compute_coa_cost_estimates). Chain length now 16.
    // WF1 2026-05-15 Phase E.3 — +1 step (compute_phase_calibration inserted
    //   between assert_lifecycle_phase_distribution and assert_global_coverage).
    //   Chain length now 17. Spec 42 §6.7 step 6 + §6.11 Phase E.3.
    // Spec 66 WF3 (2026-05-31): +1 step (enrich_coa_zoning after link_coa_to_parcels). Length 16.
    const coaChain: string[] = manifest.chains.coa;
    expect(coaChain[coaChain.length - 1]).toBe('assert_global_coverage');
    expect(coaChain).toHaveLength(16);
  });

  // WF3: lock the sources-chain wiring (the parcels-table coverage profile) — it had no length lock.
  it('assert_global_coverage runs in the sources chain, after compute_parcel_cost_estimates and before the housekeeping steps', () => {
    const sourcesChain: string[] = manifest.chains.sources;
    expect(sourcesChain).toContain('assert_global_coverage');
    const covIdx = sourcesChain.indexOf('assert_global_coverage');
    expect(sourcesChain[covIdx - 1]).toBe('compute_parcel_cost_estimates');
    expect(sourcesChain[covIdx + 1]).toBe('assert_parcel_sanity'); // WF2 sanity gate inserted after coverage
    // +assert_global_coverage (WF3) +assert_parcel_sanity (WF2)
    // +reconcile (Spec 122 §7.4 / A3, S3 2026-08-24): the Step-0 reaper prepended to
    // the chain HEAD. The adjacency assertions above are unaffected — they are
    // indexOf-relative — but this is an absolute length, so it moves 27 → 28.
    expect(sourcesChain).toHaveLength(28);
  });

  it('assert_global_coverage comes after assert_entity_tracing in permits chain', () => {
    const permitsChain: string[] = manifest.chains.permits;
    const entityIdx = permitsChain.indexOf('assert_entity_tracing');
    const globalIdx = permitsChain.indexOf('assert_global_coverage');
    expect(entityIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBe(entityIdx + 1);
  });

  it('assert_global_coverage comes after compute_phase_calibration in coa chain (Phase E.3)', () => {
    // Phase E.3 (2026-05-15): compute_phase_calibration inserted between
    // assert_lifecycle_phase_distribution and assert_global_coverage.
    // assert_global_coverage is now immediately after compute_phase_calibration
    // (not assert_lifecycle_phase_distribution).
    const coaChain: string[] = manifest.chains.coa;
    const calibIdx = coaChain.indexOf('compute_phase_calibration');
    const globalIdx = coaChain.indexOf('assert_global_coverage');
    expect(calibIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBe(calibIdx + 1);
  });
});

// ── WF3 false-FAIL fixes ─────────────────────────────────────────────────────

describe('assert-global-coverage.js — Bug 1+2: sparse fields use infoRow, not coverageRow', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  // These fields are naturally sparse in Toronto city open data — they do not
  // reliably approach the 90% PASS threshold and must not trigger FAIL alerts.
  const SPARSE_FIELDS = [
    'street_direction',
    'building_type',
    'category',
    'owner',
    'council_district',
    'ward',
    'builder_name',
  ];

  for (const field of SPARSE_FIELDS) {
    it(`${field} at Step 2 uses infoRow (not coverageRow) — naturally sparse (Bug 2)`, () => {
      // The field must appear inside an infoRow call, not inside a coverageRow call.
      // We check that the pattern `coverageRow(... '${field}')` does NOT appear
      // with permitsTotal as the denominator in Step 2 context.
      expect(content).toMatch(new RegExp(`infoRow[^)]*permits\\.${field}`));
      // Must NOT appear as a coverageRow in Step 2 (permitsTotal denominator)
      expect(content).not.toMatch(
        new RegExp(`coverageRow\\('Step 2[^)]*permits\\.${field}`),
      );
    });
  }

  it('completed_date at Step 2 uses infoRow (not coverageRow) — active permits have no completed date (Bug 1)', () => {
    // Step 2 measures load_permits field coverage. completed_date is NULL for
    // all active permits → ~5.6% → FAIL. Demoted to infoRow since it's
    // structural sparsity, not a data quality gap. Step 3 already audits
    // completed_date on stale/closed permits with the correct denominator.
    expect(content).toMatch(/infoRow[\s\S]{0,100}permits\.completed_date[\s\S]{0,200}permitsTotal/);
    expect(content).not.toMatch(/coverageRow\('Step 2[^)]*permits\.completed_date/);
  });

  it('completed_date at Step 3 (close_stale_permits) uses infoRow (WF2 P6.5 [41-#5] — empty in all rows, synthesizer produced 0)', () => {
    // CKAN sends the completed_date key but it is EMPTY in all 252,064 rows;
    // the close-stale synthesizer has produced 0 rows. Structural sparsity, not
    // a coverage regression → infoRow (the file's own convention).
    expect(content).toMatch(/infoRow\(\s*'Step 3 — close_stale_permits',\s*'permits\.completed_date'/);
    expect(content).not.toMatch(/coverageRow\(\s*'Step 3 — close_stale_permits',\s*'permits\.completed_date'/);
  });
});

describe('assert-global-coverage.js — Bug 3: CoA lifecycle_phase uses unlinked denominator', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('CoA aggregate query counts unlinked_total (linked_permit_num IS NULL)', () => {
    // Classifier assigns P1/P2 only to unlinked CoA apps. Using coaTotal (32K+)
    // as denominator produces 0.6% → FAIL. Correct denominator = unlinked apps only.
    expect(content).toMatch(/linked_permit_num IS NULL[\s\S]{0,60}AS unlinked_total/);
  });

  it('CoA lifecycle_phase coverage row uses unlinkedTotal as denominator (not coaTotal)', () => {
    expect(content).toMatch(/lifecycle_phase['"]\s*,\s*lifecyclePhaseTotal\s*,\s*unlinkedTotal/);
  });

  it('CoA lifecycle_classified_at uses unlinkedTotal denominator (not coaTotal)', () => {
    expect(content).toMatch(/lifecycle_classified_at['"]\s*,[\s\S]{0,100}unlinkedTotal/);
  });

  it('permits chain misc query includes coa_unlinked_total for Step 21', () => {
    expect(content).toMatch(/coa_unlinked_total/);
  });

  it('CoA lifecycle_phase_pop aggregate excludes linked apps (numerator cannot exceed unlinkedTotal denominator)', () => {
    // lifecycle_phase IS NOT NULL without linked_permit_num IS NULL includes apps
    // that were classified while unlinked but later got linked — numerator > denominator → >100%.
    expect(content).toContain('lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL');
    // Applies to both CoA aggregate and permits-chain misc subquery
    expect(content).toContain('lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL) AS coa_lifecycle_phase_pop');
  });

  it('CoA lifecycle_classified_pop aggregate excludes linked apps (same contamination guard)', () => {
    expect(content).toContain('lifecycle_classified_at IS NOT NULL AND linked_permit_num IS NULL');
  });
});

describe('assert-global-coverage.js — Bug 4: pre-permit coverage cannot exceed 100%', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('uses COUNT(DISTINCT permit_num) for pre-permit numerator (not COUNT(*))', () => {
    // COUNT(*) WHERE permit_num LIKE "PRE-%" counts all revisions; DISTINCT
    // counts unique CoA parent identifiers. Prevents overcounting when a
    // pre-permit has multiple revisions.
    expect(content).toMatch(/COUNT\(DISTINCT permit_num\)[\s\S]{0,50}PRE-%/);
  });

  // Phase G (Spec 42 §6.11): Step 17 (create_pre_permits), CoA Step 5 (create_pre_permits)
  // and CoA Step 6 (assert_pre_permit_aging) CoverageRow entries REMOVED. The retirement
  // assertion is now `permits_pre_permit_count == 0` in assert-data-bounds.js (both audits).
  it('Phase G — Step 17 / CoA Step 5 / CoA Step 6 rows NOT emitted (retired)', () => {
    expect(content).not.toMatch(/'Step 17 — create_pre_permits'/);
    expect(content).not.toMatch(/'CoA Step 5 — create_pre_permits'/);
    expect(content).not.toMatch(/'CoA Step 6 — assert_pre_permit_aging'/);
  });
});

describe('assert-global-coverage.js — W2 regression: CKAN-absent fields emit INFO not FAIL', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('building_type uses infoRow (CKAN API does not provide this field)', () => {
    expect(content).toMatch(/infoRow\([^)]*permits\.building_type/);
    expect(content).not.toMatch(/coverageRow\([^)]*permits\.building_type/);
  });

  it('category uses infoRow (CKAN API does not provide this field)', () => {
    expect(content).toMatch(/infoRow\([^)]*permits\.category/);
    expect(content).not.toMatch(/coverageRow\([^)]*permits\.category/);
  });

  it('council_district uses infoRow (CKAN API does not provide this field)', () => {
    expect(content).toMatch(/infoRow\([^)]*permits\.council_district/);
    expect(content).not.toMatch(/coverageRow\([^)]*permits\.council_district/);
  });

  it('owner uses infoRow (CKAN API does not provide this field)', () => {
    expect(content).toMatch(/infoRow\([^)]*permits\.owner/);
    expect(content).not.toMatch(/coverageRow\([^)]*permits\.owner/);
  });
});

describe('assert-global-coverage.js — WF2 P6.5 [41-#4]: entity contact fields via dormant entities chain → infoRow', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  // primary_phone/primary_email/website are produced ONLY by the on-demand,
  // Serper-gated `entities` chain (manifest scripts:107-109) that permits/coa/
  // sources never invoke — so over a permits run they are legitimately near-zero.
  // externalRow (FAILs below 5%) was a false regression → infoRow. Producers are
  // NOT retired (Spec 45).
  for (const field of ['primary_phone', 'primary_email', 'website']) {
    it(`entities.${field} uses infoRow, not externalRow (Spec 45 dormant chain)`, () => {
      expect(content).toMatch(new RegExp(`infoRow\\([^)]*entities\\.${field}`));
      expect(content).not.toMatch(new RegExp(`externalRow\\('Step 6[^)]*entities\\.${field}`));
    });
  }
});

describe('assert-global-coverage.js — Bug 5: lifecycle_stalled NOT NULL DEFAULT false → infoRow', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('CoA lifecycle_stalled uses infoRow (not coverageRow) — BOOLEAN NOT NULL DEFAULT false guarantees 100% population', () => {
    // lifecycle_stalled BOOLEAN NOT NULL DEFAULT false — IS NOT NULL is always vacuous.
    // coverageRow would permanently show 100% PASS; infoRow shows count of actually-stalled apps.
    // Pass-2 fold (2026-05-19): classify_lifecycle_phase is "CoA Step 12" per manifest order (was "Step 10").
    expect(content).toMatch(/infoRow\('CoA Step 12[\s\S]{0,80}lifecycle_stalled[\s\S]{0,80}lifecyclePhaseTotal/);
    expect(content).not.toMatch(/coverageRow\('CoA Step 12[\s\S]{0,30}lifecycle_stalled/);
  });

  it('CoA aggregate uses lifecycle_stalled = true (count stalled apps, not IS NOT NULL)', () => {
    expect(content).toContain("lifecycle_stalled = true AND linked_permit_num IS NULL)   AS lifecycle_stalled_true_pop");
  });

  it('permits lifecycle_stalled uses infoRow (not coverageRow) — same NOT NULL DEFAULT false constraint', () => {
    // permits.lifecycle_stalled also BOOLEAN NOT NULL DEFAULT false (migration 085).
    expect(content).toMatch(/infoRow\('Step 21[^)]*permits\.lifecycle_stalled/);
    expect(content).not.toMatch(/coverageRow\('Step 21[^)]*permits\.lifecycle_stalled/);
  });

  it('permits aggregate counts lifecycle_stalled = true (stalled permits, not IS NOT NULL)', () => {
    expect(content).toContain("lifecycle_stalled = true)                     AS lifecycle_stalled_pop");
  });
});

// ── WF3 false-FAIL fixes (denominator mismatches + SKIP_PHASES DRY) ────────────

describe('assert-global-coverage.js — WF3-A: Step 23 opportunity_score uses non-expired denominator', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('Step 23 opportunity_score coverageRow uses oppScoreDenom, not forecastTotal', () => {
    // forecastTotal includes 62K+ expired rows (77% of all trade_forecasts).
    // compute_opportunity_scores only scores non-expired rows, so
    // opportunity_score IS NOT NULL / forecastTotal ≈ 20.5% → false FAIL.
    // oppScoreDenom is COUNT(*) FILTER (WHERE urgency IS NULL OR urgency <> 'expired').
    expect(content).toMatch(
      /Step 23[\s\S]{0,300}trade_forecasts\.opportunity_score['"][\s\S]{0,100}oppScoreDenom/,
    );
    expect(content).not.toMatch(
      /Step 23[\s\S]{0,300}trade_forecasts\.opportunity_score['"][\s\S]{0,100}forecastTotal/,
    );
  });
});

describe('assert-global-coverage.js — WF3-B: enriched_status uses infoRow (inspection-stage only)', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('enriched_status uses infoRow not coverageRow — only populated for P9–P17 permits', () => {
    // enriched_status is only set for permits in active inspection stages.
    // 12,827 / 244,688 = 5.2% → permanent FAIL against all-permits denominator.
    // infoRow removes threshold judgment; the raw count is still visible in the UI.
    expect(content).toMatch(/infoRow\([^)]*permits\.enriched_status/);
    expect(content).not.toMatch(/coverageRow\([^)]*permits\.enriched_status/);
  });
});

describe('assert-global-coverage.js — WF3-C: is_wsib_registered uses externalRow (sparse scrape)', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('is_wsib_registered uses externalRow not coverageRow — third-party scraper field', () => {
    // WSIB registration data comes from a third-party scraper and is sparse by design.
    // 24.1% coverage fails the standard 80% PASS threshold but exceeds externalRow
    // PASS threshold (10%). externalRow: PASS >= 10%, WARN >= 5%, FAIL below.
    expect(content).toMatch(/externalRow\([^)]*is_wsib_registered/);
    expect(content).not.toMatch(/coverageRow\([^)]*is_wsib_registered/);
  });
});

describe('assert-global-coverage.js — WF3-D: SKIP_PHASES_SQL imported from shared lib', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('requires SKIP_PHASES_SQL from scripts/lib/lifecycle-phase.js', () => {
    expect(content).toMatch(/require\(['"][^'"]*lifecycle-phase['"]\)/);
  });

  it('does not define SKIP_PHASES_SQL as a local backtick literal', () => {
    expect(content).not.toMatch(/const SKIP_PHASES_SQL\s*=\s*`/);
  });
});

describe('assert-global-coverage.js — GC-1: Step 23 Denom G rows use infoRow (zombie-gate design intent)', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  // After WF3 zombie/stall gates, compute-trade-forecasts intentionally produces
  // forecasts for only ~36% of technically eligible permits (stalled + ancient-anchor
  // excluded). The three Denom G permit-level coverage rows previously used coverageRow()
  // against the global profiling_coverage_pass_pct (~90%) → permanent false FAIL.
  // Lowering the global DB threshold would blind Denom H row-quality checks (trade_slug,
  // confidence, etc.) that correctly pass at 90%+. infoRow() removes traffic-light
  // judgment — the ~36% is the intended design outcome, not a quality gap.
  for (const field of ['permits_covered', 'predicted_start', 'urgency \\(classified\\)']) {
    it(`GC-1 Step 23 '${field}' uses infoRow not coverageRow (design-gated, not a quality indicator)`, () => {
      // infoRow( must appear with this field name
      expect(content).toMatch(new RegExp(`infoRow\\('[^']*Step 23[^']*'\\s*,\\s*'trade_forecasts\\.${field}'`));
      // coverageRow( must NOT appear with this field name
      expect(content).not.toMatch(new RegExp(`coverageRow\\('[^']*Step 23[^']*'\\s*,\\s*'trade_forecasts\\.${field}'`));
    });
  }
});

describe('chain specs — step counts updated', () => {
  it('41_chain_permits.md declares 32 steps', () => {
    // WF2 P6.5 2026-07-07: FULL re-derivation from manifest.chains.permits.
    // The prior "30" omitted compute_storey_norms + compute_build_norms (both
    // shipped with the max-build/norms epics) and still carried the retired
    // create_pre_permits row. Live manifest = 32 steps.
    const content = fs.readFileSync(CHAIN_PERMITS_SPEC, 'utf8');
    expect(content).toContain('32 (sequential');
  });

  it('42_chain_coa.md declares 12 steps (current state — target 22 per §6)', () => {
    const content = fs.readFileSync(CHAIN_COA_SPEC, 'utf8');
    // Current chain is 12 steps; §6 implementation plan expands to ~22.
    // Spec 42 §2 declares the current state with "Steps: 12" — assert on the
    // durable prefix, not the exact parenthetical wording (which now reads
    // "12 (current state — sequential, stop-on-failure)").
    expect(content).toMatch(/\*\*Steps:\*\*\s+12\b/);
    expect(content).toContain('stop-on-failure');
  });
});

// ===========================================================================
// WF2 #4 2026-05-08 — Surgical Triangle input coverage (Spec 83 §3 inputs)
//
// Step 27 previously tracked OUTPUTS (modeled_gfa_sqm, effective_area_sqm)
// but NOT the four cornerstone INPUTS that drive the Surgical Triangle:
//   - parcels.area_sqm        (lot size — fallback GFA basis)
//   - parcel_buildings.area_sqm  (footprint — primary GFA basis)
//   - parcel_buildings.height_m  (height factor for GFA when stories absent)
//   - permits.storeys         (stories multiplier for GFA)
//
// Without coverage on these, the cost model's "crazy number" outputs (e.g.
// $29M for two ZARA wall signs) give no upstream signal. These tests
// regression-lock that the four input rows are present in the assert
// script. Spec 47 §10.3 — verification belongs upstream of consumers; the
// admin Lead Detail Inspector (Spec 76 §3.5 Cycle 7) renders these fields
// per-permit, but step 27 is the population-level verification.
// ===========================================================================

describe('assert-global-coverage.js — Surgical Triangle input coverage (WF2 #4)', () => {
  it('tracks parcels.lot_size_sqm coverage (Step 9 — link_parcels)', () => {
    // Pass-2 fold (2026-05-19): parcels stores area as `lot_size_sqm` (mig 011).
    // Same column-drift class as the WF2 #4 fetchLeadInspect bug (commit 73f3ae6).
    expect(src()).toMatch(/parcels\.lot_size_sqm/);
    // Negation: must not bare-read `area_sqm` from parcels.
    expect(src()).not.toMatch(/FROM\s+parcels\s+WHERE\s+area_sqm/i);
  });

  // Pass-2 fold (2026-05-19): the dim columns live on building_footprints, not
  // parcel_buildings. Same column-drift class as the WF2 #4 fetchLeadInspect bug
  // (commit 73f3ae6). The aggregate query now LEFT JOINs building_footprints on
  // building_id; the row labels reference the canonical bf.* columns.
  it('tracks building_footprints.footprint_area_sqm coverage (Step 11 — link_massing)', () => {
    expect(src()).toMatch(/building_footprints\.footprint_area_sqm/);
    // Negation: the script must NOT bare-read these dims from parcel_buildings.
    expect(src()).not.toMatch(/FROM\s+parcel_buildings\b(?:[^J]|J(?!OIN))*\barea_sqm\b/i);
  });

  it('tracks building_footprints.max_height_m coverage (Step 11 — link_massing)', () => {
    expect(src()).toMatch(/building_footprints\.max_height_m/);
  });

  it('pb aggregate LEFT JOINs building_footprints on building_id (Pass-2 fold)', () => {
    expect(src()).toMatch(/LEFT JOIN building_footprints bf ON bf\.id\s*=\s*pb\.building_id/);
  });

  it('tracks permits.storeys coverage (Step 2 — load_permits)', () => {
    expect(src()).toMatch(/permits\.storeys/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Spec 79 Pass-2 bundled WF3 (2026-05-19): CoA chain coverage gap closure.
// User direction: "step 15 — this step does not include every field in the
// CoA analysis". Step 15 (assert_global_coverage) previously skipped 5 of
// the 15 CoA chain manifest steps. This block locks in the additions and
// the step-label resync with the manifest order.
// ────────────────────────────────────────────────────────────────────────
describe('assert-global-coverage.js — Pass-2 CoA chain coverage additions', () => {
  const src = () =>
    fs.readFileSync(
      path.resolve(__dirname, '../../scripts/quality/assert-global-coverage.js'),
      'utf-8',
    );

  // Manifest step 4 — link_coa_to_parcels (Phase D)
  it('CoA Step 4 — link_coa_to_parcels coverage row is emitted', () => {
    expect(src()).toMatch(/'CoA Step 4 — link_coa_to_parcels'/);
  });

  // Spec 49 §4 (2026-06-20): neighbourhood_id is parcel-DERIVED — stamped only on the
  // parcel-MATCHED subset. The coverage row MUST be denominated on the lead_parcels-matched
  // count (cx.lead_parcels_coa_rows), NOT coaTotal and NOT parcel_linked_pop (a 100% watermark).
  // This lock pins both the row's presence and its denominator so the false-FAIL regression
  // (denominating a parcel-derived field over all CoAs) cannot creep back.
  it('CoA Step 4 — neighbourhood_id row is denominated on the lead_parcels-matched subset', () => {
    // aggregate uses IS NOT NULL only (CoA NULL-sentinel; no `<> -1` permits guard)
    expect(src()).toMatch(/WHERE neighbourhood_id IS NOT NULL\)\s+AS neighbourhood_id_pop/);
    // gated row over cx.lead_parcels_coa_rows, NOT coaTotal
    expect(src()).toMatch(
      /'coa_applications\.neighbourhood_id',\s*parseInt\(ca\.neighbourhood_id_pop[^)]*\),\s*parseInt\(cx\.lead_parcels_coa_rows/,
    );
  });

  // Manifest step 5 — classify_coa_scope (Phase D)
  it('CoA Step 5 — classify_coa_scope coverage row is emitted (scope_tags + scope_classified_at)', () => {
    expect(src()).toMatch(/'CoA Step 5 — classify_coa_scope'/);
    expect(src()).toMatch(/coa_applications\.scope_tags/);
    expect(src()).toMatch(/coa_applications\.scope_classified_at/);
  });

  // Manifest step 6 — classify_coa_trades (Phase D)
  it('CoA Step 6 — classify_coa_trades coverage row is emitted (trade_classified_at + lead_trades coa rows)', () => {
    expect(src()).toMatch(/'CoA Step 6 — classify_coa_trades'/);
    expect(src()).toMatch(/coa_applications\.trade_classified_at/);
  });

  // Manifest step 7 — compute_coa_cost_estimates (Phase D)
  it('CoA Step 7 — compute_coa_cost_estimates coverage row is emitted (cost_classified_at + cost_estimates coa rows)', () => {
    expect(src()).toMatch(/'CoA Step 7 — compute_coa_cost_estimates'/);
    expect(src()).toMatch(/coa_applications\.cost_classified_at/);
  });

  // Manifest step 14 — compute_phase_calibration (Phase E.3 — CoA-side cohorts)
  it('CoA Step 14 — compute_phase_calibration coverage row is emitted (phase_stay_calibration CoA-side rows)', () => {
    expect(src()).toMatch(/'CoA Step 14 — compute_phase_calibration'/);
    expect(src()).toMatch(/phase_stay_calibration/);
  });

  // Manifest order resync — the script's CoA step labels must match the manifest.
  // Previous labels were out of sync (script called assert_data_bounds "Step 8"
  // but it's manifest step 10, etc.). New labels: 1=schema, 2=load, 3=freshness,
  // 4=link_to_parcels, 5=scope, 6=trades, 7=cost, 8=link_coa, 9=refresh,
  // 10=data_bounds, 11=engine_health, 12=classify_lifecycle, 13=distribution,
  // 14=calibration, 15=this script.
  it('CoA Step 8 — link_coa label (was Step 4 prior to Pass-2 resync)', () => {
    expect(src()).toMatch(/'CoA Step 8 — link_coa'/);
  });

  it('CoA Step 9 — refresh_snapshot label (was Step 7 prior to Pass-2 resync)', () => {
    expect(src()).toMatch(/'CoA Step 9 — refresh_snapshot'/);
  });

  it('CoA Step 10 — assert_data_bounds label (was Step 8 prior to Pass-2 resync)', () => {
    expect(src()).toMatch(/'CoA Step 10 — assert_data_bounds'/);
  });

  it('CoA Step 11 — assert_engine_health label (was Step 9 prior to Pass-2 resync)', () => {
    expect(src()).toMatch(/'CoA Step 11 — assert_engine_health'/);
  });

  it('CoA Step 12 — classify_lifecycle_phase label (was Step 10 prior to Pass-2 resync)', () => {
    expect(src()).toMatch(/'CoA Step 12 — classify_lifecycle_phase'/);
  });

  it('CoA Step 13 — assert_lifecycle_phase_distribution label (was Step 11 prior to Pass-2 resync)', () => {
    expect(src()).toMatch(/'CoA Step 13 — assert_lifecycle_phase_distribution'/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// WF3 #406 (2026-06-01): zoning coverage rows for the Spec 66 WF3 enrich
// steps (enrich_permits / enrich_coa_zoning, migration 166). DEC-1: the
// zoning_class headline is GATED at 80/75 via calibratedRow; the remaining
// sub-fields are INFO (sparse-by-design / co-written, excluded from the
// verdict cascade per Spec 48 §3.6). Step labels 9b / 4b are the deliberate
// insert-after convention (DEC-2; #405 full renumber deferred).
// ────────────────────────────────────────────────────────────────────────
describe('assert-global-coverage.js — WF3 #406 zoning coverage rows', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  // (a) presence — new aggregate counts + helper + rows exist
  it('permits aggregate counts zoning_class_pop', () => {
    expect(content).toMatch(/zoning_class IS NOT NULL\)\s*(?:FILTER[^A]*)?AS zoning_class_pop/);
  });

  it('introduces the calibratedRow helper with explicit (passPct, warnPct) thresholds', () => {
    expect(content).toMatch(/function calibratedRow\([^)]*fieldPassPct[^)]*fieldWarnPct[^)]*\)/);
  });

  it('calibratedRow delegates status to the pure calibratedStatus helper (testable boundary)', () => {
    expect(content).toMatch(/require\(['"][^'"]*coverage-status['"]\)/);
    expect(content).toMatch(/calibratedStatus\(/);
  });

  // (b) zoning_class is GATED via calibratedRow at 80/75; emits a % value
  it('permits.zoning_class is gated via calibratedRow at 80/75 over permitsTotal (Step 9b)', () => {
    expect(content).toMatch(
      /calibratedRow\('Step 9b — enrich_permits',\s*'permits\.zoning_class',\s*parseInt\([^)]+\),\s*permitsTotal,\s*80,\s*75\)/,
    );
  });

  it('coa_applications.zoning_class is gated via calibratedRow at 80/75 over coaTotal (CoA Step 4b)', () => {
    expect(content).toMatch(
      /calibratedRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.zoning_class',\s*parseInt\([^)]+\),\s*coaTotal,\s*80,\s*75\)/,
    );
  });

  // (c) verdict-cascade invariance (Gemini HIGH#3): the ONLY new gated (non-INFO)
  //     row per enrich step is zoning_class. Every other new zoning field must be
  //     infoRow — so the verdict (worst non-INFO over `rows`) is provably unmoved
  //     by the additions except by a genuine zoning_class regression below 80.
  it('zoning sub-fields are NEVER gated (no coverageRow/calibratedRow for bylaw_max_*/exception_number/jsonb/provenance)', () => {
    const GATED = /(?:coverageRow|calibratedRow)\([^)]*(?:bylaw_max_fsi|bylaw_max_height_m|bylaw_max_coverage_pct|exception_number|applicable_bylaws|overlay_summary|variance_context|zoning_parcel_count|zoning_dominant_parcel_id|zoning_dominant_parcel_method|zoning_enriched_at)/;
    expect(content).not.toMatch(GATED);
  });

  it('verdict remains row-derived (worst non-INFO), not a parallel boolean', () => {
    expect(content).toMatch(/rows\.some\(r => r\.status === 'FAIL'\)/);
  });

  // (d) sub-fields are INFO and use the zoning_enriched_at count as denominator context
  it('permits zoning sub-fields use infoRow under Step 9b', () => {
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.bylaw_max_fsi'/);
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.applicable_bylaws'/);
  });

  it('coa zoning sub-fields use infoRow under CoA Step 4b', () => {
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.variance_context'/);
  });

  it('INFO sub-fields pass the zoning_enriched_at-populated count as denominator context (Gemini LOW)', () => {
    // permits: zoningEnrichedTotal; coa: coaZoningEnrichedTotal
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.bylaw_max_fsi',\s*parseInt\([^)]+\),\s*zoningEnrichedTotal\)/);
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.bylaw_max_fsi',\s*parseInt\([^)]+\),\s*coaZoningEnrichedTotal\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// WF2 #415 (2026-06-03): ravine propagation coverage rows for the Spec 59
// §8e enrich steps (migration 169). Both rows are INFO — ravine affects a
// small geographic subset with no stable population floor; gating would yield
// false FAILs. is_in_ravine is NOT NULL DEFAULT false (vacuously 100% under
// IS NOT NULL) so it MUST be a count of the TRUE subset, NEVER an IS NOT NULL
// coverage row — getting this wrong reintroduces the Bug-2 vacuous-coverage
// failure mode the block above locks. Rides the existing 9b / 4b labels.
// ────────────────────────────────────────────────────────────────────────
describe('assert-global-coverage.js — WF2 #415 ravine coverage rows', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  // (a) presence — aggregate counts the TRUE subset (FILTER), not IS NOT NULL
  it('permits aggregate counts in_ravine_pop via FILTER on the boolean (not IS NOT NULL — vacuous)', () => {
    expect(content).toMatch(/FILTER \(WHERE is_in_ravine_protection_area\)\s*AS in_ravine_pop/);
    // guard: the boolean must NOT be counted via IS NOT NULL anywhere (would read 100%)
    expect(content).not.toMatch(/is_in_ravine_protection_area IS NOT NULL/);
  });

  it('permits aggregate counts ravine_distance_pop via IS NOT NULL (legitimately sparse)', () => {
    expect(content).toMatch(/ravine_distance_m IS NOT NULL\)\s*AS ravine_distance_pop/);
  });

  it('coa aggregate counts in_ravine_pop + ravine_distance_pop (same contract)', () => {
    // both branches define identically-named pops; assert the coa block also has them
    expect((content.match(/FILTER \(WHERE is_in_ravine_protection_area\)\s*AS in_ravine_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((content.match(/ravine_distance_m IS NOT NULL\)\s*AS ravine_distance_pop/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  // (b) rows are INFO under the existing 9b / 4b labels, NEVER gated
  // Both ravine rows are PURE COUNTS (no denominator). is_in_ravine counts the TRUE subset;
  // ravine_distance counts the populated subset over the parcel-LINKED set (distinct from — and
  // potentially larger than — the zoning-enriched set), so passing zoningEnrichedTotal would risk
  // a >100% INFO display (Code Reviewer #415 fold). Lock the no-denominator form for both.
  it('permits ravine rows use infoRow under Step 9b (pure count, no denominator)', () => {
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.is_in_ravine_protection_area',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.ravine_distance_m',\s*parseInt\([^)]+\)\)/);
  });

  it('coa ravine rows use infoRow under CoA Step 4b (pure count, no denominator)', () => {
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.is_in_ravine_protection_area',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.ravine_distance_m',\s*parseInt\([^)]+\)\)/);
  });

  it('ravine_distance_m passes NO denominator (avoids >100% — populated set ⊄ zoning-enriched set)', () => {
    expect(content).not.toMatch(/'permits\.ravine_distance_m',\s*parseInt\([^)]+\),\s*zoningEnrichedTotal\)/);
    expect(content).not.toMatch(/'coa_applications\.ravine_distance_m',\s*parseInt\([^)]+\),\s*coaZoningEnrichedTotal\)/);
  });

  // (c) verdict-cascade invariance: ravine fields must NEVER be gated — both INFO,
  //     so the verdict (worst non-INFO over rows) is provably unmoved by the additions.
  it('ravine fields are NEVER gated (no coverageRow/calibratedRow for is_in_ravine_protection_area/ravine_distance_m)', () => {
    const GATED = /(?:coverageRow|calibratedRow)\([^)]*(?:is_in_ravine_protection_area|ravine_distance_m)/;
    expect(content).not.toMatch(GATED);
  });
});

// ────────────────────────────────────────────────────────────────────────
// WF3 #428 (2026-06-05): heritage propagation coverage rows for the Spec 61 §8e
// enrich step (migration 172). Same contract as the #415 ravine rows: INFO only,
// is_heritage_designated counted via FILTER(= true) NOT IS NOT NULL (the Bug-5
// vacuous-boolean lock), type/date pure counts with no denominator.
// ────────────────────────────────────────────────────────────────────────
describe('assert-global-coverage.js — WF3 #428 heritage coverage rows', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('both aggregates count is_heritage_designated via FILTER on the boolean (not IS NOT NULL — vacuous)', () => {
    expect((content.match(/FILTER \(WHERE is_heritage_designated\)\s*AS heritage_designated_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(content).not.toMatch(/is_heritage_designated IS NOT NULL/);
  });

  it('type/date counted via IS NOT NULL (legitimately populated-subset only), both branches', () => {
    expect((content.match(/heritage_designation_type IS NOT NULL\)\s*AS heritage_type_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((content.match(/heritage_designation_date IS NOT NULL\)\s*AS heritage_date_pop/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('permits heritage rows use infoRow under Step 9b (pure count, no denominator)', () => {
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.is_heritage_designated',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.heritage_designation_type',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.heritage_designation_date',\s*parseInt\([^)]+\)\)/);
  });

  it('coa heritage rows use infoRow under CoA Step 4b (pure count, no denominator)', () => {
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.is_heritage_designated',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.heritage_designation_type',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.heritage_designation_date',\s*parseInt\([^)]+\)\)/);
  });

  it('heritage fields are NEVER gated (no coverageRow/calibratedRow)', () => {
    const GATED = /(?:coverageRow|calibratedRow)\([^)]*(?:is_heritage_designated|heritage_designation_type|heritage_designation_date)/;
    expect(content).not.toMatch(GATED);
  });
});

// ────────────────────────────────────────────────────────────────────────
// §8e (2026-06-11): centreline propagation coverage rows for the Spec 62 §8e enrich
// step (migration 176). Same contract as the #415 ravine / #428 heritage rows: INFO only,
// is_corner_lot/is_through_lot counted via FILTER(= true) NOT IS NOT NULL (the vacuous-boolean
// lock), primary_frontage_street_name = non-null count. [Code-Reviewer R1: plan-mandated extension.]
// ────────────────────────────────────────────────────────────────────────
describe('assert-global-coverage.js — §8e centreline coverage rows', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('both aggregates count is_corner_lot / is_through_lot via FILTER on the boolean (not IS NOT NULL — vacuous)', () => {
    expect((content.match(/FILTER \(WHERE is_corner_lot\)\s*AS corner_lot_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((content.match(/FILTER \(WHERE is_through_lot\)\s*AS through_lot_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(content).not.toMatch(/is_corner_lot IS NOT NULL/);
    expect(content).not.toMatch(/is_through_lot IS NOT NULL/);
  });

  it('frontage counted via IS NOT NULL (legitimately populated-subset only), both branches', () => {
    expect((content.match(/primary_frontage_street_name IS NOT NULL\)\s*AS frontage_name_pop/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('permits centreline rows use infoRow under Step 9b (pure count, no denominator)', () => {
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.is_corner_lot',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.is_through_lot',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('Step 9b — enrich_permits',\s*'permits\.primary_frontage_street_name',\s*parseInt\([^)]+\)\)/);
  });

  it('coa centreline rows use infoRow under CoA Step 4b (pure count, no denominator)', () => {
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.is_corner_lot',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.is_through_lot',\s*parseInt\([^)]+\)\)/);
    expect(content).toMatch(/infoRow\('CoA Step 4b — enrich_coa_zoning',\s*'coa_applications\.primary_frontage_street_name',\s*parseInt\([^)]+\)\)/);
  });

  it('centreline fields are NEVER gated (no coverageRow/calibratedRow)', () => {
    const GATED = /(?:coverageRow|calibratedRow)\([^)]*(?:is_corner_lot|is_through_lot|primary_frontage_street_name)/;
    expect(content).not.toMatch(GATED);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Spec 49 §3 — vocabulary-coverage dimension (the value/vocabulary axis that
// catches silent under-emission, e.g. classify_permits emitting 22/38 trades).
// ────────────────────────────────────────────────────────────────────────
describe('assert-global-coverage.js — §3 vocabulary-coverage', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('VOCAB_COVERAGE matrix uses camelCase keys (NOT the banned step_target:/populated: columnar keys)', () => {
    expect(content).toMatch(/const VOCAB_COVERAGE = \[/);
    expect(content).toMatch(/stepTarget:/);
    expect(content).toMatch(/dataTable:.*dataColumn:/);
    expect(content).toMatch(/vocabTable:.*vocabColumn:/);
    expect(content).not.toMatch(/step_target:/); // must not reintroduce the banned columnar key
  });

  it('declares the trade-vocab triples (the gap this guards) + the neighbourhood healthy control', () => {
    expect(content).toMatch(/dataTable: 'permit_trades', dataColumn: 'trade_id'/);
    expect(content).toMatch(/dataTable: 'lead_trades', dataColumn: 'trade_id'/);
    expect(content).toMatch(/lead_id LIKE 'coa:%'/);
    expect(content).toMatch(/dataTable: 'permits', dataColumn: 'neighbourhood_id'/); // control
  });

  it('CoA structure_type vocab triple is emitted INLINE (CoA-scoped collapse-detector)', () => {
    // Presence lock — the structure_type vocab triple must exist so it can't silently drop.
    expect(content).toMatch(/dataTable: 'coa_applications', dataColumn: 'structure_type'/);
    expect(content).toMatch(/vocabTable: 'scope_intensity_matrix', vocabColumn: 'structure_type'/);
  });

  it('CoA structure_type vocab triple is NOT in the static VOCAB_COVERAGE array (must stay CoA-only, not run in the permits chain)', () => {
    // CoA-scoping lock — the static array is iterated in BOTH chains; a coa_applications triple there
    // would emit a meaningless row in the permits profile (Regression Guardian F1). It must live
    // inline inside the `if (isCoaChain)` block instead.
    const arrayStart = content.indexOf('const VOCAB_COVERAGE = [');
    const arrayEnd = content.indexOf('];', arrayStart);
    const arraySlice = content.slice(arrayStart, arrayEnd);
    expect(arraySlice).not.toMatch(/coa_applications/);
    expect(arraySlice).not.toMatch(/structure_type/);
  });

  it('vocabRow emits the standard { metric, value, threshold, status } rail (label-attributed, not columnar)', () => {
    expect(content).toMatch(/function vocabRow\(/);
    expect(content).toMatch(/metric: `\$\{dataColumn\} vocab \(\$\{stepTarget\}\)`/);
    // The COUNT(DISTINCT …) SQL now lives in scripts/lib/vocab-coverage.js — asserted there.
  });

  it('Zod schema requires both vocab thresholds + enforces warn < pass', () => {
    expect(content).toMatch(/vocab_coverage_pass_pct: z\.coerce\.number\(\)/);
    expect(content).toMatch(/vocab_coverage_warn_pct: z\.coerce\.number\(\)/);
    expect(content).toMatch(/vocab_coverage_warn_pct < d\.vocab_coverage_pass_pct/);
  });

  it('delegates resolve+count to the shared lib and maps any unresolved marker → VISIBLE WARN row', () => {
    expect(content).toMatch(/resolveAndCountTriple/);
    expect(content).toMatch(/value: `unresolved: \$\{result\.unresolved\}`/);
    expect(content).toMatch(/status: 'WARN'/);
  });

  it('vocab_size = 0 → INFO (nothing to measure), not a false FAIL', () => {
    expect(content).toMatch(/vocabSize == null \|\| vocabSize === 0/);
  });
});
