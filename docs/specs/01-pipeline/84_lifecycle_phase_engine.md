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

> **HISTORICAL FLAG (RESOLVED 2026-05-14 in Phase E.1):** This column was **passed into `classifyCoaPhase()` but never read** pre-E.1 — `input.status` was unreferenced in the function body. Every value below shows "NOT READ" in the "Current code maps to" column as a historical record of the pre-E.1 state. **As of Phase E.1 (2026-05-14, commit anchor TBD), the column IS READ** and maps to the "Definition / Spec-intended" target via Spec 42 §6.7 step 1 (9-rule precedence). The "Current code maps to" cells should now be interpreted as "Pre-E.1 mapping" — the active mapping is the spec column.
>
> **Post-E.1 mapping summary (matches spec column exactly):** intake (rows 70-71) → P1 (rule 8); review/scheduling (72-78) → P2 (rule 7); approved (79-81) → P3 (rule 5); refused (82) → P19 (rule 2); Final and Binding (83) → P4 (rule 3); post-decision appeal (84-87) → P3 (rule 4); terminal P19 (88-89) → P19 (rule 2); terminal P20 (90-91) → P20 (rule 1).

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
| 4 | `coa_applications.linked_permit_num` | `classifyCoaPhase()` | **The 84-W12 root cause — REMOVED 2026-05-14 in Phase E.1 commit `7003683`.** Pre-E.1 logic short-circuited when this column was non-null, returning `phase = null` regardless of decision/status. 99.4% of CoAs had this set, causing 32,865 of 33,052 CoAs to receive NULL `lifecycle_phase`. The fix removes Rule 0 entirely — a linked CoA has its own lifecycle (Spec 42 §6.6.X two-flow design: linked CoAs are valid Flow B applications with independent classifications, NOT terminal states). Consumer wiring (which activates the substrate-level fix in production) landed in Phase E.2 commit `[E.2-COMMIT]`. The `linked_permit_num` column itself is preserved — it now drives lead-identity continuity (lat/long/ward inheritance per Spec 42 §6.6.X) but no longer short-circuits the classifier. |
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
| BP1 | Permit Intake | `#DBEAFE` | `#1E40AF` | 📋 |
| BP2 | Plan Review | `#E0E7FF` | `#3730A3` | 🔍 |
| BP3 | Notice & Response | `#FEF3C7` | `#B45309` | ⚠️ |
| BP4 | Pre-Issuance | `#CCFBF1` | `#0F766E` | 📑 |
| BP5 | Construction | `#FFEDD5` | `#C2410C` | 🏗️ |
| BP6 | Revision | `#F3E8FF` | `#7E22CE` | 🔄 |
| BP7 | Closure | `#E2E8F0` | `#475569` | 🏁 |
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
- BP3 (Notice & Response) Blocks B3.A Notice Issued, B3.B Deficiency Confirmed, B3.C Application Paused → inherit ⚠️ Warning
- BP7 Block B7.A Wind-Down Cancellation → ⚠️ Warning amber
- BP7 Block B7.B Wind-Down Revocation → 🔴 Danger red
- BP7 Blocks B7.D–B7.H Terminal Dead (Refusal, Withdrawal, Revocation, Enforcement, Other) → 🔴 Danger red
- C4 CoA Closure → varies by stage (Withdrawn/Cancelled = warning amber; Closed/Complete = neutral slate)

**Group ID naming convention** — Group IDs use **two-letter prefixes** (`C#` for CoA, `BP#` for Building Permit, `I#` for Inspection) so they do **not collide** with single-letter phase codes (`P1–P20`, `P7a/b/c/d`). The Building Permit `BP` prefix specifically replaces an earlier `P` prefix that visually conflicted with phase codes.

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

