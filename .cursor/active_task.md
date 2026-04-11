# Active Task: Phase 7 polish — observability + a11y audit + haptic sweep
**Status:** Planning
**Workflow:** WF1 — New Feature Genesis (Phase 7 of spec 75)
**Rollback Anchor:** `4f08235f` (fix(70_lead_feed): feed route PostGIS pre-flight + dev profile trade switcher)
**Domain Mode:** Frontend

## Required Reading (completed before this plan)
- `docs/specs/00_engineering_standards.md` §1 (UI), §4.3 (Frontend Security), §10 (Boundary), §12 (Frontend Foundation), §13 (Observability) ✓
- `docs/specs/product/future/74_lead_feed_design.md` (industrial utilitarian design system) ✓
- `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 7, §13 Success Criteria ✓

## Context

**Goal:** Complete Phase 7 ("Polish") from `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 — the final pre-shipping refinement pass on the lead feed feature. Phase 7 has 6 enumerated items:

1. **Animations** (save button bounce, card expand)
2. **Haptic feedback** (feature-detect Vibration API, iOS compatibility)
3. **Accessibility audit** (screen reader labels, keyboard nav, 320px viewport test)
4. **Observability:** add `logInfo` with performance marks to feed API
5. **V1 hard cap:** 5 pages × 15 cards = 75 cards max
6. **V2 upgrade path:** `@tanstack/react-virtual` when feed length regularly exceeds 50 cards

### Current state (audited before writing this plan)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1a | Save button bounce | ✅ Done | `SaveButton.tsx:103-105` Motion scale `[1, 1.3, 1]` + `useReducedMotion` gate |
| 1b | Card expand animation | ❌ Not implemented | No `isExpanded` state, no inline expand interaction in PermitLeadCard/BuilderLeadCard |
| 2 | Haptic feedback | ⚠️ Partial | `SaveButton.tsx:60-70` has feature-detected `vibrate()` — other touch events (card tap, filter confirm, mutation errors) don't |
| 3 | A11y audit | ⚠️ Partial | `useReducedMotion` present across motion uses; some `aria-label`/`aria-expanded`; NO systematic sweep against 375px, keyboard nav, screen reader |
| 4 | Observability perf marks | ⚠️ Basic | `request-logging.ts` uses `Date.now()` deltas; no `performance.mark` / `performance.measure` instrumentation inside `getLeadFeed` |
| 5 | V1 hard cap | ✅ Done | `LeadFeed.tsx:47` `MAX_PAGES = 5`, "refine your search" CTA at line 291, test lock at `LeadFeed.ui.test.tsx` |
| 6 | V2 virtualization | — | Spec-deferred: "only if frame drops are reported" |

### In-scope for this WF1

- **Fix 4 — Observability with performance marks:** instrument `getLeadFeed` and the `/api/leads/feed` route handler with `performance.mark` / `performance.measure` pairs around each phase (auth, zod, trade authz, query, row mapping, cursor build). Emit the measurements via `logInfo` inside the existing `logRequestComplete` helper. Enables future perf regression detection with zero client cost.
- **Fix 3 — A11y audit:** systematic pass across `LeadFeed.tsx`, `LeadFeedHeader.tsx`, `LeadFilterSheet.tsx`, `EmptyLeadState.tsx`, `PermitLeadCard.tsx`, `BuilderLeadCard.tsx`, `SaveButton.tsx`, `LeadMapPane.tsx`. Fix each issue surfaced within a bounded LoC budget. Target criteria from §13: screen reader navigates feed linearly, touch targets ≥ 44px, 375px mobile viewport passes.
- **Fix 2b — Haptic feedback sweep:** extract the existing `vibrate()` helper from `SaveButton.tsx` into a shared `src/features/leads/lib/haptics.ts` utility, wire it into the remaining user actions (card tap, successful filter confirm, failed mutation).

### Out of scope (deferred with reasons)

- ❌ **Fix 1b — Card expand animation.** Requires UX product decision (what content expands, interaction with map detail view, mobile vs desktop behavior). No design is documented in spec 74. Defer to a product-led follow-up with a design review.
- ❌ **Item 6 — V2 virtualization.** Spec-deferred per §11 Phase 7 point 6: "only if production feed length regularly exceeds 50 cards OR frame drops are reported." Neither condition met yet.
- ❌ **Backend API contract changes.** Phase 7 observability is read-only instrumentation — `logRequestComplete` signature gains optional perf mark entries, backward-compatible.
- ❌ **Database changes.** None required.
- ❌ **Fixing issues found by the a11y audit that exceed a bounded LoC budget.** Hard cap: +/- 300 LoC for audit fixes. Anything bigger → deferred to a targeted follow-up WF3 per-issue.

