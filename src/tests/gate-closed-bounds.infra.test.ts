// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1, Rule 3, §5 R-BA (gate A)
//
// WF2 gate A — `scripts/analysis/gates/closed-bounds.mjs`, fast invariant #28.
//
// The five-word standard's gate A draws every check bound from a CLOSED answer
// set: `limit_from_config` naming a DECLARED `config.logic_variables[].name` in
// the SAME descriptor (Operator Ruling A-4), the exact string `viol == 0` (zero
// tolerance — nothing to tune), or a `{gate:'A'}` ledger row. Anything else is
// RED. The module (`ledger.mjs`'s match + this file's closed set) is the
// mechanism; this suite is its independent proof.
//
// RED-FIRST (WF2 row A): before the orchestrator lands the gate-A ledger rows,
// T3 is RED on the live tree — 13 unallowed bounds measured 2026-09-25
// (load_ravines · link_massing x2 · link_parcels · enrich_parcels ·
// compute_parcel_cost_estimates x5 · parcels · assert_global_coverage warn ·
// link_neighbourhoods warn). That is the expected red, not a defect.
//
// T2 re-asserts each RED fixture `closed-bounds.mjs`'s own `selfTest()` relies
// on, DIRECTLY — a checker never proven to fire is not a check (Spec 121 §12b.6).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as closedBounds from '../../scripts/analysis/gates/closed-bounds.mjs';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');

const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

// ---------------------------------------------------------------------------
// In-memory descriptor fixtures — the exact shapes selfTest() exercises.
// ---------------------------------------------------------------------------

const desc = (
  slug: string,
  vars: string[] | null,
  checks: Array<Record<string, unknown>>,
): Record<string, unknown> => ({
  identity: { name: slug },
  config: vars === null ? 'none' : { logic_variables: vars.map((name) => ({ name })) },
  checks,
});

const check = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'pct_check',
  limit: 'pct <= 0.05',
  severity: 'FAIL',
  ...over,
});

const STEP = 'fixture_step';

const gateARow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  gate: 'A',
  step: STEP,
  item: 'checks.pct_check.limit',
  disposition: 'pending_remediation',
  why: 'w',
  closing_brief: '.cursor/wf2_conversion_standard_gates_active_task.md row A (closed bounds)',
  filed: '2026-09-25',
  adjudicated_by: 'operator',
  ...over,
});

