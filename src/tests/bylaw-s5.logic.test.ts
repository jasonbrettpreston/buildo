// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (scope, input_fidelity, definitions_used), §6.4 rules
//            1, 2, 5, 11, §6.5 (closed vocabularies, the `feeds` maps), §8 rule 7 (--accept --ruling), §9 G-UNIVERSE,
//            G-READ (definitions arm), G-SHAPE (feeds totality arm); docs/specs/01-pipeline/69_mcbylaw_policy.md M-26,
//            M-31, M-37, M-47, M-50, M-52; docs/reports/mcbylaw-phase1-plan.md S5
//
// S5 logic: one known-bad fixture per reason code plus a good twin for the vocabulary (vocab.mjs), the feeds totality
// arm, the definitions matcher + G-READ definitions arm (definitions.mjs) and G-UNIVERSE TOC + scope arms
// (universe.mjs); the --accept --ruling door (refuses an unratified ruling and anything awaiting a ruling; writes the
// lock and a ledger row; tamper -> mismatch); the census zone set bound to vocab.zone (census.mjs).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const V = await load('scripts/analysis/bylaw/vocab.mjs');
const D = await load('scripts/analysis/bylaw/definitions.mjs');
const U = await load('scripts/analysis/bylaw/universe.mjs');
const C = await load('scripts/analysis/bylaw/census.mjs');
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');
const codes = (violations: string[]) => [...new Set(violations.map((x) => x.split(':')[0]))];

describe('modules load', () => {
  it('vocab.mjs, definitions.mjs and universe.mjs import', () => {
    expect(V.importError).toBeUndefined();
    expect(D.importError).toBeUndefined();
    expect(U.importError).toBeUndefined();
  });
});

describe('vocab.mjs — closed vocabularies and the feeds maps (Spec 68 §6.5, Spec 69 M-52)', () => {
  it('the good twin passes', () => {
    const r = V.checkVocab(V.fixtureVocab());
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
  });
  for (const f of V.VOCAB_FIXTURES || [{ reason: 'missing fixtures', vocab: () => ({}) }]) {
    it(`known-bad: ${f.reason}`, () => {
      const r = V.checkVocab(f.vocab());
      expect(r.pass).toBe(false);
      expect(codes(r.violations)).toEqual([f.reason]);
    });
  }
  for (const f of V.FEEDS_FIXTURES || [{ reason: 'missing fixtures', units: [] }]) {
    it(`feeds totality: ${f.reason || 'good twin'}`, () => {
      const r = V.checkFeedsTotality(f.units, V.fixtureVocab());
      if (f.reason === null) expect(r.violations).toEqual([]);
      else expect(codes(r.violations)).toEqual([f.reason]);
    });
  }
  it('feeds are generated: structure from the building type, aspect from the target (a suite height feeds the suite)', () => {
    const vocab = V.fixtureVocab();
    expect(V.feedsOf({ unit_id: 'g', archetype: 'LIMIT', target: 'height_m', application: { building_types: ['garden_suite'] } }, vocab).pairs).toEqual([{ structure: 'suite', aspect: 'envelope' }]);
    expect(V.feedsOf({ unit_id: 'h', archetype: 'LIMIT', target: 'height_m', application: { building_types: ['detached_house'] } }, vocab).pairs).toEqual([{ structure: 'principal', aspect: 'envelope' }]);
    expect(V.feedsOf({ unit_id: 'p', archetype: 'PERMIT', target: 'none', application: { building_types: ['duplex'] } }, vocab).pairs).toEqual([{ structure: 'principal', aspect: 'use_permission' }]);
  });
  it('evaluatorVocab derives the M-50 list, the parent map and the threshold tokens (never kept twice)', () => {
    const ev = V.evaluatorVocab(V.fixtureVocab());
    expect(ev.building_type_residential).toEqual(['detached_house', 'detached_houseplex']);
    expect(ev.building_type_parent).toEqual({ duplex: 'detached_houseplex' });
    expect(ev.lot_condition_threshold).toEqual(['frontage_band']);
  });
  it('selfTest covers every reason code', () => {
    const r = V.selfTest();
    expect(r.results.filter((x: Json) => !x.ok)).toEqual([]);
    expect(r.pass).toBe(true);
  });
});

describe('definitions.mjs — the declared matcher and the G-READ definitions arm (Spec 68 §6.4 rule 11, §9 G-READ)', () => {
  it('matcher: longest term first, plurals, "A and B" terms, transitive closure', () => {
    for (const r of D.matcherSelfTest()) expect([r.name, r.ok]).toEqual([r.name, true]);
  });
  for (const f of D.FIXTURES || [{ reason: 'missing fixtures' }]) {
    it(`${f.reason ? 'known-bad: ' + f.reason : 'good twin'}`, () => {
      const r = D.checkDefinitions({ rows: D.fixtureRows(), vocab: f.vocab, fidelity: f.fidelity, inScopeIds: f.inScope || null });
      if (f.reason === null) expect(r.violations).toEqual([]);
      else expect(codes(r.violations)).toEqual([f.reason]);
    });
  }
  it('selfTest covers every reason code', () => {
    expect(D.selfTest().results.filter((x: Json) => !x.ok)).toEqual([]);
  });
});

