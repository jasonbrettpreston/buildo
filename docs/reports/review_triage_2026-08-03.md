# Review Queue Triage — 2026-08-03

_First automated triage run. No prior triage file exists for delta comparison._
_Source file: `docs/reports/review_followups.md` (2,836 lines — ~3.5× the ~800-line estimate in the task spec; queue has grown significantly through the Spec 65/88/89/115 pipeline work)._

---

## Stale Items (evidence of resolution in current HEAD)

| Severity | Section | Item | Resolution evidence |
|---|---|---|---|
| LOW | Parcel-sanity-audit residuals (2026-07-02) | `envelope_constraint_reason` split — "DEFER small WF3 to split `low_lot_confidence`/`oob` into `lot_too_small` / `lot_too_large`" | **Already implemented.** `enrich-parcels.js:643-644` emits `'lot_too_small'` and `'lot_too_large'` today. Also present on the garage path at line 661. `git log -S 'lot_too_small'` traces to commit `52691fa` (docs(115_scheduling)). **Recommend archiving** — the code does what the defer requested. |
| DONE (already marked) | WF3 cost-menu (2026-07-01) | `comp_fsi_p50` domain question | Marked `~~OPEN~~ RESOLVED` in the source file. Still occupying a row in the active queue table. **Recommend trimming.** |
| DONE (already marked) | WF3 cost-menu (2026-07-01) | Parcel-sanity-audit blind spots (`heritage_basis_footprint_gt_lot` etc.) | Marked `~~LOW~~ DONE` in source. **Recommend trimming.** |

---

## Top 5 This Week

### #1 — HIGH (data): NULL-lot massing-mislink WF3
**Source:** Parcel-sanity-audit residuals / WF2 archetype-cost plan review (2026-07-06)  
**Files:** `scripts/enrich-parcels.js`, `scripts/lib/parcel-cost.js`, `scripts/parcel-sanity-audit.js`

Parcels 1944170 / 1944175: `cur_floor_gfa_sqm = 14,171 m²` on NULL-lot RT parcels → `parcel_cost_menu` gut line **$105.24M**, propagated to ≥15 permits. Root cause: mislink invariants gate on `lot_size_sqm IS NOT NULL` (SQL NULL comparisons → false), so NULL-lot parcels bypass every guard.

Current `enrich-parcels.js` mislink guards at lines 538-543 still do `existing_footprint_sqm > lot_size_sqm * (1 + tol)` — NULL lot makes this false. No cost-magnitude bounds exist in `parcel-sanity-audit.js` for `parcel_cost_menu` / `cost_*_total`.

Three-part WF3:
1. Fix the 1944170/1944175 massing link (`lot_size_sqm IS NULL` → explicit `heritage_no_massing` route).
2. Extend mislink guard: `(lot_size_sqm IS NULL AND cur_floor_gfa_sqm > 1000) → HIGH` invariant.
3. Add zone-aware cost-magnitude audit check to `parcel-sanity-audit.js`.

**Rationale:** Largest known data defect. Escaped all sanity guards in the last pipeline run. Confirmed no fix in git log (most recent `enrich-parcels.js` commit: `52691fa` docs-only).

---

### #2 — HIGH (correctness): `get-lead-feed.ts` NaN + INNER JOIN regressions
**Source:** WF3 2026-05-08 (DeepSeek review of `get-lead-feed.ts`)  
**File:** `src/features/leads/lib/get-lead-feed.ts`

Two bugs confirmed open at HEAD:

**A)** `clampedKm = Math.min(input.radius_km, MAX_RADIUS_KM)` and `clampedLimit = Math.min(Math.max(1, input.limit), MAX_FEED_LIMIT)` at lines 1003-1004. If `input.radius_km` or `input.limit` is `undefined` (any request without explicit values), `Math.min(undefined, N) → NaN` → `ST_DWithin` with NaN meters returns false (empty feed), or `LIMIT NaN::int` errors at Postgres. Fix: add `?? DEFAULT_*` guards before the clamp.

**B)** `LEFT JOIN wsib_per_entity WHERE w.business_size IS NOT NULL` acts as INNER JOIN, silently dropping builders with no WSIB record (new contractors, GTA-condition failures). Estimated 30-50% of builder leads dropped.

**Rationale:** Mobile feed is the app's core revenue surface. NaN on undefined input is a latent runtime bomb that fires on any malformed/partial request.

---

### #3 — HIGH (correctness): `cost-model-shared.js` falsy-0 triple
**Source:** Gemini WF2 #3 review (2026-05-08)  
**File:** `src/features/leads/lib/cost-model-shared.js`

Three `||` instead of `??` bugs confirmed open at HEAD:

| Line | Expression | Bug |
|---|---|---|
| ~208 | `row.storeys \|\| 1` | 0-storey permit (foundation-only) gets `storeys=1` → GFA inflated |
| ~264 | `pct !== undefined && pct > 0` | `pct=0` (valid: "no construction area") falls through to matrix-miss → full-GFA default (gross cost inflation) |
| ~322 | `rateRow.structure_complexity_factor \|\| 1.0` | Operator-set `0` overridden to `1.0` silently |

All three share the falsy-0 root cause. Single WF3 (≤10 LOC). No related commits in git log since the 2026-05-08 source review.

**Rationale:** Incorrect cost estimates affect both the admin parcel-cost tool (Spec 89) and the mobile lead feed (Spec 91). Item #3 unblocks accurate cost modelling without requiring a DB migration.

