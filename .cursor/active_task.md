# Active Task: Root Directory & .gitignore Cleanup
**Status:** Implementation
**Workflow:** WF2 — Chore

## Context
* **Goal:** Clean up root directory pollution (zero-byte accident files, loose temp outputs, duplicate .gitignore entries) and harden .gitignore to prevent future clutter. NOT restructuring scripts/ (too risky — requires manifest.json + package.json + test path updates).
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md` (tangential — general repo hygiene)
* **Key Files:**
  - `.gitignore` — consolidate data file rules, add temp output patterns
  - Root directory — delete zero-byte accidents, move loose markdown reports

## Technical Implementation
* **New/Modified Components:** None
* **Data Hooks/Libs:** None
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [ ] **Delete zero-byte accident files:** `nul`, `GEO_ID`, `pipeline_meta`, `telemetry`, `pt.classified_at`
- [ ] **Delete temp outputs:** `audit-out.txt`, `report_output.txt`, `schema.json`, `schema.txt`, `stats_check.json`, `stats_tmp.json`, `stats_tmp2.json`, `test_output.json`, `test_output.txt`, `test_output_feb.json`, `lot_size_accuracy.json`, `massing_data.json`
- [ ] **Delete ad-hoc root scripts:** `test-metrics.ts`, `test-metrics-feb.ts`
- [ ] **Delete ad-hoc scripts in scripts/:** `scripts/dump-schema.ts`, `scripts/append-audit-table.ts`, `scripts/check-pipeline-status.js`
- [ ] **Move loose root reports to docs/reports/:** `permit_concepts_report.md`, `01_spec_enforcement.md`, `BUILD_PROGRESS.md`, `engineering_workflows.md`
- [ ] **Harden .gitignore:** Add patterns for temp outputs, data directory, zip files, ad-hoc dumps
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