describe('universe.mjs — G-UNIVERSE TOC + scope arms (Spec 68 §6.4 rules 1-2, §9)', () => {
  for (const f of U.FIXTURES || [{ reason: 'missing fixtures', input: () => ({}) }]) {
    it(`${f.reason ? 'known-bad: ' + f.reason : f.name}`, () => {
      const r = U.checkUniverse(f.input());
      if (f.reason === null) {
        expect(r.violations).toEqual([]);
        expect(r.status).toBe(f.status);
      } else {
        expect(r.status).toBe('fail');
        expect(codes(r.violations)).toEqual([f.reason]);
      }
    });
  }
  it('mechanical first, then the retired page (ruled), then judgment; a proposed judgment row is awaiting_ruling, counted', () => {
    const r = U.checkUniverse(U.fixtureInputs());
    const by = Object.fromEntries(r.scoped.map((x: Json) => [x.regulation_id, x]));
    expect([by['10.20.40.70(2)'].scope, by['10.20.40.70(2)'].reason]).toEqual(['out_of_scope', 'deleted_slot']);
    expect([by['230.20.1.20(1)'].scope, by['230.20.1.20(1)'].reason, by['230.20.1.20(1)'].ruling]).toEqual(['out_of_scope', 'apartment_building_only', 'M-47']);
    expect([by['10.20.20.100(1)'].scope, by['10.20.20.100(1)'].reason, by['10.20.20.100(1)'].evidence]).toEqual(['awaiting_ruling', 'non_residential_use_condition', 'Ambulance Depot']);
    expect(by['10.20.40.70(1)'].scope).toBe('in_scope');
    expect([by['800.50(290)'].scope, by['800.50(55)'].reason]).toEqual(['in_scope', 'definition_not_used']);
    expect(r.counts.awaiting_ruling).toEqual({ non_residential_use_condition: 1 });
    expect(r.counts.toc.awaiting_ruling).toBe(1);
    expect(r.notes.join(' ')).toMatch(/universe_lock_absent/);
  });
  it('administrative beats an in-scope page rule and every other judgment reason (M-31)', () => {
    const i = U.fixtureInputs();
    i.universe.scope_rules.splice(2, 0, { id: 'SR-ADMIN', tier: 3, kind: 'judgment', scope: 'out', reason: 'administrative_no_application_effect', ruling: null, match: { regulation_ids: ['10.20.20.100(1)'] }, evidence: ['ambulance depot'] });
    i.universe.scope_rules.push({ id: 'SR-NONE', tier: 4, kind: 'judgment', scope: 'out', reason: 'non_residential_use_condition', ruling: null, match: { regulation_ids: ['10.20.40.70(1)'] }, evidence: ['front yard'] });
    const r = U.checkUniverse(i);
    const row = r.scoped.find((x: Json) => x.regulation_id === '10.20.20.100(1)');
    expect([row.reason, row.rule_id, row.shadowed]).toEqual(['administrative_no_application_effect', 'SR-ADMIN', ['SR-NONRES', 'SR-IN']]);
  });
  it('parseRulings reads RATIFIED / PROPOSED / RETIRED from the register', () => {
    const m = U.parseRulings('| **M-31** | a | b | c | RATIFIED 2026-10-06 (decision 2) |\n| **M-9** | a | b | c | PROPOSED |\n| ~~M-19~~ | RETIRED → P-1. | | | RETIRED |\n| | *Dated note* | | | RATIFIED 2026-10-07 |');
    expect([...m.entries()]).toEqual([['M-31', 'RATIFIED'], ['M-9', 'PROPOSED'], ['M-19', 'RETIRED']]);
  });
  it('selfTest covers every reason code', () => {
    expect(U.selfTest().results.filter((x: Json) => !x.ok)).toEqual([]);
  });
});

