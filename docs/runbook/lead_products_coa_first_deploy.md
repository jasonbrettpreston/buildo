# Runbook — CoA `lead_products` first deploy (Spec 80 §5.B, mig 184)

**What ships:** CoA product classification — new `lead_products` table + product emission in
`classify-coa-trades.js` + a gated `product_vocab` cov_ row (manifest
`classify_coa_trades.telemetry_vocab_cols.product_vocab`).

## Deploy ORDER matters (the one real gotcha)

The `product_vocab` cov_ row is **gated** (PASS ≥ 90%). It reads `COUNT(DISTINCT product_id)` over
`lead_products WHERE lead_id LIKE 'coa:%'` vs the 27-row `product_groups` vocab. On a fresh deploy
`lead_products` is **empty → 0/27 → FAIL** until populated.

1. **Apply mig 184** (`migrate`) — creates `lead_products`.
2. **Run the one-time backfill BEFORE the first post-deploy `coa` chain run:**
   `node -r dotenv/config scripts/one-time/backfill-coa-products.js`
   (Idempotent; ~30K CoAs → ~750K product rows in ~40s. Populates `lead_products` for existing leads.)
3. **Then** the `coa` chain's `classify_coa_trades` + `assert_global_coverage` read a populated table:
   `product_vocab` → **27/27 (100%) PASS**, `lead_products.coa_rows` INFO ≈ 750K.

If the chain runs before the backfill, expect one cycle of `product_vocab 0/27 FAIL` on
`classify_coa_trades` — benign, self-heals after the backfill. (No data corruption; the gate is the
only symptom.)

## Expected first-run shape (post-backfill)
- `lead_products.coa_rows` (assert_global_coverage, INFO): ~750K, 0 → N spike (expected, not a regression).
- `product_vocab` (classify_coa_trades cov_): 27/27 PASS.
- `coa_with_products` ≈ 29K; `product_slug_miss_count` = 0 (FAIL if matrix/bundle ↔ product_groups drift).

## Pre-deploy estimate query
`SELECT COUNT(*) FROM coa_applications WHERE lead_id IS NOT NULL AND scope_tags IS NOT NULL AND scope_classified_at IS NOT NULL;`
→ the backfill sweep size (leads eligible for product classification).
