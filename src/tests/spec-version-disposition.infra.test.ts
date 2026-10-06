// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.2 (registry-truth plan fold 8c item 8 / fold 8d item 8 / fold 12 F3: identity.spec_version is `executed:` with a per-step disposition list)
//
// identity.spec_version is EXECUTED only on the INGESTOR acquire skip path (scripts/lib/step/acquire.js
// acquireExternal stamps descriptor.identity.spec_version into the skip re-emit pins). Every other
// converted step declares it without executing it. This lock proves the per-step disposition list in
// scripts/steps/_schema/staleness-disposition.json (key `spec_version`) names EVERY converted step exactly
// once, that `executed` is exactly the INGESTOR set, that every non-executing row says why, and that the
// cited executor resolves — so the gap stays visible and can never drift silently.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const REGISTRY = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/steps/_schema/staleness-disposition.json'), 'utf8'));
const CONVERTED = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/steps/_schema/converted.json'), 'utf8'));

type Desc = { identity: { name: string; archetype: string; spec_version?: unknown } };
const fleet: Desc[] = (CONVERTED.converted as Array<string | { file: string }>).map((e) => {
  const file = typeof e === 'string' ? e : e.file;
  return JSON.parse(fs.readFileSync(path.join(REPO, file.replace(/\.(js|mjs|cjs)$/, '.descriptor.json')), 'utf8')) as Desc;
});

describe('spec_version per-step disposition (fold 8c item 8)', () => {
  const block = REGISTRY.spec_version as
    | { executor: { file: string; symbol: string }; executed: string[]; not_executed: Record<string, { why: { text: string } }> }
    | undefined;

  it('the registry carries a spec_version disposition block', () => {
    expect(block).toBeDefined();
  });

  it('the cited executor resolves (file exists and names the symbol)', () => {
    expect(block).toBeDefined();
    const abs = path.join(REPO, block!.executor.file);
    expect(fs.existsSync(abs)).toBe(true);
    expect(fs.readFileSync(abs, 'utf8')).toMatch(new RegExp(`function\\s+${block!.executor.symbol}\\b`));
  });

  it('every converted step appears exactly once across executed[] and not_executed{}', () => {
    expect(block).toBeDefined();
    const listed = [...block!.executed, ...Object.keys(block!.not_executed)];
    expect(listed.slice().sort()).toEqual(fleet.map((d) => d.identity.name).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  // Operator ruling 2026-10-06 (FLEET-2 §5 suite triage): an INGESTOR under staleness.skip_scope
  // "all_primaries" skips by re-emitting priorMeta and never reaches acquire.js's skip pins, so its
  // spec_version is declared, not executed. Those steps must sit in not_executed{} (both directions)
  // until the runner stamps spec_version on that skip path (next runner-library batch).
  const allPrimaries = (d: { staleness?: { skip_scope?: string } }) => d.staleness?.skip_scope === 'all_primaries';

  it('executed[] is exactly the INGESTOR set minus the skip_scope "all_primaries" ingestors (the acquire skip path is the only executor)', () => {
    expect(block).toBeDefined();
    const ingestors = fleet
      .filter((d) => d.identity.archetype === 'INGESTOR' && !allPrimaries(d as { staleness?: { skip_scope?: string } }))
      .map((d) => d.identity.name).sort();
    expect(block!.executed.slice().sort()).toEqual(ingestors);
  });

  it('every skip_scope "all_primaries" INGESTOR is in not_executed{} (declared, not executed)', () => {
    expect(block).toBeDefined();
    const ap = fleet
      .filter((d) => d.identity.archetype === 'INGESTOR' && allPrimaries(d as { staleness?: { skip_scope?: string } }))
      .map((d) => d.identity.name).sort();
    expect(ap.length).toBeGreaterThan(0);
    for (const slug of ap) expect(Object.keys(block!.not_executed)).toContain(slug);
  });

  it('every not_executed row carries a non-empty why.text', () => {
    expect(block).toBeDefined();
    for (const [slug, row] of Object.entries(block!.not_executed)) {
      expect(typeof row.why?.text, slug).toBe('string');
      expect(row.why.text.length, slug).toBeGreaterThan(20);
    }
  });
});