describe('gate A — every check bound is limit_from_config | viol == 0 | ledger', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => closedBounds.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — every RED/GREEN fixture selfTest() relies on, asserted DIRECTLY. If
  // the module's self-test silently stopped checking one of these, this suite
  // is red on its own, not merely trusting the module's pass.
  // -------------------------------------------------------------------------
  describe('T2: RED and GREEN directions proven by direct assertion', () => {
    it('T2a: RED — `pct <= 0.05` with no limit_from_config', () => {
      const v = closedBounds.boundViolations(desc(STEP, [], [check()]));
      expect(v).toHaveLength(1);
      expect(v[0]?.item).toBe('checks.pct_check.limit');
      expect(v[0]?.step).toBe(STEP);
    });

    it('T2b: GREEN — the same limit externalized to a DECLARED variable', () => {
      const v = closedBounds.boundViolations(
        desc(STEP, ['pct_max'], [check({ limit_from_config: 'pct_max' })]),
      );
      expect(v).toEqual([]);
    });

    it('T2c: RED — limit_from_config naming an UNDECLARED variable', () => {
      const v = closedBounds.boundViolations(
        desc(STEP, [], [check({ limit_from_config: 'nope_var' })]),
      );
      expect(v).toHaveLength(1);
      expect(v[0]?.detail).toContain('nope_var');
    });

    it('T2d: GREEN — `limit === "viol == 0"` exactly (zero tolerance)', () => {
      const v = closedBounds.boundViolations(desc(STEP, [], [check({ limit: 'viol == 0' })]));
      expect(v).toEqual([]);
    });

    it('T2e: RED — `viol <= 3` is a tunable count, not zero tolerance', () => {
      const v = closedBounds.boundViolations(desc(STEP, [], [check({ limit: 'viol <= 3' })]));
      expect(v).toHaveLength(1);
      expect(v[0]?.item).toBe('checks.pct_check.limit');
    });

    it('T2f: RED — a warn_limit with no warn_limit_from_config (the zero-tolerance answer does not apply to a WARN tier)', () => {
      const v = closedBounds.boundViolations(
        desc(STEP, [], [check({ limit: 'viol == 0', warn_limit: 'pct >= 0' })]),
      );
      expect(v).toHaveLength(1);
      expect(v[0]?.item).toBe('checks.pct_check.warn_limit');
    });

    it('T2g: GREEN — a warn_limit externalized to a DECLARED variable', () => {
      const v = closedBounds.boundViolations(
        desc(STEP, ['warn_pct'], [
          check({ limit: 'viol == 0', warn_limit: 'pct >= 0', warn_limit_from_config: 'warn_pct' }),
        ]),
      );
      expect(v).toEqual([]);
    });

    it('T2h: GREEN — a RED item with a matching pending ledger row', () => {
      const out = closedBounds.checkClosedBounds([desc(STEP, [], [check()])], [gateARow()]);
      expect(out.pass).toBe(true);
      expect(out.unallowed).toHaveLength(0);
      expect(out.orphans).toHaveLength(0);
      expect(out.allowed).toHaveLength(1);
    });

    it('T2i: RED — a ledger row with NO violation is an ORPHAN (R-X closing-row posture)', () => {
      const out = closedBounds.checkClosedBounds(
        [desc(STEP, [], [check({ limit: 'viol == 0' })])],
        [gateARow()],
      );
      expect(out.pass).toBe(false);
      expect(out.orphans).toHaveLength(1);
      expect(out.detail).toContain('orphan');
    });

    it('T2j: RED — an unallowed violation is blocked and scoped to its step slug', () => {
      const out = closedBounds.checkClosedBounds([desc('link_massing', [], [check()])], []);
      expect(out.pass).toBe(false);
      expect(out.blockedSlugs).toEqual(['link_massing']);
    });

    it('T2k: GREEN — a clean fleet with no rows passes', () => {
      const out = closedBounds.checkClosedBounds(
        [desc(STEP, [], [check({ limit: 'viol == 0' })])],
        [],
      );
      expect(out.pass).toBe(true);
      expect(out.blockedSlugs).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // T3 — LIVE: the fleet's RED violations are exactly the ledger's gate-A rows,
  // and there are zero orphans. RED-first: before the orchestrator lands the
  // rows this is 13 unallowed (the measured red, 2026-09-25).
  // -------------------------------------------------------------------------
  it('T3: live — every bound violation has a gate-A ledger row, and zero orphans', () => {
    const descriptors = closedBounds.loadConvertedDescriptors(REPO_ROOT);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    const out = closedBounds.checkClosedBounds(descriptors, rows);

    expect(out.orphans).toEqual([]);
    expect(out.unallowed).toEqual([]);
    expect(out.pass).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T4 — the fleet is DERIVED from converted.json (R-AN), never a retyped list.
  // -------------------------------------------------------------------------
  it('T4: loadConvertedDescriptors().length === converted.json.converted.length', () => {
    const converted = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, CONVERTED_REL), 'utf8'),
    ).converted as unknown[];
    const descriptors = closedBounds.loadConvertedDescriptors(REPO_ROOT);
    expect(descriptors.length).toBe(converted.length);
    // every derived descriptor carries the identity.name the violations key on
    for (const d of descriptors as Array<Record<string, unknown>>) {
      expect(typeof (d.identity as Record<string, unknown>).name).toBe('string');
    }
  });

  it('T4b: a missing descriptor throws rather than silently skipping the step', () => {
    // Point the loader at a converted.json naming a step with no descriptor on
    // disk — the loader must THROW (a converted entry with no readable
    // descriptor is a broken registry, never a skip).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'closed-bounds-'));
    fs.mkdirSync(path.join(tmp, 'scripts/steps/_schema'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, CONVERTED_REL),
      JSON.stringify({ contract_version: 1, pending: [], converted: ['scripts/__no_such_step__.js'] }),
      'utf8',
    );
    expect(() => closedBounds.loadConvertedDescriptors(tmp)).toThrow(/no readable descriptor/);
  });
});
