# Review Queue Triage — 2026-07-27

_Automated weekly triage. Read `docs/reports/review_followups.md` end-to-end, grepped codebase for stale items, cross-referenced `git log --since='14 days ago'`._

---

## 1. Stale Items (evidence of resolution)

### 1a. RESOLVED — `isProjected` dead variable in `scripts/load-massing.js`

**Original defer:** WF2 #C 2026-05-09 — worktree (conf 88): "declared but never used after WF2 #C."

**Evidence:** `scripts/load-massing.js:338-339` now reads:
```js
// The `isProjected` detection stays as a runtime sanity log only.
const isProjected = ring[0] && (Math.abs(ring[0][0]) > 180 || Math.abs(ring[0][1]) > 180);
```
The variable was given a documented purpose (a runtime projection sanity log). Not dead code. No WF3 needed.

---

### 1b. MITIGATED — `clampedLimit`/`clampedKm` NaN when input is `undefined` (`get-lead-feed.ts`)

**Original defer:** 2026-05-08 DeepSeek HIGH — `Math.max(1, undefined)` → NaN; `Math.min(undefined, MAX_RADIUS_KM)` → NaN.

**Evidence:** Route handler at `src/app/api/leads/feed/route.ts:57–64` runs `leadFeedQuerySchema.safeParse(...)` with `badRequestZod` on failure before params reach `getLeadFeed`. Schema at `src/features/leads/api/schemas.ts:34,40` uses `z.coerce.number()` for both fields — an undefined/missing value fails parse and returns 400, never reaching the NaN-producing lines. The function-level fix (add `?? default`) is belt-and-suspenders, not blocking.

**Status:** Mitigated at boundary. Downgrade to LOW cleanup.

---

## 2. Top 5 This Week

Ranked by: (a) severity, (b) items unblocked, (c) whether the surrounding code is active.

---

### #1 — HIGH (data): NULL-lot parcel mislink → $105.24M phantom cost

**Source:** 2026-07-06 Reality-Check, WF2 archetype-cost plan review.
**Disposition in queue:** WF3 candidate with three sub-tasks.
**Files to fix:**
- `scripts/lib/enrich-parcels.js` — fix the massing link for NULL-lot parcels (1944170/1944175 class)
- `scripts/lib/enrich-parcels.js` — extend mislink invariants (`lot IS NULL AND cur_floor > 1000` = HIGH)
- `scripts/lib/parcel-sanity-audit.js` — add cost-magnitude checks (zone-aware `parcel_cost_menu` bounds)

**Verification:** `grep -n "FSI_MAX_PLAUSIBLE\|plausibleFsi" scripts/lib/parcel-cost.js` → only overflow guard `99.999`, no zone-aware bounds. No fix in enrich-parcels.js since filing (`git log --since='14 days ago' -- scripts/lib/enrich-parcels.js` → no recent commits).

