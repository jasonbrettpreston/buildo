# 86 Master Configuration List: The "Control Panel" Schema

> **Status:** IMPLEMENTED — Migrations 092+093+097 + Shared Config Loader (April 2026).
> **Purpose:** Centralize hardcoded variables into a database-driven Control Panel, allowing operators to tune system "Gravity" via the Admin UI.

## 1. Global Platform Logic (`logic_variables`)

These are universal "Gravity" constants. They act as baseline rules, fallbacks, and mathematical thresholds for the pipeline engines.

| Variable Key | Script | Impact of Adjustment |
|---|---|---|
| `los_base_divisor` | Score | Change from 10k to 5k to double the point-value of contract size. |
| `los_penalty_tracking` | Score | Increase to 50 to heavily penalize leads claimed by flight-trackers. |
| `los_penalty_saving` | Score | Increase to 10 to penalize leads being watched by competitors. |
| `los_multiplier_bid` | Score | Global fallback (e.g., 2.5) if a trade lacks a specific bid multiplier. |
| `los_multiplier_work` | Score | Global fallback (e.g., 1.5) if a trade lacks a specific work multiplier. |
| `los_decay_divisor` | Score | Asymptotic decay curve steepness (default 25). `rawPenalty / this = decayFactor`; higher = gentler decay. At 25, a single high-intensity tracker halves the score. |
| `snowplow_buffer_days` | Forecast | Days added to today when snapping a fallback-anchor forecast out of the deep past (default 7). Higher = more lead time before the window opens. |
| `expired_threshold_days` | Forecast | Sets the TTL (e.g., 90) before a lead classifies as expired and auto-archives. |
| `coa_stall_threshold` | Lifecycle | Change to 30 to be more patient with the City's pre-con CoA process. |
| `stall_penalty_precon` | Forecast | Days to push the "Snowplow" forward for zoning/permit delays (e.g., 45). |
| `stall_penalty_active` | Forecast | Days to push the "Snowplow" forward for active site stalls (e.g., 14). |
| `liar_gate_threshold_pct` | Cost | The % window (e.g., 0.25) before city cost data is discarded as a lie. |
| `urban_coverage_ratio` | Cost | Default footprint % (e.g., 0.70) for high-density lots missing massing. |
| `suburban_coverage_ratio` | Cost | Default footprint % (e.g., 0.40) for low-density lots missing massing. |
| `commercial_shell_multiplier` | Cost | **NEW:** The penalty multiplier (e.g., 0.60) applied to interior trades on Shell builds. |
| `placeholder_cost_threshold` | Cost | **NEW:** The minimum city cost (e.g., $1000) before the model assumes total override control. |
| `income_premium_tiers` | Cost | **NEW:** JSON mapping of neighborhood income brackets to cost multipliers (e.g., `{"100000": 1.2, "150000": 1.5}`). |

## 2. Trade Matrix Logic (`trade_configurations`)

This is your Per-Trade Control Panel, heavily expanded to support Surgical Estimation (Spec 83) and Bimodal Routing (Spec 85). (Note: `trade_sqft_rates` from early Spec 83 drafts has been cleanly merged into this table).

| Field | Consumed By | Your Manual Control Ability |
|---|---|---|
| `base_rate_sqft` | Cost | Standard $/sqft for the trade (replaces legacy global allocation). |
| `structure_complexity_factor` | Cost | Multiplier for multi-unit vs. SFD builds (applied per-trade). |
| `multiplier_bid` | Score | Set the Early Bid weight per trade (e.g., 3.0 for Excavation). |
| `multiplier_work` | Score | Set the Rescue weight per trade (e.g., 1.8 for Structural Steel). |
| `bid_phase_cutoff` | Forecast | The phase (e.g., P6) where `multiplier_bid` drops to work. |
| `work_phase_target` | Forecast | The physical phase the pro is actively aiming for (e.g., P12). |
| `imminent_window_days` | CRM | Days of notice before "Starting Soon" alert fires (Disables tier if set to 0). |

## 3. How this looks in your Admin UI

When you open your Admin page to manage trades, you will see a 32-row table bridging pricing, timing, and strategic value:

| Trade Slug | $/sqft | Complex X | Bid Cutoff | Work Target | Bid Mult | Rescue Mult | Imminent Window |
|---|---|---|---|---|---|---|---|
| `plumbing` | `$12.00` | 1.5 | P6 | P12 | 2.5 | 1.5 | 14 days |
| `framing` | `$25.00` | 1.1 | P8 | P11 | 3.5 | 1.8 | 21 days |
| `painting` | `$4.00` | 1.0 | P13 | P16 | 2.0 | 1.1 | 7 days |

