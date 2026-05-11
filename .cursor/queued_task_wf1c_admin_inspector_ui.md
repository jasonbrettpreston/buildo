# Active Task: WF1 #C — Cycle 7 — Admin Lifecycle Timeline panel UI + Realtor end-to-end Maestro coverage
**Status:** Implementation
**Workflow:** WF1 (Genesis — new admin UI component consuming the WF1 #B `lifecycle.timeline[]` data layer + closes Spec 91 §3.5 item 5 with a realtor end-to-end Maestro flow)
**Domain Mode:** Cross-Domain (Web Admin + Mobile/Maestro)
**Domain Files Read:** `.claude/domain-crossdomain.md` ✓ + `docs/specs/02-web-admin/33_web_admin_engineering_protocol.md` ✓ (web-admin authority — desktop-first per §2 + §9; Server Components by default, Client Components only when interactive per §3) + `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.5 ✓ + `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §5 ✓ (Inspector Lifecycle Timeline section, written in WF1 #B) + `docs/specs/03-mobile/95_mobile_user_profiles.md` §2.5.1 ✓ (persona vs trade_slug separation) + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (read-only — referenced by audit step) + `docs/specs/03-mobile/91_mobile_lead_feed.md` §3.5 ✓ (Cycle 7 wire-up dependencies). §11 Plan Compliance Checklist applied silently.
**Rollback Anchor:** `ada49fb` (current HEAD on `main` — WF1 #B lifecycle.timeline[] data layer + 84-W4 closure)
**Multi-Agent Review:** REQUIRED per WF1 cadence — Gemini + DeepSeek + worktree code-reviewer in parallel post-Implementation. The user explicitly emphasized this. R10 surfaced 4 BUGs in WF1 #B (NOW() in INSERT loop, ::INTEGER truncation, records_total, daysBetween clamp); the same diligence applies here.

---

## Context

* **Goal:** Ship the user-facing surface of the WF1 #B data layer. Build `LifecycleTimelinePanel.tsx` — a desktop-first React Client Component that renders the `lifecycle.timeline[]` array (completed + current + upcoming phase entries with cohort percentile comparison) at the top of the admin Lead Detail Inspector. Close Spec 91 §3.5 item 5 by writing a Maestro flow exercising the realtor onboarding → feed → save end-to-end path that is currently the only un-shipped piece of the realtor backend wire-up.

* **Why now:** WF1 #B's `lifecycle.timeline[]` payload is verified live (`21 173458 BLD` returns the 2-entry timeline correctly) but no UI consumes it — operators currently have to JSON-tree-view the response to see cohort comparisons. The realtor backend is otherwise complete; only the Maestro coverage is missing per Spec 91 §3.5 item 5. Both gaps close with a single WF.

* **Target Specs:**
  - **Web Admin:** `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.5 (Lead Detail Inspector) + `docs/specs/02-web-admin/33_web_admin_engineering_protocol.md` (web-admin engineering authority)
  - **Pipeline (read-only, consumer view):** `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §5 Inspector Lifecycle Timeline (the contract this panel renders)
  - **Mobile (Maestro):** `docs/specs/03-mobile/91_mobile_lead_feed.md` §3.5 item 5 (realtor end-to-end test gap)

* **Key Files (anticipated; refined at R5):**
  - **NEW `src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx`** — the panel component
  - **MODIFY `src/components/admin/LeadDetailInspector.tsx`** — mount the new panel at the top of the result region (Cycle 7 user direction: "Place at top of detail panel"). Currently the Lifecycle panel is one of 8 chain-step panels; the timeline is a separate visual surface that sits ABOVE the panel grid.
  - **NEW `src/tests/lifecycle-timeline-panel.ui.test.tsx`** — RTL component tests
  - **NEW `mobile/maestro/realtor_end_to_end.yaml`** — Maestro flow closing Spec 91 §3.5 item 5
  - **NO** new types/hooks: the existing `LeadInspect` schema in `src/lib/admin/lead-schemas.ts` already exposes `lifecycle.timeline[]` (added in WF1 #B); the existing `useLeadInspect` hook already returns it.

## Cycle 7 — Realtor wire-up audit (R2 — read-only verification before main work)

Spec 91 §3.5 enumerates 5 items. Audit each against current `main` state:

| # | Requirement | Verification target | Expected state |
|---|---|---|---|
| 1 | TRADES array entry `id:33, slug:'realtor'` | `src/lib/classification/trades.ts:51` | ✅ Confirmed at scope-check; verify still landed |
| 2 | DB seed (mig 118) | `migrations/118_realtor_trade.sql` + applied to live DB | ✅ Confirmed; verify mig 118 row in `_migrations` table |
| 3 | `trade_configurations` calibration row | mig 118 product decision: `bid_phase_cutoff:P1` + `work_phase_target:P19` | ✅ Confirmed in mig 118 docstring; verify `SELECT * FROM trade_configurations WHERE trade_slug='realtor'` returns 1 row with the recorded values |
| 4 | `permit_trades` association via 3-axis gate | `scripts/backfill-realtor-permit-trades.js` + `src/tests/db/realtor-gating.db.test.ts` | ✅ Confirmed by WF3 commit `779ec88` ("refine shouldAppendRealtor with 3-axis gating"). Verify the script is registered in `scripts/manifest.json` and runs in the chain. |
| 5 | Tests — logic + infra ✅ exist; **Maestro flow absent** | `mobile/maestro/realtor_*` does not exist (verified at scope-check) | **GAP — primary deliverable of this WF for the realtor track.** |

If items 1-4 fail any verification, halt and re-plan. R2 is a no-write step.

## Technical Implementation

* **New/Modified Components:**
  - `LifecycleTimelinePanel.tsx` (new) — Client Component (`'use client'`) per Spec 33 §3 (interactive: tooltip-on-hover for cohort details). Props: `timeline: LeadInspectTimelineEntry[]` + optional `loading` flag. Renders three sub-regions: completed (chronological) → current (highlighted) → upcoming (faded). Chevron arrows (`<ChevronRight>` from `lucide-react` per Spec 33 §4) separate adjacent stages. **No icons per phase per user direction.** Each entry: `phase_name` (friendly name) + days indicator + cohort comparison.
  - `LeadDetailInspector.tsx` (modified) — mount `<LifecycleTimelinePanel timeline={data.lifecycle.timeline} />` ABOVE the existing panel grid. The existing Lifecycle panel (one of 8) stays as-is — it's the structured field dump (`phase`, `phase_started_at`, etc.); the new panel is the visualized timeline. Two surfaces, one feeding the other through the same `data.lifecycle` payload.

* **Data Hooks/Libs:** N/A — no new hooks; consumes existing `LeadInspect.lifecycle.timeline` from the WF1 #B schema. `phaseName()` helper from `src/lib/classification/phase-names.ts` already exists (WF1 #B). No new lib code.

* **Database Impact:** NO. Pure UI consumer of an already-shipped data layer.

* **Visual contract (locked at plan-lock for R10's reference):**
  - **Chevron progression:** `Phase Name → Phase Name → Phase Name` with `<ChevronRight size={14}>` between adjacent stages.
  - **Days indicator:** completed = "{N}d" (actual); current = "{N}d in progress"; upcoming = "~{cohort_median_days}d".
  - **Cohort comparison:** completed = inline "(typical: {p25}-{p75}d)"; current = colored sparkline-style indicator vs `p25`/`p75` band (green if < p25, amber if p25-p75, red if > p75 — stall band per Spec 84 §7); upcoming = pale "(typical: {p25}-{p75}d, n={sample_size})".
  - **Reliability marker:** when `cohort_sample_size < 30`, show a `<Info>` icon hint with tooltip "Cohort sample {N} — calibration is unreliable (Spec 84 §7)".
  - **Terminal phase handling:** when `currentPhase ∈ {P18, P19, P20, O3}` the upcoming region renders nothing (canonical lifecycle end).
  - **Off-path phase handling:** when `remainingPhases()` returns `[]` (currentPhase not in `STANDARD_PHASE_PATH_BY_PERMIT_TYPE` for the permit's `permit_type`), render no upcoming region + add a low-emphasis "off-canonical-path" marker. This is the 84-W11 inherited limitation surface.
  - **Empty timeline:** when `timeline.length === 0` (permitType or currentPhase null per `build-lifecycle-timeline.ts:116`), render a deliberate empty state — "Lifecycle data unavailable for this permit" — NOT a blank canvas (Spec 33 §9).

* **UI Layout:** Web Admin = **desktop-first** per Spec 33 §2 + §9 (overrides §11 mobile-first checklist's default — admin protocol is authoritative for `src/components/admin/**`). Base classes target 1280px+ desktop; `md:` breakpoint at 768px tablet adds horizontal scrolling for long timelines (P1 → P20 has 23 entries — overflow-x-auto on the timeline container). Touch targets ≥44px on the cohort-tooltip-trigger info icons.

* **Maestro flow (`mobile/maestro/realtor_end_to_end.yaml`):**
  - Pre-condition: a test realtor account exists in the DB seed.
  - Steps: launch app → onboarding completes path R (realtor) per Spec 94 §4 → land on `(app)/index.tsx` lead feed → assert at least 1 lead card renders (proves `getLeadFeed({trade_slug:'realtor'})` returns non-empty) → tap card → assert detail screen renders → tap save → assert flight-board has the saved lead → unsave to leave a clean state.
  - Spec 91 §3.5 item 5 requires this; WF3 commit `779ec88` made the algorithm correct, but no E2E asserts an actual realtor user can use the app.

## Standards Compliance

* **Try-Catch Boundary:** N/A (no new API routes; existing `/api/admin/leads/inspect/:id` already wraps per Spec 76 §2.6 + Spec 33 §13). Component-level error handling: parse-error UI surface re-uses the existing `LeadInspectError` discriminated union from `useLeadInspect` (WF1 #B).
* **Unhappy Path Tests:** UI cases — empty timeline (permitType null), terminal phase (no upcoming), off-canonical-path phase (84-W11 surface), unreliable cohort (`sample_size < 30`), missing calibration row (cohort fields all null). Each is one RTL test in `lifecycle-timeline-panel.ui.test.tsx`.
* **logError Mandate:** N/A (Client Component — `console.error` allowed per Spec 33 §5 anti-pattern carve-out for non-server code).
* **UI Layout:** **Desktop-first per Spec 33 §2 + §9** (admin protocol overrides §11 mobile-first checklist). Touch targets ≥44px on tooltip triggers per Spec 33 §9. Single light theme per Spec 33 §2 — no `dark:` variants.

## Execution Plan

- [ ] **R1 — Domain mode + spec reads.** Confirmed above. Read all 6 spec sections in parallel before this plan was written.

- [ ] **R2 — Realtor wire-up audit (read-only).** Verify items 1-4 from Spec 91 §3.5 are fully shipped on `main` `ada49fb`:
  - `Grep` for `slug: 'realtor'` in `src/lib/classification/trades.ts` (item 1)
  - `Bash` query: `SELECT * FROM _migrations WHERE name LIKE '%118%'` (item 2)
  - `Bash` query: `SELECT trade_slug, bid_phase_cutoff, work_phase_target FROM trade_configurations WHERE trade_slug='realtor'` (item 3)
  - `Grep` `manifest.json` for `backfill_realtor_permit_trades` registration (item 4)
  - Verify `src/tests/db/realtor-gating.db.test.ts` and `src/tests/realtor-availability-guard.logic.test.ts` exist + pass on `main` (item 5 logic+infra portion)
  Item 5 Maestro portion: confirmed missing at scope-check; deliverable of R6.

- [ ] **R3 — Live verify pre-existing inspector against a permit known to have a rich timeline.** Use `21 173458 BLD` (verified in WF1 #B with 2-entry timeline) AND find a non-terminal permit (e.g. `currentPhase ∈ {P10, P11, P12}`) with cohort data so the upcoming-region rendering can be designed against real shapes. Capture the actual `lifecycle.timeline[]` JSON structure and pin it as a fixture for R4.

- [ ] **R4 — Red Light tests.** Write the failing tests FIRST per WF1 cadence:
  1. `src/tests/lifecycle-timeline-panel.ui.test.tsx` (NEW) — 8 RTL tests:
     - Renders all completed entries with chevron between (chronological order preserved)
     - Renders current entry with highlight + "in progress" suffix + cohort-band color
     - Renders upcoming entries with predicted days from `cohort_median_days`
     - Empty timeline → empty-state copy (not blank)
     - Terminal phase → no upcoming region
     - Off-canonical-path → no upcoming + low-emphasis marker
     - `sample_size < 30` → unreliable info icon present + tooltip text correct
     - Missing calibration row (`cohort_median_days === null`) → fallback "no calibration data" cohort hint, not "0d"
  2. `mobile/maestro/realtor_end_to_end.yaml` (NEW) — Maestro flow per the spec contract above. Test framework is the existing Maestro setup (Spec 98 mobile testing protocol).
  3. **Verify all tests fail before R5** — Red Light is the discipline that prevents accidentally-passing tests from a happy-path component that ignores edge cases.

- [ ] **R5 — Implementation.**
  1. `src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx` (NEW) — Client Component per the visual contract above. Pure rendering; all logic delegated to the inputs. Uses `lucide-react` `<ChevronRight>` and `<Info>` (Spec 33 §4 icon library mandate).
  2. `src/components/admin/LeadDetailInspector.tsx` (MODIFY) — import and mount `<LifecycleTimelinePanel>` in the result-state section, ABOVE the existing 8-panel grid. Verify the schema exposes `data.lifecycle.timeline` (it does per WF1 #B `LeadInspectLifecycleSchema` extension).
  3. Run `npm run typecheck` after each file lands.

- [ ] **R6 — Green Light verification.**
  - `npm run test` — full vitest suite passes (5184+ baseline).
  - `npm run lint -- --fix` — Biome/ESLint clean.
  - `npm run typecheck` clean.
  - **Manual UI verification** per CLAUDE.md "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete."
    - `npm run safe-start` (per WF11) — Next.js dev server.
    - Navigate to `/admin/lead-feed/inspector?id=<permit_id>` — three permits to manually verify:
      1. Terminal: `21 173458 BLD` (P18 — no upcoming)
      2. Mid-pipeline: a permit at P10/P11 with rich cohort data (find one in R3)
      3. Off-path: a permit whose `currentPhase` isn't in `STANDARD_PHASE_PATH_BY_PERMIT_TYPE` (84-W11 surface — find via `WHERE NOT IN` query)
    - Confirm chevron progression renders, cohort bands color correctly, terminal phase doesn't show upcoming, off-path shows the marker.
  - **Maestro verification** — `maestro test mobile/maestro/realtor_end_to_end.yaml` passes against a running Expo dev build (per Spec 98 + WF12 safe-start).

- [ ] **R7 — Pre-Review Self-Checklist (Spec 33 §11 / WF1 mandate).** 5-10 self-skeptical items derived from Spec 76 §3.5 + Spec 84 §5 + Spec 33's anti-patterns. Walk each against the actual diff. Output PASS/FAIL per item BEFORE invoking R8. Examples likely to land:
  - Component is `'use client'` (Spec 33 §3 — interactive)
  - No `useEffect` for data fetching (Spec 33 §5 anti-pattern; consumes parent's `useLeadInspect` via prop)
  - Touch targets ≥44px on tooltip triggers (Spec 33 §9)
  - No PII in `console.log` (Spec 33 §5)
  - Cohort math display: never divides by 0 when `sample_size === 0`
  - Terminal phase suppression matches `STANDARD_PHASE_PATH_BY_PERMIT_TYPE` exactly
  - 84-W11 inherited limitation: off-path marker is rendered, NOT silently hidden

- [ ] **R8 — Multi-Agent Review (REQUIRED per WF1 cadence + user emphasis "ensure adversarial research reviews are used").** Three reviewers in parallel — single message, three tool calls:
  1. **Gemini adversarial:** `npm run review:gemini -- review src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx --context docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` — spec-vs-code drift, edge cases, missing UI states.
  2. **DeepSeek adversarial:** `npm run review:deepseek -- review src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx --context docs/specs/01-pipeline/84_lifecycle_phase_engine.md` — cohort math display correctness, terminal-phase logic, off-path handling. Spec 84 §5 is the contract authority for the timeline shape.
  3. **Worktree code-reviewer (Agent + isolation:worktree):** Full diff against Spec 76 §3.5 + Spec 33 §3/§4/§5/§9/§13. Generates own checklist from those sections; reports PASS/FAIL with line numbers.

  Triage: BUG → fix in-loop before R9 (precedent: WF1 #B applied 4 of 6 reported bugs). DEFER → catalogue in `docs/reports/review_followups.md` with rejection rationale or future-WF candidate marker.

- [ ] **R9 — Apply review fixes + re-verify.** If R8 surfaces BUGs, fix + re-run `npm run test` + manual browser re-verify. If only DEFERrals, append to `review_followups.md`.

- [ ] **R10 — Atomic commit + push + close active task.**
  - Commit message format follows the WF1 #B precedent (`feat(76_lead_feed_health_dashboard): WF1 #C — Cycle 7 admin lifecycle timeline panel + realtor Maestro coverage`).
  - Operator runbook footer in commit message (e.g. "no migration; first deploy renders the new panel automatically — verify at `/admin/lead-feed/inspector?id=<permit>`").
  - `git push origin main` after Husky pre-commit gate (typecheck + lint + test) passes.
  - Mark this active_task Status = Done in the post-commit cleanup turn.

---

> **PLAN LOCKED. Do you authorize this WF1 #C plan? (y/n)**
>
> §10 note: web admin UI Layout is **desktop-first** per Spec 33 §2 + §9 — this overrides the §11 Plan Compliance Checklist's default mobile-first guidance because the admin protocol (Spec 33) is authoritative for `src/components/admin/**`. All other §11 items either don't apply (no DB migration, no API route, no pipeline script, no shared classification logic touched) or are silently addressed in the relevant R-step above. Mobile-first applies to the new `mobile/maestro/realtor_end_to_end.yaml` Maestro flow, which exercises the Expo app at default mobile viewport.
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
