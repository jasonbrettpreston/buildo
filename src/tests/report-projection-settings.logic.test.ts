// SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.8 (every number an admin surface uses is a registered logic variable; unit constants and definitional windows are pinned, min = max);
//            docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.44 (the conversion factor is content/settings, never code; operator 2026-11-14, MORNING-DECISIONS.md:241);
//            ONE-13 a (MORNING-DECISIONS.md:738: lots under 50 m2 or over 5,000 m2 show Not yet evaluated).
//
// FIX.PROJ (task-372; D2 and D9 of the BL-GROUND verdicts): the report projection reads the square-feet factor and the lot-size window from the
// registered, pinned logic variables, never from a number typed in code. Tests written FIRST (red before the readers exist).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import seed from '../../scripts/seeds/logic_variables.json';
import { pinnedSetting } from '@/lib/report-projection/pinned-settings';
import { SQFT_PER_M2 } from '@/lib/report-projection/format';
import { LOT_SIZE_PLAUSIBLE_M2 } from '@/lib/report-projection/project';

const ROOT = path.resolve(__dirname, '..', '..');
const src = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p: string): string => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
type Row = { default: number; min: number; max: number; type: string; admin?: { group?: string } };
const SEED = seed as unknown as Record<string, Row>;
const FACTOR_KEY = 'parcels_sqm_to_sqft';
const MIN_KEY = 'maxbld_report_lot_size_implausible_min_sqm';
const MAX_KEY = 'maxbld_report_lot_size_implausible_max_sqm';

describe('D2 the square-feet factor is the registered pinned variable', () => {
  it('format.ts types no factor and names the variable', () => {
    expect(code('src/lib/report-projection/format.ts')).not.toMatch(/10\.7639/);
    expect(code('src/lib/report-projection/format.ts')).toContain(FACTOR_KEY);
  });
  it('the exported factor is the pinned seed value (10.7639, unchanged)', () => {
    expect(SEED[FACTOR_KEY]).toMatchObject({ default: 10.7639, min: 10.7639, max: 10.7639 });
    expect(SQFT_PER_M2).toBe(SEED[FACTOR_KEY]?.default);
  });
});

describe('D9 the lot-size window is two registered pinned variables', () => {
  it('project.ts types no window and names both variables', () => {
    const text = code('src/lib/report-projection/project.ts');
    expect(text).not.toMatch(/min:\s*50\b|max:\s*5000\b/);
    expect(text).toContain(MIN_KEY);
    expect(text).toContain(MAX_KEY);
  });
  it('both are in the seed, pinned (min = max = default), numbers, in the lot size group, with the ruled values 50 and 5000', () => {
    for (const [key, value] of [[MIN_KEY, 50], [MAX_KEY, 5000]] as const) {
      expect(SEED[key], key).toMatchObject({ type: 'number', default: value, min: value, max: value });
      expect(SEED[key]?.admin?.group, key).toBe('MaxBLD Lot Size');
    }
  });
  it('the exported window is the seed values, unchanged', () => {
    expect(LOT_SIZE_PLAUSIBLE_M2).toEqual({ min: 50, max: 5000 });
  });
});

describe('the pinned reader fails loudly and by name', () => {
  const row = (over: Record<string, unknown> = {}) => ({ k: { default: 2, min: 2, max: 2, type: 'number', ...over } });
  it('returns the value of a pinned number', () => {
    expect(pinnedSetting(row(), 'k')).toBe(2);
  });
  it('names the variable when the row is absent', () => {
    expect(() => pinnedSetting({}, 'k')).toThrow(/logic variable k is not in the seed/);
  });
  it('names the variable when min is not max, or the default is not the pinned value', () => {
    expect(() => pinnedSetting(row({ max: 3 }), 'k')).toThrow(/logic variable k is not pinned/);
    expect(() => pinnedSetting(row({ default: 3 }), 'k')).toThrow(/logic variable k is not pinned/);
  });
  it('refuses a row whose type is not number', () => {
    expect(() => pinnedSetting(row({ type: 'string' }), 'k')).toThrow(/logic variable k is not pinned/);
  });
  it('refuses a value that is not a finite number', () => {
    expect(() => pinnedSetting(row({ default: '2', min: '2', max: '2' }), 'k')).toThrow(/logic variable k is not pinned/);
    expect(() => pinnedSetting(row({ default: Number.NaN, min: Number.NaN, max: Number.NaN }), 'k')).toThrow(/logic variable k is not pinned/);
  });
});
