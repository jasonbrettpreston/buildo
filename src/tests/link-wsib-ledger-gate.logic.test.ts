// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (link_wsib step)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (link_wsib step)
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
//
// Phase B B3 — link-wsib.js run-ledger gate wiring. Pure/structural cases
// (no live DB needed):
//   I1 — link-wsib.js formerly ran pipeline.run(...) unconditionally at module
//     scope (a bare require() would create a real DB pool). Now guarded +
//     exported (C1 precedent) — require() is safe to prove it.
//   W1 — dual-chain OWN_SLUGS enumeration (sources + permits, NEVER entities —
//     v5:60's "entities" was refuted by the B3 grounding fold: zero
//     entities:link_wsib rows have ever existed) + no-entities g/b against the
//     live manifest.
//   W3 — wsib invalidation is MONOTONE: load-wsib.js's UPSERT never touches
//     linked_entity_id, so an upstream reload can only ADD unlinked rows, never
//     silently un-link an already-matched one behind the gate's back.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const LINK_WSIB_PATH = join(process.cwd(), 'scripts/link-wsib.js');
const LOAD_WSIB_PATH = join(process.cwd(), 'scripts/load-wsib.js');
const MANIFEST_PATH = join(process.cwd(), 'scripts/manifest.json');

// require.main guard is now present — safe to require directly (I1).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const linkWsib = require('../../scripts/link-wsib.js') as {
  main: unknown;
  ADVISORY_LOCK_ID: number;
  OWN_SLUGS: string[];
  UPSTREAM_SLUGS: string[];
  hasThresholdChanged: (ownLastRecordsMeta: Record<string, unknown> | null, versionSignal: { thresholdUpdatedAt: string | null }) => boolean;
  readThresholdVersionSignal: (pool: unknown) => Promise<{ thresholdUpdatedAt: string | null }>;
};

describe('I1 — link-wsib.js is safely require()-able (guard + exports)', () => {
  it('has a require.main === module guard', () => {
    const src = readFileSync(LINK_WSIB_PATH, 'utf8');
    expect(src).toMatch(/require\.main\s*===\s*module/);
  });

  it('exports main + the slug sets (no real DB pool was created by the require() above)', () => {
    expect(typeof linkWsib.main).toBe('function');
    expect(Array.isArray(linkWsib.OWN_SLUGS)).toBe(true);
    expect(Array.isArray(linkWsib.UPSTREAM_SLUGS)).toBe(true);
  });
});

describe('W1 — link_wsib OWN_SLUGS: dual-chain (sources + permits), never entities', () => {
  it('OWN_SLUGS is exactly the four forms: sources:, permits:, bare, hyphenated', () => {
    expect(linkWsib.OWN_SLUGS.slice().sort()).toEqual(
      ['link-wsib', 'link_wsib', 'permits:link_wsib', 'sources:link_wsib'].sort(),
    );
  });

  it('OWN_SLUGS contains no entities:-scoped form (v5:60 refuted — zero entities:link_wsib rows have ever existed)', () => {
    expect(linkWsib.OWN_SLUGS.some((s) => s.startsWith('entities:'))).toBe(false);
  });

  it('g/b — manifest.json actually lists link_wsib in BOTH permits and sources chains, and NOT in entities', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { chains: Record<string, string[]> };
    expect(manifest.chains.permits).toContain('link_wsib');
    expect(manifest.chains.sources).toContain('link_wsib');
    expect(manifest.chains.entities).not.toContain('link_wsib');
  });
});

