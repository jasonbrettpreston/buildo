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

**Ordering follows the City of Toronto's official permit-review workflow** (sources: [Plan Review Process](https://www.toronto.ca/services-payments/building-construction/building-permit/after-you-apply-for-a-building-permit/plan-review-process/), [Application Status definitions](https://www.toronto.ca/services-payments/building-construction/building-permit/after-you-apply-for-a-building-permit/search-the-status-of-a-building-permit-application/)). Each macro-block represents a city phase; each block is subdivided into **Stages** that describe what is operationally happening to the application at that point. **Definitions in quotes are verbatim from the city; `(inferred)` definitions are internal IBMS workflow states the city does not publicly document — meaning is reasoned from context, name, and empirical pre-/post-issuance split.**

**Pre-issuance distribution (snapshot 2026-05-12T13:28:40Z, `issued_date IS NULL`, 12,732 in-flight applications):** Block 1 Intake = 1,224 · Block 2 Plan Review = 3,301 · Block 3 Notice & Response Loop = **4,992 (largest bucket)** · Block 4 Pre-Issuance = 3,215. Empirical takeaway: most in-flight applications are stuck in the deficiency-response loop, not active technical review.

| # | Status | Rows | Current code maps to | City definition / Operational meaning |
|---|---|---|---|---|
| **▶ Block 1 — Application Intake (City Phase 1: administrative completeness check before review begins; 1,224 apps in-flight)** |||||
| *Stage 1.1 — Initial Submission (file enters IBMS; intake not yet processed)* |||||
| 1 | Request Received | 1 | P3 | (inferred) Sub-folder request opened against an existing permit — typically a revision or extension. · `INTAKE_P3_SET` |
| 2 | Application Received | 218 | P3 | "The Application has been received but intake has not been accepted or processed." · `INTAKE_P3_SET` — code emits literal `'P3'`, colliding with CoA P3 |
| *Stage 1.2 — Submission Accepted (filing requirements met; initial fee outstanding)* |||||
| 3 | Application Acceptable | 465 | P3 | "Application has met the submission requirement; however the intake has not been accepted yet because of the required initial permit fee." · `INTAKE_P3_SET` |
| *Stage 1.3 — File Active in System (intake fee paid; file open and tracked, awaiting reviewer assignment)* |||||
| 4 | Open | 519 | P3 | (inferred) Generic IBMS state — file is open in the system, not yet bound to a specific phase. · `INTAKE_P3_SET` |
| 5 | Active | 24 | P3 | (inferred) Generic IBMS state — file is being actively worked. · `INTAKE_P3_SET` |
| **▶ Block 2 — Plan Review (City Phase 2: technical examination across five parallel disciplines — Zoning, Building Code, Mechanical/HVAC/Plumbing, Fire Prevention, Applicable Law; 3,301 apps in-flight)** |||||
| *Stage 2.1 — Review Queued (application accepted; reviewer not yet started)* |||||
| 6 | Not Started | 1,063 | P7d | "Application has been accepted but the **review** has not started." · Empirical: 99.6% pre-issuance (1,059 / 1,063), confirming city's pre-review meaning. **CODE DRIFT:** `NOT_STARTED_P7D_SET` lumps this with post-issuance "no construction"; the two meanings are distinct (see row 26). |
| 7 | Not Started - Express | 92 | P7d | (inferred) Same as #6 but routed through the Express stream (fast-track for simple, low-risk permits). · **CODE DRIFT** as #6 |
| *Stage 2.2 — Review In Progress (one or more discipline reviewers actively examining the file)* |||||
| 8 | Under Review | 2,100 | P4 | "An Application has been accepted and the Review has started but is not completed." · `REVIEW_P4_SET` — note trailing space in source data; trimmed at runtime |
| 9 | Examination | 30 | P4 | (inferred) Internal IBMS synonym for Under Review during active examination. · `REVIEW_P4_SET` |
| *Stage 2.3 — Review Complete (technical review finished; file moving to Pre-Issuance)* |||||
| 10 | Plan Review Complete | 57 | P3 | (inferred) All five discipline reviews finished. · Empirical: 53% pre- / 47% post-issuance — post-issuance occurrences are revision reviews that recur after the initial permit issues. **CODE DRIFT:** `INTAKE_P3_SET` treats this as intake; city semantics put it at end of Phase 2. |
| 11 | Consultation Completed | 2 | P4 | (inferred) Pre-application consultation closed — likely a Tier 1c review-stream completion marker. · `REVIEW_P4_SET` |
| **▶ Block 3 — Notice & Response Loop (City Phase 3: deficiency iteration — examiner finds gaps → notice issued → applicant responds → review re-queues; loop may repeat. 4,992 apps in-flight — the largest pre-issuance bucket)** |||||
| *Stage 3.1 — Notice Issued (examiner identified deficiencies; notice dispatched to applicant)* |||||
| 12 | Examiner's Notice Sent | 2,757 | P4 | "The Application has been accepted, and the Review has resulted in a Notice that has been sent." · `REVIEW_P4_SET` |
| 13 | Notice Sent | 1 | **UNMAPPED** → null | "Review of the application has begun and the Examiner has identified deficiencies or outstanding items." (Operationally synonymous with #12 but not in any code set.) · Falls through entire decision tree; counted by `unclassified_count` CQA gate. |
| *Stage 3.2 — Deficiency Confirmed (formal deficiency notice — escalation of #12/#13)* |||||
| 14 | Deficiency Notice Issued | 117 | P5 | (inferred) Formal deficiency notice — escalation when initial Examiner's Notice isn't addressed. · `HOLD_P5_SET` |
| *Stage 3.3 — Application Paused (file on hold while applicant gathers / submits missing items)* |||||
| 15 | Application On Hold | 1,655 | P5 | "The Application has been received but it is on hold because of missing information." (City def implies intake-stage; operationally the status recurs whenever review pauses on applicant-side gaps.) · `HOLD_P5_SET` |
| 16 | Application on Hold | 4 | P5 | Case variant of #15. · `HOLD_P5_SET` (both spellings are members of the set) |
| *Stage 3.4 — Response Received (applicant submitted response to notice; file re-queues for review)* |||||
| 17 | Response Received | 436 | P5 | "A response to a Notice has been submitted to Toronto Building." · `HOLD_P5_SET` |
| *Stage 3.5 — Cross-Folder Block (sub-permit waiting on its parent BLD/CMB to advance)* |||||
| 18 | Pending Parent Folder Review | 33 | P5 | (inferred) Sub-permit (HVA/PLB/DRN/ELE/etc.) blocked because its parent BLD/CMB folder is itself still in review. · `HOLD_P5_SET` |
| **▶ Block 4 — Pre-Issuance (City Phase 4: all reviews approved; awaiting administrative finalization before permit physically issues; 3,215 apps in-flight)** |||||
| *Stage 4.1 — Permit Approved (technical review signed off internally)* |||||
| 19 | Approved | 23 | P6 | (inferred) Internal technical-approval marker — transitional state before Ready for Issuance. · `READY_P6_SET` — distinct from CoA `decision = Approved` |
| *Stage 4.2 — Ready for Issuance (admin paperwork complete; permit can issue immediately)* |||||
| 20 | Ready for Issuance | 233 | P6 | "A Review has been completed, and the Permit is ready for issuance at any time." · `READY_P6_SET` (87% pre-issuance; 13% post-issuance are re-issuances on revisions) |
| *Stage 4.3 — Approved but Outstanding Conditions (admin done; blocked on external conditions — fees, agreements, downstream sign-off)* |||||
| 21 | Forwarded for Issuance | 3 | P6 | (inferred) Queued to the issuance desk for fee collection and final paperwork. · `READY_P6_SET` |
| 22 | Issuance Pending | 2,974 | P6 | "Review has been completed, however other approvals and/or fees are outstanding." · `READY_P6_SET` — by volume the dominant pre-issuance state |
| 23 | Agreement in Progress | 10 | P6 | (inferred) Section 37 / Site Plan / Development Agreement being executed before permit can issue. Common on major builds. · `READY_P6_SET` |
| *Stage 4.4 — Cross-Domain Issuance (non-building-permit type sharing the IBMS feed)* |||||
| 24 | Licence Issued | 4 | P6 | (inferred) Sign / hoarding / portable-classroom license issued — not a building-permit phase. Cross-feed noise. · `READY_P6_SET` |
| **▶ Block 5 — Permit Issued / Pre-Inspection (Post-Phase-4: permit has issued; no inspections completed yet)** |||||
| *Stage 5.1 — Newly Issued (clock starts on the P7a / P7b / P7c time-buckets)* |||||
| 25 | Permit Issued | 52,403 | P7a / P7b / P7c / P9-P17 | "The Permit has been issued." · Time-bucketed by `NOW() - issued_date` (≤30d→P7a, 31-90d→P7b, >90d→P7c); promoted to P9-P17 if any inspection has passed. |
| *Stage 5.2 — Issued, No Construction Yet (status-flagged distinction from time-bucketed P7a/b/c)* |||||
| 26 | Work Not Started | 1,093 | P7d | "An Inspection was conducted and the construction has not taken place." · `NOT_STARTED_P7D_SET` — 100% post-issuance (validates city def). Semantically distinct from row 6 "Not Started" (pre-review). |
| 27 | Extension Granted | 3 | P7d | (inferred) Permit expiry extended; clock reset. · `NOT_STARTED_P7D_SET` — 100% post-issuance |
| **▶ Block 6 — Revision (Post-issuance Notice of Change processing — owner amends the issued permit)** |||||
| 28 | Revision Issued | 20,698 | P8 | "A Notice of Change has been submitted to the Chief Building Official and the revision has been accepted." · `REVISION_P8_SET` — §3 contract describes P8 as "Mobilization / site fence" (drift) |
| 29 | Revised | 27 | P8 | "A Notice of Change has been submitted to the Chief Building Official." · `REVISION_P8_SET` |
| 30 | Order Complied | 22 | P8 | (inferred) An issued compliance order has been satisfied. · `REVISION_P8_SET` |
| **▶ Block 7 — Active Inspection (Permit issued; physical inspections underway. Phase classifier maps to P9-P17 via stage-name; falls to P18 if no stage matches)** |||||
| 31 | Inspection | 138,546 | P9-P17 or P18 | "The permit has been issued and is under active inspection." · Mapped by `latest_passed_stage` via inspection-stage table (§2.5.d) |
| 32 | Forward to Inspector | 1 | P18 | (inferred) File handed off to inspector; awaiting visit. · `INSPECTION_PIPELINE_P18_SET` — §3 calls P18 "Project Closed" (drift) |
| 33 | Rescheduled | 1 | P18 | (inferred) Scheduled inspection rescheduled. · `INSPECTION_PIPELINE_P18_SET` |
| **▶ Block 8 — Wind-Down / Pre-Terminal (Closure/cancellation/revocation initiated but not yet final)** |||||
| *Stage 8.1 — Cancellation in Progress (administrative closure — dormant file or applicant-requested withdrawal)* |||||
| 34 | Pending Closed | 6,699 | P19 | (inferred) File flagged for closure; final paperwork pending. · `WINDDOWN_P19_SET` — §3 calls P19 "Cancelled" (drift) |
| 35 | Pending Cancellation | 488 | P19 | "The permit application is dormant for over five months and the owner/Applicant have been notified with a cancellation notice." (city label: "Cancellation Pending") · `WINDDOWN_P19_SET` |
| 38 | Inspection Request to Cancel | 1 | P19 | (inferred) Pending cancellation of a scheduled inspection request. · `WINDDOWN_P19_SET` |
| *Stage 8.2 — Revocation in Progress (city-initiated termination — compliance failure or contested file)* |||||
| 36 | Revocation Pending | 2,335 | P19 | (inferred) City has begun revocation proceedings. · `WINDDOWN_P19_SET` |
| 37 | Revocation Notice Sent | 1 | P19 | (inferred) Formal revocation notice issued to applicant. · `WINDDOWN_P19_SET` |
| **▶ Block 9 — Terminal (Closed) — File administratively closed (compliant or otherwise)** |||||
| 39 | Closed | 10,695 | P20 | (inferred) File administratively closed (default terminal state). · `TERMINAL_P20_SET` — §3 calls P20 "Revoked" (drift) |
| 40 | File Closed | 6 | P20 | (inferred) Variant of Closed. · `TERMINAL_P20_SET` |
| 41 | Permit Issued/Close File | 2 | P20 | (inferred) Issued and immediately closed — likely trivial jobs. · `TERMINAL_P20_SET` |
| **▶ Block 10 — Terminal (Dead — adverse terminal states; code returns `phase = null` and excludes from `unclassified_count` CQA gate)** |||||
| *Stage 10.1 — Refusal (city rejected the application after review)* |||||
| 42 | Refusal Notice | 958 | null (DEAD) | "Application has been Accepted, the review has resulted in a Refused Notice that was sent to applicant." · `DEAD_STATUS_SET` |
| 52 | Refused | 1 | null (DEAD) | Variant of #42. · `DEAD_STATUS_SET` |
| *Stage 10.2 — Withdrawal / Abandonment (applicant gave up or never followed through)* |||||
| 43 | Abandoned | 122 | null (DEAD) | (inferred) File abandoned by applicant. · `DEAD_STATUS_SET` |
| 44 | Application Withdrawn | 49 | null (DEAD) | (inferred) Applicant explicitly withdrew the application. · `DEAD_STATUS_SET` |
| 47 | Not Accepted | 9 | null (DEAD) | (inferred) Application not accepted at intake. · `DEAD_STATUS_SET` |
| *Stage 10.3 — Revocation (city-initiated termination of an issued permit)* |||||
| 49 | Permit Revoked | 2 | null (DEAD) | "The Permit has been revoked." · `DEAD_STATUS_SET` |
| 50 | Revoked | 2 | null (DEAD) | Variant of #49. · `DEAD_STATUS_SET` — §3 says P20 should fire here; doesn't |
| *Stage 10.4 — Compliance / Enforcement (active enforcement action against a live permit)* |||||
| 45 | Work Suspended | 18 | null (DEAD) | (inferred) Construction work suspended by city order. · `DEAD_STATUS_SET` |
| 46 | VIOLATION | 16 | null (DEAD) | "There is an Inspection Order against this Permit." · `DEAD_STATUS_SET` |
| 48 | Order Issued | 7 | null (DEAD) | (inferred) Compliance order issued against the permit. · `DEAD_STATUS_SET` |
| *Stage 10.5 — Other Terminal (residual states)* |||||
| 51 | Cancelled | 1 | null (DEAD) | (inferred) Application cancelled. · `DEAD_STATUS_SET` — §3 says P19 should fire here; doesn't |
| 53 | Follow-up Required | 1 | null (DEAD) | (inferred) Follow-up flag set on file. · `DEAD_STATUS_SET` |

Defined in code but absent from live data: `Tenant Notice Period` (DEAD), `Extension in Progress` (P7d).

**Code-drift summary surfaced by this ordering** — three statuses have spec/code semantic mismatches operators should fix:
- Row 6 "Not Started" and row 7 "Not Started - Express" → city def is pre-review (Phase 2); code maps to post-issuance P7d.
- Row 10 "Plan Review Complete" → city def is end of Phase 2; code maps to intake `INTAKE_P3_SET`.

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

Source field: `coa_applications.status` (CoA portal feed). The Committee of Adjustment is a quasi-judicial body that hears minor-variance and consent (lot-severance) applications. Workflow is parallel to permits but ends with a public-hearing decision instead of an issuance, and the post-decision appeal track has its own multi-month run-times.

> **CRITICAL FLAG:** This column is **passed into `classifyCoaPhase()` but never read** — `input.status` is unreferenced in the function body (`scripts/lib/lifecycle-phase.js:371-401`). Every value below has the same "Current code maps to" because the column is structurally ignored. The spec §3.1 text mentioning "Internal Review" and "Public Hearing Scheduled" was written against this column's values but never wired up. Resolved in queued WF3 #coa-classifier-coverage Fix A.

**Unified row numbering:** Rows are numbered **70–91** (22 statuses) to share a single namespace with §2.5.a (permits, rows 1–53). The gap 54–69 is reserved for permit-side expansion (e.g., the `INTAKE_P3/P4/P5` split when bug 84-W11 is resolved).

**Block structure is calibration-driven:** sub-blocks split apart statuses whose typical durations differ materially. The post-decision appeal track is split four ways (CoA-10/11/12/13) because TLAB appeals typically run 4–9 months while OMB legacy appeals historically ran 1–3 years; grouping them would make any average-time-in-phase metric meaningless.

| # | Status | Rows | Current code maps to | Definition / Spec-intended (per §3, post-Fix-A) |
|---|---|---|---|---|
| **▶ Block CoA-1 — Application Received (file just arrived; not yet processed)** |||||
| 70 | Application Received | 10 | NOT READ | Application file received by Committee of Adjustment intake desk; processing not yet begun. · spec: P1 (CoA Intake) |
| **▶ Block CoA-2 — Application Accepted (intake fee paid; file accepted into the CoA queue)** |||||
| 71 | Accepted | 279 | NOT READ | Intake fee paid; file accepted into the CoA queue and awaiting notice preparation. · spec: P1 (CoA Intake — accepted state) |
| **▶ Block CoA-3 — Notice Preparation (staff drafting the notice of hearing mailed to neighbors)** |||||
| 72 | Prepare Notice | 54 | NOT READ | CoA staff preparing the notice of hearing — mailed to neighbors within the 60-metre radius. · spec: P2 (CoA Review) |
| 73 | Notice Prepared | 74 | NOT READ | Notice of hearing drafted and ready to mail. · spec: P2 |
| **▶ Block CoA-4 — Hearing Scheduling (hearing date placed on the committee calendar)** |||||
| 74 | Tentatively Scheduled | 118 | NOT READ | Hearing tentatively placed on the committee calendar; date may still shift before formal notice. · spec: P2 |
| 75 | Hearing Scheduled | 317 | NOT READ | Confirmed hearing date; notice mailed to neighbors. (This is the spec §3.1 "Public Hearing Scheduled" trigger.) · spec: P2 |
| 76 | Hearing Rescheduled | 1 | NOT READ | Originally-scheduled hearing moved to a new date. · spec: P2 |
| **▶ Block CoA-5 — Hearing Postponed (procedural pause BEFORE the committee heard the case)** |||||
| 77 | Postponed | 292 | NOT READ | Hearing postponed before the committee heard the case — typically procedural (notice defect, applicant request, staff workload). Typical duration: weeks. · spec: P2 (paused review) |
| **▶ Block CoA-6 — Hearing Deferred (substantive pause AFTER the committee heard the case; calibration-distinct from Postponed)** |||||
| 78 | Deferred | 270 | NOT READ | Committee heard the case but deferred its decision to a later meeting — substantive (more information needed, neighbor concerns to address). Typical duration: 1–3 months. · spec: P2 (paused review) |
| **▶ Block CoA-7 — Conditional Consent (severance / consent application granted with conditions)** |||||
| 79 | Conditional Consent | 326 | NOT READ | Committee granted consent with conditions — used for severance / consent applications (lot splits) rather than minor variances. Approval signaled via `status`, with no entry in the `decision` column. · spec: P3 (CoA Approved) |
| **▶ Block CoA-8 — Approved (variance approved at hearing)** |||||
| 80 | Approved | 246 | NOT READ | Committee approved the variance application as-filed. · spec: P3 (CoA Approved) |
| 81 | Approved with Conditions | 554 | NOT READ | Committee approved the variance subject to specific conditions on the file. · spec: P3 |
| **▶ Block CoA-9 — Refused / Final and Binding (decision is terminal — either denied or appeal-cleared and binding)** |||||
| 82 | Refused | 59 | NOT READ | Committee denied the variance application. · spec: P19 (terminal — refused) |
| 83 | Final and Binding | 1 | NOT READ | Decision (approval or refusal) is past the 20-day appeal window and legally binding; cannot be appealed further. (This is the spec §3.1 literal "Final and Binding" trigger — exists in `status`, NOT `decision`.) · spec: P4 (CoA Final) |
| **▶ Block CoA-10 — Awaiting Appeal Window Expiry (20-day Toronto appeal clock running)** |||||
| 84 | Await Expiry Date | 24 | NOT READ | Decision rendered; file waiting for the 20-day Toronto appeal window to clear before becoming Final and Binding. Typical duration: capped at 20 days. · spec: P3 (provisional approval pending appeal window) |
| **▶ Block CoA-11 — Appeal Initiated (generic flag — channel unspecified or routing pending)** |||||
| 85 | Appealed | 1 | NOT READ | Generic appeal flag — file has been appealed; channel (TLAB vs OMB) unspecified or routing pending. Typical duration: transient, days. · spec: P3 (underlying decision stands until appeal succeeds) |
| **▶ Block CoA-12 — TLAB Appeal (Toronto Local Appeal Body — current tribunal)** |||||
| 86 | TLAB Appeal | 347 | NOT READ | Decision under appeal at the Toronto Local Appeal Body — the current Toronto-specific tribunal that hears CoA appeals. Typical duration: 4–9 months. · spec: P3 (post-decision active appeal) |
| **▶ Block CoA-13 — OMB Appeal (legacy provincial tribunal — historically longer runtimes)** |||||
| 87 | OMB Appeal | 218 | NOT READ | Decision under appeal at the Ontario Municipal Board — legacy province-wide tribunal (replaced by TLAB and OLT for new cases; legacy appeals remain). Historically longer runtimes than TLAB. Typical duration: 1–3 years (legacy). · spec: P3 |
| **▶ Block CoA-14 — Terminal (file closed — compliant or otherwise)** |||||
| 88 | Application Withdrawn | 904 | NOT READ | Applicant withdrew the application before decision. · spec: P19 |
| 89 | Cancelled | 1 | NOT READ | Application cancelled (applicant request or administrative). · spec: P19 |
| 90 | Complete | 8 | NOT READ | All required follow-up actions done; file complete. · spec: P20 |
| 91 | Closed | 28,948 | NOT READ | File administratively closed — default terminal state. **87.6% of all CoA rows land here**, making this the dominant CoA terminal status. · spec: P20 |

---

### §2.5.d `permit_inspections.stage_name` — 35 distinct values

Source field: `permit_inspections.stage_name` (raw CCO inspection feed). Read by `mapInspectionStageToPhase()` in `scripts/lib/lifecycle-phase.js:160-213`. Matched via lowercase substring `.includes()` against ordered patterns — first match wins. Only consumed when `permit_inspections.status = 'Passed'`.

**Unified row numbering:** Rows are numbered **100–134** (35 stages) within the shared §2.5 namespace. Row 135 is reserved as a forward-looking slot. Predecessor blocks: permits.status 1–53 (§2.5.a), gap 54–69, coa_applications.status 70–91 (§2.5.c), gap 92–99.

| # | Stage Name | Rows | Current code maps to | Notes |
|---|---|---|---|---|
| **Block 1 — Site Prep** ||||
| 100 | Site Grading Inspection | 4,921 | P9 | matches `site grading` |
| 101 | Excavation/Shoring | 6,735 | P9 | matches `excavation` |
| 102 | Demolition | 1,012 | P9 | matches `demolition` |
| **Block 2 — Foundations** ||||
| 103 | Footings/Foundations | 7,600 | P10 | matches `footings` |
| 104 | Foundation | 2 | P10 | matches `=== 'foundation'` (exact lowercase equality) |
| **Block 3 — Structural Framing** ||||
| 105 | Structural Framing | 9,592 | P11 | matches `structural framing` |
| **Block 4 — MEP Rough-in (Mechanical / Electrical / Plumbing)** ||||
| 106 | HVAC/Extraction Rough-in | 883 | P12 | matches `hvac` |
| 107 | Water Service | 888 | P12 | matches `water service` |
| 108 | Water Distribution | 911 | P12 | matches `water distribution` |
| 109 | Drain/Waste/Vents | 910 | P12 | matches `drain` |
| 110 | Sewers/Drains/Sewage System | 890 | P12 | matches `drain` (first hit in P12 substring chain — same output as `sewers`) |
| 111 | Fire Service | 889 | P12 | matches `fire service` |
| 112 | Fire Access Routes | 2,277 | P12 | matches `fire access` |
| 113 | Fire Protection Systems | 5,969 | P12 | matches `fire protection` |
| **Block 5 — Enclosure / Sealed** ||||
| 114 | Insulation/Vapour Barrier | 8,775 | P13 | matches `insulation` |
| 115 | Insulation | 1 | P13 | matches `insulation` |
| 116 | Insulation & Vapour/AirBarrier Passed on | 1 | P13 | matches `insulation` |
| **Block 6 — Fire Sep / Board (Drywall Anchor)** ||||
| 117 | Fire Separations | 7,035 | P14 | matches `fire separations` |
| **Block 7 — Interior Finishes** ||||
| 118 | Interior Final Inspection | 6,462 | P15 | matches `interior final` |
| 119 | Plumbing Final | 914 | P15 | matches `plumbing final` |
| 120 | HVAC Final | 883 | P15 | matches `hvac final` |
| **Block 8 — Exterior Finishes** ||||
| 121 | Exterior Final Inspection | 7,432 | P16 | matches `exterior final` |
| **Block 9 — Occupancy / Project Final** ||||
| 122 | Occupancy | 8,965 | P17 | matches `occupancy` |
| 123 | Final Inspection | 1,060 | P17 | matches `final inspection` |
| **Block 10 — Specialty (no §3 phase target — fall through to P17 when "Permit Issued" + Passed)** ||||
| 124 | Pool Suction/Gravity Outlets | 2,232 | **UNMAPPED** → P17 fallback | No P9-P17 substring match |
| 125 | Pool Circulation System | 2,232 | **UNMAPPED** → P17 fallback | Same |
| 126 | Repair/Retrofit | 1,132 | **UNMAPPED** → P17 fallback | Same |
| 127 | Change of Use | 1,017 | **UNMAPPED** → P17 fallback | Same |
| 128 | System | 1,010 | **UNMAPPED** → P17 fallback | Same |
| 129 | Security Device | 1,006 | **UNMAPPED** → P17 fallback | Same |
| 130 | Tent/Portable Classroom | 1,005 | **UNMAPPED** → P17 fallback | Same |
| **Block 11 — Data-Quality Outliers** ||||
| 131 | Final Interior | 1 | **UNMAPPED** → P17 fallback | Does NOT match `interior final` (word order matters) — likely meant to map to P15 |
| 132 | HVAC Permit? | 1 | P12 | Matches `hvac` — but the `?` indicates data-quality issue at source |
| 133 | Survey | 1 | **UNMAPPED** → P17 fallback | Likely municipal survey, not a construction phase |
| 134 | Survey Submitted? | 1 | **UNMAPPED** → P17 fallback | Same |

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

### §2.5.h Unified Process Map (Combined Raw Inputs — Status + Inspection)

This section interleaves the three status-driven inputs into a single end-to-end process: `permits.status` (§2.5.a, rows 1–53), `coa_applications.status` (§2.5.c, rows 70–91), and `permit_inspections.stage_name` (§2.5.d, rows 100–134). **`coa_applications.decision` is deliberately excluded** — see §2.5.h.6 for the rationale (in short: once status-transition history is wired, status alone carries the workflow; decision becomes redundant except as a terminal-outcome lookup).

A project flows through this map via one of two entry points, both eventually converging on the same Permits → Inspection track.

#### §2.5.h.1 — Two Entry Paths (empirical 2026-05-12)

| Path | % of linked pairs | Median lag | Entry block |
|---|---|---|---|
| **Path A — CoA-first** (citizen files CoA → variance decision → homeowner-side delay → permit application) | 77.8% (32,207 of 41,424 linked pairs) | 1,022 days CoA-decision-to-permit-filed | §2.5.c Block CoA-1 (row 70) |
| **Path B — Permits-first** (citizen files permit → examiner identifies variance → CoA filed in parallel) | 22.2% (9,180) | 615 days permit-filed-to-CoA-decision | §2.5.a Block 1 (row 1–2) |
| Same-day / edge | <0.1% (37) | 0 days | Either |

#### §2.5.h.2 — Cross-Stream Process Walk (all 110 rows, grouped by data source)

Every row from §2.5.a, §2.5.c, §2.5.d listed once, grouped into three streams and preserving the block + sub-stage hierarchy from each source section. **Row counts** are from the live DB snapshot 2026-05-12T13:28:40Z. Process flow: Path A enters via Stream 1 (CoA) → exits to Stream 2 (Permit) after CoA closure → converges with Stream 3 (Inspection) post-issuance. Path B enters via Stream 2, runs Stream 1 as a parallel detour during Block 2 Plan Review, then converges with Stream 3.

---

##### Color & Icon Strategy

**Two independent delay dimensions** the UI must surface:

1. **Phase-identity delay (STATIC)** — some Blocks and Stages are inherently bad news (Refused, Revoked, On Hold, Notice Issued, Postponed). They carry a warning/danger base color *regardless of how long the file has been in that state.* A freshly-refused CoA is still bad news; the operator should see red the instant the status flips.
2. **Time-in-phase delay (DYNAMIC)** — files that sit in a Block/Stage longer than its typical duration get a stall overlay applied on top of the static color. This depends on `lifecycle_stalled` (binary today) and, forward-looking, on per-Block typical-duration calibration from `phase_stay_calibration` (needs status-transition history wired — see §2.5.h.NN operational implications).

**Stacking rule:** the two dimensions stack visually. A refused CoA (red base) that has been sitting 6 months also stalls (orange overlay ring) → operator sees `red card + orange ring + 🚨 icon` → "refused **AND** stalled" at a glance. They're not mutually exclusive.

###### Static Hierarchy Colors

**Group base palette** — each Group has a distinct hue, ordered by lifecycle progression (cool blues for intake → indigo for review → amber for friction → teal/orange for action → slate for closure). Inspections use earthy/structural tones.

| Group ID | Name | Bg | Text | Icon |
|---|---|---|---|---|
| C1 | CoA Intake | `#CFFAFE` | `#0E7490` | 📨 |
| C2 | CoA Decision | `#EDE9FE` | `#6D28D9` | ⚖️ |
| C3 | CoA Post-Decision | `#FEF9C3` | `#A16207` | ⏰ |
| C4 | CoA Closure | `#E2E8F0` | `#475569` | 🏁 |
| P1 | Permit Intake | `#DBEAFE` | `#1E40AF` | 📋 |
| P2 | Plan Review | `#E0E7FF` | `#3730A3` | 🔍 |
| P3 | Notice & Response | `#FEF3C7` | `#B45309` | ⚠️ |
| P4 | Pre-Issuance | `#CCFBF1` | `#0F766E` | 📑 |
| P5 | Construction | `#FFEDD5` | `#C2410C` | 🏗️ |
| P6 | Revision | `#F3E8FF` | `#7E22CE` | 🔄 |
| P7 | Closure | `#E2E8F0` | `#475569` | 🏁 |
| I1 | Site Prep & Foundations | `#FEF3C7` | `#92400E` | 🪨 |
| I2 | Structural & MEP | `#E0F2FE` | `#0369A1` | 🔧 |
| I3 | Enclosure & Finishes | `#D1FAE5` | `#047857` | 🎨 |
| I4 | Final / Specialty | `#FEF3C7` | `#A16207` | 🏆 |

**Inheritance:** Blocks inherit parent Group's color and icon unless overridden by phase-identity rules below. Stages inherit parent Block's color and icon unless overridden.

###### Phase-Identity Overrides (STATIC — based on phase meaning, not time)

**🟡 Warning palette — applicant action required; recoverable:**

| Bg | Text | Icon | Applies to (Stages) |
|---|---|---|---|
| `#FEF9C3` | `#A16207` | ⏸️ | #15 Application On Hold, #16 Application on Hold, #77 Postponed, #78 Deferred |
| `#FEF3C7` | `#B45309` | ⚠️ | #12 Examiner's Notice Sent, #13 Notice Sent, #14 Deficiency Notice Issued |
| `#FEF3C7` | `#B45309` | 📅 | #34 Pending Closed, #35 Pending Cancellation, #38 Inspection Request to Cancel |

**🔴 Danger palette — phase signals likely terminal failure:**

| Bg | Text | Icon | Applies to (Stages) |
|---|---|---|---|
| `#FECACA` | `#991B1B` | ❌ | #42 Refusal Notice, #52 Refused, #82 Refused (CoA) |
| `#FECACA` | `#991B1B` | 🚫 | #49 Permit Revoked, #50 Revoked, #36 Revocation Pending, #37 Revocation Notice Sent |
| `#FECACA` | `#991B1B` | ⛔ | #46 VIOLATION, #45 Work Suspended, #48 Order Issued |
| `#FEE2E2` | `#B91C1C` | 🗑️ | #43 Abandoned, #44 Application Withdrawn, #47 Not Accepted, #51 Cancelled, #53 Follow-up Required, #88 Application Withdrawn (CoA), #89 Cancelled (CoA) |

**🟢 Positive palette — successful outcome:**

| Bg | Text | Icon | Applies to (Stages) |
|---|---|---|---|
| `#DCFCE7` | `#166534` | ✅ | #80 Approved (CoA), #81 Approved with Conditions, #79 Conditional Consent, #83 Final and Binding, #122 Occupancy |

**⚪ Drift palette — code/spec mismatch (operationally neutral but flagged for engineering):**

| Bg | Text | Icon | Applies to (Stages) |
|---|---|---|---|
| `#E5E7EB` | `#6B7280` | 🐛 | #6 Not Started, #7 Not Started - Express, #10 Plan Review Complete (these statuses map to phase codes that don't match city semantics) |

**Block-level overrides** (block inherits one of the above palettes when ALL its stages are in the same bad-news category):
- P3 (Notice & Response) Block 3.A Notice Issued, 3.B Deficiency Confirmed, 3.C Application Paused → inherit ⚠️ Warning
- P7 Block 6.A Wind-Down Cancellation → ⚠️ Warning amber
- P7 Block 6.B Wind-Down Revocation → 🔴 Danger red
- P7 Blocks 6.D–6.H Terminal Dead (Refusal, Withdrawal, Revocation, Enforcement, Other) → 🔴 Danger red
- C4 CoA Closure → varies by stage (Withdrawn/Cancelled = warning amber; Closed/Complete = neutral slate)

###### Dynamic Performance Overlay (TIME-IN-PHASE, applied on top of static)

Rendered as a **border ring + corner badge** layered over the static color. Visual treatment per state:

| State | Icon | Visual | Trigger |
|---|---|---|---|
| ✅ On-Time | (none) | No overlay | Within typical duration for current Block/Stage |
| ⏰ Aging | ⏰ | Yellow border ring | 80–100% of typical duration (forward-looking — requires `phase_stay_calibration` cohort data) |
| 🚨 Stalled | 🚨 | Orange/red border ring + alert badge | `lifecycle_stalled = true` |

**Today's stall triggers** (from `logic_variables`, all tunable via Admin Control Panel — Spec 86):
- `coa_stall_threshold` = 30 days · fires only in CoA Block C1.A/C1.B/C1.C (P1/P2 phases) when `daysSinceActivity` > threshold
- `lifecycle_issued_stall_days` = 730 days · fires when permit `status = 'Permit Issued'` + no passed inspection + days-since-issued > threshold
- `lifecycle_inspection_stall_days` = 180 days · fires when permit `status = 'Inspection'` + days-since-latest-inspection > threshold
- `lifecycle_orphan_stall_days` = 180 days · fires for orphan permits (O1/O2/O3 track)
- `enriched_status = 'Stalled'` sentinel · operator-set override that forces stalled regardless of time math

**Forward dependency:** the ⏰ Aging state (graduated yellow) requires per-Block/Stage typical-duration calibration that needs status-transition history first. `permit_history` is currently empty (see §2.5.h.NN dependencies). Until that's wired, only binary 🚨 Stalled renders; ⏰ Aging stays disabled.

###### Icon Strategy Summary

- **Group icons** are conceptual — render in summary views, group headers, dashboards.
- **Block icons** mostly inherit Group; specific operational icons override (⚠️ for Notice blocks, ⏸️ for Pause blocks, etc.).
- **Stage icons** mostly inherit Block; semantic overrides for specific terminal/refused/revoked/withdrawn statuses (❌ 🚫 ⛔ 🗑️).
- **Dynamic icons** (🚨 stalled, ⏰ aging) layer on top of static icons — they don't replace them. A stalled refused CoA renders `❌ + 🚨`.

###### How the strategy maps to UI surfaces

- **Admin Flight Center / Lead Detail Inspector** — full hierarchy badge (Group color background, Block icon, Stage icon, dynamic overlay ring). User sees the project's position at all three levels of resolution.
- **Mobile lead feed card** — Group color as left-edge bar; Stage icon inline; dynamic 🚨 badge if stalled.
- **Phase distribution heatmap (admin)** — colors aggregate by Group; warning/danger phases show as red bands.
- **Operator-facing tracked-projects list** — sort by Group first, then dynamic overlay (stalled-first sort).

---

##### Stream 1 — CoA Workflow (data source: `coa_applications.status` · CoA Public Records portal scraper)

22 statuses, rows 70–91. Full definitions in §2.5.c. Block CoA-1 through CoA-14 preserved verbatim from the source section.

| # | Status | Rows | → Phase | Note |
|---|---|---|---|---|
| **▶ Block CoA-1 — Application Received** |||||
| 70 | Application Received | 10 | P1 | Path A entry — file received, processing not yet begun |
| **▶ Block CoA-2 — Application Accepted** |||||
| 71 | Accepted | 279 | P1 | Fee paid, queued for notice prep |
| **▶ Block CoA-3 — Notice Preparation** |||||
| 72 | Prepare Notice | 54 | P2 | Staff drafting hearing notice (60m-radius mailing) |
| 73 | Notice Prepared | 74 | P2 | Notice ready to mail |
| **▶ Block CoA-4 — Hearing Scheduling** |||||
| 74 | Tentatively Scheduled | 118 | P2 | Date placed on calendar tentatively |
| 75 | Hearing Scheduled | 317 | P2 | Confirmed date — Spec §3.1 "Public Hearing Scheduled" trigger |
| 76 | Hearing Rescheduled | 1 | P2 | Originally-scheduled hearing moved |
| **▶ Block CoA-5 — Hearing Postponed** |||||
| 77 | Postponed | 292 | P2 | Procedural pause BEFORE committee heard case (typical: weeks) |
| **▶ Block CoA-6 — Hearing Deferred** |||||
| 78 | Deferred | 270 | P2 | Substantive pause AFTER committee heard case (typical: 1–3 months) |
| **▶ Block CoA-7 — Conditional Consent** |||||
| 79 | Conditional Consent | 326 | P3 | Severance/consent approved with conditions |
| **▶ Block CoA-8 — Approved** |||||
| 80 | Approved | 246 | P3 | Variance approved as-filed |
| 81 | Approved with Conditions | 554 | P3 | Variance approved subject to conditions |
| **▶ Block CoA-9 — Refused / Final and Binding** |||||
| 82 | Refused | 59 | P19 | Variance denied |
| 83 | Final and Binding | 1 | P4 | Past 20-day appeal window; legally binding |
| **▶ Block CoA-10 — Awaiting Appeal Window Expiry** |||||
| 84 | Await Expiry Date | 24 | P3 | 20-day Toronto appeal clock running (capped duration) |
| **▶ Block CoA-11 — Appeal Initiated** |||||
| 85 | Appealed | 1 | P3 | Generic flag; channel unspecified (transient, days) |
| **▶ Block CoA-12 — TLAB Appeal** |||||
| 86 | TLAB Appeal | 347 | P3 | Toronto Local Appeal Body (typical: 4–9 months) |
| **▶ Block CoA-13 — OMB Appeal** |||||
| 87 | OMB Appeal | 218 | P3 | Ontario Municipal Board legacy (typical: 1–3 years) |
| **▶ Block CoA-14 — Terminal** |||||
| 88 | Application Withdrawn | 904 | P19 | Applicant withdrew before decision |
| 89 | Cancelled | 1 | P19 | Application cancelled |
| 90 | Complete | 8 | P20 | Follow-up actions complete |
| 91 | Closed | 28,948 | P20 | Default terminal — 87.6% of all CoAs land here |

---

##### Stream 2 — Permit Workflow (data source: `permits.status` · CKAN Active Building Permits Open Data feed)

53 statuses, rows 1–53. Full definitions in §2.5.a. Block 1 through Block 10 plus all sub-stages (Stage 1.1, 1.2, etc.) preserved verbatim from the source section.

| # | Status | Rows | → Phase | Note |
|---|---|---|---|---|
| **▶ Block 1 — Application Intake (city Phase 1)** |||||
| *Stage 1.1 — Initial Submission (file enters IBMS; intake not yet processed)* |||||
| 1 | Request Received | 1 | P3 | Sub-folder request opened against an existing permit |
| 2 | Application Received | 218 | P3 | Citizen filed; intake not yet processed |
| *Stage 1.2 — Submission Accepted (filing requirements met; initial fee outstanding)* |||||
| 3 | Application Acceptable | 465 | P3 | Submission complete; fee outstanding |
| *Stage 1.3 — File Active in System (intake fee paid; file open and tracked)* |||||
| 4 | Open | 519 | P3 | Generic IBMS state — file open |
| 5 | Active | 24 | P3 | Generic IBMS state — file being worked |
| **▶ Block 2 — Plan Review (city Phase 2 — five parallel discipline reviews)** |||||
| *Stage 2.1 — Review Queued (accepted; reviewer not yet started)* |||||
| 6 | Not Started | 1,063 | P7d | **CODE DRIFT:** city def is pre-review, code maps to post-issuance |
| 7 | Not Started - Express | 92 | P7d | **CODE DRIFT** as #6 (Express stream variant) |
| *Stage 2.2 — Review In Progress (active discipline reviewers examining file)* |||||
| 8 | Under Review | 2,100 | P4 | Review started, in progress |
| 9 | Examination | 30 | P4 | Internal IBMS synonym for Under Review |
| *Stage 2.3 — Review Complete (technical review finished)* |||||
| 10 | Plan Review Complete | 57 | P3 | **CODE DRIFT:** end of Phase 2 per city; code maps to intake |
| 11 | Consultation Completed | 2 | P4 | Tier 1c pre-application consultation closed |
| **▶ Block 3 — Notice & Response Loop (city Phase 3)** |||||
| *Stage 3.1 — Notice Issued (examiner identified gaps; notice dispatched)* |||||
| 12 | Examiner's Notice Sent | 2,757 | P4 | Examiner's notice dispatched to applicant |
| 13 | Notice Sent | 1 | UNMAPPED → null | Synonym for #12 but not in code set; falls through |
| *Stage 3.2 — Deficiency Confirmed (formal deficiency notice issued)* |||||
| 14 | Deficiency Notice Issued | 117 | P5 | Formal escalation of Examiner's Notice |
| *Stage 3.3 — Application Paused (file on hold while applicant gathers items)* |||||
| 15 | Application On Hold | 1,655 | P5 | Paused on applicant-side missing items |
| 16 | Application on Hold | 4 | P5 | Case variant of #15 |
| *Stage 3.4 — Response Received (applicant submitted response to notice)* |||||
| 17 | Response Received | 436 | P5 | Applicant responded; file re-queues for review |
| *Stage 3.5 — Cross-Folder Block (sub-permit waiting on parent BLD/CMB)* |||||
| 18 | Pending Parent Folder Review | 33 | P5 | Sub-permit blocked on parent folder advancement |
| **▶ Block 4 — Pre-Issuance (city Phase 4)** |||||
| *Stage 4.1 — Permit Approved (technical review signed off internally)* |||||
| 19 | Approved | 23 | P6 | Internal technical-approval marker |
| *Stage 4.2 — Ready for Issuance (admin paperwork complete; permit can issue)* |||||
| 20 | Ready for Issuance | 233 | P6 | Permit ready to issue at any time |
| *Stage 4.3 — Approved but Outstanding Conditions (admin done; blocked on external)* |||||
| 21 | Forwarded for Issuance | 3 | P6 | Queued to issuance desk |
| 22 | Issuance Pending | 2,974 | P6 | Fees/other approvals outstanding — dominant pre-issuance state |
| 23 | Agreement in Progress | 10 | P6 | Section 37 / Site Plan / Development Agreement being executed |
| *Stage 4.4 — Cross-Domain Issuance (non-building-permit sub-type)* |||||
| 24 | Licence Issued | 4 | P6 | Sign/hoarding license — cross-feed noise |
| **▶ Block 5 — Permit Issued / Pre-Inspection** |||||
| *Stage 5.1 — Newly Issued (P7a/b/c time-buckets running)* |||||
| 25 | Permit Issued | 52,403 | P7a/P7b/P7c (or P9-P17 if any inspection passed) | Time-bucketed by `NOW() - issued_date` |
| *Stage 5.2 — Issued, No Construction Yet (status-flagged distinction from #25)* |||||
| 26 | Work Not Started | 1,093 | P7d | 100% post-issuance; semantically distinct from row 6 |
| 27 | Extension Granted | 3 | P7d | Permit expiry extended; clock reset |
| **▶ Block 6 — Revision (post-issuance Notice of Change processing)** |||||
| 28 | Revision Issued | 20,698 | P8 | Notice of Change accepted by Chief Building Official |
| 29 | Revised | 27 | P8 | Notice of Change submitted |
| 30 | Order Complied | 22 | P8 | Compliance order satisfied |
| **▶ Block 7 — Active Inspection (overall status; phase via Stream 3 stage-map)** |||||
| 31 | Inspection | 138,546 | P9-P17 (via Stream 3) or P18 | Mapped by latest passed inspection stage |
| 32 | Forward to Inspector | 1 | P18 | File handed off to inspector |
| 33 | Rescheduled | 1 | P18 | Scheduled visit moved |
| **▶ Block 8 — Wind-Down / Pre-Terminal** |||||
| *Stage 8.1 — Cancellation in Progress (administrative closure)* |||||
| 34 | Pending Closed | 6,699 | P19 | File flagged for closure; paperwork pending |
| 35 | Pending Cancellation | 488 | P19 | Dormant >5 months; cancellation notice sent |
| 38 | Inspection Request to Cancel | 1 | P19 | Pending cancellation of scheduled inspection |
| *Stage 8.2 — Revocation in Progress (city-initiated termination)* |||||
| 36 | Revocation Pending | 2,335 | P19 | City has begun revocation proceedings |
| 37 | Revocation Notice Sent | 1 | P19 | Formal revocation notice issued |
| **▶ Block 9 — Terminal (Closed — file administratively closed)** |||||
| 39 | Closed | 10,695 | P20 | Default terminal state |
| 40 | File Closed | 6 | P20 | Variant of Closed |
| 41 | Permit Issued/Close File | 2 | P20 | Issued and immediately closed — trivial jobs |
| **▶ Block 10 — Terminal (Dead — adverse terminal; `phase=null`)** |||||
| *Stage 10.1 — Refusal (city rejected application after review)* |||||
| 42 | Refusal Notice | 958 | null (DEAD) | Refused notice sent to applicant |
| 52 | Refused | 1 | null (DEAD) | Variant of #42 |
| *Stage 10.2 — Withdrawal / Abandonment (applicant gave up or never followed through)* |||||
| 43 | Abandoned | 122 | null (DEAD) | File abandoned by applicant |
| 44 | Application Withdrawn | 49 | null (DEAD) | Applicant explicitly withdrew |
| 47 | Not Accepted | 9 | null (DEAD) | Application not accepted at intake |
| *Stage 10.3 — Revocation (city-initiated termination of issued permit)* |||||
| 49 | Permit Revoked | 2 | null (DEAD) | Permit revoked |
| 50 | Revoked | 2 | null (DEAD) | Variant of #49 (§3 says P20 should fire; doesn't) |
| *Stage 10.4 — Compliance / Enforcement (active enforcement action)* |||||
| 45 | Work Suspended | 18 | null (DEAD) | Construction suspended by city order |
| 46 | VIOLATION | 16 | null (DEAD) | Inspection order against permit |
| 48 | Order Issued | 7 | null (DEAD) | Compliance order against permit |
| *Stage 10.5 — Other Terminal (residual states)* |||||
| 51 | Cancelled | 1 | null (DEAD) | Application cancelled (§3 says P19 should fire; doesn't) |
| 53 | Follow-up Required | 1 | null (DEAD) | Follow-up flag on file |

---

##### Stream 3 — Inspection Stages (data source: `permit_inspections.stage_name` · CCO inspection portal scraper)

35 stages, rows 100–134. Full definitions in §2.5.d. Only consumed when `permit_inspections.status = 'Passed'`. Phases assigned via lowercase-substring matching, ordered first-match-wins per `mapInspectionStageToPhase()`.

| # | Stage Name | Rows | → Phase | Note |
|---|---|---|---|---|
| **▶ Block 1 — Site Prep** |||||
| 100 | Site Grading Inspection | 4,921 | P9 | matches `site grading` |
| 101 | Excavation/Shoring | 6,735 | P9 | matches `excavation` |
| 102 | Demolition | 1,012 | P9 | matches `demolition` |
| **▶ Block 2 — Foundations** |||||
| 103 | Footings/Foundations | 7,600 | P10 | matches `footings` |
| 104 | Foundation | 2 | P10 | matches `=== 'foundation'` (exact lowercase equality) |
| **▶ Block 3 — Structural Framing** |||||
| 105 | Structural Framing | 9,592 | P11 | matches `structural framing` |
| **▶ Block 4 — MEP Rough-in (Mechanical / Electrical / Plumbing)** |||||
| 106 | HVAC/Extraction Rough-in | 883 | P12 | matches `hvac` |
| 107 | Water Service | 888 | P12 | matches `water service` |
| 108 | Water Distribution | 911 | P12 | matches `water distribution` |
| 109 | Drain/Waste/Vents | 910 | P12 | matches `drain` |
| 110 | Sewers/Drains/Sewage System | 890 | P12 | matches `drain` first (same P12 output as `sewers`) |
| 111 | Fire Service | 889 | P12 | matches `fire service` |
| 112 | Fire Access Routes | 2,277 | P12 | matches `fire access` |
| 113 | Fire Protection Systems | 5,969 | P12 | matches `fire protection` |
| **▶ Block 5 — Enclosure / Sealed** |||||
| 114 | Insulation/Vapour Barrier | 8,775 | P13 | matches `insulation` |
| 115 | Insulation | 1 | P13 | matches `insulation` |
| 116 | Insulation & Vapour/AirBarrier Passed on | 1 | P13 | matches `insulation` |
| **▶ Block 6 — Fire Sep / Board (Drywall Anchor)** |||||
| 117 | Fire Separations | 7,035 | P14 | matches `fire separations` |
| **▶ Block 7 — Interior Finishes** |||||
| 118 | Interior Final Inspection | 6,462 | P15 | matches `interior final` |
| 119 | Plumbing Final | 914 | P15 | matches `plumbing final` |
| 120 | HVAC Final | 883 | P15 | matches `hvac final` |
| **▶ Block 8 — Exterior Finishes** |||||
| 121 | Exterior Final Inspection | 7,432 | P16 | matches `exterior final` |
| **▶ Block 9 — Occupancy / Project Final** |||||
| 122 | Occupancy | 8,965 | P17 | matches `occupancy` (occupancy granted) |
| 123 | Final Inspection | 1,060 | P17 | matches `final inspection` (project final) |
| **▶ Block 10 — Specialty (no §3 phase target — fall through to P17 fallback)** |||||
| 124 | Pool Suction/Gravity Outlets | 2,232 | UNMAPPED → P17 fallback | No substring match |
| 125 | Pool Circulation System | 2,232 | UNMAPPED → P17 fallback | No substring match |
| 126 | Repair/Retrofit | 1,132 | UNMAPPED → P17 fallback | No substring match |
| 127 | Change of Use | 1,017 | UNMAPPED → P17 fallback | No substring match |
| 128 | System | 1,010 | UNMAPPED → P17 fallback | No substring match |
| 129 | Security Device | 1,006 | UNMAPPED → P17 fallback | No substring match |
| 130 | Tent/Portable Classroom | 1,005 | UNMAPPED → P17 fallback | No substring match |
| **▶ Block 11 — Data-Quality Outliers** |||||
| 131 | Final Interior | 1 | UNMAPPED → P17 fallback | Word-order issue — likely meant `interior final` (P15) |
| 132 | HVAC Permit? | 1 | P12 | Matches `hvac`; `?` flags data-quality issue at source |
| 133 | Survey | 1 | UNMAPPED → P17 fallback | Likely admin survey, not a construction phase |
| 134 | Survey Submitted? | 1 | UNMAPPED → P17 fallback | Same |

---

##### Universal Stream — Full Cross-Reference Table (all 110 rows, every column)

Every row from §2.5.a, §2.5.c, §2.5.d listed once in process order with full block/stage context inlined. **Loop column** captures back-edges (loop-back transitions); forward linear progression is implicit in row order. `↩` indicates a loop. Rows are CoA first (#70–91), then Permit (#1–53), then Inspection (#100–134) — matching Streams 1/2/3 above.

| # | Group | Group Label | Block | Block Label | Stage | Stage Label | Source | Status | Rows | Phase | Note | Description | Loop → | Group Color | Group Icon | Block Color | Block Icon | Stage Color | Stage Icon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 70 | C1 | CoA Intake | B1.A | Applications | — | — | coa.status | Application Received | 10 | P1 | Path A entry | File received at CoA intake desk; processing not yet begun | — | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 |
| 71 | C1 | CoA Intake | B1.A | Applications | — | — | coa.status | Accepted | 279 | P1 | Fee paid | Intake fee paid; file accepted into CoA queue awaiting notice prep | — | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 |
| 72 | C1 | CoA Intake | B1.B | Hearing Prep | — | — | coa.status | Prepare Notice | 54 | P2 | Drafting | Staff drafting the notice of hearing (mailed to neighbors in 60m radius) | — | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 |
| 73 | C1 | CoA Intake | B1.B | Hearing Prep | — | — | coa.status | Notice Prepared | 74 | P2 | Ready to mail | Notice of hearing drafted; ready for mailing | — | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 |
| 74 | C1 | CoA Intake | B1.B | Hearing Prep | — | — | coa.status | Tentatively Scheduled | 118 | P2 | Calendar | Hearing tentatively placed on committee calendar; date may shift | — | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 |
| 75 | C1 | CoA Intake | B1.B | Hearing Prep | — | — | coa.status | Hearing Scheduled | 317 | P2 | Confirmed | Confirmed hearing date; notice mailed (Spec §3.1 "Public Hearing Scheduled") | — | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 |
| 76 | C1 | CoA Intake | B1.B | Hearing Prep | — | — | coa.status | Hearing Rescheduled | 1 | P2 | Moved | Originally-scheduled hearing moved to a new date | ↩ #75 | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 |
| 77 | C1 | CoA Intake | B1.C | Hearing Pause | — | — | coa.status | Postponed | 292 | P2 | Procedural (weeks) | Hearing postponed BEFORE committee heard case — procedural (notice defect, applicant request) | ↩ #75 | #CFFAFE | 📨 | #CFFAFE | 📨 | #FEF9C3 | ⏸️ |
| 78 | C1 | CoA Intake | B1.C | Hearing Pause | — | — | coa.status | Deferred | 270 | P2 | Substantive (1–3 months) | Committee heard case but deferred decision — substantive (more info needed, neighbor concerns) | ↩ #75 | #CFFAFE | 📨 | #CFFAFE | 📨 | #FEF9C3 | ⏸️ |
| 79 | C2 | CoA Decision | B2.A | Consent | — | — | coa.status | Conditional Consent | 326 | P3 | Severance/consent | Committee granted consent with conditions (severance/consent applications) | — | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #DCFCE7 | ✅ |
| 80 | C2 | CoA Decision | B2.B | Approved | — | — | coa.status | Approved | 246 | P3 | Variance OK | Committee approved the variance application as-filed | — | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #DCFCE7 | ✅ |
| 81 | C2 | CoA Decision | B2.B | Approved | — | — | coa.status | Approved with Conditions | 554 | P3 | Variance OK + conditions | Committee approved variance subject to specific conditions | — | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #DCFCE7 | ✅ |
| 82 | C2 | CoA Decision | B2.C | Refused / Binding | — | — | coa.status | Refused | 59 | P19 | Denied | Committee denied the variance application | — | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #FECACA | ❌ |
| 83 | C2 | CoA Decision | B2.C | Refused / Binding | — | — | coa.status | Final and Binding | 1 | P4 | Appeal cleared | Decision past 20-day appeal window; legally binding | (terminal) | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #DCFCE7 | ✅ |
| 84 | C3 | CoA Post-Decision | B3.A | Appeal Window | — | — | coa.status | Await Expiry Date | 24 | P3 | 20-day window | Decision rendered; waiting for 20-day Toronto appeal window | — | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ |
| 85 | C3 | CoA Post-Decision | B3.B | Appeal Initiated | — | — | coa.status | Appealed | 1 | P3 | Transient | Generic appeal flag; channel unspecified or routing pending | — | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ |
| 86 | C3 | CoA Post-Decision | B3.C | Active Appeals | — | — | coa.status | TLAB Appeal | 347 | P3 | 4–9 months | Decision under appeal at Toronto Local Appeal Body | — | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ |
| 87 | C3 | CoA Post-Decision | B3.C | Active Appeals | — | — | coa.status | OMB Appeal | 218 | P3 | 1–3 years legacy | Decision under appeal at Ontario Municipal Board (legacy, replaced by TLAB) | — | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ |
| 88 | C4 | CoA Closure | B4.A | Terminal | — | — | coa.status | Application Withdrawn | 904 | P19 | Pre-decision | Applicant withdrew the application before decision | (terminal) | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ |
| 89 | C4 | CoA Closure | B4.A | Terminal | — | — | coa.status | Cancelled | 1 | P19 | Admin | Application cancelled (applicant request or administrative) | (terminal) | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ |
| 90 | C4 | CoA Closure | B4.A | Terminal | — | — | coa.status | Complete | 8 | P20 | Done | All required follow-up actions done; file complete | (terminal) | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 |
| 91 | C4 | CoA Closure | B4.A | Terminal | — | — | coa.status | Closed | 28,948 | P20 | 87.6% land here | File administratively closed — default CoA terminal state | (terminal) | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 |
| 1 | P1 | Permit Intake | B1.A | Initial Submission | 1.1 | Initial Submission | permits.status | Request Received | 1 | P3 | `INTAKE_P3_SET` | Sub-folder request opened against existing permit (revision/extension) | — | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 |
| 2 | P1 | Permit Intake | B1.A | Initial Submission | 1.1 | Initial Submission | permits.status | Application Received | 218 | P3 | `INTAKE_P3_SET` | City def: "The Application has been received but intake has not been accepted or processed" | — | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 |
| 3 | P1 | Permit Intake | B1.B | Submission Accepted | 1.2 | Submission Accepted | permits.status | Application Acceptable | 465 | P3 | `INTAKE_P3_SET` | City def: "Submission requirement met; intake not yet accepted because initial fee outstanding" | — | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 |
| 4 | P1 | Permit Intake | B1.C | File Active | 1.3 | File Active | permits.status | Open | 519 | P3 | `INTAKE_P3_SET` | Generic IBMS state — file open in system | — | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 |
| 5 | P1 | Permit Intake | B1.C | File Active | 1.3 | File Active | permits.status | Active | 24 | P3 | `INTAKE_P3_SET` | Generic IBMS state — file being actively worked | — | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 |
| 6 | P2 | Plan Review | B2.A | Review Queued | 2.1 | Review Queued | permits.status | Not Started | 1,063 | P7d | **CODE DRIFT** | City def: "Application accepted but review has not started" — pre-review (99.6% pre-issuance) | — | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E5E7EB | 🐛 |
| 7 | P2 | Plan Review | B2.A | Review Queued | 2.1 | Review Queued | permits.status | Not Started - Express | 92 | P7d | **CODE DRIFT** | Same as #6 but for Express stream (fast-track simple permits) | — | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E5E7EB | 🐛 |
| 8 | P2 | Plan Review | B2.B | Review In Progress | 2.2 | Review In Progress | permits.status | Under Review | 2,100 | P4 | `REVIEW_P4_SET` | City def: "Application accepted and Review started but not completed" | — | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E0E7FF | 🔍 |
| 9 | P2 | Plan Review | B2.B | Review In Progress | 2.2 | Review In Progress | permits.status | Examination | 30 | P4 | `REVIEW_P4_SET` | Internal IBMS synonym for active Under Review | — | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E0E7FF | 🔍 |
| 10 | P2 | Plan Review | B2.C | Review Complete | 2.3 | Review Complete | permits.status | Plan Review Complete | 57 | P3 | **CODE DRIFT** | All five discipline reviews finished; moving to Pre-Issuance (53% pre-/47% post-issuance, recurs on revisions) | — | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E5E7EB | 🐛 |
| 11 | P2 | Plan Review | B2.C | Review Complete | 2.3 | Review Complete | permits.status | Consultation Completed | 2 | P4 | `REVIEW_P4_SET` | Pre-application consultation closed (Tier 1c stream) | — | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E0E7FF | 🔍 |
| 12 | P3 | Notice & Response | B3.A | Notice Issued | 3.1 | Notice Issued | permits.status | Examiner's Notice Sent | 2,757 | P4 | `REVIEW_P4_SET` | City def: "Application accepted, Review resulted in a Notice that has been sent" | ↩ via #17 → #8 (re-queue) | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ |
| 13 | P3 | Notice & Response | B3.A | Notice Issued | 3.1 | Notice Issued | permits.status | Notice Sent | 1 | UNMAPPED→null | Not in any code set; falls through | Operationally synonymous with #12 (Examiner's Notice Sent) but counted by `unclassified_count` CQA gate | ↩ via #17 → #8 (re-queue) | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ |
| 14 | P3 | Notice & Response | B3.B | Deficiency Confirmed | 3.2 | Deficiency Confirmed | permits.status | Deficiency Notice Issued | 117 | P5 | `HOLD_P5_SET` | Formal deficiency notice — escalation when Examiner's Notice unaddressed | ↩ via #17 → #8 (re-queue) | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ |
| 15 | P3 | Notice & Response | B3.C | Application Paused | 3.3 | Application Paused | permits.status | Application On Hold | 1,655 | P5 | `HOLD_P5_SET` | City def: "Application received but on hold because of missing information" | ↩ #17 (when applicant responds) or → #51 Cancelled (if abandoned) | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF9C3 | ⏸️ |
| 16 | P3 | Notice & Response | B3.C | Application Paused | 3.3 | Application Paused | permits.status | Application on Hold | 4 | P5 | `HOLD_P5_SET` | Case variant of #15 (both members of set) | ↩ #17 (when applicant responds) or → #51 Cancelled | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF9C3 | ⏸️ |
| 17 | P3 | Notice & Response | B3.D | Response Received | 3.4 | Response Received | permits.status | Response Received | 436 | P5 | `HOLD_P5_SET` | City def: "Response to a Notice submitted to Toronto Building" | ↩ #8 Under Review (re-queue) | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ |
| 18 | P3 | Notice & Response | B3.E | Cross-Folder Block | 3.5 | Cross-Folder Block | permits.status | Pending Parent Folder Review | 33 | P5 | `HOLD_P5_SET` | Sub-permit (HVA/PLB/etc.) blocked waiting on parent BLD/CMB | ↩ #8 (when parent advances) | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ |
| 19 | P4 | Pre-Issuance | B4.A | Permit Approved | 4.1 | Permit Approved | permits.status | Approved | 23 | P6 | `READY_P6_SET` (distinct from CoA "Approved") | Internal technical-approval marker — transitional before Ready for Issuance | — | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 |
| 20 | P4 | Pre-Issuance | B4.B | Ready for Issuance | 4.2 | Ready for Issuance | permits.status | Ready for Issuance | 233 | P6 | `READY_P6_SET` | City def: "Review completed, Permit ready for issuance at any time" (87% pre-/13% post-issuance) | — | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 |
| 21 | P4 | Pre-Issuance | B4.C | Outstanding Conditions | 4.3 | Outstanding Conditions | permits.status | Forwarded for Issuance | 3 | P6 | `READY_P6_SET` | Queued to issuance desk for fee collection / final paperwork | — | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 |
| 22 | P4 | Pre-Issuance | B4.C | Outstanding Conditions | 4.3 | Outstanding Conditions | permits.status | Issuance Pending | 2,974 | P6 | `READY_P6_SET` | City def: "Review completed, however other approvals/fees outstanding" — dominant pre-issuance state | — | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 |
| 23 | P4 | Pre-Issuance | B4.C | Outstanding Conditions | 4.3 | Outstanding Conditions | permits.status | Agreement in Progress | 10 | P6 | `READY_P6_SET` | Section 37 / Site Plan / Development Agreement being executed | — | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 |
| 24 | P4 | Pre-Issuance | B4.D | Cross-Domain Issuance | 4.4 | Cross-Domain Issuance | permits.status | Licence Issued | 4 | P6 | `READY_P6_SET` (cross-feed noise) | Sign/hoarding license sharing IBMS feed — not a building-permit phase | — | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 |
| 25 | P5 | Construction | B5.A | Newly Issued | 5.1 | Newly Issued | permits.status | Permit Issued | 52,403 | P7a/P7b/P7c (or P9-P17) | Time-bucketed | City def: "The Permit has been issued"; time-bucketed by `NOW() - issued_date` | → #31 Inspection (when inspections begin) | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ |
| 26 | P5 | Construction | B5.B | No Construction Yet | 5.2 | No Construction Yet | permits.status | Work Not Started | 1,093 | P7d | `NOT_STARTED_P7D_SET` (100% post-issuance) | City def: "An Inspection was conducted and construction has not taken place" — distinct from #6 | — | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ |
| 27 | P5 | Construction | B5.B | No Construction Yet | 5.2 | No Construction Yet | permits.status | Extension Granted | 3 | P7d | `NOT_STARTED_P7D_SET` (100% post-issuance) | Permit expiry extended; clock reset | — | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ |
| 28 | P6 | Revision | B6.A | Revision | — | — | permits.status | Revision Issued | 20,698 | P8 | `REVISION_P8_SET` — §3 calls P8 "Mobilization" (drift) | City def: "Notice of Change submitted to CBO and revision has been accepted" | ↩ #8 (revision review) | #F3E8FF | 🔄 | #F3E8FF | 🔄 | #F3E8FF | 🔄 |
| 29 | P6 | Revision | B6.A | Revision | — | — | permits.status | Revised | 27 | P8 | `REVISION_P8_SET` | City def: "Notice of Change has been submitted to the Chief Building Official" | ↩ #8 (revision review) | #F3E8FF | 🔄 | #F3E8FF | 🔄 | #F3E8FF | 🔄 |
| 30 | P6 | Revision | B6.A | Revision | — | — | permits.status | Order Complied | 22 | P8 | `REVISION_P8_SET` | Compliance order satisfied | → #31 Inspection | #F3E8FF | 🔄 | #F3E8FF | 🔄 | #F3E8FF | 🔄 |
| 31 | P5 | Construction | B5.D | Active Inspection (status) | — | — | permits.status | Inspection | 138,546 | P9-P17 (via stages 100-134) or P18 | City def: "Permit issued and under active inspection" | Phase mapped by latest passed inspection stage | → stages #100-134 | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ |
| 32 | P5 | Construction | B5.D | Active Inspection (status) | — | — | permits.status | Forward to Inspector | 1 | P18 | `INSPECTION_PIPELINE_P18_SET` — §3 calls P18 "Project Closed" (drift) | File handed off to inspector; awaiting visit | → #31 Inspection | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ |
| 33 | P5 | Construction | B5.D | Active Inspection (status) | — | — | permits.status | Rescheduled | 1 | P18 | `INSPECTION_PIPELINE_P18_SET` | Scheduled inspection rescheduled | → #31 Inspection | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ |
| 34 | P7 | Closure | B7.A | Wind-Down Cancellation | 8.1 | Wind-Down Cancellation | permits.status | Pending Closed | 6,699 | P19 | `WINDDOWN_P19_SET` — §3 calls P19 "Cancelled" (drift) | File flagged for closure; final paperwork pending | → #39 Closed | #E2E8F0 | 🏁 | #FEF3C7 | 📅 | #FEF3C7 | 📅 |
| 35 | P7 | Closure | B7.A | Wind-Down Cancellation | 8.1 | Wind-Down Cancellation | permits.status | Pending Cancellation | 488 | P19 | `WINDDOWN_P19_SET` | City def: "Application dormant >5 months; owner/applicant notified of cancellation" | → #51 Cancelled (if proceeds) | #E2E8F0 | 🏁 | #FEF3C7 | 📅 | #FEF3C7 | 📅 |
| 38 | P7 | Closure | B7.A | Wind-Down Cancellation | 8.1 | Wind-Down Cancellation | permits.status | Inspection Request to Cancel | 1 | P19 | `WINDDOWN_P19_SET` | Pending cancellation of a scheduled inspection request | → #39 Closed | #E2E8F0 | 🏁 | #FEF3C7 | 📅 | #FEF3C7 | 📅 |
| 36 | P7 | Closure | B7.B | Wind-Down Revocation | 8.2 | Wind-Down Revocation | permits.status | Revocation Pending | 2,335 | P19 | `WINDDOWN_P19_SET` | City has begun revocation proceedings | → #49 Permit Revoked | #E2E8F0 | 🏁 | #FECACA | 🚫 | #FECACA | 🚫 |
| 37 | P7 | Closure | B7.B | Wind-Down Revocation | 8.2 | Wind-Down Revocation | permits.status | Revocation Notice Sent | 1 | P19 | `WINDDOWN_P19_SET` | Formal revocation notice issued to applicant | → #49 Permit Revoked | #E2E8F0 | 🏁 | #FECACA | 🚫 | #FECACA | 🚫 |
| 39 | P7 | Closure | B7.C | Closed | — | — | permits.status | Closed | 10,695 | P20 | `TERMINAL_P20_SET` — §3 calls P20 "Revoked" (drift) | File administratively closed (default terminal state) | (terminal) | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 |
| 40 | P7 | Closure | B7.C | Closed | — | — | permits.status | File Closed | 6 | P20 | `TERMINAL_P20_SET` | Variant of Closed | (terminal) | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 |
| 41 | P7 | Closure | B7.C | Closed | — | — | permits.status | Permit Issued/Close File | 2 | P20 | `TERMINAL_P20_SET` | Issued and immediately closed — trivial jobs | (terminal) | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 |
| 42 | P7 | Closure | B7.D | Dead — Refusal | 10.1 | Dead — Refusal | permits.status | Refusal Notice | 958 | null (DEAD) | `DEAD_STATUS_SET` | City def: "Application Accepted; Review resulted in Refused Notice sent to applicant" | (terminal) | #E2E8F0 | 🏁 | #FECACA | ❌ | #FECACA | ❌ |
| 52 | P7 | Closure | B7.D | Dead — Refusal | 10.1 | Dead — Refusal | permits.status | Refused | 1 | null (DEAD) | `DEAD_STATUS_SET` | Variant of #42 | (terminal) | #E2E8F0 | 🏁 | #FECACA | ❌ | #FECACA | ❌ |
| 43 | P7 | Closure | B7.E | Dead — Withdrawal | 10.2 | Dead — Withdrawal | permits.status | Abandoned | 122 | null (DEAD) | `DEAD_STATUS_SET` | File abandoned by applicant | (terminal) | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ |
| 44 | P7 | Closure | B7.E | Dead — Withdrawal | 10.2 | Dead — Withdrawal | permits.status | Application Withdrawn | 49 | null (DEAD) | `DEAD_STATUS_SET` | Applicant explicitly withdrew | (terminal) | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ |
| 47 | P7 | Closure | B7.E | Dead — Withdrawal | 10.2 | Dead — Withdrawal | permits.status | Not Accepted | 9 | null (DEAD) | `DEAD_STATUS_SET` | Application not accepted at intake | (terminal) | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ |
| 49 | P7 | Closure | B7.F | Dead — Revocation | 10.3 | Dead — Revocation | permits.status | Permit Revoked | 2 | null (DEAD) | `DEAD_STATUS_SET` | City def: "The Permit has been revoked" | (terminal) | #E2E8F0 | 🏁 | #FECACA | 🚫 | #FECACA | 🚫 |
| 50 | P7 | Closure | B7.F | Dead — Revocation | 10.3 | Dead — Revocation | permits.status | Revoked | 2 | null (DEAD) | `DEAD_STATUS_SET` — §3 says P20 should fire here; doesn't | Variant of #49 | (terminal) | #E2E8F0 | 🏁 | #FECACA | 🚫 | #FECACA | 🚫 |
| 45 | P7 | Closure | B7.G | Dead — Enforcement | 10.4 | Dead — Enforcement | permits.status | Work Suspended | 18 | null (DEAD) | `DEAD_STATUS_SET` | Construction suspended by city order | (terminal) | #E2E8F0 | 🏁 | #FECACA | ⛔ | #FECACA | ⛔ |
| 46 | P7 | Closure | B7.G | Dead — Enforcement | 10.4 | Dead — Enforcement | permits.status | VIOLATION | 16 | null (DEAD) | `DEAD_STATUS_SET` | City def: "There is an Inspection Order against this Permit" | (terminal) | #E2E8F0 | 🏁 | #FECACA | ⛔ | #FECACA | ⛔ |
| 48 | P7 | Closure | B7.G | Dead — Enforcement | 10.4 | Dead — Enforcement | permits.status | Order Issued | 7 | null (DEAD) | `DEAD_STATUS_SET` | Compliance order against permit | (terminal) | #E2E8F0 | 🏁 | #FECACA | ⛔ | #FECACA | ⛔ |
| 51 | P7 | Closure | B7.H | Dead — Other | 10.5 | Dead — Other | permits.status | Cancelled | 1 | null (DEAD) | `DEAD_STATUS_SET` — §3 says P19 should fire here; doesn't | Application cancelled | (terminal) | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ |
| 53 | P7 | Closure | B7.H | Dead — Other | 10.5 | Dead — Other | permits.status | Follow-up Required | 1 | null (DEAD) | `DEAD_STATUS_SET` | Follow-up flag on file | (terminal) | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ |
| 100 | I1 | Site Prep & Foundations | B1.A | Site Prep | — | — | insp.stage | Site Grading Inspection | 4,921 | P9 | matches `site grading` | First site-prep inspection (grading work) | ↩ same stage if `status='Not Passed'` (re-inspection) | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 |
| 101 | I1 | Site Prep & Foundations | B1.A | Site Prep | — | — | insp.stage | Excavation/Shoring | 6,735 | P9 | matches `excavation` | Excavation and shoring inspection | ↩ same stage if Not Passed | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 |
| 102 | I1 | Site Prep & Foundations | B1.A | Site Prep | — | — | insp.stage | Demolition | 1,012 | P9 | matches `demolition` | Demolition inspection | ↩ same stage if Not Passed | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 |
| 103 | I1 | Site Prep & Foundations | B1.B | Foundations | — | — | insp.stage | Footings/Foundations | 7,600 | P10 | matches `footings` | Footings and foundations inspection | ↩ same stage if Not Passed | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 |
| 104 | I1 | Site Prep & Foundations | B1.B | Foundations | — | — | insp.stage | Foundation | 2 | P10 | matches `=== 'foundation'` (exact equality) | Foundation inspection (low-count variant) | ↩ same stage if Not Passed | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 |
| 105 | I2 | Structural & MEP | B2.A | Framing | — | — | insp.stage | Structural Framing | 9,592 | P11 | matches `structural framing` | Structural framing inspection — house is now a "box" | ↩ same stage if Not Passed | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 |
| 106 | I2 | Structural & MEP | B2.B | MEP Rough-in | — | — | insp.stage | HVAC/Extraction Rough-in | 883 | P12 | matches `hvac` | HVAC rough-in inspection | ↩ same stage if Not Passed | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 |
| 107 | I2 | Structural & MEP | B2.B | MEP Rough-in | — | — | insp.stage | Water Service | 888 | P12 | matches `water service` | Water service inspection | ↩ same stage if Not Passed | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 |
| 108 | I2 | Structural & MEP | B2.B | MEP Rough-in | — | — | insp.stage | Water Distribution | 911 | P12 | matches `water distribution` | Water distribution inspection | ↩ same stage if Not Passed | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 |
| 109 | I2 | Structural & MEP | B2.B | MEP Rough-in | — | — | insp.stage | Drain/Waste/Vents | 910 | P12 | matches `drain` | Drainage and venting inspection | ↩ same stage if Not Passed | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 |
| 110 | I2 | Structural & MEP | B2.B | MEP Rough-in | — | — | insp.stage | Sewers/Drains/Sewage System | 890 | P12 | matches `drain` first (same P12 output as `sewers`) | Sewer/drainage system inspection | ↩ same stage if Not Passed | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 |
| 111 | I2 | Structural & MEP | B2.B | MEP Rough-in | — | — | insp.stage | Fire Service | 889 | P12 | matches `fire service` | Fire service piping inspection | ↩ same stage if Not Passed | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 |
| 112 | I2 | Structural & MEP | B2.B | MEP Rough-in | — | — | insp.stage | Fire Access Routes | 2,277 | P12 | matches `fire access` | Fire access route inspection | ↩ same stage if Not Passed | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 |
| 113 | I2 | Structural & MEP | B2.B | MEP Rough-in | — | — | insp.stage | Fire Protection Systems | 5,969 | P12 | matches `fire protection` | Fire protection system inspection | ↩ same stage if Not Passed | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 |
| 114 | I3 | Enclosure & Finishes | B3.A | Insulation | — | — | insp.stage | Insulation/Vapour Barrier | 8,775 | P13 | matches `insulation` | Insulation and vapour barrier inspection — house is sealed | ↩ same stage if Not Passed | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 |
| 115 | I3 | Enclosure & Finishes | B3.A | Insulation | — | — | insp.stage | Insulation | 1 | P13 | matches `insulation` | Insulation inspection (low-count variant) | ↩ same stage if Not Passed | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 |
| 116 | I3 | Enclosure & Finishes | B3.A | Insulation | — | — | insp.stage | Insulation & Vapour/AirBarrier Passed on | 1 | P13 | matches `insulation` | Insulation/air barrier inspection (data-quality variant) | ↩ same stage if Not Passed | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 |
| 117 | I3 | Enclosure & Finishes | B3.B | Fire Sep | — | — | insp.stage | Fire Separations | 7,035 | P14 | matches `fire separations` | Fire separations inspection — drywall anchor | ↩ same stage if Not Passed | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 |
| 118 | I3 | Enclosure & Finishes | B3.C | Interior Finals | — | — | insp.stage | Interior Final Inspection | 6,462 | P15 | matches `interior final` | Interior finals inspection | ↩ same stage if Not Passed | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 |
| 119 | I3 | Enclosure & Finishes | B3.C | Interior Finals | — | — | insp.stage | Plumbing Final | 914 | P15 | matches `plumbing final` | Plumbing final inspection | ↩ same stage if Not Passed | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 |
| 120 | I3 | Enclosure & Finishes | B3.C | Interior Finals | — | — | insp.stage | HVAC Final | 883 | P15 | matches `hvac final` | HVAC final inspection | ↩ same stage if Not Passed | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 |
| 121 | I3 | Enclosure & Finishes | B3.D | Exterior Finals | — | — | insp.stage | Exterior Final Inspection | 7,432 | P16 | matches `exterior final` | Exterior finals inspection (cladding, grading) | ↩ same stage if Not Passed | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 |
| 122 | I4 | Final / Specialty | B4.A | Project Final | — | — | insp.stage | Occupancy | 8,965 | P17 | matches `occupancy` | Occupancy granted | (terminal) | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #DCFCE7 | ✅ |
| 123 | I4 | Final / Specialty | B4.A | Project Final | — | — | insp.stage | Final Inspection | 1,060 | P17 | matches `final inspection` | Project final inspection | (terminal) | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #DCFCE7 | ✅ |
| 124 | I4 | Final / Specialty | B4.B | Specialty | — | — | insp.stage | Pool Suction/Gravity Outlets | 2,232 | UNMAPPED→P17 fallback | No substring match | Pool inspection — specialty, no §3 phase target | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 125 | I4 | Final / Specialty | B4.B | Specialty | — | — | insp.stage | Pool Circulation System | 2,232 | UNMAPPED→P17 fallback | No substring match | Pool inspection — specialty | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 126 | I4 | Final / Specialty | B4.B | Specialty | — | — | insp.stage | Repair/Retrofit | 1,132 | UNMAPPED→P17 fallback | No substring match | Repair / retrofit inspection — specialty | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 127 | I4 | Final / Specialty | B4.B | Specialty | — | — | insp.stage | Change of Use | 1,017 | UNMAPPED→P17 fallback | No substring match | Change-of-use inspection — specialty | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 128 | I4 | Final / Specialty | B4.B | Specialty | — | — | insp.stage | System | 1,010 | UNMAPPED→P17 fallback | No substring match | Generic "System" inspection — specialty | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 129 | I4 | Final / Specialty | B4.B | Specialty | — | — | insp.stage | Security Device | 1,006 | UNMAPPED→P17 fallback | No substring match | Security device inspection — specialty | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 130 | I4 | Final / Specialty | B4.B | Specialty | — | — | insp.stage | Tent/Portable Classroom | 1,005 | UNMAPPED→P17 fallback | No substring match | Tent / portable classroom inspection — specialty | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 131 | I4 | Final / Specialty | B4.C | Data-Quality Outliers | — | — | insp.stage | Final Interior | 1 | UNMAPPED→P17 fallback | Word-order issue — likely meant `interior final` (P15) | Data-quality outlier (single row) | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 132 | I4 | Final / Specialty | B4.C | Data-Quality Outliers | — | — | insp.stage | HVAC Permit? | 1 | P12 | Matches `hvac`; `?` flags data-quality | Data-quality outlier (single row, source-side question mark) | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 133 | I4 | Final / Specialty | B4.C | Data-Quality Outliers | — | — | insp.stage | Survey | 1 | UNMAPPED→P17 fallback | Likely admin survey, not a construction phase | Data-quality outlier (single row) | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |
| 134 | I4 | Final / Specialty | B4.C | Data-Quality Outliers | — | — | insp.stage | Survey Submitted? | 1 | UNMAPPED→P17 fallback | Same as #133 | Data-quality outlier (single row, source-side question mark) | — | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 |

#### §2.5.h.3 — Pattern A Handoff (CoA → Permits, 75% of cases)

When a CoA approves a variance, the homeowner manually files a new permit application. **There is no automatic system handoff.**

- **Trigger:** CoA decision = Approved + status moves to Closed (months/years pass).
- **Surface in permit data:** A net-new permit application appears in `permits` with `status = 'Application Received'` (or sometimes `'Open'` / `'Application Acceptable'`). **No status flag indicates prior CoA approval** — the new permit is indistinguishable from a permit that never needed a CoA.
- **How we know it's linked:** Inference only. `link-coa.js` performs post-hoc fuzzy matching by address + date proximity + scope keywords; the city does not natively connect the two systems for most cases (see §2.5.h.5).
- **Empirical landing distribution:** Once filed, the Path-A permit follows the full permit lifecycle — 10,826 currently in Inspection, 7,538 in Permit Issued, 5,730 in Revision Issued, 1,513 in Closed, plus scattered rows in pre-issuance states.

#### §2.5.h.4 — Pattern B Handoff (Permits → CoA, 22% of cases)

When a permit examiner identifies a zoning gap during plan review, the applicant must file a CoA before the permit can advance. **There is no single deterministic permit status that flags this need.**

- **Most common signal:** `permits.status = 'Examiner's Notice Sent'` (52 of the 171 currently-blocked permits sit here — examiner flagged the variance need via notice).
- **Other signals (no single one is reliable):** Blocked permits span **17 different statuses** — Issuance Pending (29), Under Review (16), Not Started (13), Pending Closed (11), Application On Hold (7), Refusal Notice (7), Ready for Issuance (6), and 10 others. Even `Inspection` (1) appears, indicating a permit somehow reached inspection while CoA was still pending.
- **The CoA simultaneously appears** in the CoA portal with `status` running through CoA-1 → CoA-2 → ... in parallel.
- **Median lag:** 615 days (~1.7 years) between permit filing and CoA decision; permit cannot issue during this period.

**Operational implication:** the inspector cannot reliably surface "this permit is blocked on a CoA" without a cross-stream join. No single `permits.status` value is diagnostic.

#### §2.5.h.5 — Linkage Confidence (How We Know They're Connected)

`coa_applications.linked_permit_num` is populated by `link-coa.js`, scored by `coa_applications.linked_confidence`:

| Confidence | Count | % | Source mechanism |
|---|---|---|---|
| **0.95** | 14,421 | 35% | Tier 1a/1b — explicit city cross-reference (CoA portal records the permit#, or vice versa) |
| 0.85 | 1,215 | 3% | Tier 1c — high-confidence name-and-address match |
| 0.60 | 3,292 | 8% | Tier 2 — address + date proximity match |
| 0.50 | 13,060 | 32% | Tier 2 — address-only fallback (no date confirmation) |
| 0.30–0.40 | ~1,000 | ~2% | Tier 3 — full-text search of scope/description (weak) |
| 0.10 | 66 | <0.1% | Minimal-signal match |

**Key finding: only ~38% of linkages are at ≥0.85 confidence**. The remaining **62% are inferred by our pipeline, not city-recorded.** Any UI that surfaces a CoA↔permit link should de-emphasize low-confidence matches.

#### §2.5.h.6 — Why `coa_applications.decision` is Excluded From This Map

`decision` is a *terminal record-of-history* field — set once at adjudication, then frozen. It does not advance during workflow:

- 5.1% of rows (1,690) have `decision IS NULL` — these are the in-flight CoAs where only `status` carries lifecycle signal.
- Among `status = 'Closed'` (28,948 rows = 87.6% of all CoAs), `decision` is the only field distinguishing approved-closed (25,926) from refused-closed (2,282) from withdrawn-closed (708). Status collapses all of these into "Closed."
- The user-validated direction (2026-05-12): once we wire **status-transition history** (`permit_history` is empty; needs to be populated), status alone — with its history — drives the lifecycle. `decision` becomes a secondary outcome-lookup, not a progression driver.

**Consequence:** §2.5.h is built on the assumption that status-transition history will be wired (deferred WF1). Until then, the classifier still needs `decision` to differentiate the 28,948 Closed CoAs.

#### §2.5.h.7 — Convergence Into the Inspection Stream

After permit issuance (§2.5.a #25 Permit Issued), the CoA stream has nothing more to contribute — CoA's role ends at variance approval. The remaining lifecycle is driven by inspection stages from `permit_inspections.stage_name` (§2.5.d #100–134):

- P9 Excavation (#100–102), P10 Foundations (#103–104), P11 Framing (#105)
- P12 MEP Rough-in (#106–113), P13 Insulation (#114–116), P14 Fire Sep (#117)
- P15 Interior Finals (#118–120), P16 Exterior Finals (#121), P17 Occupancy (#122–123)
- Specialty / data-quality (#124–134) — fall through to P17 fallback in the current classifier

This map does **not** include `permits.status = 'Inspection'` (row 31) — that's a summary status; the actual phase derives from the latest passed inspection stage.

#### §2.5.h.8 — Operational Implications

1. **171 permits are currently blocked on CoA decisions** with no diagnostic status. Cross-stream join required to surface this in any operator UI. (Spec 84 §6 Fix B WF1 scope.)
2. **No automatic Path-A trigger.** A homeowner can wait years between CoA approval and permit filing. Tracked-projects UI needs to expose CoA-approved-but-no-permit cases for proactive outreach.
3. **62% of CoA↔permit links are inferred.** Any feature that depends on link accuracy (e.g., "this permit had a CoA approved") should expose the confidence score.
4. **Appeal outcomes are invisible.** Decision field shows the *original* committee decision; the appeal track changes status (CoA-12/CoA-13) but does not overwrite decision. Win/lose of an appeal is only inferable from downstream permit existence (see §2.5.h.6).
5. **Status-transition history is the missing data-layer prerequisite** to compute per-block average-time-in-phase. Currently `permit_history` is an empty table — schema exists, write path was never wired. Average-time math becomes possible 3–6 months after that wire-up lands.

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
