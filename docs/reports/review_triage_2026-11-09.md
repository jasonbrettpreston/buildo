# Review Queue Triage — 2026-11-09

**Run by:** automated weekly triage  
**Date (UTC):** 2026-11-09  
**Source file:** `docs/reports/review_followups.md` (4,346 lines, 1,352 severity-tagged rows)  
**Prior triage:** none — first run

---

## 1. Stale Items (resolved since filing)

Items confirmed resolved via code inspection and/or inline file markers.

| Line | Sev | Item | Resolution Evidence |
|------|-----|------|---------------------|
| 28 | HIGH | Engine `write_file` shrink guard (F2) | `~~HIGH~~ RESOLVED 2026-09-27` marker in file; commit `dadf9909` |
| 31 | HIGH | `parcels` P-D6 geometry repair arm | `~~HIGH~~ CLOSED 2026-09-28` marker in file; operator ruling D1 kept |
| 172 | HIGH | `runVitest()` Windows EINVAL | `~~HIGH~~ DONE` marker in file; fixed in `step-validate.mjs` `vitestEntry()` |
| 805 | HIGH | `scopeMatrix` key built without `.trim()` | `.trim()` confirmed present at `cost-model-shared.js:260-261` (`const pt = (row.permit_type \|\| '').trim()`); comment explicitly says "defensive .trim() only" is intentional |

**4 stale HIGH items** confirmed resolved. `review_followups.md` markers already annotate lines 28, 31, 172; line 805 has no inline marker yet — recommend adding one when next touching that file.

---

## 2. Top 5 Actionable Items This Week

Ranked by: (a) severity, (b) number of downstream items unblocked, (c) code touched in last 14 days.

### #1 — `captureDataQualitySnapshot` race + column gap  _(HIGH, line 162)_

**Files:** `src/lib/quality/metrics.ts`, `src/app/api/quality/refresh/route.ts`  
**What:** The admin "Refresh Now" trigger calls a TypeScript re-implementation of `refresh_snapshot.js` with no advisory lock — concurrent pipeline and manual runs both target the same `ON CONFLICT (snapshot_date)` row with no coordination. Additionally: 61 columns vs pipeline's 68 (missing `cost_estimates_*` and `timing_calibration_*`). Advisory lock check confirmed absent: `grep -n "advisory" src/lib/quality/metrics.ts` → zero hits.  
**Why first:** Explicit "ACT" directive from the original item; production-shippable live defect; unblocks accurate admin dashboard data quality reads.  
**Proposed:** Cross-Domain WF3. Add `pg_try_advisory_lock(ADVISORY_LOCK_ID)` per Spec 47 §A.5 registry; sync the 7 missing columns.

---

### #2 — `builder_candidates` LEFT JOIN acting as INNER JOIN  _(HIGH, line 817)_

