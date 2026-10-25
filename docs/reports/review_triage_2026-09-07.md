# Review Queue Triage — 2026-09-07

_Automated triage of `docs/reports/review_followups.md` (2,998 lines, no prior triage file for delta comparison)._

---

## 1. Stale Items (verified against HEAD)

| Item | Original Filing | Evidence of Resolution |
|------|----------------|----------------------|
| `scopeMatrix` key built without `.trim()` — HIGH, `compute-cost-estimates.js` (WF2 #3 review 2026-05-08) | Line 632 | **RESOLVED.** `compute-cost-estimates.js:342-348` already applies `.trim()` to both `permit_type` and `structure_type`: `(r.permit_type \|\| '').trim()`. Code predates this triage by multiple commits. Safe to prune from queue on next WF6 close-out. |

**Confirmed still open (sampled):**
- `createPool()` localhost default: `scripts/lib/pipeline.js:133-137` still has `PG_HOST \|\| 'localhost'` / `PG_DATABASE \|\| 'buildo'`. No commits in git log address it.
- `parcels_null_address_pct` + `massing_zero_link_ghost` checks: both still in `scripts/lib/parcels-csv-drift.js:65-73` and `scripts/enrich-parcels.js:1900`. No commits touch them post-filing.
- `builder_candidates` wsib WHERE-as-INNER-JOIN: `AND w.business_size IS NOT NULL` still at `get-lead-feed.ts:486`.
- `computeGfa` falsy-`0` (`storeys || 1`): still `row.storeys || 1` in `cost-model-shared.js:208`.

---

## 2. Top 5 Actionable Items This Week

Ranked by: (a) severity, (b) unblocking leverage, (c) hot-file cross-reference with recent commits.

---

### #1 — MED | `parcels_null_address_pct` gate is permanently unsatisfiable
**File:** `scripts/lib/parcels-csv-drift.js:27-73`
**Filed:** 2026-08-25 (WARN classification sweep) | **Disposition:** ACT
**Rationale:** Every cloud run produces a WARN from a check that can mathematically never pass — `ADDRESS_NUMBER` was deliberately removed from the CSV schema, so `nullAddressCount` is always 100%. The check is measuring a structural fact the pipeline itself created. This is a cheap WF3: either retire the metric or rebase it onto `address_points`/`parcel_address_points` coverage (the documented replacement). Produces WARN noise on every `chain_sources` run and desensitises operators to real WARNs.

**Action:** WF3 — retire the `parcels_null_address_pct` check or rebase its denominator onto bridge coverage.

---

### #2 — MED | `massing_zero_link_ghost` comment claims a "measured day-one value 0" that has never been observed
**File:** `scripts/enrich-parcels.js:1896-1901`
**Filed:** 2026-08-25 (WARN classification sweep) | **Disposition:** ACT
**Rationale:** Both cloud observations (runs 3456 + 3485, 2026-08-24) show 1,395 ghost links, not 0. The comment's "forward-looking" WARN assertion is either wrong about the DB it measured, or a regression predates the metric and was never caught. Must decide: is 1,395 real orphaned massing links (fix the data) or a false claim in the comment (fix the comment)? Until resolved, the WARN signal has no baseline and cannot trigger appropriate operator response.

**Action:** WF3 — investigate whether 1,395 is genuine ghost-link data or a comment error; fix the data or the comment accordingly.

---

### #3 — HIGH | `*_dataset_version_when_enriched` stamps have NO trigger invalidator
**File:** `scripts/load-parcels.js:353-361` + new migration needed
**Filed:** 2026-08-23 (P1 agent, mig 245 review) | **Disposition:** ACT
**Rationale:** The three `*_dataset_version_when_enriched` columns are only invalidated via one write path (the `load-parcels.js` UPSERT). Any other path that mutates the underlying source data silently leaves the stamps asserting a stale enrichment. Fix shape is already proven: candidate arms on `trg_parcels_invalidate_on_geom_change()` (the same trigger that just got the centroid gap fix in mig 245). Current population 0/486,530 stale — a latent defect, not an active fire, so measure first then migrate.

**Unblocks:** mig 245's "identical class" finding is documented; completing this closes a proven hole and locks it with red-first per arm.

**Action:** WF3 — measure each stamp's staleness population, then one migration adding three trigger arms + a red-first test per arm.

---

### #4 — HIGH | `builder_candidates` LEFT JOIN acts as INNER JOIN — silently drops 30-50% of builder leads
**File:** `src/features/leads/lib/get-lead-feed.ts:486`
**Filed:** 2026-05-08 (DeepSeek review) | **Disposition:** WF3 candidate (open since May)
**Rationale:** `LEFT JOIN wsib_per_entity w … AND w.business_size IS NOT NULL` converts the outer join into an inner join, silently excluding all new contractors and GTA-condition failures from builder lead results. Confirmed still present at line 486. This is a 1-line fix (`remove the WHERE predicate; let UI handle NULL`), but it affects the revenue-critical builder lead feed. Has been dormant for 4 months with no progress.

**Cross-reference:** Same file (`get-lead-feed.ts`) has the `clampedLimit`/`clampedKm` NaN items (lines 1003-1004) — verify whether the route schema upstream prevents `undefined` from reaching those expressions; if not, bundle into the same WF3.

**Action:** WF3 — remove the `AND w.business_size IS NOT NULL` WHERE predicate; verify Spec 91 §4.3 builder-display contract; bundle the clampedLimit/Km NaN check after verifying route-layer validation.

---

### #5 — HIGH | Non-blocking FAIL check invisible to `/api/quality` — time-bounded blocker
**File:** `scripts/lib/step/index.js` (`run-chain.js:718-731`) + `/api/quality` route
**Filed:** 2026-08-24 (S2-min output panel) | **Disposition:** DEFER — but the condition that triggers it is approaching
**Rationale:** The item says "must be resolved BEFORE any pilot declares a non-blocking FAIL check, i.e. before `assert_schema`'s C1 conversion promotes `permit_cost_type_sample` to the library." C1 pilot 2 (`load_ravines`) was completed this week (commits `ddb6d48`, `85b6d19`, `17058af`). `assert_schema` is the next pilot candidate. If it converts before this gap is closed, operators will silently miss FAIL-severity checks in `/api/quality`. Two candidate closes are already documented: (a) `/api/quality` also reads `records_meta.audit_table.verdict`; (b) `run-chain.js` derives its status literal from the emitted verdict (the wider ledger-consolidation fix, claim #39).

**Action:** WF3 (small) — implement candidate close (a): `/api/quality` query joins on `records_meta->>'audit_table'->>'verdict'` in addition to `WHERE status = 'failed'`. Unblocks `assert_schema` C1 conversion.

---

## 3. Proposed Sweep WFs

### Sweep A — "Pipeline Sanity-Audit Gate Refresh" WF3
**Target files:** `scripts/lib/parcels-csv-drift.js`, `scripts/enrich-parcels.js`, `scripts/analysis/parcel-sanity-audit.js`
**Items covered:** 4
1. #1 above — retire/rebase `parcels_null_address_pct` (MED, ACT, 2026-08-25)
2. #2 above — investigate/fix `massing_zero_link_ghost` (MED, ACT, 2026-08-25)
3. Add `existing_data_quality_flag` visibility INFO row to `parcel-sanity-audit.js` (MED, ACT-small, 2026-08-23) — "a plausible-looking clean verdict sitting on top of a producer-emitted quality flag the audit never reads"
4. Add `existing_width_m`/`existing_length_m` BOUND + `existing_dim_exceeds_lot_dim` INVARIANT checks (MED, ACT-small, 2026-08-23) — mirrors existing max_build twin checks

All four items are audit/check layer only (no schema changes, no data writes). Can be completed in a single WF3 with Reality-Check at output altitude.

---

### Sweep B — "cost-model-shared.js falsy-0 sweep" WF3
**Target file:** `src/features/leads/lib/cost-model-shared.js`
**Items covered:** 3
1. `computeGfa` `(row.storeys || 1)` → `(row.storeys ?? 1)` — line 208 (HIGH, 2026-05-08) — inflates GFA on 0-storey foundation permits
2. `computeEffectiveArea` `pct > 0` → `pct !== undefined` — line 227 (HIGH, 2026-05-08) — grossly inflates cost when `gfa_allocation_percentage = 0`
3. `computeTradeValue` `complexity_factor || 1.0` → `??` — line 286 (MED, 2026-05-08) — silently overrides operator-set 0

All three are `||` → `??` substitutions in the same file (same root cause). Est. 3 lines of change + fixture additions. These have been dormant since May — severity decay applies (two HIGHs at 4 months warrant prompt scheduling).

---

### Sweep C — "get-lead-feed.ts correctness" WF3
**Target file:** `src/features/leads/lib/get-lead-feed.ts`
**Items covered:** 3 confirmed open + 1 pending verification
1. #4 above — `builder_candidates` wsib WHERE acting as INNER JOIN (HIGH, line 486)
2. `clampedLimit`/`clampedKm` NaN when `input.limit`/`input.radius_km` undefined — verify route-layer schema first; if unguarded, `??` fix (HIGH, lines 1003-1004)
3. `competition_count` not trade-scoped — `AND lv2.trade_slug = $1` missing (MED)
4. Cursor pagination NULL CASE — malformed cursor gives empty feed, client thinks exhausted (MED)

All four touch the same query file. The wsib join bug alone justifies the WF3; the others are natural bundles.

---

## 4. Queue Health

| Metric | Count | Notes |
|--------|-------|-------|
| Total open sections | ~55 | Counted from section headers in 2,998-line file |
| Items explicitly marked ACT (this week) | 6 | All filed 2026-08-23/24/25; highest urgency |
| HIGH severity open items | ~35 | Estimated from grep (74 HIGH-line hits, minus ~50% rejected/accepted/resolved inline) |
| MED severity open items | ~30 | Similar adjustment |
| LOW severity open items | ~60 | Many are style/polish/pre-existing |
| CRITICAL items (open action required) | ~8 | Most CRITs were rejected as false positives or folded at review time |
| Prior triage file | None | No `review_triage_*.md` in repo — no delta available |
| Oldest open HIGH (unresolved) | 2026-05-08 | cost-model-shared.js falsy-0 + get-lead-feed.ts NaN/wsib bugs |
| Most recent additions | 2026-08-25 | WARN classification sweep (2 items, both ACT) |
| Recent-commit cross-reference | 14 days: all commits in `122_step_optimization` (step library + load_ravines C1 pilot 2) | No recent commits address any open queue item |

**Severity decay note (per queue hygiene rules):** Items marked HIGH filed before 2026-07-07 (>2 months) without a referencing commit are candidates for demotion to MED or archival at next WF6 close-out. The cost-model-shared.js falsy-0 triple and the get-lead-feed.ts NaN/wsib bugs are the most visible examples (filed 2026-05-08, 4 months dormant).

**Queue hygiene:** `review_followups.md` has grown to 2,998 lines with no prior triage to trim against. The Resolved (Historical Index) section at line 901 is up-to-date through 2026-05-06; all 2026-05 through 2026-08 items remain as full prose entries. The next WF6 close-out should collapse resolved sections per hygiene rule §1.

---

_Report generated by scheduled triage agent. Source: `docs/reports/review_followups.md` @ HEAD (`17058af`). Stale check via `git log -S` + grep against current files. No mutations to `review_followups.md`._
