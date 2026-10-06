// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (link_parcels staleness); 122_pipeline_step_optimization.md §6.2 (records_meta contracts); 124_step_standard_policy.md §7
//
// ── WF3 (HIGH, 2026-09-25) — link_parcels NEVER PERSISTED ITS OWN code_version BASELINE ──
//
// `link-parcels.descriptor.json` declares the pre_compute trigger
//   { "signal": "code_version", "position": "pre_compute", "emit_key": "code_version" }
// and `scripts/lib/compute/link-parcels.js#buildLinkMeta(ctx)` returned
// `duration_ms, permits_processed, …` — with NO `code_version`. The self-consumed
// producer half of the contract (same shape as link_massing / link_neighbourhoods) was
// simply missing, so on the NEXT run `staleness.selectMode` read
// `prior['code_version'] === undefined` ⇒ `baseline = null` ⇒ `changed = false`
// (staleness.js: "An ABSENT baseline is not a change"). A `staleness.logic_version`
// bump — the ONE signal that says "the compute changed, the corpus did not" — could
// therefore never force a FULL relink; it resolved `incremental` forever.
//
// The fix is ONE producer line in the compute (the descriptor, runner, staleness lib and
// goldens are untouched). These four locks:
//   T1 — the emitted value EQUALS the descriptor's declared logic_version.
//   T2 — declared ⇔ emitted: every declared trigger emit_key is a key of buildLinkMeta.
//   FLEET-2 §5 triage 2026-10-06 (O4 row 7): link_parcels now declares staleness.mode_select "none", so
//   selectMode REFUSES it and the runner resolves the mode via index.js resolveLinkGate — FULL / full_rescan
//   on every run, whatever the chain argv. The code_version baseline is still MEASURED and read back
//   (signals[]), so T3–T4 now lock that the baseline is consumed, not that it gates the mode.
//   T3 — consumer side: a differing prior baseline is read back (prior v0-old, current = logic_version).
//   T3b — no chain argv gates: selectMode refuses the descriptor for every chain argv; resolveLinkGate ⇒ full.
//   T3c — no prior run ⇒ full / full_rescan, every signal's prior null.
//   T4 — Chesterton's fence: an ABSENT baseline is still NOT a change.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS freeze (the shipped compute module)
const linkParcels = require('../../scripts/lib/compute/link-parcels.js') as {
  buildLinkMeta: (ctx: Record<string, unknown>) => Record<string, unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS library (the mode gate)
const staleness = require('../../scripts/lib/step/staleness.js') as {
  selectMode: (args: {
    descriptor: unknown;
    pool: unknown;
    prior: Record<string, string> | null;
    argv: string[];
    env: Record<string, string>;
  }) => Promise<{
    mode: 'full' | 'incremental';
    reason: string;
    changed: boolean;
    explicit_full: boolean;
    forced: boolean;
    signals: Array<{ key: string; signal: string; current: string | null; prior: string | null; changed: boolean }>;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS runner (the real mode path under mode_select "none", O4 row 7)
const runner = require('../../scripts/lib/step/index.js') as {
  resolveLinkGate: (args: { descriptor: unknown; pool: unknown; prior: Record<string, string> | null; ownRunId: number | null; tag: string }) => Promise<{
    mode: 'full' | 'incremental';
    reason: string;
    changed: boolean;
    explicit_full: boolean;
    forced: boolean;
    signals: Array<{ key: string; signal: string; current: string | null; prior: string | null; changed: boolean }>;
    interrupted_retraction: unknown;
  }>;
};

interface LinkParcelsDescriptor {
  identity: { name: string };
  staleness: {
    mode_select: string;
    logic_version: string;
    trigger: Array<{ signal: string; position: string; emit_key?: string }>;
  };
  execution: { invocation: { sources: { argv: string[] }; permits: { argv: string[] } } };
}

const descriptor = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/link-parcels.descriptor.json'), 'utf8'),
) as LinkParcelsDescriptor;

/** The `sources` chain argv — the chain whose invocation carries `--full` (descriptor-declared, never hand-typed). */
const SOURCES_ARGV = descriptor.execution.invocation.sources.argv;

/**
 * What `scripts/run-chain.js` ACTUALLY passes the step in each chain: `manifest.scripts[slug].chain_args?.[chain]`
 * (absent ⇒ []). WF3 2026-10-02: T3 used to read the DESCRIPTOR argv above and stayed green while the manifest
 * carried no `--full` — a lock that reads the descriptor's argv proves the descriptor, not the chain.
 */
const manifest = JSON.parse(readFileSync(join(process.cwd(), 'scripts/manifest.json'), 'utf8')) as {
  scripts: Record<string, { chain_args?: Record<string, string[]> }>;
};
const CHAIN_SOURCES_ARGV: string[] = manifest.scripts.link_parcels?.chain_args?.sources ?? [];
const CHAIN_PERMITS_ARGV: string[] = manifest.scripts.link_parcels?.chain_args?.permits ?? [];

/**
 * FLEET-2 §5 triage 2026-10-06: `resolveLinkGate` issues NO SQL on this path — the only declared
 * trigger, `code_version`, is PURE (staleness.js#measureTrigger), and `recovery.interrupted` is now
 * "none" (FLEET-2 R2), so no `detectInterruptedRetraction` read happens. The row-free pool is a stub.
 */
const pool = {
  query: async (_sql: string) => ({ rows: [] as unknown[] }),
};

/**
 * Every field `buildLinkMeta` reads, per the shipped source. `written` is empty so the
 * `(w && w.rows_changed) || 0` / `written.e3` reads land on 0; `elapsed_ms`, `cumulative`
 * and `gate` are the ctx fields the library itself threads.
 */
function minimalCtx() {
  return {
    descriptor,
    elapsed_ms: 1,
    matched: {
      permits_processed: 0,
      address_points_exact: 0,
      exact_legacy: 0,
      name_only: 0,
      spatial_polygon: 0,
      spatial: 0,
      no_match: 0,
      null_coordinate_permits: 0,
      street_type_mismatch: 0,
    },
    written: {},
    cumulative: {},
    gate: {},
  };
}

describe('link_parcels — code_version staleness baseline (WF3)', () => {
  it('T1 — buildLinkMeta(ctx).code_version equals the descriptor’s staleness.logic_version (RED today: undefined)', () => {
    // RED today: `code_version` is absent from buildLinkMeta's returned object ⇒ undefined.
    expect(linkParcels.buildLinkMeta(minimalCtx()).code_version)
      .toBe(descriptor.staleness.logic_version);
  });

  it('T2 — declared ⇔ emitted: every declared pre_compute trigger’s emit_key is a key of buildLinkMeta(ctx) (RED today)', () => {
    // RED today: the single declared emit_key `code_version` is NOT a key of the returned meta.
    const meta = linkParcels.buildLinkMeta(minimalCtx());
    const emitKeys = descriptor.staleness.trigger
      .filter((t) => t.position === 'pre_compute')
      .map((t) => t.emit_key as string);
    expect(emitKeys, 'the declaration this lock watches is the code_version trigger').toContain('code_version');
    for (const key of emitKeys) {
      expect(Object.keys(meta), `declared emit_key "${key}" is never emitted by buildLinkMeta`).toContain(key);
    }
  });

  it('T3 — consumer side: prior v0-old ⇒ the differing baseline is READ BACK (prior v0-old, current = logic_version); mode full / full_rescan', async () => {
    // FLEET-2 §5 triage 2026-10-06 (O4 row 7): mode_select "none" ⇒ resolveLinkGate re-derives every link on every run, so the
    // baseline no longer selects the mode (was: --full + changed ⇒ code_version_changed); the emitted baseline is still consumed.
    expect(descriptor.staleness.mode_select, 'the premise of this re-target: O4 row 7').toBe('none');
    const result = await runner.resolveLinkGate({ descriptor, pool, prior: { code_version: 'v0-old' }, ownRunId: null, tag: '[link_parcels]' });
    expect(result.mode).toBe('full');
    expect(result.reason).toBe('full_rescan');
    expect(result.forced).toBe(false);
    const signal = result.signals.find((s) => s.key === 'code_version');
    expect(signal, 'the code_version signal must still be measured').toBeDefined();
    expect(signal!.prior, 'a PRESENT baseline is read back').toBe('v0-old');
    expect(signal!.current).toBe(descriptor.staleness.logic_version);
  });

  it('T3b — no chain argv gates the mode: selectMode REFUSES the mode_select "none" descriptor for every chain argv; resolveLinkGate takes no argv ⇒ full', async () => {
    // FLEET-2 §5 triage 2026-10-06 (O4 row 7): the permits chain used to resolve incremental:no_full_arg; under full_rescan both chains run FULL.
    for (const argv of [SOURCES_ARGV, CHAIN_SOURCES_ARGV, CHAIN_PERMITS_ARGV]) {
      await expect(staleness.selectMode({ descriptor, pool, prior: { code_version: 'v0-old' }, argv, env: {} })).rejects.toThrow(/mode_select "none"/);
    }
    const result = await runner.resolveLinkGate({ descriptor, pool, prior: { code_version: 'v0-old' }, ownRunId: null, tag: '[link_parcels]' });
    expect(result.mode).toBe('full');
    expect(result.reason).toBe('full_rescan');
    expect(result.explicit_full).toBe(false);
  });

  it('T3c — fresh DB: NO prior run ⇒ full / full_rescan, every signal\'s prior null', async () => {
    // FLEET-2 §5 triage 2026-10-06 (O4 row 7): was gate:no_prior_run via selectMode; resolveLinkGate is FULL unconditionally.
    const result = await runner.resolveLinkGate({ descriptor, pool, prior: null, ownRunId: null, tag: '[link_parcels]' });
    expect(result.mode).toBe('full');
    expect(result.reason).toBe('full_rescan');
    expect(result.signals.length, 'the code_version trigger is still measured').toBe(1);
    for (const s of result.signals) expect(s.prior).toBeNull();
  });

  it('T4 — fence pin: prior {} ⇒ NOT changed on the code_version signal (an ABSENT baseline is not a change)', async () => {
    // Chesterton's fence, staleness.js: "An ABSENT baseline is not a change: a pre-contract
    // run recorded no such key, and the last completed run WAS a full rebuild under the
    // current logic". Must stay; the fix only makes the baseline EXIST.
    // FLEET-2 §5 triage 2026-10-06 (O4 row 7): proven through resolveLinkGate; the mode is now full / full_rescan (was incremental).
    const result = await runner.resolveLinkGate({ descriptor, pool, prior: {}, ownRunId: null, tag: '[link_parcels]' });
    expect(result.changed, 'an absent baseline must never be read as a change').toBe(false);
    const signal = result.signals.find((s) => s.key === 'code_version');
    expect(signal, 'the code_version signal must still be measured').toBeDefined();
    expect(signal!.changed).toBe(false);
    expect(signal!.prior).toBeNull();
    expect(signal!.current).toBe(descriptor.staleness.logic_version);
    expect(result.mode, 'every run re-derives every link — the baseline never gates (O4 row 7)').toBe('full');
    expect(result.reason).toBe('full_rescan');
  });
});
