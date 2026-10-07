// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6.1 (external rows: one file, the seven EXT-* rows,
//            the separate `unverified` branch), §9 G-READ (external arm: "external rows complete, `verified_*` rows
//            carry citation + url + `source_sha256`, `unverified` rows make no substantive claim ... each kind
//            counted separately"), §6 `feeds` aspects (Spec 69 M-52), §7.5 rule 4 (provincial by-law-prevails); docs/specs/01-pipeline/69_mcbylaw_policy.md
//            M-27, M-28, M-29, M-54; docs/reports/mcbylaw-phase1-plan.md S12b, R-9, R-12
//
// S12b: the committed scripts/seeds/bylaw/external.json passes the G-READ external arm, and every reason code
// of that arm has one known-bad fixture plus its good twin. Offline: the only source re-checked from disk is a
// row whose url is a pinned by-law page (EXT-gov-1), whose sha and excerpt are checked against pages/.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const EXT = await load('scripts/analysis/bylaw/external.mjs');

const SEEDS = path.join(process.cwd(), 'scripts/seeds/bylaw');
const FILE = path.join(SEEDS, 'external.json');
const readDoc = (): Json => JSON.parse(fs.readFileSync(FILE, 'utf8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const SEVEN = ['EXT-gov-1', 'EXT-prov-1', 'EXT-risk-1', 'EXT-risk-2', 'EXT-risk-3', 'EXT-risk-4', 'EXT-risk-5'];
const codes = (r: Json): string[] => [...new Set((r.violations as string[]).map((v) => v.split(':')[0] ?? v))].sort();
const check = (doc: Json, opts: Json = {}): Json => EXT.checkExternal(doc, { seeds: SEEDS, ...opts });
const row = (doc: Json, id: string): Json => doc.entries.find((e: Json) => e.id === id);

/** An `unverified` row as Spec 68 §6.1 defines it: title, authority and "not evaluated — citation pending" only. */
function unverify(r: Json): void {
  Object.assign(r, {
    citation: null, url: null, source_sha256: null, excerpt: null, verified_on: null,
    explanation: 'not evaluated — citation pending', verification_status: 'unverified', additional_sources: [],
  });
}

describe('S12b — committed external.json', () => {
  it('module loads', () => expect(EXT.importError).toBeUndefined());

  it('exists and passes the G-READ external arm with zero violations', () => {
    const r = check(readDoc());
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
  });

  it('holds exactly the seven EXT-* rows of Spec 68 §6.1, and counts each kind separately', () => {
    const doc = readDoc();
    expect(doc.entries.map((e: Json) => e.id)).toEqual(SEVEN);
    expect(check(doc).counts).toEqual({
      governance_former_bylaw: 1, model_heuristic: 0, provincial_precedence: 1, ref: 0, risk_reference: 5,
    });
  });

  it('kinds and evaluated_by_us match the §6.1 table (heritage → Spec 61, ravine → Spec 59)', () => {
    const doc = readDoc();
    expect(row(doc, 'EXT-gov-1').kind).toBe('governance_former_bylaw');
    expect(row(doc, 'EXT-prov-1').kind).toBe('provincial_precedence');
    for (const id of SEVEN.slice(2)) expect(row(doc, id).kind).toBe('risk_reference');
    expect(row(doc, 'EXT-risk-4').evaluated_by_us).toBe('yes:61');
    expect(row(doc, 'EXT-risk-5').evaluated_by_us).toBe('yes:59');
    for (const id of SEVEN.slice(0, 5)) expect(row(doc, id).evaluated_by_us).toBe('no');
  });

  it('EXT-prov-1 precedence is active (Spec 69 M-54) and every other row is none', () => {
    const doc = readDoc();
    expect(row(doc, 'EXT-prov-1').precedence).toBe('active');
    for (const id of SEVEN.filter((x) => x !== 'EXT-prov-1')) {
      expect(row(doc, id).precedence).toBe('none');
      expect(row(doc, id).provincial_units).toEqual([]);
    }
  });

  it('EXT-prov-1 carries the three O. Reg. 462/24 standards with their scope as data', () => {
    const units = row(readDoc(), 'EXT-prov-1').provincial_units as Json[];
    const by = Object.fromEntries(units.map((u) => [u.target, u]));
    expect(Object.keys(by).sort()).toEqual(['fsi', 'lot_coverage_pct', 'separation_m']);
    expect([by.lot_coverage_pct.bound, by.lot_coverage_pct.value, by.lot_coverage_pct.unit, by.lot_coverage_pct.bylaw_prevails]).toEqual(['max', 45, 'pct', 'more_permissive']);
    expect([by.fsi.bound, by.fsi.value, by.fsi.bylaw_prevails, by.fsi.bylaw_prevails_citation]).toEqual(['max', 'unlimited', 'never', null]);
    expect([by.separation_m.bound, by.separation_m.value, by.separation_m.unit, by.separation_m.bylaw_prevails]).toEqual(['min', 4, 'm', 'more_permissive']);
    expect(by.separation_m.scope.applies_to).toBe('building_pair');
    expect(by.separation_m.scope.other_building_contains_unit).toBe(true);
    for (const u of units) {
      expect(u.scope.land).toBe('parcel_of_urban_residential_land');
      expect(u.scope.principal_building_types).toEqual(['detached_house', 'rowhouse', 'semi_detached_house']);
      // O. Reg. 299/19 s.1(2) paras 1-3
      expect(u.scope.unit_configurations).toEqual([
        { ancillary_units: [0, 1], house_units: [2] }, { ancillary_units: [0], house_units: [3] }, { ancillary_units: [1], house_units: [1, 2] },
      ]);
    }
    expect(by.lot_coverage_pct.verbatim).toBe('Up to 45 per cent of the surface of the parcel is permitted to be covered by buildings and structures.');
  });

  it('EXT-gov-1 is pinned to the adopted ch1_5 page: sha = manifest raw_sha256, excerpt in pages/ch1_5.txt', () => {
    const doc = readDoc();
    const manifest = JSON.parse(fs.readFileSync(path.join(SEEDS, 'manifest.json'), 'utf8'));
    const page = manifest.pages.find((p: Json) => p.key === 'ch1_5');
    expect(row(doc, 'EXT-gov-1').source_sha256).toBe(page.raw_sha256);
    expect(fs.readFileSync(path.join(SEEDS, 'pages/ch1_5.txt'), 'utf8')).toContain(row(doc, 'EXT-gov-1').excerpt);
  });

  it('is canonical: sorted keys, entries sorted by id, LF, one trailing newline', () => {
    const bytes = fs.readFileSync(FILE, 'utf8');
    expect(bytes.includes('\r')).toBe(false);
    expect(EXT.canonicalExternal(readDoc())).toBe(bytes);
  });
});

describe('S12b — G-READ external arm reason codes (known-bad + good twin)', () => {
  const good = (): Json => readDoc();

  it('good twin: the committed doc, and a valid unverified row, both pass', () => {
    expect(check(good()).pass).toBe(true);
    const d = good();
    unverify(row(d, 'EXT-risk-1'));
    expect(check(d).violations).toEqual([]);
  });

  it('external_shape: unknown key, missing field, unknown kind, bad top level', () => {
    const a = good(); row(a, 'EXT-risk-1').notes = 'x';
    expect(codes(check(a))).toEqual(['external_shape']);
    const b = good(); delete row(b, 'EXT-risk-1').authority;
    expect(codes(check(b))).toEqual(['external_shape']);
    const c = good(); row(c, 'EXT-risk-1').verification_status = 'n/a';
    expect(codes(check(c))).toEqual(['external_shape']);
    expect(codes(check({ entries: 'x' }))).toContain('external_shape');
    const e = good(); e.entries.push({ id: 'X-1', kind: 'unconsolidated_amendment' });
    expect(codes(check(e))).toEqual(['external_shape']);
  });

  it('external_id_invalid: id prefix not matching its kind, or a duplicate id', () => {
    const a = good(); row(a, 'EXT-risk-1').kind = 'provincial_precedence';
    expect(codes(check(a))).toContain('external_id_invalid');
    const b = good(); b.entries.push(clone(row(b, 'EXT-risk-5')));
    expect(codes(check(b))).toContain('external_id_invalid');
  });

  it('external_row_set: the seven §6.1 ids must all be present and no other EXT-* row', () => {
    const a = good(); a.entries = a.entries.filter((e: Json) => e.id !== 'EXT-risk-3');
    expect(codes(check(a))).toEqual(['external_row_set']);
    const b = good(); const extra = clone(row(b, 'EXT-risk-5')); extra.id = 'EXT-risk-6'; b.entries.push(extra);
    expect(codes(check(b))).toEqual(['external_row_set']);
  });

  it('external_verified_incomplete: a verified_* row without citation, url, source_sha256, excerpt or verified_on', () => {
    for (const f of ['citation', 'url', 'source_sha256', 'excerpt', 'verified_on']) {
      const d = good(); row(d, 'EXT-risk-2')[f] = null;
      expect(codes(check(d)), f).toEqual(['external_verified_incomplete']);
    }
    const s = good(); row(s, 'EXT-risk-2').source_sha256 = 'abc';
    expect(codes(check(s))).toEqual(['external_verified_incomplete']);
    const v = good(); row(v, 'EXT-risk-2').verified_on = '07/10/2026';
    expect(codes(check(v))).toEqual(['external_verified_incomplete']);
    const x = good(); row(x, 'EXT-prov-1').additional_sources[0].source_sha256 = null;
    expect(codes(check(x))).toEqual(['external_verified_incomplete']);
  });

  it('external_unverified_claims: an unverified row that carries a citation, url, sha, excerpt or other text', () => {
    for (const [f, v] of [['citation', 'Ch.813'], ['url', 'https://www.toronto.ca/x'], ['source_sha256', 'a'.repeat(64)], ['excerpt', 'No person shall'], ['explanation', 'Trees need permits.'], ['verified_on', '2026-10-07']] as const) {
      const d = good(); unverify(row(d, 'EXT-risk-1')); row(d, 'EXT-risk-1')[f] = v;
      expect(codes(check(d)), f).toEqual(['external_unverified_claims']);
    }
    const s = good(); unverify(row(s, 'EXT-risk-1'));
    row(s, 'EXT-risk-1').additional_sources = [clone(row(s, 'EXT-prov-1').additional_sources[0])];
    expect(codes(check(s))).toEqual(['external_unverified_claims']);
  });

  it('external_url_not_primary: a verified_primary row (or its additional source) on a non-government host', () => {
    const a = good(); row(a, 'EXT-risk-2').url = 'https://www.buildingcode.online/1547.html';
    expect(codes(check(a))).toEqual(['external_url_not_primary']);
    const b = good(); row(b, 'EXT-risk-2').additional_sources[0].url = 'https://codenews.ca/OBC/x.pdf';
    expect(codes(check(b))).toEqual(['external_url_not_primary']);
    const c = good(); row(c, 'EXT-risk-2').url = 'http://www.ontario.ca/laws/docs/240163_e.doc';
    expect(codes(check(c))).toEqual(['external_verified_incomplete']); // a non-https url is not a usable citation
    // twin: a secondary source is allowed when the row says verified_secondary
    const t = good(); row(t, 'EXT-risk-2').url = 'https://www.buildingcode.online/1547.html'; row(t, 'EXT-risk-2').verification_status = 'verified_secondary';
    expect(check(t).violations).toEqual([]);
  });

  it('external_not_evaluated_undisclosed: evaluated_by_us "no" whose explanation does not say MaxBLD does not evaluate it', () => {
    const d = good(); row(d, 'EXT-risk-1').explanation = 'Toronto requires a permit to remove a large private tree.';
    expect(codes(check(d))).toEqual(['external_not_evaluated_undisclosed']);
  });

  it('external_evaluated_by_invalid: evaluated_by_us outside "no" | "yes:<spec number>"', () => {
    const d = good(); row(d, 'EXT-risk-4').evaluated_by_us = 'yes';
    expect(codes(check(d))).toEqual(['external_evaluated_by_invalid']);
  });

  it('external_precedence_invalid: active only on a verified_primary provincial row with units; units never on a none row', () => {
    const a = good(); row(a, 'EXT-prov-1').precedence = 'overrides_coverage';
    expect(codes(check(a))).toEqual(['external_precedence_invalid']);
    const b = good(); row(b, 'EXT-risk-1').precedence = 'active';
    expect(codes(check(b))).toEqual(['external_precedence_invalid']);
    const c = good(); row(c, 'EXT-prov-1').provincial_units = [];
    expect(codes(check(c))).toEqual(['external_precedence_invalid']);
    const e = good(); row(e, 'EXT-prov-1').verification_status = 'verified_secondary';
    expect(codes(check(e))).toEqual(['external_precedence_invalid']);
    const f = good(); row(f, 'EXT-risk-1').provincial_units = clone(row(f, 'EXT-prov-1').provincial_units);
    expect(codes(check(f))).toEqual(['external_precedence_invalid']);
  });

  it('external_provincial_unit_invalid: a unit outside the §6.1 shape', () => {
    const muts: Array<(u: Json) => void> = [
      (u) => { u.bound = 'exact'; }, (u) => { u.value = -1; }, (u) => { u.bylaw_prevails = 'sometimes'; },
      (u) => { u.bylaw_prevails_citation = null; }, (u) => { u.scope.applies_to = 'lot'; }, (u) => { u.scope.unit_configurations = []; },
      (u) => { u.scope.unit_configurations = [{ ancillary_units: [4], house_units: [2] }]; }, (u) => { u.scope.other_building_contains_unit = true; },
      (u) => { u.extra = 1; }, (u) => { delete u.verbatim; },
    ];
    for (const [i, m] of muts.entries()) {
      const d = good(); m(row(d, 'EXT-prov-1').provincial_units.find((u: Json) => u.target === 'lot_coverage_pct'));
      expect(codes(check(d)), String(i)).toEqual(['external_provincial_unit_invalid']);
    }
    const dup = good(); const us = row(dup, 'EXT-prov-1').provincial_units; us.push(clone(us[0]));
    expect(codes(check(dup))).toEqual(['external_provincial_unit_invalid']);
  });

  it('external_feeds_invalid: risk_feeds empty, duplicated, or outside the M-52 structure × aspect vocabulary', () => {
    const a = good(); row(a, 'EXT-risk-1').risk_feeds = [];
    expect(codes(check(a))).toEqual(['external_feeds_invalid']);
    const b = good(); row(b, 'EXT-risk-1').risk_feeds = [{ aspect: 'envelope', structure: 'garage' }];
    expect(codes(check(b))).toEqual(['external_feeds_invalid']);
    const c = good(); row(c, 'EXT-risk-1').risk_feeds = [{ aspect: 'trees', structure: 'any' }];
    expect(codes(check(c))).toEqual(['external_feeds_invalid']);
    const e = good(); row(e, 'EXT-risk-1').risk_feeds = [{ aspect: 'envelope', structure: 'any' }, { aspect: 'envelope', structure: 'any' }];
    expect(codes(check(e))).toEqual(['external_feeds_invalid']);
  });

  it('external_pinned_page_mismatch: a row on a pinned page whose sha or excerpt disagrees with pages/', () => {
    const a = good(); row(a, 'EXT-gov-1').source_sha256 = 'a'.repeat(64);
    expect(codes(check(a))).toEqual(['external_pinned_page_mismatch']);
    const b = good(); row(b, 'EXT-gov-1').excerpt = 'This By-law applies to all the lands in the City of Toronto.';
    expect(codes(check(b))).toEqual(['external_pinned_page_mismatch']);
  });

  it('external_not_canonical: checkExternalFile flags bytes that are not the canonical serialization', () => {
    expect(EXT.checkExternalFile({ seeds: SEEDS }).violations).toEqual([]);
    const bytes = fs.readFileSync(FILE, 'utf8');
    const crlf = EXT.checkExternalFile({ seeds: SEEDS, bytes: bytes.replace(/\n/g, '\r\n') });
    expect(codes(crlf)).toEqual(['external_not_canonical']);
    const d = readDoc(); d.entries.reverse();
    expect(codes(EXT.checkExternalFile({ seeds: SEEDS, bytes: JSON.stringify(d, null, 2) + '\n' }))).toEqual(['external_not_canonical']);
  });

  it('collects every failure (never stops at the first) and is pure (input not mutated)', () => {
    const d = good(); row(d, 'EXT-risk-1').risk_feeds = []; row(d, 'EXT-risk-4').evaluated_by_us = 'maybe';
    const before = JSON.stringify(d);
    expect(codes(check(d))).toEqual(['external_evaluated_by_invalid', 'external_feeds_invalid']);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('review-lens folds: prototype-named kinds are unknown; a null explanation reports, never throws; dates are real', () => {
    const a = good(); row(a, 'EXT-risk-1').kind = 'toString';
    expect(codes(check(a))).toEqual(['external_row_set', 'external_shape']);
    const b = good(); row(b, 'EXT-risk-1').explanation = null;
    expect(codes(check(b))).toEqual(['external_shape']);
    const c = good(); row(c, 'EXT-risk-1').verified_on = '2026-02-30';
    expect(codes(check(c))).toEqual(['external_verified_incomplete']);
    const d = good(); row(d, 'EXT-gov-1').excerpt = `${row(d, 'EXT-gov-1').excerpt} …  … x`;
    expect(codes(check(d))).toContain('external_verified_incomplete');
  });

  it('the pinned-page re-check survives url spelling (fragment, query, host case) and reports how many rows it ran on', () => {
    expect(check(good()).pinned_checked).toBe(1);
    const a = good(); row(a, 'EXT-gov-1').url = `${row(a, 'EXT-gov-1').url.replace('www.toronto.ca', 'WWW.Toronto.ca')}?x=1#1.5.7`;
    row(a, 'EXT-gov-1').source_sha256 = 'b'.repeat(64);
    expect(codes(check(a))).toEqual(['external_pinned_page_mismatch']);
    expect(check(good(), { seeds: undefined }).pinned_checked).toBe(0);
  });

  it('checkExternalFile never throws on bad input; selfTest passes over every reason code', () => {
    expect(EXT.checkExternalFile().pass).toBe(false);
    expect(codes(EXT.checkExternalFile({ bytes: '{' }))).toEqual(['external_shape']);
    expect(EXT.checkExternalFile({ seeds: SEEDS, bytes: Buffer.from(fs.readFileSync(FILE)) }).violations).toEqual([]);
    expect(EXT.selfTest()).toBeGreaterThanOrEqual(15);
  });

  it('ref and model_heuristic entries are counted, not rejected (their arms land at S12 / S9)', () => {
    const d = good();
    d.entries.push({ citation: 'Chapter 900, 900.2.10(5)', id: 'REF-1', kind: 'ref', reason: 'phase2_exception', url: 'https://www.toronto.ca/zoning/bylaw_amendments/ZBL_NewProvision_Chapter900_2.htm' });
    expect(check(d).counts.ref).toBe(1);
    expect(check(d).violations).toEqual([]);
  });
});
