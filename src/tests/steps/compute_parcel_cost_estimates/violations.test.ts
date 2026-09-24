// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.1/§2.3/§2.4/§2.5/§2.8/§2.9/§2.10/§2.11 (+ Spec 43 §Step Breakdown step 23 owner, Spec 122 §5.1 shape)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §1.1 (behaviour-neutral), §3.1 (PIN), §7 (commit ledger)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 compute-is-just-compute, Rule 3 tunables, Rule 10 row-derived verdict, R-AU pricing-data-admin-editable)
//
// ============================================================================
// Batch-2 row 2.4 — `compute_parcel_cost_estimates`, ENRICHER's FIFTH converted member,
// COMPRESSED 3-commit form (Spec 124 R-PACE-1/R-AH). CPCE-A1 RULED = retire the Phase-B-B3
// run-ledger gate (Spec 124 R-AR.1). See .cursor/batch2_p2_4_compute_parcel_cost_estimates_active_task.md.
//
// DB-FREE HALF ONLY (FOLD-V5): tests 7, 8, 9, 10, 12, 17, 18, 19 of the plan's §5 require a live
// DB (seeded cohorts, information_schema probes, an engine stub driving a real run, a real audit
// table) and belong in src/tests/db/compute-parcel-cost-estimates-violations.db.test.ts — NOT YET
// BUILT in this pass (see the assessment/handback report). This file carries claims 1-6, 11, 13-16.
//
// The 11-pair seam assertion (test 14b) was cutover-only (`deriveSeamPairs` reads
// converted.json) and shipped `it.fails()` until commit ③ registered the slug — now a plain
// passing `it`.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/compute-parcel-cost-estimates.js';
const COMPUTE_REL = 'scripts/lib/compute/compute-parcel-cost-estimates.js';
const DESCRIPTOR_REL = 'scripts/compute-parcel-cost-estimates.descriptor.json';

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// Batch-2 row 2.5 (FOLD A2) — runCostMenuPass now reads ctx.contract.lines (the merged
// parcel_cost_lines catalogue) instead of the module-literal PARCEL_COST_LINES. Any fake ctx
// built for this compute module's tests must carry it. Shared across the fake-ctx describe
// blocks below (CPCE-D3) the same way the other three test files share their own `LINES` const.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- scripts/lib is CommonJS
const { PARCEL_COST_LINES, mergeCostLines } = require(path.join(REPO_ROOT, 'scripts/lib/parcel-cost.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- JSON fixture, not a module
const SEED_LINE_ROWS = require(path.join(REPO_ROOT, 'src/tests/fixtures/parcel-cost-lines.seed.json'));
const FAKE_CTX_LINES = mergeCostLines(PARCEL_COST_LINES, SEED_LINE_ROWS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadDescriptor(): any {
  return JSON.parse(read(DESCRIPTOR_REL));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadCompute(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(REPO_ROOT, COMPUTE_REL));
}

describe('compute_parcel_cost_estimates — test 1: G-shape', () => {
  it('the frozen shell declares ADVISORY_LOCK_ID = 117 as source text (pipeline-advisory-lock.infra.test.ts reads this file)', () => {
    const src = read(STEP_REL);
    expect(src).toMatch(/ADVISORY_LOCK_ID\s*=\s*117/);
  });

  it('the frozen shell has no `pipeline.run(` call and no module-scope `new Pool` — it is pipeline.step(descriptor, compute)', () => {
    const src = read(STEP_REL);
    expect(src).not.toMatch(/pipeline\.run\(/);
    expect(src).not.toMatch(/new Pool\(/);
    expect(src).toMatch(/pipeline\.step\(descriptor, compute\)/);
  });
});

describe('compute_parcel_cost_estimates — test 2: descriptor validates', () => {
  it('descriptor validates against step.schema.json; identity.lock === 117, archetype ENRICHER, name matches', () => {
    const descriptor = loadDescriptor();
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const Ajv: any = require('ajv');
    const ajv = new Ajv({ allErrors: true, strict: false });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schema = require(path.join(REPO_ROOT, 'scripts/steps/_schema/step.schema.json'));
    const validate = ajv.compile(schema);
    const valid = validate(descriptor);
    if (!valid) throw new Error(JSON.stringify(validate.errors, null, 2));
    expect(valid).toBe(true);
    expect(descriptor.identity.lock).toBe(117);
    expect(descriptor.identity.archetype).toBe('ENRICHER');
    expect(descriptor.identity.name).toBe('compute_parcel_cost_estimates');
  });

  it('execution.phases.length === 1, outputs.writes.length === 2 (CPCE-D2 added a class-O retraction target, writes_ref 0 unchanged), guard_columns.length === 16 on both', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.execution.phases).toHaveLength(1);
    expect(descriptor.execution.phases[0].writes_ref).toBe(0);
    expect(descriptor.outputs.writes).toHaveLength(2);
    expect(descriptor.outputs.writes[0].write_discipline.guard_columns).toHaveLength(16);
    expect(descriptor.outputs.writes[1].write_discipline.guard_columns).toHaveLength(16);
    expect(descriptor.outputs.writes[1].write_discipline.class).toBe('set_based_null_retract');
  });

  it('RED — dropping a guard column would narrow the guard (regression lock on the declared shape)', () => {
    const descriptor = loadDescriptor();
    const withoutOne = descriptor.outputs.writes[0].write_discipline.guard_columns.slice(1);
    expect(withoutOne).toHaveLength(15); // proves the array is genuinely 16-long, not accidentally shorter
  });
});

describe('compute_parcel_cost_estimates — test 3: zero pool construction, zero queries on require', () => {
  it('requiring the compute module constructs no pg.Pool and issues no queries', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pg = require('pg');
    let constructed = 0;
    const OrigPool = pg.Pool;
    pg.Pool = class extends OrigPool { constructor(...args: unknown[]) { super(...(args as [])); constructed++; } };
    delete require.cache[require.resolve(path.join(REPO_ROOT, COMPUTE_REL))];
    loadCompute();
    expect(constructed).toBe(0);
    pg.Pool = OrigPool;
  });
});

describe('compute_parcel_cost_estimates — test 4: named exports + declared hooks genuinely exported', () => {
  it('exports readCostContract, runCostMenuPass, computePostPhase, passes[]', () => {
    const compute = loadCompute();
    expect(typeof compute.readCostContract).toBe('function');
    expect(typeof compute.runCostMenuPass).toBe('function');
    expect(typeof compute.computePostPhase).toBe('function');
    expect(compute.passes).toEqual([{ name: 'cost_menu', txn: 'post_commit', run: compute.runCostMenuPass }]);
  });

  it('RED — a renamed hook export would break the descriptor->compute resolution named in execution.enrich_hooks', () => {
    const descriptor = loadDescriptor();
    const compute = loadCompute();
    expect(typeof compute[descriptor.execution.enrich_hooks.contract_read]).toBe('function');
    expect(typeof compute[descriptor.execution.enrich_hooks.post_phase]).toBe('function');
  });
});

describe('compute_parcel_cost_estimates — test 5: Rule 3, both directions', () => {
  it('every config.logic_variables[].name has a seed row with on_invalid:"fail" and a seeded admin.group; 20 total (19 + S0.2\'s product_scope_max_existing_gfa_sqm)', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.config.logic_variables).toHaveLength(20);
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const seeds: any = require(path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json'));
    for (const v of descriptor.config.logic_variables) {
      expect(seeds[v.name], `seed row for ${v.name}`).toBeDefined();
      expect(v.on_invalid).toBe('fail');
      expect(seeds[v.name].admin && seeds[v.name].admin.group, `admin.group for ${v.name}`).toBeTruthy();
    }
  });

  it('no threshold-shaped literal survives in the compute module or the engine (a defaulted config argument would be a literal wearing a variable\'s name)', () => {
    const engineSrc = read('scripts/lib/parcel-cost.js');
    // The historical literal defaults must be GONE from the engine's live code paths — only
    // documentation/comment occurrences of 99.999 survive (the seed-default citation).
    expect(engineSrc).not.toMatch(/\?\?\s*1[^0-9]/); // no more `?? 1` fallback defaults
    expect(engineSrc).toMatch(/requires opts\.config/); // the REQUIRED-config guard is present
    expect(engineSrc).toMatch(/requires cfg\./); // escalationMultiplier's REQUIRED-cfg guard
  });
});

describe('compute_parcel_cost_estimates — test 6: counter-root, both directions (FOLD-I8)', () => {
  it('GREEN — a pass returning {updated, scanned} yields records_updated=N, records_total=M via the un-seam-owned fallback', async () => {
    const compute = loadCompute();
    // runCostMenuPass returns `updated`/`scanned` by those exact key names (never `rows_updated`).
    const src = compute.runCostMenuPass.toString();
    expect(src).toMatch(/scanned/);
    expect(src).toMatch(/updated/);
  });

  it('the descriptor declares counters.records_updated sourced from written.e1.updated, never a seam key', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.counters.records_updated.source).toBe('written.e1.updated');
    expect(descriptor.counters.records_total.source).toBe('matched.compute.residential_parcels_examined');
  });
});