## Target Spec
- `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 7 (primary)
- `docs/specs/00_engineering_standards.md` §13 Observability Standards
- `docs/specs/product/future/74_lead_feed_design.md` (touch targets, motion, accessibility)

## Key Files

**New:**
- `src/features/leads/lib/haptics.ts` — extracted `vibrate()` helper (tiny, ~20 LoC)
- `src/features/leads/lib/perf-marks.ts` — thin wrapper around `performance.mark` / `performance.measure` that collects named measurements into a plain object for `logInfo` (server-side)
- `src/tests/haptics.logic.test.ts` — feature-detection + ms validation
- `src/tests/perf-marks.logic.test.ts` — mark/measure lifecycle + Node/Edge runtime check

**Modified:**
- `src/features/leads/api/request-logging.ts` — accept an optional `perfMarks` record + serialize alongside `duration_ms`
- `src/app/api/leads/feed/route.ts` — instrument each phase with marks, pass to `logRequestComplete`
- `src/features/leads/lib/get-lead-feed.ts` — mark before/after the `pool.query` + row mapping
- `src/features/leads/components/badges/SaveButton.tsx` — replace inline `vibrate` with imported helper
- `src/features/leads/components/LeadFilterSheet.tsx` — haptic on confirm button tap
- `src/features/leads/components/PermitLeadCard.tsx` — haptic on tap-to-record-view
- `src/features/leads/components/BuilderLeadCard.tsx` — haptic on tap-to-record-view
- A11y audit: TBD — exact files depend on what the audit surfaces. Changes expected in LeadFeedHeader, LeadFilterSheet, EmptyLeadState, and the cards.

## Technical Implementation

### Observability — performance marks

**Approach:** Node's `perf_hooks` module provides `performance.mark(name)` and `performance.measure(name, startMark, endMark)` with microsecond precision. Unlike `Date.now()`, marks don't suffer clock skew and give us named phase breakdown.

**New helper `src/features/leads/lib/perf-marks.ts`:**
```ts
import { performance } from 'node:perf_hooks';

export interface PerfMarkBuilder {
  mark(name: string): void;
  measure(measureName: string, startMark: string, endMark: string): void;
  toLog(): Record<string, number>;
}

export function createPerfMarks(scope: string): PerfMarkBuilder {
  const prefix = `${scope}:${Math.random().toString(36).slice(2, 8)}:`;
  const measures: Record<string, number> = {};
  return {
    mark: (name) => performance.mark(prefix + name),
    measure: (measureName, startMark, endMark) => {
      try {
        const m = performance.measure(prefix + measureName, prefix + startMark, prefix + endMark);
        measures[measureName] = Math.round(m.duration * 100) / 100; // ms with 2 decimals
      } catch {
        // mark missing → skip silently; don't let instrumentation break the request
      }
    },
    toLog: () => ({ ...measures }),
  };
}
```

Scope prefix + random suffix prevents mark collision across concurrent requests. `toLog()` returns a flat `{ phase_name: duration_ms }` record for `logInfo`. Errors are swallowed — perf instrumentation must NEVER crash a request.

**Route integration (`feed/route.ts`):**
```ts
const perf = createPerfMarks('leads-feed');
perf.mark('start');

// Phase 1: auth
perf.mark('auth_start');
const ctx = await getCurrentUserContext(request, pool);
perf.mark('auth_end');
perf.measure('auth', 'auth_start', 'auth_end');
if (!ctx) return unauthorized();

// ... same pattern for zod / tradeAuthz / postgis / rate-limit / query / complete
perf.mark('end');
perf.measure('total', 'start', 'end');

