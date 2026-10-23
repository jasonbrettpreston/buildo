/**
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the logical row shape), §9 N6a, §10
 * Handbook:  CHAT-77.freeze (operator 2026-10-22, ~/Buildo-scratch/chat-decisions/2026-10-22-batch-z14.json): the Spec 134 §3 logical Layer 2
 *            result row is FROZEN; Phase 3 builds against it through one accessor (scripts/lib/maxbld-layer2-view.js); any change to a logical
 *            field needs a new ruling; the physical form (Q-P) may change behind the accessor without touching Phase 3.
 *
 * Pins the accessor's output fields to exactly the frozen list, through the one constructor (fromLogicalRows; form C is gone under CHAT-80.QP / R-JR), so a later
 * storage change cannot silently add, drop, rename or reorder a field. STRICT RED FIRST: ran against the missing FROZEN_RESULT_FIELDS export
 * (~/Buildo-scratch/p3build/red-freeze.txt).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS surface
const ROOT = path.resolve(__dirname, '../../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const V = require(path.join(ROOT, 'scripts/lib/maxbld-layer2-view.js')) as Json;

/** The frozen logical result row (CHAT-77.freeze). Spelled out here on purpose: a change to the accessor must fail this test, not follow it. */
const FROZEN = [
  'status', 'reason', 'value', 'value_kind', 'winner_unit_id', 'winner_layer', 'evidence_kind', 'evidence_ref', 'inputs_used', 'losers', 'disclosures',
];
/** The nine fields the ruling itself names (CHAT-77.freeze context). */
const RULED_NINE = ['status', 'reason', 'value', 'value_kind', 'evidence_kind', 'evidence_ref', 'winner_unit_id', 'losers', 'inputs_used'];
const PERMITTED = { detached_house: { status: 'permitted' } };

describe('CHAT-77.freeze: the accessor output is exactly the frozen logical row', () => {
  it('exports the frozen list, equal to the pinned one, in order', () => {
    expect(V.FROZEN_RESULT_FIELDS).toEqual(FROZEN);
    expect(Object.isFrozen(V.FROZEN_RESULT_FIELDS)).toBe(true);
  });

  it('the list contains the nine fields the ruling names, and only winner_layer (Spec 134 §3) and disclosures (Q-H set lookup) beyond them', () => {
    expect(RULED_NINE.filter((f) => !FROZEN.includes(f))).toEqual([]);
    expect(FROZEN.filter((f) => !RULED_NINE.includes(f)).sort()).toEqual(['disclosures', 'winner_layer']);
  });

  it('fromLogicalRows(...).result() returns exactly the frozen keys, whatever extra columns the source row carries', () => {
    const v = V.fromLogicalRows({ lot_gate: null, permitted_by_class: PERMITTED, rows: [{ class: 'detached_house', structure: 'principal', target: 'height_m', status: 'applies', value: 10, value_kind: 'number', extra_physical_column: 'x', cell_id: 'c', by_class: {} }] });
    expect(Object.keys(v.result('detached_house', 'principal', 'height_m'))).toEqual(FROZEN);
  });

  it('the stored form is invisible: rows carrying the option-4 view columns plus any physical extras yield exactly the frozen keys, and fromCellRows is gone (CHAT-80.QP)', () => {
    const row: Json = { class: 'detached_house', structure: 'principal', target: 'height_m', status: 'applies', value: 10, value_kind: 'number', winner_unit_id: 'u', winner_layer: 'base', evidence_kind: 'clause', evidence_ref: 'u', parcel_id: 1, lot_gate: null, row_sha: 'r', unit_key: 7 };
    const v = V.fromLogicalRows({ lot_gate: null, permitted_by_class: PERMITTED, rows: [row] });
    expect(Object.keys(v.result('detached_house', 'principal', 'height_m'))).toEqual(FROZEN);
    expect(V.fromCellRows).toBeUndefined();
    expect(V.entriesFromPointers).toBeUndefined();
  });

  it('the result is immutable, so a consumer cannot add a field either', () => {
    const v = V.fromLogicalRows({ lot_gate: null, permitted_by_class: PERMITTED, rows: [{ class: 'detached_house', structure: 'principal', target: 'height_m', status: 'applies' }] });
    expect(Object.isFrozen(v.result('detached_house', 'principal', 'height_m'))).toBe(true);
  });

  it('Spec 134 §3 still names every frozen column the logical row holds (the spec text is the other half of the pin)', () => {
    const spec = fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/134_resolve_bylaws.md'), 'utf8');
    for (const col of ['status', 'reason', 'value', 'value_kind', 'evidence_kind', 'evidence_ref', 'inputs_used', 'winner_layer', 'winner_unit_id']) expect(spec, col).toContain(col);
    expect(spec).toContain('losers[]');
  });
});
