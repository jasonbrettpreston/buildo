// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.12, P5.15 (answer reconciliation);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6 (the evaluator and the lot vector);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-42 (lot vector), M-50 (building type)
//
// Golden-lot end-to-end harness (lane e2e-verify-1, 2026-10-20): runs the committed evaluator on real-lot inputs
// snapshotted in src/tests/fixtures/bylaw-golden-lots/lots.json. No DB. The unit assembly is the production one
// shared with scripts/analysis/bylaw-validation/eval-lots.mjs (assembly.mjs) and validate.mjs G-EVAL: agreed units (agree.mjs,
// adjudications applied) + generated fields (authored.mjs) + displacement links (xref.mjs) + makeContext(evaluator
// vocab, enactments, absences, exception authoring state). Nothing here re-implements a by-law rule: a check only
// reads what the evaluator returns. Erasable TypeScript only, so `node` can import it directly.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface

export interface GoldenLot {
  id: string;
  cats: string[];
  address: string;
  lot: Json;
  stored: Json;
}

export interface Scenario {
  building_type: string;
  flags?: Json;
  vars?: Json;
  /** M-159(3) / M-244: the specific uses the lot has (a unit scoped to one applies only on such a lot) */
  uses?: string[];
}

export type Check =
  | { kind: 'reach'; unit: string; lot: string; scenario: Scenario }
  | { kind: 'loaded'; unit: string; lot: string; scenario: Scenario }
  | { kind: 'excluded'; unit: string; lot: string; scenario: Scenario; why: string }
  | { kind: 'not_applied'; unit: string; lot: string; scenario: Scenario; target: string }
  | { kind: 'value'; unit: string; lot: string; scenario: Scenario; target: string;
      expect: { status?: string; value?: number | string | null; winner?: string; applied_includes?: boolean; disclosure_match?: string; uncapped?: boolean; unit_applies?: boolean } };

export interface Assembly {
  /** vocab design_choice_disclosure.default_overrides (M-173 / M-176(1) / M-197): the operator-fixed design choices, taken_as */
  defaults: Json;
  E: Json;
  C: Json;
  units: Json[];
  byId: Map<string, Json>;
}

const UNITS_OF: Record<string, number> = { detached_house: 1, semi_detached_house: 1, semi_detached_houseplex: 2, detached_houseplex: 3, townhouse: 4,
  garden_suite: 1, laneway_suite: 1, ancillary_building: 1, apartment_building: 6 };

export async function loadAssembly(root: string): Promise<Assembly> {
  // the shared real-lot assembly (scripts/analysis/bylaw-validation/assembly.mjs), the one eval-lots.mjs uses
  const S: Json = await import(pathToFileURL(path.join(root, 'scripts/analysis/bylaw-validation/assembly.mjs')).href);
  const { I, E, units, C } = await S.loadRealLotAssembly(root);
  const defaults: Json = {};
  for (const [k, v] of Object.entries((I.vocab.design_choice_disclosure || {}).default_overrides || {})) if (k !== '$comment' && v && typeof (v as Json).taken_as === 'boolean') defaults[k] = (v as Json).taken_as;
  return { defaults, E, C, units, byId: new Map((units as Json[]).map((u) => [u.unit_id, u])) };
}

/**
 * The lot vector for one scenario: the snapshotted lot, the operator-fixed design choices (vocab default_overrides, as
 * the Spec 78 P5 step will supply them), then the scenario's building type, unit count and flags.
 */
export function vectorOf(g: GoldenLot, s: Scenario, defaults: Json = {}): Json {
  const units = UNITS_OF[s.building_type] ?? 1;
  return { ...g.lot, building_type: s.building_type, vars: { ...g.lot.vars, dwelling_units: units, ...(s.vars || {}) }, flags: { ...defaults, ...g.lot.flags, ...(s.flags || {}) }, ...(s.uses ? { uses: s.uses } : {}) };
}

const idOf = (a: unknown): string => (typeof a === 'string' ? a : ((a as Json)?.unit_id || (a as Json)?.id || ''));

/** Runs one check; returns pass plus what was observed (the evidence recorded in cases.json). */
export function runCheck(A: Assembly, lots: Map<string, GoldenLot>, c: Check): { pass: boolean; observed: Json } {
  const g = lots.get(c.lot);
  if (!g) return { pass: false, observed: { error: `no golden lot ${c.lot}` } };
  const u = A.byId.get(c.unit);
  if (!u) return { pass: false, observed: { error: `no agreed unit ${c.unit}` } };
  const lot = vectorOf(g, c.scenario, A.defaults);
  const { candidates } = A.E.loadCandidates(lot, A.units);
  const candidate = candidates.some((x: Json) => x.unit_id === c.unit);
  const ap = A.E.applies(lot, u, A.C);
  const reachObs = { candidate, applies: ap.ok, why: ap.why || ap.reason || null };
  const reached = candidate && ap.ok !== false;
  if (c.kind === 'reach') return { pass: reached, observed: reachObs };
  if (c.kind === 'loaded') return { pass: candidate, observed: reachObs };
  if (c.kind === 'excluded') return { pass: candidate && ap.ok === false && String(ap.why || '').includes(c.why), observed: reachObs };
  let r: Json;
  try { r = A.E.effective(lot, c.target, candidates, A.C); } catch (err) { return { pass: false, observed: { ...reachObs, error: String((err as Error).message).slice(0, 200) } }; }
  const applied = (r.applied || []).map(idOf).filter(Boolean);
  const winner = r.winner ? idOf(r.winner) || null : null;
  const disclosures = (r.disclosures || []).map((d: unknown) => (typeof d === 'string' ? d : JSON.stringify(d)));
  const obs = { ...reachObs, status: r.status, value: r.value ?? null, reason: r.reason ?? null, winner, applied, disclosures };
  if (c.kind === 'not_applied') return { pass: reached && !applied.includes(c.unit), observed: obs };
  const e = c.expect;
  // a value check needs the answer's unit to reach the lot, unless the expectation is that it does not apply
  // (a label it tests is absent, a map-area literal reading sets it aside): then unit_applies:false is asserted instead
  let pass = e.unit_applies === false ? candidate && ap.ok === false : reached;
  if (e.status !== undefined && r.status !== e.status) pass = false;
  if (e.value !== undefined) {
    const v = r.value ?? null;
    if (e.value === null || typeof e.value === 'string' ? v !== e.value : (typeof v !== 'number' || Math.abs(v - e.value) > 1e-6)) pass = false;
  }
  if (e.winner !== undefined && winner !== e.winner) pass = false;
  if (e.uncapped === true && !(r.status === 'not_applicable' || r.value === 'unlimited' || r.value === 'unregulated')) pass = false;
  if (e.applied_includes !== undefined && applied.includes(c.unit) !== e.applied_includes) pass = false;
  if (e.disclosure_match !== undefined && !disclosures.some((d: string) => d.includes(e.disclosure_match as string))) pass = false;
  return { pass, observed: obs };
}
