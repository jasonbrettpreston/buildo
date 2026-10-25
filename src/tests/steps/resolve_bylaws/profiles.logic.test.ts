// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (row shape, write guard, lineage: row_sha), §6 (storage budget), §7 I14;
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IW (sha256 recipe)
// Handbook: Spec 132 §core.9 (R-W: compute is pure); Spec 133 §m.112 (k3_a: Layer 2 storage <= 10 % of the DB); operator CHAT-80.QP (option 4)
//
// The pure pieces of the row lineage in scripts/lib/bylaw-resolution.js that survive option 4: scopePairs (the array order), canonicalText /
// rowSha / verifyRowSha (I14), jsonbText (Q-I), storageWithinBudget (Spec 134 §6). Profiles, pointers, gated cell keys, signature ids and set ids
// were removed by CHAT-80.QP (their tests with them).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js module surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rb = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const sha = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/** The scope pairs in scope order: structures in declared order, each structure's targets in declared (sorted) order. */
const PAIRS: Array<{ structure: string; target: string }> = (SCOPE.structures as string[]).flatMap((structure) => (SCOPE.targets[structure] as string[]).map((target) => ({ structure, target })));

describe('R-JA: scopePairs — the pointer order is the scope seed order', () => {
  it('lists every (structure, target) of layer2-scope.json, structures first, 53 today', () => {
    expect(rb().scopePairs(SCOPE)).toEqual(PAIRS);
    expect(PAIRS).toHaveLength(53);
  });
});

describe('Spec 134 §3, §7 I14: row_sha is the sha256 of the canonical result columns', () => {
  const COLS = ['a', 'b', 'c', 'd'];
  const row = (): Json => ({ a: 'x', b: 1.5, c: ['q', 'p'], d: null, chain_run_id: 9, table_version: 't', evaluator_version: 'e', resolved_at: 'now' });

  it('canonicalText renders null as empty, numbers by String, booleans t/f, arrays joined by U+001E, columns joined by U+001F', () => {
    expect(rb().canonicalText({ a: 'x', b: 1.5, c: ['q', 'p'], d: null, e: true }, ['a', 'b', 'c', 'd', 'e'])).toBe(['x', '1.5', 'q\u001ep', '', 't'].join('\u001f'));
  });

  it('rowSha is sha256 of canonicalText, ignores columns outside the list (chain_run_id, versions, timestamps are outside the guard)', () => {
    const r = row();
    expect(rb().rowSha(r, COLS)).toBe(sha(rb().canonicalText(r, COLS)));
    expect(rb().rowSha({ ...r, chain_run_id: 10, table_version: 'u', evaluator_version: 'f', resolved_at: 'later' }, COLS)).toBe(rb().rowSha(r, COLS));
  });

  it('changes when any result column changes (a direct row edit is detected, I14)', () => {
    const base = rb().rowSha(row(), COLS);
    for (const patch of [{ a: 'y' }, { b: 1.6 }, { c: ['p', 'q'] }, { d: 0 }]) expect(rb().rowSha({ ...row(), ...patch }, COLS), JSON.stringify(patch)).not.toBe(base);
  });

  it('a column that does not exist on the row throws (a result column is never silently absent)', () => {
    expect(() => rb().rowSha({ a: 'x' }, ['a', 'zz'])).toThrow(/zz/);
  });

  it('verifyRowSha: true for a stored row_sha that matches, false after an edit', () => {
    const r = { ...row(), row_sha: rb().rowSha(row(), COLS) };
    expect(rb().verifyRowSha(r, COLS)).toBe(true);
    expect(rb().verifyRowSha({ ...r, b: 2 }, COLS)).toBe(false);
  });
});

describe('Spec 134 §6, R-JA: the storage budget check (resolve_bylaws_storage_budget_mb, POST)', () => {
  it('within the budget when measured bytes <= budget MB (MB = 1,048,576 bytes); the ratio is reported', () => {
    expect(rb().storageWithinBudget(500 * 1048576, 500)).toEqual({ ok: true, measured_mb: 500, budget_mb: 500, ratio: 1 });
    expect(rb().storageWithinBudget(500 * 1048576 + 1, 500).ok).toBe(false);
    expect(rb().storageWithinBudget(0, 500).ratio).toBe(0);
  });

  it('refuses a budget that is not a positive number and bytes that are not a non-negative number (never defaulted)', () => {
    for (const b of [0, -1, NaN, null, undefined, '5']) expect(() => rb().storageWithinBudget(1, b), String(b)).toThrow(/budget/);
    for (const m of [-1, NaN, null, undefined]) expect(() => rb().storageWithinBudget(m, 5), String(m)).toThrow(/bytes/);
  });
});

describe('Q-I: the canonical text renders a jsonb column as its Postgres ::text so SQL can recompute row_sha for every table', () => {
  it('jsonbText: keys by length then bytes, ", " and ": " separators, arrays in order, strings JSON-escaped, null as null', () => {
    expect(rb().jsonbText({ b: 1, a: [1, 'x'], cc: null, d: { z: true } })).toBe('{"a": [1, "x"], "b": 1, "d": {"z": true}, "cc": null}');
    expect(rb().jsonbText([])).toBe('[]');
    expect(rb().jsonbText({})).toBe('{}');
    expect(rb().jsonbText('a"b')).toBe('"a\\"b"');
    expect(rb().jsonbText([{ unit_id: 'u', dropped_by: 'x', by: null }])).toBe('[{"by": null, "unit_id": "u", "dropped_by": "x"}]');
  });

  it('canonicalText takes a kinds map: a jsonb column is its jsonbText (an array too), a plain array is a text[] joined by U+001E', () => {
    const row = { a: [{ k: 1 }], b: ['p', 'q'], c: { y: 1, x: 2 } };
    expect(rb().canonicalText(row, ['a', 'b', 'c'], { a: 'jsonb', c: 'jsonb' })).toBe(['[{"k": 1}]', 'p\u001eq', '{"x": 2, "y": 1}'].join('\u001f'));
  });

  it('a jsonb column without its kind is refused when its value is an object (never rendered two ways)', () => {
    expect(() => rb().canonicalText({ c: { y: 1 } }, ['c'])).toThrow(/jsonb/);
  });
});

