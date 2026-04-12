# Lifecycle Phase Classification — Implementation Plan (Strangler Fig V1)

**Status: DESIGN LOCKED — READY FOR WF2 EXECUTION.** This document supersedes the prior V1 draft. It reflects the full architectural decision after six rounds of iteration: a Strangler Fig approach where the new classifier runs entirely downstream of the existing scraper infrastructure, CoA is a first-class phase source, and the feed's placeholder "Active build phase" label finally reads a meaningful per-permit signal.

**Locked on:** 2026-04-11
**Supersedes:** the earlier V1 proposal that excluded CoA and left the feed disconnected
**Blueprint source:** user-locked decisions in the 2026-04-11 conversation

---

## 0. What this plan builds (and what it deliberately does not touch)

### Strangler Fig — the architectural intent

We are formally separating two concerns that are currently tangled into one column:

- **Scraper Operational State** (`permits.enriched_status`) — the existing 5-value signal written by `aic-scraper-nodriver.py`, `classify-inspection-status.js`, and `classify-permit-phase.js`. Used today as load-bearing operational infrastructure for the scraper's batch selection (`idx_permits_enriched_status_scrape` filters on these exact values). **We do not touch this.**
- **Business Lifecycle** (`permits.lifecycle_phase` NEW + `coa_applications.lifecycle_phase` NEW) — the new 24-phase product taxonomy written by one new standalone classifier. Read by the user-facing feed. **This is what we're building.**

Later, once the new column is proven stable and the feed is reading it cleanly, a future refactor can retarget the scraper's `WHERE` clauses to use `lifecycle_phase` instead of `enriched_status`, and `enriched_status` can be retired as dead code. That refactor is explicitly **not** in this plan.

### In scope for this WF2

1. Add `lifecycle_phase` column to `permits` and `coa_applications` (migration 085)
2. Build `scripts/classify-lifecycle-phase.js` — the one authoritative classifier
3. Build `scripts/trigger-lifecycle-sync.js` — the thin handoff step
4. Add trigger steps to the permits chain AND the CoA chain (Option 2 — explicit, visible in pipeline UI)
5. Wire the feed to read `lifecycle_phase` and render it as the card label, replacing `TIMING_DISPLAY_BY_CONFIDENCE`
6. Fix `link-coa.js` to bump `permits.last_seen_at` on newly-linked permits (one-line fix enabling incremental re-classification)
7. All tests and CQA checks per §3 (ten correctness gates)

### Out of scope — explicitly deferred

- **Map marker icon change** from `$$$$` to phase-driven Heroicons (WF3 after this)
- **Predictive-claim LEFT ANTI JOIN** on child permits (WF3 after this)
- **Application-level aggregation** in the feed SQL (WF3 after this)
- **`is_active=true` filter removal** from the feed WHERE clause (WF3 after this)
- **Inspection stage map expansion** (~19 new rows — independent WF3)
- **Classifier `is_active` phase-gate bug investigation** (Phase A data-quality, separate WF3)
- **Retiring `enriched_status`** and its populator scripts (future consolidation)
- **Scraper target expansion** to include New Building + Non-Residential (separate WF3)

---

## Section 1 — The 24-phase decision tree

The classifier reads **both** the `permits` table and the `coa_applications` table. Each row passes through a branch-specific decision tree and exits with exactly one phase label (or NULL for "out of scope / dead state").

### 1.1 CoA branch (3 phases + NULL)

Applied to every row in `coa_applications`.

```
INPUT: coa row with (id, decision, linked_permit_num, status, first_seen_at, last_seen_at)

Step 1: Filter out dead-state CoAs
  IF decision matches dead set (refused, withdrawn, application closed, etc.):
    RETURN NULL

Step 2: Linked CoAs inherit phase from their permit
  IF linked_permit_num IS NOT NULL:
    RETURN NULL  -- the lifecycle signal lives on the permit row, not the CoA row
                 -- feed SQL JOINs coa → permit for these rows

Step 3: Unlinked approved CoAs → P2 (Variance Granted)
  IF lower(trim(decision)) IN canonical_approved_set:
    RETURN 'P2'  -- ~147 rows

Step 4: Unlinked undecided CoAs → P1 (Variance Requested)
  IF decision IS NULL OR decision NOT IN known_terminal_set:
    RETURN 'P1'  -- ~35 rows

Step 5: Fallback
  RETURN NULL
```

**Canonical approved set** (handles the 53-variant casing drift from the CoA decision field — see `docs/reports/lead_feed_status_inventory.md` §2.2):

```
NORMALIZED_APPROVED_DECISIONS = set after lower(trim()) of:
  'approved', 'conditional approval', 'approved on condition',
  'approved with conditions', 'approved with condition',
  'approved conditionally', 'conditionally approved',
  'partially approved', 'approved, as amended, on condition',
  'modified approval',
  -- plus tolerance for minor typos: 'approved on condtion',
  -- 'approved wih conditions', 'conitional approval', etc.
```

Normalization strategy: `lower(trim(regex_replace(decision, '\s+', ' ')))` then check against a Set. Known typos are listed explicitly in the Set so no fuzzy matching is needed.

**Dead set:**
```
NORMALIZED_DEAD_DECISIONS = set after lower(trim()) of:
  'refused', 'withdrawn', 'application withdrawn',
  'application closed'
```

`deferred` variants are NOT dead — a deferred CoA is still pending (P1).

### 1.2 Permits branch — dead states (filter from feed, phase = NULL)

Applied top-down, first match wins.

```
IF status IN (
  'Cancelled', 'Revoked', 'Permit Revoked',
  'Refused', 'Refusal Notice',
  'Application Withdrawn', 'Abandoned',
  'Not Accepted', 'Work Suspended',
  'VIOLATION', 'Order Issued',
  'Tenant Notice Period', 'Follow-up Required'
) THEN RETURN NULL
```