**Rationale:** Confirmed $105.24M gut line on ≥15 downstream permits. Escaped ALL sanity guards via NULL-lot blind spot. Highest financial blast radius in the queue. Fixing also enables the zone-aware FSI ceiling (#4 below) to be added safely in the same WF.

---

### #2 — HIGH: `get-lead-feed.ts` `wsib_per_entity` LEFT JOIN acts as INNER JOIN

**Source:** 2026-05-08 Gemini WF3 deferral (compute-cost-estimates / get-lead-feed review).
**File:** `src/features/leads/lib/get-lead-feed.ts:449,486`
**Confirmed still present:**
```sql
LEFT JOIN wsib_per_entity w ON w.linked_entity_id = e.id
...
AND w.business_size IS NOT NULL   -- <-- turns LEFT into effective INNER JOIN
```
**Fix:** Remove the `AND w.business_size IS NOT NULL` predicate; handle NULL `business_size` in the UI (already does so per the comment at the deferral).
**Rationale:** Silently drops an estimated 30–50% of builder leads (contractors without WSIB `business_size`). Every builder feed request is affected. One-line fix. No touches to `get-lead-feed.ts` in the 14-day window except a uuid-cast fix (commit `ec40f59`) — safe to bundle with #3.

---

### #3 — HIGH × 3: `cost-model-shared.js` falsy-`0` bundle

**Source:** 2026-05-08 Gemini WF2 #3 review.
**File:** `src/features/leads/lib/cost-model-shared.js`
**Confirmed still open:**
- Line 208: `(row.storeys || 1)` — 0-storey foundation permit coerces to 1, inflating GFA. Fix: `??`
- Line 264: `if (pct !== undefined && pct > 0)` — `pct === 0` (valid "no construction area") falls through to matrix-miss → full-GFA fallback. Fix: drop `&& pct > 0`
- ~Line 286: `complexity_factor || 1.0` — operator-set `0` silently overridden. Fix: `??`

All three are one-line `||`→`??` changes. Bundle in a single WF3.
**Rationale:** Three independent HIGH/MED bugs sharing the same root cause in one file. Foundation-only permits get inflated GFA (affects cost estimates on renovation/structural permits). Currently no tests cover `storeys=0` or `pct=0` inputs.

---

### #4 — MED+: Zone-aware FSI ceiling in `plausibleFsi` (`scripts/lib/parcel-cost.js`)

**Source:** 2026-07-01 Reality-Check deferral (WF3 cost-menu coherence).
**File:** `scripts/lib/parcel-cost.js:46–52`
**Confirmed still open:** `FSI_MAX_PLAUSIBLE = 99.999` (numeric overflow guard only). An FSI of 20 on an RD/R lot sails through and prices normally.
**Fix:** Add zone-class FSI ceilings (e.g. lowrise ≤ ~2, RA/mid-rise ≤ ~8) in `plausibleFsi`; NULL + count when exceeded.
**Rationale:** Pairs naturally with #1 (pipeline data integrity sweep). The NULL-lot fix (#1) removes the confirmed $105M case; this closes the next class of garbage (FSI 5–99 on wrong zone). Independent of the mislink — any future bad FSI source would still price without this gate.

---

### #5 — CRITICAL (INHERITED): `classify-lifecycle-phase.js` 84-W11 unprefixed P3/P4/P5 namespace collision

**Source:** WF1 #B 2026-05-09 inherited-bug note; original bug 84-W11.
**File:** `scripts/classify-lifecycle-phase.js:1372`
**Confirmed still present:**
```sql
WHEN lifecycle_phase IN ('P3','P4','P5','P6')
```
Permit intake writes unprefixed `P3/P4/P5` instead of `INTAKE_P3/INTAKE_P4/INTAKE_P5`. The lifecycle timeline panel UI then shows "CoA Approved" as a completed phase for building permits that never go through CoA.
**Rationale:** WF1 #B deferred this with the note "must be done before any user-visible release of the inspector lifecycle panel." The panel shipped (2026-05-06, commits `4e2df49`/`3d5b47f`), but the underlying phase-label bug hasn't been fixed. Every lead inspector currently shows incorrect lifecycle history for building permits in P3/P4/P5.

---

## 3. Proposed Sweep WFs

### Sweep A — "Pipeline Data Integrity" (Backend/Pipeline domain)

**WF type:** WF3 (bug fix)
**Scope:** `scripts/lib/enrich-parcels.js`, `scripts/lib/parcel-cost.js`, `scripts/lib/parcel-sanity-audit.js`
**Items covered:** #1 (NULL-lot mislink + invariant extension + cost-magnitude audit) + #4 (zone-aware FSI ceiling)
**Estimated item count:** 4
**Note:** Reality-Check reviewer at plan altitude before code; Regression Guardian at output altitude.

---

### Sweep B — "Lead Feed Query Correctness" (Backend domain)

**WF type:** WF3
**Scope:** `src/features/leads/lib/get-lead-feed.ts`
**Items covered:**
- #2 wsib LEFT→INNER fix
- `competition_count` not trade-scoped (MED, 2026-05-08 — no `AND lv2.trade_slug = $1` in permit arm subquery at line 155)
- `cursor` pagination NULL case → empty page → client thinks feed exhausted (MED, 2026-05-08)
- `scopeMatrix` key built without `.trim()` — trailing whitespace falls through to matrix-miss (HIGH, 2026-05-08)
**Estimated item count:** 4
**Note:** All in one file. `scopeMatrix` trim belongs to compute-cost-estimates.js also (bundle).

---

### Sweep C — "cost-model-shared + load-massing dead code" (Backend domain)

**WF type:** WF3
**Scope:** `src/features/leads/lib/cost-model-shared.js`, `scripts/load-massing.js`
**Items covered:**
- #3 three falsy-`0` bugs
- `shoelaceArea` dead function (load-massing.js:36 — declared, never called post-WF2 #C)
- `SQM_TO_SQFT = 10.7639` dead constant (load-massing.js:26 — declared, not referenced post-WF2 #C)
**Estimated item count:** 5
**Note:** Low-risk; regression-lock new `storeys=0` / `pct=0` test cases before merge.

---

## 4. Queue Health

| Metric | Count |
|--------|-------|
| Total active items (estimated, excl. resolved historical) | ~120 |
| CRITICAL (architectural/pre-existing) | ~8 |
| HIGH (actionable) | ~22 |
| MED | ~35 |
| LOW / NIT | ~55 |
| Prior triage file | None (first automated triage) |

**Oldest unresolved HIGH items:** 2026-05-08 (wsib INNER JOIN, cost-model falsy-0, get-lead-feed NaN) — 80 days dormant.

**Recent activity in the queue area (14-day window):** Spec 115 (GitHub Actions pipeline dispatch), Spec 113 (Supabase TLS), Spec 112 (backup recovery), Spec 96 (mobile subscription test), Spec 15 (dashboard guard). None touch parcel enrichment, cost models, or lead feed — the Sweep A/B/C targets are all cold.

**Hygiene note:** The file contains 2,781 lines. Per §H.3 (severity decay): all HIGH items in the `get-lead-feed.ts` and `cost-model-shared.js` sections have been dormant >14 days with no escalation commits; they technically qualify for demotion to MED, but the wsib INNER JOIN and falsy-0 items have real data-quality impact and should be promoted via Sweep B/C instead of silently decayed.
