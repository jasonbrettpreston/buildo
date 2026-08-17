# Review-Queue Triage — 2026-08-17

_Automated weekly triage of `docs/reports/review_followups.md`. No prior triage file exists (first run). Read the full queue end-to-end; grepped the codebase for staleness evidence; cross-referenced `git log --since='14 days ago'` for recently-active files._

---

## 1. Stale Items

Items named a specific file/function that has since been addressed or invalidated.

### 1a. `shoelaceArea` — **dead code confirmed present**
- **WF2 #C defer** (2026-05-09): "DEFER — `shoelaceArea` function is now unused."
- **Grep:** `scripts/load-massing.js:43` defines the function; **zero call-sites** found in the file or codebase.
- **Resolution evidence:** none — still dead code. `git log --all -S 'shoelaceArea'` last touched in `2fa59c0` (deep-scrapes classification, unrelated file). Remains open.

### 1b. `SQM_TO_SQFT` constant — **dead code confirmed present**
- **WF2 #C defer** (2026-05-09): "DEFER — `SQM_TO_SQFT` constant unused."
- **Grep:** `scripts/load-massing.js:26` defines `const SQM_TO_SQFT = 10.7639`; no usage after line 26.
- Remains open. Bundle with shoelaceArea into a single low-priority cleanup.

### 1c. `isProjected` variable — **partially resolved in-place**
- **WF2 #C defer** (2026-05-09): "DEFER — `isProjected` variable declared but never used."
- **Grep:** `scripts/load-massing.js:351–352` — still assigned but now the code comment reads "stays as a runtime sanity log only." Value still never referenced after assignment. The function body was restructured; the defer remains, now cosmetically documented.

### 1d. `clampedLimit`/`clampedKm` NaN-on-undefined — **partially mitigated**
- **WF2 find** (2026-05-08, `get-lead-feed.ts`): `Math.max(1, undefined)` → `NaN` when `input.limit` absent.
- **Grep** `src/features/leads/lib/get-lead-feed.ts:1003–1004`: code still uses `Math.min(input.radius_km, MAX_RADIUS_KM)` and `Math.min(Math.max(1, input.limit), MAX_FEED_LIMIT)` without `??` guards. The route handler at `src/app/api/leads/feed/route.ts:154–155` passes `{radius_km: params.radius_km, limit: params.limit}` without explicit undefined guards visible in the grepped output.
- **Status:** Still open unless the upstream query-param parser guarantees non-undefined. Remains actionable.

### 1e. `lead_views` performance index — **may be superseded**
- **WF2 #4 defer** (2026-05-08): missing `idx_lead_views_lead_key_saved` index.
- **Grep:** `migrations/079_lead_views_covering_index.sql` exists — a covering index was already created in mig 079. Whether the exact column combo (`lead_key INCLUDE user_id WHERE saved=true`) was covered is unverified. **Tentatively stale** — mig 079 pre-dates the deferral date. Recommend manual verify before actioning.

---

## 2. Top 5 This Week

Ranked by: (a) severity, (b) unblocking potential, (c) recently-active files.

### #1 — NULL-lot parcel mislink poisoning cost estimates [$105M blast radius]
**Severity:** HIGH (data)  
**Source:** WF2 archetype-cost plan review — Reality-Check (2026-07-06)  
**Item:** Parcels 1944170/1944175 have `cur_floor_gfa_sqm = 14,171 m²` on NULL-lot RT parcels → `parcel_cost_menu` gut-line **$105.24M**, propagating to ≥15 permits. Root cause: every mislink invariant in `parcel-sanity-audit.js` has `applies: lot_size_sqm IS NOT NULL`, creating a NULL-lot blind spot. No cost-magnitude checks exist on `parcel_cost_menu`/`cost_*_total` fields.  
**Rationale:** Highest blast-radius active bug in the queue. The WF2 archetype plan's T2 bounds partially neutralize the *cost* consequence but the upstream data defect persists and will regenerate on the next enrich re-run.  
**Files:** `scripts/enrich-parcels.js`, `scripts/analysis/parcel-sanity-audit.js`, `scripts/compute-cost-estimates.js`  
**Unblocks:** Every downstream cost consumer (parcel cost tool, Spec 88 P2/P3, mobile cost display) is currently exposed to phantom $100M+ values.  
**Recent activity:** `parcel-sanity-audit.js` was modified in recent commits `1fad5ee` and `4c598dd` (assert-data-bounds, enriched-status, C3 backfill).

---

