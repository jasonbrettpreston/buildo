// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 3, §5 R-G, §5 R-BA (gate B)
//
// WF2 gate B — `scripts/analysis/gates/on-invalid.mjs`, fast invariant #29.
//
// The five-word standard's gate B draws every `config.logic_variables[].on_invalid`
// from a CLOSED answer set: `fail` (the standard posture), or `default`/`clamp`
// BACKED BY a `deviations[]` entry that carries `/on_invalid/i` in its `from`,
// NAMES that exact variable (in `from` or `why.text`) and is dated a valid ISO
// date, or a `{gate:'B'}` ledger row. A BLANKET deviation naming no variable does
// NOT count. This closes §5 R-G's G-4 WRITE-affecting half — ANY non-`fail` needs
// a dated, named why — and is STRICTER than the pre-existing verdict-half
// `checkOnInvalidFail` (#8), whose lock is untouched.
//
// RED-FIRST (WF2 row B): before the orchestrator lands the gate-B ledger rows, T3
// is RED on the live tree — 12 unallowed on_invalid values measured 2026-09-26
// (assert_schema 3 · load_ravines 3 · link_massing 3 · link_parcel_addresses 1 ·
// compute_centroids 1 · link_parcels 1; link_neighbourhoods is already GREEN via
// its 2026-09-16 naming deviation). That is the expected red, not a defect.
//
// T2 re-asserts each RED/GREEN fixture `on-invalid.mjs`'s own `selfTest()` relies
// on, DIRECTLY — a checker never proven to fire is not a check (Spec 121 §12b.6).

import { describe, it, expect } from 'vitest';
import * as onInvalid from '../../scripts/analysis/gates/on-invalid.mjs';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';

const REPO_ROOT = process.cwd();

// ---------------------------------------------------------------------------
// In-memory descriptor fixtures — the exact shapes selfTest() exercises.
// ---------------------------------------------------------------------------

const varFixture = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'x_warn_count',
  min: 0,
  max: 100,
  on_invalid: 'clamp',
  ...over,
});

const desc = (
  vars: Array<Record<string, unknown>>,
  deviations?: Array<Record<string, unknown>>,
): Record<string, unknown> => ({
  identity: { name: 'fixture_step' },
  config: { logic_variables: vars },
  ...(deviations === undefined ? {} : { deviations }),
});

const namingDeviation = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  from: 'the P4 on_invalid "fail" posture',
  why: { text: 'x_warn_count bounds a WARN-only counter' },
  date: '2026-09-16',
  ...over,
});

const STEP = 'fixture_step';

const gateBRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  gate: 'B',
  step: STEP,
  item: 'config.x_warn_count.on_invalid',
  disposition: 'pending_remediation',
  why: 'w',
  closing_brief: '.cursor/wf2_conversion_standard_gates_active_task.md row B (on_invalid)',
  filed: '2026-09-26',
  adjudicated_by: 'operator',
  ...over,
});

describe('gate B — every on_invalid is fail | dated-named deviation | ledger', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => onInvalid.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — every RED/GREEN fixture selfTest() relies on, asserted DIRECTLY.
  // -------------------------------------------------------------------------
  describe('T2: RED and GREEN directions proven by direct assertion', () => {
    it('T2a: GREEN — `on_invalid: "fail"`', () => {
      const v = onInvalid.onInvalidViolations(desc([varFixture({ on_invalid: 'fail' })]));
      expect(v).toEqual([]);
    });

    it('T2b: RED — `clamp` with no deviation at all', () => {
      const v = onInvalid.onInvalidViolations(desc([varFixture()]));
      expect(v).toHaveLength(1);
      expect(v[0]?.item).toBe('config.x_warn_count.on_invalid');
      expect(v[0]?.step).toBe(STEP);
    });

    it('T2c: RED — `clamp` with a BLANKET deviation naming no variable', () => {
      const v = onInvalid.onInvalidViolations(
        desc(
          [varFixture()],
          [
            {
              from: 'the P4 on_invalid "fail" posture for every declared logic variable',
              why: { text: 'All six variables are seeded late' },
              date: '2026-08-25',
            },
          ],
        ),
      );
      expect(v).toHaveLength(1);
    });

    it('T2d: GREEN — `clamp` with a deviation naming it, dated', () => {
      const v = onInvalid.onInvalidViolations(desc([varFixture()], [namingDeviation()]));
      expect(v).toEqual([]);
    });

    it('T2e: RED — a naming deviation with a non-ISO date (`soon`)', () => {
      const v = onInvalid.onInvalidViolations(
        desc([varFixture()], [namingDeviation({ date: 'soon' })]),
      );
      expect(v).toHaveLength(1);
    });

    it('T2f: GREEN — a RED item with a matching pending ledger row', () => {
      const out = onInvalid.checkOnInvalidClosed([desc([varFixture()])], [gateBRow()]);
      expect(out.pass).toBe(true);
      expect(out.unallowed).toHaveLength(0);
      expect(out.orphans).toHaveLength(0);
      expect(out.allowed).toHaveLength(1);
    });

    it('T2g: RED — a ledger row with NO violation is an ORPHAN (R-X closing-row posture)', () => {
      const out = onInvalid.checkOnInvalidClosed(
        [desc([varFixture({ on_invalid: 'fail' })])],
        [gateBRow()],
      );
      expect(out.pass).toBe(false);
      expect(out.orphans).toHaveLength(1);
      expect(out.detail).toContain('orphan');
    });

    it('T2h: RED — an unallowed violation is blocked and scoped to its step slug', () => {
      const out = onInvalid.checkOnInvalidClosed(
        [{ ...desc([varFixture()]), identity: { name: 'link_massing' } }],
        [],
      );
      expect(out.pass).toBe(false);
      expect(out.blockedSlugs).toEqual(['link_massing']);
    });
  });

  // -------------------------------------------------------------------------
  // T3 — LIVE: the fleet's RED violations are exactly the ledger's gate-B rows,
  // and there are zero orphans. RED-first: before the orchestrator lands the
  // rows this is 12 unallowed (the measured red, 2026-09-26).
  // -------------------------------------------------------------------------
  it('T3: live — every on_invalid violation has a gate-B ledger row, and zero orphans', () => {
    const descriptors = onInvalid.loadConvertedDescriptors(REPO_ROOT);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    const out = onInvalid.checkOnInvalidClosed(descriptors, rows);

    expect(out.orphans).toEqual([]);
    expect(out.unallowed).toEqual([]);
    expect(out.pass).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T4 — link_neighbourhoods, on REAL data, produces ZERO gate-B violations:
  // its 2026-09-16 `deviations[]` entry names the clamped variable, proving the
  // naming-deviation arm fires against the live fleet (not just a fixture).
  // -------------------------------------------------------------------------
  it('T4: link_neighbourhoods produces 0 violations (naming-deviation arm on real data)', () => {
    const descriptors = onInvalid.loadConvertedDescriptors(REPO_ROOT) as Array<
      Record<string, unknown>
    >;
    const ln = descriptors.find(
      (d) => (d.identity as Record<string, unknown>).name === 'link_neighbourhoods',
    );
    expect(ln).toBeDefined();
    expect(onInvalid.onInvalidViolations(ln)).toEqual([]);
  });
});
