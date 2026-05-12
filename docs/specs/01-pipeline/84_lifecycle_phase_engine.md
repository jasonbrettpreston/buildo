# 84 Lifecycle Phase Engine — The "Strangler Fig" Classifier

> **Status:** ARCHITECTURE LOCKED — Version 2 State Machine Implemented (April 2026).
> **Purpose:** To provide a unified, chronological status for every construction project by merging Committee of Adjustment (CoA) data, building permits, and physical inspection results.

## 1. Goal & User Story

To provide a unified, chronological status for every construction project by merging Committee of Adjustment (CoA) data, building permits, and physical inspection results.

**User Story:** A tradesperson uses the lifecycle to filter for "P11 Framing" leads, knowing the engine has verified the foundation inspections are passed.

---

## 2. Technical Architecture

### Database Schema

The engine mutates core tables and populates a historical transition ledger.

#### `permits` & `coa_applications` (Core Fields)
| Column | Type | Description |
|---|---|---|
| `lifecycle_phase` | VARCHAR | The current stage (P1-P20, INTAKE_P3, O1-O3). |
| `lifecycle_stalled` | BOOLEAN | `TRUE` if no activity detected within threshold. |
| `phase_started_at` | TIMESTAMPTZ | The immutable anchor for countdown math. |
| `lifecycle_classified_at` | TIMESTAMPTZ | Watermark for incremental processing. |

#### `permit_phase_transitions` (Historical Ledger)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `permit_num` | VARCHAR | FK -> permits | |
| `from_phase` | VARCHAR | | The previous stage (NULL on first run) |
| `to_phase` | VARCHAR | | The new stage |
| `transitioned_at` | TIMESTAMPTZ | | Timestamp of the detected shift |

> **Ledger key scope (added 2026-05-11):** the ledger is keyed on `(permit_num, revision_num)` — it captures permit-side transitions only. CoA-side lifecycle transitions are NOT written here; `coa_applications.lifecycle_phase` is the in-place column for CoA phase state and there's no CoA equivalent transition table. **Implication:** the WF1 #B/#C `lifecycle.timeline[]` panel (Spec 76 §3.5) reads `permit_phase_transitions` and therefore structurally cannot render meaningful history for CoA-only leads (`lead_id = COA-${application_number}` per Spec 91 §4.3.1). Cross-stream timeline rendering is the scope of Fix B WF1 (queued — see `.cursor/queued_task_coa_lifecycle_fixes.md`).

### Implementation
- **Script:** `scripts/classify-lifecycle-phase.js`
- **Logic Library:** `scripts/lib/lifecycle-phase.js` (Pure function `classifyLifecyclePhase`)
- **Pipeline Wiring:**
  - **Permits Chain:** Step 21 of 24. Runs after `assert_engine_health` and before the marketplace tail.
  - **CoA Chain:** Step 10 of 10. No forecasts run on pre-permit CoA data.
  - Holds `pg_try_advisory_lock(85)` on a dedicated `pool.connect()` client to prevent concurrent runs.
  - **CoA Stall Detection:** Consumes `logic_variables.coa_stall_threshold` (seeded 30 days) to flag `lifecycle_stalled = TRUE`.

---

## 2.5. Raw Data Inputs (snapshot 2026-05-12)

> **Authoritative inventory of every column the lifecycle classifier reads.** Counts pulled live from the production DB at 2026-05-12T13:28:40Z. Row totals: `permits` = 247,030 · `coa_applications` = 33,052 · `permit_inspections` = 94,645.
>
> This section exists for **future contract-matching exercises**: every distinct value below should be reconcilable against a §3 trigger row. Values currently mapped by the classifier show their destination phase; values the classifier ignores or fails to match are flagged. Drift between §3 and §2.5 is bug-track-worthy.
>
> **Tables are ordered by natural lifecycle progression**, not alphabetical and not by count.

### §2.5.a `permits.status` — 53 distinct values

Source field: `permits.status` (raw CKAN/CCO feed). Read by `classifyLifecyclePhase()` in `scripts/lib/lifecycle-phase.js`. Whitespace-trimmed via `normalizeStatus()` before set-membership checks.

