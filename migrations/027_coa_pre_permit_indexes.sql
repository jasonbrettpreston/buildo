-- Migration 027: Add indexes for Pre-Permit (Upcoming Lead) queries
-- Optimizes: approved + unlinked + recent CoAs for the Pre-Permit feature

CREATE INDEX IF NOT EXISTS idx_coa_decision_date
  ON coa_applications (decision_date DESC);

CREATE INDEX IF NOT EXISTS idx_coa_upcoming_leads
  ON coa_applications (decision_date DESC)
  WHERE decision IN ('Approved', 'Approved with Conditions')
    AND linked_permit_num IS NULL;
