// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md P4 (all tunables are data; zero thresholds in src/);
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 3 (every debounce, page size, stale time and rate limit is declared, with the SEARCH debounce_ms as the pattern);
//            docs/specs/01-pipeline/132_step_standard_handbook.md core.8; docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.44 (the conversion factor is content/settings, never code).
//
// FIX.TUNE (task-378; grounder D14, D15 and the length factor owed from task-372): written FIRST, red before the fixes.
//   D14  the phone's Continue wait (60 s) and entitlement stale time (0 s) are declared in the surface config and read from the generated slice; values unchanged.
//   D15  two descriptor entries corrected (the request parameter `semi` is not a response field; the entitlement call site is the entitlement hook).
//   LEN  the metre-to-foot factor is the registered pinned variable parcels_m_to_ft, read by pinnedSetting, in both geometry modules.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import seed from '../../scripts/seeds/logic_variables.json';
import { M_TO_FT } from '@/lib/parcels/geometry';
import { formatHeight } from '@/lib/massing/geometry';
import { sliceNumber } from '../../mobile/src/lib/sliceConfig';

const ROOT = path.resolve(__dirname, '..', '..');
const src = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (p: string): any => JSON.parse(src(p));
const code = (p: string): string => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SEED = seed as unknown as Record<string, { default: number; min: number; max: number; type: string }>;

const SEMI = 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json';
const SEARCH = 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json';
const SEMI_SLICE = 'mobile/src/generated/surfaces/mobile_parcel_semi_question.json';
const SEARCH_SLICE = 'mobile/src/generated/surfaces/mobile_parcel_search.json';
const LOOKUP_CONTRACT = 'scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json';
const ENTITLEMENT_CONTRACT = 'scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json';
const HOOK = 'mobile/src/hooks/useParcelLookup.ts';
const KEYS = ['continue_wait_ms', 'entitlement_stale_ms', 'lookup_retry_max', 'lookup_stale_ms'];

describe('D14 the phone tunables are declared in the surface config, values unchanged', () => {
  it('the semi surface declares config.continue_wait_ms = 60000 and the generated slice carries it', () => {
    expect(json(SEMI).config.continue_wait_ms).toBe(60000);
    expect(json(SEMI_SLICE).config.continue_wait_ms).toBe(60000);
  });
  it('the search surface declares config.entitlement_stale_ms = 0, lookup_retry_max = 3, lookup_stale_ms = 60000 (the values the code carried) and the generated slice carries them', () => {
    for (const file of [SEARCH, SEARCH_SLICE]) {
      expect(json(file).config, file).toMatchObject({ entitlement_stale_ms: 0, lookup_retry_max: 3, lookup_stale_ms: 60000 });
    }
  });
  it('the schema and the generated type know both keys, and the emitter copies both', () => {
    const props = json('scripts/surfaces/_schema/surface.schema.json').properties.config.properties;
    for (const key of KEYS) {
      expect(Object.keys(props), key).toContain(key);
      expect(src('src/lib/surfaces/generated/surface-descriptor.d.ts'), key).toContain(`${key}?:`);
      expect(src('scripts/surfaces/emit-mobile-surfaces.mjs').match(/PAGE_SETTINGS = \{([^}]*)\}/)?.[1], key).toContain(`${key}: 'maxbld_page_${key}'`);
    }
  });
  it('semiQuestion.ts types no wait number and reads the slice; the entitlement hook types no stale number and reads the slice', () => {
    expect(code('mobile/src/lib/semiQuestion.ts')).not.toMatch(/60_?000/);
    expect(code('mobile/src/lib/semiQuestion.ts')).toContain('continue_wait_ms');
    const hook = code(HOOK);
    expect(hook).not.toMatch(/staleTime:\s*\d/);
    expect(hook).not.toMatch(/failureCount\s*<\s*\d/);
    expect(hook).not.toMatch(/length\s*>=\s*\d/);
    expect(hook).toMatch(/sliceNumber\(searchSlice, 'min_query_len'\)/);
    for (const key of ['entitlement_stale_ms', 'lookup_retry_max', 'lookup_stale_ms']) expect(hook, key).toMatch(new RegExp(`sliceNumber\\(searchSlice, '${key}'\\)`));
  });
  it('both phone read sites use the one reader', () => {
    expect(code('mobile/src/lib/semiQuestion.ts')).toMatch(/sliceNumber\(slice, 'continue_wait_ms'\)/);
  });
  it('D: the reader throws by key name when the slice value is missing, not a number or not finite, and returns a finite number as is', () => {
    const sl = (config: Record<string, unknown>) => ({ config, bounds: { k: { min: 0, max: 1e9, on_invalid: 'fail' }, continue_wait_ms: { min: 0, max: 1e9, on_invalid: 'fail' } } }); // FIX.CONFIG-BOUNDS (task-395): the reader takes the slice
    expect(sliceNumber(sl({ k: 60000 }), 'k')).toBe(60000);
    expect(sliceNumber(sl({ k: 0 }), 'k')).toBe(0);
    for (const bad of [undefined, null, '60', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => sliceNumber(sl({ k: bad }), 'k'), String(bad)).toThrow(/"k"/);
    }
    expect(() => sliceNumber(sl({}), 'continue_wait_ms')).toThrow(/continue_wait_ms/);
  });
});

