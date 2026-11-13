// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (the server formats), FE-34 (the v21 page contract);
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7; docs/specs/01-pipeline/69a_mcbylaw_register.md M-384 (Layer 3 is stored
//            tables: the preview reads them, never recomputes); Spec 78 section 6.6 rules 1, 5, 8 (hidden states are counted, never cards; null is "—").
//
// MB-93 · the internal preview producer, PURE core: one lot's stored rows -> the v21 page response (`page`, `values`, `hidden`, `not_evaluated`;
// never `synthetic`) plus the admin-only lineage. Operator 2026-11-11 "D-1 b and D-2 to D-8 a"; plan ~/Buildo-scratch/mcfrontend/PREVIEW/plan.md
// section 3 with the section 9 folds (which win).
// - Bindings are DATA: every value part of scripts/surfaces/_schema/report-page.json names a declared field of report-v2.decl.json, and the field's
//   declared `source` says where it is stored: `catalogue:<field_id>` -> parcel_maxbld_scenarios (building type = the option section's scenario
//   before "/", fold 9: no variant column, the variant is the field id), `parcels:<column>` -> the parcels row. A source of any other kind throws.
//   D-46 (orchestrator pre-approved 2026-11-11, option a; dated note, prior text kept): `user_input:<member>` (MF-19's Add lot size entry) is
//   accepted and projected as not evaluated: the preview reads no user input, so it never sends a value, and the lineage names the field.
// - Option visibility (report-presentation.json states): the stored `permitted` row of the type; `hidden` statuses hide the card; `permitted`
//   shows it; `not_evaluated`, `not_modelled` (D-4 a, preview only; customer wording via Spec 128 section 4), an unknown status, no row, the
//   table absent or a gated lot (fold 6) show it as not evaluated. Option numbers are sent only for a permitted card of an ungated lot.
// - A value is sent only for a stored `computed` number (or a finite parcels number) that the FE-05 formatter accepts; anything else is left out
//   and the page shows the ruled null dash. The admin lineage lists each bound field's true status and reason, so no dash is unexplained.
// - Freshness (D-7 a): current / out of date (naming what moved and what is lost) / not stored / gated, and the implausible lot-size flag (fold 7).
import reportPage from '../../../../scripts/surfaces/_schema/report-page.json';
import decl from '../../../../scripts/surfaces/_schema/report-v2.decl.json';
import presentation from '../../../../scripts/surfaces/_schema/report-presentation.json';
import { CONFIDENCE_ORDER, PAGE_RULES, formatPageRule, formatTextRule, TEXT_RULES } from './format';
import type { SeedShas } from './seed-shas';

/** One stored parcel_maxbld_scenarios row (migration 287 draft columns; NUMERIC arrives from pg as a string). */
export interface StoredRow {
  building_type: string;
  field_id: string;
  increment: number | string | null;
  status: string;
  value: number | string | null;
  unit: string | null;
  reason: string | null;
  flags: string[] | null;
  content_sha: string | null;
  catalogue_sha: string | null;
  switchboard_sha: string | null;
  settings_sha: string | null;
  layer2_table_version: string | null;
  /** The readings the row rests on (M-481): each `{id, state, confidence, evidence}`; optional so a row read before the column was selected still types. */
  switches?: Array<{ id?: string; confidence?: string | null }> | null;
}
/** The parcels row of the lot (integer parcels.id, the varchar lookup id, the parcels-sourced columns). */
export interface LotFacts { id: number; parcel_id: string; address: string | null; zoning: string | null; columns: Record<string, unknown> }
/** The lot's Layer 2 stamp (bylaw_resolution_lot_stamps), or null when the lot is not stamped. */
export interface LotStamp { lot_gate: string | null; table_version: string | null; evaluator_version: string | null }

export type Verdict = 'current' | 'out_of_date' | 'not_stored' | 'gated';
export interface Freshness { verdict: Verdict; moved: string[]; lost: string[]; gate: string | null; not_stored_reason: string | null }
export interface LineageField { building_type: string; field_id: string; status: string; value: number | null; unit: string | null; reason: string | null; flags: string[]; increment: string | null }
export interface Lineage {
  parcels_id: number;
  parcel_id: string;
  address: string | null;
  zoning: string | null;
  layer2_table_version: string | null;
  layer2_evaluator_version: string | null;
  layer3: { increments: string[]; catalogue_sha: string[]; switchboard_sha: string[]; settings_sha: string[]; rows: number };
  freshness: Freshness;
  lot_size_implausible: boolean;
  options: Record<string, { building_type: string; stored_status: string | null; shown_as: 'shown' | 'hidden' | 'not_evaluated' }>;
  unbound_types: string[];
  /** D-46: the page fields with a user_input source, projected as not evaluated (never a value). */
  user_inputs_not_evaluated: string[];
  fields: LineageField[];
}
export interface PageResponse { page: string; values: Record<string, string>; hidden: string[]; not_evaluated: string[] }
export interface ProjectInput { lot: LotFacts; stamp: LotStamp | null; rows: StoredRow[] | null; current: SeedShas }

type Json = Record<string, unknown>;
type Source = { kind: 'catalogue'; field_id: string } | { kind: 'parcels'; column: string } | { kind: 'user_input'; member: string };
export interface Binding { section: string; building_type: string | null; key: string; unitPart: boolean; rule: string; field: string; source: Source }

/** Plausible lot size bounds in m² (operator D-7 a, reality F-3: 4,297 lots under 50 m², 1,923 over 5,000 m²); outside them the banner flags it. */
export const LOT_SIZE_PLAUSIBLE_M2 = Object.freeze({ min: 50, max: 5000 });
const LOT_SIZE_COLUMN = 'lot_size_sqm';

const declFields = (): Json[] => {
  const out: Json[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o !== null && typeof o === 'object') {
      const r = o as Json;
      if (typeof r.name === 'string' && typeof r.source === 'string' && typeof r.path === 'string') out.push(r);
      Object.values(r).forEach(walk);
    }
  };
  walk(decl);
  return out;
};

