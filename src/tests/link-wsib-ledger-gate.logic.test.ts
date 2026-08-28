// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (link_wsib step)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (link_wsib step)
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape)
//
// ── RE-HOMED at the Spec 122 §5.1 conversion (C1 pilot 4, commit 7, 2026-08-28) ──────
//
// This file used to `require()` scripts/link-wsib.js directly for its own hand-rolled
// exports (main, OWN_SLUGS, UPSTREAM_SLUGS, readThresholdVersionSignal,
// hasThresholdChanged) — all five LEFT that file: the frozen shape carries no gate code
// at all (scripts/link-wsib.js is 41 lines: require descriptor + compute, call
// pipeline.step()). The run-ledger gate mechanism itself is not deleted — it is
// GENERALIZED into scripts/lib/step/staleness.js (deriveLedgerSlugs / ledgerGatedSkip,
// LG-15), because a hand-maintained per-step slug array is exactly what Spec 122 §6.3
// names link_wsib as the tier-0 example of retiring.
//
// ⚠️ RE-HOMED, NOT DELETED, AND THE NEW FORM IS STRICTLY STRONGER (same claim
// link-massing.infra.test.ts makes for its own analogous rehome). The old assertion was
// "OWN_SLUGS literally equals this hand-typed array" — a fact about a copy. The new one
// asserts the GENERIC DERIVATION produces the same four forms from declared data
// (inputs.reads.steps[] + execution.invocation), so a future step gets the same
// guarantee for free instead of writing its own array.
//
// Phase B B3 — link-wsib.js run-ledger gate wiring. Pure/structural cases (no live DB
// needed):
//   W1 — dual-chain OWN_SLUGS enumeration (sources + permits, NEVER entities — v5:60's
//     "entities" was refuted by the B3 grounding fold: zero entities:link_wsib rows have
//     ever existed) + no-entities check against the live manifest.
//   W3 — wsib invalidation is MONOTONE: load-wsib.js's UPSERT never touches
//     linked_entity_id, so an upstream reload can only ADD unlinked rows, never silently
//     un-link an already-matched one behind the gate's back.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const LOAD_WSIB_PATH = join(process.cwd(), 'scripts/load-wsib.js');
const COMPUTE_PATH = join(process.cwd(), 'scripts/lib/compute/link-wsib.js');
const MANIFEST_PATH = join(process.cwd(), 'scripts/manifest.json');
const DESCRIPTOR_PATH = join(process.cwd(), 'scripts/link-wsib.descriptor.json');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS library (LG-15's generic derivation)
const staleness = require('../../scripts/lib/step/staleness.js') as {
  deriveLedgerSlugs: (descriptor: unknown) => { own: string[]; upstream: string[] };
};

interface Descriptor {
  config: { hoisted_above_gate: boolean };
  override: { dry_run: string; force_full: string };
  sharing: { varies_by_chain: { phase: Record<string, number> } };
  staleness: { trigger: Array<{ signal: string; variable?: string }> };
  execution: { invocation: Record<string, unknown> };
  inputs: { reads: { steps: Array<{ step: string }> } };
}
const DESCRIPTOR = JSON.parse(readFileSync(DESCRIPTOR_PATH, 'utf8')) as Descriptor;

describe('W1 — link_wsib own/upstream slug derivation: dual-chain (sources + permits), never entities', () => {
  const { own, upstream } = staleness.deriveLedgerSlugs(DESCRIPTOR);

  it('own slugs are exactly the four forms: sources:, permits:, bare, hyphenated (was: OWN_SLUGS literal array)', () => {
    expect(own.slice().sort()).toEqual(
      ['link-wsib', 'link_wsib', 'permits:link_wsib', 'sources:link_wsib'].sort(),
    );
  });

  it('own slugs contain no entities:-scoped form (v5:60 refuted — zero entities:link_wsib rows have ever existed)', () => {
    expect(own.some((s) => s.startsWith('entities:'))).toBe(false);
  });

  it('upstream slugs cover both builders and load_wsib, in all declared chain forms (was: UPSTREAM_SLUGS literal array)', () => {
    for (const step of ['builders', 'load_wsib']) {
      expect(upstream, `upstream slugs missing bare "${step}"`).toContain(step);
      expect(upstream, `upstream slugs missing "permits:${step}"`).toContain(`permits:${step}`);
      expect(upstream, `upstream slugs missing "sources:${step}"`).toContain(`sources:${step}`);
    }
  });

  it('g/b — manifest.json actually lists link_wsib in BOTH permits and sources chains, and NOT in entities', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { chains: Record<string, string[]> };
    expect(manifest.chains.permits).toContain('link_wsib');
    expect(manifest.chains.sources).toContain('link_wsib');
    expect(manifest.chains.entities).not.toContain('link_wsib');
  });
});

