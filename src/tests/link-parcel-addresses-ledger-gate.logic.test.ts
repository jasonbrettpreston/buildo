// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape)
//
// ── RE-HOMED at the Spec 122 §5.1 conversion (C1 pilot 5, commit 7, 2026-08-29) ──────
// Phase B B3 — link-parcel-addresses.js's run-ledger gate used to be a hand-rolled pair
// of module-scope OWN_SLUGS/UPSTREAM_SLUGS arrays (sourceVersion.runLedgerGateDecision).
// The frozen shape carries neither array: LG-15's staleness.ledgerGatedSkip +
// deriveLedgerSlugs (scripts/lib/step/staleness.js) DERIVE the same slug coverage from
// the descriptor's inputs.reads.steps[] + execution.invocation, rather than a
// hand-maintained array — the identical treatment link_wsib got at its own conversion
// (its OWN_SLUGS/UPSTREAM_SLUGS locks moved out of this file's sibling entirely, per
// LW-D16). The B3-gate-slugs-derived fence lock (both directions) now lives in
// src/tests/steps/link_parcel_addresses/violations.test.ts; this file asserts the
// SAME derived coverage directly against the real staleness.js library + the real
// descriptor, which is a smaller, stronger surface than a source-text array grep.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const MANIFEST_PATH = join(process.cwd(), 'scripts/manifest.json');
const DESCRIPTOR_PATH = join(process.cwd(), 'scripts/link-parcel-addresses.descriptor.json');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const staleness = require('../../scripts/lib/step/staleness.js') as {
  deriveLedgerSlugs: (d: unknown) => { own: string[]; upstream: string[] };
};
// require.main guard is present — safe to require directly (I1, unchanged by the conversion).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const linkParcelAddresses = require('../../scripts/link-parcel-addresses.js') as {
  descriptor: { identity: { lock: number } };
  run: unknown;
};

describe('I1 — link-parcel-addresses.js is safely require()-able (no real DB pool at require() time)', () => {
  it('exports a runnable pipeline.step() shape (was: main + ADVISORY_LOCK_ID + OWN_SLUGS/UPSTREAM_SLUGS on the hand-rolled step)', () => {
    expect(typeof linkParcelAddresses.run).toBe('function');
    expect(linkParcelAddresses.descriptor.identity.lock).toBe(115);
  });
});

describe('link_parcel_addresses ledger-gate slugs — DERIVED (LG-15), sources-chain-only', () => {
  const descriptor = JSON.parse(readFileSync(DESCRIPTOR_PATH, 'utf8'));
  const derived = staleness.deriveLedgerSlugs(descriptor);

  it('own-slugs carries no permits:/entities: form (this step never runs in those chains) (was: OWN_SLUGS array on the step)', () => {
    expect(derived.own.some((s) => s.startsWith('permits:') || s.startsWith('entities:'))).toBe(false);
  });

  it('upstream-slugs covers both parcels and address_points producer forms (was: UPSTREAM_SLUGS array on the step)', () => {
    expect(derived.upstream).toEqual(
      expect.arrayContaining(['sources:parcels', 'parcels', 'load_parcels', 'sources:address_points', 'address_points', 'load_address_points']),
    );
  });

  it('g/b — manifest.json lists link_parcel_addresses in the sources chain only', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { chains: Record<string, string[]> };
    expect(manifest.chains.sources).toContain('link_parcel_addresses');
    expect(manifest.chains.permits ?? []).not.toContain('link_parcel_addresses');
    expect(manifest.chains.coa ?? []).not.toContain('link_parcel_addresses');
  });
});