Expected count: ~1,194 rows.

### 1.3 Permits branch — terminal states (P19, P20)

```
IF status IN ('Closed', 'File Closed', 'Permit Issued/Close File')
  THEN RETURN 'P20'

IF status IN ('Pending Closed', 'Pending Cancellation',
              'Revocation Pending', 'Revocation Notice Sent')
  THEN RETURN 'P19'
```

Expected counts: P20 ~8,656; P19 ~5,533.

### 1.4 Permits branch — orphan classification (O1, O2, O3, O4)

Derived input: `is_orphan = NOT EXISTS (sibling permit with BLD/CMB suffix on the same application_number)`.

```
IF is_orphan THEN:

  IF status IN terminal_set (handled in §1.3 already — returns P20)

  IF status IN ('Permit Issued','Inspection','Revision Issued','Revised'):
    IF issued_date IS NOT NULL
       AND (NOW() - issued_date) > 180 days
       AND NOT has_passed_inspection:
      RETURN 'O3'   -- Orphan Stalled (~6,000 expected)
    RETURN 'O2'     -- Orphan Active (~18,400 expected)

  IF status IN applied_set (intake, review, on_hold, ready_to_issue):
    RETURN 'O1'     -- Orphan Applied (~10,000 expected)

  RETURN 'O1'       -- default for unknown orphan status
```

### 1.5 Permits branch — BLD-led phase assignment (P3–P18)

Applied only to permits where `is_orphan = false`.

```
-- P3 Intake
IF status IN ('Application Received','Application Acceptable',
              'Plan Review Complete','Open','Active','Request Received')
  THEN RETURN 'P3'

-- P4 Under Review
IF status IN ('Under Review','Examination','Examiner''s Notice Sent',
              'Consultation Completed')
  THEN RETURN 'P4'

-- P5 On Hold
IF status IN ('Application On Hold','Application on Hold',
              'Deficiency Notice Issued','Response Received',
              'Pending Parent Folder Review')
  THEN RETURN 'P5'

-- P6 Ready to Issue
IF status IN ('Ready for Issuance','Forwarded for Issuance',
              'Issuance Pending','Approved','Agreement in Progress',
              'Licence Issued')
  THEN RETURN 'P6'

-- P8 Permit Revision Issued
IF status IN ('Revision Issued','Revised')
  THEN RETURN 'P8'

-- P7d Not Started flagged
IF status IN ('Work Not Started','Not Started','Not Started - Express',
              'Extension Granted','Extension in Progress')
  THEN RETURN 'P7d'

-- P7a/b/c Issued, pre-construction — time-bucketed
IF status = 'Permit Issued' AND NOT has_passed_inspection:
  IF issued_date IS NULL:
    RETURN 'P7c'
  days_since = NOW() - issued_date
  IF days_since <= 30:  RETURN 'P7a'
  IF days_since <= 90:  RETURN 'P7b'
  IF days_since <= 730: RETURN 'P7c'
  RETURN 'P7c' with stalled=true  -- > 2 years

-- P9-P17 Active Construction Sub-Stage
IF status = 'Inspection':
  IF latest_passed_stage IS NULL:
    RETURN 'P18'   -- Stage Unknown (fallback for 94.5% today)

  stage_lower = lower(latest_passed_stage)
  IF stage_lower matches ('excavation','shoring','site grading','demolition'):
    RETURN 'P9'
  IF stage_lower matches ('footings','foundations'):
    RETURN 'P10'
  IF stage_lower matches ('structural framing','framing'):
    RETURN 'P11'
  IF stage_lower matches ('hvac','plumbing rough','electrical rough',
                           'fire protection','fire access',
                           'water service','drain','sewers',
                           'water distribution','fire service'):
    RETURN 'P12'
  IF stage_lower matches ('insulation','vapour'):
    RETURN 'P13'
  IF stage_lower matches ('fire separations'):
    RETURN 'P14'
  IF stage_lower matches ('interior final','plumbing final','hvac final'):
    RETURN 'P15'
  IF stage_lower matches ('exterior final'):
    RETURN 'P16'
  IF stage_lower matches ('occupancy','final inspection'):
    RETURN 'P17'

  -- Unknown inspection stage (Change of Use, Repair/Retrofit, etc.)
  RETURN 'P18'

-- Fallback
RETURN NULL  -- flags for manual review (target: ≤ 100 rows)
```

### 1.6 Stalled modifier (orthogonal to phase)

Separate boolean column `lifecycle_stalled`:

```
stalled = (
  enriched_status = 'Stalled'                    -- honor the scraper's signal
  OR (status = 'Permit Issued'
      AND issued_date < NOW() - INTERVAL '2 years'
      AND NOT has_passed_inspection)
  OR (latest_inspection_date IS NOT NULL
      AND latest_inspection_date < NOW() - INTERVAL '180 days'
      AND status = 'Inspection')
)
```

The existing `enriched_status='Stalled'` IS still read as an input — the Strangler Fig leaves the scraper's operational state alone, but the new classifier consumes its signal to stay consistent. No dual source of truth: if the scraper says "stalled," the classifier honors that.

### 1.7 Expected distribution (validated against live DB 2026-04-11)