describe('D15 the two descriptor entries are corrected', () => {
  it('semi is a request parameter (the query schema), not a response field: it is out of the lookup contract field_whitelist and the rest of the list is unchanged (count and both ends)', () => {
    expect(src('src/app/api/parcels/lookup/types.ts')).toMatch(/ConsumerParcelLookupQuerySchema[\s\S]{0,900}semi: z\.literal\('answered'\)/);
    const whitelist: string[] = json(LOOKUP_CONTRACT).inputs.field_whitelist;
    expect(whitelist).not.toContain('semi');
    expect(whitelist.length).toBe(80); // 81 entries before FIX.TUNE, the one removed is semi (the last)
    expect(whitelist.slice(0, 4)).toEqual(['match', 'candidates', 'warnings', 'parcel']);
    expect(whitelist.slice(-3)).toEqual(['detected', 'basis', 'unsure']);
  });
  it('the entitlement contract names the line of useParcelEntitlement in the hook as its call site (found by reading the hook, not a typed number)', () => {
    const line = src(HOOK).split('\n').findIndex((l) => l.startsWith('export function useParcelEntitlement(')) + 1;
    expect(line).toBeGreaterThan(0);
    const d = json(ENTITLEMENT_CONTRACT);
    expect(d.sharing.surfaces).toEqual([`${HOOK}:${line}`]);
    expect(d.sharing.evidence).toContain(`${HOOK}:${line}`);
    expect(JSON.stringify(d.sharing)).not.toContain(`${HOOK}:96`);
  });
});

describe('LEN the metre-to-foot factor is the registered pinned variable (fe.44, core.8)', () => {
  it('parcels_m_to_ft is pinned in the seed at 3.28084; parcels/geometry.ts reads it and neither geometry module types the factor', () => {
    expect(SEED.parcels_m_to_ft).toMatchObject({ type: 'number', default: 3.28084, min: 3.28084, max: 3.28084 });
    expect(code('src/lib/parcels/geometry.ts')).not.toMatch(/3\.28084/);
    expect(code('src/lib/parcels/geometry.ts')).toContain('parcels_m_to_ft');
    expect(code('src/lib/massing/geometry.ts')).not.toMatch(/3\.28084/);
  });
  it('values unchanged: the exported factor and the formatted height (the factor is passed in)', () => {
    expect(M_TO_FT).toBe(3.28084);
    expect(formatHeight(10, M_TO_FT)).toBe('10.0 m (32.8 ft)');
    expect(formatHeight(null, M_TO_FT)).toBe('N/A');
    // an older payload without the served factor must never print NaN ft: the existing N/A form
    for (const bad of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatHeight(9.5, bad as unknown as number), String(bad)).toBe('N/A');
  });
  it('B: massing/geometry.ts reads no seed; the permits route serves the registered factor; the display formats with the served factor', () => {
    expect(code('src/lib/massing/geometry.ts')).not.toMatch(/logic_variables|pinned-settings|pinnedSetting/);
    expect(code('src/app/api/permits/[id]/route.ts')).toMatch(/feet_per_metre:\s*M_TO_FT/);
    expect(code('src/components/permits/BuildingMassing.tsx')).toContain('massing.feet_per_metre');
  });
  it('B: no module the client component BuildingMassing imports (through relative and @/ imports, type-only ones skipped) imports the seed JSON', () => {
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith('@/') ? path.join('src', spec.slice(2)) : spec.startsWith('.') ? path.join(path.dirname(from), spec) : null;
      if (base === null) return null;
      return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile()) ?? null;
    };
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const m of src(file).matchAll(/^\s*(?:import|export)\s(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)) {
        const spec = m[1] ?? m[2] ?? '';
        expect(spec, `${file} imports the seed`).not.toMatch(/logic_variables\.json$/);
        const next = resolve(file, spec);
        if (next) walk(next);
      }
    };
    walk('src/components/permits/BuildingMassing.tsx');
    expect(seen.size).toBeGreaterThan(1);
  });
});
