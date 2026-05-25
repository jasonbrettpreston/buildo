# Review Queue Triage — 2026-05-25

_Source file: `docs/reports/review_followups.md` (1655 lines, ~300 active DEFER items)._
_No prior triage file found — first run; no delta available._

---

## 1. Stale Items (deferred items now resolved in HEAD)

These items name specific files/functions verified against current HEAD. All are already marked FIXED INLINE or FOLDED in the source file and are listed here only to confirm the file accurately reflects code state.

| # | File | Item | Evidence |
|---|---|---|---|
| WF3 #2 item 102 | `scripts/compute-trade-forecasts.js` | `coaFirstDeployGrace` used before declaration (ReferenceError) | Marked "FIXED INLINE" in WF3 #2 section; confirmed hoisted in commit `cddbfa3` (`grep -n 'coaFirstDeployGrace' compute-trade-forecasts.js` shows declaration precedes first use) |
| WF3 #3 items 108-112 | `src/features/leads/lib/get-lead-feed.ts` | 5 folds: terminal CoA P-code filter, test gap, `trade_slug` join, `\r?\n` regex, CoA-write gap test | Marked "FIXED INLINE" in WF3 #3 section; confirmed present in commit `1e6e5d9` |
| WF3 Pass-2 bundled item 66 | `scripts/load-parcels.js` | `emitFinal` parallel-boolean verdict pattern | Marked "FIXED INLINE" in WF3 Spec 79 CRIT-3b section; confirmed fixed in commit `2ee6c81` |
| Phase I.1.1a fold 3 | `src/tests/lifecycle-status-history-writers.db.test.ts` | UNIQUE INDEX timezone test | Marked "FIXED" in I.1.1a section; present in codebase |

> **Note:** Phase-E/F close-out sections contain many additional "FOLDED inline" entries; all verified against their respective commits. No previously-DEFER item found newly resolved by the 14-day commit range that is not already reflected in the file.

---

## 2. Top 5 Actionable Items This Week

Ranked by (a) severity, (b) number of items unblocked, (c) recent-commit proximity.

### #1 — GIST spatial index on `coa_applications` (CRITICAL gate condition)
**Severity:** HIGH → CRITICAL in practice  
**Location:** `src/features/leads/lib/get-lead-feed.ts` item #119 (WF3 #3 live-verify section)  
**Finding:** `EXPLAIN ANALYZE` on `lead_type=all` shows a **Parallel Seq Scan on `coa_applications`** (4.4 s execution, 380 K rows). No GIST index on `(latitude, longitude)` exists (`grep migrations/` confirms no such migration).  
**Why #1:** The file explicitly states "**MUST FIX before flipping the killswitch off in prod.**" WF3 #3 shipped the CoA UNION arm (commit `1e6e5d9`) with `LEAD_FEED_DISABLE_COA=1` as the default. The next product step is enabling the CoA feed — this index is the gate. Without it, enabling would impose a 4 s query penalty on every mobile feed request.  
**Unblocks:** Enabling CoA in the live lead feed, which unblocks the end-to-end CoA lead journey (Spec 91 §3.5 algorithmic invariant).  
**Fix:** New migration `CREATE INDEX CONCURRENTLY ... USING GIST (ST_MakePoint(longitude, latitude)) WHERE latitude IS NOT NULL AND longitude IS NOT NULL` on `coa_applications`. Estimated scope: 1 migration + 1 infra test.

---

