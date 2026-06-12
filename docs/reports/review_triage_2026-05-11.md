# Review Queue Triage — 2026-05-11

_First-ever triage pass. No prior report to diff against — no delta possible._
_Queue source: `docs/reports/review_followups.md` (~708 lines, items from 2026-05-05 through 2026-05-09)._

---

## 1. Stale Items (grep-verified against HEAD)

No items were found to be fully resolved since filing. All checked symbols remain
in the state described at filing time.

| Item | File:Line | Grep evidence | Verdict |
|---|---|---|---|
| WF2 #C — `shoelaceArea` dead function | `scripts/load-massing.js:36` | Function defined; **zero call sites** | Still open |
| WF2 #C — `SQM_TO_SQFT` unused constant | `scripts/load-massing.js:26` | Constant defined; **zero usages** | Still open |
| WF2 #C — `isProjected` dead variable | `scripts/load-massing.js:339` | Declared; no `log`/`if` reference below declaration | Still open |
| WF3 neighbourhoods — `clampedLimit` NaN | `get-lead-feed.ts:741` | `Math.max(1, input.limit)` — no `??` before Math op | Still open |
| WF3 neighbourhoods — `clampedKm` NaN | `get-lead-feed.ts:740` | `Math.min(input.radius_km, MAX_RADIUS_KM)` — no `??` | Still open |
| WF2 #3 — `storeys \|\| 1` falsy-zero | `cost-model-shared.js:193` | `(row.storeys \|\| 1)` not `?? 1` | Still open |
| WF2 #3 — `pct > 0` gate misses zero-pct | `cost-model-shared.js:234` | `pct !== undefined && pct > 0` — pct=0 still falls through | Still open |
| WF2 #3 — `complexity_factor \|\| 1.0` falsy | `cost-model-shared.js:293` | `rateRow.structure_complexity_factor \|\| 1.0` not `?? 1.0` | Still open |
| WF3 realtor — dead tier-3 ReDoS branch | `classifier.ts:39-41` | `if (tier === 3) { new RegExp(normPattern, 'i') }` present | Still open |
| Spec 86/91 WF3 — realtor in `trade_sqft_rates` | migrations/ | mig 096 seeds 32 trades; no subsequent mig adds realtor slug | Still open |
| Spec 76/47/83 WF2 #4 — `lead_views` saved index | migrations/ | No `idx_lead_views_lead_key_saved` migration exists | Still open |
| Spec 76 P5 — `lead_id` colon separator | `get-lead-feed.ts:100` | `permit_num \|\| ':' \|\| revision_num` vs `parseLeadId` expects `--` | Still open |

**Near-stale (likely already incorporated, not confirmed fully resolved):**

| Item | Evidence |
|---|---|
| Architectural Reinforcement §B4 idToken-gate doc note | Spec 99 §B4 now contains `enabled: !!user` reference within the §9.10 amendment note. The "one-paragraph Implementation note" form from the AR item appears substantially absorbed into existing text. **Recommend confirming and removing from queue at next WF6 close-out that touches Spec 99.** |

---

## 2. Top 5 This Week

Ranked by: **(a)** severity · **(b)** items unblocked · **(c)** presence in recently-touched files.

---

### #1 — Falsy-zero sweep in `cost-model-shared.js` ← **START HERE**

**Severity:** HIGH × 2 + MEDIUM × 1 · **Source:** Gemini WF2 #3 review (2026-05-08)  
**Files:** `src/features/leads/lib/cost-model-shared.js` lines 193, 234, 293

Three `||` → `??` swaps:
1. `(row.storeys || 1)` at line 193 — zero-storey foundation permits get GFA inflated to 1-storey height
2. `if (pct !== undefined && pct > 0)` at line 234 — a valid `gfa_allocation_percentage = 0` config row
   falls through to the full-GFA default; could grossly inflate cost for minor permits on large structures
3. `rateRow.structure_complexity_factor || 1.0` at line 293 — operator-set `0` silently overridden to 1.0

