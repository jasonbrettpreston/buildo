# Review Queue Triage — 2026-06-22

_First triage run; no prior `review_triage_*.md` to delta against. Source: `docs/reports/review_followups.md` (~276 KB, read end-to-end 2026-06-22). Repo is static — 0 commits in the last 30 days (last commit ~2026-05-19). No "hot files" heuristic applies; prioritisation is severity + unblocking leverage only._

---

## 1. Stale Items (finding superseded by code or schema changes)

### S1 · FlightCard negative day badge — RESOLVED
**Original:** LOW, Pre-Spec-99 Mobile Findings. "`FlightCard` urgency badge can show negative day count (`⚡ -2 DAYS`) — `Math.ceil(daysUntilStart!)` with no `Math.max(0, ...)` floor at line 202."
**Evidence:** `mobile/src/components/feed/FlightCard.tsx:197–203` now contains an explicit `daysUntilStart <= 0` branch that renders an "OVERDUE" badge instead of calling `Math.ceil`. The `Math.ceil` path only executes when `daysUntilStart > 0`. Negative display is impossible.
**Action:** Remove from backlog.

### S2 · `clampedKm` / `clampedLimit` NaN bugs — MITIGATED
**Original:** HIGH, DeepSeek 2026-05-08. "`clampedKm = NaN` when `input.radius_km` undefined; `clampedLimit = NaN` when `input.limit` undefined."
**Evidence:** `src/app/api/leads/feed/route.ts:58–64` runs `leadFeedQuerySchema.safeParse(...)` before calling `getLeadFeed`. `LeadFeedInput` (defined at `src/features/leads/types.ts:76,81,83`) declares both `radius_km: number` and `limit: number` as required non-optional fields. Any request missing either is rejected with HTTP 400 before `getLeadFeed` is invoked; the `Math.min(input.radius_km, ...)` line is unreachable with undefined. NaN path is closed.
**Action:** Remove from backlog.

### S3 · `ACTIVE_STATUSES` drift from `src/lib/quality/metrics.ts:473` — STALE REFERENCE
**Original:** HIGH, DeepSeek 2026-05-11. "ACTIVE_STATUSES hardcoded literal in `backfill-realtor-permit-trades.js` not imported from `src/lib/quality/metrics.ts:473`."
**Evidence:** `grep -rn "ACTIVE_STATUSES" src/` finds no match in `src/lib/` at all. The claimed canonical TS source does not exist at that path. The constant in the backfill script is the only authoritative definition; no divergent TS source to drift from. The finding's premise (two separate canonical definitions) is no longer true. The `src/tests/admin.ui.test.tsx:228` inline definition is test-local only.
**Action:** Demote to LOW / no-action (the startup guard at `backfill-realtor-permit-trades.js:85` catches the empty-array failure mode; no canonical TS source exists to enforce parity against).

---

## 2. Top 5 Actionable Items This Week

Ranked: (a) severity, (b) items unblocked, (c) code-path blast radius.

---

### #1 · Cost-model falsy-`0` bundle — 3 HIGH in one file
**Severity:** HIGH × 3  
**Source:** Gemini WF2 #3 review (2026-05-08)  
**Files:** `src/features/leads/lib/cost-model-shared.js`

Three operators use `||` where `??` is required:
- **Line ~188** `(row.storeys || 1)` — a foundation-only permit with `storeys = 0` is inflated to 1 storey, overstating GFA.
- **Line ~227** `pct > 0` guard in `computeEffectiveArea` — `gfa_allocation_percentage = 0` (valid: "no construction area") falls through to full-GFA default, grossly inflating cost on minor permits with large structures.
- **Line ~286** `complexity_factor || 1.0` — operator-set `0` is overridden to 1.0.

All three fixes are single-character swaps (`||` → `??`). Gemini explicitly said "bundle these; all share the same root cause." Fixing unblocks the cost-model correctness story and removes 3 open HIGHs.

