// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (`applies_to.part` named_addresses + refs; `instrument`
//            {kind, citation, municipality}), §10 (determinism)
// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §3 (shared JOIN-key normalizers, address-normalizers.js)
// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §7 (seeded 50-item link-precision sample, >= 0.95)
// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-117 (R-DET), M-126 (Wilson reporting)
//
// McBylaw named addresses (plan .cursor/mcbylaw/named-addr-plan.md; phase2-plan-v2 P2-8.0(a)). Pure logic only; the
// address_points read lives in named-addresses-run.mjs. The corpus fixture holds every named_addresses ref and every
// instrument citation of the committed shards plus the W1 keying drafts (2026-10-14); the live scan below re-reads the
// committed shards so a newly committed ref is covered without regenerating the fixture.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const NA: Json = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/named-addresses.mjs')).href);
const CORPUS: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/tests/fixtures/bylaw-named-addresses/w1-corpus.json'), 'utf8'));

const brief = (a: Json) => (a.range ? `${a.range.from_key}-${a.range.to_key}/${a.range.parity}` : a.key) + '@' + a.city_full;

describe('parseNamedRef — the operator examples (exception 900.2.10(737))', () => {
  it('odd range with letter suffixes, direction kept', () => {
    const p = NA.parseNamedRef('the odd numbered addresses of 2549B-2551B Dundas St. W.');
    expect(p.status).toBe('parsed');
    expect(p.addresses).toHaveLength(1);
    expect(p.addresses[0]).toMatchObject({ street: 'DUNDAS', street_type: 'ST', direction: 'W', street_key: 'DUNDAS' });
    expect(p.addresses[0].range).toMatchObject({ from_key: '2549B', to_key: '2551B', parity: 'odd', parity_basis: 'stated' });
  });
  it('"On or between the even numbered addresses of 40-50 High Park Ave."', () => {
    const p = NA.parseNamedRef('On or between the even numbered addresses of 40-50 High Park Ave.');
    expect(p.addresses.map(brief)).toEqual(['40-50/even@HIGH PARK AVE']);
  });
  it('single addresses, one per ref and a list in one ref', () => {
    expect(NA.parseNamedRef('19 Dorval Rd.').addresses.map(brief)).toEqual(['19@DORVAL RD']);
    expect(NA.parseNamedRef('19 Dorval Rd., 20 Dorval Rd.').addresses.map(brief)).toEqual(['19@DORVAL RD', '20@DORVAL RD']);
  });
  it('48 Pine Crest Rd. parses; the 1983 qualifier comes from the unit text, not the ref', () => {
    expect(NA.parseNamedRef('48 Pine Crest Rd.').addresses.map(brief)).toEqual(['48@PINE CREST RD']);
    expect(NA.historicalQualifier('… prevails on the lands known as 48 Pine Crest Rd. in 1983.')).toMatchObject({ as_of_year: 1983 });
    expect(NA.historicalQualifier('On lands municipally known in the year 2018 as 383 Old Weston Road')).toMatchObject({ as_of_year: 2018 });
    expect(NA.historicalQualifier('64 Glenlake Ave.')).toBeNull();
  });
});

