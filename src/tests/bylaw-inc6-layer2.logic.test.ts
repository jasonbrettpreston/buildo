// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md R3-02 (law numbers live in Layer 2), M-60 (base pair positions), M-465 (option slots);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.6 (renovation), P5.1 (the relief); Spec 08 §11.8 (MCINC-4, MCINC-5)
//
// MB-27 increment 6 (renovations) · lane INC6-B · RED FIRST (evidence docs/reports/red-evidence/bylaw/inc6-layer2-red.txt, captured on the tree without the seeds).
// Operator 2026-11-13 ("9 y"; item 5 b (i) "5ci"; item 7 ".85"): one night with two new Layer 2 targets: the 45 % suite share (150.10.40.40(1)) and the 12.2 m
// relief frontage (10.5.40.71(3)). File-only: it is the lock the night's b5 runs on the capture tree (night/blocks/expect.zsh LOCK_TESTS).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped seed surface
const ROOT = process.cwd();
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const N1 = 'suite_interior_share_pct';

describe('increment 6 Layer 2: the two new principal targets', () => {
  const scope = readJson('scripts/seeds/bylaw/layer2-scope.json');
  it('the principal list gains N1 only (27 -> 28; N2, the 12.2 m relief, is a clause-cited setting, operator 2026-11-16 "1 y drop"); the suite structures are unchanged', () => {
    const p = scope.targets.principal as string[];
    expect(p).toContain(N1);
    expect(p).not.toContain('lawful_addition_relief_frontage_m');
    expect(p.length).toBe(28);
    expect((scope.targets.garden_suite as string[]).length).toBe(16);
    expect((scope.targets.laneway_suite as string[]).length).toBe(14);
  });
  it('N1 is a vocab dsl_target (a percent of the dwelling interior floor area; it is its own pct target: interior_floor_area_m2 is a m2 target, a share cannot sit in it)', () => {
    const t = readJson('scripts/seeds/bylaw/vocab.json').dsl_target as Json;
    expect(t[N1]).toBeDefined();
    expect(t.lawful_addition_relief_frontage_m).toBeUndefined();
  });
  it('adjudications key 150.10.40.40(1)#whole to N1; 10.5.40.71(3) stays UNUSUAL with no target', () => {
    const text = JSON.stringify(readJson('scripts/seeds/bylaw/adjudications.json'));
    const mentions = (unit: string, target: string): boolean => new RegExp(`${unit.replace(/[()#.]/g, '\\$&')}[^}]{0,400}${target}|${target}[^}]{0,400}${unit.replace(/[()#.]/g, '\\$&')}`).test(text);
    expect(mentions('150.10.40.40(1)#whole', N1)).toBe(true);
    expect(text).not.toContain('lawful_addition_relief_frontage_m');
  });
  it('the option slots of increment 5 are untouched (roof_form and suite_height stay as they are)', () => {
    expect(Object.keys(scope.options).filter((k) => k !== '$comment')).toEqual(['roof_form', 'suite_height']);
  });
});

describe('increment 6 migration 329: the Layer 2 night DDL, written not applied', () => {
  const file = 'migrations/329_resolve_bylaws_reno_targets.sql';
  it('exists and names the increment, the ledger claim and the widths', () => {
    expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    const sql = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(sql).toMatch(/MB-27 increment 6/);
    expect(sql).toMatch(/mig-329/);
    expect(sql).toMatch(/\b73\b/);
    expect(sql).toMatch(/\b58\b/);
  });
  it('holds no VALIDATE itself: the three VALIDATE lines sit commented at the foot (the 315 form)', () => {
    const sql = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const live = sql.split('\n').filter((l) => !/^\s*--/.test(l));
    expect(live.filter((l) => /VALIDATE CONSTRAINT/.test(l))).toEqual([]);
    for (const c of ['bylaw_resolution_lots_codes_closed', 'bylaw_resolution_lots_array_width', 'bylaw_resolution_lots_shared_option_slots']) {
      expect(sql).toContain(`--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT ${c};`);
    }
  });
});

// The R3-02 lock (no 12.2 or 0.45 in Layer 3 sources or catalogue expressions) rides the Layer 3 Part B commit with the catalogue rows it reads.