**Planned home:** WF3 — `cost-model-shared.js` falsy-`0` sweep. Bundle with #2 below.

---

### #2 · `scopeMatrix` missing `.trim()` — Spec 83 §3 explicit violation
**Severity:** HIGH  
**Source:** Gemini WF2 #3 review (2026-05-08)  
**Files:** `scripts/compute-cost-estimates.js:241–242`

`scopeMatrix` keys are built as:
```js
`${r.permit_type.toLowerCase()}::${r.structure_type.toLowerCase()}`
```
Spec 83 §3 explicitly requires `.toLowerCase().trim()`. Trailing whitespace in a DB row produces a matrix miss → full-GFA fallback → the cost inflation pattern WF2 #3 was specifically designed to prevent. One-line fix; same WF3 as #1.

**Planned home:** WF3 — bundle with cost-model-shared.js sweep above.

---

### #3 · `wsib_per_entity` LEFT JOIN → effective INNER JOIN silently drops builder leads
**Severity:** HIGH  
**Source:** DeepSeek WF3 2026-05-08 review of `get-lead-feed.ts`  
**File:** `src/features/leads/lib/get-lead-feed.ts:441,478`

```sql
LEFT JOIN wsib_per_entity w ON w.linked_entity_id = e.id
...
AND w.business_size IS NOT NULL   -- ← turns LEFT into INNER
```

The `WHERE` predicate on the nullable column from the LEFT JOIN silently converts it to an INNER JOIN, excluding all builders where WSIB data is absent (new contractors, GTA-condition failures). Estimated impact: 30–50% of eligible builder leads are invisible to mobile users. Fix: remove the `WHERE` predicate; the UI and Spec 91 §4.3 builder-display contract already handle `NULL business_size`.

**Unblocks:** Fixing restores the full builder-lead pool; could meaningfully improve realtor engagement metrics.

**Planned home:** WF3 — `get-lead-feed.ts` builder-leads repair sweep (see WF-B below).

---

### #4 · `§4 B6` thundering-herd mutex missing — "known limitation" in "safe by construction" architecture
**Severity:** HIGH  
**Source:** Gemini WF2 M1+M2+M3 batch; Architectural Reinforcement section  
**File:** `mobile/src/lib/apiClient.ts` (~lines 65–84)

Spec 99 declares bridges are "safe by construction." §B6 simultaneously has a "known limitation" footnote: N concurrent 401 responses each call `getIdToken(true)` independently, producing N parallel refresh requests to Firebase. Under a deploy-induced 401 storm this can exhaust Firebase token quotas or create race conditions on the resulting tokens.

Fix is ~15 lines: first 401 stores the in-flight refresh promise; subsequent 401s `await` the same promise rather than starting a new one. The footnote becomes a guarantee.

**Unblocks:** Removes the only "known limitation" in the core auth bridge; closes the Architectural Reinforcement #5 item; makes the §B6 spec text accurate.

**Planned home:** WF3/WF2 — `apiClient.ts` single-flight token refresh.

---

### #5 · PaywallScreen hardening sweep — 3 HIGH + 1 MED in one file
**Severity:** HIGH × 3, MED × 1  
**Source:** DeepSeek telemetry WF3 deferrals 2026-05-06  
**File:** `mobile/src/components/paywall/PaywallScreen.tsx`

Four issues at the same callsite:
- **(HIGH)** `handlePrimary` (`line ~117`): `const ok = await openCheckout()` has no try/catch. If `openCheckout` throws (WebBrowser crash, network failure), the error surfaces as an unhandled promise rejection — no user feedback, indeterminate checkout state.
- **(HIGH)** `handleRefresh` (`line ~125`): `await queryClient.invalidateQueries(...)` has no catch. A thrown error leaves `isRefreshing` permanently `true`, freezing the refresh spinner.
- **(HIGH)** `handlePrimary` premature haptic: `successNotification()` fires when `ok === true` (WebBrowser opened), but Spec 91 §4.4 reserves the success haptic for "genuine successful state mutations" (i.e., `subscription_status` transitioning to `'active'`). A user who opens the browser and abandons still gets the success haptic.
- **(MED)** `accessibilityLabel` mismatch: when `CTA_NEUTRAL` env flag flips button copy to "Learn more →", the hardcoded `accessibilityLabel="Continue subscription at buildo.com"` contradicts the visible text — screen-reader users see contradictory state.

