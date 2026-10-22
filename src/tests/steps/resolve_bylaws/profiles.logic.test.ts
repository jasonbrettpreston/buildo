// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (row shape, write guard, lineage: row_sha), §6 (storage budget), §7 I14;
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JA (form C: the lot link row points at its per-target
//            results through ONE profile key; operator CHAT-69.Q1 `2026-10-22-batch-z6`), R-IN (cell_id), R-IW (sha256 recipe)
// Handbook: Spec 132 §x-rulings.4 (R-JA); Spec 132 §core.9 (R-W: compute is pure); Spec 133 §m.112 (k3_a: Layer 2 storage <= 10 % of the DB)
//
// The pure pieces of form C and the row lineage in scripts/lib/bylaw-resolution.js: profileKey, packPointers / unpackPointers,
// gatedCellKey, signatureId, canonicalText / rowSha / verifyRowSha (I14), storageWithinBudget (Spec 134 §6).
// RED FIRST (Spec 124 R-BA): run before the functions existed (docs/reports/red-evidence/resolve_bylaws/step-red.json).

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
const cellOf = (p: { structure: string; target: string }): string => sha(`cell\t${p.structure}\t${p.target}`);

describe('R-JA: scopePairs — the pointer order is the scope seed order', () => {
  it('lists every (structure, target) of layer2-scope.json, structures first, 53 today', () => {
    expect(rb().scopePairs(SCOPE)).toEqual(PAIRS);
    expect(PAIRS).toHaveLength(53);
  });
});

describe('R-JA: the profile key and the pointer bytes', () => {
  const entries = (): Array<Json> => PAIRS.map((p) => ({ ...p, cell_id: cellOf(p) }));

  it('profile_id = sha256 of the sorted "<structure>\\t<target>\\t<cell_id>" lines, independent of entry order', () => {
    const lines = entries().map((e) => `${e.structure}\t${e.target}\t${e.cell_id}`).sort().join('\n');
    expect(rb().profileKey(entries())).toBe(sha(lines));
    expect(rb().profileKey([...entries()].reverse())).toBe(rb().profileKey(entries()));
  });

  it('a different result for one target gives a different profile; the same lines give the same', () => {
    const a = entries();
    const b = entries();
    b[3] = { ...b[3], cell_id: sha('another') };
    expect(rb().profileKey(a)).not.toBe(rb().profileKey(b));
    expect(rb().profileKey(a)).toBe(rb().profileKey(entries()));
  });

  it('packPointers writes 32 bytes per pair in scope order (53 x 32 = 1,696 bytes) and unpack restores the entries', () => {
    const buf: Buffer = rb().packPointers(PAIRS, entries());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(53 * 32);
    expect(buf.subarray(0, 32).toString('hex')).toBe(cellOf(PAIRS[0]!));
    expect(buf.subarray(32 * 52).toString('hex')).toBe(cellOf(PAIRS[52]!));
    expect(rb().unpackPointers(buf, PAIRS)).toEqual(entries());
  });

  it('packing does not depend on the entry order; a missing, duplicate or foreign entry throws', () => {
    expect(rb().packPointers(PAIRS, [...entries()].reverse()).equals(rb().packPointers(PAIRS, entries()))).toBe(true);
    expect(() => rb().packPointers(PAIRS, entries().slice(1))).toThrow(/missing/);
    expect(() => rb().packPointers(PAIRS, [...entries(), entries()[0]])).toThrow(/duplicate/);
    expect(() => rb().packPointers(PAIRS, [...entries().slice(1), { structure: 'principal', target: 'not_a_target', cell_id: sha('x') }])).toThrow(/not in scope|missing/);
  });

  it('a cell_id that is not a hex sha256 is refused; unpack refuses bytes of the wrong length', () => {
    const bad = entries();
    bad[0] = { ...bad[0], cell_id: 'nothex' };
    expect(() => rb().packPointers(PAIRS, bad)).toThrow(/sha256/);
    expect(() => rb().unpackPointers(Buffer.alloc(31), PAIRS)).toThrow(/length/);
  });
});

describe('Spec 134 §5: the gated cell key — a gated result is shared by every lot with the same gate', () => {
  it('depends on structure, target and the full status text only', () => {
    const k = (structure: string, target: string, status: string): string => rb().gatedCellKey({ structure, target }, status).cell_id;
    expect(k('principal', 'height_m', 'not_evaluated:ambiguous_zone')).toMatch(/^[0-9a-f]{64}$/);
    expect(k('principal', 'height_m', 'not_evaluated:ambiguous_zone')).toBe(k('principal', 'height_m', 'not_evaluated:ambiguous_zone'));
    expect(k('principal', 'height_m', 'not_evaluated:ambiguous_zone')).not.toBe(k('garden_suite', 'height_m', 'not_evaluated:ambiguous_zone'));
    expect(k('principal', 'height_m', 'not_evaluated:ambiguous_zone')).not.toBe(k('principal', 'fsi', 'not_evaluated:ambiguous_zone'));
    expect(k('principal', 'height_m', 'not_evaluated:exception_not_authored:900.3.10(1)')).not.toBe(k('principal', 'height_m', 'not_evaluated:exception_not_authored:900.3.10(2)'));
  });

  it('never collides with a computed cell key for the same structure and target (a different line set)', () => {
    const computed = rb().cellKey({ zone: 'RD', exception: null }, [], { structure: 'principal', target: 'height_m' }).cell_id;
    expect(rb().gatedCellKey({ structure: 'principal', target: 'height_m' }, 'not_evaluated:ambiguous_zone').cell_id).not.toBe(computed);
  });
});

describe('Spec 134 §3: signature id — the candidate set once (R-IN: zone and exception fix it at one table_version)', () => {
  it('is sha256 of the sorted unit ids, one per line, independent of order and duplicates', () => {
    const ids = ['b#1', 'a#2', 'c#3'];
    expect(rb().signatureId(ids)).toBe(sha(['a#2', 'b#1', 'c#3'].join('\n')));
    expect(rb().signatureId([...ids].reverse())).toBe(rb().signatureId(ids));
    expect(rb().signatureId([...ids, 'a#2'])).toBe(rb().signatureId(ids));
    expect(rb().signatureId(ids)).not.toBe(rb().signatureId(['a#2', 'b#1']));
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
