import { query } from '@/lib/db/client';
import type { CoaApplication } from '@/lib/coa/types';

// ---------------------------------------------------------------------------
// Pre-Permit qualifying logic
// ---------------------------------------------------------------------------

const APPROVED_DECISIONS = ['Approved', 'Approved with Conditions'];
const PRE_PERMIT_WINDOW_DAYS = 90;

/**
 * Check whether a CoA application qualifies as a "Pre-Permit (Upcoming)" lead.
 *
 * Criteria:
 *  - Decision is "Approved" or "Approved with Conditions"
 *  - Not yet linked to a building permit
 *  - Decision date within the last 90 days
 */
export function isQualifyingPrePermit(
  coa: { decision: string; decision_date: string | Date | null; linked_permit_num: string | null },
  now: Date = new Date()
): boolean {
  if (!APPROVED_DECISIONS.includes(coa.decision)) return false;
  if (coa.linked_permit_num) return false;
  if (!coa.decision_date) return false;

  const decisionDate = typeof coa.decision_date === 'string'
    ? new Date(coa.decision_date)
    : coa.decision_date;
  const daysSince = Math.floor(
    (now.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSince <= PRE_PERMIT_WINDOW_DAYS;
}

// ---------------------------------------------------------------------------
// DTO mapper: CoA → Permit shape
// ---------------------------------------------------------------------------

/**
 * Map a CoA application into the standard permit DTO shape so it can be
 * rendered by PermitCard and other permit-oriented UI components.
 */
export function mapCoaToPermitDto(coa: {
  application_num: string;
  address: string;
  street_num: string;
  street_name: string;
  ward: string;
  decision: string;
  decision_date: string | null;
  hearing_date: string | null;
  description: string;
  applicant: string;
}) {
  return {
    permit_num: `COA-${coa.application_num.replace(/\//g, '~')}`,
    revision_num: '00',
    status: 'Pre-Permit (Upcoming)',
    permit_type: 'Committee of Adjustment',
    description: coa.description,
    street_num: coa.street_num,
    street_name: coa.street_name,
    street_type: '',
    street_direction: null,
    city: 'TORONTO',
    postal: '',
    builder_name: coa.applicant || null,
    issued_date: coa.decision_date,
    application_date: coa.hearing_date,
    ward: coa.ward,
    est_const_cost: null,
    latitude: null,
    longitude: null,
  };
}

// ---------------------------------------------------------------------------
// Database queries
// ---------------------------------------------------------------------------

export interface UpcomingLeadsOptions {
  limit?: number;
  search?: string;
  ward?: string;
}

/**
 * Fetch qualifying Pre-Permit leads from the database:
 * approved, unlinked, decision within last 90 days.
 * Supports optional text search and ward filtering.
 */
export async function getUpcomingLeads(options: UpcomingLeadsOptions = {}): Promise<Record<string, unknown>[]> {
  const { limit = 50, search, ward } = options;

  const conditions = [
    "decision IN ('Approved', 'Approved with Conditions')",
    'linked_permit_num IS NULL',
    "decision_date >= NOW() - INTERVAL '90 days'",
  ];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (ward) {
    conditions.push(`ward = $${paramIdx++}`);
    values.push(ward);
  }

  if (search) {
    conditions.push(
      `(address ILIKE $${paramIdx} OR description ILIKE $${paramIdx} OR applicant ILIKE $${paramIdx})`
    );
    values.push(`%${search}%`);
    paramIdx++;
  }

  values.push(limit);

  const rows = await query<CoaApplication>(
    `SELECT
      id,
      application_number  AS application_num,
      address,
      street_num,
      street_name,
      ward,
      status,
      decision,
      decision_date,
      hearing_date,
      description,
      applicant,
      sub_type,
      linked_permit_num,
      NULL                AS linked_permit_revision,
      linked_confidence   AS link_confidence,
      first_seen_at       AS created_at
    FROM coa_applications
    WHERE ${conditions.join(' AND ')}
    ORDER BY decision_date DESC
    LIMIT $${paramIdx}`,
    values
  );

  return rows.map((coa) =>
    mapCoaToPermitDto({
      application_num: coa.application_num,
      address: coa.address,
      street_num: coa.street_num,
      street_name: coa.street_name,
      ward: coa.ward,
      decision: coa.decision,
      decision_date: coa.decision_date ? String(coa.decision_date) : null,
      hearing_date: coa.hearing_date ? String(coa.hearing_date) : null,
      description: coa.description,
      applicant: coa.applicant,
    })
  );
}
