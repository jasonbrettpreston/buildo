// SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md
//
// Infra tests for assert-global-coverage.js — the ASSERT-archetype Global Data
// Completeness Profile.
//
// ── AGC batch-1-I1 commit 7 (2026-09-11) — the Fold A item 2 repoint ──
// Ask A2 (RULED): this pre-existing file is KEPT, corrected, following the sole
// measured precedent `src/tests/link-wsib.infra.test.ts` — not deleted, not
// silently migrated. Commit 6 classified every one of this file's ~121 assertions
// BEHAVIOUR / SKELETON / N-A (see the commit 6 diff for the full census); commit 7
// is the repoint Fold A item 2 promised, now that the artifacts it targets exist:
//
//   · `scripts/lib/assert-global-coverage-fields.js` (FIELDS) — the single
//     declared CHECK_DEFS/LOGIC_VAR_DEFS/VOCAB_COVERAGE source of truth shared by
//     the descriptor generator and the compute dispatch table. Most BEHAVIOUR
//     facts that were pattern-matched against the OLD `coverageRow('Step X',
//     'table.field', pop, denom)` call-site TEXT are now checked against this
//     module's DATA directly (`CHECK_DEFS.find(c => c.id === '…').builder`) —
//     the call-site syntax itself no longer exists (303 checks are DATA, not 303
//     hand-typed function calls, per Ask A1's ruling), so a literal-text regex
//     repoint would be vacuous. This is a genuine SHAPE change, not a mechanical
//     find/replace — flagged in advance by the commit 6 header's own sub-note.
//   · `scripts/lib/compute/assert-global-coverage.js` (COMPUTE) — every VERBATIM
//     SQL fragment (WHERE clauses, FILTER predicates, JOINs) this file's
//     "denominator gates" / ravine / heritage / centreline / Surgical-Triangle
//     blocks locked is preserved byte-for-byte here, just relocated behind
//     memoized loaders — those assertions repoint cleanly with no shape change.
//   · `scripts/quality/assert-global-coverage.descriptor.json` (DESCRIPTOR) — the
//     three logic_variables/Zod-schema blocks and the chain-branching block
//     (`process.env.PIPELINE_CHAIN` — retired from compute per peel 8a, "the
//     compute no longer knows what a chain is") now read the declared
//     `config.logic_variables[]` / `sharing.varies_by_chain` / `checks[].chains`
//     shape instead.
//
// (a)/(c)/(d) chain-position facts (permits = 32 of 33, coa = 16 of 16, sources =
// 28 total) are unaffected by this conversion (manifest.json is untouched) and
// keep reading the manifest directly, as before.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'quality', 'assert-global-coverage.js');
const COMPUTE_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'compute', 'assert-global-coverage.js');
const FIELDS_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'assert-global-coverage-fields.js');
const DESCRIPTOR_PATH = path.join(REPO_ROOT, 'scripts', 'quality', 'assert-global-coverage.descriptor.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts', 'manifest.json');

/** The frozen thin shell — SKELETON facts only (lock constant, pipeline.step call). */
function src(): string {
  return fs.readFileSync(SCRIPT_PATH, 'utf8');
}
/** The domain logic — every VERBATIM-preserved SQL fragment lives here. */
function computeSource(): string {
  return fs.readFileSync(COMPUTE_PATH, 'utf8');
}
/** The declared CHECK_DEFS/LOGIC_VAR_DEFS/VOCAB_COVERAGE data module. */
function fieldsSource(): string {
  return fs.readFileSync(FIELDS_PATH, 'utf8');
}

