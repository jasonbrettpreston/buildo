# 🏗️ Active Task: Pre-Permits Not Showing on Search Page (Fix)
**Status:** ✅ Complete

## 🔍 Context
* **Goal:** Fix bug where no pre-permits appear when toggling to "Pre-Permits (Upcoming)" on the search page.
* **Key Files:** `docs/specs/19_search_filter.md`, `docs/specs/12_coa_integration.md`

## 🐛 Root Cause
Previous commit added bare `sub_type` column to SELECT queries in two locations:
1. `src/lib/coa/pre-permits.ts:133` — `getUpcomingLeads()` SELECT
2. `src/app/api/permits/[id]/route.ts:46` — COA detail handler SELECT

Migration `032_coa_sub_type.sql` creates this column but had not been applied to the database. PostgreSQL threw `column "sub_type" does not exist`, API returned 500, search page showed no results.

## 💻 Technical Implementation
* **No new components/hooks/exports** — query fix only.

## 🛠️ Execution Plan
- [x] **Spec Review:** `docs/specs/19_search_filter.md` — pre-permits should display when source toggle is active. ✅ Confirmed.
- [x] **Reproduction:** Added 2 tests in `src/tests/coa.logic.test.ts` — "Pre-Permit Query Safety" describe block asserts no bare `sub_type` in SELECT queries.
- [x] **Audit Check:** No `coa.audit.ts` exists.
- [x] **Red Light:** Both reproduction tests failed (❌) — confirmed bare `sub_type` in both SELECTs.
- [x] **Fix:** Changed `sub_type` → `NULL AS sub_type` in both SELECT queries. Queries now work regardless of migration state.
- [x] **Safety Check:** N/A (no audit file).
- [x] **Green Light:** 26 test files, 1047 tests passing. ✅
- [x] **Spec Audit:** No spec change needed — fix aligns code with existing spec behavior.
- [x] **Drift Check:** Pattern to avoid: don't add bare column references to SELECT queries for columns from unapplied migrations. Use `NULL AS col_name` as a safe default until migration is confirmed applied.
