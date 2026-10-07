// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-21 (12 UNVERIFIED legacy claims retired; legacy C/L/G/H ids
//            rewritten once to regulation_id; absence claims re-derived once), M-20 (S13 one source);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (no permanent alias field), §6.1 (external refs);
//            docs/reports/mcbylaw-phase1-plan.md S12
//
// S12 live checks: the committed legacy-id map (docs/reports/mcbylaw-legacy-id-map.{json,md}) equals the map
// regenerated from Spec 67 at its pinned blob, the live slice (adoption-3) and the authored decisions, with zero
// violations; and TOTALITY BOTH DIRECTIONS against the legacy id ranges Spec 67 defines (C1–C76, L1–L28, G1–G23,
// A1, H1–H28): every legacy id maps, every mapped id is a legacy id, every fragment key exactly once. One-time: this
// file retires with S13 (Spec 68 §9: G-ALIAS is a migration, not a gate).
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const L = await load('scripts/analysis/bylaw/legacy.mjs');

const range = (p: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
const INVENTORY = [...range('C', 76), ...range('L', 28), ...range('G', 23), 'A1', ...range('H', 28)];
const UNVERIFIED = ['C12', 'C13', 'C18', 'C43', 'C44', 'C45', 'C49', 'C52', 'C54', 'C55', 'C58', 'C59'];
const ABSENCE = ['A1', 'C26', 'C37', 'C38', 'C42', 'L3', 'L19', 'L22', 'L24', 'L27', 'L28'];

let result: Json;
let committed: Json;
beforeAll(() => {
  result = L.checkFiles();
  committed = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/reports/mcbylaw-legacy-id-map.json'), 'utf8'));
}, 120_000);

describe('S12 legacy-id map — live', () => {
  it('the committed map and render equal the regeneration, with zero violations', () => {
    expect(result.violations).toEqual([]);
    expect(result.pass).toBe(true);
  });
  it('totality, inventory → map: every legacy id Spec 67 defines has at least one fragment', () => {
    const mapped = new Set(committed.fragments.map((f: Json) => f.legacy_id));
    expect(INVENTORY.filter((id) => !mapped.has(id))).toEqual([]);
    expect(Object.keys(committed.rewrite).sort()).toEqual([...INVENTORY].sort());
  });
  it('totality, map → inventory: no fragment names an id outside the legacy ranges; every key exactly once', () => {
    const inv = new Set(INVENTORY);
    expect(committed.fragments.filter((f: Json) => !inv.has(f.legacy_id)).map((f: Json) => f.key)).toEqual([]);
    const keys = committed.fragments.map((f: Json) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(committed.fragments.every((f: Json) => ['unit', 'row', 'external', 'retired'].includes(f.target.kind))).toBe(true);
  });
  it('the 12 UNVERIFIED C-claims are exactly the source\'s UNVERIFIED rows, and each is wholly retired (M-21)', () => {
    const retired = (id: string) => committed.fragments.filter((f: Json) => f.legacy_id === id).every((f: Json) => f.target.reason === 'unverified_claim');
    const marked = [...new Set(committed.fragments.filter((f: Json) => f.target.reason === 'unverified_claim').map((f: Json) => f.legacy_id))];
    expect(marked.sort()).toEqual([...UNVERIFIED].sort());
    expect(UNVERIFIED.filter((id) => !retired(id))).toEqual([]);
    expect(committed.counts.unverified_claims_retired).toBe(12);
  });
  it('every absence claim is re-derived once on the current pinned pages and holds', () => {
    expect(committed.absence.map((a: Json) => a.legacy_id).sort()).toEqual([...ABSENCE].sort());
    expect(committed.absence.filter((a: Json) => !a.holds).map((a: Json) => a.legacy_id)).toEqual([]);
    expect(committed.absence.every((a: Json) => a.probes.length > 0 && a.probes.every((p: Json) => Number.isInteger(p.count)))).toBe(true);
  });
  it('H26–H28 map to external refs REF-1..3 (proposed for external.json)', () => {
    expect(['H26', 'H27', 'H28'].map((id) => committed.rewrite[id])).toEqual([['REF-1'], ['REF-2'], ['REF-3']]);
    expect(committed.proposed_refs.map((r: Json) => r.id)).toEqual(['REF-1', 'REF-2', 'REF-3']);
  });
  it('every legacy id Specs 58 §13 / 67 / 78 §5 reference is in the inventory (S13 can rewrite all of them)', () => {
    const inv = new Set(INVENTORY);
    const refs = Object.values(committed.references as Record<string, Record<string, number>>).flatMap((m) => Object.keys(m));
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((id) => !inv.has(id))).toEqual([]);
  });
  it('every unit / row target is a live slice id', () => {
    const inputs = L.loadInputs();
    const units = new Set(inputs.slice.rows.flatMap((r: Json) => r.clauses.filter((c: Json) => c.leaf).map((c: Json) => `${r.regulation_id}#${c.path}`)));
    const rows = new Set(inputs.slice.rows.map((r: Json) => r.regulation_id));
    const bad = committed.fragments.filter((f: Json) => (f.target.kind === 'unit' && !units.has(f.target.id)) || (f.target.kind === 'row' && !rows.has(f.target.id)));
    expect(bad.map((f: Json) => f.key)).toEqual([]);
  }, 120_000);
});