| # | Status | Rows | Current code maps to | Notes |
|---|---|---|---|---|
| **Block 1 — Application Intake** ||||
| 1 | Application Received | 218 | P3 | `INTAKE_P3_SET` — code emits literal `'P3'`, colliding with CoA P3 |
| 2 | Application Acceptable | 465 | P3 | `INTAKE_P3_SET` |
| 3 | Active | 24 | P3 | `INTAKE_P3_SET` |
| 4 | Open | 519 | P3 | `INTAKE_P3_SET` |
| 5 | Plan Review Complete | 57 | P3 | `INTAKE_P3_SET` |
| 6 | Request Received | 1 | P3 | `INTAKE_P3_SET` |
| **Block 2 — Application Review** ||||
| 7 | Under Review | 2,100 | P4 | `REVIEW_P4_SET` — note trailing space in source data; trimmed at runtime |
| 8 | Examination | 30 | P4 | `REVIEW_P4_SET` |
| 9 | Examiner's Notice Sent | 2,757 | P4 | `REVIEW_P4_SET` |
| 10 | Consultation Completed | 2 | P4 | `REVIEW_P4_SET` |
| 11 | Notice Sent | 1 | **UNMAPPED** → null | Falls through entire decision tree; counted by `unclassified_count` CQA gate |
| **Block 3 — On Hold / Deficient** ||||
| 12 | Application On Hold | 1,655 | P5 | `HOLD_P5_SET` |
| 13 | Application on Hold | 4 | P5 | `HOLD_P5_SET` (case variant — both members of set) |
| 14 | Deficiency Notice Issued | 117 | P5 | `HOLD_P5_SET` |
| 15 | Response Received | 436 | P5 | `HOLD_P5_SET` |
| 16 | Pending Parent Folder Review | 33 | P5 | `HOLD_P5_SET` |
| **Block 4 — Ready for Issuance / Approved** ||||
| 17 | Ready for Issuance | 233 | P6 | `READY_P6_SET` |
| 18 | Forwarded for Issuance | 3 | P6 | `READY_P6_SET` |
| 19 | Issuance Pending | 2,974 | P6 | `READY_P6_SET` |
| 20 | Approved | 23 | P6 | `READY_P6_SET` — distinct from CoA `decision = Approved` |
| 21 | Agreement in Progress | 10 | P6 | `READY_P6_SET` |
| 22 | Licence Issued | 4 | P6 | `READY_P6_SET` |
| **Block 5 — Permit Issued / Pre-Inspection** ||||
| 23 | Permit Issued | 52,403 | P7a / P7b / P7c / P9-P17 | Time-bucketed by `NOW() - issued_date` (≤30d→P7a, 31-90d→P7b, >90d→P7c); promoted to P9-P17 if any inspection has passed |
| 24 | Work Not Started | 1,093 | P7d | `NOT_STARTED_P7D_SET` |
| 25 | Not Started | 1,063 | P7d | `NOT_STARTED_P7D_SET` |
| 26 | Not Started - Express | 92 | P7d | `NOT_STARTED_P7D_SET` |
| 27 | Extension Granted | 3 | P7d | `NOT_STARTED_P7D_SET` |
| **Block 6 — Revision** ||||
| 28 | Revision Issued | 20,698 | P8 | `REVISION_P8_SET` — note: §3 contract describes P8 as "Mobilization / site fence", code repurposes for revisions (drift) |
| 29 | Revised | 27 | P8 | `REVISION_P8_SET` |
| 30 | Order Complied | 22 | P8 | `REVISION_P8_SET` |
| **Block 7 — Active Inspection** ||||
| 31 | Inspection | 138,546 | P9-P17 or P18 | Mapped by `latest_passed_stage` via inspection-stage table (§2.5.d); falls to P18 if no stage matches |
| 32 | Forward to Inspector | 1 | P18 | `INSPECTION_PIPELINE_P18_SET` — §3 calls P18 "Project Closed" (drift) |
| 33 | Rescheduled | 1 | P18 | `INSPECTION_PIPELINE_P18_SET` |
| **Block 8 — Wind-Down / Pre-Terminal** ||||
| 34 | Pending Closed | 6,699 | P19 | `WINDDOWN_P19_SET` — §3 calls P19 "Cancelled" (drift) |
| 35 | Pending Cancellation | 488 | P19 | `WINDDOWN_P19_SET` |
| 36 | Revocation Pending | 2,335 | P19 | `WINDDOWN_P19_SET` |
| 37 | Revocation Notice Sent | 1 | P19 | `WINDDOWN_P19_SET` |
| 38 | Inspection Request to Cancel | 1 | P19 | `WINDDOWN_P19_SET` |
| **Block 9 — Terminal (Closed)** ||||
| 39 | Closed | 10,695 | P20 | `TERMINAL_P20_SET` — §3 calls P20 "Revoked" (drift) |
| 40 | File Closed | 6 | P20 | `TERMINAL_P20_SET` |
| 41 | Permit Issued/Close File | 2 | P20 | `TERMINAL_P20_SET` |
| **Block 10 — Terminal (Dead — excluded from classification entirely)** ||||
| 42 | Refusal Notice | 958 | null (DEAD) | `DEAD_STATUS_SET` — phase deliberately unset; excluded from `unclassified_count` |
| 43 | Abandoned | 122 | null (DEAD) | `DEAD_STATUS_SET` |
| 44 | Application Withdrawn | 49 | null (DEAD) | `DEAD_STATUS_SET` |
| 45 | Work Suspended | 18 | null (DEAD) | `DEAD_STATUS_SET` |
| 46 | VIOLATION | 16 | null (DEAD) | `DEAD_STATUS_SET` |
| 47 | Not Accepted | 9 | null (DEAD) | `DEAD_STATUS_SET` |
| 48 | Order Issued | 7 | null (DEAD) | `DEAD_STATUS_SET` |
| 49 | Permit Revoked | 2 | null (DEAD) | `DEAD_STATUS_SET` |
| 50 | Revoked | 2 | null (DEAD) | `DEAD_STATUS_SET` — §3 says P20 should fire here; doesn't |
| 51 | Cancelled | 1 | null (DEAD) | `DEAD_STATUS_SET` — §3 says P19 should fire here; doesn't |
| 52 | Refused | 1 | null (DEAD) | `DEAD_STATUS_SET` |
| 53 | Follow-up Required | 1 | null (DEAD) | `DEAD_STATUS_SET` |

Defined in code but absent from live data: `Tenant Notice Period` (DEAD), `Extension in Progress` (P7d).

---

### §2.5.b `coa_applications.decision` — 54 distinct values

Source field: `coa_applications.decision` (CoA portal feed). Read by `classifyCoaPhase()` in `scripts/lib/lifecycle-phase.js`. Normalized via `normalizeCoaDecision()`: lowercase + TRIM + collapse internal whitespace → matched against frozen `NORMALIZED_APPROVED_DECISIONS` and `NORMALIZED_DEAD_DECISIONS` sets.

**Caveat:** every value below is overridden to `null` if the row has `linked_permit_num IS NOT NULL` (99.4% of CoAs are linked — this is the dominant cause of NULL `lifecycle_phase` per bug 84-W12).

