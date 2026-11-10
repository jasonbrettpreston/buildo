// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-32 (`contract` is a binding kind: a displayed value may bind to a field
//            of a declared CONTRACT descriptor's response projection; the member must exist in that descriptor; any other value fails),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.1 (the binding set), docs/specs/02-web-admin/128_surface_standard_policy.md rule 20.
//
// MF-37 · T6, the FE-32 lock. Cases:
//   (a) binding-sources.json names `contract` (register FE-32, resolver contract_projection, a non-null file); bindings.json ref_kinds has it;
//   (b) the golden side (SV-SBIND): `{"contract": "<contract_id>.<field>"}` resolves to inputs.field_whitelist; an unknown field, an unknown
//       contract and a malformed ref are RED; the real admin_media goldens carry contract refs and SV-SBIND is clean on them;
//   (c) the REPORT side (RS-1): a REPORT field bound `contract:` is refused until a ruling widens it;
//   (d) binding standard (MF-40 plan delta 1, option C, operator 2026-11-10; section 8 folds 1, 7, 8): the ref is a PATH
//       `<contract_id>.<name|index>...` (names on the whitelist, as sent, camelCase kept; an index only after a name; checked by name only); the
//       second segment `errors` is reserved for `<contract_id>.errors.<class>.<field>` (field in that class's `fields`). The two-part form and
//       its messages are unchanged. RED: index first, index after index, a bad segment, an unknown name in a path, the errors grammar.
// Pure over committed files and in-memory copies. No DB, no network.
import { parseRegisterRows } from '../../../scripts/analysis/mcbylaws/cite-parse.mjs';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { contractRefProblems, descArm, loadContext, propsProblems, sbindArm } from '../../../scripts/surfaces/screen-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON and .mjs module surface
const ROOT = process.cwd();
const rj = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const RS: Json = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/report-schema.mjs')).href);

describe('FE-32 (a) the contract kind is declared on both sides', () => {
  it('binding-sources.json: contract, register FE-32, resolver contract_projection, file set; bindings.json ref_kinds has contract', () => {
    const c = rj('scripts/surfaces/_schema/binding-sources.json').sources.contract;
    expect([c.register, c.resolver, typeof c.file, c.file === null]).toEqual(['FE-32', 'contract_projection', 'string', false]);
    expect(rj('scripts/surfaces/_schema/bindings.json').ref_kinds).toEqual(['content', 'contract']);
  });
});