### #2 — `storeys || 1` falsy-0 cluster in `cost-model-shared.js` (3 linked HIGH items)
**Severity:** HIGH × 3 (correctness)  
**Source:** Gemini WF2 #3 review (2026-05-08)  
**Item:** Three `||`→`??` swaps needed in `src/features/leads/lib/cost-model-shared.js`:
  1. Line 208: `row.storeys || 1` — a `storeys=0` permit (foundation-only) gets GFA inflated to 1-storey equivalent.
  2. Line 227: `pct > 0` gate — `scope_intensity_matrix` row with `gfa_allocation_percentage=0` (valid: "no construction area") falls through to the full-GFA matrix-miss branch.
  3. Line 286: `complexity_factor || 1.0` — an operator-set `0` is silently overridden.  
**Rationale:** All three share the same root cause; one WF3 closes all three. Cost model is the backbone of the lead-scoring engine. `cost-model-shared.js` is shared by both pipeline bulk-writer and the TS API shim.  
**Files:** `src/features/leads/lib/cost-model-shared.js`  
**Unblocks:** Accurate cost estimates for foundation-only, zero-construction-area, and operator-zeroed-complexity permits.

---

### #3 — `builder_candidates` LEFT JOIN silently drops 30–50% of builder leads
**Severity:** HIGH (correctness, hot read path)  
**Source:** DeepSeek WF2 review (2026-05-08), `get-lead-feed.ts`  
**Item:** `src/features/leads/lib/get-lead-feed.ts:449` does `LEFT JOIN wsib_per_entity w ON ...` but line 486 adds `AND w.business_size IS NOT NULL` in the **WHERE clause** (confirmed via `sed -n '480,495p'`). A WHERE predicate on a LEFT-joined nullable column acts as an INNER JOIN, silently dropping all builder leads with no WSIB record — new contractors, GTA-condition failures. Estimated drop: 30–50% of builder candidates.  
**Rationale:** Directly harms builder lead-gen revenue for a key user persona. The bug is in the primary feed query, not a diagnostic path.  
**Files:** `src/features/leads/lib/get-lead-feed.ts`  
**Unblocks:** Accurate builder lead counts for Realtors/Builders subscribed to the 'all' feed. Bundles well with #4 below.

---

### #4 — `clampedKm`/`clampedLimit` NaN when `radius_km`/`limit` undefined
**Severity:** HIGH (correctness)  
**Source:** DeepSeek WF2 review (2026-05-08), `get-lead-feed.ts`  
**Item:** `Math.min(undefined, MAX_RADIUS_KM)` → `NaN`; `ST_DWithin(..., NaN)` silently returns false → empty feed for any request where `radius_km` or `limit` is not explicitly provided. Fix: `input.radius_km ?? MAX_RADIUS_KM` and `input.limit ?? DEFAULT_FEED_LIMIT` before the clamp.  
**Rationale:** Silent empty-feed defect that is hard to reproduce without the exact undefined-input state. Bundle with #3 for a single `get-lead-feed.ts` correctness WF3.  
**Files:** `src/features/leads/lib/get-lead-feed.ts`

---

### #5 — `ACTIVE_STATUSES` hardcoded in `backfill-realtor-permit-trades.js`, drift undetected
**Severity:** HIGH (drift risk)  
**Source:** DeepSeek WF3 #realtor-backfill review (2026-05-11)  
**Item:** `scripts/backfill-realtor-permit-trades.js` hardcodes `ACTIVE_STATUSES` as a literal array instead of importing from `src/lib/quality/metrics.ts:473` (canonical source). The §R5 startup guard added in-loop catches the empty-array case but NOT the wrong-values case — if the canonical set drifts (a status is added or renamed), the backfill silently processes the wrong permits with no CI failure.  
**Fix:** Extract to `scripts/lib/active-statuses.js` JS mirror + parity test against the TS source (same pattern as `REALTOR_RELEVANT_TYPES`).  
**Rationale:** Backfill scripts are re-run operationally; a silent wrong-ACTIVE_STATUSES run would produce a structurally-clean but semantically-wrong `permit_trades` population.  
**Files:** `scripts/backfill-realtor-permit-trades.js`, new `scripts/lib/active-statuses.js`

---

## 3. Proposed Sweep WFs

