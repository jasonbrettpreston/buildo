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

  it('defines permits chain with 15 steps (no enrichment scripts)', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'permits');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(15);
    const slugs = chain!.steps.map((s) => s.slug);
    expect(slugs).not.toContain('enrich_wsib_builders');
    expect(slugs).not.toContain('enrich_named_builders');
  });

  it('defines coa chain with 6 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'coa');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(6);
  });

  it('defines sources chain with 14 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(14);
  });

  it('permits and coa chains end with assert_data_bounds', () => {
    const permits = PIPELINE_CHAINS.find((c) => c.id === 'permits');
    const coa = PIPELINE_CHAINS.find((c) => c.id === 'coa');
    expect(permits!.steps[permits!.steps.length - 1].slug).toBe('assert_data_bounds');
    expect(coa!.steps[coa!.steps.length - 1].slug).toBe('assert_data_bounds');
  });

  it('sources chain ends with assert_data_bounds', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(sources!.steps[sources!.steps.length - 1].slug).toBe('assert_data_bounds');
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
  it('sources chain includes assert_data_bounds as final step', () => {
    const sources = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(sources).toBeDefined();
    const lastStep = sources!.steps[sources!.steps.length - 1];
    expect(lastStep.slug).toBe('assert_data_bounds');
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
    // CoA chain has no enrichment steps — all 6 remain
    expect(activeSteps).toHaveLength(6);
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

  it('link-wsib.js emits PIPELINE_SUMMARY with totalUnlinked as records_total', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/link-wsib.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('PIPELINE_SUMMARY:');
    expect(content).toContain('totalUnlinked');
  });
});

describe('Quality Pipeline Group', () => {
  it('quality group has 2 registry entries', () => {
    const qualityEntries = Object.entries(PIPELINE_REGISTRY).filter(
      ([, entry]) => entry.group === 'quality'
    );
    expect(qualityEntries).toHaveLength(2);
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
      expect(source).toContain('PIPELINE_SUMMARY:');
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

  it('aborts chain only for primary ingest gate steps (permits, coa)', () => {
    const source = chainSource();
    // Chain abort is limited to CHAIN_GATES — not every step
    expect(source).toContain('CHAIN_GATES');
    expect(source).toContain("permits: 'permits'");
    expect(source).toContain("coa: 'coa'");
    expect(source).toContain('0 new records');
    expect(source).toMatch(/recordsNew === 0[\s\S]{0,300}break/);
  });

  it('checks both records_new and records_updated before aborting', () => {
    const source = chainSource();
    // Abort only when BOTH are 0 — updated records still warrant downstream work
    expect(source).toMatch(/recordsNew === 0[\s\S]{0,100}recordsUpdated/);
  });
});