describe('compute_parcel_cost_estimates — test 11: CPCE-D3 CLOSED — the counter is declared, not pinned', () => {
  it('unmapped_residential_family_fallback_count is a real checks[] entry (WARN, viol==0, retighten_when) — the vacuity limitations[] pin is gone', () => {
    const descriptor = loadDescriptor();
    const pinned = descriptor.limitations.find((l: { what: string }) => l.what.includes('unmapped_residential_family_fallback_count'));
    expect(pinned, 'the vacuity limitations[] pin must be deleted once D3 is closed').toBeUndefined();

    const check = descriptor.checks.find((c: { id: string }) => c.id === 'unmapped_residential_family_fallback_count');
    expect(check, 'a checks[] entry for unmapped_residential_family_fallback_count').toBeDefined();
    expect(check.limit).toBe('viol == 0');
    expect(check.severity).toBe('WARN');
    expect(check.blocking).toBe(false);
    expect(check.retighten_when).toMatch(/Spec 88 P2/);
    expect(check.why.text).toMatch(/105,595/);
    // R-H adjudication: NO new logic variable — the plan's alternative ceiling was rejected.
    expect(descriptor.config.logic_variables.find((v: { name: string }) => v.name === 'compute_parcel_cost_unmapped_family_max_count')).toBeUndefined();
  });
});

