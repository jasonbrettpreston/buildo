// Logic Layer Tests - Pipeline chain execution definitions and orchestrator
// SPEC LINK: docs/specs/28_data_quality_dashboard.md (Section 2.7)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  PIPELINE_CHAINS,
  PIPELINE_REGISTRY,
} from '@/components/FreshnessTimeline';

describe('Pipeline Chain Definitions', () => {
  it('defines exactly 6 chains', () => {
    expect(PIPELINE_CHAINS).toHaveLength(6);
  });

  it('defines permits chain with 26 steps (no enrichment scripts)', () => {
    // WF3 2026-04-13 — v1 `compute_timing_calibration` removed from chain
    // per user decision (Path A). v1's table `timing_calibration` will
    // go stale; the detail-page timing engine (spec 71) will be migrated
    // to read from `phase_calibration` in a future frontend WF.
    // WF2 2026-04-18 — +2 steps: assert_lifecycle_phase_distribution (step 22)
    // and assert_entity_tracing (step 26).
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'permits');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(26);
    const slugs = chain!.steps.map((s) => s.slug);
    expect(slugs).not.toContain('enrich_wsib_builders');
    expect(slugs).not.toContain('enrich_named_builders');
  });

  it('permits chain runs v2 timing_calibration only (v1 removed)', () => {
    // WF3 2026-04-13 — v1 removed, only v2 remains. v2 feeds spec 85
    // flight tracker via phase_calibration. The detail-page timing
    // engine (spec 71) reads v1's table and will be migrated to v2
    // in a future frontend WF; until then that engine degrades.
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const slugs = chain.steps.map((s) => s.slug);
    expect(slugs).toContain('compute_cost_estimates');
    expect(slugs).not.toContain('compute_timing_calibration');
    expect(slugs).toContain('compute_timing_calibration_v2');
  });

  it('compute steps run after classify_permits and before link_coa', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const slugs = chain.steps.map((s) => s.slug);
    const classifyIdx = slugs.indexOf('classify_permits');
    const costIdx = slugs.indexOf('compute_cost_estimates');
    const timingIdx = slugs.indexOf('compute_timing_calibration_v2');
    const linkCoaIdx = slugs.indexOf('link_coa');
    expect(costIdx).toBeGreaterThan(classifyIdx);
    expect(timingIdx).toBeGreaterThan(classifyIdx);
    expect(costIdx).toBeLessThan(linkCoaIdx);
    expect(timingIdx).toBeLessThan(linkCoaIdx);
  });

  it('compute_cost_estimates runs before compute_timing_calibration_v2 (more resilient first)', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const slugs = chain.steps.map((s) => s.slug);
    expect(slugs.indexOf('compute_cost_estimates')).toBeLessThan(slugs.indexOf('compute_timing_calibration_v2'));
  });

  it('permits chain: classifier → phase gate → marketplace tail → entity tracing (correct order)', () => {
    // WF2 2026-04-13 — Spec 80/81/82/85: dependency order is:
    //   - trade_forecasts needs lifecycle_phase + phase_started_at
    //   - opportunity_scores needs trade_forecasts + cost_estimates
    //   - tracked_projects needs trade_forecasts + trade_configurations
    // WF2 2026-04-18 — assert_lifecycle_phase_distribution inserted after
    // classify_lifecycle_phase (phase gate validates before marketplace reads
    // fresh anchors). assert_entity_tracing appended as final CQA step.
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const slugs = chain.steps.map((s) => s.slug);
    const tail = slugs.slice(-6);
    expect(tail).toEqual([
      'classify_lifecycle_phase',
      'assert_lifecycle_phase_distribution',
      'compute_trade_forecasts',
      'compute_opportunity_scores',
      'update_tracked_projects',
      'assert_entity_tracing',
    ]);
  });

  it('marketplace tail scripts appear only in permits chain', () => {
    // The CoA chain does not include trade_forecasts / opportunity_scores
    // / update_tracked_projects because CoA applications are pre-permit —
    // they have no trade classification, no cost estimates yet.
    const coa = PIPELINE_CHAINS.find((c) => c.id === 'coa')!;
    const coaSlugs = coa.steps.map((s) => s.slug);
    expect(coaSlugs).not.toContain('compute_trade_forecasts');
    expect(coaSlugs).not.toContain('compute_opportunity_scores');
    expect(coaSlugs).not.toContain('update_tracked_projects');
    expect(coaSlugs).not.toContain('compute_cost_estimates');
    expect(coaSlugs).not.toContain('compute_timing_calibration');
    expect(coaSlugs).not.toContain('compute_timing_calibration_v2');
  });

  it('defines coa chain with 11 steps', () => {
    // WF2 2026-04-11 — added classify_lifecycle_phase as the final
    // step so every CoA chain run reclassifies permits whose
    // last_seen_at was just bumped by link-coa.
    // WF2 2026-04-18 — +1 step: assert_lifecycle_phase_distribution (step 11).
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'coa');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(11);
  });

  it('defines sources chain with 15 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(15);
  });

  it('coa chain ends with assert_lifecycle_phase_distribution; permits chain ends with assert_entity_tracing', () => {
    // WF2 2026-04-18 — CoA chain now ends with assert_lifecycle_phase_distribution
    // (phase distribution gate after classifier). Permits chain now ends with
    // assert_entity_tracing (end-to-end coverage check).
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits');
    const coa = PIPELINE_CHAINS.find((c) => c.id === 'coa');
    expect(coa!.steps[coa!.steps.length - 1]!.slug).toBe('assert_lifecycle_phase_distribution');
    expect(coa!.steps[coa!.steps.length - 2]!.slug).toBe('classify_lifecycle_phase');
    expect(coa!.steps[coa!.steps.length - 3]!.slug).toBe('assert_engine_health');
    // Permits chain: assert_entity_tracing is last; classify_lifecycle_phase is at position -6
    expect(permits!.steps[permits!.steps.length - 1]!.slug).toBe('assert_entity_tracing');
    expect(permits!.steps[permits!.steps.length - 6]!.slug).toBe('classify_lifecycle_phase');
  });

  it('sources chain ends with assert_engine_health', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(sources!.steps[sources!.steps.length - 1]!.slug).toBe('assert_engine_health');
  });

  it('every chain step slug exists in PIPELINE_REGISTRY', () => {
    const registrySlugs = Object.keys(PIPELINE_REGISTRY);
    for (const chain of PIPELINE_CHAINS) {
      for (const step of chain.steps) {
        expect(registrySlugs).toContain(step.slug);
      }
    }
  });

  it('chain IDs are unique', () => {
    const ids = PIPELINE_CHAINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each chain has a non-empty label and description', () => {
    for (const chain of PIPELINE_CHAINS) {
      expect(chain.label.length).toBeGreaterThan(0);
      expect(chain.description.length).toBeGreaterThan(0);
    }
  });

  it('indent values are 0, 1, 2, or 3', () => {
    for (const chain of PIPELINE_CHAINS) {
      for (const step of chain.steps) {
        expect([0, 1, 2, 3]).toContain(step.indent);
      }
    }
  });

  it('each chain starts with an indent-0 step', () => {
    for (const chain of PIPELINE_CHAINS) {
      expect(chain!.steps[0]!.indent).toBe(0);
    }
  });
});

