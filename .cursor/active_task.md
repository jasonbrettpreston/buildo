# Active Task: Dashboard review bundle — null-timing, pool cache, saved_at, cost coverage
**Status:** Phase 1 — Red Light
**Workflow:** WF3 — Bug Fix (3-phase bundle)
**Rollback Anchor:** `1321b972` (1321b972dee3f536360b886ff843301d565ba57a)
**Domain Mode:** Cross-Domain (frontend component + backend API lib + database migration)

## Context
External review `docs/reports/lead_feed_health_dashboard_review.md` (Antigravity, 2026-04-10) graded the dashboard D. Validated all 10 claims: **4 real bugs** (2, 3, 7, 9), **6 false positives** (1, 4, 5, 6, 8, 10).

**Target specs:**
- `docs/specs/product/admin/76_lead_feed_health_dashboard.md` §2.1, §3.3, §3.5
- `docs/specs/00_engineering_standards.md` §1, §2, §3, §7, §10, §12

## Phase Structure — 3 commits, 3 review cycles

Sequential: Phase 1 → Phase 2 → Phase 3. Each phase runs its own red-light / implement / self-checklist / independent review / adversarial review / triage / commit cycle on a clean working tree.

---

## Phase 1 — Honest Signaling (UI/display logic, zero infra risk)

**Status:** In progress

**Fixes:**
- **Claim 2** (REAL MED): `getTrafficLight` treats `timing_freshness_hours === null` as not-stale → dashboard goes GREEN when the timing_calibration cron has vanished or truncated. Fix: treat `null` as stale.
- **Claim 4** (PARTIALLY REAL LOW): `getCostCoverage` measures coverage within `cost_estimates` cache, not over the full active-permits universe. Fix: add a derived `coverage_pct_vs_active_permits` computed in the route handler (zero new DB load — uses values already fetched by `getLeadFeedReadiness` + `getCostCoverage`).

**Files:**
- `src/components/LeadFeedHealthDashboard.tsx` — `getTrafficLight` null treatment + UI shows both cost percentages
- `src/lib/admin/lead-feed-health.ts` — `CostCoverage` interface adds `coverage_pct_vs_active_permits: number`
- `src/app/api/admin/leads/health/route.ts` — compute derived metric from already-fetched readiness/cost values, inject into response
- `src/tests/LeadFeedHealthDashboard.ui.test.tsx` — null-timing → YELLOW assertion + dual cost metric render
- `src/tests/lead-feed-health.logic.test.ts` — dual metric presence in response shape
- `docs/specs/product/admin/76_lead_feed_health_dashboard.md` — spec §3.3 null-timing clarification + §2.1 dual denominator doc

