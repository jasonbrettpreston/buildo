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
//   T3 — consumer side: a differing prior baseline + `--full` resolves mode full with
//        reason `code_version_changed(v0-old->v1-knn-boundary-distance)`.
//   T4 — Chesterton's fence: an ABSENT baseline is still NOT a change (unchanged).

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

interface LinkParcelsDescriptor {
  identity: { name: string };
  staleness: {
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
 * `selectMode` issues exactly one SQL query on this path: `detectInterruptedRetraction`
 * (`recovery.interrupted: "force_full_on_next_run"` on this descriptor) — a
 * `pipeline_runs` read. The `code_version` signal is PURE (no pool touched at all,
 * staleness.js#measureTrigger). One row-free answer ⇒ "not interrupted", so the
 * code-version signal is what decides the mode.
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

  it('T3 — consumer side (GREEN both sides): prior v0-old + sources `--full` ⇒ mode full, reason code_version_changed(v0-old->v1-knn-boundary-distance)', async () => {
    // GREEN both sides — pins the contract the fix feeds. `changed` ALONE never selects
    // full (Fold GC-11: full ⇔ forced ∨ (permitted ∧ changed)); `--full` is the sources
    // chain argv the descriptor itself declares.
    const result = await staleness.selectMode({
      descriptor,
      pool,
      prior: { code_version: 'v0-old' },
      argv: SOURCES_ARGV,
      env: {},
    });
    expect(result.changed, 'a PRESENT baseline that differs IS a change').toBe(true);
    expect(result.mode).toBe('full');
    expect(result.reason).toContain(
      `code_version_changed(v0-old->${descriptor.staleness.logic_version})`,
    );
  });

  it('T4 — fence pin (GREEN both sides): prior {} ⇒ NOT changed on the code_version signal (an ABSENT baseline is not a change)', async () => {
    // Chesterton's fence, staleness.js: "An ABSENT baseline is not a change: a pre-contract
    // run recorded no such key, and the last completed run WAS a full rebuild under the
    // current logic". Must stay; the fix only makes the baseline EXIST.
    const result = await staleness.selectMode({
      descriptor,
      pool,
      prior: {},
      argv: SOURCES_ARGV,
      env: {},
    });
    expect(result.changed, 'an absent baseline must never be read as a change').toBe(false);
    const signal = result.signals.find((s) => s.key === 'code_version');
    expect(signal, 'the code_version signal must still be measured').toBeDefined();
    expect(signal!.changed).toBe(false);
    expect(signal!.prior).toBeNull();
    expect(signal!.current).toBe(descriptor.staleness.logic_version);
    expect(result.mode, '--full without a change stays incremental').toBe('incremental');
  });
});
