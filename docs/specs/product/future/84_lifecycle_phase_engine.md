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
| `lifecycle_phase` | VARCHAR | The current stage (P1-P20, O1-O3). |
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
  - **Permits Chain:** Step 21 of 24. Runs after `assert_engine_health` (20) — the classifier depends on a clean engine-health checkpoint — and before the marketplace tail (`compute_trade_forecasts` at 22, `compute_opportunity_scores` at 23, `update_tracked_projects` at 24).
  - **CoA Chain:** Step 10 of 10 (final step). No forecasts/scores run on pre-permit CoA data because there is no trade classification or cost estimate yet.
  - Holds `pg_try_advisory_lock(85)` on a dedicated `pool.connect()` client to prevent concurrent runs.
  - **CoA Stall Detection (WF3 2026-04-13):** Consumes `logic_variables.coa_stall_threshold` (seeded 30 days) to flag `coa_applications.lifecycle_stalled = TRUE` when a CoA in P1/P2 has had no activity for longer than the threshold (migration 094 added the column).

---

## 3. Behavioral Contract: Full Phase Detail (P1–P20)

### 1. The Planning & Variance Block (Pre-Permit)
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
| P1 | CoA Intake | CoA application created in the system. |
| P2 | CoA Review | Status: "Internal Review" or "Public Hearing Scheduled." |
| P3 | CoA Approved | Decision: "Approved" or "Approved with Conditions." |
| P4 | CoA Final | Decision: "Final and Binding" (Appeal period cleared). |
| P5 | Zoning Review | Transition phase where CoA links to a Building Permit application. |

### 2. The Permit Intake Block
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
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

### 6. Terminal & Special Phases
| Phase | Name | Trigger Signal / Logic |
|---|---|---|
| P19 | Cancelled | Status: "Cancelled", "Withdrawn", or "Refused." |
| P20 | Revoked | Status: "Revoked" (City-initiated termination). |
| O1 | Orphan Active | Standalone trade permit (e.g., a furnace swap) with active inspections. |
| O2 | Orphan Done | Standalone trade permit finalized. |
| O3 | Orphan Stalled | Standalone trade permit > 180 days with no activity. |

---

## 4. System Logic & Edge Cases

### Logic Notes for the Contract
- **The "Watermark" Logic:** The engine always moves forward. If a project passes P11 (Framing), it cannot go back to P9 (Excavation) unless a new revision is filed.
- **Sub-Phase Promotion:** P7a/b/c are handled automatically by the `classifyLifecyclePhase` function based on `NOW() - issued_date`.
- **Stall detection:** If a project sits in a phase (e.g., P11) for more than the `stall_threshold_days` (default 180) without a new inspection row, `lifecycle_stalled` is toggled to `TRUE`.

### Core Logic
- **Dirty Check:** Select rows where `last_seen_at > lifecycle_classified_at`.
- **Orphan Detection:** Build a prefix Map to find sibling permits (BLD/CMB).
- **Inspection Rollup:** SQL-side aggregation to find the `latest_passed_stage`.
- **Transition Logging:** If `new_phase !== old_phase`, write to `permit_phase_transitions`.
- **Phase Anchoring:** `phase_started_at` is only updated when the phase changes, not when stalling status changes.

### Edge Cases
- **Stalled Sites:** If a project in P7 (Issued) has no inspections for > 180 days, `lifecycle_stalled` is set to `TRUE`.
- **Terminal Phases:** P19 (Cancelled) and P20 (Revoked) immediately end all trade forecasts.
- **Missing Massing:** If area is unknown, use lot-size heuristics for the cost model, but keep phase classification based purely on city signals.

---

## 5. Testing Mandate

- **Logic:** `lifecycle-phase.logic.test.ts` — 100% coverage of the pure function; tests for orphan detection, dead status filtering, and inspection stage priority.
- **Infra:** `lifecycle-phase.infra.test.ts` — Asserts that advisory locks prevent concurrent runs; verifies that `phase_started_at` remains immutable across stalled/unstalled toggles.

---

## 6. Operating Boundaries & Context

### Cross-Spec Dependencies
- **Relies on:** Permit Ingestion, CoA Linkage.
- **Consumed by:** Trade Forecast Engine (to set target dates) and Opportunity Score Engine (to set LOS).

### Future Updates
- **Admin Variable Table:** Plan to move stall thresholds (e.g., 180 days) into the `trade_configurations` table for manual tuning.
- **Refinement:** Split P12 (Rough-ins) into trade-specific triggers (P12a Plumbing, P12b Electrical).
