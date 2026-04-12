-- Lifecycle Phase SQL Reproducer
--
-- Pure-SQL reproduction of the decision tree in
-- scripts/lib/lifecycle-phase.js. Used by the correctness-check #2
-- described in docs/reports/lifecycle_phase_implementation.md §3.2:
--   "write a SQL query that reproduces each phase assignment
--    entirely in the database, diff against classifier output"
--
-- Usage:
--   psql -U postgres -d buildo -f scripts/quality/lifecycle-phase-sql-reproducer.sql
--
-- Outputs:
--   1. permit_disagreements: rows where script-assigned lifecycle_phase
--      disagrees with the SQL-computed phase. Expected: 0.
--   2. coa_disagreements: same for coa_applications. Expected: 0.
--
-- If either count is non-zero, the classifier and the SQL reproducer
-- have diverged — which means one of them is wrong. Investigate.
--
-- The SQL branches below match the JS branches line-for-line.
-- Order matters (first match wins). Keep this file in sync with
-- scripts/lib/lifecycle-phase.js on every change.

-- ═══════════════════════════════════════════════════════════════
-- Permits reproducer
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Precompute BLD/CMB sibling prefixes (O(n), one seqscan, hash joined
-- back into the main query). Using a correlated subquery with
-- split_part on both sides is O(n²) and unusable at 243K rows.
-- ═══════════════════════════════════════════════════════════════
WITH bld_cmb_prefixes AS (
  SELECT
    split_part(permit_num, ' ', 1) || ' ' || split_part(permit_num, ' ', 2) AS prefix,
    array_agg(permit_num) AS members
  FROM permits
  WHERE split_part(permit_num, ' ', 3) IN ('BLD','CMB')
  GROUP BY 1
),
-- Inspection rollups in one pass: latest passed stage + latest
-- inspection date + has_passed flag.
latest_passed AS (
  SELECT DISTINCT ON (permit_num) permit_num, stage_name
  FROM permit_inspections
  WHERE status = 'Passed'
  ORDER BY permit_num, inspection_date DESC NULLS LAST, stage_name
),
inspection_rollup AS (
  SELECT
    i.permit_num,
    MAX(i.inspection_date) AS latest_inspection_date,
    BOOL_OR(i.status = 'Passed') AS has_passed_inspection
  FROM permit_inspections i
  GROUP BY i.permit_num
),
permit_inputs AS (
  -- IMPORTANT: the JS classifier's `normalizeStatus()` applies TRIM
  -- to every status before set-membership checks. The SQL reproducer
  -- MUST apply TRIM at the same point, otherwise a live-DB row with
  -- a trailing space (`'Closed '`) gets classified by JS but falls
  -- through the SQL decision tree to NULL, producing a false
  -- disagreement (or worse, a silent one if both map to NULL via the
  -- outer filter). Apply TRIM once at the boundary and use the
  -- trimmed alias everywhere downstream. See adversarial review C4.
  SELECT
    p.permit_num,
    p.revision_num,
    NULLIF(TRIM(COALESCE(p.status, '')), '') AS status,
    p.enriched_status,
    p.issued_date,
    p.lifecycle_phase AS script_phase,
    p.lifecycle_stalled AS script_stalled,
    -- is_orphan: true if no BLD/CMB sibling (other than self) shares
    -- the application prefix. COALESCE handles the missing-prefix case.
    COALESCE(
      array_length(array_remove(bcp.members, p.permit_num), 1),
      0
    ) = 0 AS is_orphan,
    lp.stage_name AS latest_passed_stage,
    ir.latest_inspection_date,
    COALESCE(ir.has_passed_inspection, false) AS has_passed_inspection
  FROM permits p
  LEFT JOIN bld_cmb_prefixes bcp
    ON bcp.prefix = split_part(p.permit_num, ' ', 1) || ' ' || split_part(p.permit_num, ' ', 2)
  LEFT JOIN latest_passed lp ON lp.permit_num = p.permit_num
  LEFT JOIN inspection_rollup ir ON ir.permit_num = p.permit_num
),
permit_computed AS (
  SELECT
    permit_num,
    revision_num,
    script_phase,
    script_stalled,
    -- ─── Phase branch ──────────────────────────────────────────────
    CASE
      -- Dead states — status was already trimmed to NULL for empty
      -- strings in the permit_inputs CTE, so an explicit emptiness
      -- check is unnecessary. A NULL status falls through the whole
      -- CASE and returns NULL via the final ELSE — matching the JS
      -- classifier's `if (status == null) return { phase: null }`.
      WHEN status IS NULL THEN NULL
      WHEN status IN (
        'Cancelled','Revoked','Permit Revoked','Refused','Refusal Notice',
        'Application Withdrawn','Abandoned','Not Accepted','Work Suspended',
        'VIOLATION','Order Issued','Tenant Notice Period','Follow-up Required'
      ) THEN NULL

      -- Terminal P20 / P19
      WHEN status IN ('Closed','File Closed','Permit Issued/Close File') THEN 'P20'
      WHEN status IN (
        'Pending Closed','Pending Cancellation','Revocation Pending',
        'Revocation Notice Sent','Inspection Request to Cancel'
      ) THEN 'P19'

      -- Orphan branch (simplified 4-phase)
      WHEN is_orphan AND status IN ('Permit Issued','Inspection','Revision Issued','Revised')
           AND issued_date IS NOT NULL
           AND NOT has_passed_inspection
           AND (NOW()::date - issued_date) > 180 THEN 'O3'
      WHEN is_orphan AND status IN ('Permit Issued','Inspection','Revision Issued','Revised')
        THEN 'O2'
      WHEN is_orphan THEN 'O1'

      -- BLD-led pre-issuance phases (status is already trimmed)
      WHEN status IN ('Under Review','Examination','Examiner''s Notice Sent','Consultation Completed') THEN 'P4'
      WHEN status IN (
        'Application On Hold','Application on Hold','Deficiency Notice Issued',
        'Response Received','Pending Parent Folder Review'
      ) THEN 'P5'
      WHEN status IN (
        'Ready for Issuance','Forwarded for Issuance','Issuance Pending',
        'Approved','Agreement in Progress','Licence Issued'
      ) THEN 'P6'
      WHEN status IN (
        'Application Received','Application Acceptable','Plan Review Complete',
        'Open','Active','Request Received'
      ) THEN 'P3'

      -- Revision / active catch-all (including Order Complied gap status)
      WHEN status IN ('Revision Issued','Revised','Order Complied') THEN 'P8'

      -- Not started
      WHEN status IN (
        'Work Not Started','Not Started','Not Started - Express',
        'Extension Granted','Extension in Progress'
      ) THEN 'P7d'

      -- Permit Issued, time-bucketed
      WHEN status = 'Permit Issued' AND has_passed_inspection THEN 'P18'
      WHEN status = 'Permit Issued' AND issued_date IS NULL THEN 'P7c'
      WHEN status = 'Permit Issued' AND (NOW()::date - issued_date) <= 30 THEN 'P7a'
      WHEN status = 'Permit Issued' AND (NOW()::date - issued_date) <= 90 THEN 'P7b'
      WHEN status = 'Permit Issued' THEN 'P7c'

      -- Inspection with sub-stage mapping (order matters — specific before broad)
      WHEN status = 'Inspection' AND latest_passed_stage IS NULL THEN 'P18'

      WHEN status = 'Inspection' AND (
        lower(latest_passed_stage) LIKE '%excavation%'
        OR lower(latest_passed_stage) LIKE '%shoring%'
        OR lower(latest_passed_stage) LIKE '%site grading%'
        OR lower(latest_passed_stage) LIKE '%demolition%'
      ) THEN 'P9'

      WHEN status = 'Inspection' AND (
        lower(latest_passed_stage) LIKE '%footings%'
        OR lower(latest_passed_stage) LIKE '%foundations%'
        OR lower(latest_passed_stage) = 'foundation'
      ) THEN 'P10'

      WHEN status = 'Inspection' AND (
        lower(latest_passed_stage) LIKE '%structural framing%'
        OR lower(latest_passed_stage) LIKE '%framing%'
      ) THEN 'P11'

      WHEN status = 'Inspection' AND (
        lower(latest_passed_stage) LIKE '%insulation%'
        OR lower(latest_passed_stage) LIKE '%vapour%'
      ) THEN 'P13'

      WHEN status = 'Inspection' AND lower(latest_passed_stage) LIKE '%fire separations%' THEN 'P14'

      WHEN status = 'Inspection' AND (
        lower(latest_passed_stage) LIKE '%interior final%'
        OR lower(latest_passed_stage) LIKE '%plumbing final%'
        OR lower(latest_passed_stage) LIKE '%hvac final%'
      ) THEN 'P15'

      WHEN status = 'Inspection' AND lower(latest_passed_stage) LIKE '%exterior final%' THEN 'P16'

      WHEN status = 'Inspection' AND (
        lower(latest_passed_stage) LIKE '%occupancy%'
        OR lower(latest_passed_stage) LIKE '%final inspection%'
      ) THEN 'P17'

      -- P12 rough-in catch-all (broad patterns evaluated last)
      WHEN status = 'Inspection' AND (
        lower(latest_passed_stage) LIKE '%hvac%'
        OR lower(latest_passed_stage) LIKE '%plumbing%'
        OR lower(latest_passed_stage) LIKE '%electrical%'
        OR lower(latest_passed_stage) LIKE '%fire protection%'
        OR lower(latest_passed_stage) LIKE '%fire access%'
        OR lower(latest_passed_stage) LIKE '%water service%'
        OR lower(latest_passed_stage) LIKE '%water distribution%'
        OR lower(latest_passed_stage) LIKE '%drain%'
        OR lower(latest_passed_stage) LIKE '%sewers%'
        OR lower(latest_passed_stage) LIKE '%fire service%'
      ) THEN 'P12'

      WHEN status = 'Inspection' THEN 'P18'

      -- Gap statuses routed to P18
      WHEN status IN ('Forward to Inspector','Rescheduled') THEN 'P18'

      -- Fallback — unclassified
      ELSE NULL
    END AS sql_phase,
    -- ─── Stalled modifier ──────────────────────────────────────────
    --
    -- Three gotchas that the naive SQL version gets wrong:
    --   1. enriched_status = 'Stalled' returns NULL when
    --      enriched_status IS NULL. Boolean OR with NULL propagates,
    --      so the whole expression can be NULL → IS DISTINCT FROM
    --      reports every such row as a disagreement. Use COALESCE.
    --   2. The JS classifier short-circuits on dead/terminal/winddown
    --      statuses BEFORE computing stalled — those rows always
    --      return stalled=false. The SQL must gate the same way.
    --   3. Same for DEAD_STATUS_SET.
    COALESCE(
      CASE
        WHEN status IS NULL THEN false
        WHEN status IN (
          'Cancelled','Revoked','Permit Revoked','Refused','Refusal Notice',
          'Application Withdrawn','Abandoned','Not Accepted','Work Suspended',
          'VIOLATION','Order Issued','Tenant Notice Period','Follow-up Required'
        ) THEN false
        WHEN status IN ('Closed','File Closed','Permit Issued/Close File') THEN false
        WHEN status IN (
          'Pending Closed','Pending Cancellation','Revocation Pending',
          'Revocation Notice Sent','Inspection Request to Cancel'
        ) THEN false
        ELSE (
          COALESCE(enriched_status, '') = 'Stalled'
          OR (status = 'Permit Issued'
              AND NOT COALESCE(has_passed_inspection, false)
              AND issued_date IS NOT NULL
              AND (NOW()::date - issued_date) > 730)
          OR (status = 'Inspection'
              AND latest_inspection_date IS NOT NULL
              AND (NOW()::date - latest_inspection_date::date) > 180)
        )
      END,
      false
    ) AS sql_stalled
  FROM permit_inputs
)
SELECT 'permit_disagreements' AS metric,
       COUNT(*) FILTER (
         WHERE script_phase IS DISTINCT FROM sql_phase
            OR script_stalled IS DISTINCT FROM sql_stalled
       ) AS n