interface CheckDef {
  id: string;
  chain: string | string[];
  builder: string;
  loader: string;
  pop?: string;
  denom?: string | null;
  passVar?: string;
  warnVar?: string;
  stepTarget: string;
  field: string;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real data module
const FIELDS = require(FIELDS_PATH) as { CHECK_DEFS: CheckDef[] };
const DEFS_BY_ID = new Map(FIELDS.CHECK_DEFS.map((d) => [d.id, d]));

function def(id: string): CheckDef {
  const d = DEFS_BY_ID.get(id);
  expect(d, `CHECK_DEFS has no entry for id "${id}"`).toBeDefined();
  return d as CheckDef;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- descriptor shape varies per assertion; callers narrow locally
function descriptor(): Record<string, any> {
  return JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8'));
}

describe('assert-global-coverage.js — file existence', () => {
  it('script file exists', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });
});

describe('assert-global-coverage.js — advisory lock', () => {
  it('uses ADVISORY_LOCK_ID = 111 (§5.4 source-text convention, unchanged by conversion)', () => {
    expect(src()).toContain('ADVISORY_LOCK_ID = 111');
  });

  it('identity.lock matches the source-text constant', () => {
    expect(descriptor().identity.lock).toBe(111);
  });
});

describe('assert-global-coverage.js — records_total contract', () => {
  it('the ASSERT profile forces outputs "none" — records_total is the LIBRARY\'s convention now, not this step\'s', () => {
    const d = descriptor();
    expect(d.identity.archetype).toBe('ASSERT');
    expect(d.outputs).toBe('none');
  });

  it('compute no longer touches records_total at all (retired into the library, AGC-D6 precedent)', () => {
    expect(computeSource()).not.toMatch(/records_total/);
  });
});

describe('assert-global-coverage.js — audit_table shape', () => {
  it('every declared check carries the standard verdict.js row contract fields', () => {
    const checks = descriptor().checks as Array<{ id: string; severity: string; limit: unknown; when: string }>;
    expect(checks.length).toBeGreaterThan(200);
    for (const c of checks) {
      expect(c.id, 'every check needs an id').toBeTruthy();
      expect(c.severity, `${c.id} needs a severity`).toBeTruthy();
      expect(c.limit, `${c.id} needs a limit`).not.toBeUndefined();
    }
  });

  it('the old columnar row keys (step_target/populated/denominator/coverage_pct) are gone from the declared data', () => {
    const text = fieldsSource() + computeSource();
    expect(text).not.toMatch(/step_target:/);
    expect(text).not.toMatch(/\bpopulated:/);
    expect(text).not.toMatch(/\bdenominator:/);
    expect(text).not.toMatch(/coverage_pct:/);
  });

  it('verdict is row-derived by the shared library (deriveVerdict), never a compute-local cascade (AGC-D6)', () => {
    // compute-shape's compute-no-verdict-derivation rule already bans the identifier at lint
    // time; this pins the INTENT — no hand-rolled `rows.some(status === 'FAIL')` cascade text.
    expect(computeSource()).not.toMatch(/rows\.some\(r\s*=>\s*r\.status/);
  });
});

describe('assert-global-coverage.js — logic_variables validation (Zod retired into config.logic_variables[])', () => {
  it('declares profiling_coverage_pass_pct/warn_pct with on_invalid "fail" and 0-100 bounds', () => {
    const vars = descriptor().config.logic_variables as Array<{ name: string; min: number; max: number; on_invalid: string }>;
    for (const name of ['profiling_coverage_pass_pct', 'profiling_coverage_warn_pct']) {
      const v = vars.find((x) => x.name === name);
      expect(v, `config.logic_variables missing ${name}`).toBeDefined();
      expect(v?.min).toBe(0);
      expect(v?.max).toBe(100);
      expect(v?.on_invalid).toBe('fail');
    }
  });

  it('config.validation is "strict" and hoisted_above_gate is true (mirrors the pre-conversion above-the-lock validation)', () => {
    const cfg = descriptor().config;
    expect(cfg.validation).toBe('strict');
    expect(cfg.hoisted_above_gate).toBe(true);
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

  it('assert_global_coverage is second-to-last in permits chain; backup_db is last (position 32 of 33, measured 2026-09-11 — AGC-D1)', () => {
    const permitsChain: string[] = manifest.chains.permits;
    expect(permitsChain[permitsChain.length - 1]).toBe('backup_db');
    expect(permitsChain[permitsChain.length - 2]).toBe('assert_global_coverage');
    expect(permitsChain).toHaveLength(33);
  });

  it('assert_global_coverage is last step in coa chain (position 16 of 16, measured 2026-09-11 — AGC-D1)', () => {
    const coaChain: string[] = manifest.chains.coa;
    expect(coaChain[coaChain.length - 1]).toBe('assert_global_coverage');
    expect(coaChain).toHaveLength(16);
  });

  it('assert_global_coverage runs in the sources chain, after compute_parcel_cost_estimates and before the housekeeping steps', () => {
    const sourcesChain: string[] = manifest.chains.sources;
    expect(sourcesChain).toContain('assert_global_coverage');
    const covIdx = sourcesChain.indexOf('assert_global_coverage');
    expect(sourcesChain[covIdx - 1]).toBe('compute_parcel_cost_estimates');
    expect(sourcesChain[covIdx + 1]).toBe('assert_parcel_sanity');
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
    const coaChain: string[] = manifest.chains.coa;
    const calibIdx = coaChain.indexOf('compute_phase_calibration');
    const globalIdx = coaChain.indexOf('assert_global_coverage');
    expect(calibIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBe(calibIdx + 1);
  });
});

describe('assert-global-coverage.js — denominator gates (source-script mirroring) [repointed to COMPUTE]', () => {
  it('excludes PRE-% synthetic permits from all real-permit denominators', () => {
    expect(computeSource()).toContain("NOT LIKE 'PRE-%'");
  });

  it('geo_id Step 2 coverage uses simple IS NOT NULL (Denom A — permitsTotal)', () => {
    const content = computeSource();
    expect(content).toContain('geo_id IS NOT NULL');
    expect(content).not.toContain("geo_id ~ '^[0-9]+$'");
  });

  it('massing denominator uses parcel centroid_lat/centroid_lng (mirrors link-massing.js)', () => {
    const content = computeSource();
    expect(content).toContain('centroid_lat IS NOT NULL');
    expect(content).toContain('centroid_lng IS NOT NULL');
  });

  it('trade_forecasts denominator includes is_active = true join (mirrors compute-trade-forecasts.js SOURCE_SQL)', () => {
    expect(computeSource()).toContain('is_active = true');
  });

  it('trade_forecasts denominator excludes SKIP_PHASES exactly (mirrors compute-trade-forecasts.js)', () => {
    const content = computeSource();
    expect(content).toMatch(/require\(['"][^'"]*lifecycle-phase['"]\)/);
    expect(content).toContain('SKIP_PHASES_SQL');
    expect(content).toMatch(/NOT IN.*SKIP_PHASES|lifecycle_phase NOT IN/);
  });

  it('trade_forecasts denominator requires lifecycle_phase IS NOT NULL', () => {
    expect(computeSource()).toMatch(/lifecycle_phase IS NOT NULL/);
  });

  it('trade_forecasts denominator uses COALESCE 3-year recency gate', () => {
    expect(computeSource()).toMatch(/COALESCE\(p\.phase_started_at,\s*p\.issued_date,\s*p\.application_date\)\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'3 years'/);
  });

  it('opportunity_score denominator filters urgency IS NULL OR urgency != expired (mirrors compute-opportunity-scores.js)', () => {
    expect(computeSource()).toContain("urgency IS NULL OR urgency <> 'expired'");
  });
});

describe('assert-global-coverage.js — chain-aware behavior [rewritten: peel 8a, compute no longer knows what a chain is]', () => {
  it('the compute module never reads process.env — chain scoping is descriptor-declared (sharing.varies_by_chain), enforced by compute-shape', () => {
    expect(computeSource()).not.toMatch(/process\.env/);
  });

  it('checks vary per chain (sharing.varies_by_chain.checks === "per_chain")', () => {
    expect(descriptor().sharing.varies_by_chain.checks).toBe('per_chain');
  });

  it('has a sources branch that profiles the parcels table directly (gated zoning_class + max-build fields, chains: [\'sources\'])', () => {
    const zoning = def('src_zoning_class');
    expect(zoning.chain).toEqual(['sources'].length === 1 ? 'sources' : zoning.chain);
    expect(zoning.chain).toBe('sources');
    expect(def('src_max_buildable_footprint_sqm').chain).toBe('sources');
    expect(def('src_max_buildable_gfa_sqm').chain).toBe('sources');
  });

  it('sources branch declares the envelope_constraint_reason VALUE DISTRIBUTION as one kind:"distribution" check (dynamic GROUP BY, collapsed per commit 7)', () => {
    const d = def('src_envelope_constraint_reason_distribution');
    expect(d.builder).toBe('distribution');
    expect(computeSource()).toMatch(/GROUP BY envelope_constraint_reason/);
  });

  it('parcel_cost_menu lives in the sources branch; the shared VOCAB_COVERAGE loop is declared chain: [permits, coa] (sources excluded)', () => {
    expect(def('src_parcel_cost_menu_resid_bldg').chain).toBe('sources');
    for (const t of ['vocab_permit_trades_trade_id', 'vocab_permit_products_product_id', 'vocab_coa_lead_trades_trade_id', 'vocab_permits_neighbourhood_id']) {
      const chains = def(t).chain;
      expect(Array.isArray(chains) && chains.includes('permits') && chains.includes('coa') && !chains.includes('sources'), `${t} must run in permits+coa, not sources`).toBe(true);
    }
  });
});

// ── Named regression locks, table-driven: BUILDER-KIND facts against CHECK_DEFS ──
// (Bug 1/2/3/4/5, W2 regression, WF2 P6.5, WF3-A/B/C, GC-1 — every one of these was
// originally a `coverageRow(...)`/`infoRow(...)`/`externalRow(...)` CALL-SITE text
// lock; the call syntax no longer exists (303 checks are DATA), so each lock is now
// a direct assertion against the declared CHECK_DEFS entry for that field.)

interface BuilderLock {
  id: string;
  builder: string;
  denom?: string | null;
  origin: string;
}

const BUILDER_LOCKS: BuilderLock[] = [
  // Bug 2 — naturally-sparse Step 2 fields use infoRow, not coverageRow.
  { id: 'p_step2_street_direction', builder: 'info', origin: 'Bug 2' },
  { id: 'p_step2_building_type', builder: 'info', origin: 'Bug 2 / W2 regression' },
  { id: 'p_step2_category', builder: 'info', origin: 'Bug 2 / W2 regression' },
  { id: 'p_step2_owner', builder: 'info', origin: 'Bug 2 / W2 regression' },
  { id: 'p_step2_council_district', builder: 'info', origin: 'Bug 2 / W2 regression' },
  { id: 'p_step2_ward', builder: 'info', origin: 'Bug 2' },
  { id: 'p_step2_builder_name', builder: 'info', origin: 'Bug 2' },
  // Bug 1 — completed_date structural sparsity.
  { id: 'p_step2_completed_date', builder: 'info', origin: 'Bug 1' },
  { id: 'p_step3_completed_date', builder: 'info', denom: null, origin: 'WF2 P6.5 [41-#5]' },
  // Bug 3 — CoA lifecycle fields denominated on unlinkedTotal, not coaTotal.
  { id: 'coa_step12_lifecycle_phase', builder: 'coverage', denom: 'unlinkedTotal', origin: 'Bug 3' },
  { id: 'coa_step12_lifecycle_classified_at', builder: 'coverage', denom: 'unlinkedTotal', origin: 'Bug 3' },
  // Bug 5 — NOT NULL DEFAULT false booleans use infoRow (IS NOT NULL is vacuous).
  { id: 'coa_step12_lifecycle_stalled', builder: 'info', origin: 'Bug 5' },
  { id: 'p_step21_lifecycle_stalled', builder: 'info', origin: 'Bug 5' },
  // WF2 P6.5 [41-#4] — dormant entities-chain contact fields use infoRow, not externalRow.
  { id: 'p_step6_primary_phone', builder: 'info', origin: 'WF2 P6.5 [41-#4]' },
  { id: 'p_step6_primary_email', builder: 'info', origin: 'WF2 P6.5 [41-#4]' },
  { id: 'p_step6_website', builder: 'info', origin: 'WF2 P6.5 [41-#4]' },
  // WF3-A — opportunity_score uses the non-expired denominator, not forecastTotal.
  { id: 'p_step23_opportunity_score', builder: 'coverage', denom: 'oppScoreDenom', origin: 'WF3-A' },
  { id: 'p_step24_opportunity_score_gt0', builder: 'coverage', denom: 'oppScoreDenom', origin: 'WF3-A' },
  // WF3-B — enriched_status is inspection-stage-only, infoRow.
  { id: 'p_step4_enriched_status', builder: 'info', origin: 'WF3-B' },
  // WF3-C — third-party scraper fields use externalRow, not coverageRow.
  { id: 'p_step7_is_wsib_registered', builder: 'external', origin: 'WF3-C' },
  { id: 'p_step7_wsib_linked_entity_id', builder: 'external', origin: 'WF3-C' },
  // GC-1 — Step 23 Denom G permit-level rows are design-gated, infoRow not coverageRow.
  { id: 'p_step23_permits_covered', builder: 'info', origin: 'GC-1' },
  { id: 'p_step23_predicted_start', builder: 'info', origin: 'GC-1' },
  { id: 'p_step23_urgency_classified', builder: 'info', origin: 'GC-1' },
  // WF3 #406 (b) — zoning_class is the ONE gated field per chain; every other zoning
  // sub-field is infoRow, so the verdict is provably unmoved except by zoning_class.
  { id: 'coa_step4b_zoning_class', builder: 'calibrated', denom: 'coaTotal', origin: 'WF3 #406 DEC-1' },
  { id: 'p_step9b_zoning_class', builder: 'calibrated', denom: 'permitsTotal', origin: 'WF3 #406 DEC-1' },
  { id: 'p_step9b_bylaw_max_fsi', builder: 'info', origin: 'WF3 #406' },
  { id: 'p_step9b_bylaw_max_height_m', builder: 'info', origin: 'WF3 #406' },
  { id: 'p_step9b_exception_number', builder: 'info', origin: 'WF3 #406' },
  { id: 'p_step9b_applicable_bylaws', builder: 'info', origin: 'WF3 #406' },
  { id: 'p_step9b_overlay_summary', builder: 'info', origin: 'WF3 #406' },
  { id: 'p_step9b_zoning_parcel_count', builder: 'info', origin: 'WF3 #406' },
  { id: 'p_step9b_zoning_dominant_parcel_id', builder: 'info', origin: 'WF3 #406' },
  { id: 'p_step9b_zoning_dominant_parcel_method', builder: 'info', origin: 'WF3 #406' },
  { id: 'coa_step4b_bylaw_max_fsi', builder: 'info', origin: 'WF3 #406' },
  { id: 'coa_step4b_variance_context', builder: 'info', origin: 'WF3 #406' },
  // WF2 #415 — ravine fields never gated.
  { id: 'p_step9b_is_in_ravine_protection_area', builder: 'info', denom: null, origin: 'WF2 #415' },
  { id: 'p_step9b_ravine_distance_m', builder: 'info', denom: null, origin: 'WF2 #415' },
  { id: 'coa_step4b_is_in_ravine_protection_area', builder: 'info', denom: null, origin: 'WF2 #415' },
  { id: 'coa_step4b_ravine_distance_m', builder: 'info', denom: null, origin: 'WF2 #415' },
  // WF3 #428 — heritage fields never gated.
  { id: 'p_step9b_is_heritage_designated', builder: 'info', denom: null, origin: 'WF3 #428' },
  { id: 'p_step9b_heritage_designation_type', builder: 'info', denom: null, origin: 'WF3 #428' },
  { id: 'p_step9b_heritage_designation_date', builder: 'info', denom: null, origin: 'WF3 #428' },
  { id: 'coa_step4b_is_heritage_designated', builder: 'info', denom: null, origin: 'WF3 #428' },
  { id: 'coa_step4b_heritage_designation_type', builder: 'info', denom: null, origin: 'WF3 #428' },
  { id: 'coa_step4b_heritage_designation_date', builder: 'info', denom: null, origin: 'WF3 #428' },
  // §8e centreline — never gated.
  { id: 'p_step9b_is_corner_lot', builder: 'info', denom: null, origin: '§8e centreline' },
  { id: 'p_step9b_is_through_lot', builder: 'info', denom: null, origin: '§8e centreline' },
  { id: 'p_step9b_primary_frontage_street_name', builder: 'info', denom: null, origin: '§8e centreline' },
  { id: 'coa_step4b_is_corner_lot', builder: 'info', denom: null, origin: '§8e centreline' },
  { id: 'coa_step4b_is_through_lot', builder: 'info', denom: null, origin: '§8e centreline' },
  { id: 'coa_step4b_primary_frontage_street_name', builder: 'info', denom: null, origin: '§8e centreline' },
];

describe('assert-global-coverage — builder-kind regression locks (table-driven, CHECK_DEFS)', () => {
  for (const lock of BUILDER_LOCKS) {
    it(`${lock.id} declares builder:"${lock.builder}"${lock.denom !== undefined ? ` denom:${JSON.stringify(lock.denom)}` : ''} (${lock.origin})`, () => {
      const d = def(lock.id);
      expect(d.builder, `${lock.id}.builder`).toBe(lock.builder);
      if (lock.denom !== undefined) expect(d.denom ?? null, `${lock.id}.denom`).toBe(lock.denom);
    });
  }

  it('IL-3/DEC-1: zoning_class is reachable via limit_from_config at both call sites (CoA + permits), not a bare 80/75 literal', () => {
    expect(def('coa_step4b_zoning_class').passVar).toBe('zoning_class_coverage_pass_pct');
    expect(def('coa_step4b_zoning_class').warnVar).toBe('zoning_class_coverage_warn_pct');
    expect(def('p_step9b_zoning_class').passVar).toBe('zoning_class_coverage_pass_pct');
    expect(def('p_step9b_zoning_class').warnVar).toBe('zoning_class_coverage_warn_pct');
  });
});

describe('assert-global-coverage.js — Bug 3/4: CoA lifecycle denominator SQL + retired Phase-G rows [repointed to COMPUTE]', () => {
  it('CoA aggregate query counts unlinked_total (linked_permit_num IS NULL)', () => {
    expect(computeSource()).toMatch(/linked_permit_num IS NULL[\s\S]{0,60}AS unlinked_total/);
  });

  it('permits chain misc query includes coa_unlinked_total for Step 21', () => {
    expect(computeSource()).toMatch(/coa_unlinked_total/);
  });

  it('CoA lifecycle_phase_pop excludes linked apps (numerator cannot exceed unlinkedTotal denominator)', () => {
    expect(computeSource()).toContain('lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL');
  });

  it('uses COUNT(DISTINCT permit_num) for pre-permit numerator (Bug 4 — not COUNT(*))', () => {
    expect(computeSource()).toMatch(/COUNT\(DISTINCT permit_num\)[\s\S]{0,50}PRE-%/);
  });

  it('Phase G — Step 17 / CoA Step 5 (create_pre_permits) / CoA Step 6 (assert_pre_permit_aging) rows are NOT declared (retired)', () => {
    const retiredTargets = ['Step 17 — create_pre_permits', 'CoA Step 5 — create_pre_permits', 'CoA Step 6 — assert_pre_permit_aging'];
    for (const target of retiredTargets) {
      expect(FIELDS.CHECK_DEFS.some((d) => d.stepTarget === target), `a check still declares retired target "${target}"`).toBe(false);
    }
  });

  it('CoA aggregate counts lifecycle_stalled = true / permits counts lifecycle_stalled = true (Bug 5 — never IS NOT NULL)', () => {
    expect(computeSource()).toContain('lifecycle_stalled = true AND linked_permit_num IS NULL)   AS lifecycle_stalled_true_pop');
    expect(computeSource()).toContain('lifecycle_stalled = true)                     AS lifecycle_stalled_pop');
  });
});

describe('assert-global-coverage.js — WF3-D: SKIP_PHASES_SQL imported from shared lib [repointed to COMPUTE]', () => {
  it('requires SKIP_PHASES_SQL from scripts/lib/lifecycle-phase.js', () => {
    expect(computeSource()).toMatch(/require\(['"][^'"]*lifecycle-phase['"]\)/);
  });

  it('does not define SKIP_PHASES_SQL as a local backtick literal', () => {
    expect(computeSource()).not.toMatch(/const SKIP_PHASES_SQL\s*=\s*`/);
  });
});

describe('chain specs — step counts DERIVED from manifest.chains, never retyped', () => {
  // WF2 SPECTBL-1 follow-on, 2026-09-15: these two assertions used to pin the literals
  // `32 (sequential` and `**Steps:** 12` — a retyped copy of a fleet count that the manifest
  // already owns. They went red at pre-push the moment the chain specs were reconciled to the
  // live chains (permits 32->33 with `dispatch_notifications`, coa 12->16). A count assertion
  // that has to be hand-edited every time the chain changes is not a lock, it is a second
  // source of truth — so the expected value is now READ from `manifest.chains[chain].length`
  // and every chain spec carrying a `**Steps:** N` line is covered, not just 41 and 42.
  // (No Spec 124 register row is cited here: the "fleet counts derived, never retyped" rule is
  //  proposed, not ratified — the register ends at R-AI, and R-AJ..R-AM are batch-2 row 0.8's to
  //  allocate. This lock stands on its own measured premise until then.)
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as { chains: Record<string, string[]> };
  const CHAIN_SPEC: [chain: string, specFile: string][] = [
    ['permits', '41_chain_permits.md'],
    ['coa', '42_chain_coa.md'],
    ['sources', '43_chain_sources.md'],
    ['deep_scrapes', '44_chain_deep_scrapes.md'],
    ['entities', '45_chain_entities.md'],
    ['wsib', '46_wsib_enrichment.md'],
  ];
  const specText = (f: string) => fs.readFileSync(path.join(REPO_ROOT, 'docs', 'specs', '01-pipeline', f), 'utf8');

  it('the chain -> spec map covers every manifest chain (a new chain cannot be silently skipped here)', () => {
    expect(CHAIN_SPEC.map(([c]) => c).sort()).toEqual(Object.keys(manifest.chains).sort());
  });

  for (const [chain, specFile] of CHAIN_SPEC) {
    it(`${specFile} — its **Steps:** line states chains.${chain}.length`, () => {
      const m = specText(specFile).match(/^\*\*Steps:\*\*\s+(\d+)\b/m);
      expect(m, `${specFile} has no "**Steps:** N" line`).not.toBeNull();
      expect(Number(m![1])).toBe(manifest.chains[chain]!.length);
    });
  }

  it('41 and 42 keep their prose shape ("N (sequential", "stop-on-failure") — the reconciliation reworded the line, it did not drop the contract', () => {
    expect(specText('41_chain_permits.md')).toContain(`${manifest.chains.permits!.length} (sequential`);
    const coa = specText('42_chain_coa.md');
    expect(coa).toMatch(new RegExp(`\\*\\*Steps:\\*\\*\\s+${manifest.chains.coa!.length}\\b`));
    expect(coa).toContain('stop-on-failure');
  });

  it('RED direction — the derivation is not vacuous: a wrong count does NOT match the live spec line', () => {
    const m = specText('41_chain_permits.md').match(/^\*\*Steps:\*\*\s+(\d+)\b/m);
    expect(Number(m![1])).not.toBe(manifest.chains.permits!.length + 1);
    expect(specText('41_chain_permits.md')).not.toContain(`${manifest.chains.permits!.length + 1} (sequential`);
  });
});

describe('assert-global-coverage.js — Surgical Triangle input coverage (WF2 #4) [repointed to COMPUTE]', () => {
  it('tracks parcels.lot_size_sqm coverage (Step 9 — link_parcels)', () => {
    expect(computeSource()).toMatch(/parcels\.lot_size_sqm|lot_size_sqm/);
    expect(def('p_step9_lot_size_sqm').builder).toBe('coverage');
  });

  it('tracks building_footprints.footprint_area_sqm / max_height_m coverage (Step 11 — link_massing)', () => {
    expect(def('p_step11_footprint_area_sqm').builder).toBe('coverage');
    expect(def('p_step11_max_height_m').builder).toBe('coverage');
  });

  it('pb aggregate LEFT JOINs building_footprints on building_id (Pass-2 fold)', () => {
    expect(computeSource()).toMatch(/LEFT JOIN building_footprints bf ON bf\.id\s*=\s*pb\.building_id/);
  });

  it('tracks permits.storeys coverage (Step 2 — load_permits)', () => {
    expect(def('p_step2_storeys').builder).toBe('coverage');
  });
});

describe('assert-global-coverage.js — Pass-2 CoA chain coverage additions', () => {
  const stepTargets = [
    'CoA Step 4 — link_coa_to_parcels',
    'CoA Step 5 — classify_coa_scope',
    'CoA Step 6 — classify_coa_trades',
    'CoA Step 7 — compute_coa_cost_estimates',
    'CoA Step 14 — compute_phase_calibration',
    'CoA Step 8 — link_coa',
    'CoA Step 9 — refresh_snapshot',
    'CoA Step 10 — assert_data_bounds',
    'CoA Step 11 — assert_engine_health',
    'CoA Step 12 — classify_lifecycle_phase',
    'CoA Step 13 — assert_lifecycle_phase_distribution',
  ];
  for (const target of stepTargets) {
    it(`a check declares stepTarget "${target}" (manifest order resync)`, () => {
      expect(FIELDS.CHECK_DEFS.some((d) => d.stepTarget === target), `no check declares "${target}"`).toBe(true);
    });
  }

  it('CoA Step 4 — neighbourhood_id is denominated on the lead_parcels-matched subset (cx.lead_parcels_coa_rows), not coaTotal', () => {
    expect(def('coa_step4_neighbourhood_id').denom).toBe('cx.lead_parcels_coa_rows');
    expect(computeSource()).toMatch(/WHERE neighbourhood_id IS NOT NULL\)\s+AS neighbourhood_id_pop/);
  });
});

describe('assert-global-coverage.js — WF3 #406 zoning coverage rows (a) SQL presence [repointed to COMPUTE]', () => {
  it('permits + coa aggregates count zoning_class_pop', () => {
    expect((computeSource().match(/zoning_class IS NOT NULL\)\s*(?:FILTER[^A]*)?AS zoning_class_pop/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('assert-global-coverage.js — WF2 #415 ravine / WF3 #428 heritage / §8e centreline coverage SQL [repointed to COMPUTE]', () => {
  it('both branches count in_ravine_pop via FILTER on the boolean (not IS NOT NULL — vacuous)', () => {
    const content = computeSource();
    expect((content.match(/FILTER \(WHERE is_in_ravine_protection_area\)\s*AS in_ravine_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(content).not.toMatch(/is_in_ravine_protection_area IS NOT NULL/);
  });

  it('both branches count ravine_distance_pop via IS NOT NULL (legitimately sparse)', () => {
    expect((computeSource().match(/ravine_distance_m IS NOT NULL\)\s*AS ravine_distance_pop/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('both branches count is_heritage_designated via FILTER on the boolean (not IS NOT NULL — vacuous)', () => {
    const content = computeSource();
    expect((content.match(/FILTER \(WHERE is_heritage_designated\)\s*AS heritage_designated_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(content).not.toMatch(/is_heritage_designated IS NOT NULL/);
  });

  it('heritage type/date counted via IS NOT NULL, both branches', () => {
    const content = computeSource();
    expect((content.match(/heritage_designation_type IS NOT NULL\)\s*AS heritage_type_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((content.match(/heritage_designation_date IS NOT NULL\)\s*AS heritage_date_pop/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('both branches count is_corner_lot / is_through_lot via FILTER on the boolean (not IS NOT NULL — vacuous)', () => {
    const content = computeSource();
    expect((content.match(/FILTER \(WHERE is_corner_lot\)\s*AS corner_lot_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((content.match(/FILTER \(WHERE is_through_lot\)\s*AS through_lot_pop/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(content).not.toMatch(/is_corner_lot IS NOT NULL/);
    expect(content).not.toMatch(/is_through_lot IS NOT NULL/);
  });

  it('centreline frontage counted via IS NOT NULL, both branches', () => {
    expect((computeSource().match(/primary_frontage_street_name IS NOT NULL\)\s*AS frontage_name_pop/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('assert-global-coverage.js — §3 vocabulary-coverage [repointed to FIELDS]', () => {
  it('VOCAB_COVERAGE matrix uses camelCase keys (NOT the banned step_target:/populated: columnar keys)', () => {
    const content = fieldsSource();
    expect(content).toMatch(/const VOCAB_COVERAGE = \[/);
    expect(content).toMatch(/stepTarget:/);
    expect(content).toMatch(/dataTable:.*dataColumn:/);
    expect(content).toMatch(/vocabTable:.*vocabColumn:/);
    expect(content).not.toMatch(/step_target:/);
  });

  it('declares the trade-vocab triples (the gap this guards) + the neighbourhood healthy control (4 entries, §3.0 correction 1)', () => {
    const content = fieldsSource();
    expect(content).toMatch(/dataTable: 'permit_trades', dataColumn: 'trade_id'/);
    expect(content).toMatch(/dataTable: 'permit_products', dataColumn: 'product_id'/);
    expect(content).toMatch(/dataTable: 'lead_trades', dataColumn: 'trade_id'/);
    expect(content).toMatch(/lead_id LIKE 'coa:%'/);
    expect(content).toMatch(/dataTable: 'permits', dataColumn: 'neighbourhood_id'/); // control
    expect(FIELDS.CHECK_DEFS.filter((d) => Array.isArray(d.chain) && d.chain.includes('permits') && d.chain.includes('coa') && !d.chain.includes('sources'))).toHaveLength(4);
  });

  it('CoA structure_type vocab triple is emitted INLINE (CoA-scoped collapse-detector), not in the shared array', () => {
    const content = fieldsSource();
    expect(content).toMatch(/dataTable: 'coa_applications', dataColumn: 'structure_type'/);
    expect(content).toMatch(/vocabTable: 'scope_intensity_matrix', vocabColumn: 'structure_type'/);
    const arrayStart = content.indexOf('const VOCAB_COVERAGE = [');
    const arrayEnd = content.indexOf('];', arrayStart);
    const arraySlice = content.slice(arrayStart, arrayEnd);
    expect(arraySlice).not.toMatch(/coa_applications/);
    expect(def('vocab_coa_structure_type').chain).toBe('coa');
  });

  it('delegates resolve+count to the shared lib and maps any unresolved marker → a declared, visible outcome', () => {
    const content = computeSource();
    expect(content).toMatch(/resolveAndCountTriple/);
    expect(content).toMatch(/unresolved: \$\{result\.unresolved\}/);
  });

  it('vocab_size = 0 renders a declared, non-crashing detail (nothing to measure)', () => {
    expect(computeSource()).toMatch(/if \(!result\.vocab_size\)/);
  });

  it('every vocab check gates PASS/WARN/FAIL via the vocab_coverage_pass_pct/warn_pct logic variables', () => {
    const vars = descriptor().config.logic_variables as Array<{ name: string }>;
    expect(vars.some((v) => v.name === 'vocab_coverage_pass_pct')).toBe(true);
    expect(vars.some((v) => v.name === 'vocab_coverage_warn_pct')).toBe(true);
  });
});