---

### #4 — HIGH (drift): `ACTIVE_STATUSES` hardcoded in backfill-realtor-permit-trades.js
**Source:** DeepSeek WF3 #realtor-backfill review (2026-05-11)  
**File:** `scripts/backfill-realtor-permit-trades.js`

`ACTIVE_STATUSES` at line 70 is a hardcoded literal array, not imported from `src/lib/quality/metrics.ts:473` (canonical TS source). The R9 startup guard at line 85 throws on empty array but does **not** catch value drift — if the canonical TS set gains/loses a status, the JS backfill runs silently against the stale set.

Fix: extract to `scripts/lib/active-statuses.js` + add a parity test (mirrors the `permit-type-class.logic.test.ts` precedent). ~30 LOC total.

**Rationale:** This backfill runs periodically. Wrong `ACTIVE_STATUSES` values silently mis-classify which permits get realtor rows, poisoning the realtor feed. The canonical TS source has already evolved since the backfill was written (WF3 `779ec88` tightened the gate).

---

### #5 — MED (data quality): Zone-aware FSI ceiling missing in `plausibleFsi`
**Source:** Reality-Check, WF3 cost-menu (2026-07-01)  
**File:** `scripts/lib/parcel-cost.js:49`

`plausibleFsi(gfa, lot)` function uses `FSI_MAX_PLAUSIBLE = 99.999` — an overflow guard only. An FSI of 20 on an RD/RS/RT residential lot is physically impossible but passes through → `cost_fb_total` priced on garbage FSI. The heritage-mislink WF3 (#1 above) fixes one source of garbage FSI; this is the catch-all for any future garbage that bypasses upstream guards.

Fix: add a zone-aware ceiling inside `plausibleFsi` (e.g. lowrise ≤ ~2.5, mid-rise RA ≤ ~8, commercial CR ≤ ~15) that NULLs + increments a `plausible_fsi_zone_nulled_count` audit counter.

**Rationale:** Identified by Reality-Check as a "canonical recurring failure mode" — a value plausible in the abstract, impossible for its zone. Complements #1 and adds durable defence for future enrich runs.

---

## Proposed Sweep WFs

### Sweep A: `WF3 cost-model-shared falsy-0 fix`
**Scope:** `src/features/leads/lib/cost-model-shared.js` (lines ~208, ~264, ~322)  
**Items resolved:** 3 (Gemini WF2 #3 2026-05-08: HIGH storeys, HIGH pct gate, MED complexity_factor)  
**Effort:** ~10 LOC, one commit, no migration  
**Unlocks:** accurate GFA/cost for 0-storey, 0-allocation-pct, and 0-complexity permits

### Sweep B: `WF3 get-lead-feed reliability`
**Scope:** `src/features/leads/lib/get-lead-feed.ts`  
**Items resolved:** 3–5 (NaN on undefined radius_km/limit; wsib INNER JOIN regression; cursor NaN CASE; optionally competition_count trade-scope and proximity_score CSE)  
**Effort:** ~30-50 LOC, no migration  
**Unlocks:** mobile feed reliability for any client that omits optional params; restores builder leads drop

### Sweep C: `WF3 parcel-NULL-lot mislink + cost magnitude`
**Scope:** `scripts/enrich-parcels.js`, `scripts/lib/parcel-cost.js`, `scripts/parcel-sanity-audit.js`  
**Items resolved:** 5 (NULL-lot mislink source fix; NULL-lot invariant extension; cost-magnitude audit; zone-aware FSI ceiling; parcel-sanity-audit blind spot for NULL-lot cost class)  
**Effort:** ~60 LOC across 3 files + one enrich re-run  
**Unlocks:** eliminates the $105.24M phantom cost class; adds the audit harness to catch future mislinks

---

## Queue Health

| Metric | Value |
|---|---|
| File size | 2,836 lines (~3.5× stated estimate of ~800) |
| Prior triage file | **None** (first automated run) |
| Delta vs prior | N/A |

**Estimated open items by severity (approximate — many older sections contain 5-15 items each):**

| Severity | ~Count | Notes |
|---|---|---|
| CRIT / HIGH | ~35 | Includes ~8 already-accepted "DEFER pre-existing" items unlikely to be actioned |
| MED | ~55 | Many are "revisit if X happens in production" |
| LOW / NIT | ~125 | Bulk of queue; majority qualify for >2-week dormancy archival |
| **Total** | **~215** | |

**Age distribution:**
- `<30 days` (2026-07-01 → 2026-08-03): ~25 items (Spec 89/65/88 parcel cost, enrich Phase 3)
- `30-90 days` (2026-05-01 → 2026-07-01): ~190 items (CoA pipeline, lifecycle engine E.1-E.4, mobile M1-M3, realtor backfill, cost-model)
- `>90 days`: none in active sections (resolved items archived to historical index)

**Queue hygiene note:** Per `review_followups.md §Hygiene Practices`, items dormant >2 weeks without escalation are candidates for archival. Approximately 150 LOW/NIT items from the 2026-05 batches have had no referenced commit activity. A dedicated hygiene WF2 (read-only, doc-only) targeting the May items would shrink the file by ~40%.

---

_Triage by automated scheduled agent. Branch: `chore/review-triage-2026-08-03`. Do NOT mutate `review_followups.md` — this file is the dated output only._
