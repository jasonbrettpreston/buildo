# Active Task: WF3 — Control Panel Architecture
**Status:** Planning
**Workflow:** WF3 — Bug Fix (refactor hardcoded constants → DB-driven)
**Rollback Anchor:** `334858e`
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Replace hardcoded JS constants (trade allocation percentages, scoring multipliers, imminent window thresholds) with database-driven configuration tables. This creates a "Control Panel" that operators can tune without code deployments.
* **Why now:** The accuracy layer scripts (commits `fd91c68`, `334858e`) work but have hardcoded values scattered across 3 scripts. Changing a scoring multiplier requires a code commit + pipeline restart. DB-driven config enables runtime tuning.
* **Key Files:**
  - `migrations/092_control_panel.sql` (new: trade_configurations + logic_variables + seed data)
  - `scripts/compute-cost-estimates.js` (refactor: read allocation_pct from DB)
  - `scripts/compute-opportunity-scores.js` (refactor: read multipliers from DB)
  - `scripts/update-tracked-projects.js` (refactor: read imminent_window_days from DB)

## State Verification
- `lead_analytics` already exists (migration 091). NOT recreated.
- `trade_configurations` does NOT exist. CREATE.
- `logic_variables` does NOT exist. CREATE.
- Migration numbering: 091 taken, next = 092.

## Technical Implementation

### Migration 092: trade_configurations + logic_variables + seed data

**trade_configurations** — 32 rows, one per trade:
```sql
CREATE TABLE trade_configurations (
  trade_slug           VARCHAR(50) PRIMARY KEY,
  bid_phase_cutoff     VARCHAR(10) NOT NULL,
  work_phase_target    VARCHAR(10) NOT NULL,
  imminent_window_days INTEGER NOT NULL DEFAULT 14,
  allocation_pct       DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**logic_variables** — key-value store for global scoring constants:
```sql
CREATE TABLE logic_variables (
  variable_key   VARCHAR(100) PRIMARY KEY,
  variable_value DECIMAL NOT NULL,
  description    TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Seed data** — INSERT the 32 trades from TRADE_TARGET_PHASE + TRADE_ALLOCATION_PCT, and the scoring variables from compute-opportunity-scores.js.

### Script refactors (3 scripts)

1. **compute-cost-estimates.js**: Replace `TRADE_ALLOCATION_RAW` / `TRADE_ALLOCATION_PCT` with a DB query at script start: `SELECT trade_slug, allocation_pct FROM trade_configurations`.

2. **compute-opportunity-scores.js**: Replace hardcoded `2.5` / `1.5` / `50` / `10` / `30` with: `SELECT variable_key, variable_value FROM logic_variables`.

3. **update-tracked-projects.js**: JOIN `trade_configurations` in the query to get `imminent_window_days` per trade instead of the hardcoded `14`.

## Standards Compliance
* **Try-Catch Boundary:** Pipeline SDK (unchanged).
* **Unhappy Path Tests:** Migration shape test + script shape tests updated.
* **logError Mandate:** pipeline.log (unchanged).
* **Mobile-First:** N/A.

## Execution Plan

- [ ] **Schema Evolution:** Write migration 092 (CREATE + seed). Apply.
- [ ] **Test Scaffolding:** migration-092 infra test.
- [ ] **Implementation:** Refactor 3 scripts to read from DB.
- [ ] **Pre-Review Self-Checklist:**
  1. Does the seed data match the current hardcoded values exactly?
  2. Do scripts gracefully handle empty config tables (fallback to hardcoded defaults)?
  3. Does the imminent_window_days JOIN work with LEFT JOIN trade_configurations?
  4. Is the allocation_pct seed normalized to sum=1.0?
- [ ] **Green Light:** Full test suite + live DB verification.
- [ ] **Review agents.** Triage, WF3, defer.
- [ ] → Commit.

---

## §10 Compliance
- ✅ **DB:** 2 new tables + seed data. No ALTER on existing tables.
- ⬜ **API / UI:** N/A
- ⬜ **Shared Logic:** The hardcoded constants remain as fallback defaults in the scripts, but the DB values take precedence.
- ✅ **Pipeline:** 3 scripts refactored to read config from DB at runtime.
