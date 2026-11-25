// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (props goldens regenerated, never hand-edited; one binding per archetype),
//            §11b.7 A2 row and the MF-45 dated note 2026-11-11 (the Search page shows the reports left; the server computes every count),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths in the UI), FE-07 (web and mobile carry the same refs),
//            FE-18 and FE-32 (every displayed value is a field of a declared CONTRACT descriptor).
//
// SRCH.A6 (task-320, Increment 1·B; McFrontend follow-up on MF-35; operator RR-0307, MORNING-DECISIONS.md:1182, "it appears we will need it so we
// should build it") · the reports-left line under the search box, "6 of 10 reports left until 9 Dec 2026" (small-pages-v8 search.html:267), bound to the
// EXISTING entitlement read GET /api/parcels/entitlement (reportsLeft, reportsLimit, resetsOn). Nothing is counted here: the meter is SRCH.METER
// (task-334); this only SHOWS the served count. Cases:
//   (a) the copy is the v8 template, one content key, in the content file and the generated mobile slice;
//   (b) the new state's two goldens carry ONE node with exactly the three bound values (three contract refs, among them resetsOnDisplay), no raw text;
//   (c) a situation with no entitlement data (the ten committed states) carries no such node: an undrawn state renders no line;
//   (d) the pure rules: formatResetDate writes the served date and nothing else; reportsLeftShown is false unless all three served fields are present;
//   (e) the declarations: surface descriptor, contract descriptor and the census mirror agree; the state is declared; nothing computed on the client;
//   (f) the count does not survive an app restart (the query client persists every key but one exclusion).
// Root test: reads committed files as text and imports only pure modules; no DB, no network, no React Native.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as core from '../../../mobile/src/lib/parcelSearchCore';
const { reportsLeftShown } = core;
import { shouldDehydrateQueryFn } from '../../../mobile/src/lib/persistFilter';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const rt = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SURF = 'scripts/surfaces/parcel_product/F01/surfaces';
const GOLD = 'src/tests/fixtures/surfaces/mobile_parcel_search';
const CONTRACT_DESCRIPTOR = 'scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json';
const KEY = 'search.reports_left';
const V8_COPY = '{left} of {allowance} reports left until {reset}';
const TESTID = 'parcel-search-reports-left';

/** Every node (depth first) of a props tree. */
const nodesOf = (n: Json): Json[] => [n, ...((n.children ?? []) as Json[]).filter((c) => c && typeof c === 'object' && 'component' in c).flatMap(nodesOf)];
const lines = (g: Json): Json[] => nodesOf(g.props).filter((n) => n.props?.testID === TESTID);
/** Every binding ref under `v` as "<kind>:<value>". */
const refsOf = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.flatMap(refsOf);
  if (v === null || typeof v !== 'object') return [];
  const o = v as Json;
  const keys = Object.keys(o);
  if (keys.length === 1 && ['content', 'contract', 'derived'].includes(keys[0] as string)) return [`${keys[0]}:${String(o[keys[0] as string])}`];
  return Object.values(o).flatMap(refsOf);
};
const goldens = (target: string): Json[] => fs.readdirSync(path.join(ROOT, GOLD)).filter((f) => f.endsWith(`.${target}.json`)).sort().map((f) => rj(`${GOLD}/${f}`));

describe('A.6 (a): the copy is the v8 template, one key, no number typed anywhere', () => {
  it('the content file and the generated mobile slice carry search.reportsLeft exactly as small-pages-v8 content.json:104 (its key search.reportsLeft is snake-cased by the content-key pattern ^[a-z0-9_]+(\.[a-z0-9_]+)+$, surface.schema.json)', () => {
    expect(rj(`${SURF}/mobile_parcel_search.content.json`)[KEY]).toBe(V8_COPY);
    expect(rj('mobile/src/generated/surfaces/mobile_parcel_search.json').content[KEY]).toBe(V8_COPY);
  });
});

