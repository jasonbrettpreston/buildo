// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §8 Distribution Health Bands
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4/E.5
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R10
//
// C1/D1 — four-quadrant lock on the halting rule. POST-REFACTOR, by design.
//
// This is NOT the red-first proof and must not be mistaken for it. The red-first
// proof is src/tests/db/assert-lifecycle-phase-distribution-halt.db.test.ts, which
// spawns the real script; a pure-function test could not have played that role
// because pre-fix the export did not exist, so it would have failed on a missing
// import — an incidental failure, not a behavioural one.
//
// What this file adds that the db test cannot: the db test pins 2 of the 4 halting
// push sites (:549 via Case B, :385 via Case C). The other two E.5 kinds — :410
// `no_band_configured` and :439 `expected_data_missing` — reach the halt decision
// through the SAME `seqBandsFailing` counter, so the quadrants below lock the rule
// they all funnel into, even though no db case arms those two flags.

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { classifyHaltDecision } = require('../../scripts/quality/assert-lifecycle-phase-distribution.js');

describe('classifyHaltDecision — C1 per-failure halt classification', () => {
  it('Q1: no bands failing, unclassified within limit → does NOT halt', () => {
    expect(classifyHaltDecision({ unclassifiedCount: 0, unclassifiedMax: 500, seqBandsFailing: 0 }))
      .toEqual({ shouldHalt: false, reasons: [] });
  });

  it('Q2: unclassified OVER the hard limit → halts, reason names the hard limit', () => {
    const d = classifyHaltDecision({ unclassifiedCount: 501, unclassifiedMax: 500, seqBandsFailing: 0 });
    expect(d.shouldHalt).toBe(true);
    expect(d.reasons).toEqual(['unclassified_hard_limit']);
  });

  it('Q3: an armed E.5 band violation → halts, reason names the band class', () => {
    const d = classifyHaltDecision({ unclassifiedCount: 0, unclassifiedMax: 500, seqBandsFailing: 1 });
    expect(d.shouldHalt).toBe(true);
    expect(d.reasons).toEqual(['seq_band_violation']);
  });

  it('Q4: both classes tripped → halts, BOTH reasons reported', () => {
    const d = classifyHaltDecision({ unclassifiedCount: 501, unclassifiedMax: 500, seqBandsFailing: 3 });
    expect(d.shouldHalt).toBe(true);
    expect(d.reasons.sort()).toEqual(['seq_band_violation', 'unclassified_hard_limit']);
  });

  // ─── Boundary: the hard limit is `>`, never `>=` ────────────────────────────
  // The audit row at :542-547 statuses PASS on `unclassifiedCount <= unclassifiedMax`.
  // If the halt used `>=` it would kill the chain on a run the audit calls PASS.
  it('exactly AT the limit is not over it — no halt, matching the audit row PASS boundary', () => {
    expect(classifyHaltDecision({ unclassifiedCount: 500, unclassifiedMax: 500, seqBandsFailing: 0 }).shouldHalt)
      .toBe(false);
  });

  it('a zero hard limit still halts on a single unclassified row', () => {
    expect(classifyHaltDecision({ unclassifiedCount: 1, unclassifiedMax: 0, seqBandsFailing: 0 }).shouldHalt)
      .toBe(true);
  });

  // ─── THE contract this whole WF exists to establish ─────────────────────────
  // cross_check_* failures are NOT an input to the halt decision. They are real
  // FAILs — the verdict at :794 still counts them, so check-chain-verdict stays red
  // — but they must never kill the chain. On 2026-08-10/11 a class-blind throw on
  // exactly this class skipped 10 downstream steps including backup_db.
  it('cross_check_* failures cannot influence the halt — they are not even parameters', () => {
    const params = classifyHaltDecision.toString();
    expect(params).not.toMatch(/cross/i);
    // A run whose ONLY problem is cross-check drift presents as a clean quadrant here.
    expect(classifyHaltDecision({ unclassifiedCount: 0, unclassifiedMax: 500, seqBandsFailing: 0 }).shouldHalt)
      .toBe(false);
  });

  // ─── Import purity — the require.main guard ─────────────────────────────────
  // Requiring this module must not execute the pipeline run. If the guard is ever
  // removed, importing it here would attempt a DB connection and this suite would
  // hang or blow up rather than fail cleanly — so assert the surface stays minimal.
  it('exports only the pure classifier (require.main guard keeps the CLI body inert)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../scripts/quality/assert-lifecycle-phase-distribution.js');
    expect(Object.keys(mod)).toEqual(['classifyHaltDecision']);
    expect(typeof mod.classifyHaltDecision).toBe('function');
  });
});
