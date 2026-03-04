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
  it('defines exactly 3 chains', () => {
    expect(PIPELINE_CHAINS).toHaveLength(3);
  });

  it('defines permits chain with 16 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'permits');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(16);
  });

  it('defines coa chain with 6 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'coa');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(6);
  });

  it('defines sources chain with 12 steps', () => {
    const chain = PIPELINE_CHAINS.find((c) => c.id === 'sources');
    expect(chain).toBeDefined();
    expect(chain!.steps).toHaveLength(12);
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

  it('indent values are 0, 1, or 2', () => {
    for (const chain of PIPELINE_CHAINS) {
      for (const step of chain.steps) {
        expect([0, 1, 2]).toContain(step.indent);
      }
    }
  });

  it('each chain starts with an indent-0 step', () => {
    for (const chain of PIPELINE_CHAINS) {
      expect(chain.steps[0].indent).toBe(0);
    }
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

  it('local-cron.js contains all 3 chain IDs (permits, coa, sources)', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/local-cron.js');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain("chainId: 'permits'");
    expect(content).toContain("chainId: 'coa'");
    expect(content).toContain("chainId: 'sources'");
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
