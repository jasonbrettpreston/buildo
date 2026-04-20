# Active Task: WF3 — Coverage Script False FAILs + CoA lifecycle_stalled NULL
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `568edec59cb09d6728acb106a1190498eb8ba3e2`

## Context
* **Goal:** Eliminate five false FAIL alerts across `assert-global-coverage.js` (permits + CoA chains) and fix the missing boolean write in `classify-lifecycle-phase.js`.
* **Target Spec:** `docs/specs/pipeline/49_data_completeness_profiling.md`
* **Key Files:**
  - `scripts/quality/assert-global-coverage.js`
  - `scripts/classify-lifecycle-phase.js`
  - `src/tests/assert-global-coverage.infra.test.ts`
  - `src/tests/classify-lifecycle-phase.infra.test.ts`

## Bug List
- **Bug 1:** `completed_date` at Step 2 uses `permitsTotal` denominator → 5.6% FAIL. Structural sparsity — active permits cannot have completed dates.
- **Bug 2:** Seven naturally sparse fields (street_direction, building_type, category, owner, council_district, ward, builder_name) use coverageRow with 90% PASS threshold → FAIL.
- **Bug 3:** CoA `lifecycle_phase` coverage uses `coaTotal` (32,920) denominator → 0.6% FAIL. Classifier only assigns P1/P2 to unlinked CoA apps; correct denominator = `COUNT(*) WHERE linked_permit_num IS NULL`.
- **Bug 4:** Pre-permit coverage >100% (147/145 = 101.4%) because `approvedUnlinked` shrinks as CoAs link after pre-permit creation. Fix: denominator = all approved CoA apps; numerator = COUNT(DISTINCT permit_num).
- **Bug 5:** `coa_applications.lifecycle_stalled` NULL for pre-migration-094 records. Dirty filter skips them (no last_seen_at change). Fix in classify script: add `OR lifecycle_stalled IS NULL` to dirty filter. Fix in coverage script: count IS NOT NULL (not = true).

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script wrapper
* **Unhappy Path Tests:** N/A — regex-based infra tests
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] Rollback Anchor: `568edec`
- [x] State Verification: Source reading complete
- [ ] Reproduction: Add failing infra tests (Red Light)
- [ ] Red Light: Run tests MUST fail
- [ ] Fix: implement in both scripts
- [ ] Pre-Review Self-Checklist: sibling bugs check
- [ ] Green Light: npm run test && npm run lint -- --fix