describe('compute_parcel_cost_estimates — test 13: chain wiring', () => {
  it('sources chain has 28 steps; compute_parcel_cost_estimates sits at index 22 (0-based), immediately after enrich_parcels', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const manifest: any = require(path.join(REPO_ROOT, 'scripts/manifest.json'));
    const slugs: string[] = manifest.chains.sources;
    expect(slugs).toHaveLength(28);
    expect(slugs.indexOf('compute_parcel_cost_estimates')).toBe(22);
    expect(slugs[21]).toBe('enrich_parcels');
    expect(slugs[23]).toBe('assert_global_coverage');
  });
});

describe('compute_parcel_cost_estimates — test 14: cross-step ledger', () => {
  it('inputs.reads.steps derived from ledger.stepUpstreams equals exactly [enrich_parcels, parcels]', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const ledger: any = require(path.join(REPO_ROOT, 'scripts/lib/ledger.js'));
    const upstreams = ledger.stepUpstreams('compute_parcel_cost_estimates', { chain: 'sources' });
    expect(upstreams).toEqual(['enrich_parcels', 'parcels']);
    const descriptor = loadDescriptor();
    expect(descriptor.inputs.reads.steps.map((s: { step: string }) => s.step)).toEqual(['enrich_parcels', 'parcels']);
  });

  // Cutover-only (T9a) — commit ③ registers the slug in converted.json; deriveSeamPairs now
  // sees it, and the seam-pair registry moves 9 -> 11 (both directions — see
  // src/tests/step-seam.logic.test.ts for the full derivation). Was it.fails() before ③.
  // WIDENED AGAIN at the batch-2 row 3.1 cutover (2026-09-24): address_points registering
  // adds TWO MORE pairs (address_points -> geocode_permits, address_points ->
  // link_parcel_addresses — neither involving this step), moving the fleet-wide count
  // 11 -> 13. See src/tests/step-seam.logic.test.ts for the full derivation; this lock only
  // asserts the arithmetic reflects the live registry, not this step's own contribution.
  // WIDENED AGAIN at the batch-2 row 3.7 cutover (2026-09-24): parcels registering adds
  // THREE MORE pairs — parcels -> compute_centroids, parcels -> compute_parcel_cost_estimates
  // (this step's OWN read of the parcels table, now finally live), parcels ->
  // link_parcel_addresses — moving the fleet-wide count 13 -> 16. See
  // src/tests/step-seam.logic.test.ts for the full derivation; this lock only asserts the
  // arithmetic reflects the live registry, not this step's own contribution alone.
  it('[flipped at commit 3] registered in converted.json, the seam-pair registry moved 9 -> 11 -> 13 -> 16 (batch-2 row 3.7, 2026-09-24)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const seam: any = require(path.join(REPO_ROOT, 'scripts/lib/step/seam.js'));
    const registry = seam.loadConvertedDescriptors();
    expect(seam.deriveSeamPairs(registry).length).toBe(16);
  });
});

describe('compute_parcel_cost_estimates — test 15: dry-run / force_full retirement (RULED)', () => {
  it('override.dry_run === "none" and override.force_full === "none"; the frozen shell parses no argv', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.override.dry_run).toBe('none');
    expect(descriptor.override.force_full).toBe('none');
    const src = read(STEP_REL);
    expect(src).not.toMatch(/process\.argv/);
    expect(src).not.toMatch(/--dry-run/);
    expect(src).not.toMatch(/--limit=/);
  });

  it('a deviations[] entry names both retired flags (--dry-run/--limit and COMPUTE_PARCEL_COST_FORCE_FULL)', () => {
    const descriptor = loadDescriptor();
    const hit = descriptor.deviations.find((d: { from: string }) => /dry-run|FORCE_FULL/.test(d.from));
    expect(hit, 'a deviations[] entry naming the retired flags').toBeDefined();
  });
});

describe('compute_parcel_cost_estimates — test 16: the stream batch size is LIVE (FOLD-I4)', () => {
  it('GREEN — the pass calls ctx.stream with an explicit batchSize option sourced from config.compute_parcel_cost_stream_batch_size', () => {
    const compute = loadCompute();
    const src = compute.runCostMenuPass.toString();
    expect(src).toMatch(/ctx\.stream\(buildSourceSql\(maxExistingGfaSqm\),\s*\[\],\s*\{\s*batchSize:\s*streamBatchSize\s*\}\)/);
    expect(src).toMatch(/streamBatchSize\s*=\s*Number\(config\.compute_parcel_cost_stream_batch_size\)/);
  });
});

describe('compute_parcel_cost_estimates — CPCE-A1: run-ledger gate retirement, declared', () => {
  it('staleness.mode_select === "none", staleness.scope === "all", no gate-SKIP terminal is declared', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.staleness.mode_select).toBe('none');
    expect(descriptor.staleness.scope).toBe('all');
    expect(descriptor.terminals.map((t: { id: string }) => t.id)).not.toContain('gate_skip');
    const hit = descriptor.deviations.find((d: { from: string }) => /run-ledger gate/.test(d.from));
    expect(hit, 'a deviations[] entry naming the retired run-ledger gate').toBeDefined();
    expect(hit.adjudicated_by).toMatch(/CPCE-A1/);
  });
});

