# Active Task: WF3 — repair 4 production code paths joining `neighbourhoods` against the wrong column
**Status:** Implementation
**Workflow:** WF3 (Fix — same root cause across 4 sites; bundling per project feedback memory "WF3 cadence — per-finding... bundle only on override". Override granted: same one-line fix in 4 files; atomic revert is simpler than 4 separate commits.)
**Domain Mode:** Cross-Domain (Backend/Pipeline + Web Admin) — pipeline cost script + mobile-shared lead-feed query + admin market-metrics queries
**Rollback Anchor:** `76dd665` (current HEAD on `main` — live-DB harness ship + WF3 73f3ae6 inspector revert)
**Multi-Agent Review:** REQUIRED (HIGH severity per blast radius; user explicitly requested in `review_followups.md` triage).

## Context

* **Bug:** `permits.neighbourhood_id` is a FK to `neighbourhoods.id` (the SERIAL primary key) per migration 109 step 4 (`fk_permits_neighbourhoods` — `ADD CONSTRAINT … FOREIGN KEY (neighbourhood_id) REFERENCES neighbourhoods(id)`; step 4b nullified non-matching rows; step 4c VALIDATEd against all 237K permits). Four production code paths join on `n.neighbourhood_id = p.neighbourhood_id` instead — that's joining the city open-data PK against the SERIAL FK. Both columns are `INTEGER` so PG raises no error; the join silently miss-matches every row.
* **Live-verified miss:** for permit `21 173458 BLD` (`neighbourhood_id = 121`):
  - Correct (`n.id = p.neighbourhood_id`): "Englemount-Lawrence", `avg_household_income = $96,300` etc. — what the FK guarantees.
  - Wrong (`n.neighbourhood_id = p.neighbourhood_id`): "Oakridge", different income — silently returned by the 4 broken sites.
* **Affected sites + impact:**

  | # | File:line | Column read off the wrong row | Blast radius |
  |---|---|---|---|
  | 1 | `src/features/leads/lib/get-lead-feed.ts:224` | `n.avg_household_income` | EVERY permit lead in the mobile feed gets the wrong neighbourhood income → wrong premium displayed in the lead card |
  | 2 | `scripts/compute-cost-estimates.js:94` | `n.avg_household_income`, `n.tenure_renter_pct` | The Brain's `computePremiumFactor()` reads the wrong income → wrong tier → wrong cost estimate. ~237K cost_estimates rows currently store the wrong `premium_factor` and (consequently) `estimated_cost` |
  | 3 | `src/lib/market-metrics/queries.ts:344` | `n.name`, demographic columns | Admin market-metrics dashboard groups by the wrong neighbourhood label |
  | 4 | `src/lib/market-metrics/queries.ts:358` | Same | Same |

  **Reference truth-rooted shapes (correct already):** `src/lib/leads/lead-detail-query.ts:101` (`n.id = p.neighbourhood_id`) and `src/app/api/permits/[id]/route.ts:173` (`WHERE id = $1`) — both verified at commit `76dd665`.

* **Target Spec:** `docs/specs/01-pipeline/57_source_neighbourhoods.md` §2 — **REQUIRES AMENDMENT**. Spec 57 currently says `neighbourhoods` PK is `(neighbourhood_id)`, but the actual schema (mig 013) makes `id SERIAL` the PK and `neighbourhood_id INTEGER UNIQUE NOT NULL` (the city open-data identifier). Mig 109 step 4 FKs `permits.neighbourhood_id` against `neighbourhoods.id` (the SERIAL), consistent with the project's universal `id SERIAL PK` convention (`parcels`, `permit_parcels`, `parcel_buildings`, etc.). The 4 wrong-join sites (`get-lead-feed.ts`, `compute-cost-estimates.js`, `market-metrics/queries.ts ×2`) appear to have been written from Spec 57's stated PK and never reconciled with the SERIAL. Spec 57 §2 amendment: clarify `id` is the SERIAL PK and `neighbourhood_id` is the natural city key (UNIQUE) used for upsert + load-neighbourhoods.js identity. Permits FK explicitly named.
* **Spec 47 §18.2** confirms `permits.neighbourhood_id` is the canonical FK example for "Municipal / external source data → ON DELETE SET NULL" behaviour, matching mig 109's actual ADD CONSTRAINT.
* No amendment needed in Spec 71 (mobile lead feed), Spec 83 (cost model), or Spec 76 (lead-feed health dashboard) — none prescribe the wrong-join shape; they reference the neighbourhood premium / display abstractly.

* **Behavioral expectation post-merge:** the 4 sites return correct neighbourhoods. The cost-estimates rows in production are still wrong until `compute-cost-estimates.js` runs again — the pipeline's `IS DISTINCT FROM` UPSERT guard will rewrite each row whose `premium_factor` (and therefore `estimated_cost`) changes. Re-run is a separate operator step (not part of this commit's blast radius).

