// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 (G-AUDIT ancestry pattern, reused by the round runner),
//            §10 (determinism rules); docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (wave 1 = top 220), M-60
//            (evaluator NOT_EVALUATED_CODES incl. exception_not_authored); .cursor/mcbylaw/phase2-plan-v2.md §K.1 E-6,
//            §K.2 K7-R (a)–(d), §K.3, §K.4 (double check), §V (one runner, one record; V-2 oracles; V-4 prereg)
//
// E-6 infra lock: the prereg / round-record schemas, prereg-0's k7r_class_map (total over evaluate.mjs
// NOT_EVALUATED_CODES ∪ the L13 lot gates, both directions), the round verdict rules, the oracle-B independence
// scan, oracle D recorded not_run, the oracle-C slot contract, staleness, and the K.4 double check.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / seed JSON
// A missing module fails every test that uses it (red-first evidence), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const ROOT = process.cwd();
const VR = await load('scripts/analysis/bylaw/validate-round.mjs');
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const VAL = 'scripts/seeds/bylaw/validation';
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const PREREG = fs.existsSync(path.join(ROOT, VAL, 'prereg-0.json')) ? readJson(`${VAL}/prereg-0.json`) : {};

// The L13 lot gates as the plan declares them (phase2-plan-v2 §A.1 L13). layer2-map.json (P2-4) becomes their home;
// until then prereg-0 carries them and this literal pins the copy.
const L13_LOT_GATES = ['none', 'no_569_2013_zone', 'ambiguous_zone', 'lot_metric_missing', 'label_exception_mismatch', 'label_unparsed', 'exception_closure_unauthored'];

describe('schemas', () => {
  it('prereg-0.json validates against prereg.schema.json', () => {
    expect(VR.importError).toBeUndefined();
    expect(VR.schemaViolations(ROOT, 'prereg', PREREG)).toEqual([]);
  });
  it('a prereg missing k7r fails the schema (the schema is not vacuous)', () => {
    const bad = { ...PREREG };
    delete bad.k7r;
    expect(VR.schemaViolations(ROOT, 'prereg', bad).length).toBeGreaterThan(0);
  });
  it('every committed round record validates and re-derives its own verdict (none exist yet is a legal state)', () => {
    const dir = path.join(ROOT, VAL, 'rounds');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
    for (const f of files) {
      const rec = readJson(`${VAL}/rounds/${f}`);
      expect({ f, v: VR.schemaViolations(ROOT, 'record', rec) }).toEqual({ f, v: [] });
      expect({ f, verdict: VR.roundVerdict([...rec.elements, ...Object.values(rec.oracles)]) }).toEqual({ f, verdict: rec.verdict });
      expect(rec.mode).toBe('round');
    }
  });
});

describe('K7-R (a): k7r_class_map is total over NOT_EVALUATED_CODES ∪ the L13 lot gates, both directions', () => {
  it('prereg-0 carries the plan lot-gate set and the real evaluator codes produce no violation', () => {
    expect(E.importError).toBeUndefined();
    expect(PREREG.k7r.lot_gates).toEqual(L13_LOT_GATES);
    const r = VR.checkClassMap({ classMap: PREREG.k7r.class_map, codes: E.NOT_EVALUATED_CODES, lotGates: PREREG.k7r.lot_gates, extra: PREREG.k7r.extra_keys });
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(Object.keys(PREREG.k7r.class_map).length).toBe(E.NOT_EVALUATED_CODES.length + L13_LOT_GATES.length - 1 + PREREG.k7r.extra_keys.length); // no_569_2013_zone is both
  });
  it('direction 1: an evaluator code the map lacks is a violation', () => {
    const r = VR.checkClassMap({ classMap: PREREG.k7r.class_map, codes: [...E.NOT_EVALUATED_CODES, 'brand_new_code'], lotGates: L13_LOT_GATES, extra: PREREG.k7r.extra_keys });
    expect(r.pass).toBe(false);
    expect(r.violations).toContain('k7r_map_missing: brand_new_code');
  });
  it('direction 2: a map key that is neither a code, a lot gate nor a declared extra is a violation', () => {
    const r = VR.checkClassMap({ classMap: { ...PREREG.k7r.class_map, retired_code: 'ii' }, codes: E.NOT_EVALUATED_CODES, lotGates: L13_LOT_GATES, extra: PREREG.k7r.extra_keys });
    expect(r.violations).toContain('k7r_map_unknown_key: retired_code');
  });
  it('a class outside {i, ii, i_if_planned, not_unavailable} is a violation', () => {
    const r = VR.checkClassMap({ classMap: { ...PREREG.k7r.class_map, no_candidate: 'maybe' }, codes: E.NOT_EVALUATED_CODES, lotGates: L13_LOT_GATES, extra: PREREG.k7r.extra_keys });
    expect(r.violations).toContain('k7r_map_bad_class: no_candidate -> maybe');
  });
  it('class (i) = exception_not_authored + exception_closure_unauthored (+ not_modelled:target_not_keyed when planned); lot gate none is not unavailable (plan K.2 a, XR X-14)', () => {
    const m = PREREG.k7r.class_map;
    expect(Object.keys(m).filter((k) => m[k] === 'i').sort()).toEqual(['exception_closure_unauthored', 'exception_not_authored']);
    expect(m['not_modelled:target_not_keyed']).toBe('i_if_planned');
    expect(m.none).toBe('not_unavailable');
  });
});

