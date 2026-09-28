// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1, §5 R-X, §5 R-BA (gate C); 122_pipeline_step_optimization.md §6.2
//
// WF2 gate C — `scripts/analysis/gates/emits-equiv.mjs`, fast invariant #30.
//
// A converted step's DECLARED `emits[]` (its `records_meta` contract, Spec 122
// §6.2) must EQUAL the `records_meta` keys its own golden POST captures actually
// emit — both sets minus the runner-owned RUNNER_META_KEYS. `E \ G`
// (declared-not-emitted) and `G \ E` (emitted-not-declared) are RED, as is a
// `staleness.trigger[].emit_key` no golden persists (`trigger-baseline-missing`
// — the B3 class: a self-consumed baseline reads "unchanged" forever). A
// converted step with NO golden POST dir is RED, never vacuous. Each RED is
// allowed only by a `{gate:'C'}` ledger row; an ORPHAN row is RED (R-X).
//
// RED-FIRST (WF2 row C): before the orchestrator lands the gate-C ledger rows,
// T3 is RED on the live tree — the measured `--list` (2026-09-27) is:
// declared-not-emitted link_parcels `code_version` (closes when WF3 lands),
// enrich_parcels `pass_durations_ms`; trigger link_wsib `wsib_registry_count`;
// emitted-not-declared ~60 keys across link_wsib, lpa, compute_centroids,
// link_parcels, refresh_snapshot, enrich_parcels, assert_engine_health,
// geocode_permits, cpce. That is the expected red, not a defect.
//
// T2 re-asserts each RED/GREEN fixture `emits-equiv.mjs`'s own `selfTest()`
// relies on, DIRECTLY — a checker never proven to fire is not a check (Spec 121
// §12b.6). T4 locks RUNNER_META_KEYS against the runner's own literal key set.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as emits from '../../scripts/analysis/gates/emits-equiv.mjs';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';

// ---------------------------------------------------------------------------
// In-memory descriptor fixtures — the exact shapes selfTest() exercises.
// ---------------------------------------------------------------------------

const desc = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  identity: { name: 'fixture_step' },
  emits: [{ key: 'x', type: 'int', consumers: [] }],
  ...over,
});

const STEP = 'fixture_step';

const gateCRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  gate: 'C',
  step: STEP,
  item: 'emits.x',
  disposition: 'pending_remediation',
  why: 'w',
  closing_brief: '.cursor/wf2_conversion_standard_gates_c_emits_equiv_active_task.md row C (emits-equiv)',
  filed: '2026-09-27',
  adjudicated_by: 'operator',
  ...over,
});

const items = (list: Array<{ item: string }>): string[] => list.map((v) => v.item).sort();