describe('Entities Chain (4th Pillar)', () => {
  it('defines entities chain with enrichment steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'entities');
    expect(chain).toBeDefined();
    expect(chain!.steps.map((s) => s.slug)).toContain('enrich_wsib_builders');
    expect(chain!.steps.map((s) => s.slug)).toContain('enrich_named_builders');
  });

  it('entities chain has exactly 2 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'entities');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(2);
  });

  it('defines wsib chain with registry enrichment', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'wsib');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(1);
    expect(chain!.steps[0]!.slug).toBe('enrich_wsib_registry');
  });

  it('deep_scrapes chain has exactly 7 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'deep_scrapes');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(7);
  });

  it('deep_scrapes runs engine_health before staleness (maintenance before quality gates)', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'deep_scrapes')!;
    const slugs = chain.steps.map((s) => s.slug);
    const ehIdx = slugs.indexOf('assert_engine_health');
    const stIdx = slugs.indexOf('assert_staleness');
    expect(ehIdx).toBeGreaterThan(-1);
    expect(stIdx).toBeGreaterThan(-1);
    expect(ehIdx).toBeLessThan(stIdx);
  });
});

describe('UI Chain Ordering (Dependency Hierarchy)', () => {
  it('renders daily pipelines first, then sources (foundation), then deep_scrapes', () => {
    const ids = PIPELINE_CHAINS.map((c) => c.id);
    expect(ids).toEqual(['permits', 'coa', 'entities', 'wsib', 'sources', 'deep_scrapes']);
  });
});

describe('Chain Slug Extraction', () => {
  it('extracts chain ID from chain_permits slug', () => {
    const slug = 'chain_permits';
    const chainId = slug.replace(/^chain_/, '');
    expect(chainId).toBe('permits');
  });

  it('extracts chain ID from chain_coa slug', () => {
    const slug = 'chain_coa';
    const chainId = slug.replace(/^chain_/, '');
    expect(chainId).toBe('coa');
  });

  it('extracts chain ID from chain_sources slug', () => {
    const slug = 'chain_sources';
    const chainId = slug.replace(/^chain_/, '');
    expect(chainId).toBe('sources');
  });

  it('extracts chain ID from chain_entities slug', () => {
    const slug = 'chain_entities';
    const chainId = slug.replace(/^chain_/, '');
    expect(chainId).toBe('entities');
  });
});

describe('Chain Orchestrator Script', () => {
  it('run-chain.js exists in scripts/ directory', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/run-chain.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('local-cron.js exists in scripts/ directory', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/local-cron.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('local-cron.js contains all 4 chain IDs (permits, coa, sources, entities)', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/local-cron.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain("chainId: 'permits'");
    expect(content).toContain("chainId: 'coa'");
    expect(content).toContain("chainId: 'sources'");
    expect(content).toContain("chainId: 'entities'");
  });
});

describe('Pipeline Route Chain Registration', () => {
  // These tests verify the route.ts PIPELINE_SCRIPTS map includes chain entries.
  // We import the route module indirectly by checking the script file it points to.
  it('chain slugs map to run-chain.js script', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/run-chain.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
    // The actual route registration is verified via the API in integration tests.
    // Here we just confirm the orchestrator script exists.
  });
});

describe('Sources Chain Completeness', () => {
  it('sources chain includes assert_engine_health as final step', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(sources).toBeDefined();
    const lastStep = sources!.steps[sources!.steps.length - 1];
    expect(lastStep!.slug).toBe('assert_engine_health');
  });

  it('sources chain includes all reference data pipelines', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(sources).toBeDefined();
    const slugs = sources!.steps.map((s) => s.slug);
    expect(slugs).toContain('address_points');
    expect(slugs).toContain('parcels');
    expect(slugs).toContain('massing');
    expect(slugs).toContain('neighbourhoods');
  });

  it('sources chain includes all linker steps', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(sources).toBeDefined();
    const slugs = sources!.steps.map((s) => s.slug);
    expect(slugs).toContain('geocode_permits');
    expect(slugs).toContain('compute_centroids');
    expect(slugs).toContain('link_parcels');
    expect(slugs).toContain('link_massing');
    expect(slugs).toContain('link_neighbourhoods');
  });

  it('sources chain includes WSIB registry steps', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(sources).toBeDefined();
    const slugs = sources!.steps.map((s) => s.slug);
    expect(slugs).toContain('load_wsib');
    expect(slugs).toContain('link_wsib');
  });
});

describe('Pipeline Disabled Step Skip Logic', () => {
  it('disabled steps should be filtered out of execution list', () => {
    const disabledSlugs = new Set(['enrich_wsib_builders', 'enrich_named_builders']);
    const entities = PIPELINE_CHAINS.find((c) => c.id === 'entities')!;
    const activeSteps = entities.steps.filter((s) => !disabledSlugs.has(s.slug));
    // Entities chain has 2 enrichment steps; both disabled = 0 active
    expect(activeSteps).toHaveLength(0);
  });

  it('disabled steps do not affect other chains without those steps', () => {
    const disabledSlugs = new Set(['enrich_wsib_builders', 'enrich_named_builders']);
    const coa = PIPELINE_CHAINS.find((c) => c.id === 'coa')!;
    const activeSteps = coa.steps.filter((s) => !disabledSlugs.has(s.slug));
    // CoA chain has no enrichment steps — all 11 remain
    // (WF2 2026-04-18 added assert_lifecycle_phase_distribution as step 11)
    expect(activeSteps).toHaveLength(11);
  });

  it('empty disabled set leaves all steps active', () => {
    const disabledSlugs = new Set<string>();
    for (const chain of PIPELINE_CHAINS) {
      const activeSteps = chain.steps.filter((s) => !disabledSlugs.has(s.slug));
      expect(activeSteps).toHaveLength(chain.steps.length);
    }
  });

  it('run-chain.js contains disabled step skip logic', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/run-chain.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('SKIPPED (disabled)');
    expect(content).toContain("'skipped'");
    // WF3-02 (H-W19): query MUST filter by chain so disabling for one chain
    // doesn't silently skip the same step in a sibling chain. NULL = global.
    expect(content).toMatch(
      /SELECT pipeline FROM pipeline_schedules\s+WHERE enabled = FALSE\s+AND \(chain_id IS NULL OR chain_id = \$1\)/,
    );
  });

  it('run-chain.js acquires a chain-level advisory lock via hashtext (WF3-03 / H-W1 / RC-W7)', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/run-chain.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    // Chain-level lock prevents two concurrent runs of the same chain from
    // racing on shared mutations. Convention: 2-arg form
    // `pg_try_advisory_lock(2, hashtext('chain_'+chainId))` — the leading
    // `2` namespace marker keeps chain locks in a distinct keyspace from
    // per-script locks (1-arg form with spec number). Postgres treats
    // 1-arg and 2-arg lock forms as separate keyspaces so a hashtext
    // collision with a per-script lock ID is impossible by construction.
    expect(content).toMatch(/pg_try_advisory_lock\(\s*2\s*,\s*hashtext\(\s*'chain_'\s*\|\|\s*\$1\s*\)\s*\)/);
    expect(content).toMatch(/pg_advisory_unlock\(\s*2\s*,\s*hashtext\(\s*'chain_'\s*\|\|\s*\$1\s*\)\s*\)/);
    // Lock must be held on a pinned client so the session survives the
    // run. `pool.query` would lose the lock when the connection returns
    // to the pool. See 83-W5 / 84:154 canonical pattern.
    expect(content).toMatch(/await pool\.connect\(\)/);
  });

  it('run-chain.js passes chainId parameter to the disabled-steps query (H-W19)', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/run-chain.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    // The query must be parameterized — no bare string interpolation of chainId.
    // Find the schedules block and assert [chainId] is the bound parameter.
    const block = content.match(
      /pipeline_schedules[\s\S]{0,400}chain_id = \$1[\s\S]{0,200}/,
    );
    expect(block, 'schedules query block not found').not.toBeNull();
    expect(block![0]).toMatch(/\[chainId\]/);
  });
});

