# Queued Task: Cycle 7 — Spec 91 §3.5 CoA / Realtor wire-up
**Status:** Planning — queued behind WF1 #B (committed `ada49fb` 2026-05-09 — lifecycle.timeline[] data layer)
**Workflow:** WF1 — Feature Genesis (data-layer wire-up + admin Lead Detail Inspector + mobile flight-center delivery-app progression bar)
**Domain Mode:** Cross-Domain (Backend/Pipeline + Web Admin + Mobile) — read `.claude/domain-crossdomain.md` + `scripts/CLAUDE.md` + `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.5 + `docs/specs/02-web-admin/91_realtor_feed.md` §3.5 + `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §5

---

## Context

* **Goal:** Close the realtor-feed loop. Today the realtor feed is empty by data-layer omission (not algorithm omission) — Spec 91 §3.5 documents the architectural decision that persona-specific behavior flows through `trade_slug='realtor'` calibration rows, not algorithm branching. Cycle 7 is the data-layer wire-up that produces the realtor-row in `trades` + `trade_forecasts` so admin Test Feed Tool's `trade_slug=realtor` parameter actually returns leads instead of an empty array.

* **Mobile follow-on (also Cycle 7):** the WF1 #B data-layer (lifecycle.timeline[]) ships without a UI. Cycle 7 also delivers the admin Lead Detail Inspector lifecycle panel (chevron progression, friendly phase names, cohort comparison) AND the mobile flight-center delivery-app progression bar (Spec 77 §3.3 — UPS-style stage tracker reading the same `lifecycle.timeline[]` payload).

* **Target Specs:**
  - `docs/specs/02-web-admin/91_realtor_feed.md` §3.5 — CoA / realtor wire-up (specifically the trade_slug='realtor' calibration source path: which permits flow into the realtor feed and how the algorithm scores them via the existing `compute-trade-forecasts` + `compute-opportunity-scores` chain steps without any algorithm branching)
  - `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.5 — Inspector lifecycle panel UI (chevron arrows, no icons per user direction, top placement, uncompleted stages with estimated days)
  - `docs/specs/03-mobile/77_flight_center.md` §3.3 — delivery-app progression bar UI

* **Key Files (anticipated — refine at WF1 plan-lock):**
  - `migrations/12N_realtor_trade_calibration_seeds.sql` — seed `trades` + `trade_forecasts` rows for the realtor persona
  - `scripts/seeds/trade_configurations.json` — append realtor row(s)
  - `src/components/admin/LeadDetailInspector/LifecycleTimelinePanel.tsx` — NEW
  - `mobile/src/components/FlightJobProgressionBar.tsx` — NEW (reads lifecycle.timeline[] from existing endpoint)
  - Tests: realtor-trade-config.logic.test.ts, lifecycle-timeline-panel.ui.test.tsx, flight-job-progression-bar.test.tsx

## Why this is queued separately
- WF1 #B was Path A (data-layer only) per user direction. The UI surfaces (admin inspector + mobile progression bar) plus the realtor backend wire-up are larger surfaces with distinct review cadence.
- The user explicitly directed: "Great idea! Proceed with plan A — file Cycle 7 as the next WF after this ships."
- Persona architecture rule (Spec 95 §2.5.1): persona-specific behavior is expressed via DB calibration only (a row in `trades` + a row in `trade_forecasts`), never via algorithm branching. Cycle 7 is the data-only wire-up that delivers on that rule.

## Pre-WF1 actions
- Re-read `docs/specs/02-web-admin/91_realtor_feed.md` §3.5 in full (anchor for the wire-up plan)
- Verify `compute-trade-forecasts` + `compute-opportunity-scores` are unchanged from WF1 #B baseline (`ada49fb`) — Cycle 7 must not touch those scripts
- Confirm the WF1 #B inspector data-layer (lifecycle.timeline[]) is rendering correctly in the admin UI before adding the chevron progression component
