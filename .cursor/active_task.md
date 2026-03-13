# Active Task: Telemetry & Last Run Labelling with Expected Behavior Ranges
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** Add clear labels distinguishing "DB Mutations" (pg_stats telemetry) from "Script Records" (PIPELINE_SUMMARY), add descriptors explaining what each tile shows, and display expected behavior ranges per step so admins can immediately tell if values are normal.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/lib/admin/funnel.ts` — Add `STEP_EXPECTED_RANGES` constant with per-step expected values
  - `src/components/funnel/FunnelPanels.tsx` — Update `TelemetrySection` header/labels/descriptors + range indicators
  - `src/components/FreshnessTimeline.tsx` — Update Last Run tile header/labels/descriptors + pass expected ranges
  - `src/tests/quality.infra.test.ts` — Tests for expected ranges data and labelling

## Technical Implementation
* **New/Modified Components:**
  - `TelemetrySection` in `FunnelPanels.tsx` — renamed header, descriptor text, range badges
  - Last Run tile in `FreshnessTimeline.tsx` — renamed header, descriptor text, range badges
* **Data Hooks/Libs:**
  - `src/lib/admin/funnel.ts` — `STEP_EXPECTED_RANGES` constant + `RangeStatus` helper
* **Database Impact:** NO

## What Changes

### 1. `STEP_EXPECTED_RANGES` constant (`src/lib/admin/funnel.ts`)
Per-step expected ranges covering both SUMMARY and telemetry metrics:
```typescript
export interface ExpectedRanges {
  /** Brief explanation of what this step does and why its numbers look the way they do */
  behavior: string;
  /** Expected PIPELINE_SUMMARY values */
  summary?: {
    records_total?: [number, number];
    records_new?: [number, number];
    records_updated?: [number, number];
  };
  /** Expected pg_stats mutation counts per table */
  mutations?: Record<string, {
    ins?: [number, number];
    upd?: [number, number];
    del?: [number, number];
  }>;
  /** Expected T1 row count delta per table */
  row_delta?: Record<string, [number, number]>;
}
```
Plus a `getRangeStatus(value, range)` helper returning `'normal' | 'borderline' | 'anomaly'`.

### 2. TelemetrySection labelling (`FunnelPanels.tsx`)
- Header: "Last Run Telemetry" → **"DB State Changes"**
- Add subtitle descriptor: *"Observed database mutations from PostgreSQL stats counters (pg_stat_user_tables). These are raw SQL operation counts, not logical record counts."*
- T1 label: keep row count display, add range indicator badge if expected range defined
- T2 labels: "Ins"/"Upd"/"Del" → **"SQL Inserts"/"SQL Updates"/"SQL Deletes"** with range badge
- Add behavior note from `STEP_EXPECTED_RANGES[slug].behavior` when available

### 3. Last Run tile labelling (`FreshnessTimeline.tsx`)
- Header: "Last Run" → **"Script Output"**
- Add subtitle descriptor: *"Values self-reported by the pipeline script via PIPELINE_SUMMARY. These represent the script's logical view of what it processed."*
- "Records" → **"Total Processed"**
- "New/Changed" → **"New / Changed"** (keep)
- "Updated" → **"Updated"** (keep)
- Add range indicator badges when expected ranges are defined
- Add behavior note from `STEP_EXPECTED_RANGES[slug].behavior`

### 4. Range indicator badge
A small inline badge next to values:
- **Green** `✓ expected` — value within defined range
- **Yellow** `⚠ borderline` — value within 20% of range boundary
- **Red** `✗ anomaly` — value outside expected range
- **Gray** `no baseline` — no expected range defined (no badge shown)

### 5. Expected ranges for all steps (based on actual DB telemetry data)
Populate ranges from observed pipeline_runs data. Examples:
- `neighbourhoods`: summary total=[155,165], mutations upd=[1800,2500], behavior="Census enrichment fires ~2054 UPDATEs across 8 demographic characteristics × 158 neighbourhoods. High update count is normal."
- `permits`: summary total=[235000,245000], summary new=[0,5000]
- etc. for all steps with telemetry

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified
* **Unhappy Path Tests:** Test that STEP_EXPECTED_RANGES covers all telemetry-enabled steps; test getRangeStatus logic
* **logError Mandate:** N/A
* **Mobile-First:** Descriptor text and range badges use responsive text sizes; badges wrap on narrow viewports via flex-wrap

## Execution Plan
- [ ] **State Verification:** Query pipeline_runs for actual observed ranges per step to populate STEP_EXPECTED_RANGES with real data
- [ ] **Contract Definition:** N/A — no API changes
- [ ] **Spec Update:** Update docs/specs/28_data_quality_dashboard.md with labelling changes. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no DB changes
- [ ] **Guardrail Test:** Add tests: STEP_EXPECTED_RANGES covers all telemetry steps, getRangeStatus returns correct status, TelemetrySection has descriptor label, Last Run tile has descriptor label
- [ ] **Red Light:** Verify new tests fail
- [ ] **Implementation:**
  1. Add `ExpectedRanges` interface, `STEP_EXPECTED_RANGES` constant, and `getRangeStatus()` to `src/lib/admin/funnel.ts`
  2. Update `TelemetrySection` in `FunnelPanels.tsx`: new header, descriptor, range badges, behavior note
  3. Update Last Run tile in `FreshnessTimeline.tsx`: new header, descriptor, range badges, pass `expectedRanges` and `stepSlug` to TelemetrySection
  4. Populate expected ranges from real pipeline_runs data
- [ ] **UI Regression Check:** `npx vitest run src/tests/admin.ui.test.tsx`
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
