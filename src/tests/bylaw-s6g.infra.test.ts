// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (pending never fails a gate: at S8, with 0 agreed rows,
//            `--check` exits 0), §7.3 (fixtures from real text), §9 G-SHAPE / G-CLAUSE / G-XREF / G-AGREE / G-PROV
//            ("a Spec 69 parse that yields 0 rulings FAILS"); docs/specs/01-pipeline/69_mcbylaw_policy.md M-39, M-45;
//            docs/reports/mcbylaw-phase1-plan.md S6
//
// S6 authored-field gates on the REAL tree (offline): every fixture is cut from the live slice (current adoption,
// slicer and vocab) and every gate selfTest() runs on it, so drift reds here; every gate runs on the real slice +
// seeds + Spec 69 + the real authored tree: content findings on agreed units are reported (agreement ≠ correctness),
// while a pending unit never carries a violation and is never `failed` (§4); Spec 69 has no duplicate ruling id (lesson 10).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const AU = await load('scripts/analysis/bylaw/authored.mjs');
const FX = await load('scripts/analysis/bylaw/authored-fixtures.mjs');
const AG = await load('scripts/analysis/bylaw/agree.mjs');
const CL = await load('scripts/analysis/bylaw/clause.mjs');
const XR = await load('scripts/analysis/bylaw/xref.mjs');
const SH = await load('scripts/analysis/bylaw/shape.mjs');
const KP = await load('scripts/analysis/bylaw/keyer-prov.mjs');
const UN = await load('scripts/analysis/bylaw/universe.mjs');
const SEEDS = path.join(ROOT, 'scripts', 'seeds', 'bylaw');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

describe('fixtures are cut from the LIVE slice, so slicer / vocab drift reds here (Spec 68 §7.3, §9)', () => {
  const live = FX.liveSlice();
  it('every fixture row id is a row of the live slice', () => {
    const ids = new Set(live.rows.map((r: Json) => r.regulation_id));
    for (const id of FX.FIXTURE_ROW_IDS) expect(ids.has(id), id).toBe(true);
  });
  it('every good-twin unit id resolves in the live slice (a leaf, a clause or #whole)', () => {
    const idx = AU.buildIndex(live);
    for (const [n, u] of Object.entries(FX.GOOD as Record<string, Json>)) expect(AU.unitView(idx, u.unit_id), `${n}: ${u.unit_id}`).not.toBeNull();
  });
  const SELF: [string, () => Json][] = [
    ['G-AGREE', () => AG.selfTest()],
    ['G-CLAUSE', () => CL.selfTest()],
    ['G-XREF', () => XR.selfTest()],
    ['G-SHAPE', () => SH.selfTest()],
    ['G-PROV keyer arm', () => KP.keyerSelfTest()],
    ['G-PROV ruling-id arm', () => KP.rulingSelfTest()],
  ];
  for (const [gate, st] of SELF) {
    it(`${gate} selfTest() passes on the live slice + current vocab`, () => {
      const r = st();
      expect(r.results.filter((x: Json) => !x.ok)).toEqual([]);
      expect(r.pass).toBe(true);
    });
  }
});