| Phase | Name | Expected count | Source |
|---|---|---:|---|
| P1 | Variance Requested | 35 | coa_applications |
| P2 | Variance Granted | 147 | coa_applications |
| P3 | Intake | 1,339 | permits |
| P4 | Under Review | 2,821 | permits |
| P5 | On Hold | 2,396 | permits |
| P6 | Ready to Issue | 3,152 | permits |
| P7a | Freshly Issued | 1,883 | permits (age ≤30d) |
| P7b | Mobilizing | 3,285 | permits (30–90d) |
| P7c | Recently Issued | 7,496 | permits (90–730d) |
| P7c + stalled | Old Issued | 33,802 | permits (>2yr, no inspections) |
| P7d | Not Started | ~1,200 | permits |
| P8 | Permit Revision Issued | 20,798 | permits |
| P9–P17 | Active sub-stages | ~7,000 | permits with inspection data |
| P18 | Stage Unknown | ~132,835 | permits in Inspection without data |
| P19 | Wind-down | 5,533 | permits |
| P20 | Closed | 8,656 | permits |
| O1 | Orphan Applied | ~10,000 | orphan permits |
| O2 | Orphan Active | ~18,400 | orphan permits |
| O3 | Orphan Stalled | ~6,000 | orphan permits |
| O4 | Orphan Closed (hidden) | ~2,000 | orphan permits in terminal |
| NULL (dead) | Filtered dead states | ~1,194 | permits |
| NULL (CoA dead) | Refused/withdrawn CoA | ~3,500 | coa_applications |
| NULL (linked CoA) | CoA inherits from permit | ~32,655 | coa_applications |
| **NULL (unclassified)** | **Edge case — MUST BE ≤ 100** | ≤ 100 | **blocking assertion** |

---

## Section 2 — Implementation approach

### 2.1 Schema — one migration, two tables, three columns each

**File: `migrations/085_lifecycle_phase_columns.sql`**

```sql
-- UP

-- Permits table columns
ALTER TABLE permits
  ADD COLUMN lifecycle_phase VARCHAR(10) DEFAULT NULL,
  ADD COLUMN lifecycle_stalled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN lifecycle_classified_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX idx_permits_lifecycle_phase
  ON permits (lifecycle_phase)
  WHERE lifecycle_phase IS NOT NULL;

CREATE INDEX idx_permits_lifecycle_classified_stale
  ON permits (permit_num)
  WHERE lifecycle_classified_at IS NULL
     OR last_seen_at > lifecycle_classified_at;

-- CoA applications table columns
ALTER TABLE coa_applications
  ADD COLUMN lifecycle_phase VARCHAR(10) DEFAULT NULL,
  ADD COLUMN lifecycle_classified_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX idx_coa_lifecycle_phase
  ON coa_applications (lifecycle_phase)
  WHERE lifecycle_phase IS NOT NULL;

CREATE INDEX idx_coa_lifecycle_classified_stale
  ON coa_applications (id)
  WHERE lifecycle_classified_at IS NULL
     OR last_seen_at > lifecycle_classified_at;

COMMENT ON COLUMN permits.lifecycle_phase IS
  'Business lifecycle phase per docs/reports/lifecycle_phase_implementation.md. Strangler Fig: NEW column, separate from operational enriched_status. Values: P3..P20, P7a-d, O1-O4. NULL=dead state or out of scope.';

COMMENT ON COLUMN permits.lifecycle_stalled IS
  'True if the permit is in a Stalled state regardless of primary phase. Orthogonal modifier.';

COMMENT ON COLUMN permits.lifecycle_classified_at IS
  'Timestamp of last successful classification. Incremental re-run trigger: last_seen_at > lifecycle_classified_at.';

COMMENT ON COLUMN coa_applications.lifecycle_phase IS
  'Business lifecycle phase. Values: P1 (Variance Requested), P2 (Variance Granted). NULL for linked CoAs (phase lives on the permit) or dead states (refused/withdrawn).';

-- DOWN
-- DROP INDEX IF EXISTS idx_coa_lifecycle_classified_stale;
-- DROP INDEX IF EXISTS idx_coa_lifecycle_phase;
-- DROP INDEX IF EXISTS idx_permits_lifecycle_classified_stale;
-- DROP INDEX IF EXISTS idx_permits_lifecycle_phase;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS lifecycle_classified_at;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS lifecycle_phase;
-- ALTER TABLE permits DROP COLUMN IF EXISTS lifecycle_classified_at;
-- ALTER TABLE permits DROP COLUMN IF EXISTS lifecycle_stalled;
-- ALTER TABLE permits DROP COLUMN IF EXISTS lifecycle_phase;
```

**Backfill strategy:** no migration-time UPDATE. The classifier script on first run writes every row. Expected first-run runtime: ~60-120 seconds for all 237K permits + 32K CoAs.

**Why separate `last_seen_at > classified_at` indexes on both tables:** the incremental re-classification query reads these to find dirty rows. Without the index, the nightly incremental run would full-scan both tables — a 5-second query becomes a 45-second query.

### 2.2 Classifier pure function — dual code path per CLAUDE.md §7

**File: `scripts/lib/lifecycle-phase.js`** — pure JavaScript function, no DB access, testable in isolation.

```javascript
// ~250 LOC total
// Exports: classifyLifecyclePhase(row) -> { phase, stalled }
//          classifyCoaPhase(coa_row) -> { phase }
//          DEAD_STATUS_SET, TERMINAL_P20_SET, etc. as constants for tests

const DEAD_STATUS_SET = new Set([
  'Cancelled','Revoked','Permit Revoked','Refused','Refusal Notice',
  'Application Withdrawn','Abandoned','Not Accepted','Work Suspended',
  'VIOLATION','Order Issued','Tenant Notice Period','Follow-up Required',
]);
// ... 7 more Sets, one per decision-tree group ...

function classifyLifecyclePhase(row) {
  // Applies §1.2–§1.6 decision tree verbatim
  // Inputs expected: { status, enriched_status, issued_date, is_orphan,
  //                     latest_passed_stage, latest_inspection_date,
  //                     has_passed_inspection, now }
  // Returns { phase: string|null, stalled: boolean }
}

function classifyCoaPhase(row) {
  // Applies §1.1 decision tree verbatim
  // Inputs expected: { decision, linked_permit_num, status }
  // Returns { phase: string|null }
}

const NORMALIZED_APPROVED_DECISIONS = new Set([/* ... */]);
const NORMALIZED_DEAD_DECISIONS = new Set([/* ... */]);

function normalizeCoaDecision(d) {
  if (d == null) return null;
  return String(d).toLowerCase().trim().replace(/\s+/g, ' ');
}

module.exports = {
  classifyLifecyclePhase,
  classifyCoaPhase,
  normalizeCoaDecision,
  DEAD_STATUS_SET, TERMINAL_P20_SET, /* ... */
  NORMALIZED_APPROVED_DECISIONS, NORMALIZED_DEAD_DECISIONS,
};
```

