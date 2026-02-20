import type { RawPermitRecord, Permit } from '@/lib/permits/types';

/**
 * Parse a date string from the Toronto Open Data feed into a Date object.
 * Returns null when the value is empty, missing, or unparseable.
 */
function parseDate(value: string | undefined | null): Date | null {
  if (!value || value.trim() === '') return null;
  const ms = Date.parse(value.trim());
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

/**
 * Clean the estimated construction cost field.
 * The feed occasionally contains the literal string "DO NOT UPDATE OR DELETE"
 * instead of a number -- treat that (and any other non-numeric junk) as null.
 */
function cleanCost(value: string | undefined | null): number | null {
  if (!value || value.trim() === '') return null;
  if (value.includes('DO NOT UPDATE OR DELETE')) return null;
  const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

/**
 * Trim a string value and return null if the result is empty.
 */
function trimToNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Map a raw UPPER_CASE permit record from the Toronto Open Data JSON feed
 * to a snake_case Permit-shaped object suitable for database insertion.
 */
export function mapRawToPermit(raw: RawPermitRecord): Partial<Permit> {
  return {
    permit_num: raw.PERMIT_NUM,
    revision_num: raw.REVISION_NUM,
    permit_type: raw.PERMIT_TYPE,
    structure_type: raw.STRUCTURE_TYPE,
    work: raw.WORK,
    street_num: raw.STREET_NUM,
    street_name: raw.STREET_NAME,
    street_type: raw.STREET_TYPE,
    street_direction: trimToNull(raw.STREET_DIRECTION),
    city: raw.CITY,
    postal: raw.POSTAL,
    geo_id: raw.GEO_ID,
    building_type: raw.BUILDING_TYPE,
    category: raw.CATEGORY,
    application_date: parseDate(raw.APPLICATION_DATE),
    issued_date: parseDate(raw.ISSUED_DATE),
    completed_date: parseDate(raw.COMPLETED_DATE),
    status: raw.STATUS,
    description: raw.DESCRIPTION,
    est_const_cost: cleanCost(raw.EST_CONST_COST),
    builder_name: raw.BUILDER_NAME,
    owner: raw.OWNER,
    dwelling_units_created: parseInt(raw.DWELLING_UNITS_CREATED, 10) || 0,
    dwelling_units_lost: parseInt(raw.DWELLING_UNITS_LOST, 10) || 0,
    ward: raw.WARD,
    council_district: raw.COUNCIL_DISTRICT,
    current_use: raw.CURRENT_USE,
    proposed_use: raw.PROPOSED_USE,
    housing_units: parseInt(raw.HOUSING_UNITS, 10) || 0,
    storeys: parseInt(raw.STOREYS, 10) || 0,
  };
}