describe('compute_parcel_cost_estimates — CPCE-D1: undatable rate table WARNs, symmetric with the index clock', () => {
  const compute = loadCompute();

  // computePostPhase issues exactly three pool.query calls (freshness, menu-coverage %, the
  // ZONE_SQL per-zone block) — this fake pool answers all three off SQL-text fingerprints
  // (`AS pct` / `GROUP BY 1` / else-freshness) so the RED/GREEN cases below never touch a DB.
  // The zone bucket is a single RD row carrying the whole `scanned` count so the `:386`
  // cost_by_zone Σ-identity holds trivially and never masks the assertion under test.
  function stubPool(freshRow: Record<string, unknown>, scanned: number) {
    const zoneRows = [{ zone: 'RD', parcels: scanned, menus: 0, empty_menus: 0, p50_cost_fb: null, max_cost_gut: null }];
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query: async (sql: string): Promise<any> => {
        if (sql.includes('AS pct')) return { rows: [{ pct: 100 }] };
        if (sql.includes('GROUP BY 1')) return { rows: zoneRows };
        return { rows: [freshRow] };
      },
    };
  }

  async function runPost(freshRow: Record<string, unknown>, scanned = 5) {
    return compute.computePostPhase(stubPool(freshRow, scanned), {
      passRaw: {
        cost_menu: {
          scanned, updated: 0, recordsSkipped: 0, engineErrorCount: 0, nullGeomBasisCount: 0,
          fsiImplausibleCount: 0, newBuildFallbackCount: 0, fitGatedSuiteCount: 0, fitGatedGarageCount: 0,
          lineCoverage: {}, confidenceTotals: { high: 0, medium: 0, low: 0 }, ratesAsOf: null, indexUpdatedAt: null,
        },
      },
      config: { cost_rates_stale_months: 3, cost_index_stale_months: 4, cost_escalation_index: 100 },
      runAt: new Date('2026-09-21T00:00:00Z'),
    });
  }

  it('undatable rate table (MAX(as_of_date) IS NULL) scores cost_rates_stale=1, detail="undatable" — was 0/false', async () => {
    const result = await runPost({ rates_as_of: null, rates_age_months: null, index_age_months: 2, rates_future: false });
    expect(result.matched.cost_rates_stale).toBe(1);
    expect(result.matched.cost_rates_stale_detail).toBe('undatable');
  });

  it('both directions — fresh(2mo)=0/false, stale(9mo)=1/true, future-dated=2/"future_dated" (the FAIL tier is not swallowed by the fix)', async () => {
    const fresh = await runPost({ rates_as_of: '2026-07-01', rates_age_months: 2, index_age_months: 2, rates_future: false });
    expect(fresh.matched.cost_rates_stale).toBe(0);
    expect(fresh.matched.cost_rates_stale_detail).toBe(false);

    const stale = await runPost({ rates_as_of: '2026-01-01', rates_age_months: 9, index_age_months: 2, rates_future: false });
    expect(stale.matched.cost_rates_stale).toBe(1);
    expect(stale.matched.cost_rates_stale_detail).toBe(true);

    const future = await runPost({ rates_as_of: '2099-01-01', rates_age_months: -900, index_age_months: 2, rates_future: true });
    expect(future.matched.cost_rates_stale).toBe(2);
    expect(future.matched.cost_rates_stale_detail).toBe('future_dated');
  });
});

// Batch-2 row 2.5 (FOLD A2, Spec 88 §2.3, Spec 124 R-AU) — readCostContract's parcel_cost_lines
// half: zero-row HALT (mirrors the archetype_cost_rates guard immediately above it), the
// mergeCostLines id-mismatch HALT surfacing through the SAME function, and the happy path
// returning 13 merged lines + linesUpdatedAt. Fake pool, no DB (C1 — mirrors CPCE-D1's stubPool
// SQL-text-fingerprint dispatch pattern).
describe('compute_parcel_cost_estimates — CPCE FOLD A2: readCostContract parcel_cost_lines (fake pool, no DB)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SEED_ROWS = require('../../fixtures/parcel-cost-lines.seed.json') as Array<{
    id: string;
    archetype: string;
    base_confidence: 'high' | 'medium' | 'low';
    fit_permitted_values: string[] | null;
  }>;
  const ONE_RATE_ROW = [{ archetype: 'FB', cost_per_sqm: 100, cost_adjustment_factor: 1, escalation_index_base: 100 }];

  function stubPool(linesRows: unknown[], sigExtra: Record<string, unknown> = {}) {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query: async (sql: string): Promise<any> => {
        if (sql.includes('AS rates_as_of')) {
          return { rows: [{ rates_as_of: null, index_updated_at: null, cost_lines_updated_at: '2026-09-23T00:00:00.000Z', ...sigExtra }] };
        }
        if (sql.includes('base_confidence')) return { rows: linesRows };
        return { rows: ONE_RATE_ROW };
      },
    };
  }

  it('throws naming parcel_cost_lines + migration 248 on zero rows', async () => {
    const compute = loadCompute();
    await expect(compute.readCostContract(stubPool([]))).rejects.toThrow(/parcel_cost_lines is empty.*migration 248/);
  });

  it('throws (via mergeCostLines) on an id unknown to PARCEL_COST_LINES', async () => {
    const compute = loadCompute();
    const badRows = [...SEED_ROWS, { id: 'not_a_line', archetype: 'FB', base_confidence: 'high', fit_permitted_values: null }];
    await expect(compute.readCostContract(stubPool(badRows))).rejects.toThrow(/mergeCostLines: parcel_cost_lines id is unknown to PARCEL_COST_LINES: not_a_line/);
  });

  it('throws (via mergeCostLines) when a structural id has no DB row', async () => {
    const compute = loadCompute();
    const shortRows = SEED_ROWS.filter((r) => r.id !== 'gut');
    await expect(compute.readCostContract(stubPool(shortRows))).rejects.toThrow(/mergeCostLines: PARCEL_COST_LINES id has no parcel_cost_lines row: gut/);
  });

  it('a good fixture returns 13 merged lines + linesUpdatedAt (ISO string, from MAX(parcel_cost_lines.updated_at))', async () => {
    const compute = loadCompute();
    const contract = await compute.readCostContract(stubPool(SEED_ROWS));
    expect(contract.lines).toHaveLength(13);
    const garden = contract.lines.find((l: { id: string }) => l.id === 'garden_suite');
    expect(garden.archetype).toBe('LANE_GARDEN');
    expect(garden.fitPermittedValues).toEqual(['as_of_right', 'coa_required']);
    expect(contract.linesUpdatedAt).toBe('2026-09-23T00:00:00.000Z');
  });
});

