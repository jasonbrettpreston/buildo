// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 5 (blind double-keying per shard), §10 determinism;
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (wave 1 = the top 220 by INCLUDE-closed lots; wave 2 = the
//            rest of the ≥ census.min_direct_lots set);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-103 (leaf grain), M-137 (lead-in groups frozen once drafted);
//            .cursor/mcbylaw/phase2-plan-v2.md P2-7 (wave 2), §D.2 (≈ 25 units by lot weight; INCLUDE targets first);
//            operator 2026-10-14 (W2 tooling: build now, key after W1 lands; the 3 amended rows held — Q-W2d = a).
//
// The wave-2 (W2) overlay of the keying harness, pure arm: planWave(W1) is planWave1 (W1 unchanged); W2 has no shard 0,
// every W2 INCLUDE target must be a W1 member (satisfied) else refused; held rows are excluded with a recorded reason;
// a drafted shard is never re-cut (Q-F freeze).
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const K = await load('scripts/analysis/bylaw/keying.mjs');
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** A minimal Ch.900 slice (same shape as bylaw-w1-keying.logic.test.ts): leaves become slice units. */
function exceptionSlice(spec: Record<string, [string, string][]>) {
  const rows: Json[] = [];
  const units: Json[] = [];
  for (const [rid, cl] of Object.entries(spec)) {
    const m = /^900\.(\d)\.10\((\d+)\)$/.exec(rid);
    const page = `ch900_${m![1]}`;
    const clauses = cl.map(([p, text]) => ({ path: p, text }));
    const verbatim = cl.map((c) => c[1]).join(' ');
    rows.push({ regulation_id: rid, page, article: `900.${m![1]}.10`, section: `900.${m![1]}`, article_title: 'Exceptions for RM Zone', kind: 'regulation', clauses, verbatim, sha256: sha(verbatim), refs: [], literals: [], tags: [] });
    for (const c of clauses) {
      if (clauses.some((x) => x !== c && K.isAncestorPath(c.path, x.path))) continue;
      const context = clauses.filter((x) => K.isAncestorPath(x.path, c.path)).map((x) => x.text);
      units.push({ unit_id: `${rid}#${c.path}`, regulation_id: rid, page, clause_path: c.path, context, text: c.text, sha256: sha([...context, c.text].join(' ')), origin: 'clause' });
    }
  }
  return { rows, units };
}
const rm = (n: number, extra: [string, string][] = []): [string, string][] => [
  [`(${n})`, `(${n}) Exception RM ${n} The lands are subject to the following Site Specific Provisions:`],
  [`(${n})[SSP]`, 'Site Specific Provisions:'],
  [`(${n})[SSP](A)`, '(A) The minimum lot area is:'],
  [`(${n})[SSP](A)(i)`, '(i) 465 square metres for a detached house;'],
  [`(${n})[SSP](A)(ii)`, '(ii) 665 square metres for a semi-detached house;'],
  [`(${n})[SSP](B)`, '(B) The maximum height is 9.5 metres;'],
  ...extra,
];
const SL = () =>
  exceptionSlice({
    '900.6.10(18)': rm(18),
    '900.6.10(20)': rm(20), // a W1 member: the INCLUDE target of 900.6.10(30)
    '900.6.10(30)': rm(30, [[`(30)[SSP](C)`, '(C) The lands must comply with Exception RM 20;']]),
    '900.3.10(5)': rm(5),
    '900.3.10(7)': rm(7),
  });
const ids = (sl: Json) => new Set(sl.rows.map((r: Json) => r.regulation_id));
const W1_MEMBERS = ['900.6.10(20)'];
const W2_RANKING = [
  { regulation_id: '900.3.10(5)', rank: 221, closed_lots: 272, includes: [] },
  { regulation_id: '900.6.10(30)', rank: 222, closed_lots: 250, includes: ['900.6.10(20)'] },
  { regulation_id: '900.6.10(18)', rank: 223, closed_lots: 200, includes: [] },
  { regulation_id: '900.3.10(7)', rank: 224, closed_lots: 100, includes: [] },
];
const w2 = (over: Json = {}) => K.planWave({ batch: 'W2', slice: SL(), inScopeIds: ids(SL()), ranking: W2_RANKING, satisfiedBy: W1_MEMBERS, maxUnits: 4, ...over });

describe('planWave — W1 is planWave1 unchanged (the W1 output stays byte-identical)', () => {
  it('planWave({batch: W1}) === planWave1 on the same inputs', () => {
    const R = [
      { regulation_id: '900.3.10(5)', rank: 1, closed_lots: 900, includes: [] },
      { regulation_id: '900.6.10(30)', rank: 2, closed_lots: 800, includes: ['900.6.10(20)'] },
      { regulation_id: '900.6.10(20)', rank: 3, closed_lots: 500, includes: [] },
    ];
    const args = { slice: SL(), inScopeIds: ids(SL()), ranking: R, e5Ids: ['900.3.10(5)'], maxUnits: 4 };
    expect(JSON.stringify(K.planWave({ batch: 'W1', ...args }))).toBe(JSON.stringify(K.planWave1(args)));
  });
});

describe('planWave — W2 (phase2-plan-v2 P2-7)', () => {
  it('no shard 0: wave shards 1…N, keys `.w2-sNN`, batch W2, leaf grain, every unit once', () => {
    const p = w2();
    expect(p.batch).toBe('W2');
    expect(p.grain).toBe('leaf');
    const ws = p.shards.map((s: Json) => s.wave_shard);
    expect(ws).toEqual(ws.map((_: number, i: number) => i + 1));
    for (const s of p.shards) expect(s.key).toMatch(/^ch900_[2-6]\/900\.[2-6]\.10\.w2-s\d{2}(\.c\d+)?$/);
    const units = p.shards.flatMap((s: Json) => s.units.map((u: Json) => u.unit_id));
    expect(new Set(units).size).toBe(units.length);
    expect(p.totals).toMatchObject({ exceptions: 4, held_exceptions: 0, units: units.length, shards: p.shards.length, wave_shards: p.shards.length });
    expect(p.totals).not.toHaveProperty('shard0_units');
  });

  it('an INCLUDE target in W1 is satisfied (recorded, not outside the wave); W1 rows are never planned in W2', () => {
    const p = w2();
    expect(p.include).toEqual({ cycles: [], edges: 0, outside_wave: [], prior_wave: 'W1', satisfied: ['900.6.10(30) → 900.6.10(20)'] });
    expect(p.shards.flatMap((s: Json) => s.regulation_ids)).not.toContain('900.6.10(20)');
  });

  it('refuses an INCLUDE target outside W1 and outside W2 (w2_include_outside_w1) — both directions', () => {
    expect(() => w2({ satisfiedBy: [] })).toThrow(/w2_include_outside_w1/);
    expect(() => w2()).not.toThrow();
  });

  it('a held row is excluded with its recorded reason; its units are absent; a hold on a non-member is refused', () => {
    const held = [{ regulation_id: '900.6.10(18)', reason: 'amended_pending', by: '206-2026' }];
    const p = w2({ held });
    expect(p.held).toEqual([{ by: '206-2026', closed_lots: 200, rank: 223, reason: 'amended_pending', regulation_id: '900.6.10(18)' }]);
    expect(p.shards.flatMap((s: Json) => s.regulation_ids)).not.toContain('900.6.10(18)');
    expect(p.totals).toMatchObject({ exceptions: 3, held_exceptions: 1 });
    expect(() => w2({ held: [{ regulation_id: '900.6.10(99)', reason: 'amended_pending', by: '206-2026' }] })).toThrow(/w2_held_unknown/);
    expect(() => w2({ held: [{ regulation_id: '900.6.10(18)', reason: '', by: '206-2026' }] })).toThrow(/w2_held_unknown/);
  });

  it('an INCLUDE into a HELD row is refused (the includer cannot be keyed against superseded text)', () => {
    const R = W2_RANKING.map((e) => (e.regulation_id === '900.3.10(7)' ? { ...e, includes: ['900.6.10(18)'] } : e));
    expect(() => w2({ ranking: R })).not.toThrow();
    expect(() => w2({ ranking: R, held: [{ regulation_id: '900.6.10(18)', reason: 'amended_pending', by: '206-2026' }] })).toThrow(/w2_include_outside_w1/);
  });

  it('W2 refuses an E-5 / shard-0 list; planBatch refuses W2', () => {
    expect(() => w2({ e5Ids: ['900.3.10(5)'] })).toThrow(/w2_no_shard0/);
    expect(() => K.planBatch({ slice: SL(), inScopeIds: ids(SL()), batch: 'W2' })).toThrow(/batch_planner/);
    expect(K.OVERLAY_BATCHES.map((b: Json) => b.id)).toEqual(expect.arrayContaining(['W1', 'W2']));
  });

  it('Q-F freeze applies to W2: a drafted shard that would re-plan differently is refused (w2_drafted_shard_moved); unchanged passes', () => {
    const p = w2();
    const first = { key: p.shards[0].key, unit_ids: p.shards[0].units.map((u: Json) => u.unit_id) };
    expect(() => w2({ drafted: [first] })).not.toThrow();
    expect(() => w2({ drafted: [{ ...first, unit_ids: first.unit_ids.slice(1) }] })).toThrow(/w2_drafted_shard_moved/);
  });

  it('deterministic whatever the slice row order', () => {
    const sl = SL();
    sl.rows.reverse();
    sl.units.reverse();
    const b = K.planWave({ batch: 'W2', slice: sl, inScopeIds: ids(sl), ranking: W2_RANKING, satisfiedBy: W1_MEMBERS, maxUnits: 4 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(w2()));
  });
});

describe('checkHolds — an amended-pending hold is valid only while its enacting by-law is pinned and NOT sliced', () => {
  const H = [{ regulation_id: '900.3.10(1007)', reason: 'amended_pending', by: '206-2026' }];
  it('pinned + unsliced → ok; sliced (the P2-2 arm landed) → w2_hold_stale; not pinned → w2_hold_stale', () => {
    expect(K.checkHolds({ held: H, pinned: ['206-2026', '650-2026'], sliced: ['63-2024'] })).toEqual([]);
    expect(K.checkHolds({ held: H, pinned: ['206-2026'], sliced: ['206-2026'] })[0]).toMatch(/w2_hold_stale/);
    expect(K.checkHolds({ held: H, pinned: [], sliced: [] })[0]).toMatch(/w2_hold_stale/);
  });
  it('W2_HELD declares exactly the 3 amended wave-2 rows (1007 / 1299 by 206-2026; 317 by 650-2026)', () => {
    expect(K.W2_HELD.map((h: Json) => `${h.regulation_id}<${h.by}`).sort()).toEqual(['900.3.10(1007)<206-2026', '900.3.10(1299)<206-2026', '900.3.10(317)<650-2026']);
    for (const h of K.W2_HELD) expect(h.reason).toBe('amended_pending');
  });
});

describe('waveSeed — W1 seed unchanged; W2 seed carries held + prior-wave satisfaction', () => {
  it('waveSeed(W2) records members, held and include; its $comment names batch W2', () => {
    const held = [{ regulation_id: '900.6.10(18)', reason: 'amended_pending', by: '206-2026' }];
    const plan = w2({ held });
    const ranking = W2_RANKING.filter((e) => e.regulation_id !== '900.6.10(18)');
    const s = K.waveSeed({ plan, ranking, adoptionId: 'x', census: { adoption_id: 'x', sql: { blob_sha: 'y' } }, groups: [] });
    expect(s.batch).toBe('W2');
    expect(s.$comment).toMatch(/plan --batch W2/);
    expect(s.members.map((m: Json) => m.regulation_id)).toEqual(ranking.map((e) => e.regulation_id));
    expect(s.held).toEqual(plan.held);
    expect(s.include.satisfied).toEqual(['900.6.10(30) → 900.6.10(20)']);
  });
});
