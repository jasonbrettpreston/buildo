# Active Task: Orphan phase contract across producer + consumers
**Status:** Planning
**Domain Mode:** Backend/Pipeline
**Finding:** H-W14 · 84-W1, 82-W7, 85-W9

**Blocked by Decision D3:** Spec 84 must declare the intended orphan-phase archive policy before this WF3 can start. Three options (per SEQUENCING.md D3):
- (a) Archive-immediately: add O1/O2/O3 to `TERMINAL_PHASES` in `update-tracked-projects.js`; orphan-tracked leads auto-archive the first time this script sees them.
- (b) Assign ordinals: add `O1: -8, O2: -7, O3: -7` (or similar) to `PHASE_ORDINAL` in shared lib; 82's `isWindowClosed` logic works naturally against `work_phase` ordinal.
- (c) Custom routing: add explicit orphan handling branches in 82 + 85.

This plan assumes **option (b) + (a) hybrid** — give orphans ordinals so 85 can forecast them (if desired) AND add them to TERMINAL_PHASES so 82 archives them. Revise if D3 lands differently.

## Context
* **Goal:** Close the producer-consumer contract break where `classify-lifecycle-phase.js` writes `O1/O2/O3` phase values but `PHASE_ORDINAL` in the shared lib has no entries for them, leaving `update-tracked-projects.js` with `undefined` ordinals and silently-stuck orphan leads that never archive.
* **Target Spec:** `docs/specs/product/future/84_lifecycle_phase_engine.md` (add orphan consumer policy section per H-S31; spec 82 archive contract per H-S23)
* **Key Files:**
  - `scripts/lib/lifecycle-phase.js` (PHASE_ORDINAL + TERMINAL sets — shared lib; single source of truth)
  - `scripts/update-tracked-projects.js` (L29 TERMINAL_PHASES hardcode — remove or align with shared lib)
  - `scripts/compute-trade-forecasts.js` (L29 SKIP_PHASES — already contains O1/O2/O3 but not coordinated with PHASE_ORDINAL)
  - `src/lib/classification/lifecycle-phase.ts` (TS counterpart — §7.1 dual-path must stay in sync)

## Technical Implementation
* **New/Modified Components:**
  - Shared-lib `PHASE_ORDINAL` gains O1/O2/O3 entries.
  - 82's TERMINAL_PHASES sourced from shared-lib exports (removes duplication per 82-D3).
  - Remove `O4` from VALID_PHASES (dead code — 84-W10) in the same change.
* **Data Hooks/Libs:** `scripts/lib/lifecycle-phase.js` + its TS counterpart must stay in sync (§7.1).
* **Database Impact:** NO — runtime-only shared-lib changes. Existing `permits.lifecycle_phase` rows with O1/O2/O3 values become correctly routed without any data mutation.

## Standards Compliance
* **Try-Catch Boundary:** N/A.
* **Unhappy Path Tests:** (a) permit with `lifecycle_phase='O2'` → `isWindowClosed` now returns true in 82 → auto-archive fires. (b) permit with unknown `lifecycle_phase='X99'` (still not in PHASE_ORDINAL) → defensive else-branch returns false, plus WARN log (per H-S31 spec'd behaviour).
* **logError Mandate:** N/A.
* **Mobile-First:** N/A.

## Execution Plan
- [ ] **Rollback Anchor:** Record Git SHA.
- [ ] **State Verification:** Query `SELECT lifecycle_phase, COUNT(*) FROM permits GROUP BY 1 ORDER BY 2 DESC;` — confirm O1/O2/O3 rows exist and quantify. Query `tracked_projects` for orphan-phase leads currently stuck.
- [ ] **Spec Review:** Await D3. Once decided, read spec 84 section on orphan phases; verify spec decision matches this plan's approach.
- [ ] **Reproduction:** Extend `src/tests/classification.logic.test.ts` (or `src/tests/update-tracked-projects.logic.test.ts`). Fixture: tracked_project at `lifecycle_phase='O2'` with `work_phase_target='P12'`. Assert `isWindowClosed === true` → update row has `status='archived'`. Also assert that `compute-trade-forecasts.js` still correctly skips O1/O2/O3 (SKIP_PHASES L29) regardless of their new ordinals.
- [ ] **Red Light:** Run tests. MUST fail because `PHASE_ORDINAL.O2` is undefined today.
- [ ] **Fix:**
  1. Shared lib `scripts/lib/lifecycle-phase.js`: add O1/O2/O3 to PHASE_ORDINAL with agreed ordinals (pending D3). Remove O4 from VALID_PHASES. Update the `// Single source of truth` comment at L470 to be accurate (it currently falsely claims `compute-timing-calibration-v2.js` imports PHASE_ORDINAL — fix separately in WF3 around 86-W4 if not bundled here).
  2. TS counterpart `src/lib/classification/lifecycle-phase.ts`: mirror the same changes byte-for-byte (§7.1).
  3. `scripts/update-tracked-projects.js` L29: replace local `TERMINAL_PHASES=Set(['P19','P20'])` with import from shared lib (`TERMINAL_PHASES` already exported as `TERMINAL_P20_SET` ∪ `WINDDOWN_P19_SET`), OR explicit `new Set(['P19','P20','O1','O2','O3'])` depending on D3.
  4. Add WARN log in 85 L204 when `PHASE_ORDINAL[lifecycle_phase]` is undefined → `skipped++; continue;` — closes 85-W9 defensive gap as part of the same change.
  5. Remove O4 from `compute-trade-forecasts.js` L29 SKIP_PHASES.
- [ ] **Pre-Review Self-Checklist:**
  1. Does `SKIP_PHASES` in 85 still correctly exclude O1/O2/O3 from forecast generation even though they now have ordinals? (Yes — SKIP is checked first at L192.)
  2. Does adding ordinals to O1/O2/O3 affect the `classify_lifecycle_phase` script itself? (No — it writes the phase string; ordinals are consumer-side only.)
  3. Does the change run the classification test suite clean? `npx vitest run src/tests/classification.logic.test.ts`
  4. Does the TS counterpart test pass? `npx vitest run src/tests/classification.ts.test.ts` (or equivalent)
  5. Are there any hidden consumers of `VALID_PHASES` that would break on O4 removal? Grep.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6.

**PLAN COMPLIANCE GATE:**
- ✅ DB: None
- ⬜ API: N/A
- ⬜ UI: N/A
- ✅ Shared Logic: §7.1 dual-code-path — JS + TS must land in same PR · SKIP_PHASES in 85 verified
- ✅ Pipeline: §9 N/A (no mutation changes)

**PLAN LOCKED. Do you authorize this Bug Fix plan? (y/n)**
