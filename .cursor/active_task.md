# Active Task: WF1 #C — Cycle 7 — Admin Lifecycle Timeline panel UI + Realtor end-to-end Maestro coverage
**Status:** Done (committed 2026-05-11 — R0 plan review + R8 multi-agent review applied; 8 BUGs fixed in-loop)
**Workflow:** WF1 (Genesis — new admin UI component consuming the WF1 #B `lifecycle.timeline[]` data layer + closes Spec 91 §3.5 item 5 with a realtor end-to-end Maestro flow)
**Domain Mode:** Cross-Domain (Web Admin + Mobile/Maestro)
**Domain Files Read:** `.claude/domain-crossdomain.md` ✓ + `docs/specs/02-web-admin/33_web_admin_engineering_protocol.md` ✓ (web-admin authority — desktop-first per §2 + §9; Server Components by default, Client Components only when interactive per §3) + `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.5 ✓ + `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §5 ✓ (Inspector Lifecycle Timeline section, written in WF1 #B) + `docs/specs/03-mobile/95_mobile_user_profiles.md` §2.5.1 ✓ (persona vs trade_slug separation) + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (read-only — referenced by audit step) + `docs/specs/03-mobile/91_mobile_lead_feed.md` §3.5 ✓ (Cycle 7 wire-up dependencies). §11 Plan Compliance Checklist applied silently.
**Rollback Anchor:** `1967733` (current HEAD on `main` — WF3 #realtor-backfill end-to-end + 4 findings closed)
**Multi-Agent Review:** REQUIRED per WF1 cadence — Gemini + DeepSeek + worktree code-reviewer in parallel post-Implementation. Plus an additional **pre-implementation Gemini review of this PLAN** (R0, per user direction 2026-05-11 — "Let's use gemini to code reviewer to review the detailed plan you create for approval").

---

## Context

* **Goal:** Ship the user-facing surface of the WF1 #B data layer. Build `LifecycleTimelinePanel.tsx` — a desktop-first React Client Component that renders the `lifecycle.timeline[]` array (completed + current + upcoming phase entries with cohort percentile comparison) at the top of the admin Lead Detail Inspector. Close Spec 91 §3.5 item 5 by writing a Maestro flow exercising the realtor onboarding → feed → save end-to-end path that became testable as of WF3 #realtor-backfill (commit `1967733`).

* **Why now:** WF1 #B's `lifecycle.timeline[]` payload is verified live (`21 173458 BLD` returns the 2-entry timeline correctly) but no UI consumes it — operators currently have to JSON-tree-view the response to see cohort comparisons. The realtor backend now actually produces non-empty feed results (WF3 #realtor-backfill closed the 4 findings that prevented `permit_trades` realtor rows from being written). Both gaps close with a single WF.

* **Target Specs:**
  - **Web Admin:** `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.5 (Lead Detail Inspector) + `docs/specs/02-web-admin/33_web_admin_engineering_protocol.md` (web-admin engineering authority)
  - **Pipeline (read-only, consumer view):** `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §5 Inspector Lifecycle Timeline (the contract this panel renders)
  - **Mobile (Maestro):** `docs/specs/03-mobile/91_mobile_lead_feed.md` §3.5 item 5 (realtor end-to-end test gap)

* **Key Files (anticipated; refined at R5):**
  - **NEW `src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx`** — the panel component
  - **NEW `src/lib/admin/lifecycle-timeline-utils.ts`** — pure helper for cohort-band classification (R0 Gemini MED: rendering logic needs a testable home, not inline JSX). At minimum: `classifyCohortBand(days, p25, p75): 'on-track' | 'amber' | 'stalled' | 'no-data'`. Unit-tested in `src/tests/lifecycle-timeline-utils.logic.test.ts` (also new).
  - **MODIFY `src/components/admin/LeadDetailInspector.tsx`** — mount the new panel at the top of the result region (Cycle 7 user direction: "Place at top of detail panel"). Currently the Lifecycle panel is one of 8 chain-step panels; the timeline is a separate visual surface that sits ABOVE the panel grid.
  - **NEW `src/tests/lifecycle-timeline-panel.ui.test.tsx`** — RTL component tests
  - **NEW `src/tests/lifecycle-timeline-utils.logic.test.ts`** — pure-function tests for the cohort-band helper
  - **NEW `src/tests/fixtures/lifecycle-timeline-*.fixture.json`** (3 files) — pinned canonical timeline payloads captured at R3 from real permits: terminal-phase, mid-pipeline, off-canonical-path. Replaces the original "find permits live" approach (R0 Gemini MED: non-hermetic).
  - **NEW `mobile/maestro/realtor_end_to_end.yaml`** — Maestro flow closing Spec 91 §3.5 item 5
  - **NO** new types/hooks for the data layer: the existing `LeadInspect` schema in `src/lib/admin/lead-schemas.ts` already exposes `lifecycle.timeline[]` (added in WF1 #B); the existing `useLeadInspect` hook already returns it. The one new piece of `src/lib/` code is the cohort-band helper above.

## Cycle 7 — Realtor wire-up audit (R2 — read-only verification before main work)

Spec 91 §3.5 enumerates 5 items. Status as of `1967733` (2026-05-11):

| # | Requirement | Current state |
|---|---|---|
| 1 | TRADES array entry `id:33, slug:'realtor'` | ✅ **SHIPPED** (commit `2901fcd`, `src/lib/classification/trades.ts:51`) |
| 2 | DB seed (mig 118) | ✅ **SHIPPED** (`migrations/118_realtor_trade.sql`; applied to live DB) |
| 3 | `trade_configurations` calibration row | ✅ **SHIPPED** (mig 118 seeds `bid_phase_cutoff:P1, work_phase_target:P19`) |
| 4 | `permit_trades` association via 3-axis gate | ✅ **SHIPPED** (commit `1967733` — `backfill-realtor-permit-trades.js` now in manifest at chain step 14, lock 114, 3-axis gate enforced, 68,787 eligible permits already covered live) |
| 5 | Tests — logic + infra ✅ exist; **Maestro flow** | ❌ **GAP — primary deliverable of this WF's mobile track.** `mobile/maestro/realtor_*` does not exist. |

R2 is therefore mostly a sanity re-check (item 4 was just shipped). If items 1-4 fail any verification, halt and re-plan; otherwise proceed to R3.

## Technical Implementation

* **New/Modified Components:**
  - `LifecycleTimelinePanel.tsx` (new) — Client Component (`'use client'`) per Spec 33 §3 (interactive: tooltip-on-hover for cohort details). Props: `timeline: LeadInspectTimelineEntry[]` + optional `loading` flag. Renders three sub-regions: completed (chronological) → current (highlighted) → upcoming (faded). Chevron arrows (`<ChevronRight>` from `lucide-react` per Spec 33 §4) separate adjacent stages. **No icons per phase per user direction.** Each entry: `phase_name` (friendly name) + days indicator + cohort comparison.
  - `LeadDetailInspector.tsx` (modified) — mount `<LifecycleTimelinePanel timeline={data.lifecycle.timeline} />` ABOVE the existing panel grid. The existing Lifecycle panel (one of 8) stays as-is — it's the structured field dump (`phase`, `phase_started_at`, etc.); the new panel is the visualized timeline. Two surfaces, one feeding the other through the same `data.lifecycle` payload.

* **Data Hooks/Libs:** N/A — no new hooks; consumes existing `LeadInspect.lifecycle.timeline` from the WF1 #B schema. `phaseName()` helper from `src/lib/classification/phase-names.ts` already exists (WF1 #B). No new lib code.

* **Database Impact:** NO. Pure UI consumer of an already-shipped data layer.

* **Visual contract (locked at plan-lock for R10's reference):**
  - **Chevron progression:** `Phase Name → Phase Name → Phase Name` with `<ChevronRight size={14}>` between adjacent stages.
  - **Days indicator:** completed = "{N}d" (actual); current = "{N}d in progress"; upcoming = "~{cohort_median_days}d".
  - **Cohort comparison:** completed = inline "(typical: {p25}-{p75}d)"; current = a **colored status pill** (R0 Gemini NIT — was "sparkline-style") next to the day count, with cohort-band classification from `classifyCohortBand(daysInPhase, p25, p75)`:
    - `'on-track'` — green pill, text "ON TRACK"
    - `'amber'` — amber pill, text "TRENDING SLOW"
    - `'stalled'` — red pill, text "STALLED" (over p75, per Spec 84 §7 stall band)
    - `'no-data'` — neutral pill, text "NO COHORT DATA" (when `sample_size` is 0 or all percentile fields null)
    Upcoming entries show pale "(typical: {p25}-{p75}d, n={sample_size})" with no pill.
  - **R0 Gemini HIGH — Accessibility (a11y):** color is NOT the only signal — the pill carries text and `aria-label="cohort status: {classification}"`. Tooltips use Radix `<Tooltip>` (already in shadcn/ui) with `role="tooltip"` + keyboard `Tab`/`Esc` support; trigger element has `aria-describedby`. Horizontally scrolling container has `tabindex="0"` + `aria-label="lifecycle timeline (scrollable)"`. Touch targets ≥44px on tooltip triggers (already specced).
  - **Reliability marker:** when `cohort_sample_size < 30`, show a `<Info>` icon hint with tooltip "Cohort sample {N} — calibration is unreliable (Spec 84 §7)".
  - **Loading state (R0 Gemini MED — was undefined):** when `loading={true}` and no `timeline` prop, render a skeleton row matching the chevron-progression shape — 3 placeholder pills (gray `bg-slate-200 animate-pulse` rectangles ~80px wide) separated by chevron icons. Reuse the existing skeleton primitives in `src/components/ui/skeleton.tsx` if shadcn/ui has them; otherwise local Tailwind. No spinner — skeleton matches the resolved content shape per Spec 33 §9.
  - **Terminal phase handling:** when `currentPhase ∈ {P18, P19, P20, O3}` the upcoming region renders nothing (canonical lifecycle end).
  - **Off-path phase handling:** when `remainingPhases()` returns `[]` (currentPhase not in `STANDARD_PHASE_PATH_BY_PERMIT_TYPE` for the permit's `permit_type`), render no upcoming region + add a low-emphasis "off-canonical-path" marker — concretely: a small inline `<span>` after the current entry with `text-zinc-500 text-xs italic`, text "off canonical path (84-W11)", tooltip "This permit's current phase isn't in the standard progression for this permit type. See Spec 84 §6 bug 84-W11." (R0 Gemini NIT — was "low-emphasis marker" without concrete styling.)
  - **Empty timeline:** when `timeline.length === 0` (permitType or currentPhase null per `build-lifecycle-timeline.ts:116`), render a deliberate empty state — "Lifecycle data unavailable for this permit" — NOT a blank canvas (Spec 33 §9).

* **UI Layout:** Web Admin = **desktop-first** per Spec 33 §2 + §9 (overrides §11 mobile-first checklist's default — admin protocol is authoritative for `src/components/admin/**`). Base classes target 1280px+ desktop; `md:` breakpoint at 768px tablet adds horizontal scrolling for long timelines (P1 → P20 has 23 entries — overflow-x-auto on the timeline container). Touch targets ≥44px on the cohort-tooltip-trigger info icons. **V1 caveat (R0 Gemini LOW):** `overflow-x-auto` on tablet is the V1 implementation; a future iteration could explore wrapping the chevron progression onto multiple rows or a carousel pattern. Out of scope for this WF.

* **Maestro account hermeticity (R0 Gemini CRITICAL):** the original plan said "Pre-condition: a test realtor account exists in the DB seed" without specifying how. Self-contained approach: the Maestro flow itself creates the account inline (or signs into a known dev-only fixture account that the test asserts exists at startup). Concrete approach to confirm at R4 plan-lock:
  - **Option A (preferred):** flow opens the app fresh, hits `(auth)/sign-up`, walks through onboarding path R (realtor) per Spec 94 §4, lands on lead feed. Self-contained; works in any environment with a working sign-up flow.
  - **Option B (fallback):** dev-only seed script at `scripts/seed-realtor-test-account.js` creates a fixed `realtor-maestro@test.buildo.local` account with `account_preset='realtor', trade_slug='realtor', onboarding_complete=true`. Maestro signs into it. Requires the seed script to be runnable in CI.
  Decision deferred to R4 when the Maestro flow gets written; the choice depends on whether the Expo dev build supports the full onboarding flow non-interactively.

* **Maestro flow (`mobile/maestro/realtor_end_to_end.yaml`):**
  - Pre-condition: a test realtor account exists in the DB seed.
  - Steps: launch app → onboarding completes path R (realtor) per Spec 94 §4 → land on `(app)/index.tsx` lead feed → assert at least 1 lead card renders (proves `getLeadFeed({trade_slug:'realtor'})` returns non-empty) → tap card → assert detail screen renders → tap save → assert flight-board has the saved lead → unsave to leave a clean state.
  - Spec 91 §3.5 item 5 requires this; WF3 #realtor-backfill (commit `1967733`) made the algorithm + data layer correct, but no E2E asserts an actual realtor user can use the app.

## Standards Compliance

* **Try-Catch Boundary:** N/A (no new API routes; existing `/api/admin/leads/inspect/:id` already wraps per Spec 76 §2.6 + Spec 33 §13). Component-level error handling: parse-error UI surface re-uses the existing `LeadInspectError` discriminated union from `useLeadInspect` (WF1 #B).
* **Unhappy Path Tests:** UI cases — empty timeline (permitType null), terminal phase (no upcoming), off-canonical-path phase (84-W11 surface), unreliable cohort (`sample_size < 30`), missing calibration row (cohort fields all null). Each is one RTL test in `lifecycle-timeline-panel.ui.test.tsx`.
* **logError Mandate:** N/A (Client Component — `console.error` allowed per Spec 33 §5 anti-pattern carve-out for non-server code).
* **UI Layout:** **Desktop-first per Spec 33 §2 + §9** (admin protocol overrides §11 mobile-first checklist). Touch targets ≥44px on tooltip triggers per Spec 33 §9. Single light theme per Spec 33 §2 — no `dark:` variants.

## Execution Plan

- [ ] **R0 — Gemini adversarial review of THIS PLAN before authorization** (NEW; user-directed 2026-05-11). Run Gemini against `.cursor/active_task.md` with Spec 76 §3.5 + Spec 33 + Spec 84 §5 as context. Surface plan-level risks (missing edge cases, weak verification steps, scope creep into UI states that don't exist in the data layer, undocumented assumptions). Triage Gemini's findings BEFORE asking the user for plan authorization. If BUGs → revise plan + re-run R0 review. If only NITs → fold into the plan as additional R-step items and present consolidated to user for authorization.

- [ ] **R1 — Domain mode + spec reads.** Confirmed above. Read all 6 spec sections in parallel before this plan was written.

- [ ] **R2 — Realtor wire-up sanity re-check (read-only).** Verify items 1-4 from Spec 91 §3.5 are still green at `main` `1967733`:
  - `Grep` for `slug: 'realtor'` in `src/lib/classification/trades.ts` (item 1)
  - `Bash` query: `SELECT * FROM _migrations WHERE name LIKE '%118%'` (item 2)
  - `Bash` query: `SELECT trade_slug, bid_phase_cutoff, work_phase_target FROM trade_configurations WHERE trade_slug='realtor'` (item 3)
  - `Grep` `manifest.json` for `backfill_realtor_permit_trades` registration (item 4 — newly shipped in WF3)
  - Verify `src/tests/db/realtor-gating.db.test.ts` and `src/tests/realtor-availability-guard.logic.test.ts` exist + pass on `main` (item 5 logic+infra portion)
  - Verify realtor `permit_trades` row count via the live-DB query (item 4 — should be ≥68,787 from the WF3 backfill run)

  Item 5 Maestro portion: confirmed missing at scope-check; deliverable of R6.

- [ ] **R3 — Capture canonical fixtures (R0 Gemini MED — was "find permits live").** Hit `/api/admin/leads/inspect/:id` for 3 permits and pin the resulting `lifecycle.timeline[]` payloads as fixture files committed to the repo:
  - Terminal phase: `21 173458 BLD` (P18 — verified in WF1 #B) → `src/tests/fixtures/lifecycle-timeline-terminal.fixture.json`
  - Mid-pipeline: a permit at `currentPhase ∈ {P10, P11, P12}` with `cohort_sample_size > 100` so cohort data is realistic → `src/tests/fixtures/lifecycle-timeline-mid-pipeline.fixture.json`
  - Off-canonical-path: a permit whose `currentPhase` is NOT in `STANDARD_PHASE_PATH_BY_PERMIT_TYPE` for its `permit_type` (84-W11 surface) → `src/tests/fixtures/lifecycle-timeline-off-path.fixture.json`
  Fixtures are committed alongside the test file. RTL tests + manual browser verification consume them. The "find via live DB" step is purely a fixture-capture step — no test depends on live DB shape (hermetic per R0 Gemini MED).

- [ ] **R4 — Red Light tests.** Write the failing tests FIRST per WF1 cadence:
  1. `src/tests/lifecycle-timeline-utils.logic.test.ts` (NEW) — pure-function tests for `classifyCohortBand()` (R0 Gemini MED — extracted helper):
     - Returns `'on-track'` when daysInPhase < p25
     - Returns `'amber'` when p25 ≤ daysInPhase ≤ p75
     - Returns `'stalled'` when daysInPhase > p75
     - Returns `'no-data'` when sample_size === 0 OR any percentile field is null
     - Returns `'no-data'` when daysInPhase is null (not just numerically 0)
  2. `src/tests/lifecycle-timeline-panel.ui.test.tsx` (NEW) — 11 RTL tests (was 8; +3 for R0 Gemini findings):
     - Renders all completed entries with chevron between (chronological order preserved)
     - Renders current entry with highlight + "in progress" suffix + cohort-band pill
     - Renders upcoming entries with predicted days from `cohort_median_days`
     - Empty timeline → empty-state copy (not blank)
     - Terminal phase → no upcoming region
     - Off-canonical-path → no upcoming + low-emphasis marker with "84-W11" tooltip
     - `sample_size < 30` → unreliable info icon present + tooltip text correct
     - Missing calibration row (`cohort_median_days === null`) → 'no-data' pill, not "0d"
     - **a11y #1 (R0 Gemini HIGH):** color-coded pill carries text label ("ON TRACK"/"STALLED" etc.) and `aria-label`, not color alone
     - **a11y #2 (R0 Gemini HIGH):** scrollable timeline container has `tabindex="0"` and `aria-label`
     - **Loading state (R0 Gemini MED):** `loading={true}` renders skeleton row, not blank or spinner
  3. `mobile/maestro/realtor_end_to_end.yaml` (NEW) — Maestro flow per the spec contract above. **Account setup** (R0 Gemini CRITICAL): self-contained Option A preferred — flow walks through onboarding path R inside the test; Option B fallback uses `scripts/seed-realtor-test-account.js` if Option A proves infeasible for non-interactive CI. Test framework is the existing Maestro setup (Spec 98 mobile testing protocol).
  4. **Verify all tests fail before R5** — Red Light is the discipline that prevents accidentally-passing tests from a happy-path component that ignores edge cases.

- [ ] **R5 — Implementation.**
  1. `src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx` (NEW) — Client Component per the visual contract above. Pure rendering; all logic delegated to the inputs. Uses `lucide-react` `<ChevronRight>` and `<Info>` (Spec 33 §4 icon library mandate).
  2. `src/components/admin/LeadDetailInspector.tsx` (MODIFY) — import and mount `<LifecycleTimelinePanel>` in the result-state section, ABOVE the existing 8-panel grid. Verify the schema exposes `data.lifecycle.timeline` (it does per WF1 #B `LeadInspectLifecycleSchema` extension).
  3. Run `npm run typecheck` after each file lands.

- [ ] **R6 — Green Light verification.**
  - `npm run test` — full vitest suite passes (5195+ baseline at `1967733`).
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

- [ ] **R7 — Pre-Review Self-Checklist (Spec 33 §11 / WF1 mandate).** Self-skeptical items derived from Spec 76 §3.5 + Spec 84 §5 + Spec 33's anti-patterns + R0 Gemini findings. Walk each against the actual diff. Output PASS/FAIL per item BEFORE invoking R8:
  - Component is `'use client'` (Spec 33 §3 — interactive)
  - No `useEffect` for data fetching (Spec 33 §5 anti-pattern; consumes parent's `useLeadInspect` via prop)
  - Touch targets ≥44px on tooltip triggers (Spec 33 §9)
  - No PII in `console.log` (Spec 33 §5)
  - Cohort math display: `classifyCohortBand` never crashes when `sample_size === 0` or percentiles are null (returns `'no-data'`)
  - Terminal phase suppression matches `STANDARD_PHASE_PATH_BY_PERMIT_TYPE` exactly
  - 84-W11 inherited limitation: off-path marker is rendered with concrete styling + tooltip, NOT silently hidden
  - **a11y (R0 Gemini HIGH):** cohort-band signaling carries text + `aria-label` (not color alone); tooltips are keyboard-accessible; scrollable container has `tabindex`/`aria-label`
  - **Loading state (R0 Gemini MED):** skeleton matches resolved-content shape, not a spinner or blank canvas
  - **Maestro hermeticity (R0 Gemini CRITICAL):** flow either signs into a known seed account OR completes onboarding self-contained — no dependency on environment-specific accounts

- [ ] **R8 — Multi-Agent Review (REQUIRED per WF1 cadence + user emphasis "ensure adversarial research reviews are used").** Three reviewers in parallel — single message, three tool calls:
  1. **Gemini adversarial:** `npm run review:gemini -- review src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx --context docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` — spec-vs-code drift, edge cases, missing UI states.
  2. **DeepSeek adversarial:** `npm run review:deepseek -- review src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx --context docs/specs/01-pipeline/84_lifecycle_phase_engine.md` — cohort math display correctness, terminal-phase logic, off-path handling. Spec 84 §5 is the contract authority for the timeline shape.
  3. **Worktree code-reviewer (Agent + isolation:worktree):** Full diff against Spec 76 §3.5 + Spec 33 §3/§4/§5/§9/§13. Generates own checklist from those sections; reports PASS/FAIL with line numbers.

  Triage: BUG → fix in-loop before R9 (precedent: WF1 #B applied 4 of 6 reported bugs; WF3 #realtor-backfill applied 5 of 17 reported items). DEFER → catalogue in `docs/reports/review_followups.md` with rejection rationale or future-WF candidate marker.

- [ ] **R9 — Apply review fixes + re-verify.** If R8 surfaces BUGs, fix + re-run `npm run test` + manual browser re-verify. If only DEFERrals, append to `review_followups.md`.

- [ ] **R10 — Atomic commit + push + close active task.**
  - Commit message format follows the WF1 #B / WF3 #realtor-backfill precedent (`feat(76_lead_feed_health_dashboard): WF1 #C — Cycle 7 admin lifecycle timeline panel + realtor Maestro coverage`).
  - Operator runbook footer in commit message (e.g. "no migration; first deploy renders the new panel automatically — verify at `/admin/lead-feed/inspector?id=<permit>`").
  - `git push origin main` after Husky pre-commit gate (typecheck + lint + test) passes.
  - Mark this active_task Status = Done in the post-commit cleanup turn.

---

> **PLAN LOCKED (revised post-R0). Do you authorize this WF1 #C plan? (y/n)**
>
> **R0 Gemini review applied (2026-05-11):** 5 of 7 findings folded into the plan above (1 CRITICAL Maestro hermeticity, 1 HIGH a11y, 3 MEDs loading-state + non-hermetic fixtures + new lib helper), 2 NIT/LOW items folded as visual-contract clarifications + V1 caveats. The plan grew by ~80 lines to address the findings; the R-step structure is unchanged but R3 captures hermetic fixtures, R4 adds 3 new test cases + a logic-test file, R7 self-checklist gained 3 R0-derived items.
>
> §10 note: web admin UI Layout is **desktop-first** per Spec 33 §2 + §9 — this overrides the §11 Plan Compliance Checklist's default mobile-first guidance because the admin protocol (Spec 33) is authoritative for `src/components/admin/**`. All other §11 items either don't apply (no DB migration, no API route, no pipeline script, no shared classification logic touched) or are silently addressed in the relevant R-step above. Mobile-first applies to the new `mobile/maestro/realtor_end_to_end.yaml` Maestro flow, which exercises the Expo app at default mobile viewport.
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