logRequestComplete('[api/leads/feed]', {
  user_id: ctx.uid,
  // ... existing fields
  perf_marks: perf.toLog(),
}, start);
```

Update `request-logging.ts` to pass `perf_marks` through as a nested field in the `logInfo` payload. Optional — omitted if `perf_marks` not supplied.

### Haptic sweep

**New `src/features/leads/lib/haptics.ts`:**
```ts
/**
 * Feature-detect Vibration API. Safari (iOS) doesn't implement it; the
 * call must be guarded so it doesn't throw. Also respects the user's
 * prefers-reduced-motion setting: we skip haptics when reduced-motion
 * is active because the spirit of that preference extends to tactile
 * effects (WCAG 2.1 SC 2.3.3 is motion-specific but many users set it
 * to mean "minimize non-essential stimuli").
 */
export function hapticTap(ms = 10): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
  if (typeof nav.vibrate !== 'function') return;
  // prefers-reduced-motion gate — read from matchMedia at call time
  // (not cached) so a runtime preference change is respected.
  if (typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  try {
    nav.vibrate(ms);
  } catch {
    // Silent — haptics are a nice-to-have.
  }
}
```

Callers: `SaveButton.tsx` (replace existing inline), `PermitLeadCard.tsx` (card tap), `BuilderLeadCard.tsx` (card tap), `LeadFilterSheet.tsx` (confirm button).

Duration: 10ms for light feedback (save button uses 20ms currently — keep 20ms there, use 10ms for tap-record-view so it's less pronounced). Filter confirm: 15ms.

### A11y audit

**Systematic sweep of these files** (roughly 5-10 min each):
1. `LeadFeed.tsx` — is the infinite scroll region announced? Does "refine your search" CTA have a focus state?
2. `LeadFeedHeader.tsx` — filter button `aria-expanded` (already present per grep). Radius slider keyboard reachable?
3. `LeadFilterSheet.tsx` — sheet is a Shadcn Drawer; verify focus trap on open; verify close button ≥ 44px
4. `EmptyLeadState.tsx` — each variant has `role="status"`, `aria-live="polite"` (verified line 147 for 'unreachable'). Check the other 2 variants.
5. `PermitLeadCard.tsx` — card is clickable; does it have `role="button"` + keyboard handler + focus state? Touch target ≥ 44px?
6. `BuilderLeadCard.tsx` — same checks as PermitLeadCard
7. `SaveButton.tsx` — already audited in prior WF3. Re-verify label flip.
8. `LeadMapPane.tsx` — Google Maps; verify `aria-label` on markers + keyboard focus order

**Tools:**
- Read each component source + its existing `.ui.test.tsx`
- Run `npm run test` with the existing 375px viewport tests
- Grep for `role=`, `aria-`, `tabIndex`, `onKeyDown` to spot missing handlers
- Check that every interactive element has a visible focus style (Tailwind `focus-visible:ring-*`)

**Budget:** +/- 300 LoC across audit fixes. Anything exceeding that becomes a deferred follow-up.

## Database Impact
**NO.** No schema change.

## Standards Compliance (§10 Plan Compliance Checklist)

**DB:** N/A — no schema changes.

**API:**
- No new API routes — observability is internal instrumentation
- `/api/leads/feed` response envelope UNCHANGED (`perf_marks` goes to server logs, not response body)
- Existing try/catch in `feed/route.ts` unchanged
- `logRequestComplete` gains an optional `perf_marks` record — backward compatible
- No new secrets; `perf_marks` contain only phase names + millisecond durations (no user data)
- Existing middleware auth gates (401/403/429) unchanged

**UI:**
- New primitives: N/A (using existing Motion + Shadcn)
- Shadcn components used: existing (no new components)
- Mobile-first Tailwind: audit-driven fixes will use `md:` / `lg:` modifiers for desktop refinements, base classes for mobile
- Touch targets: audit will verify ≥ 44px compliance; any violations fixed inline
- Haptic helper respects `prefers-reduced-motion` (WCAG 2.1 SC 2.3.3)
- PostHog `captureEvent`: existing instrumentation unchanged; haptic call sites don't need new events (haptic is UX feedback, not a tracked interaction)

**Shared Logic:**
- `perf-marks.ts` is pure — no side effects beyond `performance.mark`/`measure` which are idempotent
- `haptics.ts` is pure — single function, no module state
- Both have logic tests

**Pipeline:** N/A — no pipeline changes.

**Frontend Boundary Check:**
- No `scripts/`, `migrations/`, `scripts/lib/` changes
- No new `use client` components
- `perf-marks.ts` is server-only (imports `node:perf_hooks`); lives under `src/features/leads/lib/` which is the Phase 1 foundation allowed in Frontend Mode
- `haptics.ts` is client-only (reads `window.matchMedia`); safe because it's only imported from `'use client'` components

## Execution Plan

*(CLAUDE.md WF1 template — every step verbatim, N/A items marked with reason)*

- [ ] **Contract Definition:** N/A — no new API routes. Observability instrumentation is internal. `perf_marks` is an optional field added to the structured-log payload, not the HTTP response.
- [ ] **Spec & Registry Sync:** Update `docs/specs/product/future/75_lead_feed_implementation_guide.md` §11 Phase 7 to mark items 3, 4, and 2b as complete (with a footnote about what was in scope). Update §13 Success Criteria checklist. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no database changes.
- [ ] **Test Scaffolding:** Create `src/tests/haptics.logic.test.ts` + `src/tests/perf-marks.logic.test.ts`. Extend existing `src/tests/LeadFeed.ui.test.tsx` + `LeadFilterSheet.ui.test.tsx` + `PermitLeadCard.ui.test.tsx` + `BuilderLeadCard.ui.test.tsx` with a11y-audit assertions surfaced during the sweep.
- [ ] **Red Light:** `npm run test` — new tests must fail (no haptics lib, no perf-marks lib, no a11y assertions yet).
- [ ] **Implementation:** Write `src/features/leads/lib/haptics.ts`, `src/features/leads/lib/perf-marks.ts`, wire through `request-logging.ts` and `feed/route.ts`, run the a11y audit, apply fixes within the 300-LoC budget.
- [ ] **Auth Boundary & Secrets:** N/A for the observability path (no new routes). Haptic helper reads `navigator.vibrate` and `window.matchMedia` — both are public browser APIs, no secrets. Perf marks emit phase names + durations — no user data leak.
- [ ] **Pre-Review Self-Checklist:** BEFORE Green Light, walk 7-10 items generated from spec 75 Phase 7 + §13 success criteria against the ACTUAL diff:
  1. Does `perf-marks.ts` tolerate a missing start mark without crashing the request?
  2. Do the random prefixes in `createPerfMarks` prevent collision across 100+ concurrent requests?
  3. Does `hapticTap` return early in SSR (`typeof navigator === 'undefined'`) without error?
  4. Does `hapticTap` respect `prefers-reduced-motion`?
  5. Does every card (permit + builder) have a keyboard-accessible tap path (role=button or button element)?
  6. Does every interactive element have a visible focus-visible ring?
  7. Does the 375px viewport test pass for every component the audit touched?
  8. Do touch targets measure ≥ 44px via automated test?
  9. Does the existing `LeadFeed.ui.test.tsx` infinite-scroll cap test still pass (no regression from a11y fixes)?
  10. Does the `logInfo` payload correctly include `perf_marks` as a nested field (not flattened)?
  11. Does the instrumentation add measurable overhead to the feed API request? (< 1ms target)
- [ ] **Green Light:** `npm run test && npm run lint -- --fix && npm run typecheck`. Output visible execution summary using ✅/⬜ for every step above. → WF6.

## Why WF1 (Genesis), not WF2 (Enhance) or WF3 (Fix)

Spec 75 §11 Phase 7 defines a distinct shipping phase ("Polish") with its own enumerated deliverables. Phases 0-6 are documented as complete (per the state audit above). Phase 7 is the last phase before shipping the feature. Adding new files (`haptics.ts`, `perf-marks.ts`), new test files, and new instrumentation = Genesis. The a11y audit fixes ride along with the Genesis work because they target the same files and the same review cycle.

## Scope Discipline — EXPLICITLY OUT

- ❌ **Card expand animation** (spec Phase 7 item 1b) — requires product UX decision not present in spec 74
- ❌ **V2 virtualization** (spec Phase 7 item 6) — spec-deferred
- ❌ **Visual redesigns** — industrial utilitarian design system from spec 74 is locked; audit fixes are structural/semantic only
- ❌ **Backend scope creep** — PostGIS install, migration drift repair (both deferred per `53dcb29`)
- ❌ **User feed UI surfacing of 503 message** — deferred from the prior WF3
- ❌ **Client-side perf instrumentation** — Phase 7 item 4 says "feed API" specifically, server-side only. Web Vitals client instrumentation is spec 75 §13 Success Criteria measurement, not Phase 7 work
- ❌ **PostHog events on haptic calls** — haptic is UX feedback, not a user intent worth tracking
