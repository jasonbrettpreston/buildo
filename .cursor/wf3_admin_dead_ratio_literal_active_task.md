# Active Task: WF3 — admin UI hard-codes the engine-health thresholds (0.10 dead-tuple literal)
**Status:** Implementation (lane D3, orchestrator-authorized 2026-10-14)
**Domain Mode:** Admin (`.claude/domain-admin.md`)
**Workflow:** WF3

## Context
* **Goal:** The admin dashboard colours a table's dead-tuple % amber with a hard-coded `0.10` in two places
  (`FreshnessTimeline.tsx` AEH engine-health table, `FunnelPanels.tsx` `TelemetrySection` T6 badge). The
  operator policy is "nothing hidden; all tunables in admin logic vars". The threshold must come from
  `engine_health_dead_tuple_ratio_warn_max`, the variable the runner's `execution.maintenance` dynamic arm
  (Spec 124 R-CG) and `assert_engine_health` use; it is ONE measurement, dead/(live+dead)
  (`scripts/lib/dead-tuple-ratio.js`). The sibling literals on the same lines (`1000` = `engine_health_dead_tuple_min_rows`,
  `0.80` = `engine_health_seq_scan_ratio_warn_max`, `10000` = `engine_health_seq_scan_min_rows`) are the same defect
  and are fixed by the same change. `funnel.ts` says the step "Auto-VACUUMs"; since H5 the runner does.
* **Target Spec:** `docs/specs/02-web-admin/26_admin_dashboard.md` §3.4 (Engine Health); Spec 124 R-CG; Spec 122a:391-396. 68/69: N/A.
* **Key Files:** `src/app/api/quality/route.ts`, `src/lib/quality/types.ts`, `src/components/DataQualityDashboard.tsx`,
  `src/components/FreshnessTimeline.tsx`, `src/components/funnel/FunnelPanels.tsx`, `src/lib/admin/funnel.ts`.
* **Execution Provider:** claude — Spec 08 §B downgrade logged by the orchestrator (operator 2026-10-14).

## Technical Implementation
* **Existing path reused (no new API):** the components have no logic-variable hook. Their parent,
  `DataQualityDashboard`, already fetches `GET /api/quality`, which already resolves all 7 `engine_health_*`
  rows LIVE from `logic_variables` (`loadEngineHealthThresholds`, Spec 26 §3.4). The route adds the resolved
  object to its existing payload as `engineHealthThresholds` (additive field); the dashboard passes it
  `FreshnessTimeline` → `TelemetrySection`. Before the fetch lands, the fallback is `ENGINE_HEALTH_DEFAULTS`
  (already locked to the seed by `quality.infra` / `contracts.infra`).
* **Replaces:** four hidden UI literals (0.10, 1000, 0.80, 10000) and the stale "Auto-VACUUMs" text.
* **Kept:** each component's predicate shape (FreshnessTimeline dead% has no min-rows floor; FunnelPanels has
  one); a live=0/dead>0 table still displays 100.0% dead (accurate under dead/(live+dead)).
* **Database Impact:** NO.

## Standards Compliance
* **Try-Catch Boundary:** unchanged; `loadEngineHealthThresholds` never throws, so it moves out of the
  pg_stat try block — the thresholds are emitted even when pg_stat is unreadable.
* **Unhappy Path Tests:** route emits the threshold row's value (stubbed 0.02), not the default; UI falls back to
  defaults when no thresholds prop is given.
* **logError Mandate:** no new catch blocks.
* **UI Layout:** Admin desktop-first; no layout change.

## Execution Plan
- [x] Step 1: Locate the existing data path (`/api/quality`, no hook) — done.
- [ ] Step 2: Red-first lock: extend `quality.infra.test.ts` (the existing "ONE threshold source" lock) — admin UI
      files carry no engine-health literal; the route payload carries `engineHealthThresholds` from logic_variables;
      a UI test renders the badge amber/grey per the passed threshold.
- [ ] Step 3: Fix route + types + dashboard + FreshnessTimeline + FunnelPanels + funnel.ts text; Spec 26 §3.4 Outputs/Locks.
- [ ] Step 4: Green (targeted vitest, 1 fork), typecheck, eslint.
