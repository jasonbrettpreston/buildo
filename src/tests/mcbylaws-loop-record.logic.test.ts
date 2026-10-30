// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (every round writes exactly one loop record; a record is bound by hash and never rewritten)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 2 (record trimmed, G68-01; binding R4-10; got_sha G68-11; add-only G68-06)
// Red first. Pure checks except writeRecordExclusive, which writes only into a temp dir (cleaned up in afterAll).
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-record.mjs'));

type Case = { id: string; status: string; got_sha: string };
type LoopRecordShape = {
  schema: string;
  increment: string;
  round: number;
  decision: string;
  reason: string;
  accepted_findings: Record<string, unknown>[];
  cases: Case[];
  inputs: Record<string, string>;
  binding?: { sha256: string };
};
type Bound = LoopRecordShape & { binding: { sha256: string } };
type NameStatus = { s: string; p: string };

const HEX64 = 'a'.repeat(64);
const OTHER_HEX64 = 'b'.repeat(64);

function goodRecord(): Bound {
  const rec: LoopRecordShape = {
    schema: 'loop-record-v1',
    increment: '3',
    round: 1,
    decision: 'accept',
    reason: 'every in-scope case green, floors held',
    accepted_findings: [{ id: 'F-1', ruling: 'M-321' }],
    cases: [
      { id: 'c-alpha', status: 'pass', got_sha: HEX64 },
      { id: 'c-beta', status: 'pending', got_sha: OTHER_HEX64 },
    ],
    inputs: { 'scripts/analysis/mcbylaws-loop/loop-record.mjs': 'blob-record', 'mcbylaws/loop/round.json': 'blob-round' },
  };
  return M.bindRecord(rec) as Bound;
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-loop-record-'));

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('canon: canonical JSON, key order independent, arrays in order', () => {
  it('object key order does not change the canonical string', () => {
    expect(M.canon({ b: 1, a: 2 })).toBe(M.canon({ a: 2, b: 1 }));
    expect(M.canon({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it('nested objects sort recursively and there is no whitespace', () => {
    expect(M.canon({ z: { y: [1, { b: 1, a: 2 }], x: 'v' } })).toBe('{"z":{"x":"v","y":[1,{"a":2,"b":1}]}}');
  });
  it('arrays keep their order (two orders are two strings)', () => {
    expect(M.canon([1, 2])).not.toBe(M.canon([2, 1]));
    expect(M.canon([2, 1])).toBe('[2,1]');
  });
  it('undefined values are dropped, not written as null', () => {
    expect(M.canon({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('sha256: a string is hashed as utf8, anything else through canon', () => {
  it('a string and an object hash differently', () => {
    expect(M.sha256('abc')).not.toBe(M.sha256({ 0: 'a', 1: 'b', 2: 'c' }));
  });
  it('the object hash is the canon hash (key order independent)', () => {
    expect(M.sha256({ b: 1, a: 2 })).toBe(M.sha256({ a: 2, b: 1 }));
    expect(M.sha256({ a: 2, b: 1 })).toBe(M.sha256('{"a":2,"b":1}'));
  });
  it('64 lowercase hex both ways', () => {
    expect(M.sha256('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(M.sha256({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('gotSha: the three members, missing as null, numbers never re-formatted', () => {
  it('key-order permutations of the members give the same sha', () => {
    const one = M.gotSha({ status: 'pass', value: 1, reason: 'ok' });
    const two = M.gotSha({ reason: 'ok', value: 1, status: 'pass' });
    expect(one).toBe(two);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changing any one member changes the sha', () => {
    const base = M.gotSha({ status: 'pass', value: 1, reason: 'ok' });
    expect(M.gotSha({ status: 'fail', value: 1, reason: 'ok' })).not.toBe(base);
    expect(M.gotSha({ status: 'pass', value: 2, reason: 'ok' })).not.toBe(base);
    expect(M.gotSha({ status: 'pass', value: 1, reason: 'no' })).not.toBe(base);
  });
  it('a missing member is a written null, not an absent key', () => {
    expect(M.gotSha({ status: 'pass', value: 1 })).toBe(M.gotSha({ status: 'pass', value: 1, reason: null }));
    expect(M.gotSha({ status: 'pass', value: 1 })).not.toBe(M.gotSha({ status: 'pass', value: 1, reason: 'ok' }));
  });
  it('numbers are not re-formatted: 1 and "1" and 1.5 each hash apart', () => {
    const n1 = M.gotSha({ status: 'pass', value: 1, reason: 'ok' });
    expect(M.gotSha({ status: 'pass', value: '1', reason: 'ok' })).not.toBe(n1);
    expect(M.gotSha({ status: 'pass', value: 1.5, reason: 'ok' })).not.toBe(n1);
    expect(M.gotSha({ status: 'pass', value: 1, reason: 'ok' })).toBe(n1);
  });
});

describe('recordPath / nextRound: the round file is named from the increment and the round number', () => {
  it('zero-pads the round to two digits under the increment', () => {
    expect(M.recordPath('3', 1)).toBe('docs/reports/loop-records/3/round-01.json');
    expect(M.recordPath('6b', 12)).toBe('docs/reports/loop-records/6b/round-12.json');
  });
  it('RECORD_RE matches what recordPath writes', () => {
    expect(M.RECORD_RE.test(M.recordPath('3', 7))).toBe(true);
    expect(M.RECORD_RE.test('docs/reports/loop-records/3/round-07.txt')).toBe(false);
  });
  it('no records yet: round 1', () => {
    expect(M.nextRound([], '3')).toBe(1);
  });
  it('round-09 then round-10: 10 is the max (numeric, not lexical), so 11', () => {
    const paths = [M.recordPath('3', 9), M.recordPath('3', 10), M.recordPath('3', 2)];
    expect(M.nextRound(paths, '3')).toBe(11);
  });
  it('another increment is ignored', () => {
    const paths = [M.recordPath('3', 1), M.recordPath('4', 8)];
    expect(M.nextRound(paths, '3')).toBe(2);
    expect(M.nextRound(paths, '4')).toBe(9);
  });
});

describe('bindRecord: the record is bound by the hash of itself without the binding', () => {
  it('a fresh binding then checkRecordShape is green', () => {
    const rec = goodRecord();
    expect(rec.binding.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(M.checkRecordShape(rec)).toEqual([]);
  });
  it('the binding does not change the record', () => {
    const rec = goodRecord();
    expect(rec.increment).toBe('3');
    expect(rec.cases).toHaveLength(2);
    expect(rec.inputs['mcbylaws/loop/round.json']).toBe('blob-round');
  });
  it('re-binding an already-bound record gives the same hash', () => {
    const rec = goodRecord();
    const again = M.bindRecord(rec) as Bound;
    expect(again.binding.sha256).toBe(rec.binding.sha256);
  });
  const edits: [string, (r: Bound) => void][] = [
    ['reason', (r) => { r.reason = 'a hand edit'; }],
    ['decision', (r) => { r.decision = 'revert'; }],
    ['round', (r) => { r.round = 5; }],
    ['increment', (r) => { r.increment = '4'; }],
    ['schema', (r) => { r.schema = 'loop-record-v0'; }],
    ['cases status', (r) => { r.cases[0]!.status = 'fail'; }],
    ['cases got_sha', (r) => { r.cases[0]!.got_sha = OTHER_HEX64; }],
    ['accepted_findings', (r) => { r.accepted_findings.push({ id: 'F-2' }); }],
    ['inputs blob', (r) => { r.inputs['mcbylaws/loop/round.json'] = 'blob-other'; }],
    ['inputs added path', (r) => { r.inputs['mcbylaws/loop/new.json'] = 'blob-new'; }],
  ];
  for (const [label, edit] of edits) {
    it(`a hand edit of ${label} after binding is a record_binding_mismatch`, () => {
      const rec = goodRecord();
      edit(rec);
      expect(M.checkRecordShape(rec)).toContain('record_binding_mismatch');
    });
    it(`the same record without the ${label} edit passes`, () => {
      expect(M.checkRecordShape(goodRecord())).toEqual([]);
    });
  }
});

describe('checkRecordShape: every field is checked, one code per fault', () => {
  it('a missing schema is record_shape:schema', () => {
    const rec = goodRecord();
    delete (rec as Partial<LoopRecordShape>).schema;
    expect(M.checkRecordShape(rec)).toContain('record_shape:schema');
  });
  it('a wrong schema value is record_shape:schema', () => {
    const rec = goodRecord();
    rec.schema = 'loop-record-v2';
    expect(M.checkRecordShape(rec)).toContain('record_shape:schema');
  });
  it('an increment that is not a string is record_shape:increment', () => {
    const rec = goodRecord();
    (rec as Record<string, unknown>).increment = 3;
    expect(M.checkRecordShape(rec)).toContain('record_shape:increment');
  });
  it('round 0 and round 1.5 and round "1" are record_shape:round', () => {
    for (const bad of [0, 1.5, '1', -1]) {
      const rec = goodRecord();
      (rec as Record<string, unknown>).round = bad;
      expect(M.checkRecordShape(rec)).toContain('record_shape:round');
    }
  });
  it('a decision outside accept|revert is record_shape:decision', () => {
    const rec = goodRecord();
    rec.decision = 'maybe';
    expect(M.checkRecordShape(rec)).toContain('record_shape:decision');
  });
  it('a reason that is not a string is record_shape:reason', () => {
    const rec = goodRecord();
    (rec as Record<string, unknown>).reason = 42;
    expect(M.checkRecordShape(rec)).toContain('record_shape:reason');
  });
  it('accepted_findings holding a non-object is record_shape:accepted_findings', () => {
    const rec = goodRecord();
    rec.accepted_findings.push('F-3' as unknown as Record<string, unknown>);
    expect(M.checkRecordShape(rec)).toContain('record_shape:accepted_findings');
  });
  it('a case with a bad status is record_shape:cases', () => {
    const rec = goodRecord();
    rec.cases.push({ id: 'c-gamma', status: 'skipped', got_sha: HEX64 });
    expect(M.checkRecordShape(rec)).toContain('record_shape:cases');
  });
  it('a case without a 64-hex got_sha is record_shape:cases', () => {
    const rec = goodRecord();
    rec.cases.push({ id: 'c-gamma', status: 'pass', got_sha: 'abc' });
    expect(M.checkRecordShape(rec)).toContain('record_shape:cases');
  });
  it('inputs with a non-string value is record_shape:inputs', () => {
    const rec = goodRecord();
    (rec.inputs as Record<string, unknown>)['mcbylaws/loop/round.json'] = { blob: 'x' };
    expect(M.checkRecordShape(rec)).toContain('record_shape:inputs');
  });
  it('a trimmed v1 field (floors) is an unknown field, never stored', () => {
    const rec = goodRecord();
    (rec as Record<string, unknown>).floors = { ok: true };
    expect(M.checkRecordShape(rec)).toContain('record_shape:unknown_field:floors');
  });
  it('a trimmed v1 field (canary) is an unknown field, never stored', () => {
    const rec = goodRecord();
    (rec as Record<string, unknown>).canary = 'red';
    expect(M.checkRecordShape(rec)).toContain('record_shape:unknown_field:canary');
  });
  it('a record with no binding at all is a record_binding_mismatch', () => {
    const rec = goodRecord();
    delete (rec as Partial<LoopRecordShape>).binding;
    expect(M.checkRecordShape(rec)).toEqual(['record_binding_mismatch']);
  });
});

describe('checkBound: every input is bound and nothing bound is stale', () => {
  const inputs: Record<string, string> = {
    'mcbylaws/loop/a.json': 'blob-a',
    'mcbylaws/loop/b.json': 'blob-b',
  };
  it('every input present and unchanged is green', () => {
    const treeBlobs = { 'mcbylaws/loop/a.json': 'blob-a', 'mcbylaws/loop/b.json': 'blob-b' };
    expect(M.checkBound({ inputs, treeBlobs, changedBound: [] })).toEqual([]);
  });
  it('an input the record does not bind is input_not_bound:<path>', () => {
    const treeBlobs = { 'mcbylaws/loop/a.json': 'blob-a', 'mcbylaws/loop/b.json': 'blob-b' };
    expect(M.checkBound({ inputs, treeBlobs, changedBound: ['mcbylaws/loop/c.json'] })).toEqual(['input_not_bound:mcbylaws/loop/c.json']);
  });
  it('a bound input whose blob moved is stale_green:<path>', () => {
    const treeBlobs = { 'mcbylaws/loop/a.json': 'blob-a-moved', 'mcbylaws/loop/b.json': 'blob-b' };
    expect(M.checkBound({ inputs, treeBlobs, changedBound: ['mcbylaws/loop/a.json'] })).toEqual(['stale_green:mcbylaws/loop/a.json']);
  });
  it('a bound input gone from the tree is stale_green:<path>', () => {
    const treeBlobs = { 'mcbylaws/loop/b.json': 'blob-b' };
    expect(M.checkBound({ inputs, treeBlobs, changedBound: [] })).toEqual(['stale_green:mcbylaws/loop/a.json']);
  });
  it('no changedBound given checks every bound input: a matching tree is green', () => {
    const treeBlobs = { 'mcbylaws/loop/a.json': 'blob-a', 'mcbylaws/loop/b.json': 'blob-b' };
    expect(M.checkBound({ inputs, treeBlobs })).toEqual([]);
  });
  it('no changedBound given checks every bound input: a moved blob is stale_green', () => {
    const treeBlobs = { 'mcbylaws/loop/a.json': 'blob-a', 'mcbylaws/loop/b.json': 'blob-b-moved' };
    expect(M.checkBound({ inputs, treeBlobs })).toEqual(['stale_green:mcbylaws/loop/b.json']);
  });
});

describe('checkRecordsAddOnly: a record is added, never modified or deleted (G68-06)', () => {
  const a: NameStatus = { s: 'A', p: 'docs/reports/loop-records/3/round-02.json' };
  const m: NameStatus = { s: 'M', p: 'docs/reports/loop-records/3/round-01.json' };
  const d: NameStatus = { s: 'D', p: 'docs/reports/loop-records/3/round-03.json' };
  const elsewhere: NameStatus = { s: 'M', p: 'mcbylaws/loop/round.json' };
  it('adds only is green', () => {
    expect(M.checkRecordsAddOnly([a, elsewhere])).toEqual([]);
  });
  it('a modified record names the record', () => {
    expect(M.checkRecordsAddOnly([a, m])).toEqual(['record_modified_or_deleted:docs/reports/loop-records/3/round-01.json']);
  });
  it('a deleted record names the record', () => {
    expect(M.checkRecordsAddOnly([a, d])).toEqual(['record_modified_or_deleted:docs/reports/loop-records/3/round-03.json']);
  });
});

describe('writeRecordExclusive: the add-only door on disk', () => {
  it('writes round-01.json under the increment, two-space JSON with a final newline', () => {
    const rel = M.writeRecordExclusive(TMP, goodRecord());
    expect(rel).toBe('docs/reports/loop-records/3/round-01.json');
    const text = fs.readFileSync(path.join(TMP, rel), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "schema": "loop-record-v1",');
    expect(JSON.parse(text).schema).toBe('loop-record-v1');
  });
  it('a second write of the same round throws (the record is never rewritten)', () => {
    expect(() => M.writeRecordExclusive(TMP, goodRecord())).toThrow();
  });
  it('another round of the same increment writes fine', () => {
    const next = M.bindRecord({ ...goodRecord(), round: 2 }) as Bound;
    expect(M.writeRecordExclusive(TMP, next)).toBe('docs/reports/loop-records/3/round-02.json');
  });
});
