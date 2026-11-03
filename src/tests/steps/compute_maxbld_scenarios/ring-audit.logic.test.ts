// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 18, 19.5, 19.7)
//
// MB-31 · E31-01 oracle-only brief B0d (part 5 of 5). RED FIRST: the frozen ring oracle fixture and the C5 modules
// (`scripts/lib/compute/maxbld/rows.js`, `neighbour-facts.js`) do not exist yet.
//   B11b the fixture `src/tests/fixtures/layer3/ring-oracle/facts-264.jsonl` is frozen by sha256 and shape.
//   The pinned ring audit (FS-SB2a, MB-18 (j)) reproduces the Q4 figures: `front_setback_used_m` scored against
//   the oracle's required setback, under six ring depths / minimum-n / lot subsets, MAE and share-within-1 m.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const FIXTURE = 'src/tests/fixtures/layer3/ring-oracle/facts-264.jsonl';
const FIXTURE_SHA = '5360d069e9a884a468da986253f1bead59d7d0af42ad5a4ab60f7aa95b97e573';
const KEYS = ['k', 'app', 'parcel', 'required', 'corner', 'own', 'street_n', 'street_median', 'zone_n', 'zone_median', 'roots', 'ring'];
const RING_KEYS = ['lvl', 'id', 'root', 'est'];
const SHA_INPUTS = 'sha256';
const SCORE_DECIMALS = 2;
const PERCENT = 100;

// MB-31, operator answer CARD-mb31-inc1-blockers (blocker 1): MB-18 (j) adds the Layer 2 target front_setback_fallback_m to vocab.json. Until it lands this audit declares it here (unit m) so the one lot that reaches the stored fallback reads its fixture cell. REMOVE this override when (j) lands.
const withFallbackTarget = (vocab: Json): Json => ({ ...vocab, dsl_target: { ...vocab.dsl_target, front_setback_fallback_m: { unit: 'm' } } });

const loadSeeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: withFallbackTarget(readJson('scripts/seeds/bylaw/vocab.json')),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
});

const cell = (n: number): Json => ({ s: 'applies', kind: 'number', value: n, clause: 'fixture', reason: null });

const roundTo = (x: number): number => {
  const f = Math.pow(10, SCORE_DECIMALS);
  return Math.round(x * f) / f;
};

const CASES: { name: string; depth: number; minN: number; keep: (l: Json) => boolean; mae: number; w1: number }[] = [
  { name: 'depth 1, min-n 1', depth: 1, minN: 1, keep: () => true, mae: 1.28, w1: 56 },
  { name: 'depth 2, min-n 1', depth: 2, minN: 1, keep: () => true, mae: 1.10, w1: 63 },
  { name: 'depth 3, min-n 1', depth: 3, minN: 1, keep: () => true, mae: 1.13, w1: 61 },
  { name: 'depth 2, min-n 2', depth: 2, minN: 2, keep: () => true, mae: 1.16, w1: 60 },
  { name: 'corner lots, depth 1', depth: 1, minN: 1, keep: (l) => l.corner, mae: 1.65, w1: 49 },
  { name: 'corner lots, depth 2', depth: 2, minN: 1, keep: (l) => l.corner, mae: 1.29, w1: 69 },
  { name: 'odd k, depth 1', depth: 1, minN: 1, keep: (l) => l.k % 2 === 1, mae: 1.40, w1: 54 },
  { name: 'odd k, depth 2', depth: 2, minN: 1, keep: (l) => l.k % 2 === 1, mae: 1.23, w1: 60 },
  { name: 'even k, depth 1', depth: 1, minN: 1, keep: (l) => l.k % 2 === 0, mae: 1.16, w1: 58 },
  { name: 'even k, depth 2', depth: 2, minN: 1, keep: (l) => l.k % 2 === 0, mae: 0.97, w1: 67 },
];

describe('MB-31 ring oracle fixture (B11b)', () => {
  let raw: string;
  let lots: Json[];
  beforeAll(() => {
    raw = fs.readFileSync(path.join(ROOT, FIXTURE), 'utf8');
    lots = raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Json);
  });

  it('sha256 of the fixture file is the frozen digest', () => {
    expect(crypto.createHash(SHA_INPUTS).update(raw).digest('hex')).toBe(FIXTURE_SHA);
  });

  it('264 JSON lines, each with the declared keys and ring entries of the declared shape', () => {
    expect(lots).toHaveLength(264);
    for (const lot of lots) {
      expect(Object.keys(lot).sort()).toEqual([...KEYS].sort());
      for (const r of lot.ring) expect(Object.keys(r).sort()).toEqual([...RING_KEYS].sort());
    }
  });
});

describe('MB-31 pinned ring audit, FS-SB2a (waits B5, C1 seeds, MB-18 (j))', () => {
  let SEEDS: Json;
  let R: Json;
  let NF: Json;
  let lots: Json[];

  beforeAll(() => {
    SEEDS = loadSeeds();
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    NF = req(path.join(ROOT, 'scripts/lib/compute/maxbld/neighbour-facts.js')) as Json;
    lots = fs
      .readFileSync(path.join(ROOT, FIXTURE), 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Json);
  });

  const frontSetback = (lot: Json, depth: number, minN: number): Json => {
    const ring = lot.ring
      .filter((r: Json) => r.lvl >= 2 && r.lvl <= depth)
      .sort((a: Json, b: Json) => a.lvl - b.lvl || a.id - b.id)
      .map((r: Json) => ({ id: r.id, est: r.est }));
    const facts = NF.neighbourFacts(
      {
        user: [],
        neighbours: [{ id: 0, est: null, bldg_m: 1, est_status: 'estimate_negative', same_street: true, residential: true }],
        own: lot.own,
        street: [],
        zone: [],
        ring,
        bt_units: 1,
      },
      cell(15),
    ).facts;
    facts.street_n = lot.street_n;
    facts.zone_n = lot.zone_n;
    if (lot.street_median !== null) facts.street_median_m = lot.street_median;
    if (lot.zone_median !== null) facts.zone_median_m = lot.zone_median;
    return R.runRow('front_setback_used_m', {
      seeds: SEEDS,
      facts,
      l2: { front_setback_fallback_m: cell(6.0) },
      settings: { fya_placeholder_ring_min_n: { value: minN } },
    });
  };

  for (const c of CASES) {
    it(`${c.name}: mae ${c.mae} and ${c.w1}% within 1 m`, () => {
      const scored = lots.filter(c.keep).map((lot) => ({ lot, out: frontSetback(lot, c.depth, c.minN) }));
      expect(scored.length).toBeGreaterThan(0);
      for (const { lot, out } of scored) expect(out.status, `k=${lot.k}`).toBe('computed');
      const errs = scored.map(({ lot, out }) => Math.abs((out.value as number) - (lot.required as number)));
      const mae = roundTo(errs.reduce((a, b) => a + b, 0) / errs.length);
      const w1 = Math.round((PERCENT * errs.filter((e) => e <= 1).length) / errs.length);
      expect(mae).toBe(c.mae);
      expect(w1).toBe(c.w1);
    });
  }
});
