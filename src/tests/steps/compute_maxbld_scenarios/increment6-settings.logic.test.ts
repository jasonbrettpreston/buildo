// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-451, M-481 (a reading carries its confidence), M-377 (a later increment enters only when the previous is green), M-61 (no id in code);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.6, P5.10, P5.12
//
// MB-27 increment 6 (renovations) · lane INC6-B · RED FIRST: migration 330, the two seed rows and scripts/lib/compute/maxbld/renovation.js do not exist on this tree.
// Operator rulings: DECISIONS-v2.md of the increment-6 decision list, 2026-11-13, items 1-12 and UB-1..UB-10; the McProof key was approved 2026-11-13.
// The two settings below are the renovation engine's only numbers besides the houseplex pair it already reads; the four relief, suite-share and
// extension-window inputs are Layer 2 cells, so the module reads every number through its `settings` argument and never from a literal (item 4 b: no
// assume-1-storey setting is seeded). The migration mirrors the seed entry for entry (the seed file is the test truth), as migration 316 does for increment 5.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON surface
const ROOT = process.cwd();
const readText = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel: string): Json => JSON.parse(readText(rel));
const exists = (rel: string): boolean => fs.existsSync(path.join(ROOT, rel));

const MIGRATION = 'migrations/330_layer3_increment6_settings.sql';
const SEED = 'scripts/seeds/logic_variables.json';
const DESCRIPTOR = 'scripts/compute-maxbld-scenarios.descriptor.json';
const GROUPS = 'src/features/admin-controls/generated/logic-variable-groups.json';
const MODULE = 'scripts/lib/compute/maxbld/renovation.js';
const SUITE_SHARE = 'compute_maxbld_scenarios_suite_interior_gfa_share';
const LIVABLE_SHARE = 'compute_maxbld_scenarios_reno_basement_livable_share';
const RELIEF = 'compute_maxbld_scenarios_relief_frontage_max_m';
const NAMES = [SUITE_SHARE, LIVABLE_SHARE, RELIEF];
const VALUES: Record<string, number> = { [SUITE_SHARE]: 0.85, [LIVABLE_SHARE]: 1.0, [RELIEF]: 12.2 };

const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const upOf = (sql: string): string =>
  (sql.split(/^--\s*DOWN/m)[0] ?? '')
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

const seedRow = (name: string): Json => readJson(SEED)[name] ?? {};
const upRows = (): Array<{ name: string; value: number; description: string }> => {
  const up = upOf(readText(MIGRATION));
  return [...up.matchAll(/\('([a-z0-9_]+)',\s*(-?[\d.]+),\s*NULL,\s*'((?:[^']|'')*)'\)/g)].map((m) => ({
    name: m[1] as string,
    value: Number(m[2]),
    description: (m[3] as string).replace(/''/g, "'"),
  }));
};
const declared = (): Json[] => readJson(DESCRIPTOR).config.logic_variables as Json[];
const retiredNames = (): string[] => ((readJson(DESCRIPTOR).config.retired ?? []) as Json[]).map((e) => String(e.name));
const groupKeys = (): string[] => (readJson(GROUPS) as Json[]).flatMap((g) => (g.keys ?? []) as string[]);

describe('INC6-B (1): migration 330 seeds the two renovation settings', () => {
  it('the migration file exists (model: migrations/316_layer3_increment5_settings.sql)', () => {
    expect(exists(MIGRATION)).toBe(true);
  });

  it('seeds exactly the two names with 0.85 and 1.0, idempotently', () => {
    const rows = upRows();
    expect(rows.map((r) => [r.name, r.value])).toEqual(NAMES.map((n) => [n, VALUES[n]]));
    expect(upOf(readText(MIGRATION))).toContain('ON CONFLICT (variable_key) DO NOTHING');
  });

  it('carries a confidence on each description and no assume-1-storey setting', () => {
    const rows = upRows();
    for (const name of NAMES) {
      const row = rows.find((r) => r.name === name);
      expect(row, name).toBeTruthy();
      expect(row!.description.toLowerCase(), name).toContain('confidence');
    }
    const up = upOf(readText(MIGRATION));
    expect(up).not.toMatch(/reno_assumed_storeys/);
    expect(up).not.toMatch(/(^|[^a-z_])assumed_storeys([^a-z_]|$)/);
  });

  it('comments a DOWN rollback naming both keys', () => {
    const sql = readText(MIGRATION);
    const down = sql.split(/^--\s*DOWN/m)[1] ?? '';
    for (const name of NAMES) expect(down, name).toContain(name);
  });
});

