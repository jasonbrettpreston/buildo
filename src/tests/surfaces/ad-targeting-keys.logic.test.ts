// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-22 (ads target only declared database keys; never user-entered facts without consent),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.10 (dated note 2026-11-09, MF-20), 11a.1 (the closed binding set),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 17, Rule 34, Rule 20.
//
// MF-20 · McFrontend queue · lane E-MF20b. THE FE-22 LOCK. The ad contract's `targeting_keys` is an ALLOW-LIST: a key is declared only when it resolves in the database,
// by this file's two resolvers: `parcels:<column>` = a column of the parcels table in the migrations; `catalogue_field:<property>` = a property the catalogue rows carry
// (the declared origin of the scenario key building_type x design_option). Anything else is RED: `user_input:*` and every other kind (a user-entered fact), any key not in the
// contract (a second home in ad_placements), a column that does not exist, and any income-derived key (operator 2026-11-09: no income until a human-rights review; the deny-list is
// by key name and by origin). A slot is a closed object: it carries no targeting or identity field. Each check is proven RED on a mutated copy of the real files and GREEN
// unmutated; an empty targeting list is GREEN. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { migrationColumns } from '../../../scripts/analysis/bylaw/maxbld-trace-lib.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const ROOT = process.cwd();
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const SD = 'scripts/surfaces/_schema';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const PARCEL_COLS = new Set<string>([...(migrationColumns(ROOT).get('parcels') ?? new Map()).keys()]);
const CATALOGUE_ROWS: Json[] = read('scripts/seeds/bylaw/layer3-catalogue.json').rows;
const INCOME = /income/i; // the deny-list: income-derived keys (median_household_income, avg_household_income, low_income_pct, ...)

interface Files { ad: Json; pres: Json; lists: Json; bindings: Json; tree: Json; decl: Json }
const real = (): Files => ({
  ad: read(`${SD}/ad-contract.json`), pres: read(`${SD}/report-presentation.json`), lists: read(`${SD}/report-v2-seed/row-presentation.json`),
  bindings: read(`${SD}/binding-sources.json`), tree: read(`${SD}/report-tree.schema.json`), decl: read(`${SD}/report-v2.decl.json`),
});

// The lock: every finding, one line each.
const findings = (f: Files): string[] => {
  const out: string[] = [];
  const keys: Json = f.ad.targeting_keys ?? {};
  for (const [k, origin] of Object.entries(keys) as Array<[string, string]>) {
    const [kind, member = ''] = String(origin).split(':');
    if (INCOME.test(k) || INCOME.test(member)) out.push(`income-derived key is denied: ${k} -> ${origin}`);
    if (kind === 'parcels') { if (!PARCEL_COLS.has(member)) out.push(`${k}: ${member} is not a parcels migration column`); }
    else if (kind === 'catalogue_field') { if (!CATALOGUE_ROWS.some((r) => member in r)) out.push(`${k}: no catalogue row carries ${member}`); }
    else out.push(`${k}: ${origin} is not a declared database key (only parcels and catalogue_field resolve; user_input and every other kind are refused)`);
  }
  const places: Json[] = f.pres.ad_placements?.placements ?? [];
  for (const p of places) for (const t of p.targeting ?? []) if (!(t in keys)) out.push(`${p.key}: targeting key ${t} is not in the ad contract (second-home drift)`);
  for (const t of f.pres.ad_placements?.targeting_from ?? []) if (!(t in keys)) out.push(`ad_placements.targeting_from: ${t} is not in the ad contract`);
  if (JSON.stringify([...(f.pres.ad_placements?.targeting_from ?? [])].sort()) !== JSON.stringify(Object.keys(keys).sort())) out.push('ad_placements.targeting_from differs from the contract keys');
  if (JSON.stringify(places.map((p) => p.key).sort()) !== JSON.stringify([...f.ad.slots].sort())) out.push('ad_placements keys differ from the contract slot ids');
  for (const p of places) if (p.max_slots !== 1) out.push(`${p.key}: max_slots is not 1`);
  if (JSON.stringify(Object.keys(f.ad.scenario_fields).sort()) !== JSON.stringify(Object.keys(f.lists).sort())) out.push('scenario_fields keys differ from row-presentation.json scenario keys');
  if ('catalogue_field' in f.bindings.sources) out.push('catalogue_field is not a binding source kind');
  const slot = f.tree.$defs?.slot;
  if (!slot || slot.additionalProperties !== false) out.push('the slot object is not closed (additionalProperties must be false)');
  const props = Object.keys(slot?.properties ?? {});
  for (const p of props) if (/target|identity|user|income|audience/i.test(p)) out.push(`the slot object carries a targeting or identity field: ${p}`);
  const decls: Json[] = f.decl.sections.flatMap((s: Json) => s.fields);
  for (const d of decls) if (String(d.source).startsWith('ad_slot:') && (d.provenance === 'user' || /user/.test(String(d.source)))) out.push(`${d.name}: an ad field is user-provenanced`);
  return out;
};
const withKey = (f: Files, k: string, origin: string): Files => { const g = clone(f); g.ad.targeting_keys[k] = origin; return g; };

