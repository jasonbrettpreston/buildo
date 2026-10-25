# Review Queue Triage — 2026-07-20

_Source: `docs/reports/review_followups.md` (~276 KB). No prior triage file exists — no delta available._

---

## Stale Items

Items that name specific symbols, verified against current HEAD.

| # | Item (original severity) | Grep evidence | Verdict |
|---|---|---|---|
| S1 | LOW `shoelaceArea` dead function (WF2 #C / load-massing.js) | `grep -n shoelaceArea scripts/load-massing.js` → line 36 still present | **STILL OPEN** |
| S2 | LOW `SQM_TO_SQFT` unused constant (WF2 #C / load-massing.js) | `grep -n SQM_TO_SQFT scripts/load-massing.js` → line 26 still present | **STILL OPEN** |
| S3 | DEFER `isProjected` unused variable (WF2 #C / load-massing.js) | `grep -n isProjected scripts/load-massing.js` → line 338–339 still declared but never used downstream | **STILL OPEN** |
| S4 | HIGH `clampedLimit` / `clampedKm` NaN on `undefined` input (WF3 2026-05-08 / get-lead-feed.ts) | Lines 985–986: `Math.min(input.radius_km, MAX_RADIUS_KM)` and `Math.min(Math.max(1, input.limit), MAX_FEED_LIMIT)` — still `NaN` if either field is `undefined`. Recent commit `1e6e5d9` (CoA UNION arm) touched `get-lead-feed.ts` but did not add `?? DEFAULT` guards. | **STILL OPEN** — route-handler Zod schema may be the actual gate; verify before WF3. |
| S5 | HIGH `builder_candidates LEFT JOIN wsib_per_entity` acts as INNER JOIN (WF3 2026-05-08 / get-lead-feed.ts) | Line 478: `AND w.business_size IS NOT NULL` on a LEFT JOIN — confirmed still present in HEAD. | **STILL OPEN** |
| S6 | MED `ACTIVE_STATUSES` hardcoded in `backfill-realtor-permit-trades.js`, not imported from `src/lib/quality/metrics.ts:473` (WF3 #realtor-backfill) | Lines 70–86 of backfill script: literal array, no import from canonical source | **STILL OPEN** |
| S7 | HIGH Dead `tier === 3` ReDoS branch in `classifier.ts` (WF3 2026-05-09) | `classifier.ts:39`: `if (tier === 3) { ... regex exec on user pattern ... }` — dead branch still present | **STILL OPEN** |
| S8 | HIGH Inherited bug 84-W11: `classify-lifecycle-phase.js` writes `P3/P4/P5` for permit intake instead of spec'd `INTAKE_P3/P4/P5` (WF1 #B) | `git log --all -S 'INTAKE_P3' --oneline -5` → 0 hits on relevant files; classify-lifecycle-phase.js has no `INTAKE_` prefix in HEAD | **STILL OPEN** |

---

## Top 5 This Week

Ranked by: (a) severity, (b) unblocking potential, (c) hot-file overlap with recent commits.

### 1. Bug 84-W11 — lifecycle phase labels wrong for permit intake path
**Severity:** HIGH · **Source:** WF1 #B deferred (2026-05-09)  
**File:** `scripts/classify-lifecycle-phase.js` (data written to `lifecycle_status_history`)  
**Rationale:** Explicitly flagged _"must be done before any user-visible release of the inspector lifecycle panel."_ Building permits show "CoA Approved" as a completed lifecycle phase (a CoA-pipeline phase leaking into the permit inspector panel). The data layer fix must precede every UI fix that reads phase labels — it unblocks the entire lifecycle panel UX and any downstream Maestro flows that assert on phase names. Zero other items must be done first.

### 2. Falsy-`0` trilogy in `cost-model-shared.js`
**Severity:** HIGH × 3 (correlated) · **Source:** Gemini WF2 #3 review (2026-05-08)  
**Files:** `src/features/leads/lib/cost-model-shared.js` lines ~193, ~227, ~293  
**Items:**
- `storeys || 1` → `storeys ?? 1` (line 193 — foundation-only permits inflated to 1-storey GFA)
- `pct > 0` gate → `pct !== undefined` (line 227 — `gfa_allocation_percentage = 0` rows fall through to GFA fallback)
- `complexity_factor || 1.0` → `complexity_factor ?? 1.0` (line 293 — operator-set `0` silently overridden)

**Rationale:** Three one-line `??` swaps sharing the same root cause. Each inflates cost estimates for valid edge-case permits (0-storey foundations, 0-allocation matrix entries, 0-complexity work), affecting revenue/lead-scoring accuracy. Groupable in a single WF3 commit; 0 risk of unintended side effects given the narrow surgical change.

### 3. `builder_candidates` LEFT JOIN degraded to INNER JOIN (`get-lead-feed.ts:478`)
**Severity:** HIGH · **Source:** DeepSeek WF3 2026-05-08  
**File:** `src/features/leads/lib/get-lead-feed.ts:478`  
**Rationale:** `WHERE w.business_size IS NOT NULL` on a LEFT JOIN silently drops 30–50% of builder leads (new contractors, GTA-condition failures) from the mobile feed. Direct product regression measurable against the feed API. Recent commit `1e6e5d9` touched this file (CoA UNION arm killswitch) but did not remove the WHERE predicate. Bundle with #4 below (same file).

### 4. `scopeMatrix` key built without `.trim()` (`compute-cost-estimates.js`)
**Severity:** HIGH · **Source:** Gemini WF3 2026-05-08  
**File:** `scripts/compute-cost-estimates.js` lines 241–246  
**Rationale:** Spec 83 §3 explicitly requires `.toLowerCase().trim()` on scope matrix keys; the current build does only `.toLowerCase()`. Any DB row with trailing whitespace in `permit_type` or `structure_type` silently misses the matrix, falls through to full-GFA fallback, and inflates cost estimates for that permit class. One-line fix (add `.trim()` to both fields in the `scopeMatrixRes.rows.map(...)` key builder). Would also unblock a future `gfa_allocation_percentage = 0` contract test.

### 5. Dead ReDoS branch in `classifier.ts:39`
**Severity:** HIGH (security) · **Source:** DeepSeek WF3 2026-05-09  
**File:** `src/lib/classification/classifier.ts:39`  
**Rationale:** The `if (tier === 3)` branch in `fieldMatches` executes user-supplied DB `match_pattern` strings as a live regex. Tier 3 rules never reach `fieldMatches` in any current caller (Gemini confirmed this separately), making it dead code — but dead code with a security surface: if an admin DB account is ever compromised, an attacker can insert a ReDoS pattern into `classifier_rules` and hang `classify-permits.js`. Removal is a 3-line surgical delete with no correctness impact.

---

## Proposed Sweep WFs

### Sweep A — Cost-Model Precision `WF3` (4 items, 2 files)
- `cost-model-shared.js`: fix falsy-`0` at lines 193, 227, 293 (`||` → `??` or gate change)
- `compute-cost-estimates.js`: add `.trim()` to scopeMatrix key builder (lines 241–246)

**Scope:** `src/features/leads/lib/cost-model-shared.js`, `scripts/compute-cost-estimates.js`  
**Estimated items closed:** 4 (3 HIGH + 1 HIGH)  
**Risk:** LOW — each change is a 1-line swap; regression-lock via existing `npx vitest related` on cost-model tests.

### Sweep B — Dead Code Removal `WF3` (4 items, 2 files)
- `classifier.ts:39`: remove dead `tier === 3` ReDoS branch
- `load-massing.js`: remove `shoelaceArea` (line 36), `SQM_TO_SQFT` (line 26), `isProjected` (line 338)

**Scope:** `src/lib/classification/classifier.ts`, `scripts/load-massing.js`  
**Estimated items closed:** 4 (1 HIGH + 3 LOW)  
**Risk:** LOW — pure dead-code removal; `npm run dead-code` + `npm run typecheck` sufficient gate.

### Sweep C — Mobile Feed Correctness `WF3` (3 items, 1 file)
- `get-lead-feed.ts:478`: remove `AND w.business_size IS NOT NULL` from builder_candidates CTE
- `get-lead-feed.ts:985-986`: add `?? DEFAULT_FEED_LIMIT` / `?? DEFAULT_RADIUS_KM` NaN guards (after confirming Zod route-handler coverage)

**Scope:** `src/features/leads/lib/get-lead-feed.ts`  
**Estimated items closed:** 3 (2 HIGH + 1 HIGH-pending-verify)  
**Risk:** MEDIUM — LEFT JOIN change alters builder lead count; requires live-DB regression test before merge.

---

## Queue Health

| Metric | Value |
|---|---|
| **Estimated total open items** | ~170 |
| **CRIT** | ~5 (most are pre-existing/out-of-scope pipeline architecture concerns) |
| **HIGH** | ~30 |
| **MED** | ~50 |
| **LOW** | ~60 |
| **NIT** | ~25 |
| **Prior triage file** | None — no delta available |
| **Oldest open items** | 2026-05-08 (WF3 compute-cost-estimates / get-lead-feed / classifier) |
| **Most recent additions** | 2026-05-17 (Phase F.4 CoA Classification Panel deferrals) |

**Observations:**
- No items from the 14-day active commit window (`git log --since='14 days ago'`) appear in the queue — all recent pipeline work (CoA parity, Pass-2.5 surface fixes) generated its own inline fixes without adding new deferrals. Queue has not grown in ~2 months.
- ~40% of CRIT-tagged items are either (a) rejected as incorrect, (b) pre-existing out-of-scope architecture concerns, or (c) already fixed in earlier commits. True actionable CRITs in the pipeline layer are 0 this cycle.
- The `scripts/backup-db.js` Operational Safety note (last item in Resolved section) has not been addressed — still flagged as "never run in production." Not counted in the above totals (it's in the Resolved section) but worth a separate operational runbook WF before the next >100K-row migration.
- Hygiene rule §3 (Severity Decay): the HIGH items dated 2026-05-08 have now been dormant ~73 days without escalation commits. Under the 2-week decay rule they qualify for MEDIUM demotion — but given their concrete business impact (cost estimates, builder feed) they are recommended for explicit escalation this week rather than demotion.