/** The bindings of every value part of the page table, from the page table and the declaration only. Throws on an unknown source.
 *  The arguments default to the committed tables; a test passes its own to prove the refusal (D-46). */
export function pageBindings(page: unknown = reportPage, fields: Json[] = declFields()): Binding[] {
  const out: Binding[] = [];
  for (const s of (page as { sections: Json[] }).sections) {
    for (const p of (Array.isArray(s.parts) ? s.parts : []) as Json[]) {
      if (typeof p.field !== 'string') continue;
      const hits = fields.filter((f) => f.name === p.field);
      const src = String(hits[0]?.source ?? '');
      if (hits.length !== 1) throw new Error(`MB-93: page field ${p.field} is not declared exactly once`);
      const [kind, name] = src.split(':');
      if (!name || (kind !== 'catalogue' && kind !== 'parcels' && kind !== 'user_input')) throw new Error(`MB-93: page field ${p.field} has a source the preview cannot read: ${src}`);
      const source: Source = kind === 'catalogue' ? { kind, field_id: name } : kind === 'parcels' ? { kind, column: name } : { kind, member: name };
      if (kind !== 'user_input') {
        const rule = String(p.rule);
        const known = (PAGE_RULES as readonly string[]).includes(rule) || (TEXT_RULES as readonly string[]).includes(rule) || rule === 'reason_text';
        if (!known) throw new Error(`MB-93: page field ${p.field} has a rule the preview cannot format: ${rule}`);
        if (rule === 'reason_text' && p.field !== 'permitted') throw new Error(`MB-93: the reason_text rule binds the permitted field only (${p.field})`);
      }
      const scenario = typeof s.scenario === 'string' ? s.scenario : null;
      out.push({
        section: String(s.id),
        building_type: s.kind === 'option' && scenario ? (scenario.split('/')[0] as string) : null,
        key: String(p.key),
        unitPart: String(p.role).split('.').pop() === 'unit',
        rule: String(p.rule),
        field: p.field,
        source,
      });
    }
  }
  return out;
}

/** The option sections of the page table, in table order, with the building type they read. */
export function pageOptions(): Array<{ id: string; building_type: string }> {
  return (reportPage as unknown as { sections: Json[] }).sections
    .filter((s) => s.kind === 'option' && typeof s.scenario === 'string')
    .map((s) => ({ id: String(s.id), building_type: String(s.scenario).split('/')[0] as string }));
}