describe('Incremental Processing Guards', () => {
  it('link-similar.js skips already-propagated companions', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/link-similar.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    // Must have IS DISTINCT FROM guard to avoid re-updating companions
    expect(content).toContain('IS DISTINCT FROM');
    expect(content).toContain('scope_tags');
  });

  it('link-similar.js guards null scope_tags with COALESCE in array union', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/link-similar.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    // DM demolition tag merged inline via array union with COALESCE null guard
    expect(content).toMatch(/COALESCE\(companion\.scope_tags/);
    expect(content).toContain("ARRAY['demolition']");
  });

  it('classify-permits.js UPSERT updates classified_at unconditionally (no sticky record bug)', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/classify-permits.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    // The UPSERT into permit_trades must NOT have a WHERE ... IS DISTINCT FROM guard
    // that prevents classified_at from updating when trade columns are unchanged.
    // If classified_at doesn't update, the incremental WHERE clause keeps re-fetching
    // the same permits forever (sticky record bug).
    const upsertMatch = content.match(
      /ON CONFLICT \(permit_num, revision_num, trade_id\)\s*\n\s*DO UPDATE SET([\s\S]*?)(?:;|`)/
    );
    expect(upsertMatch, 'UPSERT into permit_trades not found').not.toBeNull();
    const upsertBody = upsertMatch![1];
    // classified_at = NOW() must be present
    expect(upsertBody).toContain('classified_at');
    // There must NOT be a WHERE ... IS DISTINCT FROM guard on this UPSERT
    expect(upsertBody).not.toContain('IS DISTINCT FROM');
  });

  // All sources chain loader scripts must emit audit_table in records_meta
  const SOURCES_LOADERS_REQUIRING_AUDIT_TABLE = [
    'load-address-points.js',
    'load-parcels.js',
    'compute-centroids.js',
    'load-massing.js',
    'load-neighbourhoods.js',
    'load-wsib.js',
  ];

  for (const script of SOURCES_LOADERS_REQUIRING_AUDIT_TABLE) {
    it(`${script} emits audit_table in records_meta`, () => {
      const scriptPath = path.resolve(__dirname, `../../scripts/${script}`);
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('audit_table');
      expect(content).toMatch(/phase:\s*\d+/);
      expect(content).toMatch(/verdict/);
      expect(content).toContain("status: 'INFO'");
    });
  }

  // CSV loaders must have business accuracy thresholds (skip_rate, row count floor)
  const CSV_LOADERS_WITH_THRESHOLDS = [
    'load-address-points.js',
    'load-parcels.js',
    'load-massing.js',
  ];

  for (const script of CSV_LOADERS_WITH_THRESHOLDS) {
    it(`${script} has skip_rate and records_unchanged in audit_table`, () => {
      const scriptPath = path.resolve(__dirname, `../../scripts/${script}`);
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('skip_rate');
      expect(content).toContain('records_unchanged');
    });
  }

  it('load-wsib.js has unique_class_g threshold in audit_table', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/load-wsib.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('unique_class_g');
    expect(content).toMatch(/>=\s*110000/);
  });

  it('compute-centroids.js has compute_rate >= 98% threshold', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/compute-centroids.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toMatch(/>= 98/);
  });

  it('link-wsib.js emits PIPELINE_SUMMARY with totalUnlinked as records_total', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/link-wsib.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('pipeline.emitSummary(');
    expect(content).toContain('totalUnlinked');
  });
});

describe('Quality Pipeline Group', () => {
  it('quality group has 9 registry entries', () => {
    // WF2 2026-04-18 — +2: assert_lifecycle_phase_distribution, assert_entity_tracing
    const qualityEntries = Object.entries(PIPELINE_REGISTRY).filter(
      ([, entry]) => entry.group === 'quality'
    );
    expect(qualityEntries).toHaveLength(9);
  });

  it('assert_schema and assert_data_bounds exist in PIPELINE_REGISTRY', () => {
    expect(PIPELINE_REGISTRY.assert_schema).toBeDefined();
    expect(PIPELINE_REGISTRY!.assert_schema!.group).toBe('quality');
    expect(PIPELINE_REGISTRY.assert_data_bounds).toBeDefined();
    expect(PIPELINE_REGISTRY!.assert_data_bounds!.group).toBe('quality');
  });
});

// ---------------------------------------------------------------------------
// PIPELINE_SUMMARY convention — scripts emit machine-readable record counts
// ---------------------------------------------------------------------------

describe('PIPELINE_SUMMARY convention', () => {
  const scriptsDir = path.resolve(__dirname, '../../scripts');

  // Scripts that track record counts and should emit PIPELINE_SUMMARY
  const SCRIPTS_WITH_COUNTS = [
    'load-permits.js',
    'load-coa.js',
    'load-address-points.js',
    'load-parcels.js',
    'load-massing.js',
    'load-neighbourhoods.js',
    'extract-builders.js',
    'classify-permits.js',
    'classify-scope.js',
    'geocode-permits.js',
    'link-parcels.js',
    'link-neighbourhoods.js',
    'link-massing.js',
    'link-similar.js',
    'link-wsib.js',
    'link-coa.js',
    'compute-centroids.js',
    'create-pre-permits.js',
    'refresh-snapshot.js',
  ];

  for (const script of SCRIPTS_WITH_COUNTS) {
    it(`${script} emits PIPELINE_SUMMARY line`, () => {
      const source = fs.readFileSync(path.join(scriptsDir, script), 'utf-8');
      // Scripts use pipeline.emitSummary() which internally emits PIPELINE_SUMMARY:
      expect(source).toContain('pipeline.emitSummary(');
    });
  }
});

describe('run-chain.js captures stdout and parses PIPELINE_SUMMARY', () => {
  const chainSource = () => fs.readFileSync(
    path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
  );

  it('uses pipe mode instead of stdio inherit for step execution', () => {
    const source = chainSource();
    // Should NOT use stdio: 'inherit' for step execution (needs to capture stdout)
    expect(source).not.toContain("stdio: 'inherit'");
  });

  it('parses PIPELINE_SUMMARY from step output', () => {
    const source = chainSource();
    expect(source).toContain('PIPELINE_SUMMARY');
  });

  it('writes records_total to pipeline_runs on step completion', () => {
    const source = chainSource();
    expect(source).toContain('records_total');
    expect(source).toContain('records_new');
  });

  it('gate-skip does NOT break the chain — quality/infrastructure steps still run', () => {
    const source = chainSource();
    // Chain gates are read from manifest.chain_gates
    expect(source).toContain('chain_gates');
    expect(source).toContain('0 new records');
    // Must NOT hard-break on gate — quality steps need to run
    expect(source).not.toMatch(/recordsNew === 0[\s\S]{0,300}break/);
    // Must set gateSkipped flag (soft skip, not abort)
    expect(source).toContain('gateSkipped = true');

    // Verify the manifest itself defines the expected gates
    const manifest = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../scripts/manifest.json'), 'utf-8'
    ));
    expect(manifest.chain_gates).toEqual({ permits: 'permits', coa: 'coa' });
  });

  it('gate-skip continues non-essential steps with SKIPPED status', () => {
    const source = chainSource();
    // When gateSkipped is true, non-essential steps must be skipped (continue)
    expect(source).toMatch(/gateSkipped[\s\S]{0,500}continue/);
    // Must log gate-skipped steps
    expect(source).toMatch(/SKIPPED.*gate|gate.*skip/i);
  });

  it('gate-skip still runs quality/infrastructure steps (assert_*, compute_*, refresh_snapshot)', () => {
    const source = chainSource();
    // Quality steps must be exempted from gate-skip — they check cumulative DB state
    expect(source).toMatch(/assert_|refresh_snapshot/);
    // The exemption logic must reference slug patterns for quality steps
    expect(source).toMatch(/startsWith\(['"]assert_['"]\)|=== ['"]refresh_snapshot['"]/);
    // compute_* steps process cumulative DB state, not just new records
    expect(source).toContain("slug.startsWith('compute_')");
  });

  it('checks both records_new and records_updated before skipping', () => {
    const source = chainSource();
    // Skip only when BOTH are 0 — null-safe via || 0 coercion
    expect(source).toMatch(/recordsNew.*=== 0[\s\S]{0,100}recordsUpdated/);
  });

  it('gate abort uses completed status, not failed (stale data is not a failure)', () => {
    const source = chainSource();
    // Gate skip must NOT set failedStep — it uses a separate gateSkipped flag
    // so the chain status resolves to 'completed' not 'failed'
    expect(source).toContain('gateSkipped');
    // Chain status must check gateSkipped separately from failedStep
    expect(source).not.toMatch(/failedStep\s*=\s*slug[\s\S]{0,20}0 new records/);
  });

  it('parses PIPELINE_META from step output and merges into records_meta', () => {
    const source = chainSource();
    expect(source).toContain('PIPELINE_META');
    expect(source).toContain('pipeline_meta');
    // Must merge into recordsMeta, not replace it
    expect(source).toContain('...(recordsMeta || {})');
  });
});

describe('PIPELINE_META convention', () => {
  const scriptsDir = path.resolve(__dirname, '../../scripts');

  // All pipeline scripts that perform DB operations should emit PIPELINE_META
  const SCRIPTS_WITH_META = [
    'load-permits.js',
    'load-coa.js',
    'load-address-points.js',
    'load-parcels.js',
    'load-massing.js',
    'load-neighbourhoods.js',
    'load-wsib.js',
    'extract-builders.js',
    'classify-permits.js',
    'classify-scope.js',
    'geocode-permits.js',
    'link-parcels.js',
    'link-neighbourhoods.js',
    'link-massing.js',
    'link-similar.js',
    'link-wsib.js',
    'link-coa.js',
    'compute-centroids.js',
    'create-pre-permits.js',
    'refresh-snapshot.js',
    'enrich-web-search.js',
    'quality/assert-schema.js',
    'quality/assert-data-bounds.js',
  ];

  for (const script of SCRIPTS_WITH_META) {
    it(`${script} emits PIPELINE_META line`, () => {
      const source = fs.readFileSync(path.join(scriptsDir, script), 'utf-8');
      // Scripts use pipeline.emitMeta() which internally emits PIPELINE_META:
      // Quality scripts still emit directly (not yet migrated to SDK)
      expect(source.includes('pipeline.emitMeta(') || source.includes('PIPELINE_META:')).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Pipeline Manifest Validation (§9.6)
// ---------------------------------------------------------------------------

describe('Pipeline Manifest (§9.6)', () => {
  const manifestPath = path.resolve(__dirname, '../../scripts/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  it('manifest.json exists and has version field', () => {
    expect(manifest.version).toBe(1);
  });

  it('every manifest script entry points to an existing file (unless coming_soon)', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    for (const [slug, entry] of Object.entries(manifest.scripts) as [string, { file: string | null; coming_soon?: boolean }][]) {
      if (entry.coming_soon) continue;
      const scriptPath = path.resolve(projectRoot, entry.file!);
      expect(
        fs.existsSync(scriptPath),
        `Manifest script "${slug}" points to missing file: ${entry.file}`
      ).toBe(true);
    }
  });

  it('every chain step references a known script slug', () => {
    const knownSlugs = new Set(Object.keys(manifest.scripts));
    for (const [chainId, steps] of Object.entries(manifest.chains) as [string, string[]][]) {
      for (const slug of steps) {
        expect(
          knownSlugs.has(slug),
          `Chain "${chainId}" references unknown slug "${slug}"`
        ).toBe(true);
      }
    }
  });

  it('manifest chains match PIPELINE_CHAINS step slugs', () => {
    for (const chain of PIPELINE_CHAINS) {
      const manifestSteps = manifest.chains[chain.id];
      expect(manifestSteps, `Manifest missing chain "${chain.id}"`).toBeDefined();
      const uiSlugs = chain.steps.map((s) => s.slug);
      expect(manifestSteps).toEqual(uiSlugs);
    }
  });

  it('chain_gates only reference valid chain IDs', () => {
    const chainIds = new Set(Object.keys(manifest.chains));
    for (const chainId of Object.keys(manifest.chain_gates)) {
      expect(chainIds.has(chainId), `chain_gate "${chainId}" is not a valid chain`).toBe(true);
    }
  });

  it('chain_gates values reference valid script slugs', () => {
    const knownSlugs = new Set(Object.keys(manifest.scripts));
    for (const [chainId, gateSlug] of Object.entries(manifest.chain_gates) as [string, string][]) {
      expect(
        knownSlugs.has(gateSlug),
        `chain_gate for "${chainId}" references unknown slug "${gateSlug}"`
      ).toBe(true);
    }
  });

  it('run-chain.js reads from manifest.json', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
    );
    expect(source).toContain('manifest.json');
    expect(source).toContain('manifest.chains');
    expect(source).toContain('manifest.chain_gates');
  });

  it('every script SLUG constant matches a manifest slug', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const knownSlugs = new Set(Object.keys(manifest.scripts));
    for (const [, entry] of Object.entries(manifest.scripts) as [string, { file: string | null; coming_soon?: boolean }][]) {
      if (entry.coming_soon || !entry.file) continue;
      const scriptPath = path.resolve(projectRoot, entry.file);
      const source = fs.readFileSync(scriptPath, 'utf-8');
      // Scripts that self-register in pipeline_runs use a SLUG constant
      // Match simple string: const SLUG = 'foo'
      const simpleMatch = source.match(/const SLUG\s*=\s*['"]([^'"]+)['"]/);
      if (simpleMatch) {
        expect(
          knownSlugs.has(simpleMatch[1]!),
          `Script "${entry.file}" has SLUG='${simpleMatch[1]}' which is not a manifest slug`
        ).toBe(true);
        continue;
      }
      // Match ternary: const SLUG = ... ? 'foo' : 'bar' — all string values must be valid slugs
      const ternaryMatch = source.match(/const SLUG\s*=\s*.+/);
      if (ternaryMatch) {
        const allSlugs = [...ternaryMatch[0].matchAll(/['"]([a-z_]+)['"]/g)].map(m => m[1]!);
        for (const s of allSlugs) {
          expect(
            knownSlugs.has(s),
            `Script "${entry.file}" has conditional SLUG value '${s}' which is not a manifest slug`
          ).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Pending State Logic — steps reset to neutral when chain starts (Bug A2)
// ---------------------------------------------------------------------------

describe('Pending state logic (steps reset when chain starts)', () => {
  // Mirrors FreshnessTimeline lines 487-489:
  //   stepDoneThisRun = (status === 'completed' || status === 'failed') && stepRanAt >= chainStartedAt
  //   isPending = isChainRunning && !isRunning && !stepDoneThisRun

  function computeIsPending(
    isChainRunning: boolean,
    isRunning: boolean,
    stepStatus: string | null,
    stepRanAt: number,
    chainStartedAt: number,
  ): boolean {
    const stepDoneThisRun =
      (stepStatus === 'completed' || stepStatus === 'failed') &&
      stepRanAt >= chainStartedAt;
    return isChainRunning && !isRunning && !stepDoneThisRun;
  }

  it('step is pending when chain is running and step has not started', () => {
    // Chain just started, step has stale data from 2 days ago
    const chainStart = Date.now();
    const staleStepRanAt = chainStart - 2 * 24 * 60 * 60 * 1000; // 2 days ago
    expect(computeIsPending(true, false, 'completed', staleStepRanAt, chainStart)).toBe(true);
  });

  it('step is NOT pending when it completed in current run', () => {
    const chainStart = Date.now() - 60_000; // chain started 1 min ago
    const stepFinished = Date.now(); // step just finished
    expect(computeIsPending(true, false, 'completed', stepFinished, chainStart)).toBe(false);
  });

  it('step is NOT pending when it is currently running', () => {
    const chainStart = Date.now();
    expect(computeIsPending(true, true, 'running', 0, chainStart)).toBe(false);
  });

  it('step is NOT pending when chain is not running', () => {
    expect(computeIsPending(false, false, 'completed', 0, 0)).toBe(false);
  });

  it('step is pending when chain is running but no status data exists yet', () => {
    // No pipeline_last_run entry yet → stepRanAt = 0, chainStartedAt = Date.now()
    const chainStart = Date.now();
    expect(computeIsPending(true, false, null, 0, chainStart)).toBe(true);
  });

  it('FreshnessTimeline uses isChainRunning derived from runningPipelines.has(chainSlug)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('runningPipelines.has(chainSlug)');
    expect(source).toContain('isPending');
    expect(source).toContain('stepDoneThisRun');
  });

  it('DataQualityDashboard polling merges pipeline_last_run into stats', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    // Lightweight poller must merge into stats so FreshnessTimeline re-renders
    expect(source).toContain('pipeline_last_run: freshStatus');
    expect(source).toContain('setStats');
  });
});

// ---------------------------------------------------------------------------
// Scoped Key Step Status Updates — steps update during chain run (Bug A3)
// ---------------------------------------------------------------------------

describe('Scoped key step status updates during chain run (Bug A3)', () => {
  it('run-chain.js writes scoped slugs to pipeline_runs', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
    );
    // Must construct scoped key: `${chainId}:${slug}`
    expect(source).toContain('`${chainId}:${slug}`');
  });

  it('FreshnessTimeline reads pipelineLastRun using scoped key', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Must construct scopedKey and look it up
    expect(source).toContain('`${chain.id}:${step.slug}`');
    expect(source).toContain('pipelineLastRun[scopedKey]');
  });

  it('isRunning uses only scoped key (no bare slug fallback to prevent cross-chain bleed)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('runningPipelines.has(scopedKey)');
    // Bare slug fallback removed to prevent cross-chain status bleed
    expect(source).not.toContain('runningPipelines.has(step.slug)');
  });

  it('polling adds scoped keys with running status to runningPipelines', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/DataQualityDashboard.tsx'),
      'utf-8'
    );
    // Poller must iterate over freshStatus entries and add running slugs
    expect(source).toContain("info?.status === 'running'");
    expect(source).toContain('next.add(slug)');
  });

  it('status endpoint returns DISTINCT ON (pipeline) including scoped keys', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/status/route.ts'),
      'utf-8'
    );
    expect(source).toContain('DISTINCT ON (pipeline)');
    expect(source).toContain('pipeline_last_run');
  });
});

// ---------------------------------------------------------------------------
// Stopping state cleanup — "Stopping..." clears when chain finishes (Bug A4)
// ---------------------------------------------------------------------------

describe('"Stopping..." clears when chain finishes (Bug A4)', () => {
  it('FreshnessTimeline has cancellingChains state and cleanup effect', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    expect(source).toContain('cancellingChains');
    expect(source).toContain('setCancellingChains');
  });

  it('cleanup effect removes chain slug when no longer in runningPipelines', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // Effect must check runningPipelines.has(slug) and remove if not present
    expect(source).toContain('runningPipelines.has(slug)');
    expect(source).toMatch(/cancellingChains[\s\S]{0,500}runningPipelines/);
  });

  it('cleanup effect depends on runningPipelines changes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/FreshnessTimeline.tsx'),
      'utf-8'
    );
    // useEffect dependency array must include runningPipelines
    expect(source).toMatch(/\[runningPipelines.*cancellingChains/);
  });

  it('cancellingChains cleanup logic correctly filters finished chains', () => {
    // Pure logic test mirroring the effect at FreshnessTimeline line 343-348
    const runningPipelines = new Set(['chain_coa']); // coa still running
    const cancellingChains = new Set(['chain_permits', 'chain_coa']); // both stopping

    const next = new Set<string>();
    for (const slug of cancellingChains) {
      if (runningPipelines.has(slug)) next.add(slug);
    }
    // permits finished → removed; coa still running → kept
    expect(next.has('chain_permits')).toBe(false);
    expect(next.has('chain_coa')).toBe(true);
    expect(next.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Chain cancel sets cancelled (not failed) status (Bug A5)
// ---------------------------------------------------------------------------

describe('Chain cancel sets cancelled status (Bug A5)', () => {
  it('run-chain.js distinguishes cancelled from failed chain status', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
    );
    // Must track cancellation separately from failure
    expect(source).toContain('cancelled');
    // Final chain status must be 'cancelled' when user cancels, not 'failed'
    expect(source).toMatch(/chainStatus[\s\S]{0,200}cancelled/);
  });

  it('run-chain.js checks pipeline_runs.status for cancelled between steps', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
    );
    expect(source).toContain("status === 'cancelled'");
  });
});

// ---------------------------------------------------------------------------
// Bug B6: link_wsib indent must be 1 in permits chain
// ---------------------------------------------------------------------------

describe('link_wsib indent in permits chain (Bug B6)', () => {
  it('link_wsib has indent 1 in permits chain (not sub-step)', () => {
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const linkWsib = permits.steps.find((s) => s.slug === 'link_wsib');
    expect(linkWsib).toBeDefined();
    expect(linkWsib!.indent).toBe(1);
  });

  it('link_wsib has indent 1 in sources chain too', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources')!;
    const linkWsib = sources.steps.find((s) => s.slug === 'link_wsib');
    expect(linkWsib).toBeDefined();
    expect(linkWsib!.indent).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Bug B7: Stale slugs not in PIPELINE_CHAINS
// ---------------------------------------------------------------------------

describe('Stale scope slugs removed (Bug B7)', () => {
  it('no chain contains classify_scope_class slug', () => {
    for (const chain of PIPELINE_CHAINS) {
      const slugs = chain.steps.map((s) => s.slug);
      expect(slugs).not.toContain('classify_scope_class');
    }
  });

  it('no chain contains classify_scope_tags slug', () => {
    for (const chain of PIPELINE_CHAINS) {
      const slugs = chain.steps.map((s) => s.slug);
      expect(slugs).not.toContain('classify_scope_tags');
    }
  });

  it('classify_scope exists in permits chain', () => {
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits')!;
    const slugs = permits.steps.map((s) => s.slug);
    expect(slugs).toContain('classify_scope');
  });
});

// ---------------------------------------------------------------------------
// Bug C11: Sources chain registration end-to-end verification
// ---------------------------------------------------------------------------

describe('Sources chain registration completeness (Bug C11)', () => {
  it('chain_sources is in PIPELINE_CHAINS', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(sources).toBeDefined();
    expect(sources!.steps.length).toBeGreaterThan(0);
  });

  it('chain_sources trigger route maps to run-chain.js', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
      'utf-8'
    );
    expect(source).toContain("chain_sources: 'scripts/run-chain.js'");
  });

  it('chain_sources is in CHAIN_SLUGS set', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
      'utf-8'
    );
    expect(source).toContain("'chain_sources'");
  });

  it('sources chain exists in manifest.json', () => {
    const manifest = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../scripts/manifest.json'), 'utf-8'
    ));
    expect(manifest.chains.sources).toBeDefined();
    expect(manifest.chains.sources.length).toBeGreaterThan(0);
  });

  it('sources chain steps in manifest match PIPELINE_CHAINS', () => {
    const manifest = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../scripts/manifest.json'), 'utf-8'
    ));
    const uiChain = PIPELINE_CHAINS.find((c) => c.id === 'sources')!;
    const uiSlugs = uiChain.steps.map((s) => s.slug);
    expect(manifest.chains.sources).toEqual(uiSlugs);
  });
});

describe('API Route Chain Row Ownership (B2/B9/B10)', () => {
  const routeSource = () => fs.readFileSync(
    path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
    'utf-8'
  );

  it('B2: API callback skips status/error_message overwrite for chain slugs', () => {
    const source = routeSource();
    // The callback should check isChain and skip the UPDATE for chains,
    // since run-chain.js manages its own row status and error_message.
    expect(source).toMatch(/isChain[\s\S]{0,500}skip|isChain[\s\S]{0,500}chain.*manages|!isChain[\s\S]{0,200}UPDATE pipeline_runs/);
  });

  it('B9: stale-run cleanup marks orphaned running rows as failed', () => {
    const source = routeSource();
    // Before starting a new run, there should be a sweep that marks
    // old running rows (older than timeout) as failed — not just same-slug cancellation.
    expect(source).toMatch(/running[\s\S]{0,300}(stale|orphan|timeout|older|interval)/i);
  });

  it('B6: no empty catch blocks in API route', () => {
    const source = routeSource();
    // Every catch block should have logError or meaningful handling
    expect(source).not.toMatch(/catch\s*\{[\s]*\/[\/*]\s*(Non-fatal|non-fatal)[\s\S]{0,30}\}/);
  });
});

describe('Concurrent chain prevention (B11)', () => {
  const routeSource = () => fs.readFileSync(
    path.join(__dirname, '../app/api/admin/pipelines/[slug]/route.ts'),
    'utf-8'
  );

  it('B11: POST returns 409 if process already running for same slug', () => {
    const source = routeSource();
    // Guard checks runningProcesses map before spawning
    expect(source).toMatch(/runningProcesses\.get\(slug\)|runningProcesses\.has\(slug\)/);
    expect(source).toContain('already running');
    expect(source).toContain('status: 409');
  });

  it('B11: POST kills previous child process when force-cancelling stale rows', () => {
    const source = routeSource();
    // Force-cancel path should also SIGTERM the old process
    const cancelBlock = source.slice(
      source.indexOf('Force-cancel'),
      source.indexOf('Stale-run cleanup')
    );
    expect(cancelBlock).toMatch(/child\.kill|\.kill\(/);
  });
});

describe('Chain Completion Report per-step summary (B3)', () => {
  const timelineSource = () => fs.readFileSync(
    path.join(__dirname, '../components/FreshnessTimeline.tsx'),
    'utf-8'
  );

  it('B3: completion report renders per-step rows with verdict and duration', () => {
    const source = timelineSource();
    // The Chain Completion Report IIFE should iterate chain.steps and render
    // per-step info including audit verdict and duration_ms
    const reportBlock = source.slice(
      source.indexOf('Chain Completion Report'),
      source.indexOf('Chain Completion Report') + 4000
    );
    // Must reference step-level data from pipelineLastRun
    expect(reportBlock).toMatch(/step\.slug|PIPELINE_REGISTRY\[step\.slug\]/);
    expect(reportBlock).toContain('verdict');
    expect(reportBlock).toMatch(/duration_ms|formatDuration/);
  });

  it('B3: completion report identifies skipped steps (gate abort)', () => {
    const source = timelineSource();
    const reportBlock = source.slice(
      source.indexOf('Chain Completion Report'),
      source.indexOf('Chain Completion Report') + 7000
    );
    // Must detect and label steps that were skipped (e.g. gate abort)
    expect(reportBlock).toMatch(/skip|Skipped/i);
  });
});

// ---------------------------------------------------------------------------
// run-chain.js: failure path preserves PIPELINE_SUMMARY data
// ---------------------------------------------------------------------------
describe('Chain failure path preserves PIPELINE_SUMMARY', () => {
  const chainSource = () => fs.readFileSync(
    path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
  );

  it('summaryLines is declared outside try/catch so catch block can access it', () => {
    const source = chainSource();
    // summaryLines must be declared BEFORE the try block (not inside it)
    const declIdx = source.indexOf("let summaryLines = ''");
    // Find the try block that contains the spawn — it's the one with 'Merge step-specific'
    const tryIdx = source.indexOf('// Merge step-specific env');
    expect(declIdx).toBeGreaterThan(-1);
    expect(tryIdx).toBeGreaterThan(-1);
    expect(declIdx).toBeLessThan(tryIdx);
  });

  it('catch block parses PIPELINE_SUMMARY and PIPELINE_META from summaryLines on failure', () => {
    const source = chainSource();
    // The catch block must reference summaryLines to extract both protocols
    const catchBlock = source.slice(source.indexOf('} catch (err) {'));
    expect(catchBlock).toContain('summaryLines');
    expect(catchBlock).toContain('PIPELINE_SUMMARY');
    expect(catchBlock).toContain('PIPELINE_META');
  });
});

describe('run-chain.js captures last PIPELINE_SUMMARY (not first)', () => {
  const chainSource = () => fs.readFileSync(
    path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
  );

  it('success path uses matchAll to get last PIPELINE_SUMMARY', () => {
    const source = chainSource();
    // Must NOT use .match() which returns the first occurrence
    // (multi-worker scripts like aic-orchestrator emit worker summaries before aggregate)
    expect(source).not.toMatch(/output\.match\s*\(\s*\/PIPELINE_SUMMARY/);
    expect(source).toMatch(/matchAll.*PIPELINE_SUMMARY/);
  });

  it('success path uses matchAll to get last PIPELINE_META', () => {
    const source = chainSource();
    expect(source).not.toMatch(/output\.match\s*\(\s*\/PIPELINE_META/);
    expect(source).toMatch(/matchAll.*PIPELINE_META/);
  });

  it('failure path uses matchAll for summaryLines', () => {
    const source = chainSource();
    expect(source).not.toMatch(/summaryLines\.match\s*\(\s*\/PIPELINE_SUMMARY/);
    expect(source).not.toMatch(/summaryLines\.match\s*\(\s*\/PIPELINE_META/);
  });
});

// ---------------------------------------------------------------------------
// Pre-flight bloat gate (B24/B25) — run-chain.js checks dead_ratio before steps
// ---------------------------------------------------------------------------
describe('Pre-flight bloat gate (B24/B25)', () => {
  const chainSource = () => fs.readFileSync(
    path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
  );

  it('run-chain.js queries pg_stat_user_tables for dead tuple ratio before steps', () => {
    const source = chainSource();
    expect(source).toMatch(/n_dead_tup|dead_ratio|pg_stat_user_tables/);
  });

  it('run-chain.js has a bloat threshold that can abort a chain step', () => {
    const source = chainSource();
    // Must have a threshold check that can skip/abort when bloat is too high
    expect(source).toMatch(/BLOAT_ABORT_THRESHOLD|bloat.*abort|dead_ratio.*>/i);
  });

  it('bloat gate logic: healthy ratio passes, critical ratio aborts', () => {
    // Pure logic test for the gate function
    // Phase 0 thresholds — warn-only, never blocks execution
    const BLOAT_WARN_THRESHOLD = 0.30;
    const BLOAT_FAIL_THRESHOLD = 0.50;

    function checkBloat(deadRatio: number): 'pass' | 'warn' | 'fail' {
      if (deadRatio > BLOAT_FAIL_THRESHOLD) return 'fail';
      if (deadRatio > BLOAT_WARN_THRESHOLD) return 'warn';
      return 'pass';
    }

    expect(checkBloat(0.05)).toBe('pass');
    expect(checkBloat(0.29)).toBe('pass');
    expect(checkBloat(0.35)).toBe('warn');  // autovacuum falling behind
    expect(checkBloat(0.50)).toBe('warn');  // exactly at fail threshold = warn
    expect(checkBloat(0.51)).toBe('fail');  // FAIL verdict for dashboard, chain still runs
  });

  it('run-chain.js emits Phase 0 Pre-Flight audit_table with bloat results', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/run-chain.js'), 'utf-8'
    );
    // Must have a Phase 0 pre-flight audit_table
    expect(source).toMatch(/phase:\s*0/);
    expect(source).toContain('Pre-Flight');
    expect(source).toContain('sys_db_bloat');
  });
});

// ---------------------------------------------------------------------------
// §11 Counter Semantic Contract — verify emitSummary arguments are
// permit-scoped (primary entity), not join-table rows or multi-source sums.
// See docs/specs/pipeline/47_pipeline_script_protocol.md §11.
// ---------------------------------------------------------------------------

describe('§11 Counter Semantic Contract — emitSummary uses primary-entity counts', () => {
  const scriptsDir = path.resolve(__dirname, '../../scripts');
  const src = (name: string) => fs.readFileSync(path.join(scriptsDir, name), 'utf-8');

  it('classify-scope: records_total uses `processed` (permits), not the multi-source sum', () => {
    const content = src('classify-scope.js');
    // Must use `processed` as records_total, not the inflated sum
    expect(content).toMatch(/records_total\s*:\s*processed[^+]/);
    // Must NOT sum multiple sources into records_total
    expect(content).not.toMatch(/records_total\s*:\s*total\s*\+\s*propagated/);
  });

  it('classify-scope: propagated and demFixed go to audit_table, not generic counters', () => {
    const content = src('classify-scope.js');
    expect(content).toContain('scope_propagations');
    expect(content).toContain('dem_tag_fixes');
  });

  it('geocode-permits: records_total uses `updated` (geocoded today), not pre-run backlog', () => {
    const content = src('geocode-permits.js');
    // Must NOT use before.to_geocode as records_total
    expect(content).not.toMatch(/records_total\s*:[^,}]+to_geocode/);
    // Must have zombies_cleaned in audit_table
    expect(content).toContain('zombies_cleaned');
  });

  it('link-neighbourhoods: records_updated uses `linked` only, not linked + noMatch', () => {
    const content = src('link-neighbourhoods.js');
    // Must NOT sum failures into records_updated
    expect(content).not.toMatch(/records_updated\s*:\s*linked\s*\+\s*noMatch/);
    // Must have no_neighbourhood_match in audit_table
    expect(content).toContain('no_neighbourhood_match');
  });

  it('classify-permits: records_updated uses permitsWithTrades (permit count), not dbUpdated (permit_trades rows)', () => {
    const content = src('classify-permits.js');
    // Must NOT use dbUpdated (join-table row count) as records_updated
    expect(content).not.toMatch(/records_updated\s*:\s*dbUpdated/);
    // Must expose permit_trades_written as a named audit row
    expect(content).toContain('permit_trades_written');
  });

  it('classify-lifecycle-phase: records_total uses dirtyPermitsCount only, not mixed with CoA count', () => {
    const content = src('classify-lifecycle-phase.js');
    // Must NOT sum CoA count into records_total
    expect(content).not.toMatch(/records_total\s*:\s*dirtyPermitsCount\s*\+\s*dirtyCoAsCount/);
    // Must expose CoA metrics as named audit rows
    expect(content).toContain('coa_phase_changes');
  });

  it('compute-opportunity-scores: audit_table includes permits_in_scope (not just forecasts_scored)', () => {
    const content = src('compute-opportunity-scores.js');
    expect(content).toContain('permits_in_scope');
  });

  it('link-coa: records_total/updated uses totalLinked only, not totalLinked + crossWardCleaned', () => {
    const content = src('link-coa.js');
    // crossWardCleaned is stale-link cleanup (DELETEs), already in audit_table as cross_ward_cleaned
    expect(content).not.toMatch(/records_total:\s*totalLinked\s*\+\s*crossWardCleaned/);
    expect(content).not.toMatch(/records_updated:\s*totalLinked\s*\+\s*crossWardCleaned/);
    // cross_ward_cleaned must remain visible in audit_table
    expect(content).toContain('cross_ward_cleaned');
  });

  it('link-coa: last_seen_at bump excludes SKIP_PHASES to preserve Open Data semantic', () => {
    const content = src('link-coa.js');
    // Bump must exclude terminal/orphan/pre-permit phases that compute-trade-forecasts skips.
    // Without this filter, CoA-link-only runs drag ineligible permits into the 26h window,
    // polluting last_seen_at's "last seen in Open Data feed" meaning.
    // Must include IS NULL guard so unclassified permits still receive the dirty signal.
    expect(content).toMatch(/lifecycle_phase IS NULL OR lifecycle_phase NOT IN/);
    // Must cover the full SKIP_PHASES set matching compute-trade-forecasts.js — all 7 phases.
    // Exact string match prevents partial coverage (e.g. dropping O1-O3 would still match a regex).
    expect(content).toContain("NOT IN ('P19','P20','O1','O2','O3','P1','P2')");
  });

  // Sources pipeline fixes
  it('link-massing: records_updated uses parcelsLinked (parcels), not buildingsUpserted (parcel_buildings rows)', () => {
    const content = src('link-massing.js');
    // Must NOT use buildingsUpserted (join-table row count) as records_updated
    expect(content).not.toMatch(/records_updated\s*:\s*buildingsUpserted/);
    // parcel_buildings mutation count must be visible as a named audit row
    expect(content).toContain('parcel_buildings_written');
  });

  it('link-wsib: records_total uses totalUnlinked (full evaluation scope), not totalLinked (matched only)', () => {
    const content = src('link-wsib.js');
    // Must NOT use totalLinked as records_total (only matched entries, not full scope)
    expect(content).not.toMatch(/records_total\s*:\s*totalLinked/);
    // unlinked_start must remain in audit_table so the scope is still visible
    expect(content).toContain('unlinked_start');
  });

  it('link-parcels: records_updated uses totalLinked (permits), not dbUpserted (permit_parcels rows)', () => {
    const content = src('link-parcels.js');
    // Must NOT use dbUpserted (join-table row count) as records_updated
    expect(content).not.toMatch(/records_updated\s*:\s*dbUpserted/);
    // permit_parcels mutation count must be visible as a named audit row
    expect(content).toContain('permit_parcels_written');
  });

  it('load-neighbourhoods: records_updated is boundary count, not census characteristic rows', () => {
    const content = src('load-neighbourhoods.js');
    // Must NOT use profileUpdates (census rows matched) as records_updated
    expect(content).not.toMatch(/records_updated\s*:\s*profileUpdates/);
    // census data must remain visible as a named audit row
    expect(content).toContain('census_rows_matched');
  });
});

// ---------------------------------------------------------------------------
// Entity Tracing + Phase Distribution Wiring (WF2 2026-04-18)
// SPEC LINK: docs/specs/pipeline/41_chain_permits.md §4 §6
//            docs/specs/pipeline/42_chain_coa.md §4
// ---------------------------------------------------------------------------

describe('Entity Tracing + Phase Distribution Wiring', () => {
  const manifestPath = path.resolve(__dirname, '../../scripts/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const qualityDir = path.resolve(__dirname, '../../scripts/quality');
  const qSrc = (name: string) => fs.readFileSync(path.join(qualityDir, name), 'utf-8');

  it('manifest: assert_lifecycle_phase_distribution is in permits chain immediately after classify_lifecycle_phase', () => {
    const chain: string[] = manifest.chains.permits;
    const lcpIdx = chain.indexOf('classify_lifecycle_phase');
    const alpdIdx = chain.indexOf('assert_lifecycle_phase_distribution');
    expect(alpdIdx).toBeGreaterThan(-1);
    expect(alpdIdx).toBe(lcpIdx + 1);
  });

  it('manifest: assert_lifecycle_phase_distribution is the final step of the coa chain', () => {
    const chain: string[] = manifest.chains.coa;
    expect(chain[chain.length - 1]).toBe('assert_lifecycle_phase_distribution');
  });

  it('manifest: assert_entity_tracing is the final step of the permits chain', () => {
    const chain: string[] = manifest.chains.permits;
    expect(chain[chain.length - 1]).toBe('assert_entity_tracing');
  });

  it('assert-entity-tracing.js: uses pipeline.run() not a hand-rolled Pool', () => {
    const content = qSrc('assert-entity-tracing.js');
    expect(content).toContain('pipeline.run(');
    expect(content).not.toContain('new Pool(');
    expect(content).not.toMatch(/require\(['"]pg['"]\)/);
  });

  it('assert-entity-tracing.js: is non-halting — does not throw after coverage failures', () => {
    const content = qSrc('assert-entity-tracing.js');
    // Must explicitly document its non-halting contract inline.
    expect(content).toContain('Non-halting');
    // Unlike assert-lifecycle-phase-distribution.js, must not throw after
    // accumulating failures — FAILs go to audit_table only.
    const afterSummary = content.split('pipeline.emitSummary').at(-1)!;
    expect(afterSummary).not.toMatch(/throw new Error/);
  });

  // WF3 2026-04-18 — denominator fix for false FAILs on CoA-link-only runs
  it('assert-entity-tracing.js: trade_forecasts uses eligiblePermits denominator (excludes SKIP_PHASES + no active trades)', () => {
    const content = qSrc('assert-entity-tracing.js');
    // Must declare a separate eligiblePermits denominator for metric 3
    expect(content).toContain('eligiblePermits');
    // Must require lifecycle_phase IS NOT NULL (mirrors compute-trade-forecasts SOURCE_SQL)
    expect(content).toContain('lifecycle_phase IS NOT NULL');
    // Must require phase_started_at IS NOT NULL
    expect(content).toContain('phase_started_at IS NOT NULL');
    // Must exclude SKIP_PHASES (terminal + orphan + CoA pre-permit)
    expect(content).toMatch(/P19[\s\S]*P20|NOT IN[\s\S]*P19/);
    // Must join permit_trades with is_active = true — mirrors compute-trade-forecasts
    // SOURCE_SQL which only processes permits with at least one active trade classification.
    // Permits with valid lifecycle data but no active trades inflate the denominator
    // without having trade_forecasts rows → false FAIL without this guard.
    expect(content).toContain('is_active = true');
  });

  it('assert-entity-tracing.js: emits SKIP row for trade_forecasts when eligiblePermits is 0', () => {
    const content = qSrc('assert-entity-tracing.js');
    // Must guard against eligiblePermits === 0 (link-coa-only run, all bumped permits in SKIP_PHASES)
    expect(content).toMatch(/eligiblePermits\s*===\s*0/);
    // SKIP is the correct status — not FAIL (no eligible permits = nothing to check)
    expect(content).toContain("status: 'SKIP'");
  });

  it('assert-entity-tracing.js: traceRow returns denominator field (not new_permits)', () => {
    const content = qSrc('assert-entity-tracing.js');
    // Renamed for clarity — denominator is a general term covering both windowPermits and eligiblePermits
    expect(content).toContain('denominator:');
    expect(content).not.toContain('new_permits:');
  });
});