describe('K7-R (b)/(d): the split and the kill, item- and lot-weighted', () => {
  const map = { ...PREREG.k7r?.class_map };
  const kill = PREREG.k7r?.kill;
  const item = (reason: string | null, lots: number, extra: Json = {}): Json => ({ reason, lot_gate: 'none', lots, zone: 'RD', target: 'height_m', keyed_scope: true, ...extra });
  it('kill thresholds are pre-registered and labelled post hoc beside the original K7', () => {
    expect(kill.ii_item_max).toBe(0.05);
    expect(kill.ii_lot_max).toBe(0.05);
    expect(kill.i_plus_ii_max).toBe(0.2);
    expect(kill.post_hoc).toBe(true);
    expect(kill.original_k7).toEqual({ threshold: 0.2, scope: 'all_items', weight: 'item' });
  });
  it('(ii) at exactly 5 % passes; one more item kills', () => {
    const at = [...Array.from({ length: 95 }, () => item(null, 1)), ...Array.from({ length: 5 }, () => item('missing_input:lot_depth_m', 1))];
    expect(VR.k7rSplit({ items: at, classMap: map, plannedExceptions: [], kill }).verdict).toBe('pass');
    const over = [...Array.from({ length: 94 }, () => item(null, 1)), ...Array.from({ length: 6 }, () => item('missing_input:lot_depth_m', 1))];
    const r = VR.k7rSplit({ items: over, classMap: map, plannedExceptions: [], kill });
    expect(r.verdict).toBe('fail');
    expect(r.kill.fired).toContain('ii_item');
  });
  it('a lot-weighted (ii) breach kills even when the item share is low', () => {
    const r = VR.k7rSplit({ items: [item(null, 10, {}), ...Array.from({ length: 98 }, () => item(null, 1)), item('map_area_not_held:HT', 50)], classMap: map, plannedExceptions: [], kill });
    expect(r.item.share_ii).toBeLessThanOrEqual(0.05);
    expect(r.kill.fired).toContain('ii_lot');
  });
  it('a gated lot counts by its lot gate, never by the evaluator reason (X-14); not_modelled counts (i) only when its exception is in a W1 shard', () => {
    const items = [item('no_candidate', 1, { lot_gate: 'exception_closure_unauthored' }), item('not_modelled:target_not_keyed', 1, { exception: '900.3.10(9999)' }), item('not_modelled:target_not_keyed', 1, { exception: '900.3.10(5)' }), item('not_modelled:target_not_keyed', 1)];
    const r = VR.k7rSplit({ items, classMap: map, plannedExceptions: ['900.3.10(5)'], kill });
    expect(r.item.i).toBe(2);
    expect(r.item.ii).toBe(2);
  });
  it('Q2 (operator 2026-10-14): needs_user_input stays class (ii) until the scenario catalogue (Q12) is ratified', () => {
    expect(map.needs_user_input).toBe('ii');
    expect(PREREG.k7r.notes.needs_user_input).toMatch(/Q12/);
  });
  it('items outside the keyed scope count toward the original K7 only', () => {
    const r = VR.k7rSplit({ items: [item(null, 1), item('missing_input:x', 1, { keyed_scope: false })], classMap: map, plannedExceptions: [], kill });
    expect(r.item.total).toBe(1);
    expect(r.original_k7.unavailable).toBe(1);
    expect(r.original_k7.total).toBe(2);
  });
  it('an unmapped reason is a fail, never silently class (ii)', () => {
    const r = VR.k7rSplit({ items: [item('invented_reason:x', 1)], classMap: map, plannedExceptions: [], kill });
    expect(r.verdict).toBe('fail');
    expect(r.unmapped).toEqual(['invented_reason']);
  });
});

