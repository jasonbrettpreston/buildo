// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-80
//
// Operator decision 2026-10-13 (R8): when an M-80 re-key generation supersedes a unit's drafts and the new generation
// agrees, the operator's earlier adjudication for that unit has no open disagreement. It is NOT deleted (history stays
// in the ledger) and is NOT an `adjudication_orphan`: it is counted as `adjudications_superseded`, mirroring how
// `superseded_units` counts the old drafts (agree.mjs). An adjudication on a unit that was NOT re-keyed and has no open
// disagreement is still `adjudication_orphan` (the fence kept), and a re-key generation that still disagrees is
// adjudicated normally.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const F = await load('scripts/analysis/bylaw/authored-fixtures.mjs');
const AG = await load('scripts/analysis/bylaw/agree.mjs');

const codesOf = (r: Json) => [...new Set((r.violations as Json[]).map((x: Json) => x.code))];

describe('Spec 69a M-80 (R8) — an adjudication on a RE-KEYED unit is counted superseded, not an orphan', () => {
  const g = F.GOOD['LIMIT×literal'] as Json;
  const UNIT = g.unit_id as string;
  const ADJ = { adjudications: [{ id: 'ADJ-R8', kind: 'disagreement', unit: UNIT, field: 'archetype', adjudicator: 'operator', decision: 'a', reason: 'the clause states a limit, not a permission' }] };

  it('a re-key generation agrees → the ADJ is counted superseded, never an orphan (history kept)', () => {
    const old = F.shardOf([g]) as Json;
    old.b.units[0].archetype = 'PERMIT'; // A/B disagree on archetype in the superseded generation
    const rekey = F.rekeyOf(old, [g]) as Json; // S~r1: A and B agree
    const r = AG.checkAgree({ shards: [old, rekey], adjudications: ADJ });
    expect(codesOf(r)).toEqual([]);
    expect(r.status).toBe('pass');
    expect(r.counts.adjudications_superseded).toBe(1);
    expect(r.counts.superseded_units).toBeGreaterThanOrEqual(1);
    expect(r.counts.units_agreed).toBe(1);
  });

  it('the fence: the same ADJ with no re-key generation and A/B agreeing is still exactly one orphan', () => {
    const s = F.shardOf([g]) as Json; // A and B agree in S
    const r = AG.checkAgree({ shards: [s], adjudications: ADJ });
    expect(codesOf(r)).toEqual(['adjudication_orphan']);
    expect(r.counts.adjudications_superseded).toBe(0);
  });

  it('a re-key generation that still disagrees → the ADJ answers it (adjudicated, not counted superseded)', () => {
    const old = F.shardOf([g]) as Json;
    const rekey = F.rekeyOf(old, [g]) as Json; // S~r1
    rekey.b.units[0].archetype = 'PERMIT'; // the newest generation still carries the open disagreement
    const r = AG.checkAgree({ shards: [old, rekey], adjudications: ADJ });
    expect(codesOf(r)).toEqual([]);
    expect(r.counts.units_adjudicated).toBe(1);
    expect(r.counts.adjudications_superseded).toBe(0);
    expect(r.counts.disagreements_open).toBe(0);
  });
});
