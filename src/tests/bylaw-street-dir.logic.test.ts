// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-285 (Spec 133 §m.285); operator CHAT-104.STREET-DIR
//            (2026-10-24, `2026-10-24-batch-w#CHAT-104.STREET-DIR`, MORNING.md Q1 / verify-48a), on top of CHAT-100.L-INTERIOR
// CHAT-104.STREET-DIR: in the M-285 street-name join (scripts/analysis/bylaw/evaluate.mjs namedStreetJoin), a vocab.named_street street
// that names no direction ("Finch Ave.") matches a lot street equal to it after exactly one trailing direction word is dropped
// ("FINCH AVE E", "Finch Avenue East"; E/W/N/S as the vocab suffix map spells east/west/north/south). A table street that names a
// direction ("Finch Ave. West", "Lawrence Avenue East", "Chartland Blvd. S.") still needs that direction. No other loosening.
// Red first: docs/reports/red-evidence/bylaw/bylaw-chat104-street-dir-red.txt
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const Z: Record<string, string> = { '900.3.10': 'RD', '900.4.10': 'RS', '900.5.10': 'RT' };
const INTERIOR = { corner_lot: false, through_lot: false };
// every spelling of one trailing direction word the suffix map gives (east→e, west→w, north→n, south→s)
const DIRECTED = ['FINCH AVE E', 'Finch Ave. E.', 'Finch Avenue East', 'FINCH AVE W', 'Finch Avenue West', 'Finch Ave N', 'Finch Avenue North', 'Finch Ave S', 'Finch Avenue South'];

describe('CHAT-104.STREET-DIR: a table street that names no direction matches the lot street with one trailing direction word', async () => {
  const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
  const { E, units, C } = await AS.loadRealLotAssembly(ROOT);
  const lot = (exception: string, name: string, f: Json, bt = 'detached_house'): Json => ({
    zone: Z[exception.slice(0, 8)], label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], address: '100 ' + name, building_type: bt, exception, primary_frontage_street_name: name,
    flags: { lawfully_existing: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...f },
    vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, proposed_height_m: 4, distance_to_residential_m: 5 },
  });
  const run = (exception: string, name: string, f: Json): Json => { const l = lot(exception, name, f); return E.effective(l, 'street_setback_m', E.loadCandidates(l, units).candidates, C); };
  const unit = (id: string): Json => { const u = units.find((x: Json) => (x.unit_id ?? x.u?.unit_id) === id); return u.u ?? u; };
  const join = (id: string, name: string, f: Json = INTERIOR, bt?: string): boolean | null => E.applies(lot(id.slice(0, id.indexOf('#')), name, f, bt), unit(id), C).ok;

  it('the join: "Finch Ave." (line any) matches a lot street with one trailing direction word, any spelling', () => {
    const id = '900.4.10(256)#(256)[SSP](D)(i)'; // streets Finch Ave. / Brimley Rd. / Midland Ave.
    for (const n of DIRECTED) expect([n, join(id, n)]).toEqual([n, true]);
    expect(join(id, 'Brimley Rd E')).toBe(true);
    expect(join(id, 'Finch Ave')).toBe(true); // unchanged
  });

  it('the join: a front-line row joins the same way ("Finch Ave." in 931 (C)(i))', () => {
    const id = '900.3.10(931)#(931)[SSP](C)(i)';
    expect(join(id, 'FINCH AVE E')).toBe(true);
    expect(join(id, 'Finch Avenue East')).toBe(true);
    expect(join(id, 'Ravencliff Cres')).toBe(false);
  });

  it('the join: a table street that names a direction still needs that direction', () => {
    const fw = '900.3.10(1213)#(1213)[SSP](D)'; // Finch Ave. West / Humberline Drive
    expect(join(fw, 'Finch Ave W')).toBe(true);
    expect(join(fw, 'FINCH AVENUE WEST')).toBe(true);
    expect(join(fw, 'Finch Ave E')).toBe(false);
    expect(join(fw, 'Finch Ave')).toBe(false); // a lot street with no direction does not match a directed table street
    const le = '900.3.10(613)#(613)[SSP](C)'; // Lawrence Avenue East (townhouse or apartment building)
    expect(join(le, 'LAWRENCE AVE E', INTERIOR, 'townhouse')).toBe(true);
    expect(join(le, 'Lawrence Ave W', INTERIOR, 'townhouse')).toBe(false);
    expect(join(le, 'Lawrence Ave', INTERIOR, 'townhouse')).toBe(false);
    const cs = '900.3.10(1057)#(1057)[SSP](C)(i)'; // Huntingwood Dr. / Chartland Blvd. S.
    expect(join(cs, 'Chartland Blvd S')).toBe(true);
    expect(join(cs, 'Chartland Blvd N')).toBe(false);
    expect(join(cs, 'Chartland Blvd S E')).toBe(false); // two trailing directions: no second drop
  });

  it('the join: no other loosening (two trailing directions, a leading direction, a missing suffix, extra words)', () => {
    const id = '900.4.10(256)#(256)[SSP](D)(i)';
    for (const n of ['Finch Ave E W', 'Finch Ave East West', 'E Finch Ave', 'Finch E', 'Finch', 'Finch Ave E Service Rd', 'Finch Ave Extension']) expect([n, join(id, n)]).toEqual([n, false]);
  });

  it('production path: an interior lot on Finch Ave E/W reads the by-law Finch arm (7.5 m; 1120 9.0 m), not the other-street arm', () => {
    const rows: [string, string, number][] = [
      ['900.4.10(256)', '900.4.10(256)#(256)[SSP](D)(i)', 7.5], ['900.5.10(264)', '900.5.10(264)#(264)[SSP](A)(i)', 7.5],
      ['900.3.10(1029)', '900.3.10(1029)#(1029)[SSP](C)(i)', 7.5], ['900.3.10(1026)', '900.3.10(1026)#(1026)[SSP](C)(i)', 7.5],
      ['900.4.10(255)', '900.4.10(255)#(255)[SSP](D)(i)', 7.5], ['900.3.10(1120)', '900.3.10(1120)#(1120)[SSP](C)(i)', 9],
    ];
    for (const [ex, arm, v] of rows) for (const n of ['FINCH AVE E', 'Finch Avenue East', 'FINCH AVE W']) {
      const r = run(ex, n, INTERIOR);
      expect([ex, n, r.status, r.value, r.winner]).toEqual([ex, n, 'value', v, arm]);
    }
  });

  it('production path: 1057 "Chartland Blvd. S." arm (7.5 m) binds only on Chartland Blvd S; N and no direction read the other arm (6.0 m)', () => {
    const s = run('900.3.10(1057)', 'Chartland Blvd S', INTERIOR), n = run('900.3.10(1057)', 'Chartland Blvd N', INTERIOR), b = run('900.3.10(1057)', 'Chartland Blvd', INTERIOR);
    expect([s.value, s.winner]).toEqual([7.5, '900.3.10(1057)#(1057)[SSP](C)(i)']);
    expect([n.value, n.winner]).toEqual([6, '900.3.10(1057)#(1057)[SSP](C)(ii)']);
    expect([b.value, b.winner]).toEqual([6, '900.3.10(1057)#(1057)[SSP](C)(ii)']);
  });
});
