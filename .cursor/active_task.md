# Active Task: WF1 — Signal Evolution Schema (Migration 091)
**Status:** Planning
**Workflow:** WF1 — New Feature Genesis
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Add database infrastructure for the Valuation Engine's competition discount (behavioral signal tracking), geometric cost override audit trail, and the flight tracker's opportunity scoring + bimodal window labeling.
* **Why now:** The CRM assistant (commit `e04ba13`) can now detect state changes and generate alerts. The next layer needs: (a) how many users are tracking each lead (competition signal), (b) was the cost estimate overridden by geometry (audit), and (c) which bimodal window is each forecast targeting (feed display).
* **Target Spec:** Valuation Engine + Lead Analytics
* **Key Files:** `migrations/091_signal_evolution.sql`, `src/tests/migration-091.infra.test.ts`

## State Verification
- `trade_contract_values` **already exists** on `cost_estimates` (migration 089). SKIP that ALTER.
- `is_geometric_override` and `modeled_gfa_sqm` do NOT exist. ADD.
- `opportunity_score` and `target_window` do NOT exist on `trade_forecasts`. ADD.
- `lead_analytics` table does NOT exist. CREATE.

## Technical Implementation

### 1. CREATE `lead_analytics` — behavioral signal tracking
```sql
CREATE TABLE lead_analytics (
  lead_key      VARCHAR(100) PRIMARY KEY,  -- 'permit:num:rev'
  tracking_count INTEGER NOT NULL DEFAULT 0,  -- High intensity (claimed)
  saving_count   INTEGER NOT NULL DEFAULT 0,  -- Low intensity (saved)
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- `lead_key` format: `permit:24 101234:01` (composite key as a single string for fast lookups)
- `tracking_count` = number of users who CLAIMED this lead
- `saving_count` = number of users who SAVED this lead
- Competition discount: `discount_factor = 1 / (1 + tracking_count + 0.3 * saving_count)`

### 2. ALTER `cost_estimates` — geometric audit columns
```sql
ALTER TABLE cost_estimates
  ADD COLUMN is_geometric_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN modeled_gfa_sqm DECIMAL;
```
- `is_geometric_override`: true if the cost estimate used massing/GFA geometry instead of permit-reported value
- `modeled_gfa_sqm`: the gross floor area in square meters used for the geometric estimate (NULL if not geometric)
- `trade_contract_values` already exists — skip

### 3. ALTER `trade_forecasts` — opportunity scoring + window label
```sql
ALTER TABLE trade_forecasts
  ADD COLUMN opportunity_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN target_window VARCHAR(20);
```
- `opportunity_score`: 0-100 composite score combining urgency + competition + cost
- `target_window`: `'bid'` or `'work'` — which bimodal window the forecast is targeting (set by compute-trade-forecasts.js)

* **Database Impact:** YES — 1 CREATE TABLE + 2 ALTER (all instant: ADD COLUMN with DEFAULT or nullable)

## Standards Compliance
* **Try-Catch Boundary:** N/A — schema only
* **Unhappy Path Tests:** Migration file-shape test
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan

- [ ] **Contract Definition:** `lead_analytics` is the contract for the competition discount calculation. `opportunity_score` + `target_window` are consumed by the feed UI.

- [ ] **Schema Evolution:**
  - Write `migrations/091_signal_evolution.sql`
  - `npm run migrate && npm run db:generate`
  - `npm run typecheck`

- [ ] **Test Scaffolding:** `src/tests/migration-091.infra.test.ts`

- [ ] **Red Light:** Tests FAIL before migration written.

- [ ] **Implementation:** Write migration + tests + apply.

- [ ] **Pre-Review Self-Checklist:**
  1. Does the migration skip `trade_contract_values` (already exists)?
  2. Is `lead_key` VARCHAR(100) enough for the `permit:num:rev` format?
  3. Should `opportunity_score` have a CHECK 0-100?
  4. Should `target_window` have a CHECK ('bid', 'work')?
  5. Are all ADD COLUMN operations instant (no table rewrite)?

- [ ] **Green Light:** Full test suite + typecheck.
- [ ] **Independent + adversarial review agents.** Triage, WF3, defer.
- [ ] → WF6 + commit.

---

## §10 Compliance
- ✅ **DB:** 1 CREATE + 2 ALTER (all instant). Commented DOWN. CHECK constraints where appropriate.
- ⬜ **API:** N/A
- ⬜ **UI:** N/A
- ⬜ **Shared Logic:** N/A
- ⬜ **Pipeline:** N/A — scripts consume these in future WFs