describe('the S6 gates on the real authored tree (Spec 68 §4: pending never fails a gate; findings attach to agreed units only)', () => {
  const live = FX.liveSlice();
  const vocab = readJson('scripts/seeds/bylaw/vocab.json');
  const adjudications = readJson('scripts/seeds/bylaw/adjudications.json');
  const external = readJson('scripts/seeds/bylaw/external.json');
  const spec69Text: string = UN.readSpec69Rulings(ROOT);
  const ledgerPath = path.join(SEEDS, 'ratchet-exceptions.json');
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { rows: [] };
  const shards = AU.loadAuthored(ROOT);
  const agree = AG.checkAgree({ shards, adjudications, vocab });
  const units = AG.agreedUnits(agree);
  // Real drafts exist since A1 (4bd4d97e): content findings on AGREED units are real and are reported, not asserted away;
  // what must hold is the §4 contract — a pending unit / row never carries a violation and is never `failed`.
  const pendingIds = new Set([...agree.units].filter(([, r]: [string, Json]) => r.state === 'pending').map(([k]: [string, Json]) => k));
  const agreedRows = new Set([...units.keys()].map((k: string) => AU.splitUnitId(k).reg));
  const rowOf = (id: string) => AU.splitUnitId(id).reg;
  // a violation names an agreed unit, a row holding one, or an authored file (parse / schema level) — never a pending unit
  const attributed = (v: Json) => units.has(v.id) || agreedRows.has(rowOf(v.id)) || agreedRows.has(rowOf(v.id).replace(/@.*$/, '')) || v.id.startsWith(AU.AUTHORED_REL);
  const gates = {
    clause: CL.checkClause({ slice: live, units, vocab, adjudications }),
    xref: XR.checkXref({ slice: live, units, vocab, external }),
    shape: SH.checkShape({ slice: live, shards, vocab, agree }),
  };
  it('G-AGREE passes (the real adjudications.json holds no orphan disagreement)', () => expect(agree.violations).toEqual([]));
  for (const [gate, r] of Object.entries(gates)) {
    it(`G-${gate.toUpperCase()} runs to a closed state; no violation names a pending unit; every one names an agreed unit, its row or an authored file`, () => {
      expect(AU.GATE_STATES).toContain(r.status);
      expect(r.violations.filter((v: Json) => pendingIds.has(v.id))).toEqual([]);
      expect(r.violations.filter((v: Json) => !attributed(v))).toEqual([]);
      if (!units.size) expect(r.violations).toEqual([]); // nothing agreed → nothing to fail
    });
  }
  it('G-SHAPE: a row is failed only if it holds an agreed unit (M-45); with nothing authored every row is pending', () => {
    const r = gates.shape;
    expect(r.counts.failed).toBeLessThanOrEqual(agreedRows.size);
    if (shards.length === 0) expect([r.counts.pending, r.counts.failed]).toEqual([live.rows.length, 0]);
  });
  it('G-PROV keyer arm runs on the real authored tree to a closed state; every violation names a shard on disk', () => {
    const r = KP.checkKeyerProv({ shards, lsTree: KP.gitLsTree(ROOT), headTree: KP.gitLsTree(ROOT)('HEAD') || [], staged: [] });
    expect(AU.GATE_STATES).toContain(r.status);
    const keys = new Set(shards.map((s: Json) => s.key));
    expect(r.violations.filter((v: Json) => !keys.has(v.id) && !v.id.startsWith(AU.AUTHORED_REL))).toEqual([]);
    if (!shards.length) expect(r.status).toBe('pass');
  });
  it('G-PROV ruling-id arm passes on the real Spec 69, ledger and adjudications (incl. the M-39 entry)', () => {
    const r = KP.checkRulingIds({ spec69Text, ledger, adjudications });
    expect(r.violations).toEqual([]);
    expect(r.counts.rulings).toBeGreaterThan(50);
  });
  it('Spec 69 has no duplicate ruling id (lesson 10: the last row would silently win in parseRulings)', () => {
    expect(KP.duplicateRulings(spec69Text)).toEqual([]);
  });
});

// Spec 69 §1 register moved to 69a (2026-10-07, spec-split move M19). Every ruling reader reads 69a + 69 through ONE
// helper, so the move cannot silently shrink the register a gate parses (G-PROV's "0 rulings FAILS" catches only an
// empty parse; a partial one would pass).
describe('the Spec 69 register lives in 69a and every reader sees all of it (move M19)', () => {
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  it('69a holds the M-rows, Spec 69 holds none, and the helper text parses every M- and P-id', () => {
    const reg = UN.parseRulings(read(UN.SPEC69A_REL));
    const pol = UN.parseRulings(read(UN.SPEC69_REL));
    const all = UN.parseRulings(UN.readSpec69Rulings(ROOT));
    expect([...reg.keys()].filter((id: string) => id.startsWith('M-')).length).toBeGreaterThan(50);
    expect([...pol.keys()].filter((id: string) => id.startsWith('M-'))).toEqual([]);
    for (const id of ['M-0', 'M-19', 'M-56', 'M-72', 'P-1', 'P-8']) expect(all.has(id), id).toBe(true);
    expect(all.size).toBe(reg.size + pol.size);
  });
});
