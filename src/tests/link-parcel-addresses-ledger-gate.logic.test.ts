// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
//
// Phase B B3 — link-parcel-addresses.js run-ledger gate wiring. Pure/structural:
//   I1 — link-parcel-addresses.js formerly ran pipeline.run(...) unconditionally
//     at module scope (a bare require() would create a real DB pool). Now
//     guarded + exported (C1 precedent) — require() is safe to prove it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SCRIPT_PATH = join(process.cwd(), 'scripts/link-parcel-addresses.js');
const MANIFEST_PATH = join(process.cwd(), 'scripts/manifest.json');

// require.main guard is now present — safe to require directly (I1).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const linkParcelAddresses = require('../../scripts/link-parcel-addresses.js') as {
  main: unknown;
  ADVISORY_LOCK_ID: number;
  OWN_SLUGS: string[];
  UPSTREAM_SLUGS: string[];
};

describe('I1 — link-parcel-addresses.js is safely require()-able (guard + exports)', () => {
  it('has a require.main === module guard', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf8');
    expect(src).toMatch(/require\.main\s*===\s*module/);
  });

  it('exports main + the slug sets (no real DB pool was created by the require() above)', () => {
    expect(typeof linkParcelAddresses.main).toBe('function');
    expect(Array.isArray(linkParcelAddresses.OWN_SLUGS)).toBe(true);
    expect(Array.isArray(linkParcelAddresses.UPSTREAM_SLUGS)).toBe(true);
  });
});

describe('link_parcel_addresses OWN_SLUGS / UPSTREAM_SLUGS — sources-chain-only', () => {
  it('OWN_SLUGS carries no permits:/entities: form (this step never runs in those chains)', () => {
    expect(linkParcelAddresses.OWN_SLUGS.some((s) => s.startsWith('permits:') || s.startsWith('entities:'))).toBe(false);
  });

  it('UPSTREAM_SLUGS covers both parcels and address_points producer forms', () => {
    expect(linkParcelAddresses.UPSTREAM_SLUGS).toEqual(
      expect.arrayContaining(['sources:parcels', 'parcels', 'load-parcels', 'sources:address_points', 'address_points', 'load-address-points']),
    );
  });

  it('g/b — manifest.json lists link_parcel_addresses in the sources chain only', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { chains: Record<string, string[]> };
    expect(manifest.chains.sources).toContain('link_parcel_addresses');
    expect(manifest.chains.permits ?? []).not.toContain('link_parcel_addresses');
    expect(manifest.chains.coa ?? []).not.toContain('link_parcel_addresses');
  });
});
