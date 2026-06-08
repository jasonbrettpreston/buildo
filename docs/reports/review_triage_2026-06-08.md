# Review Queue Triage — 2026-06-08

_Generated from `docs/reports/review_followups.md` (~276 KB, ~800 lines). No prior triage report exists — this is the first run._
_Last code commit: `1e6e5d9` 2026-05-20. All deferred items are 19+ days dormant — past the §3 Severity Decay threshold._

---

## 1. Stale Items (resolved in code, not yet pruned)

### Confirmed resolved — grep evidence

| Item | Source | Evidence |
|---|---|---|
| **backfill-realtor `emitSummary` uses `records_meta.backfill` shape** (Obs #5, WF3 #realtor-backfill 2026-05-11) | Spec 79 Step 14 validation fold, commit `14c8269` 2026-05-19 | `scripts/backfill-realtor-permit-trades.js:253-272` now emits `records_meta.audit_table`. Comment at line 253 explicitly documents the fix: "Spec 79 validation Step 14 fold — records_meta key MUST be `audit_table`." Admin UI tile was rendering UNKNOWN verdict; now resolved. |

### Unverifiable staleness

The following items used "apply when next-touched" conditions. The referenced files were touched in commit `58a0b8f` (WF1 R5.6, 2026-05-XX), but grep confirms the cleanup was NOT applied during that touch:

- `scripts/load-massing.js`: `shoelaceArea`, `SQM_TO_SQFT`, `isProjected` — all still present. File was touched but dead code was not removed.
- `scripts/migrate-to-lead-id.js`: asymmetric post-backfill null-count check, `LPAD ::text` explicit cast — unverifiable from current HEAD without deeper audit.

These are NOT stale — they are still open.

---

## 2. Top 5 Actionable Items This Week

Ranked by: (a) severity, (b) unblocking value, (c) recent file activity.

---

### #1 — HIGH: `wsib` `LEFT JOIN` acting as `INNER JOIN` in `get-lead-feed.ts`

**File:** `src/features/leads/lib/get-lead-feed.ts:478`
**Source:** DeepSeek, WF3 2026-05-08 (pre-existing)

```sql
AND w.business_size IS NOT NULL   -- line 478: silently converts LEFT JOIN to INNER JOIN
```

The `wsib_per_entity` CTE's `WHERE business_size IN ('Small Business', 'Medium Business')` at line 109 already filters the CTE. The additional `AND w.business_size IS NOT NULL` at line 478 in the `builder_candidates` final WHERE clause acts as an implicit INNER JOIN condition — any builder without a WSIB record (new contractors, GTA-condition failures) is silently dropped. Estimated impact: 30–50% of builder leads excluded from mobile feed.

**Fix:** Remove `AND w.business_size IS NOT NULL` at line 478. The CTE filter + LEFT JOIN already handle NULL correctly.

**Why now:** `get-lead-feed.ts` was the most recently active file in the queue (commit `1e6e5d9`, 2026-05-20). Bundling this with the competition_count scoping fix (same file, MEDIUM) in a single WF3 sweep is high leverage.

---

### #2 — HIGH: `cost-model-shared.js` falsy-zero triple

**File:** `src/features/leads/lib/cost-model-shared.js:193,234,293`
**Source:** Gemini, WF2 #3 2026-05-08 (pre-existing)

Three separate `||` / `> 0` bugs, same root cause, one WF3 closes all:

| Line | Current code | Bug | Fix |
|---|---|---|---|
| 193 | `(row.storeys \|\| 1)` | `storeys = 0` (foundation-only permit) inflates GFA to 1 storey | `?? 1` |
| 234 | `pct !== undefined && pct > 0` | `pct = 0` (no-construction matrix entry) falls through to full-GFA default | remove `&& pct > 0` |
| 293 | `rateRow.structure_complexity_factor \|\| 1.0` | operator-set `0` complexity overridden to 1.0 | `?? 1.0` |

**Why now:** All three inflate `cost_estimates` rows (~237K rows rewritten by `compute-cost-estimates.js`). Single-commit fix for all three. The `compute-cost-estimates.js` cleanup items (scopeMatrix `.trim()`, `data_quality_snapshots` ON CONFLICT — see Sweep WF 2) should land in the same WF3.

---

### #3 — HIGH: `compute-cost-estimates.js` `scopeMatrix` key missing `.trim()`

**File:** `scripts/compute-cost-estimates.js:242`
**Source:** Gemini, WF3 #4 2026-05-08

```js
`${r.permit_type.toLowerCase()}::${r.structure_type.toLowerCase()}`   // no .trim()
```

The consumer in `cost-model-shared.js:231-232` DOES trim:
```js
const pt = (row.permit_type || '').toLowerCase().trim();
const st = (row.structure_type || '').toLowerCase().trim();
```

If any `scope_intensity_matrix` DB row has trailing whitespace in `permit_type` or `structure_type`, the key built at build-time (`'commercial '`) won't match the key used at lookup-time (`'commercial'`). Result: silent matrix-miss → full-GFA default → cost estimate inflation. Spec 83 §3 explicitly requires `.toLowerCase().trim()`.

**Fix:** `${r.permit_type.toLowerCase().trim()}::${r.structure_type.toLowerCase().trim()}`

**Why now:** Bundles into the same WF3 as #2 (cost model sweep). Low blast radius; single token addition.

---

### #4 — HIGH: B6 thundering-herd mutex missing in `apiClient.ts`

**File:** `mobile/src/lib/apiClient.ts:69-71`
**Source:** Gemini, WF2 M1+M2+M3 batch 2026-05-06; Architectural Reinforcement section

```ts
// writes. Low risk in practice; tracked in review_followups.md (concurrent 401 mutex).
```

Under burst-401 conditions (deploy-induced storm, network restoration), N parallel `getIdToken(true)` calls can fire. Spec 99 B6 calls bridges "safe by construction" but admits this limitation in the footnote — a self-contradiction in the architecture docs. Fix is ~15 lines: first 401 starts the refresh and stores the promise; subsequent 401s await the same promise. Removes the "known limitation" footnote entirely.

**Why now:** Standalone (no file dependencies). The Architectural Reinforcement section ranks this the highest-leverage safety gap in the mobile architecture. No recent commits have touched this file.

---

### #5 — HIGH: bug 84-W11 `classify-lifecycle-phase.js` permit-intake phase prefix

**File:** `scripts/classify-lifecycle-phase.js:1458`
**Source:** Worktree code-reviewer, WF1 #B 2026-05-09; INHERITED-BUG status

```sql
WHEN lifecycle_phase IN ('P3','P4','P5','P6')   -- should be INTAKE_P3/P4/P5 for permits
```

The script writes unprefixed `P3/P4/P5` for permit intake phases instead of the spec'd `INTAKE_P3/P4/P5`. CoA phases use different IDs that happen to collide with these bare codes. In the admin Lead Inspector, a building permit at `P3` shows "CoA Approved" as a completed phase — CoA approval is structurally impossible for a building permit. The WF1 #B close-out note is explicit: **"WF3 candidate against bug 84-W11 — must be done before any user-visible release of the inspector lifecycle panel."** This gates a release.

**Why now:** The admin lifecycle panel (`LifecycleTimelinePanel.tsx`) is fully wired and in use. Every admin user viewing permit phase progression sees incorrect phase labels. No unresolved dependencies block this fix.

---

## 3. Proposed Sweep WFs

### Sweep A — `get-lead-feed.ts` correctness sweep (WF3)

**Scope:** `src/features/leads/lib/get-lead-feed.ts`
**Item count:** 4

| Severity | Item |
|---|---|
| HIGH | wsib LEFT JOIN → INNER JOIN (line 478) — remove `AND w.business_size IS NOT NULL` |
| HIGH | `clampedKm` / `clampedLimit` NaN when `input.radius_km` / `input.limit` undefined (lines 985–986) — add `?? MAX_RADIUS_KM` / `?? DEFAULT_FEED_LIMIT` (verify route-handler validation first) |
| MED | `competition_count` not trade-scoped — add `AND lv2.trade_slug = $1` to the subquery |
| MED | Cursor pagination: malformed cursor with NULL `lead_id` → empty page → client thinks feed exhausted — COALESCE the CASE |

File was modified 2026-05-20; all four items are pre-existing in the same query block. Single WF3 covers all.

---

### Sweep B — cost model correctness sweep (WF3)

**Scope:** `src/features/leads/lib/cost-model-shared.js`, `scripts/compute-cost-estimates.js`
**Item count:** 6

| Severity | Item | File |
|---|---|---|
| HIGH | `storeys \|\| 1` → `storeys ?? 1` (line 193) | cost-model-shared.js |
| HIGH | `pct !== undefined && pct > 0` → `pct !== undefined` (line 234) | cost-model-shared.js |
| HIGH | scopeMatrix key missing `.trim()` (line 242) | compute-cost-estimates.js |
| MED | `structure_complexity_factor \|\| 1.0` → `?? 1.0` (line 293) | cost-model-shared.js |
| MED | `data_quality_snapshots` UPDATE assumes row exists → switch to `INSERT ... ON CONFLICT DO UPDATE` | compute-cost-estimates.js |
| LOW | `BULK_COLUMN_COUNT = 15` hardcoded → derive from column-list array | compute-cost-estimates.js |

All affect cost estimate accuracy. Running `compute-cost-estimates.js` after the fix rewrites only the rows whose estimates change (IS DISTINCT FROM UPSERT guard limits WAL writes).

---

### Sweep C — load-massing.js dead code sweep (WF2)

**Scope:** `scripts/load-massing.js`
**Item count:** 3

| Severity | Item |
|---|---|
| LOW | `shoelaceArea` function (line 36) — dead since WF2 #C; remove |
| LOW | `SQM_TO_SQFT = 10.7639` constant (line 26) — dead since WF2 #C; remove |
| LOW | `isProjected` variable declared but unused (lines 338–339) — either wire to a log or remove |

Lowest-risk of the three sweeps. Single WF2 with no external dependencies. Good candidate if bandwidth is limited this week.

---

## 4. Queue Health

| Metric | Count |
|---|---|
| **Total active items (estimated)** | ~125 |
| CRIT | ~5 |
| HIGH | ~30 |
| MEDIUM | ~50 |
| LOW / NIT | ~40 |
| **Prior triage report** | None (first run) |
| **Items past 2-week severity decay** | All — last commit was 2026-05-20 (19 days ago) |
| **Confirmed stale / silently resolved** | 1 (backfill-realtor Obs #5) |
| **Commits in last 14 days addressing deferred items** | 0 |

**Severity decay note:** Per the file's own §3 Hygiene rule, HIGH items dormant >2 weeks should be demoted to MEDIUM or actively prioritized. Most items in the queue are now eligible for demotion. Recommend treating the Top 5 above as the *re-escalation* candidates; all others should be audited for demotion at the next WF6 close-out pass.

**Queue density note:** The file is 276 KB (~800 lines), well above a healthy size. The §1 auto-prune rule (trim resolved entries at WF6 close-out) has not been applied recently. After the next WF3 sweep closes items, the resolved entries should be collapsed to 1-line historical summaries per §1.

**Recommended next sweep (if Top 5 done this week):** Sweep A (get-lead-feed.ts correctness), as it touches the most recently active file, covers 4 distinct items in one commit, and the wsib fix has direct user-visible impact on the mobile lead feed.