describe('gate C — declared emits equals emitted records_meta', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw', () => {
    expect(() => emits.selfTest()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // T2 — every RED/GREEN fixture selfTest() relies on, asserted DIRECTLY.
  // -------------------------------------------------------------------------
  describe('T2: RED and GREEN directions proven by direct assertion', () => {
    it('T2a: GREEN — declared `x` present in goldens', () => {
      const v = emits.emitsViolations(desc(), new Set(['x']));
      expect(v).toEqual([]);
    });

    it('T2b: RED — declared `x` absent from goldens (declared-not-emitted)', () => {
      const v = emits.emitsViolations(desc(), new Set());
      expect(items(v)).toEqual(['emits.x']);
      expect(v[0]?.step).toBe(STEP);
    });

    it('T2c: RED — a golden key `y` undeclared (emitted-not-declared)', () => {
      const v = emits.emitsViolations(desc(), new Set(['x', 'y']));
      expect(items(v)).toEqual(['emits.y']);
    });

    it('T2d: GREEN — a runner key (`errors`) declared but absent from goldens is excluded', () => {
      const v = emits.emitsViolations(
        desc({ emits: [{ key: 'errors', type: 'array', consumers: [] }] }),
        new Set(),
      );
      expect(v).toEqual([]);
    });

    it('T2e: GREEN — a golden carrying ONLY runner keys against `emits: "none"`', () => {
      const v = emits.emitsViolations(
        desc({ emits: 'none' }),
        new Set(['config', 'terminal', 'errors']),
      );
      expect(v).toEqual([]);
    });

    it('T2f: RED — a self-consumed trigger emit_key no golden persists (the B3 class)', () => {
      const d = desc({
        emits: [{ key: 'code_version', type: 'string', consumers: [] }],
        staleness: { trigger: [{ signal: 'code_version', emit_key: 'code_version' }] },
      });
      const v = emits.emitsViolations(d, new Set());
      expect(items(v)).toContain('staleness.trigger.code_version');
    });

    it('T2g: GREEN — the same trigger emit_key declared AND present in goldens', () => {
      const d = desc({
        emits: [{ key: 'code_version', type: 'string', consumers: [] }],
        staleness: { trigger: [{ signal: 'code_version', emit_key: 'code_version' }] },
      });
      expect(emits.emitsViolations(d, new Set(['code_version']))).toEqual([]);
    });

    it('T2h: GREEN — declared==emitted and trigger persisted', () => {
      const d = desc({ staleness: { trigger: [{ signal: 'code_version', emit_key: 'x' }] } });
      expect(emits.emitsViolations(d, new Set(['x']))).toEqual([]);
    });

    it('T2i: GREEN — a RED item with a matching pending ledger row', () => {
      const out = emits.checkEmitsEquiv(
        [{ descriptor: desc(), goldenKeys: new Set() }],
        [gateCRow()],
      );
      expect(out.pass).toBe(true);
      expect(out.unallowed).toHaveLength(0);
      expect(out.orphans).toHaveLength(0);
      expect(out.allowed).toHaveLength(1);
    });

    it('T2j: RED — a ledger row with NO violation is an ORPHAN (R-X closing-row posture)', () => {
      const out = emits.checkEmitsEquiv(
        [{ descriptor: desc(), goldenKeys: new Set(['x']) }],
        [gateCRow()],
      );
      expect(out.pass).toBe(false);
      expect(out.orphans).toHaveLength(1);
      expect(out.detail).toContain('orphan');
    });

    it('T2k: RED — an empty/missing golden dir is never a vacuous pass', () => {
      const v = emits.emitsViolations(desc({ emits: 'none' }), null);
      expect(v).toHaveLength(1);
      expect(v[0]?.item).toBe('emits');
    });
  });

  // -------------------------------------------------------------------------
  // T3 — LIVE: the fleet's RED drifts are exactly the ledger's gate-C rows,
  // and there are zero orphans. RED-first: before the orchestrator lands the
  // rows this is the measured red (2026-09-27).
  // -------------------------------------------------------------------------
  it('T3: live — every emits drift has a gate-C ledger row, and zero orphans', () => {
    const fleet = emits.loadEmitsFleet(REPO_ROOT);
    const { rows } = ledger.loadLedger(REPO_ROOT);
    const out = emits.checkEmitsEquiv(fleet, rows);

    expect(out.orphans).toEqual([]);
    expect(out.unallowed).toEqual([]);
    expect(out.pass).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T4 — RUNNER_META_KEYS is a SUPERSET of every `records_meta` key the runner
  // literally writes in its `recordsMeta = {` assembly. Source-text lock on
  // index.js: each literal assignment key must appear in the exported list.
  // -------------------------------------------------------------------------
  it('T4: RUNNER_META_KEYS covers the runner’s own literal records_meta keys', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/lib/step/index.js'),
      'utf8',
    );
    // The runner stamps these keys LITERALLY (not via a spread) on the recordsMeta
    // object; each must be in the exported closed set.
    const literalRunnerKeys = [
      'ledger_row',
      'chain_run_id',
      'code_sha',
      'pool_errors',
      'checks_passed',
      'checks_failed',
      'checks_warned',
      'audit_table',
    ];
    const set = new Set(emits.RUNNER_META_KEYS);
    for (const key of literalRunnerKeys) {
      // The key is written as `<key>:` inside the recordsMeta assembly.
      expect(src).toMatch(new RegExp(`\\b${key}:`));
      expect(set.has(key)).toBe(true);
    }
    // The spread-provided keys (config/terminal/dry_run/errors/warnings/gate) are
    // also runner-owned and must be present in the closed set.
    for (const key of ['gate', 'config', 'terminal', 'dry_run', 'errors', 'warnings']) {
      expect(set.has(key)).toBe(true);
    }
    // A fixed, closed length so a silent drop is caught (13 -> 14: code_sha,
    // conversion-simplification item 9).
    expect(emits.RUNNER_META_KEYS.length).toBe(14);
  });

  // -------------------------------------------------------------------------
  // T5 — link_massing, on REAL data, produces ZERO gate-C drift: every declared
  // emit is emitted and every emitted key is declared (its compute returns the
  // keys its own descriptor declares), proving the equals-direction fires on the
  // live fleet, not just a fixture.
  // -------------------------------------------------------------------------
  it('T5: link_massing produces 0 gate-C violations (declared==emitted on real data)', () => {
    const fleet = emits.loadEmitsFleet(REPO_ROOT);
    const entry = fleet.find((e: { slug: string }) => e.slug === 'link_massing');
    expect(entry).toBeDefined();
    expect(entry!.goldenKeys).not.toBeNull();
    expect(emits.emitsViolations(entry!.descriptor, entry!.goldenKeys)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // T6 — the fleet is DERIVED from converted.json (R-AN), never a retyped list.
  // -------------------------------------------------------------------------
  it('T6: loadEmitsFleet().length === converted.json.converted.length', () => {
    const converted = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, CONVERTED_REL), 'utf8'),
    ).converted as unknown[];
    expect(emits.loadEmitsFleet(REPO_ROOT).length).toBe(converted.length);
  });
});
