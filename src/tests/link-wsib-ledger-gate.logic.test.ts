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
