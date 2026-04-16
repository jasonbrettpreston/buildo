# Phase 0 & Phase 1 Implementation Bug Summary

**Date**: April 2026
**Scope**: Commit history covering Phase 0 Core Infrastructure and Phase 1 Data Layer (Lead Feed Spec implementations).

During the implementation of the backend infrastructure and data layer for the Lead Feed features, intensive independent and adversarial reviews surface numerous latent bugs ranging from SQL schema drift to critical runtime oversights. This document synthesizes the key bugs corrected during the Phase 0 and Phase 1 stabilization windows.

---

## 1. Critical Runtime & Logic Bugs

### 1.1 The Missing Column Crash (Phase 1 Holistic Review)
**Severity**: **CRITICAL**
- **Bug**: The unified `get-lead-feed.ts` CTE queries referenced `pt.trade_slug` across two major operations. This column *did not exist* on the `permit_trades` database table (it had been normalized to `trade_id` in Migration 006). 
- **Impact**: Any execution of the lead feed endpoint would have caused the database to reject the query entirely, failing all data fetches.
- **Resolution**: Rewrote CTEs to properly `JOIN trades t ON t.id = pt.trade_id` and implemented a regression test explicitly blocking `pt.trade_slug` in the query strings.

### 1.2 Redis Singleton Instantiation (Phase 0)
**Severity**: **CRITICAL**
- **Bug**: The Upstash Redis rate limiter (`rate-limit.ts`) initialized the client cache as a global singleton rather than maintaining a composite cache instance keyed to specific `(limit, windowSec)` configurations. 
- **Impact**: Cross-contamination of rate limits where a highly restrictive limit could override a loose limit depending on race conditions and load order.
- **Resolution**: Refactored to a `Map` keyed on composite keys ensuring isolated window counting.

### 1.3 Un-weighted Statistical Calibration (Phase 1b-ii Timing)
**Severity**: **CRITICAL**
- **Bug**: The script computing global timing statistics `compute-timing-calibration.js` evaluated timing percentiles via a crude arithmetic mean rather than sample-size weighting (treating 10,000 instances identically to 25 instances). Furthermore, it joined the inspections log directly to all permit revisions, massively inflating data for multi-revision permits.
- **Impact**: Dramatically skewed expected lead timing metrics for tradespeople.
- **Resolution**: Extracted a distinct `permit_root` CTE prioritizing the original `issued_date` and applied fully weighted aggregation to median tracking.

---

## 2. Security and System Health Bugs

### 2.1 API Limit Injection (Phase 1b-iii)
**Severity**: **HIGH**
- **Bug**: Pagination logic in `get-lead-feed.ts` passed the raw user input `input.limit` directly into the PostgreSQL `LIMIT` clause without explicitly clamping it below a hard threshold.
- **Impact**: A malicious user could request 1,000,000 rows in a single heavily computed CTE transaction, introducing a severe Denial of Service (DoS) vulnerability.
- **Resolution**: Re-clamped values between `[1, 30]` before hitting database execution logic.

### 2.2 Biome Lint Leak / Infinite Allocations (Phase 0)
**Severity**: **HIGH**
- **Bug**: The backend Biome linting scope missed `src/app/api/**` entirely. Once extended, it uncovered 9 latent code structure bugs involving invalid assignments in parser functions (specifically `while ((m = re.exec(str)) !== null)`).
- **Impact**: Execution loops could silently fail or improperly lock CPU parsing regex objects.
- **Resolution**: Translated loops to standard JS ES6 compliant iterations like `str.matchAll(re)` with safe conditional indices.

### 2.3 Transient Database Caching Lock (Phase 1b-ii Timing)
**Severity**: **HIGH**
- **Bug**: `ensureCalibrationLoaded` marked the memory cache as "loaded" even if the underlying database call failed due to a transient blip. 
- **Impact**: Any temporary network failure left the node server locked with an empty timing cache for the full 5-minute cache lifespan, breaking the Tier 2 heuristic engine for active users.
- **Resolution**: Ensure timestamps are skipped on failures to permit immediate fetching retries.

---

## 3. Data Integrity & PostgreSQL Constraints

### 3.1 Un-bounded Value Constraints (Phase 1a Schema)
**Severity**: **HIGH**
- **Bugs**: 
  - The `min_lag_days` and `max_lag_days` in the `inspection_stage_map` had no sequential safety bounds. It was possible to specify a max boundary *smaller* than a minimum boundary (e.g. 10 to 5 days).
  - The `premium_factor` lacked bounds checks and was mathematically capable of dropping below zero logic values.
- **Resolution**: Implemented strong `CHECK` constraints prohibiting logic inversions natively within the Postgres engine (e.g., `CHECK (min_lag_days >= 0 AND max_lag_days >= min_lag_days)`).

### 3.2 Polluted Builder Context Confidence (Phase 1 Holistic)
**Severity**: **MEDIUM**
- **Bug**: The system only checked permit ML-confidence (`confidence >= 0.5`) in the `permit_candidates` extraction loop, completely omitting it in the `builder_candidates` path.
- **Impact**: Extremely low-confidence (i.e. trash) model predictions were allowed to attribute permit scores to builder relationships.
- **Resolution**: Filter conditions were normalized across both independent CTE evaluation blocks.

---

## Conclusion
The phased adversarial code review approach prevented several critical deployment failures. Due to mocking local databases inside Unit Tests, fatal SQL relational failures (like missing columns and unbounded LIMIT insertions) survived initial local test passes but were successfully intercepted by comprehensive cross-module phase audits prior to pushing the feature forward.