**Why #1:** Three bugs, same root cause, same file, ~5 lines of code total. No blockers or cross-file dependencies.
Affects every cost estimate for foundation-only and zero-allocation permits. Bundle with #2 into a single WF3.

---

### #2 — `scopeMatrix` key missing `.trim()` in `compute-cost-estimates.js`

**Severity:** HIGH · **Source:** Gemini WF3 (2026-05-08) · **Spec reference:** Spec 83 §3 explicit requirement  
**File:** `scripts/compute-cost-estimates.js:242`

Key built as `` `${r.permit_type.toLowerCase()}::${r.structure_type.toLowerCase()}` `` —
Spec 83 §3 mandates `.toLowerCase().trim()`. Trailing whitespace in DB rows silently produces
a matrix miss → full-GFA fallback → the exact cost-inflation pattern WF2 #3 gated at the
permit_type_class level. One character change on each side of `::`.

**Why #2:** Trivially small; directly undermines WF2 #3's work if not fixed. Natural bundle partner for #1.

---

### #3 — `get-lead-feed.ts` NaN clamping (undefined `limit`/`radius_km`)

**Severity:** HIGH × 2 · **Source:** DeepSeek WF3 (2026-05-08) · **File:** `get-lead-feed.ts:740-741`

`Math.max(1, undefined) → NaN` → `LIMIT NaN::int` errors the full feed for any caller that
omits explicit `limit`. `Math.min(undefined, MAX_RADIUS_KM) → NaN` → `ST_DWithin` returns
false → empty feed. Route-handler Zod validation guards the public path but not admin paths
or internal test harnesses.

Fix: `input.limit ?? DEFAULT_FEED_LIMIT` and `input.radius_km ?? DEFAULT_RADIUS_KM` before the
clamp expressions.

**Why #3:** Two-line fix in an already-hot file (touched in 3 of the last 5 commits). Bundle with
the wsib INNER JOIN fix in Sweep B (same file, same review batch) for one surgical WF3.

---

### #4 — Dead tier-3 ReDoS branch in `classifier.ts`

**Severity:** HIGH · **Source:** DeepSeek WF3 realtor review (2026-05-09) · **File:** `classifier.ts:39-41`

