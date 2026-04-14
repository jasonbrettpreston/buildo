# Active Task: Resolve permit_phase_transitions dead write
**Status:** Planning (DECISION-BLOCKED)
**Domain Mode:** Backend/Pipeline
**Finding:** H-W17 · 84-W4, 86-W6, RC-W4

**Blocked by Decision D4:** `scripts/classify-lifecycle-phase.js` writes every phase change to `permit_phase_transitions` (with `neighbourhood_id` included). Zero consumers exist — `compute-timing-calibration-v2.js` (the intended consumer per spec 84) mines `permit_inspections` directly instead. Three resolution options:

- **D4-A (spec 84 intent):** Wire `compute-timing-calibration-v2.js` to consume `permit_phase_transitions` as a richer calibration signal (covers P3-P8 + orphan transitions that inspections never reach). Scope = WF2 enhancement of 86, not WF3. Est 1-2 days.
- **D4-B (simplify):** Drop `permit_phase_transitions` writes from 84 + drop the table. Scope = narrow WF3. Est 2h.
- **D4-C (defer decision):** Keep as observability-only; add admin UI tile + `telemetry_tables` manifest entry so bloat is monitored. Scope = WF3 manifest-only + future WF1 for UI. Est 1h for the manifest fix.

**This plan is a SKELETON** — the actual execution plan fills out differently per D4 choice. Sections below cover all three branches.

## Context
* **Goal:** Resolve the contradiction between "84 writes every transition to a dedicated audit table" and "the advertised consumer (86) never reads it." Current state: wasted writes, unbounded table growth (84-D2), invisible bloat (RC-W4), and spec-intent/implementation divergence.
* **Target Spec:** `docs/specs/product/future/84_lifecycle_phase_engine.md` (section declaring table purpose + consumer ownership per H-S34) + `docs/specs/product/future/86_control_panel.md` if wiring calibration consumer
* **Key Files:**
  - `scripts/classify-lifecycle-phase.js` (writes at L434, L592)
  - `scripts/compute-timing-calibration-v2.js` (intended consumer per D4-A)
  - `migrations/086_predictive_timing_schema.sql` (table definition)
  - `scripts/manifest.json` (`classify_lifecycle_phase.telemetry_tables` — must add the table regardless of D4 choice)

## Technical Implementation (by D4 choice)

### D4-A (wire calibration to consume transitions)
* New query in 86 using `permit_phase_transitions` LAG pairs instead of `permit_inspections` LAG pairs.
* Merge strategy with existing inspection-based calibration: (a) replace entirely, (b) supplement for pre-inspection phases.
* Requires clarification of spec 86's intent for ISSUED synthetic phase under the transitions-based model.

### D4-B (drop the table)
* Delete writes at `classify-lifecycle-phase.js` L413–440 (the transition insert block) and L591–605 (Phase 2c initial transitions backfill).
* Migration to DROP TABLE `permit_phase_transitions` — requires explicit user confirmation per Prime Directive safety rules.
* Remove `neighbourhood_id` from table (already dropped) + associated indexes.

### D4-C (observability-only)
* Add `"permit_phase_transitions"` to `classify_lifecycle_phase.telemetry_tables` in manifest.
* Pre-flight bloat gate now covers the table automatically.
* File a WF1 for admin UI transition-browser tile (tracked separately in `docs/reports/review_followups.md`).
* Document in spec 84 as "future analytics — not consumed by 86 calibration."

## Standards Compliance
* **Try-Catch Boundary:** N/A.
* **Unhappy Path Tests:**
  - D4-A: calibration output with/without transitions data, verify percentile math.
  - D4-B: re-run classify-lifecycle-phase with writes removed → verify no table reference errors; run full chain → still passes.
  - D4-C: pre-flight bloat gate surfaces `permit_phase_transitions` row in `pre_flight_audit`.
* **logError Mandate:** N/A.
* **Mobile-First:** N/A.

## Execution Plan (skeleton — expand per D4)

- [ ] **Rollback Anchor:** Record Git SHA.
- [ ] **State Verification:** Query row count + size of `permit_phase_transitions`. Confirm D4 decision.
- [ ] **Spec Review:** Read spec 84 + 86; identify the single line that should codify D4.
- [ ] **Reproduction:** Per-D4 test fixture — see Technical Implementation section.
- [ ] **Red Light:** Run tests — expected to fail for the chosen path.
- [ ] **Fix:** Execute D4-A, D4-B, or D4-C as selected.
- [ ] **Pre-Review Self-Checklist (D4-agnostic):**
  1. Is the table referenced anywhere other than 84 (write) and 86 (intended)? Grep `permit_phase_transitions` across `src/` and `scripts/`.
  2. Does `scripts/admin/` or `src/app/api/admin/` surface this table anywhere?
  3. For D4-A: does inspection-based calibration produce systematically different results than transition-based? Compare on a sample.
  4. For D4-B: is there any historical analytics script that queries this table? Last 90 days of commits reviewed.
  5. For D4-C: what's the long-term retention plan if nobody reads it?
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6.

**PLAN COMPLIANCE GATE:**
- ✅ DB: D4-B requires DROP TABLE (destructive — confirm with user explicitly per CLAUDE.md §7); D4-A + D4-C no schema change
- ⬜ API: N/A
- ⬜ UI: D4-C implies future WF1
- ✅ Shared Logic: No dual-path
- ✅ Pipeline: D4-A requires transaction boundaries on new calibration query per §9.1; consult WF3-03

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)** — AFTER D4 is selected