// Commit A (B3 output-panel remediation) — gate placement (A1/A2/A3).
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
describe('Commit A — link-wsib.js gate placement', () => {
  it('A1 — loadMarketplaceConfigs/validateLogicVars are hoisted ABOVE the advisory lock + gate (unconditional fail-fast)', () => {
    const src = readFileSync(LINK_WSIB_PATH, 'utf8');
    const configIdx = src.indexOf('loadMarketplaceConfigs(pool');
    const lockIdx = src.indexOf('withAdvisoryLock(pool, ADVISORY_LOCK_ID');
    expect(configIdx, 'loadMarketplaceConfigs call not found').toBeGreaterThan(-1);
    expect(lockIdx, 'withAdvisoryLock call not found').toBeGreaterThan(-1);
    expect(configIdx).toBeLessThan(lockIdx);
  });

  it('A2 — --dry-run is parsed BEFORE the gate + bypassGate = dryRun (mirrors compute-parcel-cost-estimates.js)', () => {
    const src = readFileSync(LINK_WSIB_PATH, 'utf8');
    const dryRunIdx = src.indexOf("dryRun = args.includes('--dry-run')");
    const gateIdx = src.indexOf('runLedgerGateDecision(pool');
    expect(dryRunIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(dryRunIdx).toBeLessThan(gateIdx);
    expect(src).toMatch(/bypassGate\s*=\s*dryRun/);
  });

  it('A3 — hasThresholdChanged: no prior meta → CHANGED (fail-safe); matching ISO → unchanged; differing ISO → changed', () => {
    expect(linkWsib.hasThresholdChanged(null, { thresholdUpdatedAt: '2026-08-01T00:00:00.000Z' })).toBe(true);
    expect(linkWsib.hasThresholdChanged(
      { threshold_updated_at: '2026-08-01T00:00:00.000Z' },
      { thresholdUpdatedAt: '2026-08-01T00:00:00.000Z' },
    )).toBe(false);
    expect(linkWsib.hasThresholdChanged(
      { threshold_updated_at: '2026-08-01T00:00:00.000Z' },
      { thresholdUpdatedAt: '2026-08-02T00:00:00.000Z' },
    )).toBe(true);
    // malformed prior meta (non-object) is treated as absent — fail-safe CHANGED.
    expect(linkWsib.hasThresholdChanged('garbage' as unknown as null, { thresholdUpdatedAt: 'x' })).toBe(true);
  });

  it('exports readThresholdVersionSignal + hasThresholdChanged', () => {
    expect(typeof linkWsib.readThresholdVersionSignal).toBe('function');
    expect(typeof linkWsib.hasThresholdChanged).toBe('function');
  });

  it('fence note — the commit body must cite 647d0935f (the fix(35_wsib_registry) landed inside the branch A1 made unreachable)', () => {
    // Documented here as a source-lock reminder for the commit body; the git-log
    // citation itself is verified at commit time (this test pins that the gate
    // placement bug the fix addresses stays fixed).
    const src = readFileSync(LINK_WSIB_PATH, 'utf8');
    const configIdx = src.indexOf('loadMarketplaceConfigs(pool');
    const gateReturnIdx = src.indexOf("if (gate && gate.skip");
    expect(configIdx).toBeLessThan(gateReturnIdx);
  });
});

describe('W3 — wsib link monotonicity (load-wsib.js never re-nulls linked_entity_id)', () => {
  it('load-wsib.js UPSERT DO UPDATE SET clause does not touch linked_entity_id', () => {
    const src = readFileSync(LOAD_WSIB_PATH, 'utf8');
    const setBlock = src.match(/DO UPDATE SET[\s\S]*?(?=\n\s*\)|\n\s*`)/);
    expect(setBlock, 'DO UPDATE SET block not found in load-wsib.js').not.toBeNull();
    expect(setBlock![0]).not.toMatch(/linked_entity_id/);
  });

  it('the monotonicity claim is documented in link-wsib.js gate comments (stated in gate comment + spec, per the B3 grounding fold)', () => {
    const src = readFileSync(LINK_WSIB_PATH, 'utf8');
    expect(src).toMatch(/MONOTONE/);
  });
});

// Commit F (B3 output-panel remediation) — discrete corrections.
describe('F1 — link-wsib.js phase ordinals reconciled to Spec 41/43 (landed inside Commit A — same lines)', () => {
  it('every audit_table.phase site uses 7 (permits, Spec 41 §Step Breakdown row 7) / 19 (sources, Spec 43 §Step Breakdown row 19)', () => {
    const src = readFileSync(LINK_WSIB_PATH, 'utf8');
    const phaseSites = [...src.matchAll(/phase:\s*\(process\.env\.PIPELINE_CHAIN === 'sources'\)\s*\?\s*(\d+)\s*:\s*(\d+)/g)];
    expect(phaseSites.length).toBeGreaterThanOrEqual(3); // SKIP / "nothing to link" / real-run
    for (const m of phaseSites) {
      expect(m[1]).toBe('19'); // sources
      expect(m[2]).toBe('7');  // permits
    }
  });
});

describe('F2 — the bare/hyphenated OWN_SLUGS rationale is corrected (pipeline.run() never writes pipeline_runs)', () => {
  it('the comment no longer claims the bare slugs are "for a standalone/manual invocation" that advances an anchor', () => {
    const src = readFileSync(LINK_WSIB_PATH, 'utf8');
    expect(src).not.toMatch(/name for a standalone\/manual invocation/);
    expect(src).toMatch(/pipeline\.run\(\)[\s\S]{0,80}never writes a pipeline_runs row/);
  });

  it('g/b — pipeline.run (scripts/lib/pipeline.js) genuinely never INSERTs into pipeline_runs (the claim this comment now makes)', () => {
    const pipelineSrc = readFileSync(join(process.cwd(), 'scripts/lib/pipeline.js'), 'utf8');
    const startIdx = pipelineSrc.indexOf('async function run(name, fn)');
    expect(startIdx, 'pipeline.run function not found').toBeGreaterThan(-1);
    // The next top-level export/section boundary bounds the function body —
    // generous enough to cover run()'s real length without a brace-matching parser.
    const endIdx = pipelineSrc.indexOf('\n// ---', startIdx);
    const runFnBody = pipelineSrc.slice(startIdx, endIdx > -1 ? endIdx : startIdx + 1500);
    expect(runFnBody).not.toMatch(/INSERT INTO pipeline_runs/);
  });
});

describe('F3 — link_wsib matching algorithm is pg_trgm trigram, not Levenshtein', () => {
  it('link-wsib.js Tier 3 actually uses pg_trgm similarity(), not levenshtein()', () => {
    const src = readFileSync(LINK_WSIB_PATH, 'utf8');
    expect(src).toMatch(/similarity\(/);
    expect(src).toMatch(/pg_trgm/);
    expect(src).not.toMatch(/levenshtein\(/);
  });

  it('Spec 43 §Step Breakdown and Spec 41 §Core Logic no longer misdescribe link_wsib as Levenshtein', () => {
    const spec43 = readFileSync(join(process.cwd(), 'docs/specs/01-pipeline/43_chain_sources.md'), 'utf8');
    const spec41 = readFileSync(join(process.cwd(), 'docs/specs/01-pipeline/41_chain_permits.md'), 'utf8');
    const wsibLine43 = spec43.split('\n').find((l) => l.includes('link_wsib') && l.includes('fuzzy'));
    const wsibLine41 = spec41.split('\n').find((l) => l.includes('WSIB linking'));
    expect(wsibLine43, 'Spec 43 WSIB linking line not found').toBeTruthy();
    expect(wsibLine41, 'Spec 41 WSIB linking line not found').toBeTruthy();
    expect(wsibLine43).not.toMatch(/\(Levenshtein fuzzy match\)/);
    expect(wsibLine41).not.toMatch(/Fuzzy string match \(Levenshtein\)/);
    expect(wsibLine43).toMatch(/pg_trgm/);
    expect(wsibLine41).toMatch(/pg_trgm/);
  });
});