**Mirror file: `src/lib/classification/lifecycle-phase.ts`** — TypeScript port, bit-for-bit identical logic. Kept in sync per CLAUDE.md §7 (dual code path rule). Exported for any future server-side consumer and for the Vitest test suite.

**Why pure function:** testability. We can run 50,000 synthetic inputs through this in unit tests without touching PostgreSQL. §3.1 depends on this.

### 2.3 Pipeline script — `scripts/classify-lifecycle-phase.js`

```javascript
// ~250 LOC
// Runs as its own pipeline_runs entry. Called via the trigger step.

const pipeline = require('./lib/pipeline');
const { classifyLifecyclePhase, classifyCoaPhase } = require('./lib/lifecycle-phase');

pipeline.run('classify-lifecycle-phase', async (pool) => {
  const now = new Date();

  // ─── Phase 1: classify dirty permit rows ──────────────────────────
  const { rows: dirtyPermits } = await pool.query(`
    SELECT p.permit_num, p.revision_num, p.status, p.enriched_status,
           p.issued_date, p.last_seen_at,
           -- is_orphan via application number
           NOT EXISTS (
             SELECT 1 FROM permits s
             WHERE split_part(s.permit_num, ' ', 1) || ' ' || split_part(s.permit_num, ' ', 2)
                 = split_part(p.permit_num, ' ', 1) || ' ' || split_part(p.permit_num, ' ', 2)
               AND split_part(s.permit_num, ' ', 3) IN ('BLD','CMB')
               AND s.permit_num <> p.permit_num
           ) AS is_orphan,
           (SELECT stage_name FROM permit_inspections i
            WHERE i.permit_num = p.permit_num AND i.status = 'Passed'
            ORDER BY inspection_date DESC NULLS LAST LIMIT 1) AS latest_passed_stage,
           (SELECT MAX(inspection_date) FROM permit_inspections i
            WHERE i.permit_num = p.permit_num) AS latest_inspection_date,
           EXISTS (SELECT 1 FROM permit_inspections i
                   WHERE i.permit_num = p.permit_num AND i.status = 'Passed') AS has_passed_inspection
      FROM permits p
     WHERE p.lifecycle_classified_at IS NULL
        OR p.last_seen_at > p.lifecycle_classified_at
  `);

  let permitsUpdated = 0;
  await pipeline.withTransaction(pool, async (client) => {
    for (const batch of chunkArray(dirtyPermits, 1000)) {
      const rows = batch.map(r => ({
        ...r,
        ...classifyLifecyclePhase({ ...r, now }),
      }));
      // Batched UPDATE via VALUES with IS DISTINCT FROM guards
      const result = await client.query(buildBatchedUpdateSQL(rows), flattenParams(rows));
      permitsUpdated += result.rowCount;
    }
  });

  // ─── Phase 2: classify dirty CoA rows ─────────────────────────────
  const { rows: dirtyCoAs } = await pool.query(`
    SELECT id, decision, linked_permit_num, status, last_seen_at
      FROM coa_applications
     WHERE lifecycle_classified_at IS NULL
        OR last_seen_at > lifecycle_classified_at
  `);

  let coasUpdated = 0;
  await pipeline.withTransaction(pool, async (client) => {
    for (const batch of chunkArray(dirtyCoAs, 1000)) {
      const rows = batch.map(r => ({ ...r, ...classifyCoaPhase(r) }));
      const result = await client.query(buildCoaBatchedUpdateSQL(rows), flattenCoaParams(rows));
      coasUpdated += result.rowCount;
    }
  });

  // ─── Phase 3: distribution sanity + telemetry ────────────────────
  const distribution = await fetchDistribution(pool);
  const unclassified = await fetchUnclassifiedCount(pool);
  const stalledCount = await fetchStalledCount(pool);

  pipeline.emitSummary({
    records_total: dirtyPermits.length + dirtyCoAs.length,
    records_new: 0,
    records_updated: permitsUpdated + coasUpdated,
    records_meta: {
      permits_updated: permitsUpdated,
      coas_updated: coasUpdated,
      phase_distribution: distribution,
      stalled_count: stalledCount,
      unclassified_count: unclassified,
      // §3.3 distribution sanity assertion — BLOCKS if fails
      audit_table: buildDistributionAuditRows(distribution, unclassified),
    },
  });

  pipeline.emitMeta(
    { permits: ['permit_num','revision_num','status','enriched_status','issued_date','last_seen_at'],
      permit_inspections: ['permit_num','stage_name','status','inspection_date'],
      coa_applications: ['id','decision','linked_permit_num','last_seen_at'] },
    { permits: ['lifecycle_phase','lifecycle_stalled','lifecycle_classified_at'],
      coa_applications: ['lifecycle_phase','lifecycle_classified_at'] }
  );
});
```

**Idempotency:** `IS DISTINCT FROM` guards in the UPDATE clauses + incremental WHERE filter. Second run on unchanged data updates 0 rows in ~2-5 seconds.

**First-run performance:** the `is_orphan` subquery is the expensive part. Expected ~60 seconds for all 237K permits + 32K CoAs with the existing indexes. If too slow, add a generated `application_number` column in migration 085.

### 2.4 Trigger step — `scripts/trigger-lifecycle-sync.js`

Thin handoff. Used by both the permits chain and the CoA chain.