describe('parseNamedRef — shapes in the corpus', () => {
  it.each([
    ['707, 709, 711, 715 and 717 Dovercourt Road', ['707@DOVERCOURT RD', '709@DOVERCOURT RD', '711@DOVERCOURT RD', '715@DOVERCOURT RD', '717@DOVERCOURT RD']],
    ['146-146E, 146F-146G, 146H-146L Clinton St.', ['146-146E/even@CLINTON ST', '146F-146G/even@CLINTON ST', '146H-146L/even@CLINTON ST']],
    ['251A-255 Christie Street and 38-42C Yarmouth Road', ['251A-255/odd@CHRISTIE ST', '38-42C/even@YARMOUTH RD']],
    ['Baldwin Street (40 to 131)', ['40-131/all@BALDWIN ST']],
    ['310 to 320 Gerrard Street East', ['310-320/even@GERRARD ST E']],
    ['125 1/2 Winchester St.', ['125 1/2@WINCHESTER ST']],
    ['even numbered addresses of 6-16 St.James Crt.', ['6-16/even@ST JAMES CRT']],
    ['1011 Lansdowne Ave., 730 St. Clarens Ave.', ['1011@LANSDOWNE AVE', '730@ST CLARENS AVE']],
    ['the lot known as 2980 Weston Road', ['2980@WESTON RD']],
    ['1-19 Lukow Ter. (odd), 2-20 Lukow Ter. (even), 22R Wright Ave.', ['1-19/odd@LUKOW TER', '2-20/even@LUKOW TER', '22R@WRIGHT AVE']],
    ['the even numbered addresses of 512-616 Delaware Ave. N.', ['512-616/even@DELAWARE AVE N']],
  ])('%s', (raw, want) => {
    const p = NA.parseNamedRef(raw);
    expect(p.status).toBe('parsed');
    expect(p.addresses.map(brief)).toEqual(want);
  });
  it('unstated parity: same-parity endpoints infer that side; mixed endpoints are all', () => {
    expect(NA.parseNamedRef('57-61 Lake Shore Drive').addresses[0].range).toMatchObject({ parity: 'odd', parity_basis: 'inferred' });
    expect(NA.parseNamedRef('Baldwin Street (40 to 131)').addresses[0].range).toMatchObject({ parity: 'all', parity_basis: 'inferred' });
  });
  it('unhappy paths are unparsed or partial with a reason, never a guessed address', () => {
    expect(NA.parseNamedRef(null)).toMatchObject({ status: 'unparsed', reasons: ['empty_ref'], addresses: [] });
    expect(NA.parseNamedRef('the lands')).toMatchObject({ status: 'unparsed', reasons: ['no_house_number'] }); // a street with no number is now whole_street (CHAT-86), prose is not
    expect(NA.parseNamedRef('a lot fronting on Ashley Park Rd.')).toMatchObject({ status: 'unparsed', reasons: ['descriptive_lot'] });
    const part = NA.parseNamedRef('380, 382 Rosewell Ave. and part of 1451 Avenue Rd.');
    expect(part.status).toBe('partial');
    expect(part.reasons).toEqual(['part_of_lot']);
    expect(part.addresses.map(brief)).toEqual(['380@ROSEWELL AVE', '382@ROSEWELL AVE', '1451@AVENUE RD']);
    expect(part.addresses[2].part_of).toBe(true);
  });
  it('is deterministic (same input, byte-equal output)', () => {
    for (const r of CORPUS.refs.slice(0, 40)) expect(JSON.stringify(NA.parseNamedRef(r))).toBe(JSON.stringify(NA.parseNamedRef(r)));
  });
});

describe('the street key reuses the Spec 54 normalizer (byte-equal to the stored linear_name_normalized)', () => {
  // measured 2026-10-14 on the dev DB: SELECT linear_name_full, linear_name_normalized FROM address_points
  it.each([
    ['Avenue Rd', 'RD'], ['St Clarens Ave', 'CLARENS AVE'], ['St George St', 'GEORGE ST'], ['Lukow Ter', 'LUKOW TER'],
    ['Dundas St W', 'DUNDAS'], ['Delaware Ave N', 'DELAWARE'], ['High Park Ave', 'HIGH PARK'], ['Mc Gee St', 'MC GEE'],
  ])('%s → %s', (cityFull, stored) => {
    expect(NA.cityStreet(cityFull).key).toBe(stored);
  });
  it('the by-law spelling and the City spelling land on one City full name', () => {
    expect(NA.cityStreet('Avenue Road').city_full).toBe('AVENUE RD');
    expect(NA.cityStreet('Lake Shore Drive').city_full).toBe('LAKE SHORE DR');
    expect(NA.cityStreet('Gerrard Street East').city_full).toBe('GERRARD ST E');
    expect(NA.cityStreet('St.James Crt.').city_full).toBe('ST JAMES CRT');
  });
});

