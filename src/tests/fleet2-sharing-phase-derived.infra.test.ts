// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md (Phase 3 #73 sharing derived fields, WIRE -> G); docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown; docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown
//
// RED-FIRST (FLEET-2 B-4, #73). `sharing.varies_by_chain.phase` is the audit-table phase the
// runtime stamps (scripts/lib/step/verdict.js). The chain specs' Step Breakdown tables number
// each step by its 1-based position in scripts/manifest.json chains.<chain>, and
// system-map.infra.test.ts locks those tables to the manifest. So the declared phase per chain
// IS that position, and a hand-kept number drifts (measured 2026-10-04: 17 of 25 descriptors).
// Expected RED until the #73 generator writes the map from the manifest.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface Manifest { chains: Record<string, string[]> }
interface Descriptor {
  identity: { name: string };
  sharing?: { varies_by_chain?: { phase?: 'none' | Record<string, number> } };
}

const ROOT = process.cwd();
const readJson = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;

const manifest = readJson<Manifest>('scripts/manifest.json');
const descriptorFiles = ['scripts', 'scripts/quality'].flatMap((dir) =>
  fs.readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.descriptor.json'))
    .map((f) => `${dir}/${f}`));

function expectedPhase(slug: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [chain, steps] of Object.entries(manifest.chains)) {
    const i = steps.indexOf(slug);
    if (i >= 0) out[chain] = i + 1;
  }
  return out;
}

const declared = descriptorFiles
  .map((rel) => ({ rel, d: readJson<Descriptor>(rel) }))
  .map(({ rel, d }) => ({ rel, slug: d.identity.name, phase: d.sharing?.varies_by_chain?.phase }))
  .filter((x): x is { rel: string; slug: string; phase: Record<string, number> } =>
    x.phase !== undefined && x.phase !== 'none');

describe('#73 — sharing.varies_by_chain.phase is the manifest position (derived, never hand-kept)', () => {
  it('the fixture is non-vacuous — at least 20 descriptors declare a phase map', () => {
    expect(declared.length).toBeGreaterThanOrEqual(20);
  });

  for (const { rel, slug, phase } of declared) {
    it(`${slug}: phase map == manifest 1-based positions`, () => {
      const expected = expectedPhase(slug);
      expect(phase, `${rel}: declared ${JSON.stringify(phase)} but manifest positions are ${JSON.stringify(expected)}`).toEqual(expected);
    });
  }
});