| # | Decision | Rows | Current code maps to | Notes |
|---|---|---|---|---|
| **Block 1 — In-Flight (no decision yet)** ||||
| 1 | (NULL) | 1,690 | P1 | Default fallback in `classifyCoaPhase()` when normalized decision is null and not in dead set |
| **Block 2 — Approved family (16 normalized variants — all map to same phase)** ||||
| 2 | Approved | 27,042 | P2 | **BUG — §3.1 says P3 "CoA Approved"; code emits P2 "CoA Review"** |
| 3 | approved | 42 | P2 | Same — case-variant, normalized |
| 4 | APPROVED | 1 | P2 | Same |
| 5 | Approved on Condition | 44 | P2 | Same — "approved on condition" in normalized set |
| 6 | Approved on condition | 30 | P2 | Same |
| 7 | approved on condition | 5 | P2 | Same |
| 8 | APPROVED ON CONDITION | 1 | P2 | Same |
| 9 | Approved on conditional | 2 | P2 | Same — listed in normalized set |
| 10 | Approved on condation | 1 | P2 | Same — typo, listed in normalized set verbatim |
| 11 | approved on condtion | 1 | P2 | Same — typo, listed in normalized set verbatim |
| 12 | Approved with Conditions | 27 | P2 | Same |
| 13 | Approved with Condition | 4 | P2 | Same — listed in normalized set verbatim ("approved with condition") |
| 14 | Approved with conditions | 8 | P2 | Same |
| 15 | Approved with condition | 4 | P2 | Same |
| 16 | Approved wih Conditions | 6 | P2 | Same — typo, listed in normalized set verbatim |
| 17 | approved with condition | 1 | P2 | Same |
| 18 | Conditionally Approved | 1 | P2 | `'conditionally approved'` in normalized set (line 114) |
| 19 | conditionally Approved | 1 | P2 | Same |
| 20 | Approved Conditionally | 1 | P2 | `'approved conditionally'` in normalized set (line 115) |
| 21 | Conditional Approved | 2 | P2 | "conditional approved" in normalized set |
| 22 | conditional Approved | 1 | P2 | Same |
| 23 | conditional approved | 1 | P2 | Same |
| 24 | conditional approval | 98 | P2 | "conditional approval" in normalized set |
| 25 | CONDITIONAL APPROVAL | 3 | P2 | Same |
| 26 | conitional approval | 1 | P2 | Typo, listed verbatim in normalized set |
| 27 | modified approval | 2 | P2 | Listed in normalized set |
| 28 | Partially Approved | 1 | P2 | "partially approved" in normalized set |
| 29 | Approved, as amended, on Condition | 1 | P2 | Listed verbatim in normalized set |
| **Block 3 — Refused family (4 variants)** ||||
| 30 | Refused | 2,783 | null (DEAD) | `NORMALIZED_DEAD_DECISIONS` — §3.6 says P19 should fire; doesn't |
| 31 | refused | 18 | null (DEAD) | Same |
| 32 | REFUSED | 1 | null (DEAD) | Same |
| 33 | DELEGATED CONSENT REFUSED | 1 | null (DEAD) | "delegated consent refused" in normalized dead set |
| **Block 4 — Withdrawn family (4 variants)** ||||
| 34 | Withdrawn | 711 | null (DEAD) | "withdrawn" in normalized dead set |
| 35 | withdrawn | 1 | null (DEAD) | Same |
| 36 | application withdrawn | 4 | null (DEAD) | "application withdrawn" in normalized dead set |
| 37 | Application Withdrawn | 1 | null (DEAD) | Same |
| **Block 5 — Closed family (2 variants — terminal via `decision`)** ||||
| 38 | closed | 1 | null (DEAD) | "closed" in normalized dead set |
| 39 | application closed | 1 | null (DEAD) | "application closed" in normalized dead set |
| **Block 6 — Deferred family (12 variants — UNMAPPED, fall through to P1)** ||||
| 40 | Deferred | 492 | **UNMAPPED** → P1 | Not in approved or dead set; treated as in-flight intake |
| 41 | deferred | 5 | **UNMAPPED** → P1 | Same |
| 42 | DEFERRED | 1 | **UNMAPPED** → P1 | Same |
| 43 | DEFFERED | 1 | **UNMAPPED** → P1 | Typo |
| 44 | Deferred Aug 18, 2016 (Orig Mark Kehler) | 1 | **UNMAPPED** → P1 | Data-quality: free-text date stuffed into decision column |
| 45 | Deferred Nov 19, 2015 | 1 | **UNMAPPED** → P1 | Same |
| 46 | Deferred Jun 23, 2016 (Orig Mark Kehler) | 1 | **UNMAPPED** → P1 | Same |
| 47 | Deferred Jun 4, 2015 | 1 | **UNMAPPED** → P1 | Same |
| 48 | Deferred Apr 20, 2017 | 1 | **UNMAPPED** → P1 | Same |
| 49 | Deferred Aug 4, 2016 (Orig Mark Kehler) | 1 | **UNMAPPED** → P1 | Same |
| 50 | deferred feb 2 | 1 | **UNMAPPED** → P1 | Data-quality |
| 51 | deferred on april 14 | 1 | **UNMAPPED** → P1 | Data-quality |
| **Block 7 — Postponed** ||||
| 52 | Postponed | 1 | **UNMAPPED** → P1 | Not in any set; falls through to default |
| **Block 8 — Data-quality outliers (unmappable strings)** ||||
| 53 | Oct 29, 2019 | 1 | **UNMAPPED** → P1 | Date stuffed into decision column |
| 54 | decision not made - appeal was made due to that | 1 | **UNMAPPED** → P1 | Free-text note |

---

### §2.5.c `coa_applications.status` — 22 distinct values

Source field: `coa_applications.status` (CoA portal feed).

> **CRITICAL FLAG:** This column is **passed into `classifyCoaPhase()` but never read** — `input.status` is unreferenced in the function body (`scripts/lib/lifecycle-phase.js:371-401`). Every value below has the same "Current code maps to" because the column is structurally ignored. The spec §3.1 text mentioning "Internal Review" and "Public Hearing Scheduled" was written against this column's values but never wired up. Resolved in queued WF3 #coa-classifier-coverage Fix A.

