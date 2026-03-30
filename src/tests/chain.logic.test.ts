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
  it('defines exactly 5 chains', () => {
    expect(PIPELINE_CHAINS).toHaveLength(5);
  });

  it('defines permits chain with 18 steps (no enrichment scripts)', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'permits');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(18);
    const slugs = chain!.steps.map((s) => s.slug);
    expect(slugs).not.toContain('enrich_wsib_builders');
    expect(slugs).not.toContain('enrich_named_builders');
  });

  it('defines coa chain with 9 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'coa');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(9);
  });

  it('defines sources chain with 15 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(15);
  });

  it('permits and coa chains end with assert_engine_health', () => {
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits');
    const coa = PIPELINE_CHAINS.find((c) => c.id === 'coa');
    expect(permits!.steps[permits!.steps.length - 1].slug).toBe('assert_engine_health');
    expect(coa!.steps[coa!.steps.length - 1].slug).toBe('assert_engine_health');
  });

  it('sources chain ends with assert_engine_health', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(sources!.steps[sources!.steps.length - 1].slug).toBe('assert_engine_health');
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
      expect(chain.steps[0].indent).toBe(0);
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
});

describe('UI Chain Ordering (Dependency Hierarchy)', () => {
  it('renders daily pipelines first, then sources (foundation), then deep_scrapes', () => {
    const ids = PIPELINE_CHAINS.map((c) => c.id);
    expect(ids).toEqual(['permits', 'coa', 'entities', 'sources', 'deep_scrapes']);
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
    expect(lastStep.slug).toBe('assert_engine_health');
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
    // CoA chain has no enrichment steps — all 9 remain
    expect(activeSteps).toHaveLength(9);
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
    expect(content).toContain('pipeline_schedules WHERE enabled = FALSE');
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

  it('link-similar.js guards array_append against null scope_tags', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/link-similar.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    // DM fix must handle null scope_tags with CASE/WHEN or COALESCE
    expect(content).toMatch(/scope_tags IS NULL[\s\S]{0,100}ARRAY\['demolition'\]/);
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
  it('quality group has 7 registry entries', () => {
    const qualityEntries = Object.entries(PIPELINE_REGISTRY).filter(
      ([, entry]) => entry.group === 'quality'
    );
    expect(qualityEntries).toHaveLength(7);
  });

  it('assert_schema and assert_data_bounds exist in PIPELINE_REGISTRY', () => {
    expect(PIPELINE_REGISTRY.assert_schema).toBeDefined();
    expect(PIPELINE_REGISTRY.assert_schema.group).toBe('quality');
    expect(PIPELINE_REGISTRY.assert_data_bounds).toBeDefined();
    expect(PIPELINE_REGISTRY.assert_data_bounds.group).toBe('quality');
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

  it('gate-skip still runs quality/infrastructure steps (assert_*, refresh_snapshot)', () => {
    const source = chainSource();
    // Quality steps must be exempted from gate-skip — they check cumulative DB state
    expect(source).toMatch(/assert_|refresh_snapshot/);
    // The exemption logic must reference slug patterns for quality steps
    expect(source).toMatch(/startsWith\(['"]assert_['"]\)|=== ['"]refresh_snapshot['"]/);
  });

  it('checks both records_new and records_updated before skipping', () => {
    const source = chainSource();
    // Skip only when BOTH are 0 — updated records still warrant downstream work
    expect(source).toMatch(/recordsNew === 0[\s\S]{0,100}recordsUpdated/);
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
          knownSlugs.has(simpleMatch[1]),
          `Script "${entry.file}" has SLUG='${simpleMatch[1]}' which is not a manifest slug`
        ).toBe(true);
        continue;
      }
      // Match ternary: const SLUG = ... ? 'foo' : 'bar' — all string values must be valid slugs
      const ternaryMatch = source.match(/const SLUG\s*=\s*.+/);
      if (ternaryMatch) {
        const allSlugs = [...ternaryMatch[0].matchAll(/['"]([a-z_]+)['"]/g)].map(m => m[1]);
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