describe('INC6-B (2): the seed and the migration agree', () => {
  it.each(NAMES)('%s is a seeded number with its bounds and its confidence', (name) => {
    const row = seedRow(name);
    expect(row.type).toBe('number');
    expect(row.default).toBe(VALUES[name]);
    expect(typeof row.min).toBe('number');
    expect(typeof row.max).toBe('number');
    expect(row.min).toBeLessThanOrEqual(row.default);
    expect(row.max).toBeGreaterThanOrEqual(row.default);
    expect(String(row.description).toLowerCase()).toContain('confidence');
  });

  it('the basement livable share takes 1.0 as its ceiling and the suite share stays under the whole', () => {
    expect(seedRow(LIVABLE_SHARE).max).toBe(1.0);
    expect(seedRow(LIVABLE_SHARE).min).toBeLessThan(1.0);
    expect(seedRow(SUITE_SHARE).max).toBeLessThanOrEqual(1);
  });

  it('the migration rows carry the seed names, values and bounds in their text', () => {
    const rows = upRows();
    for (const name of NAMES) {
      const seed = seedRow(name);
      const row = rows.find((r) => r.name === name);
      expect(row, name).toBeTruthy();
      expect(row!.value, name).toBe(seed.default);
      expect(row!.description, name).toContain(`bounds ${seed.min}..${seed.max}`);
    }
  });

  it('no setting is named reno_assumed_storeys in the seed', () => {
    expect(Object.keys(readJson(SEED)).filter((k) => k.includes('reno_assumed_storeys'))).toEqual([]);
  });
});

describe('INC6-B (3): the descriptor declares both names and the Admin Control Panel carries them', () => {
  it.each(NAMES)('%s is declared bounded, on_invalid fail', (name) => {
    const decl = declared().find((d) => d.name === name);
    expect(decl, name).toBeTruthy();
    const seed = seedRow(name);
    expect([decl!.min, decl!.max, decl!.on_invalid]).toEqual([seed.min, seed.max, 'fail']);
  });

  it('the generated groups file carries both keys (generated: presence only)', () => {
    const keys = groupKeys();
    for (const name of NAMES) expect(keys, name).toContain(name);
  });
});

describe('INC6-B (4): neither renovation name is retired, and renovation.js reads no retired name', () => {
  it('the descriptor retired list holds neither name', () => {
    const retired = retiredNames();
    for (const name of NAMES) expect(retired, name).not.toContain(name);
  });

  it('renovation.js names no retired engine setting', () => {
    const code = stripComments(readText(MODULE));
    for (const word of ['existing_confidence_min', 'basement_livable_share', 'unit_min_interior_sqm']) {
      const bare = word === 'basement_livable_share' ? /(?<!reno_)basement_livable_share/ : new RegExp(word);
      expect(bare.test(code), word).toBe(false);
    }
  });
});

describe('INC6-B (5): renovation.js takes its numbers only from the settings argument', () => {
  it('exports renovationResults and holds no numeric literal 0.85, 0.5, 30 or 12.2 outside comments', () => {
    const code = stripComments(readText(MODULE));
    expect(code).toContain('renovationResults');
    for (const literal of ['0.85', '0.5', '30', '12.2']) {
      expect(new RegExp(`(^|[^\\d.])${literal.replace('.', '\\.')}(?!\\d)`).test(code), literal).toBe(false);
    }
  });

  it('reads each of its settings through the argument name', () => {
    const code = stripComments(readText(MODULE));
    for (const key of ['houseplex_circulation_share', 'houseplex_unit_min_net_m2', SUITE_SHARE, LIVABLE_SHARE]) {
      expect(code, key).toContain(key);
    }
    expect(code).toMatch(/\bsettings\b/);
  });
});