## 4. Implementation Plan: The "Bridge" Strategy

### Step 1: Infrastructure (Migrations 091, 092, 093, 097)

Ensure the database schema is aligned. This includes the expanded `trade_configurations` table, the newly expanded 15-key `logic_variables` table, and the creation of the `scope_intensity_matrix` table.

### Step 2: The Script Sequence (The Permits Chain)

Refactor the scripts to load via `scripts/lib/config-loader.js`. They must execute in this exact sequence to ensure anchors and scores compound correctly:

| Step | Script | Role & Config Consumption |
|---|---|---|
| **14** | `compute-cost-estimates` | Fetches `base_rate_sqft` + `structure_complexity_factor`. Applies `liar_gate_threshold_pct`, `commercial_shell_multiplier`, `placeholder_cost_threshold`, and `income_premium_tiers`. |
| **15** | `compute_timing_calibrations` | Establishes the historical medians needed for forecasts. |
| **21** | `classify-lifecycle-phase` | Reads `coa_stall_threshold` to flag `lifecycle_stalled = TRUE`. Updates `phase_started_at` anchors. |
| **22** | `compute-trade-forecasts` | Reads `bid_phase_cutoff`, `work_phase_target`, `imminent_window_days`, stall penalties, and `expired_threshold_days` to stamp `target_window` and `urgency`. |
| **23** | `compute-opportunity-scores` | Reads `multiplier_bid/work` based on the stamped window. Applies penalties for tracking/saving. |
| **24** | `update-tracked-projects` | The CRM Assistant. Reads `imminent_window_days` for payload text, auto-archives dead leads, and syncs `lead_analytics`. |

### Step 3: Admin UI (The Control Page)

Create a single React page (or tabbed view) in the Admin dashboard with four distinct sections:
- **Marketplace Constants Card:** A form to edit the 15 universal `logic_variables` (including a JSON editor or tiered inputs for `income_premium_tiers`).
- **Trade Configuration Table:** A searchable 32-row data grid to manage the `trade_configurations` table.
- **The Scope Intensity Matrix:** A grid editor mapping `permit_type` vs. `structure_type` to manage the percentages (The Surgical Triangle).
- **Global Apply Button:** A button that clears the Node cache and triggers a pipeline re-run (Steps 14-24) to immediately reflect the new "Gravity" across the marketplace.

---

## 5. Implementation Checklist

### Phase 1: Foundation & Tooling
**Objective:** Establish the directory structure, install UI primitives, and enforce type safety.

- [ ] **Initialize Feature Folder:** Create `src/features/admin-controls/` with `api/`, `components/`, `lib/`, and `store/` subdirectories.
- [ ] **Install Shadcn Primitives:** Run the CLI to add the required UI blocks:
  - `npx shadcn@latest add tabs`
  - `npx shadcn@latest add table`
  - `npx shadcn@latest add card`
  - `npx shadcn@latest add form input slider`
  - `npx shadcn@latest add sonner`
  - `npx shadcn@latest add dialog`
- [ ] **Define TypeScript Interfaces (`lib/types.ts`):** Create the `MarketplaceConfig` interface explicitly typing all 23 variables (15 global, 7 per-trade, 1 scope intensity matrix).
- [ ] **Create Zod Schema (`lib/schemas.ts`):** Build the client-side Zod validation schema. **Crucial:** Ensure 1:1 parity with the backend `config-loader.js` schema to prevent drift.
- [ ] **Implement Delta Guard Utility:** Write a helper function that compares a draft value against the system default and returns a boolean if the deviation exceeds 50% (to trigger the amber warning UI).
- [ ] **Write Schema Parity Test:** Assert frontend `MarketplaceConfig` matches backend `config-loader.js` exactly.
- [ ] **Implement Feature Error Boundary:** Wrap the `admin-controls` route in a strict React Error Boundary (`error.tsx`).
- [ ] **Wire Sentry / Exception Tracking:** Ensure the Error Boundary `useEffect` pushes the error and stack trace directly to Sentry (or your equivalent error tracker) with the tag `feature: admin-controls`.

### Phase 2: State Management & API Layer
**Objective:** Manage the "Draft vs. Production" state and wire up data fetching.

- [ ] **Create Zustand Store (`store/useAdminStore.ts`):** 
  - Initialize state to hold `productionConfig` and `draftConfig`.
  - Add actions: `updateDraftValue`, `resetDrafts`, and `commitDrafts`.
  - Add a derived selector `hasUnsavedChanges` to conditionally enable the Global Apply button.