describe('K7-R (c): the structural probe of wave-1 ranks 31–220', () => {
  it('prereg-0 ranks re-derive from the committed seed: 10 distinct ranks inside 31..220', () => {
    const p = PREREG.k7r.probe;
    expect([p.rank_from, p.rank_to, p.n]).toEqual([31, 220, 10]);
    const ranks = VR.probeRanks({ seed: p.seed, from: p.rank_from, to: p.rank_to, n: p.n });
    expect(ranks).toEqual(p.ranks);
    expect(new Set(ranks).size).toBe(10);
    expect(ranks.every((r: number) => r >= 31 && r <= 220)).toBe(true);
    expect(VR.probeRanks({ seed: `${p.seed}x`, from: 31, to: 220, n: 10 })).not.toEqual(ranks);
  });
});

describe('round verdict (§V: pass · fail · not_run; not run is never a pass)', () => {
  const el = (verdict: string): Json => ({ id: 'x', verdict, ...(verdict === 'not_run' ? { reason: 'measurements_absent' } : {}) });
  it('all pass → pass; any fail → fail; otherwise not_run; empty → not_run', () => {
    expect(VR.roundVerdict([el('pass'), el('pass')])).toBe('pass');
    expect(VR.roundVerdict([el('pass'), el('not_run'), el('fail')])).toBe('fail');
    expect(VR.roundVerdict([el('pass'), el('not_run')])).toBe('not_run');
    expect(VR.roundVerdict([])).toBe('not_run');
  });
});

describe('oracles: B independence, C slot, D not_run (operator 2026-10-14)', () => {
  it('the live oracle-b/ tree imports none of the banned modules (compare.mjs is the comparator, exempt)', () => {
    const r = VR.oracleBIndependence(ROOT);
    expect(r.violations).toEqual([]);
    expect(r.checked).toBeGreaterThanOrEqual(3);
  });
  it('the scan catches a static import, a dynamic import and a require of the evaluator', () => {
    const files = [
      { path: 'oracle-b/a.mjs', text: "import { effective } from '../evaluate.mjs';" },
      { path: 'oracle-b/b.mjs', text: "const D = await import('../dsl.mjs');" },
      { path: 'oracle-b/c.mjs', text: "const x = require('../../../lib/compute/resolve-bylaws.js');" },
      { path: 'oracle-b/d.mjs', text: "import { parseExpr } from './expr.mjs';" },
    ];
    expect(VR.importScan(files, { exempt: [] }).violations.map((v: string) => v.split(':')[0])).toEqual(['oracle_b_banned_import', 'oracle_b_banned_import', 'oracle_b_banned_import']);
  });
  it('oracle D is declared unavailable in prereg-0 and always recorded not_run:oracle_unavailable', () => {
    expect(PREREG.oracles.D).toMatchObject({ available: false, verdict: 'not_run', reason: 'oracle_unavailable' });
    expect(VR.oracleD(PREREG)).toEqual({ verdict: 'not_run', reason: 'oracle_unavailable', basis: PREREG.oracles.D.basis });
  });
  it('oracle C slot: absent → input_absent; other table → table_mismatch; same table → counts, not_run:no_preregistered_threshold', () => {
    const pins = { table_sha256: 'aaa' };
    expect(VR.oracleC(null, pins, PREREG).reason).toBe('input_absent');
    const rec = { schema: 'oracle-c-round-v1', oracle_c_version: 'oracle-c-1', inputs: { provisions: { sha256: 'bbb' } }, summary: { n: 3, by_answer: { match: 1, mismatch: 1, not_comparable: 1 } } };
    expect(VR.oracleC({ path: 'x.json', sha256: 's', doc: rec }, pins, PREREG).reason).toBe('table_mismatch');
    const same = VR.oracleC({ path: 'x.json', sha256: 's', doc: { ...rec, inputs: { provisions: { sha256: 'aaa' } } } }, pins, PREREG);
    expect(same).toMatchObject({ verdict: 'not_run', reason: 'no_preregistered_threshold', counts: { n: 3, match: 1, mismatch: 1, not_comparable: 1 } });
    expect(VR.oracleC({ path: 'x.json', sha256: 's', doc: { schema: 'other' } }, pins, PREREG).reason).toBe('input_schema_mismatch');
  });
  it('oracle C slot reads the record oracle-c-run.mjs writes, oracle-c-round-v2 (Spec 133 m.305; pending row CHAT-63.C1 fills the slot)', () => {
    const rec = { schema: 'oracle-c-round-v2', oracle_c_version: 'oracle-c-3', inputs: { provisions: { sha256: 'aaa' } }, summary: { n: 3, by_answer: { match: 1, mismatch: 1, not_comparable: 1 } } };
    expect(VR.oracleC({ path: 'x.json', sha256: 's', doc: rec }, { table_sha256: 'aaa' }, PREREG)).toMatchObject({ verdict: 'not_run', reason: 'no_preregistered_threshold', counts: { n: 3 } });
  });
});