### #2 — `cost-model-shared.js` falsy-`0` triple (3 bundled HIGH/MED bugs)
**Severity:** HIGH × 2 + MED × 1  
**Location:** `src/features/leads/lib/cost-model-shared.js` (Gemini WF2 #3 review section)  
**Findings (all confirmed open by grep):**
- Line 193: `row.storeys || 1` silently defaults 0-storey permits to 1 — inflates GFA and cost.
- Line 234: `pct > 0` guard causes `gfa_allocation_percentage = 0` rows to fall through to 1.0 (full GFA).
- Line 293: `rateRow.structure_complexity_factor || 1.0` silently overrides operator-set `0`.  
**Why #2:** All three share the falsy-`0` root cause; fixing all three in one WF3 is < 15 LoC. The storeys and pct bugs silently inflate cost estimates for a subset of permits, which affects opportunity scoring and realtor lead ranking.  
**Fix:** `||` → `??` at lines 193 and 293; `pct !== undefined && pct > 0` → `pct !== undefined` at line 234. Plus a JSDoc note on the rounding remainder (LOW item).

---

### #3 — `classify-coa-scope.js` unconditional `scope_classified_at` bump (item #56)
**Severity:** HIGH (pipeline performance)  
**Location:** `scripts/classify-coa-scope.js` line 136 (WF1 R5.4 diff-review deferrals section)  
**Finding:** When the IS DISTINCT FROM guard skips the UPDATE because `scope_tags` is unchanged, `scope_classified_at` never advances. The cursor `scope_classified_at < last_seen_at` therefore re-fetches every CoA on every run, causing daily full-re-classify cycles and inflated `records_updated`. Confirmed open: lines 126-127 of the script contain the bug description as a comment but no fix has been applied.  
**Why #3:** The CoA pipeline (R5.3 + R5.4) shipped ~3 weeks ago. Every chain run since has been doing unnecessary work re-classifying unchanged CoAs. This is a one-line WF3 fix to `classify-coa-scope.js` with a high payoff on chain run time.  
**Fix:** In the UPSERT SET clause, change `scope_classified_at = $${runAtParam}` to `scope_classified_at = CASE WHEN scope_tags IS DISTINCT FROM EXCLUDED.scope_tags THEN $${runAtParam} ELSE coa_applications.scope_classified_at END` (Worktree #2 suggested pattern from the file).

---

### #4 — `lifecycle_status_history` write gap in `classify-lifecycle-phase.js` (item #110)
**Severity:** CRITICAL spec deviation (Spec 42 §6.7 mandate)  
**Location:** `scripts/classify-lifecycle-phase.js` (Phase E.2 close-out section, item #110)  
**Finding:** `classify-lifecycle-phase.js` does NOT write to `lifecycle_status_history` despite Spec 42 §6.7 explicitly mandating a "status-level ledger." The table was created in mig 127 (Phase B). Phase F shipped (F.1–F.4 complete) but the writer was never added.  
**Why #4:** This is a CRITICAL spec deviation that grows worse the longer it runs — the `lifecycle_status_history` table is accumulating zero rows for permit-side status changes. Downstream consumers (Spec 48 observer, Phase I tooling) that query this table will get empty results. Phase I.1.1a specifically extends the table for load-permits.js, making the absence of classify-lifecycle-phase.js's write path increasingly anomalous.  
**Fix:** Add a SAVEPOINT-scoped INSERT batch to `classify-lifecycle-phase.js` per the Phase I.1.1a pattern (mirrors the CoA-side writer added in Phase I).

---

### #5 — Spec 93 WF3-C: `@sentry/react-native` v7 → v8 upgrade
**Severity:** HIGH (runtime incompatibility risk on New Architecture)  
**Location:** `.cursor/deferred_task_spec93_sentry_v8_upgrade.md` (WF2 Spec 93 section, filed 2026-05-15)  
**Finding:** `@sentry/react-native` is pinned at v7 while the app targets RN 0.81 + New Architecture (Spec 93). Sentry v7 does not support the New Architecture's JSI/Bridgeless mode; crash reporting is degraded or non-functional on the new renderer path.  
**Why #5:** The planning note was filed 10 days ago. Sentry crash reporting is a production observability requirement, and the New Architecture path is the production target per Spec 93. WF3-A and WF3-B (backup-email persistence bridge; auth-state reset leak on forced sign-out) are also filed but WF3-C is the highest-impact mobile item.  
**Fix:** Upgrade `@sentry/react-native` to v8 per the deferred task plan in `.cursor/deferred_task_spec93_sentry_v8_upgrade.md`.

---

## 3. Proposed Sweep WFs (grouped fixes)

### Sweep A — CoA Feed Enablement Gate (WF3)
**Name:** `fix/coa-feed-gist-index`  
**Scope:** `migrations/` (new migration 160+), `src/tests/` (1 infra test)  
**Items:** #119 (GIST spatial index on `coa_applications`, HIGH — MUST FIX gate), #113 (column-list drift maintenance note in `LEAD_FEED_SQL_WITH_COA`, MEDIUM — add a validation comment or test)  
**Estimated items:** 2  
**Rationale:** These two items must land together before the CoA killswitch can be flipped. Item #113 is defensive hardening that should accompany any column-list touch.

---

### Sweep B — `cost-model-shared.js` Falsy-0 Sweep (WF3)
**Name:** `fix/cost-model-falsy-zero`  
**Scope:** `src/features/leads/lib/cost-model-shared.js`  
**Items:** 3 HIGH/MED falsy-0 bugs (lines 193, 234, 293) + LOW rounding-remainder JSDoc + DEFER `_permitTypeClassSkipped` shape asymmetry  
**Estimated items:** 5  
**Rationale:** All share the same one-character fix (`||` → `??`) and can be addressed in a single surgical WF3 with a regression-test extension in the existing `cost-model-shared.logic.test.ts`. No schema impact.

---

### Sweep C — CoA Pipeline Correctness (WF3)
**Name:** `fix/coa-pipeline-classified-at-and-history`  
**Scope:** `scripts/classify-coa-scope.js`, `scripts/classify-lifecycle-phase.js`  
**Items:** Item #56 (`scope_classified_at` unconditional bump, HIGH), item #110 (`lifecycle_status_history` write gap, CRIT spec deviation)  
**Estimated items:** 2  
**Rationale:** Both items affect the CoA pipeline chain that shipped in Phase D–F. Item #56 is a performance correctness issue; item #110 is a spec compliance gap. Bundling limits the blast radius while hitting the highest-leverage pipeline files.

---

## 4. Queue Health

| Metric | Count |
|--------|-------|
| **Total active DEFER items (estimated)** | ~300 |
| HIGH / CRIT severity | ~30 |
| MEDIUM severity | ~80 |
| LOW / NIT | ~190 |
| Sections with items > 21 days old (pre-2026-05-04) | ~8 sections |
| Items in recently-modified files (last 14 days) | ~25 |
| Prior triage file | None (first run) |
| Delta vs prior | N/A |

**Age distribution note:** The oldest deferred items originate from 2026-05-05 and earlier (the Spec 99 mobile architecture batch, Spec 30 Cycle 2, WF2 M1+M2+M3). Per the file's own hygiene rule §2, items tagged `Future hardening` dormant > 2 weeks should be collapsed to 1-line notes in the historical index. Approximately 50 LOW/NIT items in the "Active Open Items" and "Architectural Reinforcement" sections are candidates for archival — a quick pass would reduce the apparent queue by ~17%.

**Recommendation if fewer than 5 items are actionable this week:** Sweep B (cost-model falsy-0) is a 30-minute WF3 with zero schema impact and can serve as a low-risk warm-up sprint even if the higher-priority items require planning.

---

_Triage generated 2026-05-25. Source: `docs/reports/review_followups.md` @ HEAD `1e6e5d9`. Next triage: 2026-06-01._