```javascript
// ~60 LOC
const pipeline = require('./lib/pipeline');
const { spawn } = require('node:child_process');
const path = require('node:path');

pipeline.run('trigger-lifecycle-sync', async (pool) => {
  // Detached spawn — the classifier runs as its own pipeline_runs entry
  // and this step does NOT wait for completion. Marks itself PASS as
  // soon as the spawn succeeds.

  const scriptPath = path.join(__dirname, 'classify-lifecycle-phase.js');
  const child = spawn('node', [scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const triggerPid = child.pid;
  if (!triggerPid) {
    throw new Error('Failed to spawn classify-lifecycle-phase.js');
  }

  pipeline.log.info('[trigger-lifecycle-sync]',
    `Spawned classify-lifecycle-phase (pid=${triggerPid})`);

  pipeline.emitSummary({
    records_total: 1,
    records_new: 0,
    records_updated: 0,
    records_meta: {
      trigger_pid: triggerPid,
      trigger_fired_at: new Date().toISOString(),
      downstream_script: 'classify-lifecycle-phase.js',
      note: 'See sibling pipeline_runs entry for classify-lifecycle-phase for actual work',
    },
  });

  pipeline.emitMeta({}, {});
});
```

### 2.5 Pipeline chain integration — two orchestrator edits

**Permits chain** (`scripts/run-chain.js` OR `scripts/manifest.json` — verify which during State Verification): add `trigger_lifecycle_sync` as the final step after the existing `engine_health` (or whatever the current terminal step is).

**CoA chain** (spec 42): add `trigger_lifecycle_sync` as the final step after `link_coa`.

Both chains reference the same `scripts/trigger-lifecycle-sync.js`. The classifier runs twice on a typical day (once after each chain completes), which is safe due to idempotency (§2.3).

### 2.6 Feed consumer change — the payoff

**File: `src/features/leads/lib/get-lead-feed.ts`**

Current behavior (lines 177–181 + 495–500):
```typescript
CASE WHEN pt.phase IN ('structural','finishing','early_construction','landscaping')
     THEN 'high' ELSE 'medium' END AS timing_confidence
// ...
export const TIMING_DISPLAY_BY_CONFIDENCE = {
  high: 'Active build phase',   // ← every card sees this
  medium: 'Estimated timing',
  low: 'Pre-permit stage',
};
```

Change: drop the `timing_confidence` derivation, project `p.lifecycle_phase` and `p.lifecycle_stalled` into the feed result, and build the display label from a new `LIFECYCLE_PHASE_DISPLAY` lookup:

```typescript
// src/features/leads/lib/lifecycle-phase-display.ts  (NEW file, ~40 LOC)
export const LIFECYCLE_PHASE_DISPLAY: Record<string, string> = {
  P1: 'Variance requested',
  P2: 'Variance granted',
  P3: 'Application intake',
  P4: 'Under review',
  P5: 'On hold',
  P6: 'Ready to issue',
  P7a: 'Freshly issued',
  P7b: 'Mobilizing',
  P7c: 'Recently issued',
  P7d: 'Not started',
  P8: 'Permit revised',
  P9: 'Site prep',
  P10: 'Foundation',
  P11: 'Framing',
  P12: 'Rough-in',
  P13: 'Insulation',
  P14: 'Fire separations',
  P15: 'Interior finishing',
  P16: 'Exterior finishing',
  P17: 'Final walkthrough',
  P18: 'Construction active',
  P19: 'Wind-down',
  P20: 'Closed',
  O1: 'Trade permit applied',
  O2: 'Trade permit active',
  O3: 'Trade permit stalled',
  O4: 'Trade permit closed',
};

export function displayLifecyclePhase(
  phase: string | null,
  stalled: boolean,
): string {
  if (!phase) return 'Unknown';
  const base = LIFECYCLE_PHASE_DISPLAY[phase] ?? phase;
  return stalled ? `${base} (stalled)` : base;
}
```

Feed SQL edit — replace the `timing_confidence` CASE with direct projection:

```sql
-- Remove:
-- CASE WHEN pt.phase IN (...) THEN 'high' ELSE 'medium' END AS timing_confidence

-- Add:
p.lifecycle_phase,
p.lifecycle_stalled,
-- preserve existing timing_confidence as a deprecated field during transition
'medium'::text AS timing_confidence,  -- legacy compat, will be retired
```

`mapRow` boundary in `get-lead-feed.ts` — set `timing_display = displayLifecyclePhase(row.lifecycle_phase, row.lifecycle_stalled)`.

**Total feed code delta: ~15 lines changed, 1 new helper file, zero schema-shape changes on the API response.** Consumers that read `timing_display` keep working — they just see meaningful values instead of "Active build phase" for every card.

### 2.7 `link-coa.js` one-line fix

Line 143 and line 232 already bump `coa_applications.last_seen_at`. Add a sibling UPDATE after the CoA linker UPDATE that bumps `permits.last_seen_at` for any permit that just received a new CoA link:

```sql
-- After the existing UPDATE coa_applications SET linked_permit_num = ...
UPDATE permits
   SET last_seen_at = NOW()
 WHERE permit_num = ANY ($1)  -- array of permit_nums that just got linked
   AND last_seen_at < NOW() - INTERVAL '1 minute';  -- idempotency guard
```

This ensures the downstream lifecycle classifier sees the permit as dirty on its next incremental run and re-evaluates its phase (P1 → P3+ transition happens when a CoA links to an intake permit).

### 2.8 Complete file inventory