- [ ] **Build Query Hooks (`api/useMarketplaceConfigs.ts`):**
  - `useGetConfigs`: Fetches the current live state from the database.
  - `useUpdateConfigs`: Mutation hook to save the `draftConfig` payload to the database.
  - `useTriggerPipeline`: Mutation hook to hit the endpoint that triggers backend Steps 14–24.
- [ ] **Add API Error Interceptors:** Update the `useUpdateConfigs` and `useTriggerPipeline` hooks to catch 500 and 400 errors. If the backend Zod validation rejects the payload, the frontend must capture that specific rejection reason and expose it to the UI.
- [ ] **Write Store Tests:** Assert draft mutations, discard rollbacks, and dirty-state tracking in Zustand work flawlessly.

### Phase 3: Global Platform Logic View
**Objective:** Build the UI for the 15 universal `logic_variables`.

- [ ] **Create Layout Shell:** Implement the main Tabs component to switch between Global, Trade, and Matrix views.
- [ ] **Build `GlobalConfigCard.tsx`:** Group variables logically into UI sections using Shadcn Cards: Scoring (divisors, multipliers, penalties), Timing (thresholds, windows), and Geography/Cost (coverage ratios, liar gate).
- [ ] **Wire Inputs & Sliders:** Map the 14 numeric variables to Shadcn Sliders and number inputs, hooked into the Zustand `updateDraftValue` action.
- [ ] **Build JSON Editor Component:** Create a specialized input block for the `income_premium_tiers` mapping.
- [ ] **Apply Delta Guard UI:** Wrap inputs in a validation state that turns the border/text amber if the user adjusts a value by >50%.
- [ ] **Write Delta Guard UI Tests:** Assert that changing a value by >50% visually triggers the amber warning state in the DOM.

### Phase 4: Trade Matrix Logic View
**Objective:** Build the 32-row data table for per-trade configuration.

- [ ] **Build `TradeGrid.tsx`:** Implement the Shadcn DataTable.
- [ ] **Configure Columns:** Set up the 7 required columns: `base_rate_sqft`, `structure_complexity_factor`, `multiplier_bid`, `multiplier_work`, `bid_phase_cutoff`, `work_phase_target`, and `imminent_window_days`.
- [ ] **Enable Inline Editing:** Transform table cells into editable inputs that update the Zustand store for that specific `trade_slug`.
- [ ] **Add Search/Filter:** Implement a text filter for `trade_slug` to easily find and tune specific trades.
- [ ] **Write Trade Grid UI Tests:** Ensure that inline edits correctly trigger the Delta Guard warnings and update the Zustand store state specifically for the edited trade row.

### Phase 5: The Surgical Triangle View
**Objective:** Build the matrix editor for `scope_intensity_matrix`.

- [ ] **Build `IntensityMatrix.tsx`:** Create a 2D grid UI where rows are `permit_type` (Addition, New Build, etc.) and columns are `structure_type` (SFD, 4-Unit, etc.).
- [ ] **Wire Matrix Inputs:** Populate the intersecting cells with the `gfa_allocation_pct` values.
- [ ] **Connect to Draft State:** Ensure changing a cell updates the specific composite key in the Zustand store.

### Phase 6: The "Apply & Re-Sync" Workflow
**Objective:** Safely push draft changes to production and trigger the pipeline.

- [ ] **Build Sticky Action Bar:** Create a bottom or top bar containing "Discard Changes" and "Apply & Re-Sync" buttons, visible only when `hasUnsavedChanges` is true.
- [ ] **Build Diff Dialog (`ConfirmSyncModal.tsx`):**
  - Intercept the "Apply" click with a Shadcn Dialog.
  - Render a list of changed variables showing Old Value -> New Value.
- [ ] **Wire the Execution Chain:**
  - On confirm, trigger `useUpdateConfigs` to write to DB.
  - On success, trigger `useTriggerPipeline` to flush the Node.js cache and run Steps 14–24.
- [ ] **Add Observability/Feedback:** Implement Sonner toasts to display "Configs Saved" and "Pipeline Re-Run Initiated."
- [ ] **Implement Audit Telemetry:** Inside the submit handler, right before the Sonner success toast fires, execute a telemetry call (e.g., `captureEvent('admin_gravity_adjusted', { diff: changesPayload, user_id: currentAdmin.id })`).
- [ ] **Implement Graceful Error Toasts:** If the API fails, the UI must NOT clear the draft state. It must fire a red Sonner toast displaying the exact error message (e.g., "Sync Failed: Base Rate must be a positive number"), allowing the Admin to fix the typo and try again.

