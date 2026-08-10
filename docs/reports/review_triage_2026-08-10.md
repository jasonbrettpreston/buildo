# Weekly Review-Queue Triage — 2026-08-10

_Source file:_ `docs/reports/review_followups.md` (2878 lines, ~140 open items)
_Prior triage file:_ none (first run)

---

## 1. Stale Items (already resolved, still listed as open)

### RESOLVED — `compute-cost-estimates.js` `scopeMatrix` .trim()
- **Filed:** WF3 cost-menu/FSI residuals (2026-07-01), Severity: HIGH
- **Claim:** `scopeMatrix` key built without `.trim()` → trailing whitespace falls to full-GFA fallback.
- **Evidence:** `scripts/compute-cost-estimates.js:346-348` applies `.trim()` on both `permit_type` and `structure_type` with an explicit inline comment naming the intent. Confirmed via grep.
- **Verdict: STALE — already fixed.**

### MITIGATED — `get-lead-feed.ts` `clampedLimit`/`clampedKm` NaN on undefined input
- **Filed:** WF3 neighbours FK-join residuals (2026-05-08), Severity: HIGH×2
- **Claim:** `Math.max(1, undefined)` and `Math.min(undefined, MAX)` produce NaN, which fails at Postgres.
- **Evidence:** `src/features/leads/api/schemas.ts:34-46` — `leadFeedQuerySchema` uses `z.coerce.number().finite()` with `.default(DEFAULT_RADIUS_KM)` / `.default(DEFAULT_FEED_LIMIT)`. The Zod parse is mandatory before `getLeadFeed` is called (`route.ts:58-63`). The internal function is still unguarded, but callers can only reach it through the validated route.
- **Verdict: STALE — mitigated at route boundary. Low residual risk (no non-route callers in prod).**

### RESOLVED — 115_scheduling chain-outage residuals (verdict race + waiting-apply blindness)
- **Filed:** 2026-08-08, Severity: HIGH + MED
- **Evidence:** `review_followups.md` line 2877 (added by commit `6db5455`) contains the explicit correction: "REFUTED + FIXED" with the real defect addressed by commits `8556c99` (chain time-budget soft-stop, Spec 115 §2.2) and `d5a5816` (watchdog `::error` upgrade + end-of-job gate). The original two entries at lines 2875-2876 are superseded.
- **Residual outstanding:** SIGTERM-handler normal-completion overwrite ("unconditional terminal write by id will overwrite signal-handler's 'failed' status") — filed for the next scheduling WF3.
- **Verdict: STALE — both entries resolved. One sub-residual open.**

---

## 2. Top 5 Actionable Items This Week

### #1 — NULL-lot massing-mislink emit gate in `enrich-parcels.js` [HIGH, Pipeline]

**Source:** Parcel-sanity-audit residuals (2026-07-06), WF3 item, parts 1+2 of 3.
**Problem:** The heritage mislink guard at `enrich-parcels.js:573` evaluates `existing_footprint_sqm > lot_size_sqm * (1 + mislinkTolNum)` — when `lot_size_sqm IS NULL`, this compares against `NULL`, returns `NULL` (not `TRUE`), and the guard is bypassed. Parcels 1944170 and 1944175 (RT, NULL lot) carry a confirmed $105.24M cost phantom. Part 3 (cost-magnitude audit rows) was done (`nulllot_on_gfa_or_cost_bearing` at `parcel-sanity-audit.js:130`), but the upstream emit fix is still missing.
**Why now:** `enrich-parcels.js` is the hottest file in the repo (10+ commits in 14 days). Detection exists; the PREVENTION doesn't. Any enrich re-run can re-populate the poison.
**WF:** WF3 — extend the `heritage_footprint_mislink` CTE with an explicit `OR (lot_size_sqm IS NULL AND existing_footprint_sqm > 1000)` arm; similarly gate the GFA/cost emit to NULL-lot parcels.

---

### #2 — `cost-model-shared.js` falsy-zero triple-fix [HIGH×3, Pipeline/Cost]

**Source:** WF2 #3 residuals (2026-05-08).
**Problem:** Three independent `||`-vs-`??` bugs in the same file:
- `cost-model-shared.js:208` — `(row.storeys || 1)`: `storeys=0` (foundation-only) inflates GFA to 1-storey equivalent.
- `cost-model-shared.js:264` — `pct !== undefined && pct > 0`: `pct=0` (no allocation) falls through to full-GFA fallback, grossly inflating cost.
- `cost-model-shared.js:322` — `complexity_factor || 1.0`: operator-set `0` silently overridden to 1.0.
**Why now:** Same file, same root cause (`||` vs `??`), one WF3 commit fixes all three. No recent touches (safe to work on). Fix is mechanical (3 one-liners).
**WF:** WF3 — replace `||` with `??` at lines 208, 264 (`pct > 0` → `pct !== undefined`), 322.

---

### #3 — `get-lead-feed.ts` builder LEFT JOIN acting as INNER JOIN [HIGH, User-Facing]

**Source:** WF3 neighbours FK-join residuals (2026-05-08).
**Problem:** `get-lead-feed.ts:486` has `AND w.business_size IS NOT NULL` on the `builder_candidates LEFT JOIN wsib_per_entity` join, converting the LEFT JOIN to an INNER JOIN. Builders without a WSIB business-size record (new contractors, non-Ontario entities) are silently dropped. Estimated 30–50% of builder leads invisible to users.
**Why now:** Confirmed current via grep. Direct user-facing product regression. One-line fix.
**WF:** WF3 — remove `AND w.business_size IS NOT NULL` from line 486; verify Spec 91 §4.3 builder-display handles `NULL business_size`.

---