describe('FE-32 (b) the golden side (SV-SBIND)', () => {
  it('the real tree: contract_admin_media_list.alt resolves; the admin_media goldens carry contract refs and SV-SBIND is clean', async () => {
    const ctx = await loadContext(ROOT);
    expect(contractRefProblems('contract_admin_media_list.alt', '/props', ctx.contracts)).toEqual([]);
    const golden = fs.readFileSync(path.join(ROOT, 'src/tests/fixtures/surfaces/admin_media/hit.web.json'), 'utf8');
    const refs = golden.match(/"contract": "contract_admin_media_list\.[a-z_]+"/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    expect(sbindArm(ctx).findings).toEqual([]);
  });
  it('RED: an unknown field, an unknown contract, a malformed ref, and no contract set at all', async () => {
    const ctx = await loadContext(ROOT);
    expect(contractRefProblems('contract_admin_media_list.no_such', '/props/x', ctx.contracts)).toEqual(['unknown contract field contract_admin_media_list.no_such at /props/x']);
    expect(contractRefProblems('contract_no_such.alt', '/props/x', ctx.contracts)).toEqual(['unknown contract contract_no_such at /props/x']);
    expect(contractRefProblems('alt', '/props/x', ctx.contracts)).toEqual(['contract ref alt is not <contract_id>.<field> at /props/x']);
    expect(contractRefProblems('contract_admin_media_list.alt', '/props/x', undefined)).toEqual(['unknown contract contract_admin_media_list at /props/x']);
  });
  it('RED (walk): a planted golden value with an unknown field is reported where it sits; a known one is not', async () => {
    const ctx = await loadContext(ROOT);
    const walk = { kinds: ['content', 'contract'], nonDisplay: ctx.bindings.non_display_keys, content: {}, used: new Set(), contracts: ctx.contracts };
    expect(propsProblems({ component: 'Text', children: [{ contract: 'contract_admin_media_list.alt' }] }, '/props', walk)).toEqual([]);
    expect(propsProblems({ component: 'Text', children: [{ contract: 'contract_admin_media_list.secret' }] }, '/props', walk))
      .toEqual(['unknown contract field contract_admin_media_list.secret at /props/children/0']);
  });
});

describe('FE-32 (d) the binding standard: contract paths and error details', () => {
  // An in-memory contract set: the live media list contract plus one with an array, a camelCase name and a 429 class with a declared field.
  const contracts = async (): Promise<Map<string, Json>> => {
    const m = new Map((await loadContext(ROOT)).contracts as Map<string, Json>);
    m.set('contract_fx', { kind: 'CONTRACT', identity: { id: 'contract_fx' }, inputs: { field_whitelist: ['candidates', 'address', 'parcelId'] },
      errors: { classes: [{ class: '429', ui: 'x', fields: ['retryAfterSeconds'] }, { class: '500', ui: 'y' }] } });
    return m;
  };
  it('the two-part form stays valid; a path of names and indexes resolves; camelCase is used as sent', async () => {
    const c = await contracts();
    for (const ref of ['contract_admin_media_list.alt', 'contract_fx.candidates', 'contract_fx.candidates.0.address', 'contract_fx.candidates.12.parcelId'])
      expect([ref, contractRefProblems(ref, '/props/x', c)]).toEqual([ref, []]);
  });
  it('an error detail resolves through its class\'s fields', async () => {
    expect(contractRefProblems('contract_fx.errors.429.retryAfterSeconds', '/props/x', await contracts())).toEqual([]);
  });
  it('RED: an index first, an index after an index, a bad segment, an unknown name inside a path', async () => {
    const c = await contracts();
    expect(contractRefProblems('contract_fx.0.address', '/props/x', c)).toEqual(['contract ref contract_fx.0.address: an index must follow a name at /props/x']);
    expect(contractRefProblems('contract_fx.candidates.0.1', '/props/x', c)).toEqual(['contract ref contract_fx.candidates.0.1: an index must follow a name at /props/x']);
    expect(contractRefProblems('contract_fx.candidates[0].address', '/props/x', c)).toEqual(['contract ref contract_fx.candidates[0].address is not <contract_id>.<field> at /props/x']);
    expect(contractRefProblems('contract_fx.candidates.', '/props/x', c)).toEqual(['contract ref contract_fx.candidates. is not <contract_id>.<field> at /props/x']);
    expect(contractRefProblems('contract_fx.candidates.0.lotArea', '/props/x', c)).toEqual(['unknown contract field contract_fx.candidates.0.lotArea at /props/x']);
  });
  it('RED: the errors grammar (wrong length, unknown class, a field the class does not declare, a class with no fields)', async () => {
    const c = await contracts();
    expect(contractRefProblems('contract_fx.errors.429', '/props/x', c)).toEqual(['contract ref contract_fx.errors.429 is not <contract_id>.errors.<class>.<field> at /props/x']);
    expect(contractRefProblems('contract_fx.errors.403.retryAfterSeconds', '/props/x', c)).toEqual(['unknown error class 403 of contract_fx at /props/x']);
    expect(contractRefProblems('contract_fx.errors.429.remaining', '/props/x', c)).toEqual(['unknown error field contract_fx.errors.429.remaining at /props/x']);
    expect(contractRefProblems('contract_fx.errors.500.code', '/props/x', c)).toEqual(['unknown error field contract_fx.errors.500.code at /props/x']);
  });
  it('RED (walk): a path ref planted in golden props is judged where it sits', async () => {
    const ctx = await loadContext(ROOT);
    const walk = { kinds: ['content', 'contract'], nonDisplay: ctx.bindings.non_display_keys, content: {}, used: new Set(), contracts: await contracts() };
    expect(propsProblems({ component: 'Text', children: [{ contract: 'contract_fx.candidates.0.address' }] }, '/props', walk)).toEqual([]);
    expect(propsProblems({ component: 'Text', children: [{ contract: 'contract_fx.0.address' }] }, '/props', walk))
      .toEqual(['contract ref contract_fx.0.address: an index must follow a name at /props/children/0']);
  });
  it('the real tree: no CONTRACT field whitelist names the reserved segment errors (SV-DESC)', async () => {
    const ctx = await loadContext(ROOT);
    expect(descArm(ctx).findings.filter((f: string) => f.includes('reserved segment'))).toEqual([]);
    const planted = { ...ctx, contracts: new Map([...ctx.contracts, ['contract_fx', { inputs: { field_whitelist: ['errors'] } }]]) };
    expect(descArm(planted).findings).toContain('SV-DESC contract_fx: field_whitelist names the reserved segment errors');
  });
});

describe('FE-32 (c) the REPORT side (RS-1): contract is not ruled for REPORT fields', () => {
  it('the committed declaration uses no contract source and RS-1 is green', () => {
    const inp = structuredClone(RS.loadInputs(ROOT));
    const sources = inp.decl.sections.flatMap((s: Json) => s.fields).map((f: Json) => String(f.source).split(':')[0]);
    expect(sources).not.toContain('contract');
    expect(RS.evaluate(inp).gates.find((g: Json) => g.id === 'RS-1').failing).toEqual([]);
  });
  it('RED: a REPORT field rebound to contract:contract_admin_media_list.alt fails RS-1', () => {
    const inp = structuredClone(RS.loadInputs(ROOT));
    const f = inp.decl.sections.flatMap((s: Json) => s.fields).find((x: Json) => String(x.source).startsWith('content:'));
    f.source = 'contract:contract_admin_media_list.alt';
    const g = RS.evaluate(inp).gates.find((x: Json) => x.id === 'RS-1');
    expect(g.state).toBe('FAIL');
    expect(g.failing.join('\n')).toContain('the contract binding kind is not ruled for REPORT fields');
  });
});

describe('FE-32 flip (operator "a, 1-3 approved", 2026-11-09; the same-commit lock path, D-19 precedent)', () => {
  it('Spec 135 FE-32 reads RULED and names exactly this lock', () => {
    const rows = parseRegisterRows(fs.readFileSync(path.join(process.cwd(), 'docs/specs/02-web-admin/135_mcfrontend_decisions_register.md'), 'utf8')) as Map<string, { status: string; locks?: string[] }>;
    expect(rows.get('FE-32')?.status).toBe('RULED');
    expect(rows.get('FE-32')?.locks).toEqual(['src/tests/surfaces/contract-binding.logic.test.ts']);
  });
});
