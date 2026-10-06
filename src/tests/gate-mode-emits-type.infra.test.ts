// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.2 (registry-truth plan P2-C5 — fold 8 item 8, fold 11 item 5, fold 17 item 1)
//
// WF2 gate — `scripts/analysis/gates/mode-emits-type.mjs` (gate P2-C5).
//
// RED-FIRST against the STUB module: `allowedModeSelect` returns the whole
// `mode_select` enum, `modeSelectViolations` / `emitsTypeResult` return no
// violations, `valueMatchesType` accepts everything and `checkModeEmitsType`
// always passes. The two LIVE tests are the stated direction:
//   * L1 (emits.type half) is EXPECTED GREEN — 247 checks / 0 mismatches on
//     this tree.
//   * L2 (mode_select half) is EXPECTED RED until the FLEET-2 assembly: P2-C6
//     sets enrich_heritage/enrich_parcels to `none`, and ldg10/seat B add the
//     `full_rescan` rows for the `none` LINKs.
// Every other RED-direction fixture below (M3, M3b, M3c, M4-without, M5-none,
// M6-skip, M7-tri_state, M8-RECORDER, M9, E3, E4, C1) is EXPECTED RED against
// the stub. Do NOT make anything green in this brief.

import { describe, it, expect } from 'vitest';
import * as gate from '../../scripts/analysis/gates/mode-emits-type.mjs';

const REPO_ROOT = process.cwd();

/** A descriptor skeleton deep enough to override nested fields with whole objects. */
const d = (over: Record<string, unknown> = {}): any => ({
  identity: { name: 'fixture_step', archetype: 'LINK' },
  staleness: { mode_select: 'tri_state', trigger: 'none' },
  outputs: { invalidates: [] },
  emits: 'none',
  ...over,
});

const fullRescanRow = { table: 't', column: 'c', by: 'full_rescan' };

const emitsFixture = (emits: unknown): any => d({ emits });

