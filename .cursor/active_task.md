# Active Task: WF2 — Bug Rubric Phase 0 (Archetype Taxonomy + Exemption Pruning)
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `da4a36f`

## Context
* **Goal:** Rewrite `docs/reports/15_bug_rubric_evaluation.md` to apply archetype taxonomy and exemption rules, replacing ~60% false positive FAILs with EXEMPT, and incorporating fixes already applied this session.
* **Target Spec:** `docs/reports/15_bug_rubric_evaluation.md` (report, not a feature spec)
* **Key Files:** `docs/reports/15_bug_rubric_evaluation.md`

## Technical Implementation
* **New/Modified Components:** Rewrite the evaluation report with:
  1. Archetype taxonomy header (4 groups with script assignments)
  2. Exemption rules (A-E) documented
  3. All 8 category tables updated: FAIL→EXEMPT where rules apply, FAIL→PASS for this-session fixes
  4. Summary section with true debt baseline grouped by priority

### This-Session Fixes to Reflect as PASS
| Script | Bugs Fixed |
|--------|-----------|
| classify-inspection-status.js | B13 (rowCount→RETURNING), temporal logic, cross-revision, terminal states |
| classify-permit-phase.js | B13 (rowCount→rows.length), cross-revision, epoch dates, CDC |
| classify-permits.js | B13 (rowCount→RETURNING), N+1 ghost cleanup, VACUUM removed |

### Exemption Rules to Apply
| Rule | Bugs | Applies To | Exempt |
|------|------|-----------|--------|
| A (Spatial) | B10, B11, B12 | GIS scripts only (massing, parcels, neighbourhoods, centroids) | All others |
| B (Mutation) | B13, B16, B18 | Ingestors + Mutators only | Observers |
| C (Pagination) | B1, B3 | Mutators + Incremental Ingestors only | Scrapers, Observers |
| D (Rate Limit) | B17 | Scrapers only | All internal |
| E (Deep Metrics) | B19-B23 | Ingestors, Mutators, Scrapers | Observers |

### WF5 Validation Findings to Incorporate
| Bug | Rubric Claims | Verified Real | False Positive Rate |
|-----|--------------|---------------|-------------------|
| B1 (OFFSET) | 8 FAIL | 1 (reclassify-all.js) | 87.5% |
| B6 (Orphaned DB) | 9 FAIL | 0 | 100% |
| B11 (Bounding Box) | 25+ FAIL | 3 spatial scripts | 88% |
| B13 (rowCount) | ~15 FAIL | 7 genuine (3 fixed this session) | ~53% |
| B18 (Transactions) | ~30 FAIL | 1 (classify-permit-phase, intentional) | ~97% |

## Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — documentation only
* **Unhappy Path Tests:** N/A
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [ ] **State Verification:** Document WF5 audit findings
- [ ] **Spec Update:** N/A — this IS the report
- [ ] **Implementation:** Rewrite 15_bug_rubric_evaluation.md with taxonomy, exemptions, verified statuses, and true debt summary
- [ ] **Green Light:** `npm run test` (no code changes, sanity check)