## Technical Implementation

### The fix (4 sites, same one-line change)

```sql
-- BEFORE (WRONG — silent miss)
LEFT JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id

-- AFTER (FK-correct per mig 109)
LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id
```

Each site keeps its existing `LEFT JOIN` / `JOIN` keyword + alias. The only change is the join key. No SELECT list changes. No TS interface changes. No mapper changes.

### Test layering — two layers

**Layer 1 (always-on): SQL-shape regression-lock per site.**
Single new test file `src/tests/neighbourhoods-fk-join.infra.test.ts` (text/regex over the 4 source files). Forbids `n.neighbourhood_id = p.neighbourhood_id` in any of the 4 files; requires `n.id = p.neighbourhood_id`. Cheap, no DB. Catches text regression. Mirrors the existing `lead-inspect-query.infra.test.ts` pattern.

**Layer 2 (live-DB, gated on `DATABASE_URL`): one new live-DB test.**
`src/tests/db/neighbourhoods-fk-join.db.test.ts` — seeds two neighbourhoods that have IDENTICAL SERIAL `id` and city PK `neighbourhood_id` values across them so the wrong-join would resolve to a different name. Then queries each of the 4 SQL surfaces (one assertion per file) and asserts the returned neighbourhood matches the FK-correct one. This is the regression-lock that proves the join is correct end-to-end.

### Data correction — out of scope but documented

Pre-existing `cost_estimates` rows for ~237K permits store the wrong `premium_factor` (and consequently a slightly-wrong `estimated_cost`). After this commit ships, the operator should re-run `node scripts/compute-cost-estimates.js` — the script is idempotent and the bulk UPSERT's `IS DISTINCT FROM` guard rewrites only the rows whose values actually changed (likely the vast majority). Filed as a runbook step in the commit message; not a separate WF.

### Files (Modified / New)

- **MODIFIED** `src/features/leads/lib/get-lead-feed.ts` — line 224 join
- **MODIFIED** `scripts/compute-cost-estimates.js` — line 94 join
- **MODIFIED** `src/lib/market-metrics/queries.ts` — lines 344 + 358 joins
- **NEW** `src/tests/neighbourhoods-fk-join.infra.test.ts` — Layer 1 SQL-shape regression-lock for all 4 sites
- **NEW** `src/tests/db/neighbourhoods-fk-join.db.test.ts` — Layer 2 live-DB regression-lock proving each surface returns the FK-correct row
- **MODIFIED** `docs/reports/review_followups.md` — strike the WF3 HIGH item (now resolved); preserve the MEDIUM ("extend live-DB coverage to other admin read-paths") for future incremental adopters
- **MODIFIED** `docs/specs/01-pipeline/57_source_neighbourhoods.md` §2 — clarify `id SERIAL` PK vs `neighbourhood_id INTEGER UNIQUE` natural city key; cross-reference mig 109 fk_permits_neighbourhoods so future implementers don't repeat the same wrong-join mistake

### Database Impact

NONE for schema. The pipeline re-run (post-merge) will rewrite `cost_estimates.premium_factor` + `estimated_cost` for permits whose neighbourhood premium tier changed. The bulk UPSERT's `IS DISTINCT FROM` guard limits WAL writes to the rows that actually changed. No migration. No DDL.

## Standards Compliance

* **§2 Error handling:** No new throws or catches; no error-pathway changes.
* **§3 Database:** Pipeline-level data correction is incremental — one re-run rewrites only changed rows. No `ALTER TABLE` involved.
* **§4.2 Parameterization:** All 4 sites use parameterized queries; this commit changes only the JOIN predicate string, not parameterization.
* **§5.2 Test file pattern:** new infra test mirrors existing convention; new `*.db.test.ts` mirrors the just-shipped `lead-inspect-query.db.test.ts`.
* **§6 Logging:** No new log sites.
* **§7 Dual Code Path:** N/A — each site is in its own surface (TS read-path or JS pipeline).
* **§9 Pipeline Safety:** `compute-cost-estimates.js` change preserves all existing transaction boundaries, batch sizing, advisory lock, IS DISTINCT FROM guard, and audit_table emission.
* **Spec 47 §R*:** unchanged contract — pipeline script structure intact.
* **Spec 80 §5 / Spec 83:** orthogonal; the fix doesn't touch permit_type_class gating or cost-model formula.
* **No backwards-compat hacks:** literal text replacement; no shim, no flag, no removed-comment dance.

## State Verification (DONE before plan-lock)