**Planned home:** WF3 — PaywallScreen hardening cycle (named in the original deferral).

---

## 3. Proposed Sweep WFs

### WF-A: Cost-Model Precision Sweep (WF3)
**Scope:** `src/features/leads/lib/cost-model-shared.js`, `scripts/compute-cost-estimates.js`  
**Items addressed:** #1 (3 HIGH falsy-`0`) + #2 (1 HIGH scopeMatrix trim) + 1 MED (`data_quality_snapshots` UPDATE → ON CONFLICT) + 1 MED (`BULK_COLUMN_COUNT = 15` manually-maintained constant)  
**Estimated item count:** 6  
**Rationale:** All items are in the cost-model compute pair. The two scripts share the `cost-model-shared.js` Brain; a single WF3 touching both closes the entire cost-accuracy cluster. No schema migration required. Low blast radius.

---

### WF-B: Lead Feed Builder-Lead Repair (WF3)
**Scope:** `src/features/leads/lib/get-lead-feed.ts`  
**Items addressed:** #3 (1 HIGH LEFT JOIN bug) + 1 MED (cursor NULL CASE → empty page → client thinks feed exhausted) + 1 MED (`competition_count` not trade-scoped, double-counting saves) + 1 MED (`proximity_score` CASE re-evaluates `geography <->` 8× per row)  
**Estimated item count:** 4  
**Rationale:** All items are in one SQL query file. The LEFT JOIN fix already requires a WHERE-clause edit in the same builder CTE block where the other MED items live. Natural co-location reduces review surface.

---

### WF-C: PaywallScreen Hardening (WF3)
**Scope:** `mobile/src/components/paywall/PaywallScreen.tsx`  
**Items addressed:** #5 (all four: handlePrimary try/catch, handleRefresh catch, premature haptic, accessibilityLabel)  
**Estimated item count:** 4  
**Rationale:** All four items are in a single 200-line component. The "WF3 PaywallScreen hardening cycle" is already the named Planned Home for each; no new WF design needed.

---

## 4. Queue Health

| Dimension | Count |
|-----------|-------|
| Total active items (estimated) | ~175 |
| CRIT (active) | 0 (all previously folded inline or rejected as false positives) |
| HIGH (active) | ~30 |
| MED (active) | ~60 |
| LOW / NIT (active) | ~85 |
| Stale items confirmed this triage | 3 (S1, S2, S3) |
| Prior triage file | None (first run — no delta available) |
| Commits in last 30 days | 0 (repo static since ~2026-05-19) |

**Oldest open HIGH items by section age:**
- WF3 (2026-05-08) neighbourhoods FK: `LATERAL parcel ORDER BY parcel_id ASC LIMIT 1` non-deterministic (~45 days open)
- WF3 (2026-05-08) cost model: falsy-`0` bundle (~45 days open)
- WF3 (2026-05-06) telemetry: `signOut` race + `clearLocalSessionState` per-step catch (~47 days open)

**Hygiene note:** Per the file's own §Hygiene rule #3 ("HIGH item dormant >2 weeks without progress → demote to MEDIUM"), the ~45-day-old HIGHs in items #1/#2/#3 above are overdue for demotion if not actioned this week. This triage surfaces them as the Top 3 specifically to prevent that decay.

**Recommended next sweep after WF-A/B/C:** Architectural Reinforcement items (§B4 idToken-gate doc, §8.5 store-enum import-based discovery, §9.21 lint `countMatches` fix) — all LOW-MED, 5–15 lines each, documented as "small + high-leverage" in the source file.
