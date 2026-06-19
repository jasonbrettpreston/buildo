# Runbook — DB `--force` rebuild after Spec 80 v-next Phase 2

**When:** any full-replay rebuild (`node scripts/migrate.js --force`) on a DB where Phase-2 `classify-permits` has already run (i.e. `permit_products` is non-empty).

**Why:** migration 180 (`product_groups` re-seed) has an empty-guard:
```sql
IF (SELECT count(*) FROM permit_products) > 0 THEN RAISE EXCEPTION ... ;
```
It was written when `permit_products` was dormant (Phase 1). Phase 2 populates it, so a `--force` replay now **halts at migration 180**. (The normal in-order `migrate` never re-runs 180, and `BUILDO_TEST_DB` replays on a fresh/empty container, so both are unaffected — this only bites a `--force` rebuild of a populated DB.)

**Pre-flight (safe — both tables repopulate on the first `classify-permits` run):**
```sql
TRUNCATE permit_products, trade_products CASCADE;
```
Then run `node scripts/migrate.js --force` and re-run the `permits` + `coa` chains.

**Permanent fix (future WF):** make migration 180 `TRUNCATE permit_products` (guarded) instead of aborting, OR move the product re-seed behind a one-time backfill script (the mig-162 precedent). Tracked in `review_followups.md` (80-vnext-P2).