describe('compute_parcel_cost_estimates — CPCE-D3: the unmapped-family counter measures the real fall-through', () => {
  const BUILD_NORMS_PATH = path.join(REPO_ROOT, 'scripts/lib/build-norms.js');
  const COMPUTE_PATH = path.join(REPO_ROOT, COMPUTE_REL);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeCtx(parcels: Array<Record<string, unknown>>): any {
    return {
      config: {
        cost_escalation_index: 100,
        compute_parcel_cost_fsi_max_plausible: 99.999,
        compute_parcel_cost_escalation_min_multiplier: 1,
        compute_parcel_cost_escalation_fallback_multiplier: 1,
        compute_parcel_cost_premium_default: 1,
        compute_parcel_cost_adjustment_factor_default: 1,
        compute_parcel_cost_min_priceable_area_sqm: 0,
        compute_parcel_cost_batch_size: 1000,
        compute_parcel_cost_stream_batch_size: 1000,
      },
      contract: { rates: {}, lines: FAKE_CTX_LINES, ratesAsOf: null, indexUpdatedAt: null, linesUpdatedAt: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream: async function* (): AsyncGenerator<any> {
        for (const p of parcels) yield p;
      },
      flushBatch: async () => ({ rowCount: 0 }),
      onProgress: () => {},
      // CPCE-D2 — runCostMenuPass calls ctx.retract(1, []) first; this fixture only exercises
      // the D3 family-count logic, so the seam is a no-op stub (0 rows retracted).
      retract: async () => 0,
    };
  }

  it('unmappedFamilyCount === 4 for RD×3/RS×1/RT×1/RM×1/R×2/RA×1/RAC×1 — RED today (no such field; the literal is 0)', async () => {
    const compute = loadCompute();
    const parcels = [
      { zoning_class: 'RD' }, { zoning_class: 'RD' }, { zoning_class: 'RD' },
      { zoning_class: 'RS' }, { zoning_class: 'RT' }, { zoning_class: 'RM' },
      { zoning_class: 'R' }, { zoning_class: 'R' }, { zoning_class: 'RA' }, { zoning_class: 'RAC' },
    ];
    const result = await compute.runCostMenuPass(null, makeCtx(parcels));
    expect(result.scanned).toBe(10);
    expect(result.unmappedFamilyCount).toBe(4);
  });

  it('both directions — an RD/RS/RT/RM-only population reports unmappedFamilyCount === 0 (proves it counts the fall-through, not the whole stream)', async () => {
    const compute = loadCompute();
    const parcels = [{ zoning_class: 'RD' }, { zoning_class: 'RS' }, { zoning_class: 'RT' }, { zoning_class: 'RM' }];
    const result = await compute.runCostMenuPass(null, makeCtx(parcels));
    expect(result.unmappedFamilyCount).toBe(0);
  });

  it('RED — a family bucket Σ that does not sum to scanned throws (a bucketing defect must not silently under-report)', async () => {
    delete require.cache[require.resolve(BUILD_NORMS_PATH)];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const buildNorms = require(BUILD_NORMS_PATH);
    const orig = buildNorms.parcelFamilyFromZoning;
    let calls = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildNorms.parcelFamilyFromZoning = (zc: any) => {
      calls++;
      // First call returns a value outside the four known buckets — the Σ-identity check
      // sees it counted nowhere (not detached/townhouse/multiplex/unmapped), so the sum
      // undercounts `scanned` by exactly 1.
      if (calls === 1) return 'not_a_real_family';
      return orig(zc);
    };
    delete require.cache[require.resolve(COMPUTE_PATH)];
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const stubbedCompute = require(COMPUTE_PATH);
      const parcels = [{ zoning_class: 'RD' }, { zoning_class: 'RS' }];
      await expect(stubbedCompute.runCostMenuPass(null, makeCtx(parcels))).rejects.toThrow(/Σ-identity broke/);
    } finally {
      buildNorms.parcelFamilyFromZoning = orig;
      delete require.cache[require.resolve(BUILD_NORMS_PATH)];
      delete require.cache[require.resolve(COMPUTE_PATH)];
    }
  });
});

