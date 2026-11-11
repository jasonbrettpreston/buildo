// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (dated note 2026-11-11, MF-53: the map fields)
// 🔗 SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (the server formats; no maths on a screen)
//
// MF-53 · the two server display rules the "choose your lot" cards use, so a card and the report cannot show a lot differently
// (DECISIONS-v3 answered Q8, operator 2026-11-10 "the display of the database fields is slightly different - we need account for this
// as well"). The rule ids and patterns are the report's (scripts/surfaces/_schema/report-page.json: the lot.size line binds
// lot_size_sqm with rule `area_sqft_m2_dot`; frontage is `len1`, the report's owed length rule, display-rules-v4 rule 13):
//   area_sqft_m2_dot  "{sqft} sq ft · {m2} m²"  sq ft = round(m² × 10.7639), m² = round(m²), both whole with en-CA thousands commas
//   len1              "{m} m"                   metres to one decimal place ("7.0 m" keeps its zero)
// A null or non-finite input is null: the screen shows the content null value, never "0".
import { SQM_TO_SQFT } from '@/lib/parcels/geometry';

const WHOLE = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 });
const ONE_DP = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });

const finite = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Rule `area_sqft_m2_dot` over a square-metre value (pg numeric arrives as a string). */
export function areaSqftM2Dot(sqm: unknown): string | null {
  const m2 = finite(sqm);
  if (m2 === null) return null;
  return `${WHOLE.format(Math.round(m2 * SQM_TO_SQFT))} sq ft · ${WHOLE.format(Math.round(m2))} m²`;
}

/** Rule `len1` over a metre value. */
export function len1(metres: unknown): string | null {
  const m = finite(metres);
  if (m === null) return null;
  return `${ONE_DP.format(m)} m`;
}