describe('staleness and the K.4 double check', () => {
  const pins: Json = { table_version: 't', evaluator_version: 'e', vocab_version: 'v', oracle_b_sha: 'b', prereg_sha: 'p', class_catalogue_sha: null };
  it('any differing pin makes a record stale; equal pins do not', () => {
    expect(VR.stalePins(pins, { ...pins })).toEqual([]);
    expect(VR.stalePins(pins, { ...pins, evaluator_version: 'e2' })).toEqual(['evaluator_version']);
    expect(VR.stalePins(pins, { ...pins, class_catalogue_sha: 'c' })).toEqual(['class_catalogue_sha']);
  });
  it('a second seat with identical deterministic numbers passes; any difference > 0 fails; none → not_run', () => {
    const rec: Json = { pins, db: { status: 'read', database: 'postgres', counts: { parcels: 10 } }, elements: [{ id: 'k7r_split', verdict: 'pass', counts: { item: { i: 1, ii: 0 } } }] };
    expect(VR.doubleCheck(rec, null)).toEqual({ id: 'double_check', verdict: 'not_run', reason: 'second_seat_absent' });
    expect(VR.doubleCheck(rec, JSON.parse(JSON.stringify(rec))).verdict).toBe('pass');
    const other = JSON.parse(JSON.stringify(rec));
    other.db.counts.parcels = 11;
    const r = VR.doubleCheck(rec, other);
    expect(r.verdict).toBe('fail');
    expect(r.diffs).toEqual(['db.counts.parcels']);
  });
});

