// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (pending never fails a gate: at S8, with 0 agreed rows,
//            `--check` exits 0), §7.3 (fixtures from real text), §9 G-SHAPE / G-CLAUSE / G-XREF / G-AGREE / G-PROV
//            ("a Spec 69 parse that yields 0 rulings FAILS"); docs/specs/01-pipeline/69_mcbylaw_policy.md M-39, M-45;
//            docs/reports/mcbylaw-phase1-plan.md S6
//
// S6 authored-field gates on the REAL tree (offline): every fixture is cut from the live slice (current adoption,
// slicer and vocab) and every gate selfTest() runs on it, so drift reds here; every gate runs on the real slice +
// seeds + Spec 69 and passes with nothing
// authored yet (every in-scope row `pending`, never `failed`); Spec 69 has no duplicate ruling id (lesson 10).
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

describe('the S6 gates on the real tree (nothing authored yet → pass, every row pending)', () => {
  const live = FX.liveSlice();
  const vocab = readJson('scripts/seeds/bylaw/vocab.json');
  const adjudications = readJson('scripts/seeds/bylaw/adjudications.json');
  const external = readJson('scripts/seeds/bylaw/external.json');
  const spec69Text = fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/69_mcbylaw_policy.md'), 'utf8');
  const ledgerPath = path.join(SEEDS, 'ratchet-exceptions.json');
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { rows: [] };
  const shards = AU.loadAuthored(ROOT);
  const agree = AG.checkAgree({ shards, adjudications, vocab });
  const units = AG.agreedUnits(agree);
  it('G-AGREE passes (the real adjudications.json holds no orphan disagreement)', () => expect(agree.violations).toEqual([]));
  it('G-CLAUSE passes', () => expect(CL.checkClause({ slice: live, units, vocab, adjudications }).violations).toEqual([]));
  it('G-XREF passes', () => expect(XR.checkXref({ slice: live, units, vocab, external }).violations).toEqual([]));
  it('G-SHAPE passes; every row is pending (M-45), none failed', () => {
    const r = SH.checkShape({ slice: live, shards, vocab, agree });
    expect(r.violations).toEqual([]);
    expect(r.status).toBe('pass');
    if (shards.length === 0) expect(r.counts.pending).toBe(live.rows.length);
    expect(r.counts.failed).toBe(0);
  });
  it('G-PROV keyer arm passes on the real authored tree', () => {
    const r = KP.checkKeyerProv({ shards, lsTree: KP.gitLsTree(ROOT), headTree: KP.gitLsTree(ROOT)('HEAD') || [], staged: [] });
    expect(r.violations).toEqual([]);
    expect(r.status).toBe(shards.length ? 'pass' : 'pass');
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