**Self-checklist (to walk against diff BEFORE green-lighting):**
1. Does the null-timing change produce YELLOW in ALL cases where timing is missing — including when `feedReadyPct > 80` (the code path that previously returned GREEN)?
2. Does the change leave GREEN untouched for the happy path (`timingFreshnessHours < 48 && feedReadyPct > 80`)?
3. Is `active_permits === 0` handled safely in `coverage_pct_vs_active_permits` (no division by zero)?
4. Is the new field additive (doesn't break existing `cost_coverage` consumers)?
5. Does the spec update match the code behavior exactly (no documentation drift)?
6. Does the existing `LeadFeedHealthDashboard.ui.test.tsx` have snapshot/assertion tests that would BREAK under the new YELLOW behavior and need updating?
7. Does the dual-metric UI still fit mobile (<375px)?

**Risks for adversarial review:**
- Off-by-one: `timingFreshnessHours === 0` (impossibly fresh) — does it still count as fresh-not-stale?
- Division by zero on fresh DB (active_permits=0)
- Label wrapping when 2 percentages render on narrow viewport
- Snapshot test breakage in existing UI suite
- Rounding mismatch: `coverage_pct` uses `Math.round(... * 1000) / 10`; does the new metric use the same rounding?

**Commit message:** `fix(76_lead_feed_health_dashboard): honest signaling — null-timing yellow + dual cost coverage`

---

## Phase 2 — Pool pressure relief (server-side cache)

**Status:** Pending (blocked by Phase 1)

**Fixes:**
- **Claim 3** (REAL MED): 12 parallel queries × N tabs crushes 20-slot pool. Fix: 30s in-memory cache + single-flight promise in `route.ts`. **Decision: Layer A only** (no sequencing) — keeping `Promise.all` preserves response latency within the dashboard's 10s client timeout.

**Files:**
- `src/app/api/admin/leads/health/route.ts` — module-level cache entry + single-flight
- `src/tests/lead-feed-health.logic.test.ts` — cache hit/miss/single-flight/rejection tests

**Self-checklist:**
1. Does the cache TTL use `>` or `>=`? Is there an off-by-one on the expiry boundary?
2. Does the `inFlight` promise get cleared on BOTH success AND rejection?
3. Does the rejection path leave `cacheEntry` untouched (don't cache errors)?
4. Does Next.js dev HMR wipe the module state between edits? Comment must document this.
5. Does the handler still return the same response shape on cache hit AS on cache miss?
6. Is the TTL env-overridable with `parsePositiveIntEnv`-style safety?
7. Does the single-flight handle reject-propagation to all awaiters without unhandled rejections?

**Risks for adversarial review:**
- `inFlight` never cleared on rejection → permanent hang
- Cache populated with partial data if readiness succeeds but cost fails mid-`Promise.all`
- Clock skew between `Date.now()` calls within the same request flow
- Two requests exactly at `expiresAt` — race
- HMR module reload mid-request
- `cacheEntry` mutation from a stale closure after TTL expiry

**Commit message:** `fix(76_lead_feed_health_dashboard): 30s server-side cache + single-flight to protect pg pool`

---

## Phase 3 — saved_at column (schema evolution)

**Status:** Pending (blocked by Phase 2)

**Fixes:**
- **Claim 7** (REAL MED): `lead_views.saved_at` column doesn't exist; saves are timestamped against `viewed_at` which is preserved on save → old-view + recent-save is invisible to `saves_7d`. Fix: add column + backfill + update recorder + update query.

**Files:**
- `migrations/082_lead_views_saved_at.sql` (UP + DOWN, CONCURRENTLY index)
- `src/db/schema/*` — regenerated via `npm run db:generate`
- `src/features/leads/lib/record-lead-view.ts` — SAVE/UNSAVE populates/clears saved_at
- `src/lib/admin/lead-feed-health.ts` — `getEngagement` uses `saved_at` for saves, keeps `viewed_at` for views and unique_users
- `src/tests/record-lead-view.logic.test.ts` — recorder behavior
- `src/tests/lead-feed-health.logic.test.ts` — old-view + recent-save counted
- `src/tests/lead-views-schema.infra.test.ts` — column presence

**Self-checklist:**
1. Does the backfill UPDATE race with in-flight writes? (Single-statement UPDATE is atomic; rows written after backfill go through the updated INSERT path)
2. Should there be a CHECK constraint `(saved = false AND saved_at IS NULL) OR (saved = true AND saved_at IS NOT NULL)`?
3. Does UNSAVE correctly reset `saved_at = NULL`?
4. Does `unique_users_7d` STILL use `viewed_at`, not `saved_at`?
5. Does `avg_competition_per_lead` keep its `viewed_at` filter (scoped by view recency is intentional)?
6. Does removing the outer `WHERE viewed_at >= 7d` in `getEngagement` harm performance on a growing table? (Partial index on `saved_at` mitigates)
7. Is there a JS-side dual-path sibling to `record-lead-view.ts`? (Verified: no)

**Risks for adversarial review:**
- Backfill sets `saved_at = viewed_at` — but if `viewed_at` is older than the true save time, `saves_today/7d` for historical data will be wrong. Acceptable for historical approximation?
- Spec 76 §3.5 doesn't explicitly define whether "Saves (7d)" means "saves recorded in last 7d" or "saves of leads viewed in last 7d". Need spec clarification to confirm intent.
- `saved_at` column nullable vs constrained CHECK
- Drizzle type regen may drift if any other table's schema changed since last regen
- `lead_views` partial index on `(saved_at) WHERE saved = true` vs queries that FILTER by `saved = true AND saved_at >= ...` — index coverage

**Commit message:** `fix(76_lead_feed_health_dashboard): saved_at column fixes silent engagement dropping`

---

## Per-Phase Review Cycle Template

For each phase, execute in strict order:

- [ ] **Rollback Anchor** recorded at start (Phase 1: `1321b97`; Phases 2/3: the SHA of the previous phase's commit)
- [ ] **Spec Review** — read relevant spec 76 sections IN FULL
- [ ] **Red Light** — add failing tests for that phase only
- [ ] **Implement Fix**
- [ ] **Typecheck + lint + related tests**
- [ ] **Pre-Review Self-Checklist** — walk items above against the ACTUAL diff, report PASS/FAIL inline
- [ ] **Independent Review Agent** (worktree-isolated Explore) — generates own checklist from spec + diff
- [ ] **Adversarial Review Agent** (code-reviewer) — uses phase-specific attack vectors
- [ ] **Triage** — classify each finding as real/false-positive with written reasoning; fix real bugs; reject false positives in active_task.md
- [ ] **Full test suite re-run**
- [ ] **Atomic commit**
- [ ] **Update `docs/reports/review_followups.md`** with phase closures

## Scope Discipline — EXPLICITLY OUT

- ❌ Claims 1, 5, 6, 8, 10 — false positives, documented in review_followups.md WONTFIX with evidence
- ❌ `builders_feed_eligible` geo constraint (prior WF3 deferral)
- ❌ Sibling opaque 500s (WF6 sweep)
- ❌ `/api/admin/stats` 37-query refactor
- ❌ Exponential backoff on frontend polling (UX polish, not a bug)
- ❌ Cross-phase changes in a single phase — strict isolation

## Why Phased

1. **Blast radius isolation:** Phase 1 is UI-only (revertable by CSS). Phase 2 is a pure backend cache (revertable by removing the module-level vars). Phase 3 is schema (requires migration rollback). Each rollback point stands alone.
2. **Review cycle clarity:** Each review gets a clean, focused diff instead of a 6-file bundle that's hard to audit coherently.
3. **Failure isolation:** If Phase 3's migration breaks in an unexpected way, Phases 1 + 2 are already landed and the revert leaves the dashboard in a partially-improved state, not fully reverted.