describe('FE-22 ad targeting keys: GREEN on the committed files', () => {
  it('the real contract, presentation, schema and declaration have no finding', () => {
    expect(findings(real())).toEqual([]);
  });
  it('the contract declares the three ruled keys and the scenario key parts, resolved by the lock\'s own resolvers', () => {
    const f = real();
    expect(f.ad.targeting_keys).toEqual({ zone_class: 'parcels:zoning_class', building_type: 'catalogue_field:building_type', design_option: 'catalogue_field:design_option' });
    expect(PARCEL_COLS.has('zoning_class')).toBe(true);
    expect(CATALOGUE_ROWS.some((r) => 'building_type' in r) && CATALOGUE_ROWS.some((r) => 'design_option' in r)).toBe(true);
  });
  it('renovation_section targets nothing today (re-adding a key is a conscious edit)', () => {
    expect(real().pres.ad_placements.placements.find((p: Json) => p.key === 'renovation_section').targeting).toEqual([]);
  });
  it('the per-scenario slot targets only the scenario key parts (building_type, design_option)', () => {
    expect(real().pres.ad_placements.placements.find((p: Json) => p.key === 'scenario_card').targeting).toEqual(['building_type', 'design_option']);
  });
  it('an empty targeting list is GREEN (renovation_section targets nothing)', () => {
    const f = real();
    f.pres.ad_placements.placements.find((p: Json) => p.key === 'renovation_section').targeting = [];
    expect(findings(f)).toEqual([]);
  });
});

describe('FE-22 RED: each defect is caught on a mutated copy', () => {
  it('a slot targeting key that is not in the contract (second-home drift)', () => {
    const f = real();
    f.pres.ad_placements.placements[0].targeting.push('has_suite');
    expect(findings(f).join('\n')).toContain('has_suite is not in the ad contract');
  });
  it('a declared key mapped to user_input (a user-entered fact)', () => {
    expect(findings(withKey(real(), 'zone_class', 'user_input:lot_form_override')).join('\n')).toContain('user_input');
  });
  it('allow-list: any other kind is RED (content, ad_slot, external_embed, a made-up kind)', () => {
    for (const kind of ['content', 'ad_slot', 'external_embed', 'catalogue', 'made_up']) expect(findings(withKey(real(), 'zone_class', `${kind}:x`)).join('\n'), kind).toContain('not a declared database key');
  });
  it('a parcels column that does not exist; a catalogue property no row carries', () => {
    expect(findings(withKey(real(), 'zone_class', 'parcels:no_such_column')).join('\n')).toContain('not a parcels migration column');
    expect(findings(withKey(real(), 'building_type', 'catalogue_field:no_such_property')).join('\n')).toContain('no catalogue row carries');
  });
  it('income is denied by key name and by origin, even when the column exists', () => {
    expect(findings(withKey(real(), 'income_band', 'parcels:zoning_class')).join('\n')).toContain('income-derived key is denied');
    expect(findings(withKey(real(), 'zone_class', 'parcels:median_household_income')).join('\n')).toContain('income-derived key is denied');
    for (const k of ['median_household_income', 'avg_household_income', 'low_income_pct']) expect(findings(withKey(real(), k, 'catalogue_field:building_type')).join('\n'), k).toContain('denied');
  });
  it('scenario_fields drift from the scenario keys, in both directions', () => {
    const f = real();
    delete f.ad.scenario_fields[Object.keys(f.ad.scenario_fields)[0] as string];
    expect(findings(f).join('\n')).toContain('scenario_fields keys differ');
    const g = real();
    g.ad.scenario_fields['detached_house/extra'] = 'ad_scenario_extra';
    expect(findings(g).join('\n')).toContain('scenario_fields keys differ');
  });
  it('the slot object stays closed: an open slot, or a targeting/identity field on it, is RED', () => {
    const f = real();
    f.tree.$defs.slot.additionalProperties = true;
    expect(findings(f).join('\n')).toContain('not closed');
    const g = real();
    g.tree.$defs.slot.properties.targeting = { type: 'array' };
    expect(findings(g).join('\n')).toContain('carries a targeting or identity field');
    const h = real();
    h.tree.$defs.slot.properties.income_band = { type: 'string' };
    expect(findings(h).join('\n')).toContain('income_band');
  });
  it('a user-provenanced ad field, a placement with max_slots above 1, and catalogue_field promoted to a binding source kind are RED', () => {
    const f = real();
    (f.decl.sections.flatMap((s: Json) => s.fields).find((d: Json) => String(d.source).startsWith('ad_slot:')) as Json).provenance = 'user';
    expect(findings(f).join('\n')).toContain('user-provenanced');
    const g = real();
    g.pres.ad_placements.placements[0].max_slots = 2;
    expect(findings(g).join('\n')).toContain('max_slots is not 1');
    const h = real();
    h.bindings.sources.catalogue_field = { register: 'FE-22', file: null };
    expect(findings(h).join('\n')).toContain('not a binding source kind');
  });
  it('a placement or contract slot list that disagrees is RED', () => {
    const f = real();
    f.ad.slots.push('extra_slot');
    expect(findings(f).join('\n')).toContain('differ from the contract slot ids');
  });
});