describe('corpus parse rate (every named_addresses ref, committed + W1 drafts)', () => {
  const res = CORPUS.refs.map((r: string) => NA.parseNamedRef(r));
  it('covers the whole fixture', () => {
    expect(CORPUS.refs.length).toBeGreaterThanOrEqual(300);
  });
  it('>= 95 % parsed', () => {
    const parsed = res.filter((p: Json) => p.status === 'parsed').length;
    expect(parsed / res.length).toBeGreaterThanOrEqual(0.95);
  });
  it('the non-parsed list is exactly the known one, each with its reason', () => {
    const other = res.filter((p: Json) => p.status !== 'parsed').map((p: Json) => [p.status, p.raw, p.reasons.join(',')]);
    expect(other).toEqual([
      ['partial', '380, 382, 384, 386 Rosewell Ave. and part of 1451 Avenue Rd.', 'part_of_lot'],
      ['unparsed', 'a lot fronting on Ashley Park Rd.', 'descriptive_lot'],
      ['partial', 'part of 1451 Avenue Rd.', 'part_of_lot'],
    ]);
  });
  it('every committed shard ref (live scan) parses at >= 95 %', () => {
    const base = path.join(ROOT, 'scripts/seeds/bylaw/authored');
    const refs: string[] = [];
    for (const d of fs.readdirSync(base).sort()) {
      const dir = path.join(base, d);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir).sort()) {
        if (!/\.(a|b)\.json$/.test(f)) continue;
        for (const u of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).units ?? []) {
          if (u.applies_to?.part === 'named_addresses' && Array.isArray(u.applies_to.refs)) refs.push(...u.applies_to.refs);
        }
      }
    }
    expect(refs.length).toBeGreaterThan(0);
    const parsed = refs.filter((r) => NA.parseNamedRef(r).status === 'parsed').length;
    expect(parsed / refs.length).toBeGreaterThanOrEqual(0.95);
  });
});

// CHAT-86.whole-street (operator 2026-10-23): a named_addresses ref that is a street with no house number parses as whole_street and resolves by street key only
describe('CHAT-86.whole-street: a street with no house number', () => {
  it('parses as a whole_street address carrying the street key and no number or range', () => {
    const p = NA.parseNamedRef('Brimley Rd.');
    expect(p.status).toBe('parsed');
    expect(p.addresses).toEqual([expect.objectContaining({ whole_street: true, street: 'BRIMLEY', street_type: 'RD', city_full: 'BRIMLEY RD', street_key: 'BRIMLEY' })]);
    expect(p.addresses[0].number).toBeUndefined();
    expect(p.addresses[0].range).toBeUndefined();
    expect(NA.parseNamedRef('Eglinton Avenue West').addresses[0]).toMatchObject({ whole_street: true, direction: 'W' });
    expect(NA.parseNamedRef('St. Clair Ave.').status).toBe('parsed');
  });
  it('does not turn words that are not a street into one', () => {
    expect(NA.parseNamedRef('the lands').status).toBe('unparsed');
    expect(NA.parseNamedRef('a lot fronting on Ashley Park Rd.').status).toBe('unparsed');
    expect(NA.parseNamedRef('Warden').status).toBe('unparsed');
  });
  it('a numbered ref is unchanged', () => {
    expect(NA.parseNamedRef('19 Dorval Rd.').addresses[0].whole_street).toBeUndefined();
  });
  it('resolves by street key only: every parcel on the street, ambiguous across streets, not_found with no parcel link', () => {
    const w = NA.parseNamedRef('Brimley Rd.').addresses[0];
    const pt = (id: number, num: string, parcel: number | null, street = 'Brimley Rd') => ({ address_point_id: id, linear_name_full: street, addr_num_normalized: num, parcel_id: parcel });
    expect(NA.classifyItem(w, [pt(1, '10', 5), pt(2, '12', 6), pt(3, '12', 6)])).toMatchObject({ match_status: 'exact', parcels: [5, 6] });
    expect(NA.classifyItem(w, [pt(1, '10', 5), pt(2, '12', 6, 'Brimley Dr')])).toMatchObject({ match_status: 'ambiguous', reasons: ['multi_street'] });
    expect(NA.classifyItem(w, [pt(1, '10', null)])).toMatchObject({ match_status: 'not_found', reasons: ['no_parcel_link'] });
    expect(NA.classifyItem(w, [])).toMatchObject({ match_status: 'not_found', reasons: ['no_street'] });
  });
});