### Phase 7: End-to-End Validation & Handoff
**Objective:** Prove the Admin UI successfully drives the backend pipeline from end to end before clearing it for production use.

- [ ] **Write Playwright/Cypress E2E Test:** Automate a browser session that logs in as Admin, alters a specific trade multiplier, and clicks "Apply & Re-Sync."
- [ ] **Assert Database Mutation:** The E2E test directly queries the staging DB to confirm `trade_configurations` and `logic_variables` were actually updated with the new values.
- [ ] **Assert Pipeline Execution:** The E2E test verifies that the `cost_estimates` and `trade_forecasts` tables reflect updated `updated_at` timestamps, proving Steps 14-24 ran successfully via the UI trigger.

---

## 5. Mobile & Responsive Behavior

All Control Panel UI is built mobile-first (base Tailwind classes = mobile; `md:` / `lg:` = desktop).

| Component | Mobile (< 640px) | Desktop (≥ 640px) |
|-----------|------------------|--------------------|
| **ConfirmSyncModal** | Renders as bottom `<Drawer>` (Vaul) that slides up from the bottom edge | Renders as centered `<Dialog>` with max-w-lg |
| **StickyActionBar** | Full-width bar pinned to the bottom of the viewport; stacks buttons vertically if needed | Bar spans the full content width; buttons are inline-flex on the right |
| **GlobalConfigCard** | Single-column layout; labels stacked above inputs | Two-column label + input layout within each group card |
| **TradeGrid** | Horizontally scrollable `<div>` wrapping the table; columns freeze at `min-w-[120px]` | Full-width table; all 7 editable columns visible simultaneously |
| **IntensityMatrix** | Horizontally scrollable container; sticky first column (permit_type) | Full-width grid; all structure_type columns visible |

**Touch targets:** All interactive elements (buttons, inputs, editable cells, sliders) must maintain a minimum tap target of 44 × 44 px (enforced via `min-h-11` / `h-11` Tailwind classes and tested in `control-panel.ui.test.tsx` at 375px viewport).

---

## Operating Boundaries

### Target Files

| Layer | File(s) |
|-------|---------|
| **Database migration** | `migrations/097_control_panel_final.sql` |
| **Shared types + DB helpers** | `src/lib/admin/control-panel.ts` |
| **API routes** | `src/app/api/admin/control-panel/configs/route.ts`, `src/app/api/admin/control-panel/resync/route.ts` |
| **Feature module** | `src/features/admin-controls/**` (store, api hooks, components, lib) |
| **Page + error boundary** | `src/app/admin/control-panel/page.tsx`, `src/app/admin/control-panel/error.tsx` |
| **Hub tile** | `src/app/admin/page.tsx` |
| **Tests** | `src/tests/control-panel.*.test.{ts,tsx}` |
| **Factories** | `src/tests/factories.ts` (appended — no existing code modified) |
| **Contracts** | `docs/specs/_contracts.json` |

### Out-of-Scope Files

- `scripts/lib/config-loader.js` — read-only reference; dual code path discipline forbids modifications from this spec's UI work. Only add fallback keys when the DB migration adds new rows.
- `scripts/compute-cost-estimates.js`, `scripts/compute-trade-forecasts.js`, etc. — pipeline scripts are not modified by the Control Panel UI; the resync endpoint spawns them unchanged via the existing chain runner.
- Existing admin pages (`admin/data-quality/`, `admin/market-metrics/`, `admin/lead-feed/`) — grandfathered `useState`+`fetch` pattern; harmonization is a separate WF2.
- `trade_sqft_rates` physical merge into `trade_configurations` — future WF2; the UI JOINs the tables and presents them as one grid but does not perform the data migration.

### Cross-Spec Dependencies

| Spec | Dependency |
|------|-----------|
| `docs/specs/pipeline/47_pipeline_script_protocol.md` | Resync endpoint fires scripts that must follow the §12 script protocol |
| `docs/specs/product/future/83_lead_cost_model.md` | `commercial_shell_multiplier`, `placeholder_cost_threshold`, `income_premium_tiers` directly feed this model |
| `docs/specs/product/future/85_trade_forecast_engine.md` | `bid_phase_cutoff`, `work_phase_target`, `imminent_window_days`, stall penalties all configure this engine |
| `docs/specs/00_engineering_standards.md §12` | Frontend Foundation Tooling (Zustand, TanStack Query, RHF+Zod, Shadcn) enforced |
| `docs/specs/_contracts.json` | Numeric thresholds for 18 logic_variables + 7 trade_config columns mapped here |