describe('A.6 (b): the new state binds exactly the three served values', () => {
  it('both targets declare the state reports_left and carry one reports-left node with the template and its three var refs', () => {
    const d = rj(`${SURF}/mobile_parcel_search.descriptor.json`);
    expect(d.states).toContainEqual({ name: 'hit', golden: 'reports_left' });
    for (const target of ['mobile', 'web']) {
      const g = rj(`${GOLD}/reports_left.${target}.json`);
      expect(g.state).toBe('hit');
      expect(g.situation).toBe('reports_left');
      const [line, ...more] = lines(g);
      expect(more).toEqual([]);
      expect(line).toBeDefined();
      const tpl = (line as Json).children[0] as Json;
      expect(tpl.text).toEqual({ content: KEY });
      expect(tpl.vars).toEqual({
        left: { contract: 'contract_parcels_entitlement.reportsLeft' },
        allowance: { contract: 'contract_parcels_entitlement.reportsLimit' },
        reset: { contract: 'contract_parcels_entitlement.resetsOnDisplay' },
      });
      // the value refs of the node are exactly these three plus the content key: no other field, no computed value
      expect([...new Set(refsOf(line))].sort()).toEqual([
        `content:${KEY}`,
        'contract:contract_parcels_entitlement.reportsLeft',
        'contract:contract_parcels_entitlement.reportsLimit',
        'contract:contract_parcels_entitlement.resetsOnDisplay',
      ]);
      expect(JSON.stringify(line)).not.toMatch(/reportsUsed|reportsLimitReached/);
    }
  });
  it('the line sits under the box: right after the pill, before the legal line and the chips', () => {
    const order = (g: Json): string[] => nodesOf(g.props).map((n) => n.props?.testID).filter((t): t is string => typeof t === 'string');
    for (const target of ['mobile', 'web']) {
      const o = order(rj(`${GOLD}/reports_left.${target}.json`));
      expect(o.indexOf(TESTID)).toBeGreaterThan(o.indexOf('parcel-search-input'));
      if (target === 'mobile') expect(o.indexOf(TESTID)).toBeLessThan(o.indexOf('parcel-search-legal'));
    }
  });
});

describe('A.6 (c): an undrawn state renders no line', () => {
  it('the ten committed states (no entitlement data in their situations) carry no reports-left node, on either target', () => {
    for (const target of ['mobile', 'web']) {
      const others = goldens(target).filter((g) => g.state !== 'hit');
      expect(others).toHaveLength(10);
      for (const g of others) expect(lines(g), `${g.state}.${target}`).toEqual([]);
    }
  });
  it('the situation of the new state is the idle page with the served values, and no other committed situation carries entitlement data', () => {
    const s = rj('mobile/__tests__/fixtures/parcelSearch.situations.json');
    expect(s.reports_left.entitlement).toEqual({ reportsLeft: 6, reportsLimit: 10, resetsOnDisplay: '9 Dec 2026' });
    for (const [name, v] of Object.entries(s)) if (name !== 'reports_left' && name !== '$comment') expect((v as Json).entitlement, name).toBeUndefined();
  });
});

describe('A.6 (d): the pure rules', () => {
  it('the device has no date formatter: formatResetDate is gone and the line binds the served label', () => {
    expect((core as Json).formatResetDate).toBeUndefined();
  });
  it('reportsLeftShown: all three served fields present shows the line, a served 0 included; any null, or no entitlement, shows nothing', () => {
    const full = { reportsLeft: 6, reportsLimit: 10, resetsOnDisplay: '9 Dec 2026' };
    expect(reportsLeftShown(full)).toBe(true);
    expect(reportsLeftShown({ ...full, reportsLeft: 0 })).toBe(true);
    expect(reportsLeftShown({ ...full, reportsLeft: null })).toBe(false);
    expect(reportsLeftShown({ ...full, reportsLimit: null })).toBe(false);
    expect(reportsLeftShown({ ...full, resetsOnDisplay: null })).toBe(false);
    expect(reportsLeftShown({ reportsLeft: null, reportsLimit: null, resetsOnDisplay: null })).toBe(false);
    expect(reportsLeftShown(null)).toBe(false);
    expect(reportsLeftShown(undefined)).toBe(false);
    expect(reportsLeftShown({ ...full, resetsOnDisplay: '' })).toBe(false);
  });
});

