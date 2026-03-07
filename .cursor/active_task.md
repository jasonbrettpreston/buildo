# Active Task: WF2 — Data Quality Dashboard Redesign (Option C)
**Status:** Planning

## Context
* **Goal:** Implement the visual redesign from `docs/reports/data_quality_dashboard_redesign.md`. Several pieces are partially done (tile container, flash animations, state reset logic). Remaining work covers 8 areas below.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` (tile rendering, status logic, chain order)
  - `src/app/globals.css` (keyframe animations)
  - `src/tests/admin.ui.test.tsx` (UI tests)

## Technical Implementation

### What exists but needs rework

**Parent-Child Indentation (BROKEN):**
Current logic at line 639: `isSub` checks `indent >= 2`, so `indent: 1` children get NO margin at all — they render flush with root steps. Also, `indent: 1` steps get a `→` arrow prefix which the spec explicitly says to eliminate. The spec requires:
- `indent: 0` → no margin (root)
- `indent: 1` → `ml-6` on entire tile box (child, tucked under parent)
- `indent: 2` → `ml-12` on entire tile box (sub-dependency, deeper nesting)
- Remove `→` arrow prefix entirely — indentation replaces it

**Step Numbering (NEEDS UPGRADE):**
Current: tiny 9px plain text `{stepNum}.` — barely visible, no visual weight.
Spec: bold circular badge with background contrast: `bg-gray-100 text-gray-700 font-bold rounded-full w-5 h-5 flex items-center justify-center text-[10px]`

**Reset to Neutral (INCOMPLETE):**
Current `isPending` logic correctly identifies steps that haven't run yet in the current chain execution (via `stepDoneThisRun` chain-time comparison). But the visual reset only applies to the status dot (gray dot). With full-tile status coloring, the tile background itself must reset to neutral (`bg-white`/`bg-gray-50`) when pending. The `isPending` state must drive the tile bg class, not just the dot color.

### New Changes Required

1. **Full-tile status coloring** — Remove the 2×2px status dot div entirely. Apply status as full tile background color:
   - Fresh/Recent: `bg-green-50`
   - Running: `bg-blue-50`
   - Aging: `bg-yellow-50`
   - Failed/Stale: `bg-red-50`
   - Pending/Never run/Disabled: `bg-white` (neutral)

2. **Running tile blue flash** — Add `tile-flash-blue` CSS keyframe (blue-50 pulse) for running steps. Replace `animate-pulse` on running dot.

3. **Circular percentage badges** — Replace the horizontal bar-chart background (`barPct` div with `absolute inset-y-0`) with a small SVG donut circle (~28px) showing match %. Rendered in the right-aligned telemetry column. Number centered inside the ring. Ring color matches existing thresholds (green >= 90%, blue >= 70%, yellow >= 50%, red < 50%).

4. **Relocate Source Data Updates** — Move `sources` chain from position 0 to after `entities` (before `deep_scrapes`) in `PIPELINE_CHAINS` array so daily pipelines (Permits, CoA, Entities) appear first.

5. **Hover-hidden controls (desktop)** — Add `group` class to tile container. Wrap Run button + Toggle switch in a container with `md:opacity-0 md:group-hover:opacity-100 transition-opacity`. Always visible on mobile (no `opacity-0` without `md:` prefix).

6. **Drill-down status injection** — Add explicit `status:` row to non-funnel accordion drill-downs (currently shows Status in last-run panel but some Source Data steps and quality gates may not have `info`). Ensure all steps show their status string in the accordion.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API routes.
* **Unhappy Path Tests:** N/A — UI-only changes.
* **logError Mandate:** N/A.
* **Mobile-First:** Base classes = mobile (controls visible, tile bg colors applied). `md:` prefix only for hover-hidden desktop behavior.

## Database Impact
NO

## Execution Plan
- [x] **Standards Verification:** Mobile-first (base = mobile visible, md: = hover hidden). No API changes.
- [ ] **Viewport Mocking:** 375px viewport mock in admin.ui.test.tsx
- [ ] **Guardrail Test:** Update `src/tests/admin.ui.test.tsx`:
  - Test full-tile status bg classes replace dot (no `w-2 h-2 rounded-full` dot div)
  - Test indent-1 steps get `ml-6`, indent-2 get `ml-12` on the tile container
  - Test `→` arrow prefix is removed
  - Test step number rendered as bold badge (`font-bold rounded-full`)
  - Test pending steps have neutral bg (no green/red/yellow bg class)
  - Test circular badge SVG renders for funnel steps
  - Test source chain appears after entities chain
  - Test Run/Toggle buttons have `md:opacity-0` class
- [ ] **Red Light:** Run tests, verify new tests fail.
- [ ] **Implementation:**
  - [ ] 1. Reorder `PIPELINE_CHAINS` — move `sources` after `entities`
  - [ ] 2. Fix parent-child indentation — `indent:1` → `ml-6`, `indent:2` → `ml-12`, remove `→` arrows
  - [ ] 3. Bold step number badges — `bg-gray-100 rounded-full font-bold` circle
  - [ ] 4. Full-tile status coloring — remove dot div, apply bg class to tile container, neutral for pending
  - [ ] 5. Add `tile-flash-blue` keyframe in `globals.css` for running state
  - [ ] 6. Circular percentage badge — SVG donut replacing bar-chart background
  - [ ] 7. Hover-hidden controls — `group` + `md:opacity-0 md:group-hover:opacity-100`
  - [ ] 8. Drill-down status injection for all steps
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **Atomic Commit**
- [ ] **Spec Update:** Update `docs/specs/28_data_quality_dashboard.md` to reflect new visual paradigm.
- [ ] **Founder's Audit**
