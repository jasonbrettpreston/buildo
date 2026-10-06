// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 (guards.schema_drift) + §1.5 (override.force_run); fold 19 MQ-A2 (a); MQ-A7 (a) + compliance vetting batch 2; FLEET-2 A-3
//
// MQ-A7 (a) — a STANDING `override.force_run` RELEASES a paused schema_drift.
// The write proceeds, and the drift row becomes a WARN that RECORDS the release:
// the usual `added: …; removed: …` text followed by `; released by force_run`.
// Because the row is a WARN, the run completes_with_warnings and is therefore
// itself an ELIGIBLE baseline for the NEXT run (R-BG (iv)).
//
// TWO DIRECTIONS, locked apart:
//   - ONLY `overrides.force_run === true` releases (R4: not force_full, not
//     dry_run, not the combined `forced` flag, not a null overrides).
//   - `forced` ORs in `detectInterruptedRetraction`, and an interrupted
//     retraction must NEVER release a drift — which is exactly why the runner
//     passes `overrides`, NOT `forced` (R8, structural).
//   - `propagate` keeps its own WARN arm untouched and carries no release
//     marker (R5): a release is not a severity.
//
// With no env (R1) behaviour is UNCHANGED: refused, errored FAIL.
//
// Every `it` below is RED today (the 5th argument and the `released` key do not
// exist yet) except where the comment says GREEN control.
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const stepLib = require(join(process.cwd(), 'scripts/lib/step/index.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const verdict = require(join(process.cwd(), 'scripts/lib/step/verdict.js'));
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The descriptor builder the runner receives: ONE non-lookup external (`x`).
const d = (drift: unknown) => ({
  identity: { name: 'fx', archetype: 'INGESTOR' },
  guards: { schema_drift: drift },
  inputs: { reads: { externals: [{ id: 'x' }] } },
});

// The R-BG (iv) baseline: the prior completed run recorded header `['a','b']`;
// this run's current header is `['a','c']` — so `c` was added and `b` removed.
const BASE = { found: true, fields: { x: ['a', 'b'] } };
const NOW = ['a', 'c'];
const DUE = 'added: c; removed: b';

const hasReleased = (o: unknown) => Object.prototype.hasOwnProperty.call(o as object, 'released');

// A loose view of the decision object the library returns; the assertions, not
// the type, are the contract.
type Decision = { refused?: boolean; released?: boolean; response?: string; row?: Record<string, unknown> };

describe('MQ-A7 (a) — override.force_run releases a paused schema_drift', () => {
  // GREEN control: today's behaviour is unchanged when no override is standing.
  // Two-direction lock half 1 — no env means NO release, ever.
  it('R1 — no env: refused, errored FAIL, and no `released` key (GREEN control, two-direction lock half 1)', () => {
    const out = stepLib.schemaDriftDecision(d('pause'), 'x', NOW, BASE, { force_run: false }) as Decision;
    expect(out.refused).toBe(true);
    expect(out.row && out.row.status).toBe('FAIL');
    expect(out.row && out.row.errored).toBe(true);
    expect(hasReleased(out)).toBe(false);
  });

  // RED today: the 5th argument is ignored, so the drift is still refused.
  it('R2 — force_run releases the paused drift: refused false, released true, WARN row recording the release', () => {
    const out = stepLib.schemaDriftDecision(d('pause'), 'x', NOW, BASE, { force_run: true }) as Decision;
    expect(out.refused).toBe(false);
    expect(out.released).toBe(true);
    expect(out.row).toEqual({
      metric: 'schema_drift:x',
      value: `${DUE}; released by force_run`,
      threshold: stepLib.SCHEMA_DRIFT_THRESHOLD,
      status: 'WARN',
      source: 'gate',
    });
  });

  // RED today: R2's row is a FAIL, so the run would halt instead of becoming a baseline.
  it('R3 — the released run is WARN, so it is completed_with_warnings and becomes the NEXT baseline (R-BG (iv))', () => {
    const released = stepLib.schemaDriftDecision(d('pause'), 'x', NOW, BASE, { force_run: true }) as Decision;
    expect(verdict.deriveVerdict([released.row])).toBe('WARN');
    // The released run writes, so it records the NEW header as the next baseline.
    expect(stepLib.recordFieldsMeta({ skipped: false, acquired: { record_fields: NOW } }, d('pause'), BASE)).toEqual({ x: NOW });
  });

  // RED today only insofar as a 5th argument exists at all; the lock is that none
  // of these FALSE-looking flags may sneak a release in. `forced` is the combined
  // flag (force_run OR detectInterruptedRetraction) — it is NOT a release signal.
  it('R4 — ONLY `force_run === true` releases: force_full, dry_run, `forced` and null all stay refused FAIL', () => {
    const arms = [
      { force_run: false, force_full: true, dry_run: true },
      { forced: true },
      null,
    ];
    for (const overrides of arms) {
      const out = stepLib.schemaDriftDecision(d('pause'), 'x', NOW, BASE, overrides) as Decision;
      expect(out.refused).toBe(true);
      expect(out.row && out.row.status).toBe('FAIL');
      expect(hasReleased(out)).toBe(false);
    }
  });

  // GREEN control: `propagate` was already a WARN and is not a release.
  it('R5 — propagate is unaffected: WARN without a release marker, no `released` key (GREEN control)', () => {
    const out = stepLib.schemaDriftDecision(d('propagate'), 'x', NOW, BASE, { force_run: true }) as Decision;
    expect(out.refused).toBe(false);
    expect(out.row && out.row.status).toBe('WARN');
    expect(out.row && out.row.value).toBe(DUE);
    expect(hasReleased(out)).toBe(false);
  });

  // RED today: the per-layer arm is what actually decides the response, so the
  // release must be evaluated AFTER arm resolution, not off a flat string.
  it('R6 — per-layer pause arm: the release applies to the arm that resolved to pause', () => {
    const descriptor = d([
      { match: 'x', response: 'pause', severity: 'FAIL' },
      { match: 'default', response: 'propagate', severity: 'WARN' },
    ]);
    const out = stepLib.schemaDriftDecision(descriptor, 'x', NOW, BASE, { force_run: true }) as Decision;
    expect(out.refused).toBe(false);
    expect(out.released).toBe(true);
    expect(out.row && out.row.status).toBe('WARN');
  });

  // GREEN control: nothing drifted, so there is nothing to release.
  it('R7 — an unchanged header is untouched by force_run: INFO, no `released` key (GREEN control)', () => {
    const out = stepLib.schemaDriftDecision(d('pause'), 'x', ['b', 'a'], BASE, { force_run: true }) as Decision;
    expect(out.refused).toBe(false);
    expect(out.row && out.row.status).toBe('INFO');
    expect(out.row && out.row.value).toBe('header unchanged (2 fields)');
    expect(hasReleased(out)).toBe(false);
  });

  // RED today: the runner passes 4 args, so the release is never wired in.
  it('R8 — runner wiring: runIngestPhase passes `overrides` (never `forced`) as the 5th argument', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    const start = src.indexOf('async function runIngestPhase(');
    expect(start).toBeGreaterThan(-1);
    const phase = src.slice(start);
    expect(phase).toContain('schemaDriftDecision(descriptor, external.id, acquired.record_fields, schemaDriftBaseline, overrides)');
    // `forced` ORs in `detectInterruptedRetraction`; an interrupted retraction
    // must never release a drift, so it must never reach the drift decision.
    expect(src).not.toContain('schemaDriftBaseline, forced');
  });

  // RED today: staleness.js still carries the old one-line contract, which
  // explicitly denies any purpose beyond the write path and an operator reload.
  it('R9 — the force_run contract text is rewritten: no "nothing else", and it names the release', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/lib/step/staleness.js'), 'utf8');
    expect(src).not.toContain('it proves the write path and serves a deliberate operator reload, nothing else');
    expect(src).toContain('releases a paused');
  });
});