const BINDINGS = pageBindings();
const OPTIONS = pageOptions();
const HIDDEN_STATES: string[] = (presentation as unknown as { states: { hidden: string[] } }).states.hidden;
const PERMITTED = 'permitted';
const COMPUTED = 'computed';
const PERMITTED_FIELD = 'permitted';
const NOT_EVALUATED = 'not_evaluated';
const STATUS_TEXT = (presentation as unknown as { status_text: Record<string, string> }).status_text;
const isTextRule = (r: string): boolean => (TEXT_RULES as readonly string[]).includes(r);
/** The weakest confidence word among a stored row's readings (M-481); null when no reading carries one (the page then shows the dash, never a guess). */
const weakestConfidence = (r: StoredRow): string | null => {
  const words: string[] = [];
  for (const s of Array.isArray(r.switches) ? r.switches : []) if (typeof s?.confidence === 'string') words.push(s.confidence); // a reading with no confidence word is not a witness
  if (words.some((w) => !(CONFIDENCE_ORDER as readonly string[]).includes(w))) return null; // a word the register does not know: fail closed, never show a stronger reading than the row rests on
  return CONFIDENCE_ORDER.find((w) => words.includes(w)) ?? null;
};
const BOUND_FIELDS = new Set(BINDINGS.flatMap((b) => (b.source.kind === 'catalogue' ? [b.source.field_id] : [])));

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
/** The distinct non-null stamps of the rows, sorted (a null stamp is not a value to list; the rows themselves are all kept in `fields`). */
const distinct = (xs: Array<string | null>): string[] => {
  const out = new Set<string>();
  for (const x of xs) if (typeof x === 'string') out.add(x);
  return [...out].sort();
};

const LOST: Record<string, string> = {
  layer2: 'Layer 2 moved after these numbers were computed: what the newer Layer 2 night added (for increment 4, the disclosure words and the suite rows) is not in them.',
  catalogue: 'The formula catalogue changed after these numbers were computed: newer formula rows are not in them.',
  switchboard: 'The switchboard changed after these numbers were computed: rows switched on or off since are not reflected.',
};

function freshnessOf(stamp: LotStamp | null, rows: StoredRow[] | null, current: SeedShas): Freshness {
  const base = { moved: [] as string[], lost: [] as string[], gate: null as string | null, not_stored_reason: null as string | null };
  if (stamp?.lot_gate) return { ...base, verdict: 'gated', gate: stamp.lot_gate };
  // an unstamped lot names that first (reality OUTPUT LOW): it has no Layer 3 rows whether or not the table exists
  if (stamp === null) return { ...base, verdict: 'not_stored', not_stored_reason: 'no_layer2_stamp' };
  if (rows === null) return { ...base, verdict: 'not_stored', not_stored_reason: 'table_absent' };
  if (rows.length === 0) return { ...base, verdict: 'not_stored', not_stored_reason: 'no_rows' };
  const moved: string[] = [];
  if (rows.some((r) => r.layer2_table_version !== stamp.table_version)) moved.push('layer2');
  if (rows.some((r) => r.catalogue_sha !== current.catalogue_sha)) moved.push('catalogue');
  if (rows.some((r) => r.switchboard_sha !== current.switchboard_sha)) moved.push('switchboard');
  if (moved.length === 0) return { ...base, verdict: 'current' };
  return { ...base, verdict: 'out_of_date', moved, lost: moved.map((m) => LOST[m] as string) };
}