`if (tier === 3) { const re = new RegExp(normPattern, 'i') }` — tier-3 DB rules never reach this
surface (confirmed by Gemini's co-finding that tier-3 is dead code), but the code compiles
admin-supplied DB strings as live regexes. Dead code + theoretical ReDoS attack surface in one.

Fix: delete the tier-3 branch (lines 39–47 approximately). No downstream callers exercise it;
existing `classifier.ts` tests will continue to pass unchanged.

**Why #4:** `classifier.ts` touched in commit `779ec88` (realtor gating). Dead code removal is
lower-risk mid-week than touching cost-model paths.

---

### #5 — Realtor row missing from `trade_sqft_rates`

**Severity:** MEDIUM (promotable to HIGH) · **Source:** Spec 86/91/95/99 WF3 Mig 118+119 review (2026-05-08)  
**File:** New migration (e.g., `migrations/124_realtor_sqft_rate.sql`)

mig 096 seeded 32 trades; mig 118 added the realtor trade row but did NOT add a corresponding
`trade_sqft_rates` row. `cost-model.ts` LEFT JOINs `trade_sqft_rates` and falls back to
`base_rate_sqft = 0` / `structure_complexity_factor = 1.0` for missing rows → all realtor
`permit_trades` rows will silently produce **$0 cost estimates** once `backfill-realtor-permit-trades.js`
runs.

**Why #5:** Has a concrete unblock dependency — the Cycle 7 backfill script is the next pending
task. If the backfill ships before this migration, every realtor lead displays $0. Small migration,
no code changes required.

---

## 3. Proposed Sweep WFs (1–3 grouped fixes)

### Sweep A — Cost-model falsy-zero + scopeMatrix trim `(WF3)`
**Suggested commit scope:** `fix(83_lead_cost_model): falsy-zero ?? swap + scopeMatrix trim`  
**Files:** `src/features/leads/lib/cost-model-shared.js` + `scripts/compute-cost-estimates.js`  
**Items closed:** #1 storeys, #1 pct gate, #1 complexity_factor, #2 scopeMatrix trim → **4 items (HIGH×2, MEDIUM×2)**  
**Estimated LOC:** ~6 changed  
**Test additions:** `cost-model.logic.test.ts` — new cases for zero-storey, zero-pct-allocation, zero-complexity inputs; update any assertion that assumed old falsy-default behaviour

---

### Sweep B — `get-lead-feed.ts` NaN guards + wsib LEFT JOIN `(WF3)`
**Suggested commit scope:** `fix(70_lead_feed): NaN clamp guards + wsib left-join null-safe`  
**Files:** `src/features/leads/lib/get-lead-feed.ts`  
**Items closed:** clampedLimit NaN, clampedKm NaN, wsib `WHERE business_size IS NOT NULL` acting as INNER JOIN → **3 items (HIGH×3)**  
**Estimated LOC:** ~5 changed  
**Test additions:** `get-lead-feed.logic.test.ts` — verify undefined limit/radius_km returns a result; verify builder leads with NULL business_size are included in feed results  
**Note:** also investigate `lead_id` separator mismatch (`get-lead-feed.ts:100` colon vs `--`)
in the same WF3 planning pass — confirm whether mobile compensates or a fix is needed.

---

### Sweep C — `load-massing.js` dead-code housekeeping `(WF2)`
**Suggested commit scope:** `chore(56_source_massing): remove dead shoelaceArea/SQM_TO_SQFT/isProjected`  
**Files:** `scripts/load-massing.js`  
**Items closed:** shoelaceArea dead function, SQM_TO_SQFT unused constant, isProjected unused variable → **3 items (LOW×3)**  
**Estimated LOC:** ~40 deleted  
**Test additions:** none; existing `load-massing.infra.test.ts` confirms no regressions

---

## 4. Queue Health

| Metric | Value |
|---|---|
| Total active items (estimated unique) | ~155 |
| CRITICAL | ~7 |
| HIGH | ~38 |
| MEDIUM | ~48 |
| LOW | ~42 |
| NIT / FC / permanent-DEFER | ~20 |
| Confirmed stale (fully resolved) | 0 |
| Near-stale (likely absorbed) | 1 |
| Prior triage report | None — first pass |
| Delta vs prior | N/A |

**Age:** All items filed 2026-05-05 – 2026-05-09 (4-day burst). No items have yet crossed
the 14-day severity-decay threshold from Hygiene Practice #3. First items will cross the
threshold 2026-05-19 — recommend scheduling a second triage pass by then.

**Recently active files that also carry queue items** (last 14 days):

| File | Commits (14d) | Queue items |
|---|---|---|
| `get-lead-feed.ts` | 3 | HIGH×3 + colon-separator bug |
| `cost-model-shared.js` | 1 (indirect via WF2 #3) | HIGH×2 + MEDIUM×1 |
| `compute-cost-estimates.js` | 1 (indirect) | HIGH×1 (trim) + others |
| `classifier.ts` | 1 (`779ec88` realtor gating) | HIGH×1 (dead tier-3 ReDoS) |
| `load-massing.js` | 1 (`faca737`) | LOW×3 dead code |

**Carry-forward flag:** the `lead_id` separator mismatch (`get-lead-feed.ts:100`) was not
included in the Top 5 because WF1-A shipped the `[lead].tsx` screen successfully despite the
bug being present, suggesting the mobile app may have compensating routing logic. Recommend
confirming with a Maestro smoke test (`feed → lead-detail tap`) in the Sweep B planning pass
before filing a fix. If broken, promote to HIGH and include in Sweep B.

**Dominant theme this cycle:** backend pipeline correctness (falsy defaults, key mismatches,
dead code) rather than mobile UI. The 5 top items are all fixable in ≤2 focused WF3 commits.