FROM permit_computed
WHERE script_phase IS NOT NULL OR sql_phase IS NOT NULL
UNION ALL
-- ═══════════════════════════════════════════════════════════════
-- CoA reproducer
-- ═══════════════════════════════════════════════════════════════
SELECT 'coa_disagreements' AS metric,
       COUNT(*) FILTER (
         WHERE c.lifecycle_phase IS DISTINCT FROM (
           CASE
             -- Linked CoAs → NULL (phase lives on the permit)
             WHEN c.linked_permit_num IS NOT NULL AND TRIM(c.linked_permit_num) <> '' THEN NULL
             -- Dead decisions → NULL
             WHEN lower(trim(regexp_replace(c.decision, '\s+', ' ', 'g'))) IN (
               'refused','withdrawn','application withdrawn','application closed',
               'closed','delegated consent refused'
             ) THEN NULL
             -- Canonical approved → P2
             WHEN lower(trim(regexp_replace(c.decision, '\s+', ' ', 'g'))) IN (
               'approved','conditional approval','conditional approved',
               'conditionally approved','approved conditionally',
               'approved on condition','approved on conditional',
               'approved on condation','approved on condtion',
               'approved with conditions','approved with condition',
               'approved wih conditions','approved, as amended, on condition',
               'partially approved','conitional approval','modified approval'
             ) THEN 'P2'
             -- Everything else → P1 (pending / deferred / unknown)
             ELSE 'P1'
           END
         )
       ) AS n
FROM coa_applications c;
