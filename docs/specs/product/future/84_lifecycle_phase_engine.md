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

### Implementation
- **Script:** `scripts/classify-lifecycle-phase.js`
- **Logic Library:** `scripts/lib/lifecycle-phase.js` (Pure function `classifyLifecyclePhase`)
- **Pipeline Wiring:**
  - **Permits Chain:** Step 21 of 24. Runs after `assert_engine_health` and before the marketplace tail.
  - **CoA Chain:** Step 10 of 10. No forecasts run on pre-permit CoA data.
  - Holds `pg_try_advisory_lock(85)` on a dedicated `pool.connect()` client to prevent concurrent runs.
  - **CoA Stall Detection:** Consumes `logic_variables.coa_stall_threshold` (seeded 30 days) to flag `lifecycle_stalled = TRUE`.

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
| 84-W4 | **Dead Transition Write:** Ledger is written but not used. Fix: Wire Spec 86 Calibration to read this ledger. | Pending Refactor |
| 84-W11 | **ID Collision:** P3/P4/P5 mean different things in CoA vs Permits. Fix: Prefix Permit-Intake phases (e.g., `INTAKE_P3`). | Pending Refactor |
| 84-W5 | **Magic Stall Numbers:** Thresholds (180/730 days) are hardcoded. Fix: Move to `Zod` validated `logic_variables`. | Pending Refactor |
| 84-W3 | **Mega-Insert Risk (Spec 47 §6.1):** 237k-row backfill crashes DB on `.query()`. Fix: Wire `pipeline.streamQuery` and standard chunking with loop arrays. | Pending Refactor |
| 84-W9 | **SQL/JS Drift:** CoA normalization is duplicated in two places. Fix: Consolidate into a single SQL helper function. | Pending Refactor |
| 84-S47 | **SIGTERM Release (Spec 47 §5.5):** No lock release on container preemption. Fix: Add process `SIGTERM` trap. | Pending Refactor |
| 84-S47 | **Midnight Drift (Spec 47 §8):** Multiple `NOW()` executions inside loops. Fix: Extract `RUN_TIMESTAMP` from a single query before streaming begins. | Pending Refactor |

---

## 7. Calibration Source
Mandate that Spec 86 (Calibration) uses the `permit_phase_transitions` ledger as its primary data source for velocity math, directly resolving bug 84-W4.

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
