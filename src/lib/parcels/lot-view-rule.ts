// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md (FE-42, the lot-view drawing: four closed states, fail closed)
// 🔗 SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md rules 3, 16, 17 (limits are settings; the server decides, the client only shows; left out, not faked)
//
// MF-83 group 3 (plan-group3.md D-G3-4, operator "Accepted" 2026-11-15) · the lot-view eligibility rule. PURE: data in, data out, no I/O, no clock.
// It applies the stored numbers of one lot (parcel_lot_view, owned by the pipeline task MB-109) and three settings to the four closed states of the
// group 2 drawing contract (scripts/surfaces/_schema/report-page.json `drawing.states`). Order, from LOT-VIEWS-RULE.md "Eligibility":
//   1. shape: convex (when lotview_require_convex is 1) and rectangular enough, else `outline_shape`
//   2. edges: the stored edge confidence is `high`, else `outline_edges`
//   3. evaluated: every edge class the lot has carries an evaluated numeric setback AND an envelope is supplied, else `outline_unevaluated`
//   4. otherwise `drawn`
// The envelope and the per-class setback status are the by-law producer's (MB-44, after MB-38); until it exists the caller passes
// `envelope: false`, so every real lot is one of the three `outline_*` states ("outline-only until then", operator 2026-11-14). The suite rule
// (the house rear wall is not modelled) is not a branch: the producer sends `false` for the suite's classes until it is modelled.
import reportPage from '../../../scripts/surfaces/_schema/report-page.json';

/** The four closed states: the table's own list (report-page.json `drawing.states`), typed here; a test locks the two equal. */
export type LotViewState = 'drawn' | 'outline_shape' | 'outline_edges' | 'outline_unevaluated';
/** The edge classes: the table's own list (`drawing.classes`); a test locks the two equal. */
export type LotViewEdgeClass = 'front' | 'side' | 'rear';

/** One stored lot (parcel_lot_view): numbers and classes only, no outline. */
export interface LotViewRow {
  rectangularity: number;
  convexity: number;
  edgeConfidence: 'high' | 'low';
  /** One class per vertex of the lot's first ring, closing point dropped. */
  edgeClasses: LotViewEdgeClass[];
  /** Why the lot is outline-only (the rule's closed list); kept for the admin data check, not read by the rule. */
  reasons: string[];
}

/** The three settings the rule reads (admin group "Parcel Lookup"; migration 325). */
export interface LotViewSettings {
  requireConvex: boolean;
  convexTol: number;
  minRectangularity: number;
}

/** The setback status the by-law producer supplies, one boolean per edge class: true = an evaluated numeric setback exists. */
export type LotViewEvaluated = Record<LotViewEdgeClass, boolean>;

export const LOT_VIEW_STATES = (reportPage as { drawing: { states: LotViewState[] } }).drawing.states;
export const LOT_VIEW_CLASSES = (reportPage as { drawing: { classes: LotViewEdgeClass[] } }).drawing.classes;

export function lotViewState(row: LotViewRow, settings: LotViewSettings, evaluated: LotViewEvaluated, envelope: boolean): LotViewState {
  const convexOk = !settings.requireConvex || row.convexity >= settings.convexTol;
  if (!convexOk || row.rectangularity < settings.minRectangularity) return 'outline_shape';
  if (row.edgeConfidence !== 'high') return 'outline_edges';
  if (!envelope || row.edgeClasses.some((c) => evaluated[c] !== true)) return 'outline_unevaluated';
  return 'drawn';
}