| # | Path | Type | New/Modified | LOC |
|---|---|---|---|---:|
| 1 | `migrations/085_lifecycle_phase_columns.sql` | SQL migration | NEW | ~60 |
| 2 | `scripts/lib/lifecycle-phase.js` | Pure JS function | NEW | ~250 |
| 3 | `src/lib/classification/lifecycle-phase.ts` | TS mirror (dual code path) | NEW | ~250 |
| 4 | `scripts/classify-lifecycle-phase.js` | Pipeline script | NEW | ~250 |
| 5 | `scripts/trigger-lifecycle-sync.js` | Trigger handoff script | NEW | ~60 |
| 6 | `scripts/run-chain.js` or `scripts/manifest.json` | Orchestrator edit | MODIFIED | ~6 |
| 7 | `scripts/link-coa.js` | Add permits.last_seen_at bump | MODIFIED | ~10 |
| 8 | `src/features/leads/lib/lifecycle-phase-display.ts` | Display label lookup | NEW | ~40 |
| 9 | `src/features/leads/lib/get-lead-feed.ts` | Read lifecycle_phase in SQL + mapRow | MODIFIED | ~20 |
| 10 | `src/features/leads/types.ts` | Add lifecycle_phase to PermitLeadFeedItem type | MODIFIED | ~5 |
| 11 | `src/tests/lifecycle-phase.logic.test.ts` | Unit tests (24 branches + boundaries + fuzzing) | NEW | ~500 |
| 12 | `src/tests/classify-lifecycle-phase.infra.test.ts` | Infra tests (idempotency, incremental, distribution) | NEW | ~200 |
| 13 | `src/tests/migration-085.infra.test.ts` | File-shape test | NEW | ~80 |
| 14 | `src/tests/get-lead-feed.logic.test.ts` | Update for new SQL shape | MODIFIED | ~50 |
| 15 | `src/tests/api-leads-feed.infra.test.ts` | Update response assertions | MODIFIED | ~20 |
| 16 | `scripts/quality/assert-lifecycle-phase-distribution.js` | CQA distribution sanity check | NEW | ~120 |
| 17 | `scripts/quality/lifecycle-phase-sql-reproducer.sql` | SQL round-trip verification | NEW | ~150 |
| 18 | `docs/specs/pipeline/41_chain_permits.md` | Document new trigger step | MODIFIED | ~20 |
| 19 | `docs/specs/pipeline/42_chain_coa.md` | Document new trigger step | MODIFIED | ~15 |
| 20 | `docs/specs/01_database_schema.md` | Document new columns | MODIFIED | ~25 |

**Total new code: ~1,980 LOC.** Zero changes to `enriched_status`, `permit_trades`, `classify-permits.js`, `classify-inspection-status.js`, `classify-permit-phase.js`, `aic-scraper-nodriver.py`, or any UI component other than the card's timing-display wiring.

---

## Section 3 — The 10 correctness checks (expanded for CoA)

Unchanged structure from the prior draft. Each check is a blocking gate.

### 3.1 Pure-function unit tests, 100% branch coverage

`src/tests/lifecycle-phase.logic.test.ts` — table-driven test suite covering every branch in §1.1–§1.5. Minimum cases:

- 1 case per phase value (24 phases + 2 NULL buckets = 26 cases minimum)
- 8 boundary cases (P7a/P7b at exactly 30 days, P7b/P7c at 90, P7c/stalled at 730 days, orphan stalled at 180, each with +1 and -1 day)
- 12 edge cases (NULL inputs, empty strings, unknown statuses, malformed permit_num, non-standard CoA decision casings)
- 5 CoA-specific cases (linked CoA returns NULL, refused/withdrawn returns NULL, every canonical approved casing returns P2, NULL decision returns P1)
- 1,000 random fuzz inputs (§3.8)

**Pass criteria:** Vitest coverage report shows **100% branch coverage** on both `scripts/lib/lifecycle-phase.js` AND `src/lib/classification/lifecycle-phase.ts`. 0% tolerance.

### 3.2 SQL round-trip reproduction

`scripts/quality/lifecycle-phase-sql-reproducer.sql` — pure SQL CASE expression that reproduces every branch of §1.1–§1.5 independently. Diff against the classifier's output.

**Pass criteria:**
```sql
SELECT COUNT(*) FROM permits p
JOIN (SELECT permit_num, revision_num, sql_computed_phase FROM reproducer) r
  USING (permit_num, revision_num)
WHERE p.lifecycle_phase IS DISTINCT FROM r.sql_computed_phase;
-- Expected: 0

SELECT COUNT(*) FROM coa_applications c
JOIN (SELECT id, sql_computed_phase FROM coa_reproducer) r USING (id)
WHERE c.lifecycle_phase IS DISTINCT FROM r.sql_computed_phase;
-- Expected: 0
```

Any non-zero count fails the check. Catches the "I forgot to handle status X" class of bug that unit tests miss.

### 3.3 Distribution sanity assertion (CQA, daily)

`scripts/quality/assert-lifecycle-phase-distribution.js` — Tier 2 data-bounds check that runs inside the classifier's pipeline_runs entry (or as a separate step immediately after it).

**Expected counts + tolerance** (±5% band unless marked otherwise):

```javascript
const EXPECTED_DISTRIBUTION = {
  // permits
  'P3':  { min: 1270, max: 1410 },
  'P4':  { min: 2680, max: 2965 },
  'P5':  { min: 2275, max: 2515 },
  'P6':  { min: 2995, max: 3310 },
  'P7a': { min: 1790, max: 1980 },
  'P7b': { min: 3120, max: 3450 },
  'P7c': { min: 39000, max: 43000 }, // includes the ~33K stalled bucket
  'P7d': { min: 1140, max: 1260 },
  'P8':  { min: 19750, max: 21850 },
  'P9-P17': { min: 6650, max: 7350 },
  'P18': { min: 126000, max: 139500 },
  'P19': { min: 5255, max: 5810 },
  'P20': { min: 8220, max: 9090 },
  'O1':  { min: 9500, max: 10500 },
  'O2':  { min: 17480, max: 19320 },
  'O3':  { min: 5700, max: 6300 },

  // coa
  'P1':  { min: 30, max: 45 },
  'P2':  { min: 140, max: 160 },
};

const UNCLASSIFIED_MAX = 100;  // hard limit
```

