// ---------------------------------------------------------------------------
// Committee of Adjustment (CoA) application types
// ---------------------------------------------------------------------------

/**
 * Database model for a Committee of Adjustment application.
 *
 * Mirrors the `coa_applications` table created in 009_coa_applications.sql.
 */
export interface CoaApplication {
  id: number;
  application_num: string;
  address: string;
  street_num: string;
  street_name: string;
  ward: string;
  status: string;
  decision: string;
  decision_date: Date | null;
  hearing_date: Date | null;
  description: string;
  applicant: string;
  sub_type: string | null;
  linked_permit_num: string | null;
  linked_permit_revision: string | null;
  link_confidence: number | null;
  created_at: Date;
}