* Re-confirmed mig 109 step 4 (`fk_permits_neighbourhoods FOREIGN KEY (neighbourhood_id) REFERENCES neighbourhoods(id)`) at lines 147–171 — the FK is to the SERIAL.
* Re-confirmed via live query against dev DB: permit `21 173458 BLD` joined `n.id = 121` → "Englemount-Lawrence" (correct); joined `n.neighbourhood_id = 121` → "Oakridge" (silently miss-matched).
* `grep` across `src/` and `scripts/` confirmed exactly 4 wrong-join sites + 2 correct sites; no others.
* Live-DB harness already proven by `src/tests/db/lead-inspect-query.db.test.ts` (commit `76dd665`).

## Execution Plan
- [ ] **R1** — Rollback anchor confirmed: `76dd665`. Branch: `main`.
- [ ] **R2** — State verification: re-grep the 4 sites + 2 correct reference sites; copy exact line numbers into the test fixtures.
- [ ] **R3** — Spec Review: skim Spec 71 §3 (mobile lead feed), Spec 83 §3 (cost-model neighbourhood premium tier), Spec 76 §3 (admin market-metrics dashboards) — confirm none of them prescribe the wrong-join shape (they don't; this is purely an implementation drift).
- [ ] **R4** — Reproduction tests FIRST (Red Light), one file at a time:
  - `src/tests/neighbourhoods-fk-join.infra.test.ts` — 8 regex assertions (4 sites × 2 directions: forbid-wrong + require-correct). Run vitest → MUST fail (`n.neighbourhood_id` literals still in source).
  - `src/tests/db/neighbourhoods-fk-join.db.test.ts` — seeds + queries each of the 4 SQL surfaces, asserts FK-correct neighbourhood comes back. Run with `DATABASE_URL=...` → MUST fail (current join returns wrong row).
- [ ] **R5** — Implementation (one site at a time, atomic per-site):
  - `src/features/leads/lib/get-lead-feed.ts` — flip line 224
  - `src/lib/market-metrics/queries.ts` — flip line 344
  - `src/lib/market-metrics/queries.ts` — flip line 358
  - `scripts/compute-cost-estimates.js` — flip line 94 (BIG blast radius — last to keep rollback discipline clean)
- [ ] **R6** — Green Light: targeted tests pass; `npm run typecheck && npm run lint -- --fix && npm run test` (live-DB tests skip without `DATABASE_URL`; full suite stays green).
- [ ] **R7** — Idempotency: re-run live-DB test 2× consecutively — confirm fixture seed + cleanup repeatable.
- [ ] **R8** — Live verification: with `DATABASE_URL=postgres://postgres:postgres@localhost:5432/buildo` set:
  - `npx vitest run src/tests/db/neighbourhoods-fk-join.db.test.ts` → 4/4 pass
  - Sample query against live DB: pick permit `21 173458 BLD` and verify `getLeadFeed` returns "Englemount-Lawrence" (not "Oakridge")
- [ ] **R9** — Pre-Review Self-Checklist (5 items):
  1. All 4 sites flipped to `n.id = p.neighbourhood_id` and zero remaining `n.neighbourhood_id = p.neighbourhood_id` literals across `src/` + `scripts/`?
  2. SQL-shape regression-lock test asserts both directions for each of the 4 files (forbid-wrong + require-correct)?
  3. Live-DB test exercises all 4 surfaces?
  4. `IS DISTINCT FROM` guard in `compute-cost-estimates.js` bulk UPSERT preserved (the WAL bloat guard from Spec 47 §6.4)?
  5. Commit message documents the operator runbook step (re-run `compute-cost-estimates.js` to rewrite stale rows)?
- [ ] **R10** — **Multi-Agent Review (REQUIRED — explicit user request per HIGH blast radius):** parallel Gemini + DeepSeek + worktree code-reviewer (single message, three parallel tool calls per `scripts/CLAUDE.md` Multi-Agent Review pattern). Files: `scripts/compute-cost-estimates.js` (Gemini, against Spec 83) + `src/features/leads/lib/get-lead-feed.ts` (DeepSeek, against Spec 71) + worktree code-reviewer covers the whole diff against migration 109's FK contract. Triage: BUG → file new WF3 before Green Light; DEFER → append to `docs/reports/review_followups.md`.
- [ ] **R11** — Atomic commit on `main`: `fix(00-architecture): WF3 — repair 4 production paths that silently miss-join neighbourhoods on the city PK instead of the SERIAL FK (mig 109)`. Spec 05 §5 footer.
- [ ] **R12** — Push `main`.

§10 note: 4 sites bundled (override of WF3 per-finding default per project feedback memory) because they share one root cause + one literal fix; atomic revert is simpler than 4 commits. Pipeline data correction (re-running compute-cost-estimates.js to rewrite ~237K rows with the corrected `premium_factor`/`estimated_cost`) is OPERATOR work — documented in commit message, not in this commit's diff.

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §10 note: 4 sites bundled, multi-agent review required (user request), pipeline data correction is operator work post-merge.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