### Sweep A — Parcel NULL-lot data integrity (WF3, Backend/Pipeline)
**Scope:** `scripts/enrich-parcels.js`, `scripts/analysis/parcel-sanity-audit.js`  
**Items addressed (4):**
1. HIGH (data): Fix 1944170/1944175 massing-mislink on NULL-lot parcels (enrich-parcels mislink guard)
2. HIGH (data): Extend all mislink invariants (`applies:` predicates) to also cover `lot_size_sqm IS NULL` — e.g., `lot IS NULL AND cur_floor > 1000 = HIGH`
3. HIGH (data): Add cost-magnitude checks to `parcel-sanity-audit.js` — zone-aware bounds on `parcel_cost_menu` / `cost_*_total`
4. LOW (edge): Add explicit `lot_size_sqm IS NOT NULL` guard to heritage emit path (heritage NULL-lot, ~few parcels, parcel 475651 class)

**Estimated effort:** 1 WF3 (~2 implementation phases: enrich-parcels guard + audit bounds)

---

### Sweep B — `get-lead-feed.ts` correctness hardening (WF3, Backend)
**Scope:** `src/features/leads/lib/get-lead-feed.ts`  
**Items addressed (5):**
1. HIGH: Move `AND w.business_size IS NOT NULL` from WHERE to LEFT JOIN's ON clause (builder INNER JOIN → true LEFT JOIN)
2. HIGH: Add `?? DEFAULT_FEED_LIMIT` / `?? MAX_RADIUS_KM` guards before `Math.min`/`Math.max` clamps
3. MEDIUM: Add `WHERE lead_id IS NOT NULL` COALESCE or route-handler validation for cursor pagination NULL
4. MEDIUM: Add `AND lv2.trade_slug = $1` to `competition_count` subquery (trade scope fix)
5. MEDIUM: Pre-compute `geography <->` distance once per row, reference in CASE (proximity_score 8x re-eval)

**Estimated effort:** 1 WF3 (all SQL changes in one file; no migration needed)

---

### Sweep C — `cost-model-shared.js` falsy-0 + coverage accuracy (WF3, Backend)
**Scope:** `src/features/leads/lib/cost-model-shared.js`  
**Items addressed (5):**
1. HIGH: Line 208 `storeys || 1` → `?? 1` (foundation-only permit GFA inflation)
2. HIGH: Line 227 `pct > 0` gate → `pct !== undefined` (zero-pct allocation fallback to full GFA)
3. MEDIUM: Line 286 `complexity_factor || 1.0` → `?? 1.0` (operator-zero override)
4. LOW: Proportional-slicing rounding error — add JSDoc note on off-by-pennies for multi-trade splits
5. DEFER: `modelCoveragePct` denominator includes skipped permits — add separate `construction_model_coverage_pct` excluding `permit_type_class_skipped` from denominator (cleaner observability)

**Estimated effort:** 1 WF3 (one shared JS file; regression-lock with existing tests + new falsy-0 test matrix)

---

## 4. Queue Health

| Metric | Count |
|--------|-------|
| Total active sections | ~30 WF/spec sections |
| Total open items (estimated) | ~125 |
| CRITICAL | ~5 |
| HIGH | ~40 |
| MED | ~50 |
| LOW / NIT | ~30 |
| Prior triage file | None (first run) |
| Delta vs prior | N/A |

**Age distribution (rough):**
- 2026-07-01 to 2026-08-17 (≤7 weeks): ~20 items — mostly pipeline/parcel quality items from Spec 65/88/89 WFs
- 2026-05-06 to 2026-06-30 (7–15 weeks): ~80 items — majority of the queue; Spec 76/80/84/91/99 batches
- Before 2026-05-06 (>15 weeks): ~25 items — architectural reinforcement, Spec 30/47/62/95 sections

**Hygiene note:** ~12 items in the queue are flagged as pre-existing against their originating WF (introduced by prior work, out-of-scope-for-that-WF). These should be the first targets for the proposed sweeps since they've had multiple opportunities to be addressed.

**Dormancy warning (per Hygiene Practice §3):** At least 15 HIGH-tagged items predate 2026-06-17 (>8 weeks without commit reference). Per severity-decay rule, these should either be promoted to active WF candidates or demoted to MED. The `compute-cost-estimates.js` cluster (8 pre-existing Gemini items from 2026-05-08) and the `get-lead-feed.ts` cluster (7 items from 2026-05-08) are the two oldest un-swept HIGH groups.

**Operational safety note (from Resolved/Historical Index):** `scripts/backup-db.js` has **never run in production** per WF5 prod backend 2026-04-25 audit. Script exists; operational state unverified. This predates all recent WFs. Recommend verifying / scheduling a backup-runbook WF before the next migration touching >100K rows (Sweep A's NULL-lot fix touches `enrich-parcels.js` which writes `parcel_max_build`).