describe('compute_parcel_cost_estimates — CPCE-D2: writes[1] codegen lock (fake pool, no DB)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const write = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js'));

  it('buildWritePlan(writes[1]) renders a clear_sql whose WHERE is (<widened S0.2 scope>) AND (<16 guards OR-joined>) — the OUTER parenthesised scope is load-bearing (SQL AND/OR precedence): without it, "A OR (B AND C) AND (guards)" parses as "A OR ((B AND C) AND (guards))", silently dropping the guard off arm A', () => {
    const descriptor = loadDescriptor();
    const plan = write.buildWritePlan(descriptor.outputs.writes[1], descriptor);
    expect(plan.mechanic).toBe('set_based_null_retract');
    // the WHOLE widened scope (both S0.2 arms) must be wrapped in ONE outer paren pair, so
    // "AND (<guards>)" binds to the entire OR, not just its last disjunct.
    expect(plan.clear_sql).toMatch(
      /WHERE \(\(zoning_class IS NULL OR upper\(zoning_class\) NOT LIKE 'R%'\) OR \(upper\(zoning_class\) LIKE 'R%' AND \(max_buildable_gfa_sqm IS NULL OR cur_floor_gfa_sqm > 750\)\)\) AND \(parcel_cost_menu IS DISTINCT FROM null OR/,
    );
    // RED-proof of the precedence bug itself: a row matching ONLY the non-R% arm, with every
    // guard column already NULL (nothing to retract), must NOT be selected by this WHERE — the
    // un-parenthesised form would wrongly select it (guard silently dropped off that arm).
    expect(plan.clear_sql.startsWith('UPDATE parcels SET'), 'sanity: this is the UPDATE statement').toBe(true);
    // all 16 columns SET to the literal NULL, none bound as a row value
    for (const col of ['parcel_cost_menu', 'cost_fb_total', 'cost_coa_total', 'cost_solar_total',
      'cost_garden_suite_total', 'cost_laneway_suite_total', 'cost_garage_total', 'cost_gut_total',
      'cost_addition_total', 'cost_kitchen_per_sqm', 'cost_bath_per_sqm', 'cost_basement_per_sqm',
      'cost_basement_underpin_per_sqm', 'max_build_fsi', 'coa_fsi', 'realized_fsi_p90']) {
      expect(plan.clear_sql, col).toMatch(new RegExp(`${col} = null`));
      expect(plan.clear_sql, col).toMatch(new RegExp(`${col} IS DISTINCT FROM null`));
    }
  });

  it('RED — dropping a guard column would narrow the guard (mirrors the writes[0] regression lock at test 2)', () => {
    const descriptor = loadDescriptor();
    const withoutOne = descriptor.outputs.writes[1].write_discipline.guard_columns.slice(1);
    expect(withoutOne).toHaveLength(15);
  });

  it('RED — an unparenthesised scope OR would let the AND bind to only the last OR-arm (the precedence bug this lock exists to catch)', () => {
    const descriptor = loadDescriptor();
    const mutated = JSON.parse(JSON.stringify(descriptor));
    mutated.outputs.writes[1].write_discipline.scope = "zoning_class IS NULL OR upper(zoning_class) NOT LIKE 'R%'"; // no parens
    const plan = write.buildWritePlan(mutated.outputs.writes[1], mutated);
    // Without parens, "zoning_class IS NULL OR ... NOT LIKE 'R%' AND (guard)" parses as
    // "zoning_class IS NULL OR (... NOT LIKE 'R%' AND (guard))" — the NULL-zoning arm becomes
    // unconditional (unguarded). This assertion documents the WRONG shape is reachable if the
    // parens are ever dropped from the descriptor, which is exactly why they are declared.
    expect(plan.clear_sql).toMatch(/WHERE zoning_class IS NULL OR upper\(zoning_class\) NOT LIKE 'R%' AND \(/);
    expect(plan.clear_sql).not.toMatch(/WHERE \(zoning_class IS NULL OR/);
  });

  it('recovery.before_image === "generated" (R-M) — required for a set_based_null_retract target', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.recovery.before_image).toBe('generated');
  });

  it('outputs.writes[1].retract === "none" — class O alone licenses ctx.retract; "all" would wrongly force recovery.interrupted="force_full_on_next_run" (R-B), untrue here since staleness.scope is already unconditionally "all"', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.outputs.writes[1].retract).toBe('none');
    expect(descriptor.recovery.interrupted).toBe('none');
  });

  it('the new declared observables: stranded_cost_rows_retracted (INFO, value_min 0) + no_cost_outside_population (FAIL invariant, viol==0, post)', () => {
    const descriptor = loadDescriptor();
    const check = descriptor.checks.find((c: { id: string }) => c.id === 'stranded_cost_rows_retracted');
    expect(check).toBeDefined();
    expect(check.severity).toBe('INFO');
    expect(check.limit).toBe('value_min 0');
    const inv = descriptor.invariants.find((i: { id: string }) => i.id === 'no_cost_outside_population');
    expect(inv).toBeDefined();
    expect(inv.severity).toBe('FAIL');
    expect(inv.bound).toBe('viol == 0');
    expect(inv.when).toBe('post');
  });
});

