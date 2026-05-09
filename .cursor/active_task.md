# Active Task: WF3 — fix lead-inspect SQL column drift (`pb.area_sqm` / `pb.height_m` don't exist)
**Status:** Implementation
**Workflow:** WF3 (Fix — pre-existing bug from commit `6683477` WF2 #4 surfaced 2026-05-08 by `25 249237 BLD--00` inspect 500)
**Domain Mode:** Cross-Domain (Web Admin + Backend) — admin API route's read-path SQL touches `parcel_buildings` × `building_footprints` schemas
**Rollback Anchor:** `f80edc2` (current HEAD on `main` — WF2 #3 cost-model gating shipped)

## Context
* **Bug:** `GET /api/admin/leads/inspect/<lead_id>` returns HTTP 500 for any permit whose `permit_parcels` resolves to a parcel with at least one `parcel_buildings` row. Reproduced today against `permit_num = '25 249237 BLD'`, `revision_num = '00'`. Server-side stack:
  ```
  error: column pb.area_sqm does not exist
    at fetchLeadInspect (src/lib/leads/lead-inspect-query.ts:300)
  PG code 42703, position 2400
  ```
* **Root cause:** `lead-inspect-query.ts:167-173` aliases the LATERAL subquery as `pb` and `SELECT`s `pb.area_sqm` + `pb.height_m` directly from `parcel_buildings`. **Those columns don't exist on `parcel_buildings`** — that table is a join table (`id, parcel_id, building_id, is_primary, structure_type, linked_at, match_type, confidence` per migs 024 + 026). The geometry lives on `building_footprints` (mig 023): `footprint_area_sqm, max_height_m, min_height_m`.
* **Why it slipped:** the existing `admin-leads-inspect.infra.test.ts` mocks `fetchLeadInspect` (line 19 — `vi.mock('@/lib/leads/lead-inspect-query', ...)`) so the actual SQL is never exercised at runtime. UI tests (`admin-detail-inspectors.ui.test.tsx`) mock the API entirely. The query has been broken since WF2 #4 shipped (commit `6683477`) but only manifests when a permit + parcel + parcel_building chain resolves successfully — most lead-feed test fixtures don't have parcel data, so dev-time clicks that hit the bug were rare.
* **Reference pattern:** `scripts/compute-cost-estimates.js` SOURCE_SQL (lines 86–92) already does this correctly — its LATERAL subquery selects `building_id` from `parcel_buildings` then JOINs `building_footprints` for the geometry columns. The fix mirrors that pattern exactly.
* **Target Spec:** `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.5 Cycle 7 (the inspector contract) — no spec amendment needed; the fix is a corrective implementation, not a behavior change.

## Technical Implementation

### The fix (one site, ~6 line delta)

`src/lib/leads/lead-inspect-query.ts` lines 167–173 (LATERAL subquery) + lines 137–138 (SELECT). Two edits:

**1. Replace the LATERAL subquery body — fetch `building_id` only:**
```sql
-- BEFORE (broken)
LEFT JOIN LATERAL (
  SELECT pb.area_sqm, pb.height_m              -- ❌ columns don't exist
    FROM parcel_buildings pb
   WHERE pb.parcel_id = pp.parcel_id
   ORDER BY pb.is_primary DESC NULLS LAST, pb.confidence DESC NULLS LAST
   LIMIT 1
) pb ON true

-- AFTER
LEFT JOIN LATERAL (
  SELECT building_id
    FROM parcel_buildings
   WHERE parcel_id = pp.parcel_id
   ORDER BY is_primary DESC NULLS LAST, confidence DESC NULLS LAST
   LIMIT 1
) pb ON true
LEFT JOIN building_footprints bf ON bf.id = pb.building_id
```

**2. Pull the geometry columns from the new `bf` alias in the SELECT:**
```sql
-- BEFORE
pb.area_sqm::text AS pb_area_sqm,
pb.height_m::text AS pb_height_m,

-- AFTER (column-names from migration 023)
bf.footprint_area_sqm::text AS pb_area_sqm,
bf.max_height_m::text AS pb_height_m,
```

The output column names `pb_area_sqm` / `pb_height_m` are preserved verbatim → the `MainRow` interface and the JS-side mapper (`pbAreaSqm`, `pbHeightM`, `massing`) require **zero edits**. The fix is SQL-only.

> **Decision: `max_height_m` (not `min_height_m`) for the height column.** `building_footprints` exposes both. The cost model (`compute-cost-estimates.js` SOURCE_SQL line 72) doesn't expose height at all — it derives stories from `estimated_stories`. The inspector's `massing.height_m` field feeds the UI's massing panel; the maximum (taller) value is the conservative choice for "this structure's height." A future amendment may surface both as `height_m_min` / `height_m_max`; not in scope here.

### Test strategy — why the existing tests missed this + the regression-lock

The Red Light has two layers:

**Layer 1 (primary, always-on): SQL-shape regression-lock test.** Mirror the `compute-cost-estimates.infra.test.ts` pattern — text regex over the file body. Asserts:
1. `pb.area_sqm` literal is NOT present (forbids the OLD bug)
2. `pb.height_m` literal is NOT present
3. `bf.footprint_area_sqm` IS present (the fix)
4. `bf.max_height_m` IS present
5. `LEFT JOIN building_footprints bf ON bf.id = pb.building_id` IS present
6. The LATERAL subquery selects `building_id` (not geometry columns)

This catches THIS specific bug + future regressions at the text level. Cheap, no DB.

**Layer 2 (decision deferred — propose a follow-up WF3): live-DB integration test.** A truly drift-proof regression-lock would execute the SQL against the dev DB with a known sample permit and assert no exception is thrown. The project currently has **zero** infra tests that hit the live DB — every existing `*.infra.test.ts` is text-shape regex on file contents (verified by grep across all 80+ files). Introducing the first live-DB test is more pattern-setting than this WF3 should bite off; defer to a separate WF that establishes a `DATABASE_URL`-gated test harness for read-only SQL exercise tests.

→ **This WF3 ships Layer 1 only.** Layer 2 is filed as a deferred follow-up in `docs/reports/review_followups.md`.

### Files (Modified / New)

- **MODIFIED** `src/lib/leads/lead-inspect-query.ts` — two SQL edits per above.
- **NEW** `src/tests/lead-inspect-query.infra.test.ts` — SQL-shape regression-lock (~6 assertions).
- **MODIFIED** `docs/reports/review_followups.md` — append "live-DB infra test for inspect SQL" as deferred WF candidate.

### Database Impact

NONE. No migration. No schema change. This is a pure code fix to read existing columns from the correct table.

## Standards Compliance

* **§2 Error handling:** the route's existing `try/catch + internalError(...)` envelope is correct — the bug isn't in the error pathway, it's in the SQL the pathway protects. No new throws, no new catch blocks.
* **§3.2 Pagination:** N/A — single-row query (`WHERE p.permit_num = $1 AND p.revision_num = $2`).
* **§4.2 Parameterization:** unchanged — all params still bound via `$1, $2, $3`. No string concatenation introduced.
* **§5.2 Test file pattern:** new test file is a SPEC LINK header + `.infra.test.ts` per existing convention.
* **§6 Logging:** no new log sites. Existing `logError` in `withApiEnvelope`'s `internalError(...)` continues to surface server-side stacks once the SQL is fixed (unrelated bugs would still log normally).
* **§7 Dual Code Path:** N/A — TS-only. The Muscle (`compute-cost-estimates.js`) already uses the correct pattern; this WF3 brings the inspector reader into alignment.
* **§9 Pipeline Safety:** N/A — read-only API route, no DB writes, no transactions.
* **Spec 7 §7.1:** the cost model's Muscle SOURCE_SQL is the dual-path reference for the correct JOIN pattern; inspector now mirrors it.
* **Spec 33 §5 + §8:** auth boundary is `verifyAdminAuth` first-line (untouched); the sanitized envelope path (untouched) stops leaking the `42703` PG error to clients via `internalError(...)` — unchanged. The fix removes the *cause* of the leak, not the leak guard.
* **Spec 47 §10.3:** error-handling protocol unchanged.

## State Verification (DONE before plan-lock)

* Reproduced 2026-05-08 via throwaway debug script (`scripts/debug-inspect-500.js`, deleted): `column pb.area_sqm does not exist` (PG 42703) at `lead-inspect-query.ts:300`.
* Confirmed `parcel_buildings` schema (migs 024 + 026) has NO `area_sqm` / `height_m` columns — only `id, parcel_id, building_id, is_primary, structure_type, linked_at, match_type, confidence`.
* Confirmed `building_footprints` schema (mig 023) has `footprint_area_sqm, max_height_m, min_height_m` — these are the correct columns.
* Confirmed `compute-cost-estimates.js` SOURCE_SQL uses the correct two-step pattern (LATERAL → `building_id` → JOIN `building_footprints`) at lines 86–92 — the inspector fix mirrors this exactly.
* Confirmed `admin-leads-inspect.infra.test.ts` mocks `fetchLeadInspect` (line 19) — the SQL is never exercised at runtime by any existing test, so the broken query slipped through commit `6683477`.

## Execution Plan
- [ ] **R1** — Rollback anchor confirmed: `f80edc2`. Branch: `main`.
- [ ] **R2** — State verification: re-confirm the bug with the same debug script (or hit the dev server inspect endpoint and re-grab the stack).
- [ ] **R3** — Spec Review: re-read Spec 76 §3.5 Cycle 7 (inspector behavioral contract). No amendments expected — this is a corrective implementation.
- [ ] **R4** — Reproduction test FIRST (Red Light): write `src/tests/lead-inspect-query.infra.test.ts` with the 6 SQL-shape assertions → run vitest → MUST fail (current SQL contains `pb.area_sqm` literal that the test forbids).
- [ ] **R5** — Implementation (one file at a time):
  - `src/lib/leads/lead-inspect-query.ts` — replace LATERAL body (`SELECT building_id` + add `LEFT JOIN building_footprints bf`) + update SELECT to `bf.footprint_area_sqm` / `bf.max_height_m` aliased to the existing `pb_area_sqm` / `pb_height_m` output names
  - `docs/reports/review_followups.md` — append the deferred live-DB infra test follow-up
- [ ] **R6** — Green Light: new test passes; `npm run typecheck && npm run lint -- --fix && npm run test`.
- [ ] **R7** — Idempotency: re-run vitest on the new test twice — confirm deterministic.
- [ ] **R8** — Live verification: run the same throwaway debug script (or hit `GET /api/admin/leads/inspect/25%20249237%20BLD--00` against the dev server). Expect: HTTP 200 with a populated LeadInspect envelope. Massing panel should show `area_sqm` and `height_m` non-null when the resolved building_footprint has them.
- [ ] **R9** — Pre-Review Self-Checklist (5 items):
  1. SQL no longer references `pb.area_sqm` or `pb.height_m`?
  2. New `LEFT JOIN building_footprints bf ON bf.id = pb.building_id` present, with column aliases preserving `pb_area_sqm` / `pb_height_m` output names?
  3. `MainRow` TS interface unchanged + JS-side mapper untouched (zero blast radius beyond the SQL string)?
  4. Per project feedback memory ("WF3 cadence — per-finding"): no unrelated changes folded in?
  5. WF3 doesn't run multi-agent review unless explicitly requested (per feedback memory) — skip the Gemini/DeepSeek pass; rely on the Red Light + self-checklist + live verification.
- [ ] **R10** — Self-review (in-file): re-read the diff against `compute-cost-estimates.js` SOURCE_SQL to confirm the join pattern matches exactly.
- [ ] **R11** — Atomic commit on `main`: `fix(76_lead_feed_health_dashboard): WF3 — repair lead-inspect SQL column drift (pb.area_sqm/height_m → bf.footprint_area_sqm/max_height_m)`. Spec 05 §5 footer.
- [ ] **R12** — Push `main`.

§10 note: SQL-shape regex regression-lock + sister-script mirror — chose Layer 1 over Layer 2 (live-DB test) to keep blast radius minimal and ship the user-facing fix today; live-DB harness deferred to a separate WF that establishes the pattern across the inspector + future read-only SQL endpoints.

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §10 note: SQL-only fix; mirrors compute-cost-estimates.js pattern verbatim; SQL-shape regex test ships, live-DB test deferred.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