**Pass criteria:** every phase within its ±5% band AND `unclassified_count ≤ 100`. Distribution drift outside these bands fails the CQA step and turns the admin dashboard banner yellow.

### 3.4 Manual sampling spot-check

`scripts/quality/lifecycle-phase-sampling.js` — outputs `docs/reports/lifecycle-phase-sampling-YYYY-MM-DD.md` with 10 random samples per phase (24 phases × 10 rows = 240 rows) plus 20 random unclassified rows for manual review.

**Pass criteria:** human reviewer (you) confirms every sampled row's phase makes sense given its raw data. This is the only manual step — it's the safety net that catches "the logic is technically correct but the semantics are wrong."

### 3.5 Cross-check against `enriched_status`

The Strangler Fig approach leaves `enriched_status` untouched, but the classifier still reads it for the stalled modifier. We assert that the two signals agree where they overlap:

```sql
-- Every 'Stalled' enriched_status should have lifecycle_stalled = true
SELECT COUNT(*) FROM permits
WHERE enriched_status = 'Stalled' AND lifecycle_stalled = false;
-- Expected: 0

-- Every 'Active Inspection' enriched_status should land in P9-P18 (active construction)
SELECT COUNT(*) FROM permits
WHERE enriched_status = 'Active Inspection'
  AND lifecycle_phase NOT IN ('P9','P10','P11','P12','P13','P14','P15','P16','P17','P18');
-- Expected: 0

-- Every 'Inspections Complete' should be P17
SELECT COUNT(*) FROM permits
WHERE enriched_status = 'Inspections Complete' AND lifecycle_phase <> 'P17';
-- Expected: 0 (or very low — edge case when stage_name doesn't match)

-- Every 'Permit Issued' enriched_status should be P7a/b/c/d or P8
SELECT COUNT(*) FROM permits
WHERE enriched_status = 'Permit Issued'
  AND lifecycle_phase NOT IN ('P7a','P7b','P7c','P7d','P8');
-- Expected: 0
```

**Pass criteria:** all 4 queries return 0. Wired into the CQA step.

### 3.6 Idempotency

`src/tests/classify-lifecycle-phase.infra.test.ts`:

```typescript
test('classifier is idempotent — second run updates 0 rows', async () => {
  const first = await runClassifier();
  expect(first.records_updated).toBeGreaterThan(0);
  const second = await runClassifier();
  expect(second.records_updated).toBe(0);
});
```

### 3.7 Incremental re-classification trigger

```typescript
test('incremental re-classification picks up only dirty rows', async () => {
  await runClassifier();
  await pool.query(`UPDATE permits SET last_seen_at = NOW(), status = 'Inspection'
                    WHERE permit_num = $1`, ['25 999999 BLD']);
  const result = await runClassifier();
  expect(result.records_updated).toBe(1);
});

test('CoA re-linking triggers permit re-classification', async () => {
  // Verifies the §2.7 link-coa.js fix works end-to-end
  const beforePhase = await getPhase('25 999999 BLD');
  await pool.query(`INSERT INTO coa_applications (...) VALUES (...)`);
  await runLinkCoa();  // should bump permits.last_seen_at
  await runClassifier();
  const afterPhase = await getPhase('25 999999 BLD');
  expect(afterPhase).not.toBe(beforePhase);  // phase moved
});
```

### 3.8 Null-safety fuzzing

```typescript
test('classifier never throws on any input (1000 random permits)', () => {
  for (let i = 0; i < 1000; i++) {
    const row = randomPermitRow();
    expect(() => classifyLifecyclePhase(row)).not.toThrow();
    const result = classifyLifecyclePhase(row);
    expect(VALID_PHASES.has(result.phase) || result.phase === null).toBe(true);
    expect(typeof result.stalled).toBe('boolean');
  }
});

test('CoA classifier never throws on any input (1000 random CoAs)', () => {
  for (let i = 0; i < 1000; i++) {
    const row = randomCoaRow();
    expect(() => classifyCoaPhase(row)).not.toThrow();
  }
});
```

### 3.9 Migration safety

```typescript
test('migration 085 is idempotent', async () => {
  await applyMigration('085_lifecycle_phase_columns.sql');
  await applyMigration('085_lifecycle_phase_columns.sql');  // should be no-op
});

test('migration 085 adds exactly the expected columns on both tables', async () => {
  const permitsCols = await columnsMatching('permits', 'lifecycle_%');
  expect(permitsCols.sort()).toEqual([
    'lifecycle_classified_at','lifecycle_phase','lifecycle_stalled',
  ]);
  const coaCols = await columnsMatching('coa_applications', 'lifecycle_%');
  expect(coaCols.sort()).toEqual([
    'lifecycle_classified_at','lifecycle_phase',
  ]);
});
```

Plus passes `scripts/validate-migration.js` (pre-commit hook).

### 3.10 Pipeline telemetry + trigger chain integration test

`src/tests/classify-lifecycle-phase.infra.test.ts`:

```typescript
test('PIPELINE_SUMMARY includes complete phase_distribution dict', async () => {
  const summary = await runClassifierAndCaptureSummary();
  expect(summary.records_meta.phase_distribution).toHaveProperty('P1');
  expect(summary.records_meta.phase_distribution).toHaveProperty('P7a');
  expect(summary.records_meta.phase_distribution).toHaveProperty('O3');
  // ... all 24 phases
});

test('trigger-lifecycle-sync spawns child and marks PASS immediately', async () => {
  const start = Date.now();
  await runTrigger();
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(1000);  // detached spawn is fast
  // The classifier runs async — verify its pipeline_runs row appears separately
});
```

### 3.11 Summary table