**Columns:**
- **`seq`** (1–110) — a single integer that uniquely identifies every status entry in process order, top-to-bottom of the lifecycle (`seq=1` is the first CoA intake row, `seq=110` is the last closure row). This is the *simple* query key — filter or range-scan against a single integer column instead of compounding Group/Block/Stage/Row. **Process-order is now:** CoA Stream 1 (seq 1–22) → Permit pre-construction (seq 23–49) → Active Inspection state (seq 50–52) → Inspection Stream 3 (seq 53–87) → Revision (seq 88–90) → Closure (seq 91–110). Revision was moved AFTER Inspection because revisions empirically happen during construction, not as a parallel-to-pre-construction stage.
- **`#`** — the original source-table row number (1–53 for Permits per §2.5.a, 70–91 for CoA per §2.5.c, 100–134 for Inspections per §2.5.d). Preserved as the foreign-key cross-reference back to the raw-data inventory tables.
- **`Block`** — each Group now has its own dedicated Block range, sequential across the whole lifecycle: CoA Intake (B1), CoA Decision (B2), CoA Post-Decision (B3), CoA Closure (B4), Permit Intake (B5), Plan Review (B6), Notice & Response (B7), Pre-Issuance (B8), Construction (B9), Inspection Site Prep & Foundations (B10), Inspection Structural & MEP (B11), Inspection Enclosure & Finishes (B12), Inspection Final / Specialty (B13), Revision (B14), Closure (B15). Sub-letters (A, B, C, …) partition each Block.
- **`Bid Value`** (0–1, blank for non-bid stages) — a per-row importance score for the **non-construction stages** (CoA + Permit pre-construction + Revision + Closure). Used by the opportunity engine to weight the Bid signal: `1` = perfect bid moment (e.g., Application Acceptable at intake — fee paid, GC just starting to source trades), `0.9` = strong, `0.7–0.8` = moderate (approved/post-decision), `0.2–0.4` = weak (paused/notice/hold/deferred — uncertain outcome), `0.05–0.1` = very weak (active appeal — outcome may take 4 months to 3 years), `0` or blank = no bid value (refused / terminal / construction underway). Inspection-stream rows (100–134) and Active Inspection state rows (#31–33) have BLANK `Bid Value` because they fire `Work` / `Fallback` / `Bid: Last Minute` signals instead.
- **Per-trade signal columns (4 per trade, 38 trades = 152 columns):** `Bid: <trade>`, `Work: <trade>`, `Fallback: <trade>`, `Bid: Last Minute: <trade>`. See §2.5.h.9 for the activation rules.
- **`Rows`** — moved to the **last** column of the table. Source row count (live DB snapshot 2026-05-12).

| seq | # | Group | Group Label | Block | Block Label | Stage | Stage Label | Source | Status | Phase | Note | Description | Loop → | Bid Value | Bid: excavation | Work: excavation | Fallback: excavation | Bid: Last Minute: excavation | Bid: shoring | Work: shoring | Fallback: shoring | Bid: Last Minute: shoring | Bid: demolition | Work: demolition | Fallback: demolition | Bid: Last Minute: demolition | Bid: temporary-fencing | Work: temporary-fencing | Fallback: temporary-fencing | Bid: Last Minute: temporary-fencing | Bid: concrete | Work: concrete | Fallback: concrete | Bid: Last Minute: concrete | Bid: waterproofing | Work: waterproofing | Fallback: waterproofing | Bid: Last Minute: waterproofing | Bid: framing | Work: framing | Fallback: framing | Bid: Last Minute: framing | Bid: structural-steel | Work: structural-steel | Fallback: structural-steel | Bid: Last Minute: structural-steel | Bid: masonry | Work: masonry | Fallback: masonry | Bid: Last Minute: masonry | Bid: elevator | Work: elevator | Fallback: elevator | Bid: Last Minute: elevator | Bid: plumbing | Work: plumbing | Fallback: plumbing | Bid: Last Minute: plumbing | Bid: hvac | Work: hvac | Fallback: hvac | Bid: Last Minute: hvac | Bid: electrical | Work: electrical | Fallback: electrical | Bid: Last Minute: electrical | Bid: drain-plumbing | Work: drain-plumbing | Fallback: drain-plumbing | Bid: Last Minute: drain-plumbing | Bid: fire-protection | Work: fire-protection | Fallback: fire-protection | Bid: Last Minute: fire-protection | Bid: roofing | Work: roofing | Fallback: roofing | Bid: Last Minute: roofing | Bid: insulation | Work: insulation | Fallback: insulation | Bid: Last Minute: insulation | Bid: glazing | Work: glazing | Fallback: glazing | Bid: Last Minute: glazing | Bid: windows | Work: windows | Fallback: windows | Bid: Last Minute: windows | Bid: drywall | Work: drywall | Fallback: drywall | Bid: Last Minute: drywall | Bid: painting | Work: painting | Fallback: painting | Bid: Last Minute: painting | Bid: flooring | Work: flooring | Fallback: flooring | Bid: Last Minute: flooring | Bid: tiling | Work: tiling | Fallback: tiling | Bid: Last Minute: tiling | Bid: trim-work | Work: trim-work | Fallback: trim-work | Bid: Last Minute: trim-work | Bid: millwork-cabinetry | Work: millwork-cabinetry | Fallback: millwork-cabinetry | Bid: Last Minute: millwork-cabinetry | Bid: stone-countertops | Work: stone-countertops | Fallback: stone-countertops | Bid: Last Minute: stone-countertops | Bid: security | Work: security | Fallback: security | Bid: Last Minute: security | Bid: eavestrough-siding | Work: eavestrough-siding | Fallback: eavestrough-siding | Bid: Last Minute: eavestrough-siding | Bid: caulking | Work: caulking | Fallback: caulking | Bid: Last Minute: caulking | Bid: solar | Work: solar | Fallback: solar | Bid: Last Minute: solar | Bid: landscaping | Work: landscaping | Fallback: landscaping | Bid: Last Minute: landscaping | Bid: paving | Work: paving | Fallback: paving | Bid: Last Minute: paving | Bid: decking-fences | Work: decking-fences | Fallback: decking-fences | Bid: Last Minute: decking-fences | Bid: decks | Work: decks | Fallback: decks | Bid: Last Minute: decks | Bid: back-yard-fences | Work: back-yard-fences | Fallback: back-yard-fences | Bid: Last Minute: back-yard-fences | Bid: outdoor-patio | Work: outdoor-patio | Fallback: outdoor-patio | Bid: Last Minute: outdoor-patio | Bid: pool-installation | Work: pool-installation | Fallback: pool-installation | Bid: Last Minute: pool-installation | Bid: realtor | Work: realtor | Fallback: realtor | Bid: Last Minute: realtor | Group Color | Group Icon | Block Color | Block Icon | Stage Color | Stage Icon | Rows |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 70 | C1 | CoA Intake | B1.A | Applications | a | Received | coa.status | Application Received | P1 | Path A entry | File received at CoA intake desk; processing not yet begun | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 | 10 |
| 2 | 71 | C1 | CoA Intake | B1.A | Applications | b | Accepted | coa.status | Accepted | P1 | Fee paid | Intake fee paid; file accepted into CoA queue awaiting notice prep | — | 1 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 | 279 |
| 3 | 72 | C1 | CoA Intake | B1.B | Hearing Prep | a | Notice Prep | coa.status | Prepare Notice | P2 | Drafting | Staff drafting the notice of hearing (mailed to neighbors in 60m radius) | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 | 54 |
| 4 | 73 | C1 | CoA Intake | B1.B | Hearing Prep | b | Notice Prepared | coa.status | Notice Prepared | P2 | Ready to mail | Notice of hearing drafted; ready for mailing | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 | 74 |
| 5 | 74 | C1 | CoA Intake | B1.B | Hearing Prep | c | Tentatively Scheduled | coa.status | Tentatively Scheduled | P2 | Calendar | Hearing tentatively placed on committee calendar; date may shift | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 | 118 |
| 6 | 75 | C1 | CoA Intake | B1.B | Hearing Prep | d | Hearing Scheduled | coa.status | Hearing Scheduled | P2 | Confirmed | Confirmed hearing date; notice mailed (Spec §3.1 "Public Hearing Scheduled") | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 | 317 |
| 7 | 76 | C1 | CoA Intake | B1.B | Hearing Prep | e | Hearing Rescheduled | coa.status | Hearing Rescheduled | P2 | Moved | Originally-scheduled hearing moved to a new date | ↩ #75 | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CFFAFE | 📨 | #CFFAFE | 📨 | #CFFAFE | 📨 | 1 |
| 8 | 77 | C1 | CoA Intake | B1.C | Hearing Pause | a | Postponed | coa.status | Postponed | P2 | Procedural (weeks) | Hearing postponed BEFORE committee heard case — procedural (notice defect, applicant request) | ↩ #75 | 0.7 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CFFAFE | 📨 | #CFFAFE | 📨 | #FEF9C3 | ⏸️ | 292 |
| 9 | 78 | C1 | CoA Intake | B1.C | Hearing Pause | b | Deferred | coa.status | Deferred | P2 | Substantive (1–3 months) | Committee heard case but deferred decision — substantive (more info needed, neighbor concerns) | ↩ #75 | 0.2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #CFFAFE | 📨 | #CFFAFE | 📨 | #FEF9C3 | ⏸️ | 270 |
| 10 | 79 | C2 | CoA Decision | B2.A | Consent | a | Conditional Consent | coa.status | Conditional Consent | P3 | Severance/consent | Committee granted consent with conditions (severance/consent applications) | — | 0.8 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #DCFCE7 | ✅ | 326 |
| 11 | 80 | C2 | CoA Decision | B2.B | Approved | a | Approved | coa.status | Approved | P3 | Variance OK | Committee approved the variance application as-filed | — | 0.8 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #DCFCE7 | ✅ | 246 |
| 12 | 81 | C2 | CoA Decision | B2.B | Approved | b | Approved + Conditions | coa.status | Approved with Conditions | P3 | Variance OK + conditions | Committee approved variance subject to specific conditions | — | 0.8 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #DCFCE7 | ✅ | 554 |
| 13 | 82 | C2 | CoA Decision | B2.C | Refused / Binding | a | Refused | coa.status | Refused | P19 | Denied | Committee denied the variance application | — | 0 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #FECACA | ❌ | 59 |
| 14 | 83 | C2 | CoA Decision | B2.C | Refused / Binding | b | Final & Binding | coa.status | Final and Binding | P4 | Appeal cleared | Decision past 20-day appeal window; legally binding | (terminal) | 0.8 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #EDE9FE | ⚖️ | #EDE9FE | ⚖️ | #DCFCE7 | ✅ | 1 |
| 15 | 84 | C3 | CoA Post-Decision | B3.A | Appeal Window | a | Awaiting Expiry | coa.status | Await Expiry Date | P3 | 20-day window | Decision rendered; waiting for 20-day Toronto appeal window | — | 0.8 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | 24 |
| 16 | 85 | C3 | CoA Post-Decision | B3.B | Appeal Initiated | a | Appealed | coa.status | Appealed | P3 | Transient | Generic appeal flag; channel unspecified or routing pending | — | 0.2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | 1 |
| 17 | 86 | C3 | CoA Post-Decision | B3.C | Active Appeals | a | TLAB Appeal | coa.status | TLAB Appeal | P3 | 4–9 months | Decision under appeal at Toronto Local Appeal Body | — | 0.1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | 347 |
| 18 | 87 | C3 | CoA Post-Decision | B3.C | Active Appeals | b | OMB Appeal | coa.status | OMB Appeal | P3 | 1–3 years legacy | Decision under appeal at Ontario Municipal Board (legacy, replaced by TLAB) | — | 0.05 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | #FEF9C3 | ⏰ | 218 |
| 19 | 88 | C4 | CoA Closure | B4.A | Terminal | a | Withdrawn | coa.status | Application Withdrawn | P19 | Pre-decision | Applicant withdrew the application before decision | (terminal) | 0 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | 904 |
| 20 | 89 | C4 | CoA Closure | B4.A | Terminal | b | Cancelled | coa.status | Cancelled | P19 | Admin | Application cancelled (applicant request or administrative) | (terminal) | 0 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | 1 |
| 21 | 90 | C4 | CoA Closure | B4.A | Terminal | c | Complete | coa.status | Complete | P20 | Done | All required follow-up actions done; file complete | (terminal) | 0.5 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | 8 |
| 22 | 91 | C4 | CoA Closure | B4.A | Terminal | d | Closed | coa.status | Closed | P20 | 87.6% land here | File administratively closed — default CoA terminal state | (terminal) | 0.5 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | 28,948 |
| 23 | 1 | BP1 | Permit Intake | B5.A | Initial Submission | a | Request Received | permits.status | Request Received | P3 | `INTAKE_P3_SET` | Sub-folder request opened against existing permit (revision/extension) | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 | 1 |
| 24 | 2 | BP1 | Permit Intake | B5.A | Initial Submission | b | Application Received | permits.status | Application Received | P3 | `INTAKE_P3_SET` | City def: "The Application has been received but intake has not been accepted or processed" | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 | 218 |
| 25 | 3 | BP1 | Permit Intake | B5.B | Submission Accepted | a | Application Acceptable | permits.status | Application Acceptable | P3 | `INTAKE_P3_SET` | City def: "Submission requirement met; intake not yet accepted because initial fee outstanding" | — | 1 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 | 465 |
| 26 | 4 | BP1 | Permit Intake | B5.C | File Active | a | Open | permits.status | Open | P3 | `INTAKE_P3_SET` | Generic IBMS state — file open in system | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 | 519 |
| 27 | 5 | BP1 | Permit Intake | B5.C | File Active | b | Active | permits.status | Active | P3 | `INTAKE_P3_SET` | Generic IBMS state — file being actively worked | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #DBEAFE | 📋 | #DBEAFE | 📋 | #DBEAFE | 📋 | 24 |
| 28 | 6 | BP2 | Plan Review | B6.A | Review Queued | a | Not Started | permits.status | Not Started | P7d | **CODE DRIFT** | City def: "Application accepted but review has not started" — pre-review (99.6% pre-issuance) | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E5E7EB | 🐛 | 1,063 |
| 29 | 7 | BP2 | Plan Review | B6.A | Review Queued | b | Not Started - Express | permits.status | Not Started - Express | P7d | **CODE DRIFT** | Same as #6 but for Express stream (fast-track simple permits) | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E5E7EB | 🐛 | 92 |
| 30 | 8 | BP2 | Plan Review | B6.B | Review In Progress | a | Under Review | permits.status | Under Review | P4 | `REVIEW_P4_SET` | City def: "Application accepted and Review started but not completed" | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E0E7FF | 🔍 | 2,100 |
| 31 | 9 | BP2 | Plan Review | B6.B | Review In Progress | b | Examination | permits.status | Examination | P4 | `REVIEW_P4_SET` | Internal IBMS synonym for active Under Review | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E0E7FF | 🔍 | 30 |
| 32 | 10 | BP2 | Plan Review | B6.C | Review Complete | a | Plan Review Complete | permits.status | Plan Review Complete | P3 | **CODE DRIFT** | All five discipline reviews finished; moving to Pre-Issuance (53% pre-/47% post-issuance, recurs on revisions) | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E5E7EB | 🐛 | 57 |
| 33 | 11 | BP2 | Plan Review | B6.C | Review Complete | b | Consultation Completed | permits.status | Consultation Completed | P4 | `REVIEW_P4_SET` | Pre-application consultation closed (Tier 1c stream) | — | 0.9 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #E0E7FF | 🔍 | #E0E7FF | 🔍 | #E0E7FF | 🔍 | 2 |
| 34 | 12 | BP3 | Notice & Response | B7.A | Notice Issued | a | Examiner's Notice Sent | permits.status | Examiner's Notice Sent | P4 | `REVIEW_P4_SET` | City def: "Application accepted, Review resulted in a Notice that has been sent" | ↩ via #17 → #8 (re-queue) | 0.2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | 2,757 |
| 35 | 13 | BP3 | Notice & Response | B7.A | Notice Issued | b | Notice Sent | permits.status | Notice Sent | UNMAPPED→null | Not in any code set; falls through | Operationally synonymous with #12 (Examiner's Notice Sent) but counted by `unclassified_count` CQA gate | ↩ via #17 → #8 (re-queue) | 0.2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | 1 |
| 36 | 14 | BP3 | Notice & Response | B7.B | Deficiency Confirmed | a | Deficiency Notice | permits.status | Deficiency Notice Issued | P5 | `HOLD_P5_SET` | Formal deficiency notice — escalation when Examiner's Notice unaddressed | ↩ via #17 → #8 (re-queue) | 0.2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | 117 |
| 37 | 15 | BP3 | Notice & Response | B7.C | Application Paused | a | On Hold | permits.status | Application On Hold | P5 | `HOLD_P5_SET` | City def: "Application received but on hold because of missing information" | ↩ #17 (when applicant responds) or → #51 Cancelled (if abandoned) | 0.2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF9C3 | ⏸️ | 1,655 |
| 38 | 16 | BP3 | Notice & Response | B7.C | Application Paused | b | On Hold (variant) | permits.status | Application on Hold | P5 | `HOLD_P5_SET` | Case variant of #15 (both members of set) | ↩ #17 (when applicant responds) or → #51 Cancelled | 0.2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF9C3 | ⏸️ | 4 |
| 39 | 17 | BP3 | Notice & Response | B7.D | Response Received | a | Response Received | permits.status | Response Received | P5 | `HOLD_P5_SET` | City def: "Response to a Notice submitted to Toronto Building" | ↩ #8 Under Review (re-queue) | 0.4 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | 436 |
| 40 | 18 | BP3 | Notice & Response | B7.E | Cross-Folder Block | a | Parent Folder Pending | permits.status | Pending Parent Folder Review | P5 | `HOLD_P5_SET` | Sub-permit (HVA/PLB/etc.) blocked waiting on parent BLD/CMB | ↩ #8 (when parent advances) | 0.2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | #FEF3C7 | ⚠️ | 33 |
| 41 | 19 | BP4 | Pre-Issuance | B8.A | Permit Approved | a | Approved | permits.status | Approved | P6 | `READY_P6_SET` (distinct from CoA "Approved") | Internal technical-approval marker — transitional before Ready for Issuance | — | 0.8 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 | 23 |
| 42 | 20 | BP4 | Pre-Issuance | B8.B | Ready for Issuance | a | Ready for Issuance | permits.status | Ready for Issuance | P6 | `READY_P6_SET` | City def: "Review completed, Permit ready for issuance at any time" (87% pre-/13% post-issuance) | — | 0.8 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 | 233 |
| 43 | 21 | BP4 | Pre-Issuance | B8.C | Outstanding Conditions | a | Forwarded for Issuance | permits.status | Forwarded for Issuance | P6 | `READY_P6_SET` | Queued to issuance desk for fee collection / final paperwork | — | 0.7 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 | 3 |
| 44 | 22 | BP4 | Pre-Issuance | B8.C | Outstanding Conditions | b | Issuance Pending | permits.status | Issuance Pending | P6 | `READY_P6_SET` | City def: "Review completed, however other approvals/fees outstanding" — dominant pre-issuance state | — | 0.7 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 | 2,974 |
| 45 | 23 | BP4 | Pre-Issuance | B8.C | Outstanding Conditions | c | Agreement in Progress | permits.status | Agreement in Progress | P6 | `READY_P6_SET` | Section 37 / Site Plan / Development Agreement being executed | — | 0.7 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 | 10 |
| 46 | 24 | BP4 | Pre-Issuance | B8.D | Cross-Domain Issuance | a | Licence Issued | permits.status | Licence Issued | P6 | `READY_P6_SET` (cross-feed noise) | Sign/hoarding license sharing IBMS feed — not a building-permit phase | — | 0.7 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #CCFBF1 | 📑 | #CCFBF1 | 📑 | #CCFBF1 | 📑 | 4 |
| 47 | 25 | BP5 | Construction | B9.A | Newly Issued | a | Permit Issued | permits.status | Permit Issued | P7a/P7b/P7c (or P9-P17) | Time-bucketed | City def: "The Permit has been issued"; time-bucketed by `NOW() - issued_date` | → #31 Inspection (when inspections begin) | 0.6 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | 52,403 |
| 48 | 26 | BP5 | Construction | B9.B | No Construction Yet | a | Work Not Started | permits.status | Work Not Started | P7d | `NOT_STARTED_P7D_SET` (100% post-issuance) | City def: "An Inspection was conducted and construction has not taken place" — distinct from #6 | — | 0.6 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | 1,093 |
| 49 | 27 | BP5 | Construction | B9.B | No Construction Yet | b | Extension Granted | permits.status | Extension Granted | P7d | `NOT_STARTED_P7D_SET` (100% post-issuance) | Permit expiry extended; clock reset | — | 0.6 | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | 3 |
| 50 | 31 | BP5 | Construction | B9.C | Active Inspection (status) | a | Inspection | permits.status | Inspection | P9-P17 (via stages 100-134) or P18 | City def: "Permit issued and under active inspection" | Phase mapped by latest passed inspection stage | → stages #100-134 |  |  |  | ✓ | ✓ |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ | ✓ |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  | ✓ |  | ✓ |  | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | 138,546 |
| 51 | 32 | BP5 | Construction | B9.C | Active Inspection (status) | b | Forward to Inspector | permits.status | Forward to Inspector | P18 | `INSPECTION_PIPELINE_P18_SET` — §3 calls P18 "Project Closed" (drift) | File handed off to inspector; awaiting visit | → #31 Inspection |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | 1 |
| 52 | 33 | BP5 | Construction | B9.C | Active Inspection (status) | c | Rescheduled | permits.status | Rescheduled | P18 | `INSPECTION_PIPELINE_P18_SET` | Scheduled inspection rescheduled | → #31 Inspection |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | #FFEDD5 | 🏗️ | 1 |
| 53 | 100 | I1 | Site Prep & Foundations | B10.A | Site Prep | a | Site Grading | insp.stage | Site Grading Inspection | P9 | matches `site grading` | First site-prep inspection (grading work) | ↩ same stage if `status='Not Passed'` (re-inspection) |  |  | ✓ |  |  |  |  |  | ✓ |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | 4,921 |
| 54 | 101 | I1 | Site Prep & Foundations | B10.A | Site Prep | b | Excavation/Shoring | insp.stage | Excavation/Shoring | P9 | matches `excavation` | Excavation and shoring inspection | ↩ same stage if Not Passed |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | 6,735 |
| 55 | 102 | I1 | Site Prep & Foundations | B10.A | Site Prep | c | Demolition | insp.stage | Demolition | P9 | matches `demolition` | Demolition inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | 1,012 |
| 56 | 103 | I1 | Site Prep & Foundations | B10.B | Foundations | a | Footings/Foundations | insp.stage | Footings/Foundations | P10 | matches `footings` | Footings and foundations inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | 7,600 |
| 57 | 104 | I1 | Site Prep & Foundations | B10.B | Foundations | b | Foundation | insp.stage | Foundation | P10 | matches `=== 'foundation'` (exact equality) | Foundation inspection (low-count variant) | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | #FEF3C7 | 🪨 | 2 |
| 58 | 105 | I2 | Structural & MEP | B11.A | Framing | a | Structural Framing | insp.stage | Structural Framing | P11 | matches `structural framing` | Structural framing inspection — house is now a "box" | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 | 9,592 |
| 59 | 106 | I2 | Structural & MEP | B11.B | MEP Rough-in | a | HVAC Rough-in | insp.stage | HVAC/Extraction Rough-in | P12 | matches `hvac` | HVAC rough-in inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 | 883 |
| 60 | 107 | I2 | Structural & MEP | B11.B | MEP Rough-in | b | Water Service | insp.stage | Water Service | P12 | matches `water service` | Water service inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 | 888 |
| 61 | 108 | I2 | Structural & MEP | B11.B | MEP Rough-in | c | Water Distribution | insp.stage | Water Distribution | P12 | matches `water distribution` | Water distribution inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 | 911 |
| 62 | 109 | I2 | Structural & MEP | B11.B | MEP Rough-in | d | Drain/Waste/Vents | insp.stage | Drain/Waste/Vents | P12 | matches `drain` | Drainage and venting inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 | 910 |
| 63 | 110 | I2 | Structural & MEP | B11.B | MEP Rough-in | e | Sewers/Drains/Sewage | insp.stage | Sewers/Drains/Sewage System | P12 | matches `drain` first (same P12 output as `sewers`) | Sewer/drainage system inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 | 890 |
| 64 | 111 | I2 | Structural & MEP | B11.B | MEP Rough-in | f | Fire Service | insp.stage | Fire Service | P12 | matches `fire service` | Fire service piping inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 | 889 |
| 65 | 112 | I2 | Structural & MEP | B11.B | MEP Rough-in | g | Fire Access Routes | insp.stage | Fire Access Routes | P12 | matches `fire access` | Fire access route inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 | 2,277 |
| 66 | 113 | I2 | Structural & MEP | B11.B | MEP Rough-in | h | Fire Protection Systems | insp.stage | Fire Protection Systems | P12 | matches `fire protection` | Fire protection system inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #E0F2FE | 🔧 | #E0F2FE | 🔧 | #E0F2FE | 🔧 | 5,969 |
| 67 | 114 | I3 | Enclosure & Finishes | B12.A | Insulation | a | Insulation/Vapour Barrier | insp.stage | Insulation/Vapour Barrier | P13 | matches `insulation` | Insulation and vapour barrier inspection — house is sealed | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | 8,775 |
| 68 | 115 | I3 | Enclosure & Finishes | B12.A | Insulation | b | Insulation | insp.stage | Insulation | P13 | matches `insulation` | Insulation inspection (low-count variant) | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | 1 |
| 69 | 116 | I3 | Enclosure & Finishes | B12.A | Insulation | c | Insulation & AirBarrier | insp.stage | Insulation & Vapour/AirBarrier Passed on | P13 | matches `insulation` | Insulation/air barrier inspection (data-quality variant) | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | 1 |
| 70 | 117 | I3 | Enclosure & Finishes | B12.B | Fire Sep | a | Fire Separations | insp.stage | Fire Separations | P14 | matches `fire separations` | Fire separations inspection — drywall anchor | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | 7,035 |
| 71 | 118 | I3 | Enclosure & Finishes | B12.C | Interior Finals | a | Interior Final | insp.stage | Interior Final Inspection | P15 | matches `interior final` | Interior finals inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | 6,462 |
| 72 | 119 | I3 | Enclosure & Finishes | B12.C | Interior Finals | b | Plumbing Final | insp.stage | Plumbing Final | P15 | matches `plumbing final` | Plumbing final inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | 914 |
| 73 | 120 | I3 | Enclosure & Finishes | B12.C | Interior Finals | c | HVAC Final | insp.stage | HVAC Final | P15 | matches `hvac final` | HVAC final inspection | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | 883 |
| 74 | 121 | I3 | Enclosure & Finishes | B12.D | Exterior Finals | a | Exterior Final | insp.stage | Exterior Final Inspection | P16 | matches `exterior final` | Exterior finals inspection (cladding, grading) | ↩ same stage if Not Passed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  | ✓ |  | ✓ |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  | ✓ |  |  | ✓ | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | #D1FAE5 | 🎨 | 7,432 |
| 75 | 122 | I4 | Final / Specialty | B13.A | Project Final | a | Occupancy | insp.stage | Occupancy | P17 | matches `occupancy` | Occupancy granted | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  | ✓ | ✓ |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #DCFCE7 | ✅ | 8,965 |
| 76 | 123 | I4 | Final / Specialty | B13.A | Project Final | b | Final Inspection | insp.stage | Final Inspection | P17 | matches `final inspection` | Project final inspection | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #DCFCE7 | ✅ | 1,060 |
| 77 | 124 | I4 | Final / Specialty | B13.B | Specialty | a | Pool Suction/Gravity | insp.stage | Pool Suction/Gravity Outlets | UNMAPPED→P17 fallback | No substring match | Pool inspection — specialty, no §3 phase target | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 2,232 |
| 78 | 125 | I4 | Final / Specialty | B13.B | Specialty | b | Pool Circulation | insp.stage | Pool Circulation System | UNMAPPED→P17 fallback | No substring match | Pool inspection — specialty | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 2,232 |
| 79 | 126 | I4 | Final / Specialty | B13.B | Specialty | c | Repair/Retrofit | insp.stage | Repair/Retrofit | UNMAPPED→P17 fallback | No substring match | Repair / retrofit inspection — specialty | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 1,132 |
| 80 | 127 | I4 | Final / Specialty | B13.B | Specialty | d | Change of Use | insp.stage | Change of Use | UNMAPPED→P17 fallback | No substring match | Change-of-use inspection — specialty | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 1,017 |
| 81 | 128 | I4 | Final / Specialty | B13.B | Specialty | e | System | insp.stage | System | UNMAPPED→P17 fallback | No substring match | Generic "System" inspection — specialty | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 1,010 |
| 82 | 129 | I4 | Final / Specialty | B13.B | Specialty | f | Security Device | insp.stage | Security Device | UNMAPPED→P17 fallback | No substring match | Security device inspection — specialty | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 1,006 |
| 83 | 130 | I4 | Final / Specialty | B13.B | Specialty | g | Tent/Portable Classroom | insp.stage | Tent/Portable Classroom | UNMAPPED→P17 fallback | No substring match | Tent / portable classroom inspection — specialty | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 1,005 |
| 84 | 131 | I4 | Final / Specialty | B13.C | Data-Quality Outliers | a | Final Interior | insp.stage | Final Interior | UNMAPPED→P17 fallback | Word-order issue — likely meant `interior final` (P15) | Data-quality outlier (single row) | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 1 |
| 85 | 132 | I4 | Final / Specialty | B13.C | Data-Quality Outliers | b | HVAC Permit? | insp.stage | HVAC Permit? | P12 | Matches `hvac`; `?` flags data-quality | Data-quality outlier (single row, source-side question mark) | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 1 |
| 86 | 133 | I4 | Final / Specialty | B13.C | Data-Quality Outliers | c | Survey | insp.stage | Survey | UNMAPPED→P17 fallback | Likely admin survey, not a construction phase | Data-quality outlier (single row) | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 1 |
| 87 | 134 | I4 | Final / Specialty | B13.C | Data-Quality Outliers | d | Survey Submitted? | insp.stage | Survey Submitted? | UNMAPPED→P17 fallback | Same as #133 | Data-quality outlier (single row, source-side question mark) | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #FEF3C7 | 🏆 | #FEF3C7 | 🏆 | #E5E7EB | 🐛 | 1 |
| 88 | 28 | BP6 | Revision | B14.A | Revision | a | Revision Issued | permits.status | Revision Issued | P8 | `REVISION_P8_SET` — §3 calls P8 "Mobilization" (drift) | City def: "Notice of Change submitted to CBO and revision has been accepted" | ↩ #8 (revision review) | 0.3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #F3E8FF | 🔄 | #F3E8FF | 🔄 | #F3E8FF | 🔄 | 20,698 |
| 89 | 29 | BP6 | Revision | B14.A | Revision | b | Revised | permits.status | Revised | P8 | `REVISION_P8_SET` | City def: "Notice of Change has been submitted to the Chief Building Official" | ↩ #8 (revision review) | 0.3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #F3E8FF | 🔄 | #F3E8FF | 🔄 | #F3E8FF | 🔄 | 27 |
| 90 | 30 | BP6 | Revision | B14.A | Revision | c | Order Complied | permits.status | Order Complied | P8 | `REVISION_P8_SET` | Compliance order satisfied | → #31 Inspection | 0.3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ✓ |  |  |  | #F3E8FF | 🔄 | #F3E8FF | 🔄 | #F3E8FF | 🔄 | 22 |
| 91 | 34 | BP7 | Closure | B15.A | Wind-Down Cancellation | a | Pending Closed | permits.status | Pending Closed | P19 | `WINDDOWN_P19_SET` — §3 calls P19 "Cancelled" (drift) | File flagged for closure; final paperwork pending | → #39 Closed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FEF3C7 | 📅 | #FEF3C7 | 📅 | 6,699 |
| 92 | 35 | BP7 | Closure | B15.A | Wind-Down Cancellation | b | Pending Cancellation | permits.status | Pending Cancellation | P19 | `WINDDOWN_P19_SET` | City def: "Application dormant >5 months; owner/applicant notified of cancellation" | → #51 Cancelled (if proceeds) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FEF3C7 | 📅 | #FEF3C7 | 📅 | 488 |
| 93 | 38 | BP7 | Closure | B15.A | Wind-Down Cancellation | c | Inspection Request to Cancel | permits.status | Inspection Request to Cancel | P19 | `WINDDOWN_P19_SET` | Pending cancellation of a scheduled inspection request | → #39 Closed |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FEF3C7 | 📅 | #FEF3C7 | 📅 | 1 |
| 94 | 36 | BP7 | Closure | B15.B | Wind-Down Revocation | a | Revocation Pending | permits.status | Revocation Pending | P19 | `WINDDOWN_P19_SET` | City has begun revocation proceedings | → #49 Permit Revoked |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FECACA | 🚫 | #FECACA | 🚫 | 2,335 |
| 95 | 37 | BP7 | Closure | B15.B | Wind-Down Revocation | b | Revocation Notice Sent | permits.status | Revocation Notice Sent | P19 | `WINDDOWN_P19_SET` | Formal revocation notice issued to applicant | → #49 Permit Revoked |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FECACA | 🚫 | #FECACA | 🚫 | 1 |
| 96 | 39 | BP7 | Closure | B15.C | Closed | a | Closed | permits.status | Closed | P20 | `TERMINAL_P20_SET` — §3 calls P20 "Revoked" (drift) | File administratively closed (default terminal state) | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | 10,695 |
| 97 | 40 | BP7 | Closure | B15.C | Closed | b | File Closed | permits.status | File Closed | P20 | `TERMINAL_P20_SET` | Variant of Closed | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | 6 |
| 98 | 41 | BP7 | Closure | B15.C | Closed | c | Permit Issued/Close File | permits.status | Permit Issued/Close File | P20 | `TERMINAL_P20_SET` | Issued and immediately closed — trivial jobs | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | #E2E8F0 | 🏁 | 2 |
| 99 | 42 | BP7 | Closure | B15.D | Dead — Refusal | a | Refusal Notice | permits.status | Refusal Notice | null (DEAD) | `DEAD_STATUS_SET` | City def: "Application Accepted; Review resulted in Refused Notice sent to applicant" | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FECACA | ❌ | #FECACA | ❌ | 958 |
| 100 | 52 | BP7 | Closure | B15.D | Dead — Refusal | b | Refused | permits.status | Refused | null (DEAD) | `DEAD_STATUS_SET` | Variant of #42 | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FECACA | ❌ | #FECACA | ❌ | 1 |
| 101 | 43 | BP7 | Closure | B15.E | Dead — Withdrawal | a | Abandoned | permits.status | Abandoned | null (DEAD) | `DEAD_STATUS_SET` | File abandoned by applicant | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ | 122 |
| 102 | 44 | BP7 | Closure | B15.E | Dead — Withdrawal | b | Application Withdrawn | permits.status | Application Withdrawn | null (DEAD) | `DEAD_STATUS_SET` | Applicant explicitly withdrew | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ | 49 |
| 103 | 47 | BP7 | Closure | B15.E | Dead — Withdrawal | c | Not Accepted | permits.status | Not Accepted | null (DEAD) | `DEAD_STATUS_SET` | Application not accepted at intake | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ | 9 |
| 104 | 49 | BP7 | Closure | B15.F | Dead — Revocation | a | Permit Revoked | permits.status | Permit Revoked | null (DEAD) | `DEAD_STATUS_SET` | City def: "The Permit has been revoked" | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FECACA | 🚫 | #FECACA | 🚫 | 2 |
| 105 | 50 | BP7 | Closure | B15.F | Dead — Revocation | b | Revoked | permits.status | Revoked | null (DEAD) | `DEAD_STATUS_SET` — §3 says P20 should fire here; doesn't | Variant of #49 | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FECACA | 🚫 | #FECACA | 🚫 | 2 |
| 106 | 45 | BP7 | Closure | B15.G | Dead — Enforcement | a | Work Suspended | permits.status | Work Suspended | null (DEAD) | `DEAD_STATUS_SET` | Construction suspended by city order | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FECACA | ⛔ | #FECACA | ⛔ | 18 |
| 107 | 46 | BP7 | Closure | B15.G | Dead — Enforcement | b | VIOLATION | permits.status | VIOLATION | null (DEAD) | `DEAD_STATUS_SET` | City def: "There is an Inspection Order against this Permit" | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FECACA | ⛔ | #FECACA | ⛔ | 16 |
| 108 | 48 | BP7 | Closure | B15.G | Dead — Enforcement | c | Order Issued | permits.status | Order Issued | null (DEAD) | `DEAD_STATUS_SET` | Compliance order against permit | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FECACA | ⛔ | #FECACA | ⛔ | 7 |
| 109 | 51 | BP7 | Closure | B15.H | Dead — Other | a | Cancelled | permits.status | Cancelled | null (DEAD) | `DEAD_STATUS_SET` — §3 says P19 should fire here; doesn't | Application cancelled | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ | 1 |
| 110 | 53 | BP7 | Closure | B15.H | Dead — Other | b | Follow-up Required | permits.status | Follow-up Required | null (DEAD) | `DEAD_STATUS_SET` | Follow-up flag on file | (terminal) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | #E2E8F0 | 🏁 | #FEE2E2 | 🗑️ | #FEE2E2 | 🗑️ | 1 |

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

#### §2.5.h.9 — Trade Mapping Reference (Bid + Work positions in the Lifecycle Hierarchy)

Every trade has **four activation signals** mapped against the Universal Stream rows, plus the **`Bid Value`** column (§2.5.h.2) provides per-row weighting for the Bid signal:

- **Bid window** — every row where a trade could plausibly start contacting the customer. The window is wide and `Bid: <trade>` is a binary checkmark; the row's importance within the window is captured by the per-row **`Bid Value`** (0–1) in the Universal Stream. A row with `Bid Value = 1` (e.g., Application Acceptable) is a stronger bid moment than a row with `Bid Value = 0.6` (e.g., Permit Issued — GC is mobilizing). Rows with `Bid Value ≤ 0.2` (Notice/Hold/Deferred/Appealed) have NO bid checkmark — the opportunity engine ignores them entirely because the project may not happen.
- **Work window** — the inspection-stream row(s) that signal the trade's work is on-site (leading signal — about to begin or in progress). Trade-specific by design: plumbing's Drain/Waste/Vents (#109) fires for plumbing only; landscaping's Occupancy (#122) fires for landscaping only.
- **Fallback window** — fires on row **#31 (BP5.B5.D Active Inspection — status)**, the permit-side state where the city says "Inspection" but no specific stage has been recorded. When AIC has no inspection-stage match, every trade falls back to row 31 so that a missing/sparse inspection chain still surfaces the lead. The fallback applies universally to all 38 trades — the Universal Stream §2.5.h.2 shows this with a `Fallback: <trade>` column for each.
- **Bid: Last Minute window** — a **single row per trade** marking the lifecycle state *immediately preceding* the trade's earliest Work row in process order. This is the imminent-bid signal: by the time a permit reaches this row, the trade's work is the very next thing to happen. It is the latest possible moment the GC may still be filling the slot — useful for last-minute rescue bids when the GC's incumbent trade has dropped out. Rule: for trades whose earliest work is in the inspection stream (rows 100–134), Last Minute = `earliest_work − 1` (the previous inspection row); for trades whose earliest work is the very first inspection row (#100 Site Grading), Last Minute = #31 (Active Inspection state — permit just entered inspection); for realtor (work=#39 Permit Closed) Last Minute = #122 (Occupancy reached → listing imminent — special-cased because #39 in process order is preceded by closure rows that carry no listing signal).

##### Bid window — uniform for 37 of 38 trades

For every trade except realtor, the bid window is the **same 33 rows**:

| Source | Included rows | Excluded rows | Why excluded |
|---|---|---|---|
| **CoA** (Stream 1) | 13 rows: 70, 71, 72, 73, 74, 75, 76, 77, 79, 80, 81, 83, 84 | 78, 82, 85, 86, 87 | Deferred (78) is substantive 1–3 month pause (`Bid Value = 0.2`); Refused (82); generic Appealed (85), TLAB (86), OMB (87) — appeals run 4 months–3 years and are an unstable bid period |
| **CoA Terminal** | — | 88, 89, 90, 91 | Withdrawn / Cancelled / Complete / Closed — no permit will follow |
| **Permit Intake / Plan-Review / Pre-Issuance / Construction** | 20 rows: #1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 19, 20, 21, 22, 23, 24, 25, 26, 27 | 12, 13, 14, 15, 16, 17, 18 | All BP3 Notice & Response rows excluded (`Bid Value = 0.2–0.4`): Examiner's Notice / Notice Sent / Deficiency / On Hold / Response Received / Parent Folder Pending — uncertainty in these states applies equally to bidding |
| **Permit Active Inspection** | — | 31, 32, 33 | Construction underway — GC has trades on-site already (fallback fires here, not bid) |
| **Permit Revision** | — | 28, 29, 30 | Revisions happen mid-construction — bidding window has closed |
| **Permit Closure / Dead** | — | 34 → 53 | Wind-down / Cancelled / Revoked / Dead — bidding is moot |
| **Inspection** (Stream 3) | — | 100 → 134 | Trade-specific work-stream — fires `Work` not `Bid` |

The `Bid Value` column (§2.5.h.2) gives the per-row weighting within this window — `1` for Application Acceptable (perfect bid moment), down to `0.6–0.8` for permit-issued/post-CoA-approved, with `0` for refused/terminal. Trades with later-stream work (landscaping, painting, etc.) **deliberately do not** extend their bid window into the inspection stream. The reasoning: by the time a permit reaches its first inspection (row 31 onwards), the GC is on-site and trade hiring decisions for the project are mostly locked in. Late-discovery rescue bids (e.g., GC's flooring trade dropped out at drywall) are scored by **opportunity_score's urgency multiplier**, not by adding bid checkmarks here.

##### Bid window — realtor exception (74 rows)

Realtor bids on *listing potential*, not on a construction contract. Every active row in a permit's life is a positive listing signal — including the entire inspection stream (construction progress = property nearing market). Realtor's bid window therefore widens to:

- Same 13 CoA rows + 20 Permit rows as above (33 rows)
- All Permit Revision rows #28 → #30 (3 rows)
- All Active Inspection state rows #31 → #33 (3 rows)
- All Inspection stage rows #100 → #134 (35 rows)

Exclusions identical: Notice & Response (12-18) / Deferred (78) / Refused / Appeals / Terminal / Closure / Dead. Total: 74 bid-eligible rows for realtor.

##### Work window — per trade

Trade-specific Stage targets mapped against the 35 AIC inspection stages (§2.5.d):

| Trade slug | Work row(s) | Inspection Stage(s) | Phase | Last Minute row | Last Minute label | Notes |
|---|---|---|---|---|---|---|
| **— Site Prep & Foundation —** |||||||
| excavation | 100, 101 | Site Grading + Excavation/Shoring | P9 | 31 | Active Inspection (status) | |
| shoring | 101 | Excavation/Shoring | P9 | 100 | Site Grading Inspection | |
| demolition | 102 | Demolition | P9 | 101 | Excavation/Shoring | |
| temporary-fencing | 100 | Site Grading Inspection | P9 | 31 | Active Inspection (status) | Installed before site grading |
| concrete | 103, 104 | Footings/Foundations + Foundation | P10 | 102 | Demolition | |
| waterproofing | 103, 104 | Footings/Foundations + Foundation | P10 | 102 | Demolition | Backfill membrane applied on footings |
| **— Structural —** |||||||
| framing | 105 | Structural Framing | P11 | 104 | Foundation | |
| structural-steel | 105 | Structural Framing | P11 | 104 | Foundation | |
| masonry | 105 | Structural Framing | P11 | 104 | Foundation | Concurrent with framing |
| elevator | 105 | Structural Framing | P11 | 104 | Foundation | Shaft framing |
| **— MEP (Mechanical / Electrical / Plumbing) —** |||||||
| plumbing | 107, 108, 109, 110 | Water Service + Water Distribution + DWV + Sewers/Drains | P12 | 106 | HVAC/Extraction Rough-in | |
| hvac | 106, 120 | HVAC Rough-in + HVAC Final | P12 / P15 | 105 | Structural Framing | |
| electrical | 106 | HVAC/Extraction Rough-in (mech rough-in proxy) | P12 | 105 | Structural Framing | No dedicated electrical inspection stage in AIC |
| drain-plumbing | 109, 110 | Drain/Waste/Vents + Sewers/Drains | P12 | 108 | Water Distribution | |
| fire-protection | 111, 112, 113 | Fire Service + Fire Access Routes + Fire Protection Systems | P12 | 110 | Sewers/Drains/Sewage System | |
| **— Envelope & Insulation —** |||||||
| roofing | 121 | Exterior Final Inspection | P16 | 120 | HVAC Final | |
| insulation | 114 | Insulation/Vapour Barrier | P13 | 113 | Fire Protection Systems | |
| glazing | 121 | Exterior Final Inspection | P16 | 120 | HVAC Final | |
| windows | 121 | Exterior Final Inspection | P16 | 120 | HVAC Final | |
| **— Interior Finishes —** |||||||
| drywall | 117, 118 | Fire Separations + Interior Final | P14 / P15 | 114 | Insulation/Vapour Barrier | LM moved from #116 (1-row data-quality variant) to #114 (8,775 rows) per §8.5 QUESTIONABLE FIX (R2 review 2026-05-13) |
| painting | 118 | Interior Final Inspection | P15 | 117 | Fire Separations | |
| flooring | 118 | Interior Final Inspection | P15 | 117 | Fire Separations | |
| tiling | 118 | Interior Final Inspection | P15 | 117 | Fire Separations | |
| trim-work | 118 | Interior Final Inspection | P15 | 117 | Fire Separations | |
| millwork-cabinetry | 118 | Interior Final Inspection | P15 | 117 | Fire Separations | |
| stone-countertops | 118 | Interior Final Inspection | P15 | 117 | Fire Separations | |
| security | 118, 129 | Interior Final + Security Device | P15 / P17 | 117 | Fire Separations | Low-voltage + dedicated security stage |
| **— Exterior & Specialty —** |||||||
| eavestrough-siding | 121 | Exterior Final Inspection | P16 | 120 | HVAC Final | |
| caulking | 121 | Exterior Final Inspection | P16 | 120 | HVAC Final | |
| solar | 121 | Exterior Final Inspection | P16 | 120 | HVAC Final | Roof-mounted |
| landscaping | 121 | Exterior Final Inspection | P16 | 120 | HVAC Final | Work moved from #122 to #121 per §8.5 QUESTIONABLE FIX (R2 review 2026-05-13) — in Toronto residential, final grading + sod + driveway often required pre-occupancy |
| paving | 121 | Exterior Final Inspection | P16 | 120 | HVAC Final | Work moved from #122 to #121 per §8.5 QUESTIONABLE FIX (same reason as landscaping) |
| decking-fences | 122 | Occupancy | P17 | 121 | Exterior Final Inspection | Legacy lumped trade; new code uses split `decks` / `back-yard-fences` below |
| decks | 122 | Occupancy | P17 | 121 | Exterior Final Inspection | |
| back-yard-fences | 122 | Occupancy | P17 | 121 | Exterior Final Inspection | |
| outdoor-patio | 122 | Occupancy | P17 | 121 | Exterior Final Inspection | |
| pool-installation | 124, 125 | Pool Suction/Gravity Outlets + Pool Circulation System | P17 | 123 | Final Inspection | |
| **— Real Estate (cross-stream) —** |||||||
| realtor | 122 | Occupancy | P17 | 121 | Exterior Final Inspection | Work moved from #39 (Permit Closed) to #122 (Occupancy) and LM from #122 to #121 per §8.5 QUESTIONABLE FIX (R2 review 2026-05-13) — Permit Closure lags Occupancy by 30–180 days; listing fires at/shortly after Occupancy in practice |

Source: `scripts/lib/lifecycle-phase.js` `TRADE_TARGET_PHASE_FALLBACK` (compile-time fallback) + `trade_configurations` DB table (runtime, populated by Spec 47 §4.1 config loader). The wide-bid-window model in this section **supersedes** the legacy `bid_phase_cutoff` ordinal stored in `trade_configurations` — the legacy ordinal is a single P-code (e.g., excavation→P3); the new model is a 44-row set per trade. Reconciling the two is the scope of a future Spec 81 update; for now Spec 84 is the documentation source of truth and the legacy column continues to drive the bimodal routing in `compute-trade-forecasts.js`.

##### Stage-level precision wins (where work targets a specific stage rather than a block)

| Trade | Today (P-code) lumps with | After (Stage) targets specifically |
|---|---|---|
| plumbing | All 8 MEP stages | Drain/Waste/Vents (#109) + Sewers/Drains (#110) + Water (#107-108) — 4/8 sub-stages excluded from prediction noise |
| hvac | All 8 MEP stages | HVAC Rough-in (#106) + HVAC Final (#120) |
| fire-protection | All 8 MEP stages | Fire Service (#111) + Fire Access (#112) + Fire Protection Systems (#113) |
| excavation/shoring | All 3 Site Prep stages | Site Grading (#100) + Excavation/Shoring (#101) |
| demolition | All 3 Site Prep stages | Only Demolition (#102) |
| temporary-fencing | All 3 Site Prep stages | Only Site Grading (#100) |
| pool-installation | All 9 Final/Specialty stages | Pool Suction/Gravity (#124) + Pool Circulation (#125) |

**Trades without Stage-level precision** (Block-level only, because the inspection data has no dedicated stage):
- electrical (no electrical inspection — falls under B2.B Block average)
- All interior finish trades (drywall, painting, flooring, etc.) — share Block B3.C "Interior Final"; cohort split would need richer city inspection data
- All exterior finish trades (roofing, glazing, etc.) — share Block B3.D "Exterior Final"

**Cross-reference:** The Universal Stream table (§2.5.h.2) shows the inverse view — for each Stage, which trades have their Bid or Work window opening at that Stage. See the `Bid Trades` and `Work Trades` columns there.

---

## 3. Behavioral Contract: Full Phase Detail

> **Granular Universal Stream Emission (added 2026-05-13, WF1 #coa-pipeline-parity-phase-a):** In addition to the legacy P-code emission documented in this section, the classifier ALSO writes the granular Universal Stream columns (`lifecycle_seq` 1–110, `lifecycle_group`, `lifecycle_block`, `lifecycle_stage`, `bid_value`) on every classified row, derived via JOIN against `universal_stream_catalog`. Both legacy P-code and granular row reference are written. Transitions write to **two ledgers**: `lifecycle_transitions` (phase-level) and `lifecycle_status_history` (status-level + CoA decision snapshot). See Spec 42 §6.7 for the implementation contract.

> **Phase-Code Namespace Deprecation (84-W11 resolution):** CoA P3/P4 and Permit P3/P4 are string-identical phase codes — a collision dating from the original spec. Resolution: `lifecycle_seq` (granular) becomes the authoritative phase identity. Legacy `lifecycle_phase` (P-code) is preserved through Phase H for backward compatibility with `compute-trade-forecasts.js` bimodal routing and `assert-lifecycle-phase-distribution.js` band checks; both consumers migrate to `lifecycle_seq` reading during Phases E/F. **Downstream consumers SHOULD migrate to `lifecycle_seq` rather than disambiguate the P-code.** Example: `link-coa.js` SKIP_PHASES — currently `WHERE lifecycle_phase NOT IN ('P19','P20','O1','O2','O3')` plus a CoA P1/P2 exclusion clause — migrates to `WHERE lifecycle_group NOT IN ('C4','BP7','O') AND lifecycle_seq IS NOT NULL`. CoA groups C1/C2/C3 (Intake / Decision / Post-Decision) DO trigger `last_seen_at` bump on the linked permit; only C4 (Terminal) is excluded. The `lifecycle_phase` column is deprecated in a future cleanup WF once all consumers migrate.

### 1. The Planning & Variance Block (Pre-Permit)

**CoA-side phase emission rules** (Phase E.1 classifier — `classifyCoaPhase()` in `scripts/lib/lifecycle-phase.js`, rewritten 2026-05-14 per Spec 42 §6.7 step 1 9-rule precedence).

Rules are top-down, first match wins. Decision-driven rules derive `matchedStatus` via `NORMALIZED_DECISION_TO_STATUS_MAP` (18 explicit entries) so E.2's catalog lookup always resolves to a canonical CoA status.

| Rule | Phase | Name | Trigger Signal / Logic |
|---|---|---|---|
| 1 | P20 | CoA Terminal (Closed) | `status IN {'Closed', 'Complete'}` OR `decision IN {'closed', 'application closed', 'delegated consent closed'}` |
| 2 | P19 | CoA Terminal (Refused / Withdrawn / Cancelled) | `status IN {'Refused', 'Application Withdrawn', 'Cancelled'}` OR `decision IN {'refused', 'withdrawn', 'application withdrawn', 'delegated consent refused'}` |
| 3 | P4 | CoA Final and Binding | `status = 'Final and Binding'` OR `decision = 'final and binding'` (appeal period cleared, legally binding) |
| 4 | P3 | CoA Post-Decision (Appealed / TLAB / OMB / Await Expiry) | `status IN {'Await Expiry Date', 'Appealed', 'TLAB Appeal', 'OMB Appeal'}` — reordered above rule 5 because post-decision states are MORE RECENT than the approval that preceded them |
| 5 | P3 | CoA Approved | `status IN {'Approved', 'Approved with Conditions', 'Conditional Consent'}` OR `decision IN NORMALIZED_APPROVED_DECISIONS` (18 variants incl. typos: 'conditional consent', 'consent with conditions', + 16 existing) |
| 6 | P2 | CoA Deferred (decision-driven) | `isDeferredDecisionVariant(decision)` — canonical `'deferred'` / `'deffered'` (§2.5.b row 53 typo) + 505 date-stamped variants via `startsWith('deferred ')` + `'decision not made'` outlier (§2.5.b row 54). Negative-guarded against P19/P20/FaB/Approved sets. Reordered above rule 7 because decision is more authoritative than scheduling status |
| 7 | P2 | CoA Review (status-driven) | `status IN {'Prepare Notice', 'Notice Prepared', 'Tentatively Scheduled', 'Hearing Scheduled', 'Hearing Rescheduled', 'Postponed', 'Deferred'}` |
| 8 | P1 | CoA Intake | `status IN {'Application Received', 'Accepted'}` |
| 9 | P1 | catchall (unmapped) | All other inputs → P1 + `unmappedStatus: true` (if status non-null) and/or `unmappedDecision: true` (if decision non-null) + `matchedStatus: null` (NOT a sentinel — drives `mapToUniversalStream` to return null → E.2 writes `lifecycle_seq = NULL` correctly). Surfaces in `unmapped_status_count` / `unmapped_decision_count` audit metrics for triage. |

**Return shape:** `{phase, stalled, matchedStatus, matchedRule (1..9 or 0=defensive sentinel), unmappedStatus, unmappedDecision}`. Existing destructure `{phase, stalled}` continues to work.

**Stall detection:** `stalled = false` for non-{P1, P2} phases (terminal / post-decision / final-and-binding cannot stall). Rule 9 catchall → P1 DOES compute stall.

**Same-Sprint Mitigation (Option 2 — active 2026-05-14 → E.2 ship):** `classifyCoaPhaseLegacy(input)` adapter narrows `{phase: P3|P4|P19|P20}` → `{phase: null}` so v1 consumer `scripts/classify-lifecycle-phase.js` preserves its 0.6% non-NULL coverage in the E.1↔E.2 gap window. The adapter preserves OLD RETURN SHAPE, NOT OLD BUGGY BEHAVIOR (the buggy v1 mapping `decision='Approved' → P2` was wrong; we are not preserving wrongness).

**Permit-side cross-reference (transition):**

| Phase | Name | Trigger Signal / Logic |
|---|---|---|
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

> **DEPRECATED IN PHASE A (WF1 #coa-pipeline-parity-phase-a, 2026-05-13):** The 36-key P-code band namespace documented in this section is being replaced by the granular **seq-level band namespace** in Spec 86 §1 (`lifecycle_band_seq_<seq>_min/max`, ×110 pairs + `lifecycle_band_seq_<seq>_sample_size_threshold` tier selector). The new authoritative gate validates per-seq distributions with sample-size-aware tuning. Block-level aggregation was rejected because outcome-diverse blocks like B2.C (containing both "Refused" and "Final and Binding" with opposite semantics) cannot be safely conflated. See active task §A.1.7 + Spec 42 §6.7 step 4 for the implementation contract. Legacy P-code bands remain populated through Phase H of WF2 #coa-pipeline-parity for backward compatibility with `compute-trade-forecasts.js` P-code routing; dropped in Phase H cleanup.

`scripts/quality/assert-lifecycle-phase-distribution.js` is the canonical post-classifier health check. It compares the live row counts of every phase (`P3-P20`, `O1-O3`, CoA `P1-P2`, plus the synthetic `P9-P17` aggregate) against per-phase `[min, max]` bands and flags `FAIL`/`WARN` if any actual count drifts outside its band.

**Externalization (WF2 2026-05-07, migration 119)** — every band bound and every cross-status drift threshold lives in `logic_variables`, not in code. Operators tune via the admin Control Panel ("Lifecycle Phase Distribution Bands" group, Spec 86 §1) without a redeploy.

Key namespace:
- `lifecycle_band_<phase>_min`, `lifecycle_band_<phase>_max` — 18 phases × 2 keys (36 entries). Phase suffixes: `p3`, `p4`, `p5`, `p6`, `p7a`, `p7b`, `p7c`, `p7d`, `p8`, `p18`, `p19`, `p20`, `p9_p17_agg`, `o1`, `o2`, `o3`, `coa_p1`, `coa_p2`.
- `lifecycle_cross_stalled_threshold` — FAIL when N permits have `enriched_status='Stalled'` but `lifecycle_stalled=false`.
- `lifecycle_cross_active_inspection_threshold` — FAIL when N permits with `enriched_status='Active Inspection'` are not in `P9-P18`/`O1-O3`.
- `lifecycle_cross_issued_threshold` — FAIL when N permits with `enriched_status='Permit Issued'` are not in `P7a/b/c/d`/`P8`/`P18`/`O1-O3`.

Defaults are calibrated against the 2026-05-07 live-DB snapshot with ±15% tolerance and seeded by both `migrations/119_lifecycle_phase_bands_logic_variables.sql` and `scripts/seeds/logic_variables.json` (single source of truth — the parity test `src/tests/control-panel.logic.test.ts` enforces both surfaces match).

A startup-time Zod `superRefine` rejects any `min > max` pair (operator-hotfix guard) — a bad pair would silently make a band un-matchable and the assertion would pass on a dead phase.

**Phase E.4 extension (DELIVERED 2026-05-16 commit `[E.4-COMMIT]`):** the assertion script now ALSO validates per-seq distribution bands (Universal Stream catalog seq 1-110) alongside the 19 phase-keyed bands. Migration 148 derives band defaults from `universal_stream_catalog.rows_count` via INSERT...SELECT (220 new `lifecycle_seq_band_<N>_min/_max` keys + `lifecycle_seq_unclassified_max`). The continuous 2-branch tolerance formula (`[FLOOR(rc*0.7), CEIL(rc*1.3)+20]` for `rows_count >= 1`; `[0, NULL]` INFO-only for NULL or 0) replaces the discontinuous 3-branch formula reviewers flagged as causing spurious WARNs at the rows_count=30 boundary. Migration 149 adds partial `CREATE INDEX CONCURRENTLY` on `permits.lifecycle_seq` + `coa_applications.lifecycle_seq` (filtered `WHERE lifecycle_seq IS NOT NULL`) to support the per-seq aggregate UNION ALL query. Per-seq bands are operator-tunable via Spec 86 Control Panel; mig 148 uses `ON CONFLICT DO NOTHING` to preserve operator-tuned values.

Per-seq posture is **WARN-only on first deploy** — `seq_bands_failing` audit row is hardwired to 0 in v1 as an E.5 promotion hook. All E.4-originated WARNs carry the `[E.4 WARN-ONLY POSTURE]` or `[E.4 STARTUP STATE]` prefix for operator-followup triage clarity. E.5 (separate WF) tightens to FAIL after 7 consecutive PASS runs on staging by routing `seqBandsWarn++` increments to `seqBandsFailing++`.

The 110-row per-seq distribution map ships in `records_meta.seq_distribution` (NOT `audit_table.rows` per Spec 48 §3.2). Structured violations (`{seq, actual, band_min, band_max, kind}` objects with `kind` in `{band_violation, no_band_configured, expected_data_missing}`) ship in `records_meta.seq_violations` capped at 50; overflow surfaced as `seq_violations_truncated_count` scalar. The top-10 violations preview surfaces via the `warnings[]` array (visible to the Spec 48 followup file via `pipeline.log.warn`).

**`records_total` vs `sum(seq_distribution.values())` divergence:** during Phase D/E.2 ramp-up, `sum(seq_distribution.values()) < records_total` because many rows have `lifecycle_phase` set but not yet `lifecycle_seq`. Expected; not a pipeline integrity failure. Convergence is the E.5 operational gate.

**`linked_permit_num` post-E.1:** E.1 removed Rule 0; `classifyCoaPhase()` now writes `lifecycle_seq` (and `lifecycle_phase`) to ALL CoA rows regardless of `linked_permit_num`. The new `seq_unclassified_count` gate correctly does NOT filter on `linked_permit_num IS NULL`. The legacy phase-keyed `unclassified_count` DELIBERATELY KEEPS the filter for legacy-shape baseline continuity (Spec 48 §3.4 7-day historical baseline preservation during the Strangler Fig transition window).

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
| 84-W4 | **Dead Transition Write:** Ledger is written but not used. Fix: Wire Spec 86 Calibration to read this ledger. | **Resolved (WF1 #B 2026-05-09)** — `scripts/compute-phase-calibration.js` now reads the ledger via `LAG()` window + `PERCENTILE_CONT` per `(permit_type, from_phase)` and writes `phase_stay_calibration`; the inspector's `lifecycle.timeline[]` reads that table for cohort comparison. **Phase E.3 extension (DELIVERED 2026-05-15 commit `[E.3-COMMIT]`):** ledger consumption extended to `lifecycle_transitions` (the E.2 INSERT writer for CoA-side phase transitions). Spec 84 §8.7 cohort blind-spot CLOSED for CoA-stage rows via granular 5-tuple cohort key `(NULL permit_type, project_type, coa_type_class, from_seq, to_seq)`; permit-side blind-spot remains until Phase H consolidates `permit_phase_transitions` into `lifecycle_transitions`. See §7 below. |
| 84-W11 | **ID Collision:** P3/P4/P5 mean different things in CoA vs Permits. Fix: Prefix Permit-Intake phases (e.g., `INTAKE_P3`). | **Resolved (WF1 #coa-pipeline-parity-phase-a 2026-05-13; transitional consumer guards in Phase E.2 2026-05-14)** — see §3 Phase-Code Namespace Deprecation. Granular-first move: `lifecycle_seq` (1–110) is authoritative; legacy `lifecycle_phase` deprecated through Phase H. **Transitional consumer guards (Phase E.2 v4 scope expansion — MOVED FROM Phase F into E.2 per Gemini v3 CRIT):** `scripts/compute-trade-forecasts.js` `PRE_CONSTRUCTION_PHASES.has(lifecycle_phase)` lookup and `scripts/update-tracked-projects.js` `PHASE_ORDINAL[lifecycle_phase]` lookup require `lead_id LIKE 'coa:%'` guards to prevent CoA-P3/P4 rows from misrouting through permit-side calibration / ordinal paths. Lands in E.2 alongside the producer (`classify-lifecycle-phase.js` consumer wiring) so CoA-P3/P4 rows never exist in production without their consumers being guarded. Phase F retains only the CoA UNION source extension + per-seq cohort key work. |
| 84-W5 | **Magic Stall Numbers:** Thresholds (180/730 days) are hardcoded. Fix: Move to `Zod` validated `logic_variables`. | Pending Refactor |
| 84-W3 | **Mega-Insert Risk (Spec 47 §6.1):** 237k-row backfill crashes DB on `.query()`. Fix: Wire `pipeline.streamQuery` and standard chunking with loop arrays. | Pending Refactor |
| 84-W9 | **SQL/JS Drift:** CoA normalization is duplicated in two places. Fix: Consolidate into a single SQL helper function. | Pending Refactor |
| 84-S47 | **SIGTERM Release (Spec 47 §5.5):** No lock release on container preemption. Fix: Add process `SIGTERM` trap. | Pending Refactor |
| 84-S47 | **Midnight Drift (Spec 47 §8):** Multiple `NOW()` executions inside loops. Fix: Extract `RUN_TIMESTAMP` from a single query before streaming begins. | Pending Refactor |
| 84-W12 | **CoA Classifier Silent No-Op:** 99.4% of `coa_applications` rows have `lifecycle_phase = NULL`. Root cause (confirmed): `classifyCoaPhase()` Rule 0 short-circuited on `linked_permit_num IS NOT NULL` (§2.5.f row 4), AND `coa_applications.status` was structurally ignored (passed in but never read). Combined effect: 32,865 of 33,052 CoAs had NULL phase. | **CLOSED at substrate level in Phase E.1 commit `7003683` (2026-05-14); consumer wiring DELIVERED in Phase E.2 commit `[E.2-COMMIT]` (2026-05-14).** Rule 0 removed; `coa_applications.status` wired via 9-rule precedence (Spec 42 §6.7 step 1). New return shape: `{phase, stalled, matchedStatus, matchedRule, unmappedStatus, unmappedDecision}`. Phase domain widened to `{P1, P2, P3, P4, P19, P20, null}`. Phase E.2: classify-lifecycle-phase.js consumer switched from `classifyCoaPhaseLegacy` adapter to full `classifyCoaPhase`; writes 11 columns + `lifecycle_transitions` ledger via single withTransaction; mig 146 added 4 persisted audit columns (`matched_status` / `matched_rule` / `unmapped_status` / `unmapped_decision`) + UNIQUE INDEX on `lifecycle_transitions(lead_id, transitioned_at)` for ON CONFLICT idempotency. Coverage gate fires on first E.2 production run: CoA `lifecycle_phase IS NOT NULL` 0.6% → ≥ 95% (~30,000+ row reclassification). Defensive `lead_id LIKE 'coa:%'` guards landed in `compute-trade-forecasts.js` + `update-tracked-projects.js` (inert until Phase F UNION adds CoA-side rows to source). Audit gate band recalibration deferred to E.4. |

---

## 7. Calibration Source

The `permit_phase_transitions` ledger is the canonical source for permit-side phase-stay velocity math. `scripts/compute-phase-calibration.js` (Permits chain step 23, advisory lock 93) consumes the ledger and writes the `phase_stay_calibration` table.

**Phase E.3 extension (DELIVERED 2026-05-15 commit `[E.3-COMMIT]`):** `compute-phase-calibration.js` now reads TWO ledgers:
1. `permit_phase_transitions` (legacy permit-side; PRESERVED) — produces 2-tuple `(permit_type, from_phase)` cohort rows in `phase_stay_calibration`.
2. `lifecycle_transitions` WHERE `lead_id LIKE 'coa:%'` (NEW — the E.2 INSERT writer) — produces granular 5-tuple `(NULL permit_type, project_type, coa_type_class, from_seq, to_seq)` cohort rows in `phase_stay_calibration`. Closes the Spec 84 §8.7 cohort blind-spot for CoA-stage rows. Permit-side granular seq derivation remains deferred to Phase H when `permit_phase_transitions` is consolidated into `lifecycle_transitions`.

`compute_phase_calibration` now runs in BOTH the `permits` and `coa` chains (per `scripts/manifest.json` + `src/components/FreshnessTimeline.tsx` — added in E.3 commit). The Spec 48 observer writes audit_table to both `permits-followup.md` and `coa-followup.md` post-E.3.

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

## 8. Implementation Plan — Investigation Results [ARCHIVED 2026-05-13]

> **Status: Step 1 DELIVERED** by WF1 #coa-pipeline-parity-phase-a (Spec 42 §6 implementation plan, Phases A–H). Subsequent items become follow-up WFs. This section retained as historical investigation reference.

> The 8 investigations below (§8.1–§8.8) informed the design of the WF1 → WF2 #coa-pipeline-parity work. §8.9 cross-references the implementation plan in Spec 42 §6. Investigation premises that have been resolved are annotated with **RESOLVED IN PHASE A** notes; pending items remain for future-WF planning.



This section captures **investigation results only** — the raw inventory of what exists today, what consumes the lifecycle data, what the database schemas look like, and what fields are shared across the dependent specs. No proposals, no migration steps, no recommended remediation. The implementation work itself is scoped from these findings in a separate WF plan.

The investigations:
- **§8.1** — Current lifecycle code outputs (every field the classifier writes)
- **§8.2** — Specs that consume lifecycle data
- **§8.3** — Code files that consume lifecycle data
- **§8.4** — Drift: current code vs the granular spec
- **§8.5** — Independent review findings on the Universal Stream
- **§8.6** — Database schemas of 11 adjacent specs (81–85, 26, 40, 41, 42, 76, 86)
- **§8.7** — Fields shared across those 11 specs

### 8.1 — Current Lifecycle Code Outputs (Investigation 1)

The classifier (`scripts/classify-lifecycle-phase.js` + `scripts/lib/lifecycle-phase.js`) produces the following surface today. Every item below must either be preserved, replaced, or explicitly retired by the migration.

**Table writes:**
- `permits.lifecycle_phase` — `P1`–`P20`, `O1`–`O3`, `INTAKE_P3`, or NULL
- `permits.lifecycle_stalled` — boolean
- `permits.lifecycle_classified_at` — timestamptz watermark
- `permits.phase_started_at` — timestamptz immutable anchor per phase
- `coa_applications.lifecycle_phase` — `P1`, `P2`, or NULL (99.4% NULL today — bug 84-W12)
- `coa_applications.lifecycle_stalled` — boolean
- `coa_applications.lifecycle_classified_at` — timestamptz
- `permit_phase_transitions` (ledger) — `(permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type, neighbourhood_id)`

**Phase codes emitted (pure function):**
- Permits: `P3`–`P20`, time-bucketed sub-codes `P7a/P7b/P7c/P7d`, orphan codes `O1/O2/O3`, NULL for dead
- CoAs: `P1`, `P2`, NULL only — P3/P4 from §3 never emitted

**Computed flags / time-bucketing:**
- `stalled` — three independent triggers (enriched_status='Stalled', issued+no-inspection >730d, last-inspection >180d)
- Intra-bucket suppression: P7a↔P7b↔P7c grouped as "P7_time"; O2↔O3 grouped as "O_time" (prevents log spam on time-driven transitions)

**Tunable logic variables (operator-controlled):**
`coa_stall_threshold` (30d), `lifecycle_issued_stall_days` (730d), `lifecycle_inspection_stall_days` (180d), `lifecycle_p7a_max_days` (30d), `lifecycle_p7b_max_days` (90d), `lifecycle_orphan_stall_days` (180d), plus 36 distribution-band variables and 3 cross-band thresholds (Spec 86).

### 8.2 — Specs Consuming Lifecycle Data (Investigation 2)

| Spec | Layer | Reads | Writes | Why structural |
|---|---|---|---|---|
| **84** (this spec) | Pipeline | ✓ | ✓ | Primary producer |
| **41** Chain: Permits | Pipeline | ✓ | ✓ (via embedded classifier) | Orchestrates classifier as step 22 + gates on its output (steps 23-25) |
| **42** Chain: CoA | Pipeline | ✓ | ✓ (via classifier step 10) | Trailing classifier — newly-linked permits must reclassify |
| **81** Opportunity Score Engine | Pipeline | ✓ | — | Bimodal routing (`target_window`) keyed on phase ordinal vs `bid_phase_cutoff` |
| **85** Trade Forecast Engine | Pipeline | ✓ | — | `predicted_start` anchors on `phase_started_at`; stall gate filters by `lifecycle_stalled` |
| **82** CRM Assistant & Alerts | Pipeline | ✓ | — | Stall/recovery + imminent + disappearance alerts all phase-keyed |
| **76** Admin Lead-Feed | Admin web | ✓ | — | Lead Inspector Timeline panel + Cycle 7 Lifecycle Timeline data |
| **86** Master Configuration | Config | ✓ | — | Hosts all classifier-tunable `logic_variables` |
| **91** Mobile Lead Feed | Mobile | ✓ | — | Phase badge + `target_window` styling (💎 Early Bid / 🚨 Rescue) |
| **49** Global Data Completeness | CQA | ✓ | — | `lifecycle_phase IS NOT NULL ≥ 95%` audit gate |

### 8.3 — Code Consumers of Lifecycle Data (Investigation 3)

**Pipeline writers (singleton):** `scripts/classify-lifecycle-phase.js` (advisory lock 84).

**Pipeline consumers:** `scripts/quality/assert-lifecycle-phase-distribution.js`, `scripts/quality/assert-global-coverage.js`, `scripts/compute-phase-calibration.js`, `scripts/compute-trade-forecasts.js`, `scripts/compute-opportunity-scores.js`.

**Admin API routes:** `src/app/api/leads/flight-board/route.ts` (filters by phase ≥ work_phase), `src/app/api/leads/flight-board/detail/[id]/route.ts`, `src/app/api/leads/detail/[id]/route.ts`, `src/app/api/admin/leads/inspect/[id]/route.ts`, `src/app/api/leads/search/route.ts`.

**Query builders:** `src/lib/leads/lead-detail-query.ts`, `src/lib/leads/lead-inspect-query.ts` (JOINs `permit_phase_transitions` + `phase_stay_calibration`), `src/features/leads/lib/get-lead-feed.ts`.

**Admin UI components:** `src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx`, `src/components/admin/LeadDetailInspector.tsx`, `src/components/FreshnessTimeline.tsx`, `src/features/admin-controls/components/GlobalConfigCard.tsx`.

**Schemas & display utilities:** `src/lib/admin/lead-schemas.ts` (FlightBoardItemSchema, LeadDetailSchema, LeadInspectLifecycleSchema), `src/lib/admin/lifecycle-timeline-utils.ts`, `src/lib/leads/build-lifecycle-timeline.ts`, `src/features/leads/lib/lifecycle-phase-display.ts` (24-phase label map), `src/lib/classification/phase-names.ts` (canonical PHASE_NAMES), `src/lib/classification/phase-progression.ts`, `src/lib/classification/lifecycle-phase.ts` (mirror of pipeline classifier — Spec 84 §7 dual-path).

**Mobile:** `mobile/src/lib/schemas.ts` (mirror of admin schema), `mobile/src/components/feed/FlightCard.tsx`, `mobile/app/(app)/[flight-job].tsx`, `mobile/app/(app)/[lead].tsx`, `mobile/src/store/userProfileStore.ts` (notification prefs).

**Migrations & tables:** `permits.lifecycle_phase` (085), `phase_started_at` (086), `permit_phase_transitions` (086), `phase_stay_calibration` (123), `coa_applications.lifecycle_stalled` (094).

**Removal blast-radius:** dropping `lifecycle_phase` would blank Flight Board temporal grouping, collapse admin Timeline Panel, break Trade Forecast `predicted_start`, halt CRM stall alerts, and fail Spec 49 coverage gate.

### 8.4 — Drift: Current Code vs Granular Spec (Investigation 4)

This is the migration backlog. Each item is a delta between what §2.5.h prescribes and what code does today.

**A. Status-value coverage gaps:**
- `permits.status = "Notice Sent"` (#13, 1 row) — falls through unclassified; should map to P4 per §2.5.a.
- `coa_applications.decision` — 54 distinct values, code maps only 23 (17 approved + 6 dead). The remaining ~31 (`Deferred*`, `Postponed`, `Conditional Consent`, data-quality variants) fall through to default P1. Spec §3.1 P2/P3/P4 decision-driven phases never fire.
- `coa_applications.status` — 22 distinct values, **structurally ignored**. `classifyCoaPhase()` receives `input.status` but never reads it. This is the root of bug 84-W12 (99.4% of CoAs have NULL lifecycle_phase).
- `permit_inspections.stage_name` — 35 distinct stages, code covers ~14 via loose `.includes()` substring matching. ~21 stages (interior-finish trades, water distribution, sewers, fire service, pool, etc.) cascade to P18 fallback rather than a specific phase.

**B. Phase-label drift (resolved as 84-W11 family — spec §3 text needs amendment, code is correct):**
- P18 = `INSPECTION_PIPELINE_P18_SET` in code; spec §3 calls it "Project Closed".
- P19 = `WINDDOWN_P19_SET`; spec §3 calls it "Cancelled".
- P20 = `TERMINAL_P20_SET`; spec §3 calls it "Revoked".
- CoA-side P1–P4 labels in §3 are aspirational; code only emits P1/P2 for CoA rows.

**C. Missing-in-code artifacts from §2.5.h:**
- **`Bid Value` per-row weighting (§2.5.h.2):** no column anywhere in DB or code; pure classifier takes no per-row weight input.
- **Group/Block/Stage 3-level hierarchy (§2.5.h.3):** no Group/Block/Stage constants in code; only flat phase codes P1–P20 + O1–O3.
- **Universal Stream row numbering (§2.5.h.2 `seq` 1–110):** never referenced in code; row sets are unnamed and scattered across phase-code constants.
- **Per-trade 4-signal model (§2.5.h.9 — Bid / Work / Fallback / Bid: Last Minute):** code has `TRADE_TARGET_PHASE_FALLBACK` with single `bid_phase` + `work_phase` P-codes per trade. No "wide 33-row bid window," no "Last Minute row," no per-row Bid Value weighting.

**D. Schema mismatches:**
- `trade_configurations` table has `bid_phase_cutoff` + `work_phase_target` (single P-code each). New model requires either: (a) a join table mapping `trade_slug × seq` with signal-type, or (b) per-trade row arrays in a `jsonb` column.
- `permits` / `coa_applications` lack a `bid_value` column to weight bid activation per row.
- No `lifecycle_group`, `lifecycle_block`, `lifecycle_stage` columns — only `lifecycle_phase`.

**E. Unresolved known bugs (§6):**
- **84-W11 — phase-code ID collision:** P3/P4/P5 used for both CoA and Permit, colliding. Spec calls for `INTAKE_P3` prefix style — partially shipped (`INTAKE_P3` exists) but P4/P5 still ambiguous.
- **84-W12 — CoA classifier silent no-op:** 99.4% NULL. Root cause: `coa_applications.status` column never read; only `decision` is consumed and only via a narrow approved/dead frozen-set check.

### 8.5 — Independent Review Findings: Universal Stream (Investigation 5)

Two reviewers validated §2.5.h.2 / §2.5.h.9 in parallel — one code-reviewer agent for internal cross-file consistency, one independent reviewer for construction-industry sequencing accuracy. Findings (raw, no remediation proposed):

**Internal-consistency findings (cross-file vs §2.5.a / §2.5.c / §2.5.d):**
- **Coverage**: 110 rows total = 22 CoA status + 53 permit status + 35 inspection stage rows. Reconciles exactly to seq 1–110. Row #13 "Notice Sent" (UNMAPPED) correctly present at seq 35.
- **Phase consistency**: spot-checked 15 rows; every Phase column in §2.5.h.2 matches the "Current code maps to" column in its source section.
- **Bid window uniformity**: 37 non-realtor trades have identical bid checkmarks on every row spot-checked; realtor is a strict superset.

**Internal-consistency discrepancies:**
- **seq 14 "Final & Binding"** (line 737): `Bid Value = 0` AND ✓ filled in all 37 non-realtor `Bid: <trade>` columns. Contradicts the §2.5.h.9 rule "Bid Value ≤ 0.2 → no bid checkmark."
- **seq 50 (row #31 Active Inspection)** (line 773): `Work: excavation`=✓ where §2.5.h.9 line 944 places excavation Work at rows #100/#101 only; `Bid: Last Minute: excavation` is blank where §2.5.h.9 line 944 places excavation LM at row #31. Same shift pattern on `Work: temporary-fencing` / `Bid: Last Minute: temporary-fencing`. Looks like a column-alignment shift in the Active Inspection row for early-stream trades.
- **Block B9 sub-letter sequence**: B9.A (Newly Issued) → B9.B (No Construction Yet) → B9.D (Active Inspection). B9.C is not present anywhere in the table.

**Construction-industry sequencing review (independent):**
- ~24 of 38 trades validated as ACCURATE (site prep, foundation, framing, structural-steel, masonry, elevator, plumbing, HVAC rough-in, fire-protection, drain-plumbing, insulation, drywall, glazing, windows, eavestrough-siding, caulking, pool-installation primary, security, painting positional, flooring positional, tiling positional + others).
- **roofing / windows / glazing Work = #121 Exterior Final**: real install sequence is immediately after framing for weather-seal, ~8 inspection stages before #121.
- **electrical Work = #106 HVAC Rough-in**: AIC has no dedicated electrical inspection stage; HVAC Rough-in is used as a mech proxy.
- **painting / flooring / tiling / trim-work / millwork-cabinetry / stone-countertops / security all Work = #118 Interior Final**: six trades share the same Work anchor, collapsing ~6 weeks of finishing sequence into one stage. Their LM signals also all share #117 (Fire Separations).
- **landscaping / paving / decking-fences / decks / back-yard-fences / outdoor-patio Work = #122 Occupancy**: landscaping + paving are typically required pre-occupancy in Toronto residential permits; decks / fences / patios more often post-occupancy.
- **realtor Work = #39 Permit Closed, LM = #122 Occupancy**: official Permit Closure lags Occupancy by 30–180 days; listing typically fires at or shortly after Occupancy.
- **drywall LM = #116 "Insulation & AirBarrier"**: row #116 is a data-quality variant with only 1 record in the live DB; the high-volume insulation row is #114 (8,775 records).
- **fire-protection LM = #110 Sewers/Drains**: fire service install sequences with water service (#107), not after sewers.
- **pool-installation LM = #123 Final Inspection**: pool excavation + plumbing + gas + electrical fire weeks before the Pool Suction/Circulation test stages; the LM anchor lands after the work has begun.
- **solar Work = #121 Exterior Final**: solar is typically a separate post-occupancy retrofit permit, not bundled with original construction.
- **hvac LM = #105 Structural Framing**: trade has split Work rows (#106 rough-in + #120 final) but only one LM (#105) — no LM signal exists for the HVAC Final stage.

### 8.6 — Database Schemas: 11 Adjacent Specs (Investigation 6)

For each spec adjacent to Spec 84's data flow, the tables owned and the tables read.

**Spec 81 — Opportunity Score Engine** (`docs/specs/01-pipeline/81_opportunity_score_engine.md`)
- Owned writes: `trade_forecasts.opportunity_score` (INT 0-100, nullable), `trade_forecasts.target_window` (VARCHAR — 'bid' | 'work')
- Read: `cost_estimates` (`trade_contract_values` JSONB, `estimated_cost`, `modeled_gfa_sqm`, `is_geometric_override`), `lead_analytics` (`tracking_count`, `saving_count`), `trade_configurations` (`multiplier_bid`, `multiplier_work`), `trade_forecasts` (`urgency`), `logic_variables` (los_* set)

**Spec 82 — CRM Assistant & Alerts** (`docs/specs/01-pipeline/82_crm_assistant_alerts.md`)
- Owned writes: `tracked_projects.last_notified_urgency`, `tracked_projects.last_notified_stalled`, `notifications` (STALL_WARNING / STALL_CLEARED / START_IMMINENT alert types)
- Read: `trade_forecasts` (`urgency`, `predicted_start`, `lifecycle_phase`), `lead_analytics` (`tracking_count`, `saving_count`), `permits.lifecycle_stalled`, `trade_configurations.imminent_window_days`

**Spec 83 — Lead Cost Model** (`docs/specs/01-pipeline/83_Lead_cost_model.md`)
- Owned tables: `cost_estimates` (PK `permit_num`+`revision_num`; cols `effective_area_sqm`, `trade_contract_values` JSONB, `is_geometric_override` BOOL, `modeled_gfa_sqm`, `estimated_cost`, `cost_source`, `model_version`), `trade_sqft_rates` (PK `trade_slug`; cols `base_rate_sqft`, `structure_complexity_factor`), `scope_intensity_matrix` (cols `permit_type`, `structure_type`, `gfa_allocation_pct`)
- Read: `permits` (`est_const_cost`, `scope_tags`, `project_type`, `permit_num`, `revision_num`), `permit_trades` (active trade list), `permit_parcels` (geometry), `neighbourhoods.avg_household_income`

**Spec 84 — Lifecycle Phase Engine** (THIS SPEC)
- Owned writes: `permits.lifecycle_phase` (VARCHAR P1-P20, INTAKE_P3, O1-O3), `permits.lifecycle_stalled` (BOOL), `permits.phase_started_at` (TIMESTAMPTZ), `permits.lifecycle_classified_at` (TIMESTAMPTZ), `coa_applications.lifecycle_phase`, `coa_applications.lifecycle_stalled`, `coa_applications.lifecycle_classified_at`, `permit_phase_transitions` ledger (`permit_num`, `revision_num`, `from_phase`, `to_phase`, `transitioned_at`, `permit_type`, `neighbourhood_id`)
- Read: `permit_inspections` (`stage_name`, `status`, `inspection_date`, `passed`), `logic_variables` (`lifecycle_p7a_max_days`, `lifecycle_p7b_max_days`, `lifecycle_inspection_stall_days`, `lifecycle_issued_stall_days`, `lifecycle_orphan_stall_days`, `coa_stall_threshold`)

**Spec 85 — Trade Forecast Engine** (`docs/specs/01-pipeline/85_trade_forecast_engine.md`)
- Owned tables: `trade_forecasts` (cols `predicted_start` DATE, `urgency` VARCHAR enum {expired, overdue, delayed, imminent, upcoming, on_time}, `target_window` VARCHAR {bid, work}, `confidence` VARCHAR {high, medium, low}, `calibration_method` VARCHAR {exact, fallback_all_types, fallback_issued, default}, `p25_days`, `p75_days`)
- Read: `permits` (`lifecycle_phase`, `phase_started_at`, `issued_date`), `permit_trades` (active trade list), `permit_inspections` (`latest_passed_stage`), `phase_stay_calibration` (`median_days`, `p25_days`, `p75_days`, `sample_size`), `trade_configurations` (`bid_phase_cutoff`, `work_phase_target`, `imminent_window_days`), `logic_variables` (`expired_threshold_days`, `snowplow_buffer_days`)

**Spec 26 — Admin Dashboard** (`docs/specs/02-web-admin/26_admin_dashboard.md`)
- Owned tables: none (presentation layer)
- Read: `pipeline_runs`, `data_quality_snapshots`, `permits`, `permit_trades`, `trades`, `neighbourhoods`, `entities`, `mv_monthly_permit_stats` (materialized view)

**Spec 40 — Pipeline System** (`docs/specs/01-pipeline/40_pipeline_system.md`)
- Owned tables: `pipeline_runs` (cols `status` enum {running, completed, failed, cancelled}, `records_total`, `records_new`, `records_updated`, `records_meta` JSONB containing audit_table + telemetry + sys_db_bloat), `pipeline_schedules` (cols `pipeline`, `enabled`, `chain_id` nullable; unique index on `(pipeline, COALESCE(chain_id, '__ALL__'))`)
- Read: telemetry capture across all chain tables via manifest declarations

**Spec 41 — Chain: Permits** (`docs/specs/01-pipeline/41_chain_permits.md`)
- Owned tables: none (30-step orchestration chain). Steps write to:
  - `permits` (lifecycle_phase, project_type, scope_tags, neighbourhood_id, enriched_status via steps 2-5, 22)
  - `entities` (step 6)
  - `permit_parcels` (step 9 — permit_num, revision_num, parcel_id, match_type, confidence)
  - `parcel_buildings` (step 11 — parcel_id, building_id, structure_type, confidence)
  - `permit_trades` (steps 13 + 14 — trade_id, confidence, is_active, is_default_fallback; realtor backfill in step 14)
  - `cost_estimates` (step 15)
  - `phase_calibration` (step 16)
  - `coa_applications.linked_permit_num/linked_confidence` (step 17)
  - `permit_phase_transitions` (step 22 via classifier)
  - `phase_stay_calibration` (step 24 — permit_type, phase, median_days, p25_days, p75_days, sample_size)
  - `trade_forecasts` (step 25 — target_window, urgency, predicted_start, p25_days, p75_days, opportunity_score)
  - `tracked_projects`, `lead_analytics` (step 27)
- Read-only consumed: `trade_configurations`, `logic_variables`

**Spec 42 — Chain: CoA** (`docs/specs/01-pipeline/42_chain_coa.md`)
- Owned tables: none (12-step orchestration chain). Steps write to:
  - `coa_applications` (step 2 — application_number, address, decision, decision_date, hearing_date, description, linked_permit_num, linked_confidence, street_name_normalized, lifecycle_phase, lifecycle_stalled)
  - `coa_applications.linked_permit_num/linked_confidence` + `permits.last_seen_at` bump (step 4; SKIP_PHASES exclusion: P19, P20, O1-O3, P1, P2)
  - `data_quality_snapshots` (step 7)
  - `permits` + `coa_applications` via classifier (step 10, advisory lock 84)
  - `pipeline_runs` (steps 11, 12 — phase distribution + global coverage gates)

**Spec 76 — Lead Feed Health Dashboard** (`docs/specs/02-web-admin/76_lead_feed_health_dashboard.md`)
- Owned tables: none (presentation + diagnostic layer)
- Read: `data_quality_snapshots` (cost/timing columns), `permits` (lifecycle_phase, lifecycle_stalled, phase_started_at, builder_name, owner, dates, et al.), `permit_trades`, `cost_estimates` (cost_source, is_geometric_override, modeled_gfa_sqm, trade_contract_values, estimated_cost, plus Liar's Gate fields), `phase_stay_calibration` (cohort medians for inspector timeline §3.5), `permit_phase_transitions` (timeline ledger), `trade_forecasts` (target_window, urgency, p25_days, p75_days, opportunity_score, trade_slice_dollar), `timing_calibration`, `lead_views`

**Spec 86 — Control Panel / Master Configuration** (`docs/specs/02-web-admin/86_master_configuration_list.md` or `86_control_panel.md`)
- Owned tables:
  - `logic_variables` (cols `variable_key` PK, `variable_value` NUMERIC, `variable_value_json` JSONB for tiered values like `income_premium_tiers`). Contents (60 keys total): 15 universal (los_base_divisor, los_penalty_tracking, los_penalty_saving, los_multiplier_bid, los_multiplier_work, los_decay_divisor, snowplow_buffer_days, expired_threshold_days, coa_stall_threshold, stall_penalty_precon, stall_penalty_active, liar_gate_threshold_pct, urban_coverage_ratio, suburban_coverage_ratio, commercial_shell_multiplier, placeholder_cost_threshold, income_premium_tiers) + 36 phase-band variables (`lifecycle_band_<phase>_min/_max`, mig 119) + 3 lifecycle cross-check thresholds + 3 staleness monitor variables + 1 calibration freshness variable (`calibration_freshness_warn_hours`)
  - `trade_configurations` (cols `trade_slug` PK, `base_rate_sqft`, `structure_complexity_factor`, `multiplier_bid`, `multiplier_work`, `bid_phase_cutoff`, `work_phase_target`, `imminent_window_days`, `allocation_pct`)
  - `scope_intensity_matrix` (cols `permit_type`, `structure_type`, `gfa_allocation_pct`)
- Read: none (configuration source)
- Single-source-of-truth file: `scripts/seeds/logic_variables.json`; parity test in `src/tests/control-panel.logic.test.ts`

### 8.7 — Shared Fields Across Specs (Investigation 7)

> **RESOLVED IN PHASE A (2026-05-13)** — the `(permit_type, phase)` cohort key blind spot identified below is closed by WF1 #coa-pipeline-parity-phase-a Phase E (Spec 42 §6.7). After Phase E lands, the cohort key on `phase_stay_calibration` extends to `(permit_type, project_type, coa_type_class, from_seq, to_seq)`. Granular Universal Stream `lifecycle_seq` adoption (Phase E) is the structural fix; the original §8.7 blind-spot description below preserves historical motivation context.



Fields referenced by ≥ 2 of the 11 specs in §8.6, grouped by owning spec.

**Owned by Spec 84 (Lifecycle):**
- `permits.lifecycle_phase` — read by Spec 41 (gate-routing), 42 (SKIP_PHASES), 76 (inspector), 81 (target_window routing), 82 (alerts disappearance), 85 (anchor), 86 (band gating), 91 (mobile badge)
- `permits.lifecycle_stalled` — read by Spec 76 (inspector), 82 (stall alerts)
- `permits.phase_started_at` — read by Spec 76 (current_phase_days_in), 85 (predicted_start anchor)
- `coa_applications.lifecycle_phase` — read by Spec 42 (SKIP_PHASES), 76 (cross-stream timeline)
- `permit_phase_transitions` — read by Spec 76 (admin Timeline panel), Spec 41 step 24 (calibration), Spec 84 itself (for stay distribution)

**Owned by Spec 85 (Trade Forecast):**
- `trade_forecasts.target_window` — read by Spec 81 (bid vs work multiplier selection)
- `trade_forecasts.urgency` — read by Spec 81 (decay filter, `<> 'expired'`), 82 (imminent alert), 76 (forecast panel)
- `trade_forecasts.predicted_start` — read by Spec 82 (imminent alert window), 76 (forecast panel)
- `trade_forecasts.opportunity_score` (WRITTEN by Spec 81) — read by Spec 76 (forecast panel)
- `trade_forecasts.p25_days` / `p75_days` — read by Spec 76 (forecast panel)
- `phase_stay_calibration` (WRITTEN by Spec 41 step 24) — read by Spec 76 (cohort percentiles in inspector), 85 (calibration source)

**Owned by Spec 83 (Cost Model):**
- `cost_estimates.trade_contract_values` (JSONB) — read by Spec 81 (base for score math), 76 (cost panel)
- `cost_estimates.estimated_cost` — read by Spec 81 (realtor financial base), 76 (cost panel)
- `cost_estimates.modeled_gfa_sqm` — read by Spec 81 (integrity audit), 76 (cost panel)
- `cost_estimates.is_geometric_override` — read by Spec 81 (integrity flag), 76 (cost panel)
- `cost_estimates.effective_area_sqm` — read by Spec 76 (cost panel), 85 (calibration if used)

**Owned by Spec 86 (Control Panel):**
- `trade_configurations.bid_phase_cutoff` — read by Spec 85 (bimodal routing)
- `trade_configurations.work_phase_target` — read by Spec 85 (bimodal routing)
- `trade_configurations.imminent_window_days` — read by Spec 85 (urgency math), 82 (imminent alert)
- `trade_configurations.multiplier_bid` / `multiplier_work` — read by Spec 81 (urgency multiplier)
- `trade_configurations.allocation_pct` — read by Spec 83 (cost slicer)
- `trade_configurations.base_rate_sqft` — read by Spec 83 (cost model)
- `trade_configurations.structure_complexity_factor` — read by Spec 83 (cost model)
- `logic_variables.los_*` (6 keys) — read by Spec 81
- `logic_variables.coa_stall_threshold` — read by Spec 84 (CoA stall)
- `logic_variables.lifecycle_p7a_max_days` / `_p7b_max_days` / `_inspection_stall_days` / `_issued_stall_days` / `_orphan_stall_days` — read by Spec 84
- `logic_variables.expired_threshold_days` / `snowplow_buffer_days` — read by Spec 85
- `logic_variables.lifecycle_band_<phase>_min/_max` (36 keys) — read by Spec 84 quality assertion (assert-lifecycle-phase-distribution.js)
- `scope_intensity_matrix.gfa_allocation_pct` — read by Spec 83 (Surgical Triangle)

**Owned by Spec 41 (Permits Chain) / produced by individual steps:**
- `permit_trades.trade_id` / `is_active` / `is_default_fallback` — read by Spec 83 (active trade list for cost slicer), 85 (forecast generation)
- `lead_analytics.tracking_count` / `saving_count` — read by Spec 81 (competition decay), 82 (alerts)
- `tracked_projects.last_notified_urgency` / `last_notified_stalled` (WRITTEN by Spec 82) — read by Spec 82 itself (idempotency check)

**Owned by Spec 42 (CoA Chain):**
- `coa_applications.linked_permit_num` / `linked_confidence` — read by Spec 41 step 17 (back-link), 76 (cross-stream timeline)

**Owned by Spec 40 (Pipeline System):**
- `pipeline_runs.records_meta` (JSONB, audit_table + telemetry) — read by Spec 26 (admin dashboard), 76 (health surface)
- `pipeline_runs.status` / duration — read by Spec 26, 76
- `data_quality_snapshots.*` — read by Spec 26, 76

**Cross-spec join keys (`permit_num`, `revision_num`) appear in every owned table above** and are the join axis for the entire pipeline (`permits` ⋈ `permit_trades` ⋈ `cost_estimates` ⋈ `trade_forecasts` ⋈ `permit_phase_transitions` ⋈ `phase_stay_calibration`). `permits.permit_num` (text, IBMS folder id) and `permits.revision_num` (smallint) are the canonical pair.

**`trade_slug` (text)** is the join axis for trade-fanned tables (`trade_configurations` ⋈ `trade_forecasts` ⋈ `cost_estimates.trade_contract_values` keys ⋈ `permit_trades.trade_id` after FK resolve).

### 8.8 — Current Trade-Forecast Generation Mechanics (Investigation 8)

How `trade_forecasts` rows are produced today. Source: `scripts/compute-trade-forecasts.js` (~780 lines, advisory lock 85) + helpers in `scripts/lib/lifecycle-phase.js` (PHASE_ORDINAL, TRADE_TARGET_PHASE_FALLBACK) + `scripts/lib/config-loader.js`.

**Inputs (SQL streamed in one query):**
- `permits` — `permit_num`, `revision_num`, `lifecycle_phase`, `lifecycle_stalled`, `phase_started_at`, `issued_date`, `application_date`, `permit_type`
- `permit_trades` — `trade_id`, filtered to `is_active = true`
- `trades` — `slug` lookup
- `permit_inspections` — `inspection_date` for `status='Passed'` (anchor fallback)
- `phase_calibration` — `(from_phase, to_phase, permit_type, median_days, p25_days, p75_days, sample_size)` indexed lookup
- `trade_configurations` — `trade_slug`, `bid_phase_cutoff`, `work_phase_target`, `imminent_window_days` (default 14 if null)
- `logic_variables` (Zod-validated): `expired_threshold_days` (default 90, normalized to negative), `urgency_overdue_days` (30), `urgency_upcoming_days` (30), `snowplow_buffer_days` (7), `calibration_default_median_days` / `_p25` / `_p75` (30 / 15 / 60)

**Source-set filter (rows that even enter the loop):**
- `lifecycle_phase IS NOT NULL`
- `lifecycle_stalled = false` (stalled permits get NO forecasts)
- `permit_trades.is_active = true`
- `lifecycle_phase NOT IN ('P19','P20','O1','O2','O3')` — terminal + orphan phases skipped via `SKIP_PHASES_SQL`
- Pre-permits (P1/P2): require `application_date >= NOW() - 18 months`
- Post-issuance: require `COALESCE(phase_started_at, issued_date) >= NOW() - 3 years`

**Per-row processing (in JavaScript, in-memory):**

1. **Anchor selection (4-tier fallback):** `phase_started_at` → `last_passed_inspection_date` → `issued_date` → `application_date`. If all null, row skipped (`counter: skipped`).

2. **Bimodal routing (`target_window`):** look up `bid_phase` + `work_phase` for the trade. Compute `currentOrdinal` from `PHASE_ORDINAL` map (P1=-8, ..., P17=9, P18=3.5, O1-3=20). Rule: `if currentOrdinal <= bidOrdinal → target = bid_phase`, else `target = work_phase`. If `currentOrdinal > targetOrdinal` strictly → skip row (`counter: skippedPastTarget` — opportunity window closed).

3. **Calibration lookup (5-tier fallback cascade):** 
   - Exact: `(fromPhase, toPhase, permit_type)`
   - All-types: `(fromPhase, toPhase, '__ALL__')`
   - Fallback-issued-type: `('ISSUED', toPhase, permit_type)` — used when current phase is pre-construction (P1-P8)
   - Fallback-issued-all: `('ISSUED', toPhase, '__ALL__')`
   - Default: hardcoded 30/15/60 from logic_variables
   - `calibration_method` column stamped with which tier hit

4. **Predicted-start math:** `predicted_start = anchorDate (UTC-midnight) + cal.median_days` (all arithmetic in UTC to avoid timezone off-by-one).

5. **Historic snowplow:** if anchor is `issued_date` or `application_date` AND `predicted_start < runAt` → snap to `today + snowplow_buffer_days` (default +7d). Prevents stale-anchor forecasts from auto-classifying as `expired`. Counter: `snowplowCount`.

6. **Grace-cutoff drop:** if `predicted_start < runAt − 180 days` → drop in memory before write (`counter: skippedTooOld`).

7. **Urgency classification (6-tier, ordered precedence):**
   - `expired` — `daysUntil ≤ -expiredThreshold` (default −90d)
   - `overdue` — `isPastTarget=true` OR `daysUntil ≤ -overdueWindow` (default −30d). `isPastTarget` only meaningful when `target=work_phase` AND `currentOrdinal ≥ targetOrdinal`.
   - `delayed` — `daysUntil ≤ 0`
   - `imminent` — `0 < daysUntil ≤ imminent_window_days` (per-trade, default 14)
   - `upcoming` — `imminentWindow < daysUntil ≤ upcomingWindow` (default 30)
   - `on_time` — `daysUntil > upcomingWindow`

8. **Confidence stamping:** `low` if `isFallback=true` (method='default') OR `sampleSize=0`. `high` if `sampleSize ≥ 30`. `medium` if `sampleSize ≥ 10`. `low` otherwise.

**Output table (`trade_forecasts`):** PK `(permit_num, revision_num, trade_slug)`. Columns: `predicted_start` DATE, `confidence` VARCHAR(10), `urgency` VARCHAR(20), `target_window` VARCHAR(20) {bid|work}, `calibration_method` VARCHAR(30), `sample_size` INT, `median_days` INT, `p25_days` INT, `p75_days` INT, `computed_at` TIMESTAMPTZ. `opportunity_score` column exists but is WRITTEN by Spec 81's `compute-opportunity-scores.js`, NOT by this script.

**Atomicity:** single `withTransaction()` wrapping (a) grace-purge DELETE (`urgency='expired' AND predicted_start < runAt − 180d`), (b) stale-purge DELETE (rows whose underlying permit no longer matches `SOURCE_SQL` — keeps the table consistent with current eligibility), (c) chunked `INSERT … ON CONFLICT … DO UPDATE` with batch size = `floor(65535/13) = 5,041` rows per chunk and `IS DISTINCT FROM` guards. On any failure → full rollback. Advisory lock 85 prevents concurrent writers; deadlock retries 3× with exponential backoff per Spec 47 §7.6.

**Emitted PIPELINE_SUMMARY metrics:** `forecasts_computed`, `new_forecasts`, `stale_forecasts_purged`, `grace_purged`, `skipped_no_anchor`, `skipped_past_target`, `skipped_too_old`, `unmapped_trades`, `snowplow_applied`, `anchor_sources` distribution, `urgency_distribution` (6-bucket histogram), `calibration_distribution` (5-bucket histogram). Audit-table gates: `unmapped_trades` = 0 (else FAIL); `default_calibration_pct` < 20% (WARN ≥ 20%, FAIL ≥ 50%); `expired_urgency_pct` < 30% (WARN ≥ 30%, FAIL ≥ 60%).

**Where lifecycle data enters the math:**
- `lifecycle_phase` is the **routing axis** — drives bimodal selection of bid vs work target
- `phase_started_at` is the **primary anchor** — drives predicted-start arithmetic
- `lifecycle_stalled` is the **filter gate** — stalled permits get no forecast
- `permit_phase_transitions` is the **calibration source** indirectly (via `compute-phase-calibration.js` which builds `phase_stay_calibration` consumed here)
- The fromPhase derivation rule (P1-P8 → use "ISSUED" anchor) is the bridge between pre-construction lifecycle position and post-issuance calibration cohorts

### 8.9 — Implementation Step 1: CoA Classification & Cost-Estimation Parity

**Background.** Investigations §8.7 and §8.8 surfaced a structural blind spot in the prediction engine. The cohort key in `phase_stay_calibration` is `(permit_type, phase)`, but during the CoA portion of Path A (Universal Stream rows 70–91), `permit_type` does not exist. `coa_applications` carries `description` (free text), `address`, `decision`, and `hearing_date` — none of which feed the cohort key. Result: every CoA-stage lead today resolves to the same `__ALL__` calibration bucket regardless of whether it is a side-yard variance or a 20-storey condo, and the median 1,078-day CoA-decision-to-permit-filing lag is invisible to the forecast.

By contrast, the permits side runs through a multi-step classification pipeline (Spec 41 steps 9, 11, 5, 13, 15) that produces `scope_tags`, `project_type`, `permit_type_class`, `structure_type`, and cost estimates. None of these exist on `coa_applications` today, and there is no `classify-coa.js` script — the only CoA-side writes are `load-coa.js` (CKAN ingest), `link-coa.js` (back-link to permits), and `classify-lifecycle-phase.js` (the broken P1/P2 assignment, bug 84-W12 — 99.4% NULL).

The first implementation step is therefore to bring CoA applications up to parity with permits on the cohort-segmentation dimensions, working from the reduced information that CoA filings actually carry.

**Pipeline-step parity required:**

| Permit-chain step | Source spec | Permit table | CoA equivalent (new) |
|---|---|---|---|
| Step 9 — link permits to parcels | Spec 41 §9 | `permit_parcels` | Unified `lead_parcels` table (lead_id-keyed per Spec 42 §6.6.B Option C) + `link-coa-to-parcels.js` script for CoA side |
| Step 11 — link parcels to buildings | Spec 41 §11 | `parcel_buildings` | reused — once CoA → parcel link succeeds, building lookup is shared |
| Step 5 — classify permits (scope, project_type, residential/commercial class) | Spec 41 §5 + Spec 80 | `permits.scope_tags`, `.project_type`, `.permit_type_class` | NEW `classify-coa.js` writing equivalents on `coa_applications` |
| Step 13 — classify permit trades | Spec 41 §13 + Spec 13 | `permit_trades` | Unified `lead_trades` table (lead_id-keyed per Spec 42 §6.6.B Option C) + `classify-coa-trades.js` reusing `trade_mapping_rules` Tier-3 (description) only |
| Step 15 — compute cost estimates | Spec 41 §15 + Spec 83 | `cost_estimates` | EXTEND `compute-cost-estimates.js` to also produce CoA cost rows, OR a parallel `compute-coa-cost-estimates.js` |

**New columns on `coa_applications`:**

| Column | Type | Source | Notes |
|---|---|---|---|
| `coa_type_class` | VARCHAR | new classifier | `residential` / `commercial` / `institutional` / `mixed` — inferred from description + parcel building type |
| `project_type` | VARCHAR | new classifier | `Addition` / `NewConstruction` / `Alteration` / `Demolition` / `Severance` / `Mixed` — inferred from description |
| `scope_tags` | TEXT[] | new classifier | reduced tag set (no structural-detail tags available without permit drawings) |
| `structure_type` | VARCHAR | parcel lookup | from `parcel_buildings` after CoA → parcel link succeeds |
| `modeled_gfa_sqm` | NUMERIC | cost-estimation step | from parcel geometry + scope; only filled when needed |
| `estimated_cost` | NUMERIC | cost-estimation step | derived from GFA × `trade_sqft_rates.base_rate_sqft` × `scope_intensity_matrix` (Spec 83 Surgical Triangle), since CoA applications do not declare a construction cost |
| `cost_source` | VARCHAR | cost-estimation step | provenance flag — always `geometric` for CoA rows (no applicant-declared anchor to choose between) |

**New tables:**

- `lead_parcels` — `(lead_id TEXT, parcel_id BIGINT, match_type, confidence, matched_at)`. Universal table replacing `permit_parcels`; CoA rows use `lead_id = 'coa:<application_number>'`.
- `lead_trades` — `(id SERIAL, lead_id TEXT, trade_id, tier, confidence, is_active, phase, lead_score, classified_at, UNIQUE(lead_id, trade_id))`. Universal table replacing `permit_trades`.
- `lifecycle_transitions` — `(id SERIAL, lead_id TEXT, from_phase, to_phase, from_seq, to_seq, transitioned_at, permit_type, project_type, coa_type_class, neighbourhood_id)`. Universal ledger replacing `permit_phase_transitions`.
- `universal_stream_catalog` — 110-row reference table seeded from §2.5.h.2 (group/block/stage/labels/colors/icons/phase/bid_value).
- `universal_stream_trade_signals` — `(seq, trade_slug, signal_type)` join table decomposing the 152 per-trade-per-row signals.

Cost output: `cost_estimates` rekeyed on `lead_id` (Option C — single unified table accepts both `'permit:...'` and `'coa:...'` lead_ids). See Spec 42 §6.6 for the full schema migration.

**Reduced-information constraints (binding):**

1. **Description-only classifier surface.** Permits provide structured fields: `permits.work` (work-type enum), `permits.description` (semi-structured), `permits.est_const_cost` (declared dollars). CoA classifier has only `coa_applications.description` — free text, typically 1–3 sentences. Implementation either uses keyword/regex heuristics (fastest, lowest accuracy) or an LLM classifier per row (higher accuracy, per-row run cost).
2. **No structured work field.** `permits.work` enumerates explicit work-types ("Addition" / "New Building" / "Demolition"); CoA descriptions are prose and must be distilled into the same `project_type` enum by the classifier.
3. **No applicant-declared cost.** Permits provide `est_const_cost`; CoAs do not. CoA cost estimation must rely entirely on the geometric path (parcel-derived footprint × scope intensity × rate-per-sqft) without an applicant declaration as anchor or sanity check. The Liar's-Gate logic in Spec 83 has no equivalent input.
4. **Looser parcel matching.** Permit applicants normalize their address against the city's IBMS parcel system; CoA addresses can be street ranges or ambiguous suite numbers in mixed-use buildings. Expect lower parcel-match confidence on CoAs and a corresponding tail of unmatched rows that fall through to address-only cohort.

**Downstream consumers that gain signal once Step 1 lands:**

- **Spec 84 lifecycle classifier (this spec) bug 84-W12** — once `coa_type_class` / `project_type` / `scope_tags` exist on CoA rows, the CoA P1/P2/P3/P4 classifier has additional inputs beyond `decision`/`status` to assign phase. This is necessary but not sufficient to close 84-W12 (the deeper fix is wiring `coa_applications.status` into `classifyCoaPhase()`, also part of Step 1's behavioral-contract update).
- **Spec 85 trade forecast cohort key** — `phase_stay_calibration` cohort key extensible from `(permit_type, phase)` to `(permit_type, project_type, coa_type_class, phase)`. CoA-stage rows stop collapsing to `__ALL__`.
- **Spec 83 lead cost model** — CoA-stage leads acquire a meaningful cost estimate before any permit is filed. Unlocks the Surgical Triangle output for the entire median-1,078-day CoA→permit-filing lag window.
- **Spec 81 opportunity scoring** — CoA-stage `opportunity_score` becomes non-null for the first time (currently universal `null` because `cost_estimates` is permit-keyed only).
- **Spec 91 mobile lead feed** — Path A leads display cost + scope + project_type context months or years earlier than today.

**Explicitly out of scope for Step 1 (later steps):**
- Predicting WHICH permit_type will follow a given CoA (vs no permit at all). Separate spec; classifier driven by historical CoA→Permit linkage patterns.
- Predicting CoA approval odds from description + scope + neighbourhood. Separate spec.
- Construction-stream (post-permit) classification parity — already mature on the permits side; nothing new needed here.