/** One lot: stored rows -> the v21 page response and the admin lineage. Pure: no I/O, no clock. */
export function projectStoredPage(input: ProjectInput): { response: PageResponse; lineage: Lineage } {
  const { lot, stamp, rows, current } = input;
  const stored = rows ?? [];
  const gated = Boolean(stamp?.lot_gate);
  const rowOf = (bt: string, field: string): StoredRow | undefined => stored.find((r) => r.building_type === bt && r.field_id === field);

  const hidden: string[] = [];
  const notEvaluated: string[] = [];
  const options: Lineage['options'] = {};
  const shownPermitted = new Set<string>();
  for (const o of OPTIONS) {
    const status = rowOf(o.building_type, PERMITTED_FIELD)?.status ?? null;
    let shownAs: 'shown' | 'hidden' | 'not_evaluated' = 'not_evaluated';
    if (!gated && status !== null && HIDDEN_STATES.includes(status)) shownAs = 'hidden';
    else if (!gated && status === PERMITTED) shownAs = 'shown';
    if (shownAs === 'hidden') hidden.push(o.id);
    if (shownAs === 'not_evaluated') notEvaluated.push(o.id);
    if (shownAs === 'shown') shownPermitted.add(o.id);
    options[o.id] = { building_type: o.building_type, stored_status: status, shown_as: shownAs };
  }

  const values: Record<string, string> = {};
  for (const b of BINDINGS) {
    if (b.source.kind === 'user_input') continue; // D-46: never a value; named in lineage.user_inputs_not_evaluated
    if (b.rule === 'reason_text') {
      // Spec 78 6.6 rule 5: a not-evaluated option shows its stored reason in See details (the ruled status text), never on the face.
      const r = b.building_type !== null && options[b.section]?.shown_as === 'not_evaluated' ? rowOf(b.building_type, b.field) : undefined;
      const sentence = r && r.status === NOT_EVALUATED && r.reason ? STATUS_TEXT[`not_evaluated:${r.reason}`] : undefined;
      if (typeof sentence === 'string' && sentence !== '') values[b.key] = sentence;
      continue;
    }
    if (isTextRule(b.rule)) {
      let raw: unknown = null;
      if (b.source.kind === 'parcels') raw = lot.columns[b.source.column];
      else if (b.building_type !== null && shownPermitted.has(b.section)) {
        const r = rowOf(b.building_type, b.source.field_id);
        if (r && r.status === COMPUTED) raw = weakestConfidence(r);
      }
      const text = formatTextRule(b.rule, raw);
      if (text !== null) values[b.key] = text;
      continue;
    }
    let n: number | null = null;
    if (b.source.kind === 'parcels') n = num(lot.columns[b.source.column]);
    else if (b.building_type !== null && shownPermitted.has(b.section)) {
      const r = rowOf(b.building_type, b.source.field_id);
      if (r && r.status === COMPUTED) n = num(r.value);
    }
    if (n === null) continue;
    const f = formatPageRule(b.rule, n);
    const text = f ? (b.unitPart ? f.unit : f.value) : undefined;
    if (typeof text === 'string' && text !== '') values[b.key] = text;
  }

  const lotSize = num(lot.columns[LOT_SIZE_COLUMN]);
  const boundTypes = new Set(OPTIONS.map((o) => o.building_type));
  const lineage: Lineage = {
    parcels_id: lot.id,
    parcel_id: lot.parcel_id,
    address: lot.address,
    zoning: lot.zoning,
    layer2_table_version: stamp?.table_version ?? null,
    layer2_evaluator_version: stamp?.evaluator_version ?? null,
    layer3: {
      increments: distinct(stored.map((r) => (r.increment === null ? null : String(r.increment)))),
      catalogue_sha: distinct(stored.map((r) => r.catalogue_sha)),
      switchboard_sha: distinct(stored.map((r) => r.switchboard_sha)),
      settings_sha: distinct(stored.map((r) => r.settings_sha)),
      rows: stored.length,
    },
    freshness: freshnessOf(stamp, rows, current),
    lot_size_implausible: lotSize !== null && (lotSize < LOT_SIZE_PLAUSIBLE_M2.min || lotSize > LOT_SIZE_PLAUSIBLE_M2.max),
    options,
    unbound_types: distinct(stored.map((r) => (boundTypes.has(r.building_type) ? null : r.building_type))),
    user_inputs_not_evaluated: distinct(BINDINGS.map((b) => (b.source.kind === 'user_input' ? b.field : null))),
    fields: stored
      .filter((r) => r.field_id === PERMITTED_FIELD || BOUND_FIELDS.has(r.field_id))
      .map((r) => ({
        building_type: r.building_type,
        field_id: r.field_id,
        status: r.status,
        value: num(r.value),
        unit: r.unit,
        reason: r.reason,
        flags: Array.isArray(r.flags) ? [...r.flags] : [],
        increment: r.increment === null ? null : String(r.increment),
      })),
  };
  return { response: { page: String((reportPage as unknown as { layout: string }).layout), values, hidden, not_evaluated: notEvaluated }, lineage };
}