| # | Check | Type | Blocking |
|---|---|---|---|
| 1 | Unit tests — 100% branch coverage | Pre-commit | Yes |
| 2 | SQL round-trip reproducer | Local + CQA | Yes |
| 3 | Distribution sanity assertion | Daily CQA | Yes |
| 4 | Manual sampling spot-check | Once (pre-merge) | Yes |
| 5 | Cross-check vs enriched_status | Daily CQA | Yes |
| 6 | Idempotency | Pre-commit | Yes |
| 7 | Incremental re-classification trigger | Pre-commit | Yes |
| 8 | Null-safety fuzzing | Pre-commit | Yes |
| 9 | Migration safety | Pre-commit | Yes |
| 10 | Pipeline telemetry + trigger integration | Pre-commit | Yes |

**10 blocking gates. Nothing merges unless all 10 pass.**

---

## Section 4 — Rollout plan

### 4.1 Sequence (matches WF2 execution plan below)

1. **State verification** — confirm classifier preconditions (CoA linker gap, chain orchestrator file, existing test coverage)
2. **Pure function + unit tests** (checks 1, 8) — standalone commit, zero DB interaction
3. **Migration + file-shape test** (check 9) — standalone commit
4. **Local apply + Drizzle regen** — `npm run migrate && npm run db:generate`
5. **Classifier pipeline script** — runnable locally against 237K rows
6. **SQL round-trip reproducer** (check 2) — verify against local snapshot, 0 disagreements
7. **First-run backfill** — ~60-120 seconds. Generate sampling report (check 4). Manual review.
8. **Distribution sanity CQA assertion** (check 3) + **enriched_status cross-check** (check 5)
9. **link-coa.js fix** — add the `permits.last_seen_at` bump + its infra test (check 7)
10. **Trigger script + chain integration** — add step to both chains, run full local permits + CoA chains end-to-end
11. **Feed SQL + display helper change** — minimal feed delta + updated test assertions
12. **UI regression check** — LeadFeed.ui.test.tsx expanded to cover the new display labels
13. **Full `npm run test` + `npm run lint -- --fix`** — zero failures
14. **Commit + PR + independent review agent** — per CLAUDE.md review protocol
15. **Merge** — production daily pipeline picks up the new classifier on its next run

### 4.2 Rollback plan

If classifier is wrong in production:

1. **Immediate:** `UPDATE permits SET lifecycle_phase = NULL, lifecycle_stalled = false` + `UPDATE coa_applications SET lifecycle_phase = NULL` — hides bad data without dropping columns. Feed falls back to the phase='Unknown' label.
2. **Remove trigger steps:** revert chain config (orchestrator edit). Classifier stops running.
3. **Investigate + fix:** re-run sampling report, identify the bad rule, fix in `lifecycle-phase.ts/.js`, re-test.
4. **Re-enable:** re-run classifier to backfill.

**Nothing downstream reads `lifecycle_phase` except the feed's display label.** The feed response shape stays the same — a NULL phase just renders "Unknown" on the card instead of "Active build phase." No crash, no cascading failure.

### 4.3 Success criteria — all must be true before WF2 Green Light

- [ ] All 10 correctness checks in §3 pass
- [ ] Unit test branch coverage on both `lifecycle-phase.js` and `lifecycle-phase.ts` = 100%
- [ ] Distribution sanity CQA assertion passes (every phase within ±5%)
- [ ] `NULL (unclassified)` count ≤ 100 rows
- [ ] SQL round-trip: 0 disagreements on all 237K permits + 32K CoAs
- [ ] Cross-check vs `enriched_status`: 0 disagreements on all 4 queries
- [ ] Manual sampling review: 100% of 240 sampled rows judged correct
- [ ] Incremental re-classification: modifying one permit triggers exactly one reclassification
- [ ] Both chains (permits + CoA) run end-to-end with the new trigger step
- [ ] Feed cards render distinct phase labels (P7a shows "Freshly issued", P11 shows "Framing", etc. — NOT all cards saying "Active build phase")
- [ ] No existing test in the repo is broken by the schema change or feed edit
- [ ] `npm run lint -- --fix` clean
- [ ] `npm run typecheck` zero errors
- [ ] Independent review agent approves per CLAUDE.md protocol

---

## Section 5 — Next steps after this WF2 ships

Explicitly out of scope here but listed so the path forward is obvious:

| Future WF3 | Depends on V1 classifier |
|---|---|
| Map marker icons (phase-driven Heroicons replacing `$$$$`) | Needs `lifecycle_phase` populated — unblocked by this WF2 |
| Card phase chip as primary info | Unblocked |
| Predictive-claim LEFT ANTI JOIN | Needs the suffix→trade map + HOT/CLAIMED scoring logic (separate WF3) |
| `is_active=true` filter removal | Needs phase-distance scoring signal (separate WF3) |
| Application-level aggregation | Needs the `application_number` generated column (separate WF3) |
| Inspection stage map expansion (19 new rows) | Independent — ships in parallel |
| Scraper target expansion to New Building + Non-Res | Independent — ships in parallel |
| Retire `enriched_status` and its 3 populator scripts | Blocked on the above — final consolidation WF3 |

Each future WF3 is a trivial consumer of the column this WF2 creates. The architecture is additive — no later WF3 needs to touch the classifier itself, just read its output.

---

## Appendix — reproducibility

Every count in §1.7 and §3.3 is re-derivable from live DB queries in `docs/reports/lead_feed_status_inventory.md`. Snapshot: 2026-04-11.

Companion documents:
- `docs/reports/lead_feed_status_inventory.md` — raw inventory (54 permit statuses, 22 CoA statuses, 35 inspection stages)
- `docs/reports/lead_feed_stage_map.md` — the full product vision (superset of this V1; this doc is the minimal first step toward that vision)
- `.cursor/active_task.md` — the WF2 active task drafted alongside this rewrite