### #4 — `plausibleFsi` zone-aware ceiling in `parcel-cost.js` [MED→effective HIGH, Pipeline]

**Source:** WF3 cost-menu/FSI residuals (2026-07-01).
**Problem:** `scripts/lib/parcel-cost.js:46-52` only guards `FSI_MAX_PLAUSIBLE = 99.999` (a NUMERIC-overflow fence). An FSI of 15–20 on an RD/RS parcel is physically impossible but sails through → `cost_fb_total` priced on garbage. The parcel-sanity-audit detects outliers via `newbuild_cost_per_sqm_out_of_band` (line 125) but cannot prevent the pricing from landing.
**Why now:** Zone-aware family ceilings already exist in `parcel-sanity-audit.js` (the `LOWRISE` macro, `MIDRISE` etc.). This is a port, not a design decision.
**WF:** WF3 (bundle with Sweep A below) — add a `ZONE_FSI_CEIL` lookup table in `parcel-cost.js` keyed on `zoning_family` (lowrise ≤ 2.5, mixed ≤ 8, high-rise ≤ 30); NULL + count when exceeded.

---

### #5 — PaywallScreen hardening (4 HIGH items) [HIGH×4, Mobile/Revenue]

**Source:** WF3 telemetry baseline deferrals (2026-05-06).
**Problems:**
1. `handlePrimary` has no `try/catch` on `await openCheckout()` — unhandled rejection leaves checkout in indeterminate state.
2. `successNotification()` haptic fires on browser-open, not payment confirmed (Spec 91 §4.4 violation).
3. Under `CTA_NEUTRAL` flag, `accessibilityLabel` still reads "Continue subscription at buildo.com" — screen-reader / visible-text mismatch.
4. `handleRefresh` has no error catch — `queryClient.invalidateQueries` throwing leaves `isRefreshing` stuck.
**Why now:** Revenue/checkout flow. Four bugs in one screen component; one WF3 commit fixes all.
**WF:** WF3 Cross-Domain (mobile) — wrap `openCheckout` in try/catch; gate haptic on `subscription_status` transition; update `accessibilityLabel` from `CTA_NEUTRAL` flag; add catch to `handleRefresh`.

---

## 3. Proposed Sweep WFs

### Sweep A — Pipeline cost-model defensive fixes (WF3)

**Scope:** `src/features/leads/lib/cost-model-shared.js`, `scripts/lib/parcel-cost.js`, `scripts/enrich-parcels.js`
**Items:** falsy-zero triple (#2 above) + zone-aware FSI ceiling (#4 above) + null-lot emit gate (#1 above)
**Count:** 5 items, all cost/parcel domain, no UI surface
**Rationale:** #1 and #4 both touch the parcel-cost stack; #2 is one file over and shares the WF3 review artifacts. Bundling avoids three separate review panels on adjacent code.
**Estimated effort:** 1 day (all mechanical fixes with clear specs; db tests exist for each path).

---

### Sweep B — Lead feed reliability (WF3)

**Scope:** `src/features/leads/lib/get-lead-feed.ts` (one file)
**Items:**
- Builder INNER JOIN fix (#3 above)
- Cursor pagination NULL CASE (MED — `COALESCE` or route-handler cursor validation)
- `competition_count` not trade-scoped (MED — `AND lv2.trade_slug = $1` missing)
- `proximity_score` CASE evaluates `<->` 8× per row (MED — compute distance once in subquery)
**Count:** 4 items
**Rationale:** All in one file, all affect query correctness or feed fidelity. Builder fix alone (#3) is the unlock; the others batch cleanly.
**Estimated effort:** 1 day.

---

### Sweep C — Mobile PaywallScreen + auth hardening (WF3 Cross-Domain)

**Scope:** `mobile/` (PaywallScreen component + `mobile/src/lib/apiClient.ts`)
**Items:**
- PaywallScreen 4 HIGHs (#5 above)
- §4 B6 promise-mutex for concurrent 401s (HIGH — `apiClient.ts` ~15 LoC)
- `clearLocalSessionState` per-step try/catch (HIGH — partial-cleanup PIPEDA risk)
**Count:** 6 items
**Rationale:** Mobile auth + checkout surface. The B6 mutex is the architectural reinforcement item explicitly tagged "highest leverage after lint/doc fixes." Batches with the PaywallScreen review.
**Estimated effort:** 1–2 days (B6 mutex is the trickiest piece).

---

## 4. Queue Health

| Metric | Value |
|--------|-------|
| Total open items (est.) | ~137 |
| CRIT (architectural, pre-existing) | ~5 |
| HIGH | ~38 |
| MED | ~44 |
| LOW / NIT | ~50 |
| Stale (confirmed resolved above) | 3 entries, ~5 sub-items |
| Age range | 2026-05-05 (oldest) → 2026-08-09 (newest) |
| Prior triage file | None (first run) |
| Queue delta vs prior | N/A |

**Observations:**
- The queue is backlog-heavy: ~60% of items are from May 2026 (Spec 42 CoA pipeline + mobile architecture work). Most are accepted-limitation DEFERs ("revisit when a consumer begins pricing on this") — not actionable now.
- The pipeline/cost domain (Spec 65/88/89) has the most actionable HIGH items, coinciding with where active development is happening.
- Mobile domain has 4 HIGH PaywallScreen items from May 2026 that have been aging without a dedicated WF. Recommend scheduling Sweep C within 2 weeks given checkout-flow risk.
- Spec 62 (Toronto Centreline) has 1 CRIT + 3 HIGH architectural items that are cross-spec scope (affect Specs 58/59/61/62 simultaneously). These should be raised to a dedicated architectural WF1, not a WF3 patch.
