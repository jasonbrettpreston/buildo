// SPEC LINK: docs/specs/01-pipeline/46_wsib_enrichment.md; 122_pipeline_step_optimization.md §6.2; 124_step_standard_policy.md §7
//
// ── WF3 (HIGH, 2026-09-26) — link_wsib NEVER PERSISTED ITS OWN wsib_registry_count BASELINE ──
//
// `link-wsib.descriptor.json` declares the pre_compute trigger
//   { "signal": "upstream_ledger", "position": "pre_compute",
//     "table": "wsib_registry", "emit_key": "wsib_registry_count" }
// and `scripts/lib/compute/link-wsib.js#buildLinkMeta(ctx)` returned
// `duration_ms, unlinked_start, run_matched, matches_tier_1_trade, …,
//  threshold_updated_at, is_wsib_registered_corrected` — with NO
// `wsib_registry_count`. The self-consumed producer half of the contract (same shape as
// link_massing's `building_footprints_count`, link_parcels' `code_version`) was simply
// missing, so on the NEXT run `staleness.selectMode` read
// `prior['wsib_registry_count'] === undefined` ⇒ `baseline = null` ⇒ `changed = false`
// (staleness.js: "An ABSENT baseline is not a change"). A `wsib_registry` corpus reload —
// the ONE signal that says "the upstream corpus moved" — could therefore never force a
// FULL relink; `scripts/link-wsib.notes.json` R-L rules "on the sources chain, mode
// resolves full IFF the wsib_registry corpus fingerprint changed", and that ruled
// behaviour was DEAD (WG3 GC-5 / N1: emitted 0/6 runs incl. 1834, 0/4 POST).
//
// Same fix class as the already-landed `79b30291` (link_parcels `code_version`). The fix
// is ONE producer line in the compute plus ONE `emits[]` declaration (runner, staleness
// lib, goldens and specs are untouched by it). These four locks:
//   T1 — the emitted value EQUALS String(ctx.cumulative.total) (buildCumulativeSql's
//        `SELECT COUNT(*) FROM wsib_registry AS total`, i.e. the SAME COUNT(*) the
//        `upstream_ledger` reader measures — no new query).
//   T2 — declared ⇔ emitted, BOTH halves: the trigger's emit_key is a key of
//        buildLinkMeta(ctx), AND descriptor.emits[] declares it.
//   T3 — consumer side under O4 row 6: mode_select none ⇒ resolveLinkGate FULL/full_rescan, signal still measured.
//   T4 — Chesterton's fence: an ABSENT baseline is still NOT a change.
//   T5 — a tri_state clone still routes through staleness.selectMode (the wsib_registry_count_changed truth row).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS freeze (the shipped compute module)
const linkWsib = require('../../scripts/lib/compute/link-wsib.js') as {
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
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS runner (the real mode path under mode_select "none")
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

interface LinkWsibDescriptor {
  identity: { name: string };
  staleness: {
    logic_version: string;
    mode_select: string;
    trigger: Array<{ signal: string; position: string; table?: string; emit_key?: string }>;
  };
  emits: Array<{ key: string; type: string; consumers: string[] }>;
  execution: { invocation: { sources: { argv: string[] }; permits: { argv: string[] } } };
}

const descriptor = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/link-wsib.descriptor.json'), 'utf8'),
) as LinkWsibDescriptor;

/**
 * `cumulative.total` as `buildCumulativeSql` selects it (`SELECT COUNT(*) FROM wsib_registry
 * AS total`) and as the runner threads it onto `ctx` (scripts/lib/step/index.js:1844,
 * `cumulative: { linked: Number(c.linked), total: Number(c.total) }`) — NOT `ctx.matched.total`.
 * CAUGHT LIVE (WF3 landing, 2026-09-26): this fixture originally put `total` under `matched`,
 * matching a first (wrong) implementation that read `ctx.matched.total`; a live forced-FULL
 * proof run exposed it (`wsib_registry_count` captured as the literal string "undefined").
 * Both the fixture and the implementation are now corrected against the real runner wiring.
 */
const CORPUS_TOTAL = 123456;

/**
 * `selectMode` issues SQL on two paths here: `measureTrigger`'s `upstream_ledger` branch
 * (`SELECT COUNT(*)::bigint AS n FROM wsib_registry` — the count of the corpus NOW) and
 * `detectInterruptedRetraction` (`recovery.interrupted: "force_full_on_next_run"` on this
 * descriptor — a `pipeline_runs` read). The stub answers the first with the fixture count
 * and every other query with a row-free result ("not interrupted"), so the corpus signal
 * is what decides the mode.
 */
const CURRENT_CORPUS_COUNT = '222';
const pool = {
  query: async (sql: string) => (/FROM wsib_registry/.test(sql)
    ? { rows: [{ n: CURRENT_CORPUS_COUNT }] }
    : { rows: [] as unknown[] }),
};

/** The `sources` chain argv — the chain R-L declares `--full` on (never hand-typed). */
const SOURCES_ARGV = descriptor.execution.invocation.sources.argv;

/**
 * Every field `buildLinkMeta` reads, per the shipped source (`const m = ctx.matched`):
 * `unlinked_start`, `tiers` (via `tierCount`) and `is_wsib_registered_corrected`. `total`
 * lives on `ctx.cumulative` (the runner's own field, NOT `ctx.matched`). `written`,
 * `elapsed_ms` and `gate = {}` are the other ctx fields the library itself threads.
 */