describe('--accept --ruling: every pin moves through one door (Spec 68 §8 rule 7)', () => {
  const ruled = () => {
    const i = U.fixtureInputs();
    i.universe.scope_rules[2].ruling = 'M-31';
    i.universe.page_rules[0].ruling = 'M-47';
    return i;
  };
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-s5-accept-'));
  it('refuses a ruling that is not RATIFIED', () => {
    expect(() => U.acceptUniverse({ root: tmp(), ruling: 'M-90', inputs: ruled() })).toThrow(/ruling_not_ratified/);
  });
  it('refuses while any row or page rule awaits a ruling', () => {
    expect(() => U.acceptUniverse({ root: tmp(), ruling: 'M-31', inputs: U.fixtureInputs() })).toThrow(/awaiting_ruling/);
  });
  it('writes universe.lock.json + a universe_pin ledger row; the pinned universe then PASSES, and a tampered lock FAILS', () => {
    const root = tmp();
    const inputs = ruled();
    const { lock } = U.acceptUniverse({ root, ruling: 'M-31', inputs });
    const lockText = fs.readFileSync(path.join(root, U.LOCK_REL), 'utf8');
    expect(lockText).toBe(SNAP.stableStringify(lock));
    expect(lockText.includes('\r')).toBe(false);
    const ledger = JSON.parse(fs.readFileSync(path.join(root, U.LEDGER_REL), 'utf8'));
    expect(ledger.rows.map((x: Json) => [x.kind, x.ruling, x.anchor])).toEqual([['universe_pin', 'M-31', '**M-31**']]);
    expect(lock.in_scope).toBe(2);
    const pass = U.checkUniverse({ ...inputs, lock, ledger });
    expect([pass.status, pass.violations]).toEqual(['pass', []]);
    const flipped = JSON.parse(JSON.stringify(inputs));
    flipped.rows.push({ article: '10.20.40.80', kind: 'regulation', page: 'ch10_20', regulation_id: '10.20.40.80(1)', verbatim: '(1) Separation the main walls' });
    const fail = U.checkUniverse({ ...flipped, lock, ledger });
    expect(fail.status).toBe('fail');
    expect(codes(fail.violations)).toEqual(['universe_lock_mismatch']);
  });
  it('a lock pinned under an older adoption is not_run (re-pin), never a silent pass', () => {
    const root = tmp();
    const inputs = ruled();
    const { lock } = U.acceptUniverse({ root, ruling: 'M-31', inputs });
    const r = U.checkUniverse({ ...inputs, adoptionId: 'adoption-2', lock, ledger: { rows: [] } });
    expect(r.status).toBe('not_run');
    expect(r.notes.join(' ')).toMatch(/universe_lock_stale/);
  });
});

describe('census zone set comes from vocab.json `zone` (S11 census arm, folded at S5)', () => {
  const CATALOG = { parcels: ['exception_number', 'zoning_class', 'zoning_overlays'] };
  const SQL = "WITH base AS (SELECT p.zoning_class AS zone, p.zoning_class = ANY ($1::text[]) AS residential FROM parcels p)\nSELECT 'database' AS kind, NULL::text AS zone, NULL::integer AS exception_number, current_database() AS label, NULL::bigint AS n\nUNION ALL SELECT 'source_rows', NULL, NULL, 'parcels', count(*) FROM base\n";
  const ROWS = [
    { kind: 'database', zone: null, exception_number: null, label: 'postgres', n: null },
    { kind: 'source_rows', zone: null, exception_number: null, label: 'parcels', n: '3' },
    { kind: 'residential', zone: 'RD', exception_number: null, label: null, n: '2' },
    { kind: 'no_exception', zone: 'RD', exception_number: null, label: null, n: '2' },
    { kind: 'unzoned', zone: null, exception_number: null, label: null, n: '1' },
  ];
  function root(zones: string[]) {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-s5-census-'));
    const seeds = path.join(r, 'scripts/seeds/bylaw');
    fs.mkdirSync(seeds, { recursive: true });
    fs.mkdirSync(path.join(r, 'docs/reports/witness'), { recursive: true });
    fs.writeFileSync(path.join(r, 'docs/reports/witness/_catalog.json'), JSON.stringify({ tables: CATALOG }));
    fs.writeFileSync(path.join(seeds, 'adoptions.json'), JSON.stringify({ adoptions: [{ adoption_id: 'adoption-1' }] }));
    fs.writeFileSync(path.join(seeds, 'census.sql'), SQL);
    fs.writeFileSync(path.join(seeds, 'vocab.json'), JSON.stringify({ zone: zones }));
    return r;
  }
  it('--refresh-census binds vocab.zone as $1 and records residential_zones; checkCensus passes', async () => {
    const r = root(['R', 'RD']);
    const seen: unknown[] = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] };
        if (sql === SQL) {
          seen.push(params);
          return { rows: ROWS };
        }
        return { rows: [] };
      },
      release: () => {},
    };
    const { census } = await C.refreshCensus({ root: r, connect: async () => ({ client, close: async () => {} }) });
    expect(seen).toEqual([[['R', 'RD']]]);
    expect(census.residential_zones).toEqual(['R', 'RD']);
    const ok = await C.checkCensus({ root: r });
    expect([ok.status, ok.violations]).toEqual(['pass', []]);
  });
  it('known-bad: census_zone_set_mismatch when vocab.zone changes after the census ran', async () => {
    const r = root(['R', 'RD']);
    const census = C.buildCensus({ rows: ROWS, sqlBlobSha: C.gitBlobSha(Buffer.from(SQL, 'utf8')), adoptionId: 'adoption-1', reads: { parcels: ['zoning_class'] }, residentialZones: ['R', 'RD'] });
    fs.writeFileSync(path.join(r, 'scripts/seeds/bylaw/census.json'), SNAP.stableStringify(census));
    fs.writeFileSync(path.join(r, 'scripts/seeds/bylaw/vocab.json'), JSON.stringify({ zone: ['R', 'RD', 'RS'] }));
    const bad = await C.checkCensus({ root: r });
    expect(bad.status).toBe('fail');
    expect(codes(bad.violations)).toEqual(['census_zone_set_mismatch']);
  });
});