**Files:** `src/features/leads/lib/get-lead-feed.ts:449,486`  
**What:** `LEFT JOIN wsib_per_entity w ON w.linked_entity_id = e.id` with `WHERE w.business_size IS NOT NULL` silently converts to an INNER JOIN, dropping 30–50% of builder leads (new contractors + GTA-condition failures with NULL `business_size`).  
**Confirmed open:** `grep -n "business_size IS NOT NULL" src/features/leads/lib/get-lead-feed.ts` hits line 486 — still present.  
**Why second:** Direct, measurable business impact (leads missing from the feed for a large fraction of builders). Fix is a one-line WHERE clause removal + NULL-tolerance in the UI (per Spec 91 §4.3 contract).  
**Proposed:** WF3 sweep of `get-lead-feed.ts` (bundle with #3 NaN guards below).

---

### #3 — Falsy-`0` cost bugs in `cost-model-shared.js`  _(2 × HIGH, lines 848–849)_

**Files:** `src/features/leads/lib/cost-model-shared.js:208, :264`  
**What:**  
- **Storeys (line 208):** `const stories = row.estimated_stories !== null ? row.estimated_stories : (row.storeys || 1)` — a valid `storeys = 0` (foundation-only permit) silently becomes 1, inflating GFA.  
- **`pct > 0` gate (line 264):** `if (pct !== undefined && pct > 0)` — a `scope_intensity_matrix` row with `pct = 0` ("no construction area") falls through to the matrix-miss branch → full-GFA fallback, grossly inflating cost for minor permits on large structures.  
**Confirmed open:** both patterns present in current code; storeys `||` not changed per `git log -S "storeys ||"`.  
**Why third:** Cost model correctness, same file, easy two-line fix (`||` → `??`; `pct !== undefined && pct > 0` → `pct !== undefined`).  
**Proposed:** WF3 cost-model-shared.js correctness sweep (2 fixes, ~5 LoC).

---

### #4 — Mobile payment hardening  _(2 × HIGH, lines 912–913)_

**Files:** `mobile/src/lib/apiClient.ts` (B6 mutex, line 886); `mobile/src/screens/PaywallScreen.*` (line 913); `mobile/src/stores/*` (line 912)  
**What:**  
- `PaywallScreen.handlePrimary` calls `await openCheckout()` with no try/catch — a thrown rejection leaves the checkout in an indeterminate state with no error feedback.  
- `clearLocalSessionState` fan-out has no per-step try/catch — a single `.reset()` failure halts cleanup, leaving partial PIPEDA-relevant state.  
**Why fourth:** Revenue-flow correctness + privacy obligation. Neither is on a recently-modified file, but both are payment path risks.  
**Proposed:** WF3 mobile payment hardening sweep (`PaywallScreen` + auth/session stores).

---

### #5 — PostHog subscription funnel events missing  _(HIGH, line 893)_

**Files:** `mobile/src/screens/PaywallScreen.*`, checkout flow  
**What:** `paywall_shown`, `subscribe_button_clicked`, `checkout_initiated`, `checkout_completed`, `subscribe_failed` — none instrumented. Revenue/conversion analytics completely dark. Only `subscription_expired_to_active` wired (commit `d032621`).  
**Why fifth:** Business analytics gap. Directly adjacent to #4 (same files, same WF3 candidate). Can be bundled with the mobile hardening sweep to avoid a second WF3 on PaywallScreen.

---

## 3. Proposed Sweep WFs (1–3 grouped fixes)

### Sweep A: cost-model-shared.js correctness  
**WF type:** WF3  
**Domain:** Backend/Pipeline (pure `src/features/leads/lib/` — no API route, no Expo)  
**Files:** `src/features/leads/lib/cost-model-shared.js`  
**Items covered:** lines 848, 849 (falsy-0 storeys, falsy-0 pct gate)  
**Estimated changes:** 2 targeted line fixes (~5 LoC); add regression tests for `storeys=0` and `pct=0` inputs  
**Unlocks:** clean cost estimates for foundation-only and zero-intensity permits

### Sweep B: get-lead-feed correctness  
**WF type:** WF3  
**Domain:** Backend/Pipeline  
**Files:** `src/features/leads/lib/get-lead-feed.ts`  
**Items covered:** lines 815 (clampedLimit NaN — defensive, Zod already guards route entry), 816 (clampedKm NaN — same), 817 (builder_candidates INNER-JOIN regression)  
**Estimated changes:** 3 fixes (~10 LoC); verify against Spec 91 §4.3 builder-display contract  
**Unlocks:** 30–50% of previously-dropped builder leads now reachable in the feed  
**Note:** NaN guards (lines 815/816) are mitigated at the route level by `leadFeedQuerySchema` defaults, but `get-lead-feed` can be called from server components — defensive fix still worthwhile.

### Sweep C: captureDataQualitySnapshot hardening  
**WF type:** WF3 (Cross-Domain)  
**Domain:** Cross-Domain (Admin UI trigger + `src/lib/` + API route)  
**Files:** `src/lib/quality/metrics.ts`, `src/app/api/quality/refresh/route.ts`  
**Items covered:** line 162 (advisory lock absent, 7-column gap)  
**Estimated changes:** 1 advisory lock acquisition at route entry (per Spec 47 §A.5 `ADVISORY_LOCK_ID`); 7 column additions to the INSERT list  
**Unlocks:** safe concurrent manual+pipeline refresh; accurate `cost_estimates_*`/`timing_calibration_*` on the admin quality dashboard

---

## 4. Queue Health

| Metric | Count |
|--------|-------|
| File length (lines) | 4,346 |
| Severity-tagged rows total | 1,352 |
| `\| HIGH \|` rows | 108 |
| `\| MED \|` rows | 175 |
| `\| LOW \|` rows | 236 |
| Rows with RESOLVED / CLOSED marker | 126 |
| `~~HIGH~~` (explicitly struck) | 4 |
| Stale HIGH found this triage | 4 (3 already marked; 1 new: scopeMatrix trim) |
| Prior triage file | none — first run |

**Age distribution:** Items span 2026-05-06 (oldest, WF3 telemetry baseline) through 2026-10-05 (newest, enrich_centreline ③ cutover). Largest clusters: May–June 2026 deferrals (~50% of rows) from Spec 65/48/49/42 output-altitude passes.

**Delta vs prior:** N/A (first triage run). Future runs will diff open/closed counts.

**Queue trend:** At 108 open HIGH items with no prior triage baseline, the queue is not shrinking on its own. Recommend running 1 sweep WF/week to prevent further accumulation. The three sweeps above (A, B, C) address 5 HIGH items and produce immediately testable outcomes with contained scope.