describe('the runner itself', () => {
  it('selfTest() passes', () => {
    const r = VR.selfTest();
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
  });
  it('a dry run (no DB, no measurements) builds a schema-valid record whose verdict is not_run, deterministically', async () => {
    const a = await VR.buildRecord({ root: ROOT, round: 0, mode: 'dry_run' });
    const b = await VR.buildRecord({ root: ROOT, round: 0, mode: 'dry_run' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(VR.schemaViolations(ROOT, 'record', a)).toEqual([]);
    expect(a.verdict).toBe('not_run');
    expect(a.oracles.D).toMatchObject({ verdict: 'not_run', reason: 'oracle_unavailable' });
    expect(a.elements.find((x: Json) => x.id === 'k7r_class_map_total').verdict).toBe('pass');
    expect(a.elements.find((x: Json) => x.id === 'k7r_split')).toMatchObject({ verdict: 'not_run', reason: 'measurements_absent' });
    expect(a.disclosures.join(' ')).toMatch(/oracle D/);
  });
});

describe('Q1 (operator 2026-10-14): planned keying is derived from w1-shards.json by path + sha, fail-closed', () => {
  const src = PREREG.k7r?.planned_keying_source ?? {};
  it('prereg-0 names the generated W1 shard plan, never a hand-written list', () => {
    expect(src).toMatchObject({ path: 'scripts/seeds/bylaw/w1-shards.json', step: 'P2-5', grain: 'exception' });
    expect(PREREG.k7r.planned_keying).toBeUndefined();
  });
  it('plannedExceptionsFrom() reads members[].regulation_id; a doc without members is refused', () => {
    expect(VR.plannedExceptionsFrom({ members: [{ regulation_id: '900.3.10(5)' }, { regulation_id: '900.2.10(7)' }] })).toEqual(['900.2.10(7)', '900.3.10(5)']);
    expect(() => VR.plannedExceptionsFrom({ shards: [] })).toThrow(/w1_shards_invalid/);
  });
  it('the binding is stale (fail closed) when the pinned sha is the placeholder null, the file is absent, or the shas differ', () => {
    expect(VR.plannedKeyingBinding({ blob_sha: null }, 'a'.repeat(40))).toBe('stale_pin');
    expect(VR.plannedKeyingBinding({ blob_sha: 'a'.repeat(40) }, null)).toBe('stale_pin');
    expect(VR.plannedKeyingBinding({ blob_sha: 'a'.repeat(40) }, 'b'.repeat(40))).toBe('stale_pin');
    expect(VR.plannedKeyingBinding({ blob_sha: 'a'.repeat(40) }, 'a'.repeat(40))).toBe('bound');
  });
  it('w1_shards_sha is a record pin, so a changed shard plan makes every record stale', () => {
    expect(VR.PIN_KEYS).toContain('w1_shards_sha');
  });
});

describe('Q3 (operator 2026-10-14): k3 limits come from the K5 line and budgets, each cited', () => {
  const k3 = Object.fromEntries((PREREG.k3 ?? []).map((k: Json) => [k.id, k]));
  it('k3_a / k3_b / k3_d carry the K5 limits with a source line; k3_c carries 0', () => {
    expect(k3.k3_a.limits).toEqual([{ key: 'steady_layer2_bytes_share_of_db', max: 0.1, source: expect.stringMatching(/data-measured\.md:157/) }]);
    expect(k3.k3_b.limits.map((l: Json) => [l.key, l.max])).toEqual([['full_resolve_s', 1800], ['incremental_s', 300], ['ms_per_lot_100k_over_20k', 2]]);
    expect(k3.k3_d.limits).toEqual([{ key: 'wal_per_run_share_of_db', max: 0.1, source: expect.stringMatching(/data-measured\.md:158/) }]);
    expect(k3.k3_c.limits.map((l: Json) => [l.key, l.max])).toEqual([['i12_static_miss_lots', 0]]);
    for (const k of Object.values(k3) as Json[]) for (const l of k.limits) expect(l.source.length).toBeGreaterThan(10);
  });
  it('judgeLimits: all present and within → pass; one over → fail; one missing → not_run measurements_absent', () => {
    const limits = [{ key: 'a', max: 1, source: 's' }, { key: 'b', max: 0, source: 's' }];
    expect(VR.judgeLimits(limits, { a: 1, b: 0 })).toEqual({ verdict: 'pass' });
    expect(VR.judgeLimits(limits, { a: 1.01, b: 0 })).toEqual({ verdict: 'fail', over: ['a'] });
    expect(VR.judgeLimits(limits, { a: 1 })).toEqual({ verdict: 'not_run', reason: 'measurements_absent' });
    expect(VR.judgeLimits([], { x: 3 })).toEqual({ verdict: 'pass', label: 'recorded' });
  });
});

describe('Q4 (operator 2026-10-14): commit-heldout — deterministic draw, salt from the environment only', () => {
  const rows = [...Array.from({ length: 5 }, (_, i) => ({ parcel_id: `R${i}`, stratum: 'R' })), ...Array.from({ length: 2 }, (_, i) => ({ parcel_id: `D${i}`, stratum: 'RD' }))];
  it('the salt is read only from MCBYLAW_HELDOUT_SALT and refused when absent or short', () => {
    expect(() => VR.heldoutSaltFromEnv({})).toThrow(/heldout_salt_absent/);
    expect(() => VR.heldoutSaltFromEnv({ MCBYLAW_HELDOUT_SALT: 'short' })).toThrow(/heldout_salt_absent/);
    expect(VR.heldoutSaltFromEnv({ MCBYLAW_HELDOUT_SALT: 'x'.repeat(32) })).toBe('x'.repeat(32));
  });
  it('the draw is deterministic per stratum, exhaustive when a stratum is ≤ n, and salt-dependent', () => {
    const a = VR.drawHeldout({ rows, salt: 's'.repeat(32), nPerStratum: 3 });
    expect(a).toEqual(VR.drawHeldout({ rows: [...rows].reverse(), salt: 's'.repeat(32), nPerStratum: 3 }));
    expect(a.per_stratum).toEqual({ R: { population: 5, drawn: 3 }, RD: { population: 2, drawn: 2 } });
    expect(a.ids.length).toBe(5);
    expect(VR.drawHeldout({ rows, salt: 't'.repeat(32), nPerStratum: 3 }).ids).not.toEqual(a.ids);
  });
  it('the commitment is sha256(sorted ids joined by LF ‖ LF ‖ salt) and verifies at reveal', () => {
    const ids = ['b', 'a'];
    const c = VR.heldoutCommitment(ids, 'salt'.repeat(8));
    expect(c).toMatch(/^[0-9a-f]{64}$/);
    expect(VR.heldoutCommitment(['a', 'b'], 'salt'.repeat(8))).toBe(c);
    expect(VR.heldoutCommitment(['a', 'c'], 'salt'.repeat(8))).not.toBe(c);
  });
  it('applyHeldout writes ONLY heldout.commitment_sha256 + heldout.draw, and never the salt or the ids', () => {
    const salt = 'q'.repeat(40);
    const draw = VR.drawHeldout({ rows, salt, nPerStratum: 3 });
    const text = fs.readFileSync(path.join(ROOT, VAL, 'prereg-0.json'), 'utf8');
    const out = VR.applyHeldout(text, { commitment_sha256: VR.heldoutCommitment(draw.ids, salt), draw: VR.drawParams(draw, { database: 'postgres', nPerStratum: 3 }) });
    const before = JSON.parse(text);
    const after = JSON.parse(out);
    expect({ ...after, heldout: null }).toEqual({ ...before, heldout: null });
    expect(Object.keys(after.heldout).sort()).toEqual(Object.keys(before.heldout).sort());
    expect(after.heldout.rule).toBe(before.heldout.rule);
    expect(after.heldout.draw.per_stratum).toEqual(draw.per_stratum);
    expect(out.includes(salt)).toBe(false);
    for (const id of draw.ids) expect(out.includes(`"${id}"`)).toBe(false);
    expect(VR.schemaViolations(ROOT, 'prereg', after)).toEqual([]);
  });
  it('prereg-0 is stored in the canonical form applyHeldout writes (so the operator diff is the heldout block only)', () => {
    const text = fs.readFileSync(path.join(ROOT, VAL, 'prereg-0.json'), 'utf8').replace(/\r\n/g, '\n');
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  });
  it('reveal: re-drawing with the same salt and population verifies; another salt mismatches; ids in the regression pool are reused', () => {
    const salt = 'r'.repeat(32);
    const draw = VR.drawHeldout({ rows, salt, nPerStratum: 3 });
    const c = VR.heldoutCommitment(draw.ids, salt);
    expect(VR.heldoutStatus({ commitment: c, ids: draw.ids, salt, pool: new Set() })).toBe('verified');
    expect(VR.heldoutStatus({ commitment: c, ids: draw.ids, salt: 'z'.repeat(32), pool: new Set() })).toBe('mismatch');
    expect(VR.heldoutStatus({ commitment: c, ids: draw.ids, salt, pool: new Set([draw.ids[0]]) })).toBe('reused');
  });
});
