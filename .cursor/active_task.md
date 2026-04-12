# Active Task: WF3 — Fix Migration 089 (Valuation + Claiming Schema)
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `91af55e` (fix(88_forecast_urgency): migration safety + header fix + deferred items)
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Fix 3 bugs in migration 089 found by independent + adversarial review agents before any application code consumes these tables.
* **Target Spec:** `migrations/089_valuation_claiming_schema.sql`
* **Key Files:** `migrations/089_valuation_claiming_schema.sql`, `src/tests/migration-089.infra.test.ts`

## Bugs

### Bug 1 (CRITICAL) — `user_id UUID` type mismatch
Firebase Auth UIDs are 28-char base64 strings, NOT UUID format. Every INSERT would fail with `invalid input syntax for type uuid`. The project convention (ADR 006, migrations 010/070/075/076) uses `VARCHAR(128)`. Both reviewers flagged at 100% confidence.

### Bug 2 (HIGH) — UNIQUE includes `revision_num`
When a permit gets a new revision ("01" → "02"), the user's claim on revision "01" does NOT carry over. The user must re-claim manually. Fix: remove `revision_num` from the UNIQUE constraint so claims survive revisions. Keep `revision_num` as an informational column (the revision at time of claim).

### Bug 3 (HIGH) — No `updated_at` column
Status transitions (claimed_unverified → verified → expired) have no timestamp. Blocks admin analytics, expiry jobs, and debugging. Fix: add `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

## Standards Compliance
* **Try-Catch Boundary:** N/A — schema only.
* **Unhappy Path Tests:** Update infra test to assert VARCHAR(128), updated UNIQUE, and updated_at column.
* **logError Mandate:** N/A.
* **Mobile-First:** N/A.

## Execution Plan

- [x] **Rollback Anchor:** `91af55e`
- [x] **State Verification:** Confirmed UUID type mismatch via `information_schema`. Confirmed existing tables use VARCHAR(128). Confirmed revision_num in UNIQUE. Confirmed no updated_at column.
- [x] **Spec Review:** ADR 006 (`docs/adr/006-firebase-uid-not-fk.md`) documents the Firebase UID convention.
- [x] **Reproduction:** Both review agents flagged Bug 1 at 100% confidence. Bug 2 confirmed by reviewing the UNIQUE constraint. Bug 3 confirmed by column listing.
- [ ] **Red Light:** N/A — these are schema-level bugs, not logic bugs reproducible via failing tests.
- [ ] **Fix:**
  1. Rollback migration 089 manually (DROP table + DROP column)
  2. Rewrite migration: `user_id VARCHAR(128)`, UNIQUE without `revision_num`, add `updated_at`
  3. Re-apply migration
  4. Regen Drizzle
  5. Update infra test assertions
- [ ] **Pre-Review Self-Checklist:**
  1. Does VARCHAR(128) match the convention in migrations 075/076?
  2. Does the UNIQUE without revision_num still prevent double-claiming?
  3. Does updated_at have a DEFAULT NOW()?
  4. Are all 3 fixes reflected in the infra test?
- [ ] **Green Light:** `npm run test && npm run typecheck`. All pass.
- [ ] → Commit.

## Deferred to review_followups.md
- Expiry mechanism for stale claimed_unverified rows (application-layer concern — future WF1 for claiming API)

---

## §10 Compliance
- ✅ **DB:** Fix type mismatch before any application code consumes it. UNIQUE constraint redesigned. Audit column added.
- ⬜ **API:** N/A
- ⬜ **UI:** N/A
- ⬜ **Shared Logic:** N/A
- ⬜ **Pipeline:** N/A