describe('splitCitations', () => {
  const cites = (s: string) => NA.splitCitations(s).citations.map((c: Json) => [c.kind, c.bylaw, c.section ?? c.part ?? null, c.municipality]);
  it('the operator example: one string, three by-laws, one municipality', () => {
    expect(cites('former City of Toronto by-laws 22318, 171-67 and 188-71')).toEqual([
      ['bylaw', '22318', null, 'former City of Toronto'],
      ['bylaw', '171-67', null, 'former City of Toronto'],
      ['bylaw', '188-71', null, 'former City of Toronto'],
    ]);
  });
  it('a section binds to its by-law; a second municipality binds to its own by-law', () => {
    expect(cites('Section 12(2) 155 of former City of Toronto By-law 438-86')).toEqual([['section', '438-86', '12(2) 155', 'former City of Toronto']]);
    expect(cites('City of Toronto by-law 479-2010 and Section 12(1) 484, former City of Toronto By-law 438-86')).toEqual([
      ['bylaw', '479-2010', null, 'City of Toronto'],
      ['section', '438-86', '12(1) 484', 'former City of Toronto'],
    ]);
  });
  it('semicolon lists, tribunal suffixes, schedules, law-at-date qualifiers', () => {
    expect(cites('118-82; 474-82, 595-82, 80-84 and 229-84').map((c: unknown[]) => c[1])).toEqual(['118-82', '474-82', '595-82', '80-84', '229-84']);
    const omb = NA.splitCitations('City of Toronto By-law 1268-2009(OMB); City of Toronto By-law 593-2008');
    expect(omb.citations[0]).toMatchObject({ bylaw: '1268-2009', tribunal: 'OMB' });
    expect(cites("Schedule 'D' Airport Hazard Map from City of North York zoning by-law 7625")).toEqual([
      ['schedule', '7625', "Schedule 'D' Airport Hazard Map", 'City of North York'],
    ]);
    expect(cites('Schedule "C" Exception 3, of former City of Scarborough by-law 9510')).toEqual([
      ['schedule', '9510', 'Schedule "C" Exception 3', 'former City of Scarborough'],
    ]);
    const at = NA.splitCitations('By-law 569-2013, as amended, as it read prior to July 22, 2022');
    expect(at.citations).toHaveLength(1);
    expect(at.citations[0]).toMatchObject({ bylaw: '569-2013', qualifier: 'as it read prior to July 22, 2022; as amended' });
  });
  it('unhappy paths', () => {
    expect(NA.splitCitations(null)).toMatchObject({ status: 'unparsed', citations: [] });
    expect(NA.splitCitations('')).toMatchObject({ status: 'unparsed', citations: [] });
    expect(NA.splitCitations('regulations 970.30.15.5(3) and 970.30.15.5(5)').status).toBe('partial');
  });
  it('every corpus citation yields >= 1 citation; partial only for 569-2013 regulation lists', () => {
    for (const c of CORPUS.citations) {
      const r = NA.splitCitations(c);
      expect({ c, n: r.citations.length > 0 }).toEqual({ c, n: true });
      if (r.status !== 'parsed') expect({ c, kind: r.citations[0].kind }).toEqual({ c, kind: 'regulation_569' });
    }
  });
});

