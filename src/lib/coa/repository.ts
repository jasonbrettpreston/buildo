import { query } from '@/lib/db/client';
import type { CoaApplication } from '@/lib/coa/types';
import { COA_IDENTITY_LINK_MIN_CONFIDENCE } from '@/lib/coa/link-confidence';

// ---------------------------------------------------------------------------
// CoA application data-access layer
// ---------------------------------------------------------------------------

/**
 * Retrieve all CoA applications linked to a given building permit.
 *
 * Because the `coa_applications` table stores only `linked_permit_num`
 * (no separate revision column), the `revision_num` parameter is accepted
 * for interface consistency but is not used in the query filter.
 */
export async function getCoaByPermit(
  permit_num: string,
  _revision_num: string
): Promise<CoaApplication[]> {
  return query<CoaApplication>(
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
      linked_permit_num,
      NULL                AS linked_permit_revision,
      linked_confidence   AS link_confidence,
      first_seen_at       AS created_at
    FROM coa_applications
    WHERE linked_permit_num = $1
      -- P12-B1: identity floor — a sub-0.85 link is a same-street/wrong-house or
      -- cross-ward geo association; surfacing it as this permit's CoA is wrong-property.
      AND linked_confidence >= ${COA_IDENTITY_LINK_MIN_CONFIDENCE}
    ORDER BY hearing_date DESC`,
    [permit_num]
  );
}
