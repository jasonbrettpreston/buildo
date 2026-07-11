// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.3 (absent ≠ fits:false),
//            §2.4 (envelope-fallback labeling), §4 (detail sections)
//            docs/specs/01-pipeline/88_parcel_cost_model.md §2.4–2.5 (cost-menu semantics)
//
// Pure presentation helpers for the Parcel Cost Tool detail screen. Extracted into a leaf module
// (zero side-effect imports) so they're unit-testable under jest-node without rendering the
// screen (the [flight-job]/leadDetailFormat precedent — full-tree render impractical).

import type { ParcelCostLine, ParcelCostMenu } from '@/lib/schemas';

const SQM_TO_SQFT = 10.7639;

// The 13 cost-menu lines in display order (Spec 88 PARCEL_COST_LINES) + human labels.
export const COST_LINE_ORDER = [
  'max_build', 'coa_build', 'addition', 'gut', 'garden_suite', 'laneway_suite',
  'garage', 'solar_max', 'solar_coa', 'basement', 'basement_underpin', 'kitchen', 'bath',
] as const;
export type CostLineId = (typeof COST_LINE_ORDER)[number];

export const COST_LINE_LABELS: Record<CostLineId, string> = {
  max_build: 'New build (max)',
  coa_build: 'New build (Committee of Adjustment)',
  addition: 'Addition',
  gut: 'Gut renovation',
  garden_suite: 'Garden suite',
  laneway_suite: 'Laneway suite',
  garage: 'Garage',
  solar_max: 'Solar (full roof)',
  solar_coa: 'Solar (CoA envelope)',
  basement: 'Basement finish',
  basement_underpin: 'Basement underpin',
  kitchen: 'Kitchen (per m²)',
  bath: 'Bathroom (per m²)',
};

/** A menu entry is a cost line only when it is an object (the root `_schema_version` is a number). */
export function getCostLine(menu: ParcelCostMenu | null, id: string): ParcelCostLine | null {
  if (!menu) return null;
  const v = menu[id];
  if (v == null || typeof v !== 'object') return null;
  return v as ParcelCostLine;
}

export type CostLineState =
  | 'absent' // line not in the menu — "not computable for this lot" (n/a), NOT a doesn't-fit badge
  | 'no_fit' // computed, but fits === false — a distinct "doesn't fit this lot" badge (Spec 100 §2.3)
  | 'available'; // computed and applicable

/** Distinguish absent (n/a) from fits:false (doesn't fit) — Spec 100 §2.3. */
export function costLineState(line: ParcelCostLine | null): CostLineState {
  if (line == null) return 'absent';
  if (line.fits === false) return 'no_fit';
  return 'available';
}

/**
 * Envelope-fallback honesty (Spec 100 §2.4 / Spec 88 §2.5): the `max_build` line prices
 * `opt_aor_gfa_sqm` when present, else the maximum-build envelope (`max_buildable_gfa_sqm`).
 * When the as-of-right optimal GFA is absent, the basis MUST read "maximum envelope", never
 * "as-of-right". `areas` is the response's Tier-1 headline record.
 */
export function maxBuildBasisLabel(areas: Record<string, number | string | null> | undefined): string {
  const optAor = areas?.opt_aor_gfa_sqm;
  return optAor == null ? 'maximum envelope' : 'as-of-right';
}

/** Whether the max_build line was priced off the envelope fallback (opt_aor NULL). */
export function isEnvelopeFallback(areas: Record<string, number | string | null> | undefined): boolean {
  return areas?.opt_aor_gfa_sqm == null;
}

export function formatCurrency(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

export function formatFsi(v: number | string | null | undefined): string | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return (n as number).toFixed(2);
}

export function formatSqft(sqm: number | string | null | undefined): string | null {
  if (sqm == null) return null;
  const n = typeof sqm === 'string' ? Number(sqm) : sqm;
  if (!Number.isFinite(n)) return null;
  return `${Math.round((n as number) * SQM_TO_SQFT).toLocaleString()} sq ft`;
}

export function formatSqm(sqm: number | string | null | undefined): string | null {
  if (sqm == null) return null;
  const n = typeof sqm === 'string' ? Number(sqm) : sqm;
  if (!Number.isFinite(n)) return null;
  return `${Math.round(n as number).toLocaleString()} m²`;
}