function minimalCtx() {
  return {
    descriptor,
    elapsed_ms: 1,
    matched: {
      unlinked_start: 0,
      tiers: {},
      is_wsib_registered_corrected: 0,
    },
    written: {},
    cumulative: { total: CORPUS_TOTAL },
    gate: {},
  };
}

describe('link_wsib — wsib_registry_count staleness baseline (WF3)', () => {
  it('T1 — buildLinkMeta(ctx).wsib_registry_count === String(ctx.cumulative.total), a STRING (RED today: undefined)', () => {
    // RED today: `wsib_registry_count` is absent from buildLinkMeta's returned object ⇒ undefined.
    const meta = linkWsib.buildLinkMeta(minimalCtx());
    expect(meta.wsib_registry_count).toBe(String(CORPUS_TOTAL));
    // The reader (`staleness.measureTrigger`) compares by String(); the sibling contract
    // (link_massing's `building_footprints_count`) is a string for exactly this reason.
    expect(typeof meta.wsib_registry_count).toBe('string');
  });

  it('T2 — declared ⇔ emitted: the upstream_ledger trigger’s emit_key is a key of buildLinkMeta(ctx) AND is declared in emits[] (both RED today)', () => {
    // RED today (half 1): the declared emit_key `wsib_registry_count` is NOT a key of the returned meta.
    // RED today (half 2): descriptor.emits[] declares only `threshold_updated_at`.
    const meta = linkWsib.buildLinkMeta(minimalCtx());
    const emitKeys = descriptor.staleness.trigger
      .filter((t) => t.position === 'pre_compute')
      .map((t) => t.emit_key as string);
    expect(emitKeys, 'the declaration this lock watches is the upstream_ledger trigger').toContain('wsib_registry_count');
    for (const key of emitKeys) {
      expect(Object.keys(meta), `declared emit_key "${key}" is never emitted by buildLinkMeta`).toContain(key);
    }
    expect(
      descriptor.emits.some((e) => e.key === 'wsib_registry_count'),
      'a self-consumed producer field must be declared in emits[] (mirrors link_massing.building_footprints_count)',
    ).toBe(true);
  });

  it('T3 — consumer side under O4 row 6 (fold 14 row 6, fold 16 row 1, fold 17 item 1): mode_select none ⇒ resolveLinkGate resolves FULL / full_rescan on every run, and still MEASURES the corpus signal against the prior baseline', async () => {
    expect(descriptor.staleness.mode_select, 'O4 row 6: link_wsib is full_rescan').toBe('none');
    const result = await runner.resolveLinkGate({ descriptor, pool, prior: { wsib_registry_count: '111' }, ownRunId: null, tag: '[link_wsib]' });
    expect(result.mode).toBe('full');
    expect(result.reason).toBe('full_rescan');
    expect(result.forced).toBe(false);
    expect(result.interrupted_retraction, 'no mass retraction exists to be interrupted under full_rescan').toBeNull();
    const signal = result.signals.find((s) => s.key === 'wsib_registry_count');
    expect(signal, 'the wsib_registry_count signal is still measured (the producer half T1/T2 feeds stays live)').toBeDefined();
    expect(signal!.prior).toBe('111');
    expect(signal!.current).toBe(CURRENT_CORPUS_COUNT);
  });

  it('T4 — fence pin: an ABSENT baseline is never read as a change (staleness.js), and under full_rescan the mode does not depend on it', async () => {
    const result = await runner.resolveLinkGate({ descriptor, pool, prior: {}, ownRunId: null, tag: '[link_wsib]' });
    const signal = result.signals.find((s) => s.key === 'wsib_registry_count');
    expect(signal, 'the wsib_registry_count signal must still be measured').toBeDefined();
    expect(signal!.changed).toBe(false);
    expect(signal!.prior).toBeNull();
    expect(signal!.current).toBe(CURRENT_CORPUS_COUNT);
    expect(result.changed, 'an absent baseline must never be read as a change').toBe(false);
    expect(result.mode, 'full_rescan: FULL on every run, baseline or not').toBe('full');
  });
  it('T5 — the tri_state path is unchanged: a tri_state clone of this descriptor still routes through staleness.selectMode (prior 111 + sources --full ⇒ full, wsib_registry_count_changed)', async () => {
    const triState = JSON.parse(JSON.stringify(descriptor)) as LinkWsibDescriptor;
    triState.staleness.mode_select = 'tri_state';
    const viaGate = await runner.resolveLinkGate({ descriptor: triState, pool, prior: { wsib_registry_count: '111' }, ownRunId: null, tag: '[link_wsib]' });
    expect(viaGate.reason).not.toBe('full_rescan');
    const direct = await staleness.selectMode({ descriptor: triState, pool, prior: { wsib_registry_count: '111' }, argv: SOURCES_ARGV, env: {} });
    expect(direct.changed, 'a PRESENT baseline that differs IS a change').toBe(true);
    expect(direct.mode).toBe('full');
    expect(direct.reason).toContain(`wsib_registry_count_changed(111->${CURRENT_CORPUS_COUNT})`);
  });
});