// CPCE output-panel peel (DeepSeek/grounded, re-verified live, 2026-09-21) — two genuine findings
// fixed here; see docs/reports/review_followups.md "CPCE output-panel peel" for the other four
// (two REFUTED on re-verification, one REJECTED per resolve-db.js's documented COUNT convention,
// one DECLARED-not-fixed as pinned legacy behaviour).
describe('compute_parcel_cost_estimates — CPCE peel O1: buildZoneBuckets order-independence (HIGH)', () => {
  it('max_cost_gut is a genuine running MAX across every row folded into a bucket — NOT last-write-wins — regardless of row order', () => {
    const { buildZoneBuckets } = loadCompute();
    // Three non-NAMED_ZONES rows (CR/E/O) all fold into 'other'. The true max is 999.
    const rowsA = [
      { zone: 'CR', parcels: 10, menus: 5, empty_menus: 5, p50_cost_fb: 100, max_cost_gut: 999 },
      { zone: 'E', parcels: 20, menus: 10, empty_menus: 10, p50_cost_fb: 200, max_cost_gut: 50 },
      { zone: 'O', parcels: 5, menus: 2, empty_menus: 3, p50_cost_fb: 300, max_cost_gut: 10 },
    ];
    const rowsB = [...rowsA].reverse(); // the true max (999) is now FIRST, not last
    const bucketsA = buildZoneBuckets(rowsA);
    const bucketsB = buildZoneBuckets(rowsB);
    expect(bucketsA.other.max_cost_gut, 'order A must find the true max').toBe(999);
    expect(bucketsB.other.max_cost_gut, 'order B (reversed) must find the SAME true max — proof it is not last-write-wins').toBe(999);
    expect(bucketsA.other.max_cost_gut).toBe(bucketsB.other.max_cost_gut);
  });

  it('a NULL max_cost_gut row does not clobber an already-set bucket max (NULL is "no data this row", not "reset to null")', () => {
    const { buildZoneBuckets } = loadCompute();
    const rows = [
      { zone: 'CR', parcels: 10, menus: 5, empty_menus: 5, p50_cost_fb: 100, max_cost_gut: 500 },
      { zone: 'E', parcels: 20, menus: 10, empty_menus: 10, p50_cost_fb: null, max_cost_gut: null },
    ];
    const buckets = buildZoneBuckets(rows);
    expect(buckets.other.max_cost_gut).toBe(500);
    expect(buckets.other.p50_cost_fb).toBe(100);
  });

  it('p50_cost_fb uses a DECLARED, order-independent rule (parcels-weighted average) — not last-write-wins', () => {
    const { buildZoneBuckets } = loadCompute();
    const rowsA = [
      { zone: 'CR', parcels: 10, menus: 5, empty_menus: 5, p50_cost_fb: 100, max_cost_gut: 10 },
      { zone: 'E', parcels: 30, menus: 10, empty_menus: 20, p50_cost_fb: 300, max_cost_gut: 10 },
    ];
    const rowsB = [...rowsA].reverse();
    const expected = (100 * 10 + 300 * 30) / (10 + 30); // = 250, order-independent by construction
    const bucketsA = buildZoneBuckets(rowsA);
    const bucketsB = buildZoneBuckets(rowsB);
    expect(bucketsA.other.p50_cost_fb).toBeCloseTo(expected, 6);
    expect(bucketsB.other.p50_cost_fb).toBeCloseTo(expected, 6);
  });

  it('a NAMED zone (single GROUP BY row) is exact, unaffected by the aggregation rule', () => {
    const { buildZoneBuckets } = loadCompute();
    const buckets = buildZoneBuckets([{ zone: 'RD', parcels: 100, menus: 90, empty_menus: 10, p50_cost_fb: 12345, max_cost_gut: 67890 }]);
    expect(buckets.RD.max_cost_gut).toBe(67890);
    expect(buckets.RD.p50_cost_fb).toBe(12345);
  });

  it('buildZoneSql declares ORDER BY 1 (read determinism, belt-and-suspenders with the order-independent JS fold)', () => {
    const { buildZoneSql } = loadCompute();
    expect(buildZoneSql(750)).toMatch(/ORDER BY 1\s*$/);
  });
});

describe('compute_parcel_cost_estimates — CPCE peel O4: no_cost_outside_population covers all 16 written columns', () => {
  it("the invariant's SQL names every one of write_discipline.guard_columns — the SAME 16-column list buildFlushSql's distinctGuard uses, no fewer", () => {
    const descriptor = loadDescriptor();
    const inv = descriptor.invariants.find((i: { id: string }) => i.id === 'no_cost_outside_population');
    const guardColumns: string[] = descriptor.outputs.writes[0].write_discipline.guard_columns;
    expect(guardColumns.length, 'sanity: the guard itself must be 16 columns').toBe(16);
    for (const col of guardColumns) {
      expect(inv.sql, `no_cost_outside_population must check ${col}`).toContain(`${col} IS NOT NULL`);
    }
  });
});