| # | Status | Rows | Current code maps to | Spec-intended (per §3, post-Fix-A) |
|---|---|---|---|---|
| **Block 1 — Intake** ||||
| 1 | Application Received | 10 | NOT READ | P1 (CoA Intake) |
| 2 | Accepted | 279 | NOT READ | P1 |
| **Block 2 — Notice Preparation** ||||
| 3 | Prepare Notice | 54 | NOT READ | P2 (CoA Review) |
| 4 | Notice Prepared | 74 | NOT READ | P2 |
| **Block 3 — Scheduling / Hearing** ||||
| 5 | Tentatively Scheduled | 118 | NOT READ | P2 |
| 6 | Hearing Scheduled | 317 | NOT READ | P2 (this is the spec's "Public Hearing Scheduled") |
| 7 | Hearing Rescheduled | 1 | NOT READ | P2 |
| **Block 4 — Paused Review** ||||
| 8 | Postponed | 292 | NOT READ | P2 (paused, still in-review) |
| 9 | Deferred | 270 | NOT READ | P2 |
| **Block 5 — Decision Recorded** ||||
| 10 | Conditional Consent | 326 | NOT READ | P3 (approval signaled via status, no decision text) |
| 11 | Approved | 246 | NOT READ | P3 |
| 12 | Approved with Conditions | 554 | NOT READ | P3 |
| 13 | Refused | 59 | NOT READ | P19 |
| 14 | Final and Binding | 1 | NOT READ | P4 (the spec's literal "Final and Binding" trigger — exists in `status`, not `decision`) |
| **Block 6 — Post-Decision / Appeal** ||||
| 15 | Await Expiry Date | 24 | NOT READ | P3 (waiting on Toronto 20-day appeal window) |
| 16 | Appealed | 1 | NOT READ | P3 (underlying decision stands until appeal succeeds) |
| 17 | TLAB Appeal | 347 | NOT READ | P3 (Toronto Local Appeal Body — post-decision appeal) |
| 18 | OMB Appeal | 218 | NOT READ | P3 (Ontario Municipal Board — legacy appeal channel) |
| **Block 7 — Terminal** ||||
| 19 | Application Withdrawn | 904 | NOT READ | P19 |
| 20 | Cancelled | 1 | NOT READ | P19 |
| 21 | Complete | 8 | NOT READ | P20 |
| 22 | Closed | 28,948 | NOT READ | P20 |

---

### §2.5.d `permit_inspections.stage_name` — 35 distinct values

Source field: `permit_inspections.stage_name` (raw CCO inspection feed). Read by `mapInspectionStageToPhase()` in `scripts/lib/lifecycle-phase.js:160-213`. Matched via lowercase substring `.includes()` against ordered patterns — first match wins. Only consumed when `permit_inspections.status = 'Passed'`.

| # | Stage Name | Rows | Current code maps to | Notes |
|---|---|---|---|---|
| **Block 1 — Site Prep** ||||
| 1 | Site Grading Inspection | 4,921 | P9 | matches `site grading` |
| 2 | Excavation/Shoring | 6,735 | P9 | matches `excavation` |
| 3 | Demolition | 1,012 | P9 | matches `demolition` |
| **Block 2 — Foundations** ||||
| 4 | Footings/Foundations | 7,600 | P10 | matches `footings` |
| 5 | Foundation | 2 | P10 | matches `=== 'foundation'` (exact lowercase equality) |
| **Block 3 — Structural Framing** ||||
| 6 | Structural Framing | 9,592 | P11 | matches `structural framing` |
| **Block 4 — MEP Rough-in (Mechanical / Electrical / Plumbing)** ||||
| 7 | HVAC/Extraction Rough-in | 883 | P12 | matches `hvac` |
| 8 | Water Service | 888 | P12 | matches `water service` |
| 9 | Water Distribution | 911 | P12 | matches `water distribution` |
| 10 | Drain/Waste/Vents | 910 | P12 | matches `drain` |
| 11 | Sewers/Drains/Sewage System | 890 | P12 | matches `drain` (first hit in P12 substring chain — same output as `sewers`) |
| 12 | Fire Service | 889 | P12 | matches `fire service` |
| 13 | Fire Access Routes | 2,277 | P12 | matches `fire access` |
| 14 | Fire Protection Systems | 5,969 | P12 | matches `fire protection` |
| **Block 5 — Enclosure / Sealed** ||||
| 15 | Insulation/Vapour Barrier | 8,775 | P13 | matches `insulation` |
| 16 | Insulation | 1 | P13 | matches `insulation` |
| 17 | Insulation & Vapour/AirBarrier Passed on | 1 | P13 | matches `insulation` |
| **Block 6 — Fire Sep / Board (Drywall Anchor)** ||||
| 18 | Fire Separations | 7,035 | P14 | matches `fire separations` |
| **Block 7 — Interior Finishes** ||||
| 19 | Interior Final Inspection | 6,462 | P15 | matches `interior final` |
| 20 | Plumbing Final | 914 | P15 | matches `plumbing final` |
| 21 | HVAC Final | 883 | P15 | matches `hvac final` |
| **Block 8 — Exterior Finishes** ||||
| 22 | Exterior Final Inspection | 7,432 | P16 | matches `exterior final` |
| **Block 9 — Occupancy / Project Final** ||||
| 23 | Occupancy | 8,965 | P17 | matches `occupancy` |
| 24 | Final Inspection | 1,060 | P17 | matches `final inspection` |
| **Block 10 — Specialty (no §3 phase target — fall through to P17 when "Permit Issued" + Passed)** ||||
| 25 | Pool Suction/Gravity Outlets | 2,232 | **UNMAPPED** → P17 fallback | No P9-P17 substring match |
| 26 | Pool Circulation System | 2,232 | **UNMAPPED** → P17 fallback | Same |
| 27 | Repair/Retrofit | 1,132 | **UNMAPPED** → P17 fallback | Same |
| 28 | Change of Use | 1,017 | **UNMAPPED** → P17 fallback | Same |
| 29 | System | 1,010 | **UNMAPPED** → P17 fallback | Same |
| 30 | Security Device | 1,006 | **UNMAPPED** → P17 fallback | Same |
| 31 | Tent/Portable Classroom | 1,005 | **UNMAPPED** → P17 fallback | Same |
| **Block 11 — Data-Quality Outliers** ||||
| 32 | Final Interior | 1 | **UNMAPPED** → P17 fallback | Does NOT match `interior final` (word order matters) — likely meant to map to P15 |
| 33 | HVAC Permit? | 1 | P12 | Matches `hvac` — but the `?` indicates data-quality issue at source |
| 34 | Survey | 1 | **UNMAPPED** → P17 fallback | Likely municipal survey, not a construction phase |
| 35 | Survey Submitted? | 1 | **UNMAPPED** → P17 fallback | Same |

**Fallback note:** when a permit has `status = 'Permit Issued'` AND `has_passed_inspection = true` but `latest_passed_stage` doesn't match any pattern, `classifyBldLed()` returns P17 (Interior Finals/Occupancy) rather than dropping back to a pre-inspection phase. This means the ~10,500 rows of unmapped specialty inspections (Pool, Repair, Change of Use, etc.) all land in P17 — likely overstating the "Occupancy" phase count.

---

### §2.5.e `permit_inspections.status` — 3 distinct values

Source field: `permit_inspections.status`. Filters which inspection rows feed the stage-mapping logic.

| # | Status | Rows | Effect on lifecycle phase |
|---|---|---|---|
| 1 | Outstanding | 71,658 | Ignored — does not advance phase |
| 2 | Passed | 17,298 | Used as the filter for `latest_passed_stage` rollup — only Passed rows trigger §2.5.d phase mapping |
| 3 | Not Passed | 5,689 | Ignored for phase mapping; counted by `permits.enriched_status = 'Not Passed'` derivation |

---

### §2.5.f Non-Status Inputs that also drive lifecycle phase

These six columns shape the output of `classifyLifecyclePhase()` / `classifyCoaPhase()` beyond the status/decision/stage triplet above. Reference for the future contract-matching exercise.

| # | Column | Consumer | Effect on phase |
|---|---|---|---|
| 1 | `permits.issued_date` | `classifyBldLed()` | Drives time-bucketing of `Permit Issued` into P7a (≤30d), P7b (31-90d), P7c (>90d). Threshold values from `logic_variables.lifecycle_p7a_max_days` / `_p7b_max_days`. |
| 2 | `permit_inspections.inspection_date` | `computeStalled()` | When permit `status = 'Inspection'` and most-recent inspection_date is older than `logic_variables.lifecycle_inspection_stall_days` (default 180), the row's `lifecycle_stalled` flips to `true`. Does not change phase; sets the stall flag. |
| 3 | `coa_applications.last_seen_at` | `classifyCoaPhase()` | Stall detection for in-flight CoAs (P1/P2 only): `daysSinceActivity > logic_variables.coa_stall_threshold` (default 30) → `lifecycle_stalled = true`. |
| 4 | `coa_applications.linked_permit_num` | `classifyCoaPhase()` | **The 84-W12 root cause.** When non-null, the function short-circuits and returns `phase = null` regardless of decision. 99.4% of CoAs have this set, so 32,865 of 33,052 CoAs have NULL `lifecycle_phase`. Slated for removal in queued Fix A. |
| 5 | `permits.permit_num` suffix + prefix structure | `computeIsOrphan()` | Two-stage check: (1) if the permit_num `endsWith(' BLD')` or `endsWith(' CMB')`, it is a parent permit and never an orphan; (2) otherwise (HVA, PLB, MS, DSS, etc.), the first two space-delimited tokens form a `YY NNNNNN` prefix that is looked up against the BLD/CMB sibling map — if no sibling parent exists at that prefix, the row is an orphan (O1/O2/O3) and follows a different progression track entirely. |
| 6 | `permits.enriched_status = 'Stalled'` | `computeStalled()` | Single sentinel value (1,532 of 247,030 rows). Overrides the date-based stall computation: when present, sets `lifecycle_stalled = true` regardless of `issued_date` or `inspection_date`. |

---

### §2.5.g Coverage Footnote

Unmapped values that the classifier currently produces no phase for (these are the candidates for the future contract-matching exercise):

- **`permits.status`** — 1 value (`Notice Sent`, 1 row) falls through to `phase = null`. Counted by the `unclassified_count` CQA gate (threshold 100); will not trigger an alert at current volume.
- **`coa_applications.decision`** — all 12 "Deferred*" variants (505 rows total, including 8 date-prefixed data-quality strings) fall through to P1 instead of an intended "paused/deferred review" phase. Plus 1 `Postponed` row and 2 data-quality strings (`Oct 29, 2019`, `decision not made - appeal was made due to that`) fall through to P1.
- **`coa_applications.status`** — all 22 values currently unread; 31,955 of 33,052 rows would receive a non-null phase under §3-intended behavior.
- **`permit_inspections.stage_name`** — 9 distinct specialty stages (~10,500 rows) and 3 data-quality outliers fall through to a P17 fallback, structurally overstating the Occupancy count.

This list is the input set for any subsequent contract-amendment exercise that aims to reconcile §3 against §2.5.

---

## 3. Behavioral Contract: Full Phase Detail

### 1. The Planning & Variance Block (Pre-Permit)
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
| P1 | CoA Intake | CoA application created in the system. |
| P2 | CoA Review | Status: "Internal Review" or "Public Hearing Scheduled." |
| P3 | CoA Approved | Decision: "Approved" or "Approved with Conditions." |
| P4 | CoA Final | Decision: "Final and Binding" (Appeal period cleared). |
| P5 | Zoning Review | Transition phase where CoA links to a Building Permit application. |

### 2. The Permit Intake Block (Unified ID Space)
*Note: To resolve legacy ID collisions where P3-P5 meant different things in CoA vs. Permits, Permit Intake phases are explicitly prefixed (e.g., `INTAKE_P3`).*
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
| INTAKE_P3 | Permit Review | Legacy Permit Review phase. |
| INTAKE_P4 | Permit Approved | Legacy Permit Approved phase. |
| INTAKE_P5 | Permit Ready | Legacy Permit Ready phase. |
| P6 | Permit Applied | Status: "Application Received" or "Under Review." |
| P7a | Issued (Early) | `issued_date` <= 30 days ago. (Peak relationship window). |
| P7b | Issued (Mid) | `issued_date` 31–90 days ago. |
| P7c | Issued (Late) | `issued_date` > 90 days ago + no inspections. |
| P7d | Work Not Started | Status: "Permit Issued - Work Not Started" (User/Inspector reported). |
| P8 | Mobilization | Site fence permit issued OR first non-structural inspection (e.g., Tree Prot). |

### 3. The Structural Block (The "Heavy" Trades)
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
| P9 | Excavation | Inspection: "Excavation" or "Shoring" passed. (Plumbing Groundworks Anchor). |
| P10 | Foundations | Inspection: "Footings", "Foundation", or "Backfill" passed. |
| P11 | Structural Framing | Inspection: "Structural Framing" passed. (House is now a "Box"). |

### 4. The Enclosure & Systems Block (The "Guts")
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
| P12 | Rough-ins | Inspection: "Plumbing Rough-in", "HVAC Rough-in", or "Electrical Rough-in" passed. |
| P13 | Insulation | Inspection: "Insulation/Vapour Barrier" passed. (House is now sealed). |
| P14 | Fire Sep / Board | Inspection: "Fire Separation" or "Lathing" passed. (Drywall Anchor). |

### 5. The Finishes & Closing Block
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
| P15 | Interior Finals | Inspection: "Plumbing Final", "HVAC Final", or "Electrical Final" passed. |
| P16 | Exterior Finals | Inspection: "Site Grading" or "Exterior Cladding" passed. |
| P17 | Occupancy | Inspection: "Occupancy" passed OR status "Occupancy Granted." |
| P18 | Project Closed | Status: "Finalized", "Completed", or "Closed." |

### 6. Terminal Phases
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
| P19 | Cancelled | Status: "Cancelled", "Withdrawn", or "Refused." |
| P20 | Revoked | Status: "Revoked" (City-initiated termination). |

### 7. Orphan Logic (Negative Ordinal System)
Orphans (O1-O3) have no logical rank in the standard P1-P20 progression, preventing natural auto-archiving. We use a negative ordinal system for Orphans:
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
| O1 | Orphan Active | Standalone trade permit (e.g., a furnace swap) with active inspections. |
| O2 | Orphan Done | Standalone trade permit finalized. |
| O3 | Orphan Stalled | Standalone trade permit > stall threshold with no activity. |

---

### 8. Distribution Health Bands (CQA Tier 3)

`scripts/quality/assert-lifecycle-phase-distribution.js` is the canonical post-classifier health check. It compares the live row counts of every phase (`P3-P20`, `O1-O3`, CoA `P1-P2`, plus the synthetic `P9-P17` aggregate) against per-phase `[min, max]` bands and flags `FAIL`/`WARN` if any actual count drifts outside its band.

**Externalization (WF2 2026-05-07, migration 119)** — every band bound and every cross-status drift threshold lives in `logic_variables`, not in code. Operators tune via the admin Control Panel ("Lifecycle Phase Distribution Bands" group, Spec 86 §1) without a redeploy.

Key namespace:
- `lifecycle_band_<phase>_min`, `lifecycle_band_<phase>_max` — 18 phases × 2 keys (36 entries). Phase suffixes: `p3`, `p4`, `p5`, `p6`, `p7a`, `p7b`, `p7c`, `p7d`, `p8`, `p18`, `p19`, `p20`, `p9_p17_agg`, `o1`, `o2`, `o3`, `coa_p1`, `coa_p2`.
- `lifecycle_cross_stalled_threshold` — FAIL when N permits have `enriched_status='Stalled'` but `lifecycle_stalled=false`.
- `lifecycle_cross_active_inspection_threshold` — FAIL when N permits with `enriched_status='Active Inspection'` are not in `P9-P18`/`O1-O3`.
- `lifecycle_cross_issued_threshold` — FAIL when N permits with `enriched_status='Permit Issued'` are not in `P7a/b/c/d`/`P8`/`P18`/`O1-O3`.

Defaults are calibrated against the 2026-05-07 live-DB snapshot with ±15% tolerance and seeded by both `migrations/119_lifecycle_phase_bands_logic_variables.sql` and `scripts/seeds/logic_variables.json` (single source of truth — the parity test `src/tests/control-panel.logic.test.ts` enforces both surfaces match).

A startup-time Zod `superRefine` rejects any `min > max` pair (operator-hotfix guard) — a bad pair would silently make a band un-matchable and the assertion would pass on a dead phase.

---

## 4. System Logic & Edge Cases

### Logic Notes for the Contract
- **The "Watermark" Logic:** The engine always moves forward. If a project passes P11 (Framing), it cannot go back to P9 (Excavation) unless a new revision is filed.
- **Sub-Phase Promotion:** P7a/b/c are handled automatically based on `NOW() - issued_date`.
- **Configurable Stall Detection:** The system replaces hardcoded 180-day limits. Stall thresholds are sourced dynamically from the `logic_variables` table for both CoA and active permits.

### Edge Cases
- **Stalled Sites:** If a project has no activity beyond its `logic_variables` threshold, `lifecycle_stalled` is set to `TRUE`.
- **O2/O3 Suppression:** Stall events for standalone trades must not be ignored in the transition ledger.

---

## 5. Front-end Preparation (Detailed View)

### Admin Dashboard (Operations & Health)
- **Phase Distribution Heatmap:** A visual breakdown of how many projects are in each of the 23 stages.
- **Stall Alert Tile:** Highlights projects that just flipped `lifecycle_stalled = TRUE`, grouped by neighborhood.
- **Transition Velocity Chart:** Displays the average days spent in each phase (powered by the ledger), allowing admins to spot municipal bottlenecks.

### Inspector Lifecycle Timeline (Spec 76 §3.5)
The admin Lead Detail Inspector consumes the `lifecycle.timeline[]` array assembled by `src/lib/leads/build-lifecycle-timeline.ts`. Each entry has:
- `phase` (P1–P20, INTAKE_P3-P5, O1-O3) and `phase_name` (friendly name from §3 above)
- `status`: `'completed' | 'current' | 'upcoming'` — discriminates past actuals from in-progress and forecast entries
- `entered_at` / `exited_at` — actual ledger timestamps for completed; entered_at only for current; both null for upcoming
- `days_in_phase` — actual delta for completed; `NOW() - phase_started_at` for current (clamped ≥0); `cohort_median_days` for upcoming
- `cohort_{median,p25,p75}_days` + `cohort_sample_size` — populated from `phase_stay_calibration` (§7) for stall detection ("this permit's 87 days in P10 vs cohort p75 of 45 = stalled")

Order: completed (chronological) → current → upcoming (canonical Spec 84 §3 order via `STANDARD_PHASE_PATH_BY_PERMIT_TYPE`). Terminal phases (P18/P19/P20/O3) produce no upcoming entries.

### CoA ↔ Permit Cross-Stream Patterns (snapshot 2026-05-11)

The two data streams (`coa_applications` and `permits`) are reconciled post-hoc by `link-coa.js` (Spec 60). For the 6.6% of permits with a CoA antecedent (16,285 of 247K) the timeline has cross-stream history that the current panel does not yet surface. Temporal analysis of 41,424 linked pairs:

| Pattern | Count | % | Description |
|---|---|---|---|
| **Pattern 1 (sequential)** | 32,207 | 77.8% | Homeowner files CoA → variance decision (median 23-day hearing→decision) → waits (median 1,078 days, p25 291, p75 2,140) → files permit. The CoA history is a true sequential precursor; UI should prepend P1→P2→P3→P4 as completed entries to the permit's timeline. |
| **Pattern 2 (concurrent)** | 9,180 | 22.2% | Permit application filed BEFORE CoA decision. Typically: examiner discovers variance need during examination, homeowner files CoA in parallel. Permit sits in pre-issuance status ("Under Review" / "Application On Hold") while CoA's P1/P2 runs. UI should render the CoA as a concurrent in-progress entry, not a prepended completed entry. |
| **Pattern 0 (same-day)** | 37 | <0.1% | Permit and CoA decision share a day. Edge case for Fix B design. |

**Operationally significant — 171 permits currently blocked on a CoA decision** (`SELECT COUNT(*) FROM permits p JOIN coa_applications ca ON ca.linked_permit_num = p.permit_num WHERE p.issued_date IS NULL AND ca.decision IS NULL`). These permits sit at P6 "Permit Applied" — the inspector today gives no signal that issuance is externally blocked on an in-flight variance. Surfacing this is part of Fix B WF1 (queued).

**The 1,078-day median post-approval wait is homeowner-side delay** (financing, contractor selection, plan finalization), not municipal process time. The actual variance decision (hearing → decision) median is only 23 days per Spec 51.

### App View (User Value & Leads)
- **Verified Lifecycle Tracker:** A "UPS-style" progress bar for every lead, showing exactly which inspections have passed.
- **"Next Trade" Prediction:** A "Coming Soon" badge for trades (e.g., "Insulation needed in ~14 days") based on calibration math.
- **Project History Timeline:** A vertical timeline showing when the project moved from Planning (CoA) to Excavation to Framing.

### App Summary

#### 1. How it Tracks the Stage (The Chronological Map)
The engine uses a Linear Progression Model. Because construction follows a logical order, the script uses "Watermark Logic." Once verified at P11 (Structural Framing) via a city inspection, the engine "locks" that progress.
- **The Transition Ledger:** Writes a row to `permit_phase_transitions` every time a project moves to track velocity.
- **Physical Verification:** Prioritizes Inspections over Statuses.
- **Time-Bucketing:** Uses P7a/b/c to determine exact freshness during the "Black Box" period after a permit is issued.

#### 2. How Other Scripts Use This Data
- **Data Provider:** Downstream consumers rely on this state logic.
- **Trade Forecasts:** Looks at the phase and `phase_started_at` timestamp to predict when the next trade is needed.
- **Opportunity Scores:** Uses the phase to determine the "Temperature" of a lead.
- **Tracked Projects:** Monitoring scripts use `lifecycle_stalled` to alert users of stuck opportunities.

#### 3. The Verification Layer (CQA)
The `assert-lifecycle-phase-distribution.js` script acts as the "Internal Auditor." It prevents "Bad Logic" from reaching users by failing the pipeline if statistical health checks fail (e.g., 0 permits in P11).

---

## 6. Temporary: Bug Fixes & Spec 47 Alignment

| Bug ID | Issue & Fix Action | Status |
|---|---|---|
| 84-W1 | **Orphan Ordinal Gap:** Orphans (O1-O3) have no rank, so they never archive. Fix: Assign negative ordinals. | Pending Refactor |
| 84-W4 | **Dead Transition Write:** Ledger is written but not used. Fix: Wire Spec 86 Calibration to read this ledger. | **Resolved (WF1 #B 2026-05-09)** — `scripts/compute-phase-calibration.js` now reads the ledger via `LAG()` window + `PERCENTILE_CONT` per `(permit_type, from_phase)` and writes `phase_stay_calibration`; the inspector's `lifecycle.timeline[]` reads that table for cohort comparison. See §7 below. |
| 84-W11 | **ID Collision:** P3/P4/P5 mean different things in CoA vs Permits. Fix: Prefix Permit-Intake phases (e.g., `INTAKE_P3`). | Pending Refactor |
| 84-W5 | **Magic Stall Numbers:** Thresholds (180/730 days) are hardcoded. Fix: Move to `Zod` validated `logic_variables`. | Pending Refactor |
| 84-W3 | **Mega-Insert Risk (Spec 47 §6.1):** 237k-row backfill crashes DB on `.query()`. Fix: Wire `pipeline.streamQuery` and standard chunking with loop arrays. | Pending Refactor |
| 84-W9 | **SQL/JS Drift:** CoA normalization is duplicated in two places. Fix: Consolidate into a single SQL helper function. | Pending Refactor |
| 84-S47 | **SIGTERM Release (Spec 47 §5.5):** No lock release on container preemption. Fix: Add process `SIGTERM` trap. | Pending Refactor |
| 84-S47 | **Midnight Drift (Spec 47 §8):** Multiple `NOW()` executions inside loops. Fix: Extract `RUN_TIMESTAMP` from a single query before streaming begins. | Pending Refactor |
| 84-W12 | **CoA Classifier Silent No-Op:** 99.4% of `coa_applications` rows have `lifecycle_phase = NULL` despite the classifier code path existing in `classify-lifecycle-phase.js` (Spec 84 §3.1 P1/P2 triggers). Only 187 of 33,052 CoAs carry a phase tag (40 P1 + 147 P2) — and of the 1,690 in-flight CoAs (no decision, last 12mo) only 11% are classified. The classifier silently leaves 89% of in-flight CoAs uncovered, breaking the §3.8 distribution bands `lifecycle_band_coa_p1_min/max` + `lifecycle_band_coa_p2_min/max` (bands tuned around the broken baseline, so `assert-lifecycle-phase-distribution.js` PASSes only because the gate is set ridiculously low). Discovered 2026-05-11 via WF1 #C CoA investigation. Fix: Phase 2 of `.cursor/queued_task_coa_lifecycle_fixes.md` (Fix A WF3) — investigate the `coa_applications` UPDATE branch in `classify-lifecycle-phase.js` (likely cause: incremental watermark stuck OR filter predicate too narrow OR `classifyLifecyclePhase()` returning null for CoA inputs). After fix, re-band the `lifecycle_band_coa_p1/p2_min/max` `logic_variables` thresholds against the post-fix reality. | Pending Refactor (Fix A WF3 queued) |

---

## 7. Calibration Source

The `permit_phase_transitions` ledger is the canonical source for phase-stay velocity math. `scripts/compute-phase-calibration.js` (Permits chain step 23, advisory lock 93) consumes the ledger and writes the `phase_stay_calibration` table.

### Schema — `phase_stay_calibration`
| Column | Type | Description |
|---|---|---|
| `permit_type` | TEXT | The 18 permit_types observed in the ledger (residential structural, small res, plumbing, etc.) |
| `phase` | TEXT | The phase the permit was IN (the LAG window's `from_phase`) — P1–P20, INTAKE_P3-P5, O1-O3 |
| `median_days` | INTEGER | `ROUND(PERCENTILE_CONT(0.50))` over the cohort's days-in-phase — the "typical" stay |
| `p25_days` | INTEGER | `ROUND(PERCENTILE_CONT(0.25))` — fastest 25% |
| `p75_days` | INTEGER | `ROUND(PERCENTILE_CONT(0.75))` — slowest 25%; the stall-detection threshold |
| `sample_size` | INTEGER | Cohort size; `< 30` flags the bucket as `unreliable` in audit_table |
| `computed_at` | TIMESTAMPTZ | RUN_AT-parameterized (Spec 47 §R3.5) — every row in a single recompute shares the timestamp |

PK: `(permit_type, phase)`. CHECK: `p25_days <= p75_days`. Full DELETE+INSERT inside a single transaction per recompute — consumers never see a partial table.

### SQL pattern (LAG window + filtering POST-LAG)
```sql
WITH transitions_with_duration AS (
  SELECT permit_num, revision_num, permit_type, from_phase, transitioned_at,
    transitioned_at - LAG(transitioned_at) OVER (
      PARTITION BY permit_num, revision_num ORDER BY transitioned_at
    ) AS phase_duration
  FROM permit_phase_transitions
  -- NO filters here — the LAG window must see the unfiltered transition stream
)
SELECT permit_type, from_phase AS phase,
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (...))::INTEGER AS median_days,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (...))::INTEGER AS p25_days,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (...))::INTEGER AS p75_days,
  COUNT(*)::INTEGER AS sample_size
FROM transitions_with_duration
WHERE from_phase IS NOT NULL AND permit_type IS NOT NULL AND phase_duration IS NOT NULL
GROUP BY permit_type, from_phase
```

ROUND() before ::INTEGER cast is mandatory — Postgres casts truncate, which would systematically bias every cohort downward (e.g. true median 10.9d → 10d).

### Live behavior (2026-05-09 snapshot)
- 109,981 source transitions evaluated → 164 buckets across 18 permit_types × 23 phases
- 110 buckets have `sample_size < 30` (WARN — flagged as unreliable in `audit_table`)
- `compute-phase-calibration` runtime: ~0.9s end-to-end, ~120k rows/sec

---

## 8. Implementation Plan

### Stage 1: The "Clean Slate" (Back-end)
- **Migration 093:** Add `is_interior` (Spec 83) and create the `is_stalled` and `is_interior` column triggers.
- **Shared Logic:** Extract the stall and ordinal logic into the shared library.
- **The "Mega-Fix":** Run the batched backfill (W3) to clean up all 237k historical transitions.

### Stage 2: Calibration & Predictive Wiring
- **Wire Spec 86:** Refactor the Calibration Engine to read from the `permit_phase_transitions` table (Decision D4).
- **Notifications Trigger:** Set up the trigger to push "Phase Change" events into the notifications table (Decision D1).
- **Validation:** Run the `assert-lifecycle-phase-distribution.js` script to verify 100% accuracy.

### Stage 3: Front-end Rollout
- **API Hardening:** Update the GraphQL/REST endpoints to expose the new `lifecycle_phase` and velocity fields.
- **Component Build:** Deploy the "Verified Tracker" and "Velocity Chart" to the user-facing app.
- **Admin Tools:** Release the "Drift Detector" to monitor logic health.
