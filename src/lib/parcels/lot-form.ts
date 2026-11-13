// 🔗 SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4, ML-4, the lot_form_detected row (dated note 2026-11-13)
// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (the lookup payload; dated note 2026-11-13)
//
// SEMI-B · the semi detector's read (operator "semi all y" and "semi ask a", 2026-11-13). The rule is ONE view, `parcel_lot_form`
// (migration 320): strict O-4, the doubt rule and the "unsure" ask band, every cut a logic variable. This module only READS the
// lot's row for the consumer lookup (READ-ONLY; one parameterised statement; no detection here, so the lookup and the step cannot drift).
// `lotFormEffective` is the shared pure function of the report (P5.7, O-12): the owner's answer ?? the detected form; the pipeline never
// reads the override.
import { query } from '@/lib/db/client';
import { ConsumerLotFormSchema, type ConsumerLotForm } from '@/app/api/parcels/lookup/types';

export const LOT_FORM_VIEW = 'parcel_lot_form'; // the SQL below names it literally (the src-sql ledger allows no new interpolation); a test locks the two equal
/** The three settings the view reads (admin group "Parcel Lookup"; seed scripts/seeds/logic_variables.json; migration 320). */
export const LOT_FORM_SETTING_KEYS = ['semi_doubt_enabled', 'semi_doubt_max_link_parcels', 'semi_doubt_min_shared_len_m'] as const;

export type LotForm = ConsumerLotForm['detected'];

type ViewRow = { lot_form_detected: unknown; lot_form_basis: unknown; unsure: unknown };

/** The lot's view row, by the consumer parcel id (parcels.parcel_id); null when the lot has no row. A row outside the contract throws. */
export async function readLotForm(parcelId: string): Promise<ConsumerLotForm | null> {
  const rows = await query<ViewRow>(
    // The lot's internal id is resolved first as a scalar subquery so the view's lateral runs for ONE lot (0.4 ms measured; a JOIN to parcels
    // instead scanned every parcel, 2.9 s). The view's parcel_id is parcels.id.
    `SELECT l.lot_form_detected, l.lot_form_basis, l.unsure
       FROM parcel_lot_form l
      WHERE l.parcel_id = (SELECT p.id FROM parcels p WHERE p.parcel_id = $1)`,
    [parcelId],
  );
  const r = rows[0];
  if (!r) return null;
  return ConsumerLotFormSchema.parse({ detected: r.lot_form_detected, basis: r.lot_form_basis, unsure: r.unsure });
}

/** lot_form_effective = lot_form_user_override ?? lot_form_detected (Spec 78 lot_form_effective row; Q-2). */
export function lotFormEffective(detected: LotForm, override: LotForm | null | undefined): LotForm {
  return override ?? detected;
}

// ---- D6 (operator "semi all y", 2026-11-13): the read-only audit count the admin uses to retune the doubt settings -------------------
export type LotFormBandCount = { detected: LotForm; basis: string; unsure: boolean; lots: number };
export type LotFormAuditCounts = {
  /** One row per (detected, basis, unsure): how many lots sit in each band under the CURRENT settings (the asked band is unsure = true). */
  bands: LotFormBandCount[];
  /**
   * Owner corrections per basis. NOT STORED: the answer is a route param applied in the app (O-12; no server store; APP-RENO owes one), so
   * the count cannot be read here and is reported null, never 0.
   */
  corrections: null;
};

/** READ-ONLY: grouped counts over the view; one static statement, no parameters. Admin use only: a caller MUST sit behind the admin gate (this module has no auth). */
export async function lotFormAuditCounts(): Promise<LotFormAuditCounts> {
  const rows = await query<{ lot_form_detected: unknown; lot_form_basis: unknown; unsure: unknown; lots: unknown }>(
    `SELECT lot_form_detected, lot_form_basis, unsure, COUNT(*) AS lots
       FROM parcel_lot_form GROUP BY lot_form_detected, lot_form_basis, unsure ORDER BY lot_form_detected, lot_form_basis, unsure`,
  );
  return {
    bands: rows.map((r) => ({ detected: r.lot_form_detected as LotForm, basis: String(r.lot_form_basis), unsure: r.unsure === true, lots: Number(r.lots) })),
    corrections: null,
  };
}