describe('range membership and match classification', () => {
  const range = NA.parseNamedRef('the odd numbered addresses of 2549B-2551B Dundas St. W.').addresses[0].range;
  it('(number, suffix) order with "" < "A", parity on the number', () => {
    const inR = (s: string) => NA.inRange(NA.splitAddrNum(s), range);
    expect(['2549B', '2549C', '2551', '2551A', '2551B'].map(inR)).toEqual([true, true, true, true, true]);
    expect(['2549', '2549A', '2550', '2551C', '2553'].map(inR)).toEqual([false, false, false, false, false]);
  });
  const pt = (id: number, num: string, parcel: number | null, street = 'Dundas St W') =>
    ({ address_point_id: id, linear_name_full: street, addr_num_normalized: num, parcel_id: parcel });
  const single = NA.parseNamedRef('19 Dorval Rd.').addresses[0];
  it('single address → exact / ambiguous / not_found', () => {
    expect(NA.classifyItem(single, [pt(1, '19', 10), pt(2, '19', 10)])).toMatchObject({ match_status: 'exact', parcels: [10] });
    expect(NA.classifyItem(single, [pt(1, '19', 10), pt(2, '19', 11)])).toMatchObject({ match_status: 'ambiguous', reasons: ['multi_parcel'] });
    expect(NA.classifyItem(single, [pt(1, '19', 10), pt(2, '19', 12, 'Dorval Ave')])).toMatchObject({ match_status: 'ambiguous', reasons: ['multi_street'] });
    expect(NA.classifyItem(single, [pt(1, '21', 10)])).toMatchObject({ match_status: 'not_found', reasons: ['no_number'] });
    expect(NA.classifyItem(single, [pt(1, '19', null)])).toMatchObject({ match_status: 'not_found', reasons: ['no_parcel_link'] });
  });
  const item = { range };
  it('range → exact / range_partial / not_found', () => {
    expect(NA.classifyItem(item, [pt(1, '2549B', 1), pt(2, '2551B', 2)])).toMatchObject({ match_status: 'exact', parcels: [1, 2], endpoints_found: 2 });
    expect(NA.classifyItem(item, [pt(1, '2549B', 1), pt(2, '2551A', 2)])).toMatchObject({ match_status: 'range_partial', reasons: ['endpoint_missing'] });
    expect(NA.classifyItem(item, [pt(1, '2550', 1)])).toMatchObject({ match_status: 'not_found', reasons: ['no_number'] });
  });
  it('roll-up takes the worst status; the closed sets are fixed', () => {
    expect(NA.worst(['exact', 'range_partial'])).toBe('range_partial');
    expect(NA.worst(['exact', 'ambiguous', 'range_partial'])).toBe('ambiguous');
    expect(NA.worst(['exact', 'not_found'])).toBe('not_found');
    expect(NA.worst([])).toBe('not_found');
    expect(NA.MATCH_STATUS).toEqual(['exact', 'ambiguous', 'not_found', 'range_partial']);
  });
});

describe('the precision sample and its bound', () => {
  const items = Array.from({ length: 120 }, (_, i) => ({ sample_id: `u${String(i).padStart(3, '0')}` }));
  // a deterministic stand-in hash for the test (the runner injects sha256)
  const h = (s: string) => { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x.toString(16).padStart(8, '0'); };
  it('same seed → same 50; another seed → another draw', () => {
    const a = NA.drawSample(items, 'seed-1', 50, h).map((x: Json) => x.sample_id);
    expect(a).toHaveLength(50);
    expect(NA.drawSample(items, 'seed-1', 50, h).map((x: Json) => x.sample_id)).toEqual(a);
    expect(NA.drawSample(items, 'seed-2', 50, h).map((x: Json) => x.sample_id)).not.toEqual(a);
  });
  it('Wilson 95 % lower bound; ambiguous counts as incorrect; unread items are not counted', () => {
    expect(NA.scorePrecision(Array(50).fill('correct'))).toEqual({ n: 50, correct: 50, precision: 1, wilson_lower_95: 0.9287 });
    const s = NA.scorePrecision([...Array(47).fill('correct'), 'incorrect', 'ambiguous', 'incorrect', null]);
    expect(s).toMatchObject({ n: 50, correct: 47, precision: 0.94 });
    expect(s.wilson_lower_95).toBeCloseTo(0.8378, 3);
    expect(NA.scorePrecision([])).toEqual({ n: 0, correct: 0, precision: null, wilson_lower_95: null });
  });
});