describe('compute_parcel_cost_estimates — CPCE peel O3 (refuted): stream/flush bind-param ceiling stays SAFE, computed from the real column count', () => {
  it('compute_parcel_cost_batch_size.max * (2 + ALL_SCALAR_COLS.length) <= 65535 (Postgres bind-param ceiling), with real headroom', () => {
    const { ALL_SCALAR_COLS } = loadCompute();
    const descriptor = loadDescriptor();
    const maxBatch = descriptor.config.logic_variables.find((v: { name: string }) => v.name === 'compute_parcel_cost_batch_size').max;
    const paramsPerRow = 2 + ALL_SCALAR_COLS.length; // id + menu + every scalar column
    expect(paramsPerRow, 'sanity: the real per-row param count the DeepSeek finding miscounted as 18').toBe(17);
    expect(maxBatch * paramsPerRow, 'must stay under the Postgres 65,535 bind-parameter ceiling').toBeLessThanOrEqual(65535);
  });
});

// S0.2 (WF3 existing-structure-area-artifacts, 2026-09-21/22, Spec 88 §2.1) — the product-scope
// bound. RED->GREEN proof shape: buildSourceSql's OLD form (no bound) would stream every R%
// parcel regardless of max_buildable_gfa_sqm/cur_floor_gfa_sqm, pricing reno lines on
// out-of-model parcels (the §0.1 headline finding, $77,593,312,011.51 of cost_gut_total on
// 18,529 parcels). The NEW form excludes them from the stream entirely, and the WIDENED
// writes[1] retraction (the SAME target CPCE-D2 built, never a second code path per FOLD-I1)
// NULLs any of them still carrying a stale menu from before this bound existed.
describe('compute_parcel_cost_estimates — S0.2: product-scope bound (Spec 88 §2.1, FOLD-I1/FOLD-RC2)', () => {
  it('buildSourceSql excludes out-of-model parcels (max_buildable_gfa_sqm IS NULL) and oversized-existing parcels (cur_floor_gfa_sqm > bound)', () => {
    const { buildSourceSql } = loadCompute();
    const sql = buildSourceSql(750);
    expect(sql).toContain('AND p.max_buildable_gfa_sqm IS NOT NULL');
    expect(sql).toContain('p.cur_floor_gfa_sqm <= 750');
    // the bound is a genuine parameter, not a re-baked literal — a different config value renders differently.
    const sql2 = buildSourceSql(500);
    expect(sql2).toContain('p.cur_floor_gfa_sqm <= 500');
    expect(sql2).not.toBe(sql);
  });

  it('runCostMenuPass threads config.product_scope_max_existing_gfa_sqm into buildSourceSql (source text proof, mirrors test 16\'s own pattern)', () => {
    const compute = loadCompute();
    const src = compute.runCostMenuPass.toString();
    expect(src).toMatch(/maxExistingGfaSqm\s*=\s*Number\(config\.product_scope_max_existing_gfa_sqm\)/);
    expect(src).toMatch(/ctx\.stream\(buildSourceSql\(maxExistingGfaSqm\),\s*\[\],\s*\{\s*batchSize:\s*streamBatchSize\s*\}\)/);
  });

  it('descriptor declares product_scope_max_existing_gfa_sqm, on_invalid:"fail", default 750 in the seed', () => {
    const descriptor = loadDescriptor();
    const v = descriptor.config.logic_variables.find((x: { name: string }) => x.name === 'product_scope_max_existing_gfa_sqm');
    expect(v, 'product_scope_max_existing_gfa_sqm must be declared').toBeTruthy();
    expect(v.on_invalid).toBe('fail');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seed = require(path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json'));
    expect(seed.product_scope_max_existing_gfa_sqm.default).toBe(750);
  });

  it('writes[1].write_discipline.scope is WIDENED by OR-extension — the ORIGINAL non-R% arm is byte-preserved, the new arm is R%-guarded so it cannot overlap it (Decision 10/FOLD-I1: no second code path)', () => {
    const descriptor = loadDescriptor();
    const scope: string = descriptor.outputs.writes[1].write_discipline.scope;
    expect(scope, 'the ORIGINAL CPCE-D2 arm must survive byte-for-byte').toContain("(zoning_class IS NULL OR upper(zoning_class) NOT LIKE 'R%')");
    expect(scope).toContain("upper(zoning_class) LIKE 'R%'");
    expect(scope).toContain('max_buildable_gfa_sqm IS NULL');
    expect(scope).toContain('cur_floor_gfa_sqm > 750');
    // still exactly ONE writes[1] target — S0.2 widens, it does not add a second retraction.
    expect(descriptor.outputs.writes).toHaveLength(2);
  });

  it('no_cost_outside_population widens the SAME statement (never a second invariant) to the new population bound', () => {
    const descriptor = loadDescriptor();
    const invs = descriptor.invariants.filter((i: { id: string }) => i.id === 'no_cost_outside_population');
    expect(invs, 'exactly one no_cost_outside_population row — S0.2 widens it, never duplicates it').toHaveLength(1);
    expect(invs[0].sql).toContain('max_buildable_gfa_sqm IS NULL');
    expect(invs[0].sql).toContain('cur_floor_gfa_sqm > 750');
  });
});