describe('mode-emits-type (P2-C5) — mode_select per archetype + emits.type', () => {
  // -------------------------------------------------------------------------
  // M1/M2 — the LINK/MATCHER arm's two GREEN directions.
  // -------------------------------------------------------------------------
  it('M1: GREEN — LINK with tri_state', () => {
    expect(gate.modeSelectViolations(d()).length).toBe(0);
  });

  it('M2: GREEN — LINK none WITH a full_rescan invalidates row', () => {
    const fixture = d({ staleness: { mode_select: 'none', trigger: 'none' }, outputs: { invalidates: [fullRescanRow] } });
    expect(gate.modeSelectViolations(fixture).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // M3 — the LINK `none` arm is closed: no row, a non-full_rescan row, or a
  // non-`none` value with a row are all RED.
  // -------------------------------------------------------------------------
  it('M3: RED — LINK none with no invalidates row', () => {
    const fixture = d({ staleness: { mode_select: 'none', trigger: 'none' }, outputs: { invalidates: [] } });
    const list = gate.modeSelectViolations(fixture);
    expect(list.length).toBe(1);
    expect(list[0]?.item).toBe('staleness.mode_select');
    expect(list[0]?.step).toBe('fixture_step');
  });

  it('M3b: RED — LINK none with only a by:"step" invalidates row', () => {
    const fixture = d({
      staleness: { mode_select: 'none', trigger: 'none' },
      outputs: { invalidates: [{ table: 't', column: 'c', by: 'step', step: 'x' }] },
    });
    const list = gate.modeSelectViolations(fixture);
    expect(list.length).toBe(1);
    expect(list[0]?.item).toBe('staleness.mode_select');
    expect(list[0]?.step).toBe('fixture_step');
  });

  it('M3c: RED — LINK skip even with a full_rescan row', () => {
    const fixture = d({ staleness: { mode_select: 'skip', trigger: 'none' }, outputs: { invalidates: [fullRescanRow] } });
    const list = gate.modeSelectViolations(fixture);
    expect(list.length).toBe(1);
    expect(list[0]?.item).toBe('staleness.mode_select');
    expect(list[0]?.step).toBe('fixture_step');
  });

  // -------------------------------------------------------------------------
  // M4 — MATCHER is the same arm.
  // -------------------------------------------------------------------------
  it('M4a: GREEN — MATCHER none WITH a full_rescan row', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'MATCHER' }, staleness: { mode_select: 'none', trigger: 'none' }, outputs: { invalidates: [fullRescanRow] } });
    expect(gate.modeSelectViolations(fixture).length).toBe(0);
  });

  it('M4b: RED — MATCHER none WITHOUT a full_rescan row', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'MATCHER' }, staleness: { mode_select: 'none', trigger: 'none' }, outputs: { invalidates: [] } });
    expect(gate.modeSelectViolations(fixture).length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // M5/M6 — the INGESTOR arm keys off `signal: "source_validator"`.
  // -------------------------------------------------------------------------
  it('M5a: GREEN — INGESTOR + source_validator trigger with skip', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'INGESTOR' }, staleness: { mode_select: 'skip', trigger: [{ signal: 'source_validator' }] } });
    expect(gate.modeSelectViolations(fixture).length).toBe(0);
  });

  it('M5b: RED — INGESTOR + source_validator trigger with none', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'INGESTOR' }, staleness: { mode_select: 'none', trigger: [{ signal: 'source_validator' }] } });
    const list = gate.modeSelectViolations(fixture);
    expect(list.length).toBe(1);
    expect(list[0]?.item).toBe('staleness.mode_select');
    expect(list[0]?.step).toBe('fixture_step');
  });

  it('M6a: GREEN — INGESTOR with trigger "none" and mode_select none', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'INGESTOR' }, staleness: { mode_select: 'none', trigger: 'none' } });
    expect(gate.modeSelectViolations(fixture).length).toBe(0);
  });

  it('M6b: RED — INGESTOR with trigger "none" and mode_select skip', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'INGESTOR' }, staleness: { mode_select: 'skip', trigger: 'none' } });
    expect(gate.modeSelectViolations(fixture).length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // M7 — the plan's named RED: an ENRICHER never calls selectMode.
  // -------------------------------------------------------------------------
  it('M7a: RED — ENRICHER with tri_state (the named red)', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'ENRICHER' } });
    const list = gate.modeSelectViolations(fixture);
    expect(list.length).toBe(1);
    expect(list[0]?.item).toBe('staleness.mode_select');
    expect(list[0]?.step).toBe('fixture_step');
  });

  it('M7b: GREEN — ENRICHER with none', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'ENRICHER' }, staleness: { mode_select: 'none', trigger: 'none' } });
    expect(gate.modeSelectViolations(fixture).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // M8 — the rest of the enum: ASSERT green on none, RECORDER red on full.
  // -------------------------------------------------------------------------
  it('M8a: GREEN — ASSERT with none', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'ASSERT' }, staleness: { mode_select: 'none', trigger: 'none' } });
    expect(gate.modeSelectViolations(fixture).length).toBe(0);
  });

  it('M8b: RED — RECORDER with full', () => {
    const fixture = d({ identity: { name: 'fixture_step', archetype: 'RECORDER' }, staleness: { mode_select: 'full', trigger: 'none' } });
    expect(gate.modeSelectViolations(fixture).length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // M9 — the allowed set itself.
  // -------------------------------------------------------------------------
  it('M9: allowedModeSelect returns exactly the permitted values', () => {
    const link = d();
    const linkNone = d({ staleness: { mode_select: 'none', trigger: 'none' }, outputs: { invalidates: [fullRescanRow] } });
    const ingest = d({ identity: { name: 'fixture_step', archetype: 'INGESTOR' }, staleness: { mode_select: 'skip', trigger: [{ signal: 'source_validator' }] } });
    const enricher = d({ identity: { name: 'fixture_step', archetype: 'ENRICHER' }, staleness: { mode_select: 'none', trigger: 'none' } });
    expect(gate.allowedModeSelect(link)).toEqual(['tri_state']);
    expect(gate.allowedModeSelect(linkNone)).toEqual(['tri_state', 'none']);
    expect(gate.allowedModeSelect(ingest)).toEqual(['skip']);
    expect(gate.allowedModeSelect(enricher)).toEqual(['none']);
  });

  // -------------------------------------------------------------------------
  // E1/E2/E3 — valueMatchesType, the closed emits.type predicate.
  // -------------------------------------------------------------------------
  it('E1: null matches every declared type', () => {
    for (const type of ['string', 'int', 'number', 'bool', 'object', 'array', 'null']) {
      expect(gate.valueMatchesType(type, null), `null vs ${type}`).toBe(true);
    }
  });

  it('E2: an integer is a number, and so is a float', () => {
    expect(gate.valueMatchesType('number', 3)).toBe(true);
    expect(gate.valueMatchesType('number', 1.5)).toBe(true);
  });

  it('E3: RED — mistyped non-null values', () => {
    expect(gate.valueMatchesType('int', '3')).toBe(false);
    expect(gate.valueMatchesType('int', 1.5)).toBe(false);
    expect(gate.valueMatchesType('object', [])).toBe(false);
    expect(gate.valueMatchesType('array', {})).toBe(false);
    expect(gate.valueMatchesType('bool', 1)).toBe(false);
    expect(gate.valueMatchesType('string', 5)).toBe(false);
    expect(gate.valueMatchesType('null', 0)).toBe(false);
  });

  it('E3g: GREEN — well-typed values', () => {
    expect(gate.valueMatchesType('int', 3)).toBe(true);
    expect(gate.valueMatchesType('string', 'x')).toBe(true);
    expect(gate.valueMatchesType('bool', false)).toBe(true);
    expect(gate.valueMatchesType('object', { a: 1 })).toBe(true);
    expect(gate.valueMatchesType('array', [1])).toBe(true);
  });

  // -------------------------------------------------------------------------
  // E4/E5/E6 — emitsTypeResult over golden metas.
  // -------------------------------------------------------------------------
  it('E4: RED — one mistyped value out of three checked pairs', () => {
    const fixture = emitsFixture([
      { key: 'n', type: 'int', consumers: [] },
      { key: 'o', type: 'object', consumers: [] },
    ]);
    const metas = [
      { file: 'a.json', meta: { n: 3, o: null } },
      { file: 'b.json', meta: { n: '3' } },
    ];
    const out = gate.emitsTypeResult(fixture, metas);
    expect(out.checked).toBe(3);
    expect(out.violations.length).toBe(1);
    expect(out.violations[0]?.item).toBe('emits.n.type');
    expect(out.violations[0]?.detail).toContain('b.json');
  });

  it('E5: GREEN — emits:"none" contributes nothing', () => {
    expect(gate.emitsTypeResult(d({ emits: 'none' }), [{ file: 'a.json', meta: { n: 3 } }])).toEqual({ checked: 0, violations: [] });
  });

  it('E6: GREEN — a null goldenMetas (no golden dir) contributes nothing', () => {
    const fixture = emitsFixture([{ key: 'n', type: 'int', consumers: [] }]);
    expect(gate.emitsTypeResult(fixture, null)).toEqual({ checked: 0, violations: [] });
  });

  // -------------------------------------------------------------------------
  // C1/C2 — the fleet-shaped result.
  // -------------------------------------------------------------------------
  it('C1: RED — an ENRICHER entry blocks its slug', () => {
    const out = gate.checkModeEmitsType([
      { descriptor: d({ identity: { name: 's1', archetype: 'ENRICHER' } }), goldenMetas: [] },
    ]);
    expect(out.pass).toBe(false);
    expect(out.blockedSlugs).toEqual(['s1']);
    expect(out.detail.startsWith('MODE-EMITS-TYPE (P2-C5):')).toBe(true);
  });

  it('C2: GREEN — an all-good entry passes', () => {
    const out = gate.checkModeEmitsType([{ descriptor: d(), goldenMetas: [] }]);
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
  // L1 — LIVE emits.type half. EXPECTED GREEN (247 checks / 0 mismatches).
  // -------------------------------------------------------------------------
  it('L1: live — no emits.type mismatches and more than 200 checks', () => {
    const fleet = gate.loadModeEmitsFleet(REPO_ROOT);
    const violations: Array<any> = [];
    let checked = 0;
    for (const { descriptor, goldenMetas } of fleet) {
      const out = gate.emitsTypeResult(descriptor, goldenMetas);
      checked += out.checked;
      violations.push(...out.violations);
    }
    const typeViolations = violations.filter((v) => String(v.item).endsWith('.type'));
    expect(typeViolations, JSON.stringify(typeViolations)).toEqual([]);
    expect(checked, `checked=${checked}`).toBeGreaterThan(200);
  });

  // -------------------------------------------------------------------------
  // L2 — LIVE mode_select half. EXPECTED RED until the FLEET-2 assembly.
  // -------------------------------------------------------------------------
  it('L2: live — no mode_select violations across the converted fleet', () => {
    const fleet = gate.loadModeEmitsFleet(REPO_ROOT);
    const list: Array<any> = [];
    for (const { descriptor } of fleet) list.push(...gate.modeSelectViolations(descriptor));
    expect(list, JSON.stringify(list)).toEqual([]);
  });
});
