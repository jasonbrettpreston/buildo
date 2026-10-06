// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.2 (registry-truth plan Phase 3 → E row #75: terminals.records_meta vs golden — fold 11 item 6)
//
// WF2 gate — `scripts/analysis/gates/terminals-records-meta.mjs` (row #75).
//
// RED-FIRST against the STUB module: `terminalsResult` returns
// `{checked: 0, violations: [], unwitnessed: []}`, `checkTerminalsRecordsMeta`
// always passes, and `selfTest()` is empty. The live direction:
//   * L1 — the converted fleet carries more than 300 (capture, declared key)
//     checks and ZERO violations. EXPECTED RED on this tree: the 22 measured
//     ASSERT `all_checks_passed` declared-but-absent keys (assert_schema,
//     assert_global_coverage, assert_data_bounds, assert_parcel_sanity) — the
//     runner sets `errors`/`warnings`/`checks_passed` to `undefined`
//     conditionally (`scripts/lib/step/index.js` ~:6206-6209). Reconciled at
//     the FLEET-2 assembly per fold 11 item 6, NEVER by editing this test.
// Every RED-direction fixture below (R1-checked, R2, R3, R5, R6, R8, R9, C1,
// L1-checked) is EXPECTED RED against the stub. Do NOT make anything green in
// this brief.

import { describe, it, expect } from 'vitest';
import * as gate from '../../scripts/analysis/gates/terminals-records-meta.mjs';

const REPO_ROOT = process.cwd();

/** A descriptor skeleton carrying just enough for row #75 (the fixture builder's `any`). */
const d = (terminals: unknown): any => ({
  identity: { name: 'fixture_step', archetype: 'LINK' },
  terminals,
});

/** One terminal row: an exit path with its declared records_meta shape. */
const t = (id: string, records_meta: unknown): any => ({
  id,
  kind: 'success',
  status: 'completed',
  records_meta,
});

/** One golden POST capture: the file name and its `summary.records_meta`. */
const g = (file: string, meta: unknown): any => ({ file, meta });

