// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §3 (step 0a skip-check, R2-12)
// Plan O2 (operator "y" 2026-09-27; heritage 451962ac precedent): legacy ZONING_FORCE_RELOAD=1 seam so the
// ① PRE golden capture can force past the all-layers skip. Same key as the converted descriptor's
// override.force_run, so PRE and POST force identically. Unset ⇒ byte-identical.
// RE-POINTED at batch-2 row 3.3 ② — the legacy seam is now the library's override.force_run + the 0y all-primaries gate; same key, same facts. The legacy seam itself stays executed by the ① oracle pin L22.
//
// The step file is now the frozen shell (it exports no domain functions), so the behaviour this file
// locks MOVED rather than retired: the seam's subject is the library's `forceRunRequested` /
// `resolveOverrides` / `allPrimariesDecision`, the way the heritage precedent
// (src/tests/load-heritage-force-seam.logic.test.ts) and the library suite
// (src/tests/step-library.logic.test.ts) already read it. The four facts are unchanged.
//
// The behaviour itself (a forced run loads all ten layers past an all-unchanged prior and pushes the
// `zoning_override_force_reload_present` WARN row; unset, the run skips and the row is absent) is
// executed by the ① oracle pin L22 over
// src/tests/steps/load_zoning/fixtures/legacy-load-zoning.js.txt — here we lock the seam's own algebra
// and its DECLARED data, so a refactor cannot silently move the force arm off the descriptor's key.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require('../../scripts/load-zoning.descriptor.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const staleness = require('../../scripts/lib/step/staleness.js');

// The stored base-resource version (LZ-D8 / the descriptor's limitations) — the prior run and the HEAD
// agree on it, which is what the all-primaries gate compares.
const V = '2026-02-20T21:29:42.613615';
const NOW = Date.parse(V) + 10 * 86400000;

// The ten layer keys, in declaration order (the legacy LAYERS order).
const IDS: string[] = descriptor.inputs.reads.externals.map((e: { id: string }) => e.id);

// Every emit except audit_table — exactly the keys the 0y gate re-emits on a skip.
const EMITS: Array<{ key: string; type: string }> = descriptor.emits.filter(
  (e: { key: string }) => e.key !== 'audit_table',
);

// The prior run's records_meta: all ten layers loaded, each at V, nothing partial, base committed.
const PRIOR = {
  zoning_layers_loaded: Object.fromEntries(IDS.map((id) => [id, true])),
  zoning_partial_load: false,
  source_dataset_version: V,
  zoning_layer_versions: Object.fromEntries(IDS.map((id) => [id, V])),
  base_layer_committed_after_overlays_failed: false,
  zoning_rows_changed: 0,
};

// The 0y all-primaries gate over the descriptor's OWN trigger and emits, with a HEAD that agrees with
// the prior on every layer. Forced or not, the per-layer decisions are still computed.
const decide = (forced: boolean) =>
  staleness.allPrimariesDecision({
    primaries: IDS.map((id) => ({ id })),
    triggerFor: () => descriptor.staleness.trigger[0],
    validatorsById: Object.fromEntries(IDS.map((id) => [id, { lastModified: V, etag: null }])),
    priorMeta: PRIOR,
    config: { load_zoning_force_reload_max_age_days: 730 },
    nowMs: NOW,
    forced,
    reemitKeys: EMITS.map((e) => e.key),
    emitTypes: Object.fromEntries(EMITS.map((e) => [e.key, e.type])),
  }) as {
    skip: boolean;
    reason: string;
    decisions: Record<string, { skip: boolean; reason: string }>;
  };

describe('load-zoning — ZONING_FORCE_RELOAD seam (plan O2, RE-POINTED ②)', () => {
  it('force unset ⇒ not forced; only the exact value "1" arms it (the legacy === "1")', () => {
    expect(staleness.forceRunRequested(descriptor, {})).toBe(false);
    expect(staleness.forceRunRequested(descriptor, { ZONING_FORCE_RELOAD: 'true' })).toBe(false);
  });

  it('force set ⇒ forced, and resolveOverrides projects it onto ctx.overrides.force_run', () => {
    expect(staleness.forceRunRequested(descriptor, { ZONING_FORCE_RELOAD: '1' })).toBe(true);
    expect(staleness.resolveOverrides(descriptor, { ZONING_FORCE_RELOAD: '1' }).force_run).toBe(true);
  });

  it('all-layers parity: the legacy applyForceReload over every layer decision — force bypasses the skip', () => {
    const unforced = decide(false);
    expect(unforced.skip).toBe(true);
    expect(unforced.reason).toBe('unchanged');

    const forced = decide(true);
    expect(forced.skip).toBe(false);
    expect(forced.reason).toBe('force_run');

    // The per-layer decisions are still computed — force overrides only the outcome. The legacy
    // per-layer reason word was `forced`; the library's step reason is `force_run`.
    for (const id of IDS) {
      expect(forced.decisions[id]).toEqual({ skip: true, reason: 'unchanged' });
    }
  });

  it('the key is the one the legacy read, as DECLARED data (override.force_run / recovery.force + the WARN row)', () => {
    expect(descriptor.override.force_run).toBe('ZONING_FORCE_RELOAD');
    expect(descriptor.recovery.force).toBe('ZONING_FORCE_RELOAD');
    const check = descriptor.checks.find(
      (c: { id: string }) => c.id === 'zoning_override_force_reload_present',
    );
    expect(check).toBeDefined();
    expect(check.severity).toBe('WARN');
  });
});