describe('A.6 (e): the declarations agree and nothing is computed', () => {
  it('the surface descriptor names the entitlement route as a contract it reads; the contract descriptor lists the three fields and names the one caller', () => {
    const s = rj(`${SURF}/mobile_parcel_search.descriptor.json`);
    expect(s.inputs.contract_ref).toEqual(['/api/parcels/lookup', '/api/parcels/entitlement']);
    const c = rj(CONTRACT_DESCRIPTOR);
    expect(c.inputs.field_whitelist).toEqual(expect.arrayContaining(['reportsLeft', 'reportsLimit', 'resetsOn', 'resetsOnDisplay']));
    // task-452 round 2 (dated 2026-11-24; prior text kept: a typed :162): the call site is read from the hook, as fix-tune.logic.test.ts D15 does, so a moved hook shows here at once.
    const hookLine = rt('mobile/src/hooks/useParcelLookup.ts').split('\n').findIndex((l) => l.startsWith('export function useParcelEntitlement(')) + 1;
    expect(hookLine).toBeGreaterThan(0);
    expect(c.sharing.surfaces).toEqual([`mobile/src/hooks/useParcelLookup.ts:${hookLine}`]);
    expect(c['x-draft'].consumers).toEqual(['mobile/src/hooks/useParcelLookup.ts']);
    expect(JSON.stringify(s.deviations)).not.toContain('reset_date');
  });
  it('the census mirror of the entitlement contract equals its descriptor (hand-kept mirror, kept in step)', () => {
    const census = Object.values(rj('scripts/surfaces/_schema/census/contracts.json')) as Json[];
    const entry = census.find((x) => x?.identity?.id === 'contract_parcels_entitlement');
    expect(entry).toEqual(rj(CONTRACT_DESCRIPTOR));
  });
  it('the bindings compute nothing: no reportsUsed, no arithmetic on the served numbers, in either binding module', () => {
    for (const f of ['mobile/src/components/surfaces/SearchBinding.tsx', 'src/components/surfaces/web/SearchBinding.tsx']) {
      const t = rt(f);
      expect(t, f).not.toMatch(/formatResetDate|reset_date/);
      expect(t, f).toContain('resetsOnDisplay');
      expect(t, f).not.toMatch(/reportsUsed|reportsLimitReached/);
      expect(t, f).not.toMatch(/reportsLimit\s*[-+*/]|[-+*/]\s*reportsLeft|reportsLeft\s*[-+*/]/);
    }
    // the mobile client mirrors the read with a plain object (versioning is additive_only) and checks the date as the server does
    const sch = rt('mobile/src/lib/schemas.ts');
    const at = sch.indexOf('ParcelToolEntitlementSchema');
    expect(at).toBeGreaterThan(-1);
    const decl = sch.slice(at, sch.indexOf(';', at));
    expect(decl).toMatch(/resetsOn: z\.string\(\)\.datetime\(\)\.nullable\(\)/);
    expect(decl).toMatch(/resetsOnDisplay: z\.string\(\)\.nullable\(\)/);
    expect(decl).not.toMatch(/\.strict\(\)/);
  });
  it('the app reads the entitlement through one hook, re-read when the search screen gains focus', () => {
    const hook = rt('mobile/src/hooks/useParcelLookup.ts');
    expect(hook).toMatch(/queryKey: \['parcel-entitlement'\]/);
    expect(hook).toMatch(/\/api\/parcels\/entitlement/);
    expect(rt('mobile/app/(app)/parcel-tool/index.tsx')).toMatch(/useFocusEffect/);
  });
});

describe('A.6 (f): the count is not kept across an app restart', () => {
  it('the persisted query client leaves the entitlement query out, and still keeps the others it kept before', () => {
    expect(shouldDehydrateQueryFn({ queryKey: ['parcel-entitlement'] })).toBe(false);
    expect(shouldDehydrateQueryFn({ queryKey: ['user-profile'] })).toBe(false);
    expect(shouldDehydrateQueryFn({ queryKey: ['lead-feed'] })).toBe(true);
    expect(shouldDehydrateQueryFn({ queryKey: ['parcel-search', 'x'] })).toBe(true);
  });
});