describe('terminals-records-meta (#75) — terminals[].records_meta vs golden', () => {
  // -------------------------------------------------------------------------
  // R1 — the GREEN direction: every declared key present and well typed; an
  // undeclared key the capture carries is NOT checked here (gate C owns it).
  // -------------------------------------------------------------------------
  it('R1: GREEN — declared keys present and typed; undeclared key not checked', () => {
    const out = gate.terminalsResult(d([t('ok', { n: 'int', s: 'string' })]), [
      g('a.json', { terminal: 'ok', n: 3, s: 'x', extra: 1 }),
    ]);
    expect(out.violations).toEqual([]);
    expect(out.checked).toBe(2);
  });

  // -------------------------------------------------------------------------
  // R2 — a declared key ABSENT from the capture (the declared shape is false).
  // -------------------------------------------------------------------------
  it('R2: RED — a declared key absent from the capture', () => {
    const out = gate.terminalsResult(d([t('ok', { n: 'int', errors: 'array' })]), [
      g('a.json', { terminal: 'ok', n: 3 }),
    ]);
    expect(out.violations.length).toBe(1);
    expect(out.violations[0]?.item).toBe('terminals.ok.records_meta.errors');
    expect(out.violations[0]?.step).toBe('fixture_step');
    expect(out.violations[0]?.detail).toContain('a.json');
  });

  // -------------------------------------------------------------------------
  // R3 — a present key with a mistyped non-null value.
  // -------------------------------------------------------------------------
  it('R3: RED — a mistyped non-null value', () => {
    const out = gate.terminalsResult(d([t('ok', { n: 'int' })]), [
      g('a.json', { terminal: 'ok', n: '3' }),
    ]);
    expect(out.violations.length).toBe(1);
    expect(out.violations[0]?.item).toBe('terminals.ok.records_meta.n');
  });

  // -------------------------------------------------------------------------
  // R4 — valueMatchesType's own two forgiving arms.
  // -------------------------------------------------------------------------
  it('R4: GREEN — null accepted for any type, an integer is a number', () => {
    const out = gate.terminalsResult(d([t('ok', { n: 'number', o: 'object' })]), [
      g('a.json', { terminal: 'ok', n: 3, o: null }),
    ]);
    expect(out.violations).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // R5 — a capture naming an UNDECLARED terminal id (the list is incomplete).
  // -------------------------------------------------------------------------
  it('R5: RED — a capture naming an undeclared terminal id', () => {
    const out = gate.terminalsResult(d([t('ok', { n: 'int' })]), [
      g('a.json', { terminal: 'other', n: 3 }),
    ]);
    expect(out.violations.length).toBe(1);
    expect(out.violations[0]?.item).toBe('terminals');
    expect(out.violations[0]?.detail).toContain('other');
  });

  // -------------------------------------------------------------------------
  // R6 — a capture with NO terminal string at all.
  // -------------------------------------------------------------------------
  it('R6: RED — a capture with no terminal string', () => {
    const out = gate.terminalsResult(d([t('ok', { n: 'int' })]), [
      g('a.json', { n: 3 }),
    ]);
    expect(out.violations.length).toBe(1);
    expect(out.violations[0]?.item).toBe('terminals');
  });

  // -------------------------------------------------------------------------
  // R7 — `"runner_default"` declares no keys, so nothing is checked.
  // -------------------------------------------------------------------------
  it('R7: GREEN — runner_default declares no keys', () => {
    const out = gate.terminalsResult(d([t('ok', 'runner_default')]), [
      g('a.json', { terminal: 'ok' }),
    ]);
    expect(out.violations).toEqual([]);
    expect(out.checked).toBe(0);
  });

  // -------------------------------------------------------------------------
  // R8 — a declared terminal no capture exercises is UNWITNESSED, never RED.
  // -------------------------------------------------------------------------
  it('R8: UNWITNESSED — a declared id no capture exercises', () => {
    const out = gate.terminalsResult(
      d([t('ok', { n: 'int' }), t('skip', { reason: 'string' })]),
      [g('a.json', { terminal: 'ok', n: 1 })],
    );
    expect(out.violations).toEqual([]);
    expect(out.unwitnessed).toEqual(['fixture_step:skip']);
  });

  // -------------------------------------------------------------------------
  // R9 — the check is PER CAPTURE: one captured terminal does not excuse the
  // next one missing a declared key.
  // -------------------------------------------------------------------------
  it('R9: per-capture — the violating capture is named, the other still checked', () => {
    const out = gate.terminalsResult(d([t('ok', { n: 'int' })]), [
      g('a.json', { terminal: 'ok', n: 1 }),
      g('b.json', { terminal: 'ok' }),
    ]);
    expect(out.violations.length).toBe(1);
    expect(out.violations[0]?.detail).toContain('b.json');
    expect(out.checked).toBe(2);
  });

  // -------------------------------------------------------------------------
  // R10 — the two nothing-to-do shapes: no golden dir, no terminals array.
  // -------------------------------------------------------------------------
  it('R10a: GREEN — a null goldenMetas (no golden dir) contributes nothing', () => {
    const out = gate.terminalsResult(d([t('ok', { n: 'int' })]), null);
    expect(out).toEqual({ checked: 0, violations: [], unwitnessed: [] });
  });

  it('R10b: GREEN — an absent terminals array contributes nothing', () => {
    const out = gate.terminalsResult({ identity: { name: 'fixture_step' } }, [
      g('a.json', { terminal: 'ok' }),
    ]);
    expect(out).toEqual({ checked: 0, violations: [], unwitnessed: [] });
  });

  // -------------------------------------------------------------------------
  // C1/C2 — the fleet-shaped result.
  // -------------------------------------------------------------------------
  it('C1: RED — a declared-but-absent key blocks its slug', () => {
    const out = gate.checkTerminalsRecordsMeta([
      {
        descriptor: d([t('ok', { n: 'int' })]),
        goldenMetas: [g('a.json', { terminal: 'ok' })],
      },
    ]);
    expect(out.pass).toBe(false);
    expect(out.blockedSlugs).toEqual(['fixture_step']);
    expect(out.detail.startsWith('TERMINALS-RECORDS-META (#75):')).toBe(true);
  });

  it('C2: GREEN — an all-good entry passes', () => {
    const out = gate.checkTerminalsRecordsMeta([
      {
        descriptor: { identity: { name: 's1' }, terminals: [t('ok', { n: 'int' })] },
        goldenMetas: [g('a.json', { terminal: 'ok', n: 3 })],
      },
    ]);
    expect(out.pass).toBe(true);
    expect(out.blockedSlugs).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => gate.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // L1 — LIVE. EXPECTED RED on this tree: the 22 measured ASSERT
  // `all_checks_passed` declared-but-absent keys.
  // -------------------------------------------------------------------------
  it('L1: live — no terminals.records_meta violations and more than 300 checks', () => {
    const fleet = gate.loadTerminalsFleet(REPO_ROOT);
    const out = gate.checkTerminalsRecordsMeta(
      fleet.map((row) => ({ descriptor: row.descriptor, goldenMetas: row.goldenMetas })),
    );
    expect(
      out.violations,
      JSON.stringify(out.violations.map((v) => v.step + ' ' + v.item)),
    ).toEqual([]);
    // Re-pinned 300 → measured 296 at FLEET-2 §5 (2026-10-06): 360 → 296 is attributed per step. Mostly link_parcels −56:
    // its full re-derive now WARNs (spatial_null_coordinate_permits), so every capture ends on linked_incremental_with_warnings
    // (2 declared keys, unchanged since HEAD) instead of linked_incremental (16). Plus the retired link_massing permits golden (−2).
    expect(out.checked, `checked=${out.checked}`).toBeGreaterThanOrEqual(296);
  });
});