// Commit A (B3 output-panel remediation) — gate placement (A1/A2/A3). Re-homed to the
// DECLARED shape: the ordering guarantee is now a schema field the library enforces
// generically (index.js resolves config BEFORE the advisory lock when
// config.hoisted_above_gate is true), not a source-text ordinal comparison.
describe('Commit A — link-wsib gate placement (re-homed to declared shape, G-4/G-5/G-6)', () => {
  it('A1 — config.hoisted_above_gate is true (was: source-text index comparison of loadMarketplaceConfigs vs withAdvisoryLock)', () => {
    expect(DESCRIPTOR.config.hoisted_above_gate).toBe(true);
  });

  it('A2 — override.dry_run names the --dry-run argv flag (was: source-text index comparison)', () => {
    expect(DESCRIPTOR.override.dry_run).toBe('--dry-run');
  });

  it('A3 — staleness.trigger declares a config_version signal for wsib_fuzzy_match_threshold (was: hasThresholdChanged direct unit test)', () => {
    const configTrigger = DESCRIPTOR.staleness.trigger.find((t) => t.signal === 'config_version');
    expect(configTrigger, 'no config_version trigger declared').toBeDefined();
    expect(configTrigger?.variable).toBe('wsib_fuzzy_match_threshold');
  });
});

describe('W3 — wsib link monotonicity (load-wsib.js never re-nulls linked_entity_id)', () => {
  it('load-wsib.js UPSERT DO UPDATE SET clause does not touch linked_entity_id', () => {
    const src = readFileSync(LOAD_WSIB_PATH, 'utf8');
    const setBlock = src.match(/DO UPDATE SET[\s\S]*?(?=\n\s*\)|\n\s*`)/);
    expect(setBlock, 'DO UPDATE SET block not found in load-wsib.js').not.toBeNull();
    expect(setBlock![0]).not.toMatch(/linked_entity_id/);
  });

  it('the monotonicity claim is documented in the compute module (was: gate comment in link-wsib.js)', () => {
    const src = readFileSync(COMPUTE_PATH, 'utf8');
    expect(src).toMatch(/monotone|MONOTONE/);
  });
});

// Commit F (B3 output-panel remediation) — discrete corrections, re-homed to declared data.
describe('F1 — link-wsib phase ordinals reconciled to Spec 41/43 (was: source-text ternary regex)', () => {
  it('sharing.varies_by_chain.phase declares 7 (permits, Spec 41 §Step Breakdown row 7) / 19 (sources, Spec 43 §Step Breakdown row 19)', () => {
    expect(DESCRIPTOR.sharing.varies_by_chain.phase.permits).toBe(7);
    expect(DESCRIPTOR.sharing.varies_by_chain.phase.sources).toBe(19);
  });
});

describe('F2 — own/upstream slug derivation is GENERIC (was: a per-step rationale comment)', () => {
  it('deriveLedgerSlugs derives every form from declared data (inputs.reads.steps[] + execution.invocation) — no hand-maintained array to drift', () => {
    expect(DESCRIPTOR.execution.invocation).toHaveProperty('permits');
    expect(DESCRIPTOR.execution.invocation).toHaveProperty('sources');
    expect(DESCRIPTOR.inputs.reads.steps.map((s) => s.step).sort()).toEqual(['builders', 'load_wsib'].sort());
  });
});

describe('F3 — link_wsib matching algorithm is pg_trgm trigram, not Levenshtein', () => {
  it('scripts/lib/compute/link-wsib.js Tier 3 actually uses pg_trgm similarity(), not levenshtein() (was: scripts/link-wsib.js — moved with the algorithm at conversion)', () => {
    const src = readFileSync(COMPUTE_PATH, 'utf8');
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
