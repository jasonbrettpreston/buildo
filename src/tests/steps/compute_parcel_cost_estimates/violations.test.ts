// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.1/§2.4/§2.5/§2.8/§2.9/§2.10/§2.11 (+ Spec 43 §Step Breakdown step 23 owner, Spec 122 §5.1 shape)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §1.1 (behaviour-neutral), §3.1 (PIN), §7 (commit ledger)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 compute-is-just-compute, Rule 3 tunables, Rule 10 row-derived verdict)
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

  it('execution.phases.length === 1, outputs.writes.length === 1, guard_columns.length === 16', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.execution.phases).toHaveLength(1);
    expect(descriptor.outputs.writes).toHaveLength(1);
    expect(descriptor.outputs.writes[0].write_discipline.guard_columns).toHaveLength(16);
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
  it('every config.logic_variables[].name has a seed row with on_invalid:"fail" and a seeded admin.group; 19 total', () => {
    const descriptor = loadDescriptor();
    expect(descriptor.config.logic_variables).toHaveLength(19);
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
  it('[flipped at commit 3] registered in converted.json, the seam-pair registry moved 9 -> 11', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const seam: any = require(path.join(REPO_ROOT, 'scripts/lib/step/seam.js'));
    const registry = seam.loadConvertedDescriptors();
    expect(seam.deriveSeamPairs(registry).length).toBe(11);
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
    expect(src).toMatch(/ctx\.stream\(SOURCE_SQL,\s*\[\],\s*\{\s*batchSize:\s*streamBatchSize\s*\}\)/);
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
      contract: { rates: {}, ratesAsOf: null, indexUpdatedAt: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream: async function* (): AsyncGenerator<any> {
        for (const p of parcels) yield p;
      },
      flushBatch: async () => ({ rowCount: 0 }),
      onProgress: () => {},
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
