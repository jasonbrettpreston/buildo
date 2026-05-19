# Active Task: WF3 — fix `ca.permit_type` SQL reference in classify-lifecycle-phase.js CoA dirty SELECT
**Status:** Implementation (Independent APPROVE + DeepSeek findings #1-#2 documented as considered/rejected; #3-#8 filed as separate WFs)
**Workflow:** WF3 — per-finding fix from Spec 79 SUMMARY.md (CRIT-1 Bug 2; user authorized 2026-05-19; + adversarial review per user request)
**Domain Mode:** Backend/Pipeline

---

## Context

* **Goal:** Fix the SQL `column ca.permit_type does not exist` error in the CoA dirty-rows SELECT in `scripts/classify-lifecycle-phase.js`. The query references a column on `coa_applications` that was never added.
* **Surfaced by:** Spec 79 pipeline validation Step 21 Bug 2 (2026-05-19 run). After the TDZ fix (WF3 #1, commit `e292c7b`) unblocked the permit-side path, the script now crashes when it tries to read CoA dirty rows.
* **Target Spec:** `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` (Phase E.2/E.3 contracts).

## Reproduction

Direct script invocation:
```
node scripts/classify-lifecycle-phase.js
→ error: column ca.permit_type does not exist
   severity: ERROR  code: 42703  routine: errorMissingColumn
   at scripts/classify-lifecycle-phase.js:1331
```

Schema verification (information_schema query on `coa_applications`):
- **PRESENT:** `coa_type_class`, `lead_id`, `neighbourhood_id`, `project_type`
- **ABSENT:** `permit_type`

## Root cause

`scripts/classify-lifecycle-phase.js:1331` reads `ca.permit_type` from `coa_applications` inside the CoA dirty-rows SELECT:

```sql
SELECT ca.id, ca.lead_id, ca.decision, ca.linked_permit_num, ca.status,
       ca.last_seen_at, ca.lifecycle_phase AS old_phase, ca.lifecycle_seq AS old_seq,
       ca.matched_status AS old_matched_status,
       ca.permit_type,            -- LINE 1331 — column DOES NOT EXIST
       ca.project_type, ca.coa_type_class, ca.neighbourhood_id, ...
  FROM coa_applications ca
```

Git blame: `ca.permit_type` introduced in commit `ad0c178` (Phase E.2 — classify-lifecycle-phase consumer rewrite). Phase E.3 (commit `9902860`) then formalized the 5-tuple cohort key `(permit_type, project_type, coa_type_class, from_seq, to_seq)` for `phase_stay_calibration` per migration 147, with **`permit_type IS NULL` for CoA-side rows** (CoA records have no permit type).

The query SQL was written assuming `coa_applications` had a `permit_type` column to read. But the design says CoA-side has NULL permit_type — so the column was never added. The SQL is reading a column that was never supposed to exist on this table.

## Three fix options (recap from SUMMARY.md)

| Option | Change | Effort | Design fit |
|---|---|---|---|
| **A (recommended)** — literal NULL | `ca.permit_type` → `NULL::text AS permit_type` at line 1331 | XS (1 line) | Matches Phase E.3 §3.6.A intent — CoA-side has NULL permit_type per mig 147 |
| B — JOIN to permits | Add `LEFT JOIN permits p ON p.lead_id = ca.linked_permit_num`; read `p.permit_type` | M (~10 LOC, design conversation) | CoA-derives-from-permit (Phase D R5.6) semantic; but cohort key still wants NULL per E.3 design |
| C — schema change | Add `permit_type` column to `coa_applications` + backfill | L (new migration) | Counter to Phase E.3 design — would force NON-NULL permit_type for CoAs |

**Proposed: Option A.** It's the smallest, matches Phase E.3 design intent (CoA rows have NULL permit_type in the 5-tuple cohort), and unblocks 4+ downstream validation findings (Steps 22, 23, 27, 28).

## Why this wasn't caught in tests

- Phase E.2 unit tests stub the SELECT result and don't go through the actual SQL
- No integration run exercises the CoA-dirty path on the real schema
- Phase E.3's calibration test uses fresh `phase_stay_calibration` rows with NULL permit_type but doesn't run through the dirty SELECT

## Proposed fix

Single line change at `scripts/classify-lifecycle-phase.js:1331`:

**Before:**
```sql
ca.permit_type,
```

**After:**
```sql
NULL::text AS permit_type,
```

Plus an inline comment explaining the Phase E.3 design intent.

## Test plan

Add a regression-lock test to `src/tests/classify-lifecycle-phase.infra.test.ts` asserting the CoA dirty SELECT contains `NULL::text AS permit_type` and does NOT contain `ca.permit_type`:

```js
it('CoA dirty SELECT uses NULL::text AS permit_type, not ca.permit_type (Phase E.3 §3.6.A design — CoA cohorts have NULL permit_type)', () => {
  const src = readFileSync('scripts/classify-lifecycle-phase.js', 'utf-8');
  // The CoA SELECT must NOT read ca.permit_type (column doesn't exist)
  expect(src).not.toMatch(/^\s*ca\.permit_type,/m);
  // It MUST emit the NULL literal for the 5-tuple cohort key
  expect(src).toMatch(/NULL::text\s+AS\s+permit_type/);
});
```

## Execution Plan (WF3 — `.claude/workflows.md`)

- [x] **Spec Touchpoint:** Spec 84 Phase E.2 / E.3 design intent — CoA-side has NULL permit_type per migration 147
- [x] **Reproduction / Verification:** confirmed via direct script invocation + information_schema query
- [ ] **Test First:** add regression-lock test to `classify-lifecycle-phase.infra.test.ts`
- [ ] **Red Light:** new test fails against current code (because `ca.permit_type,` matches the negation)
- [ ] **Implementation:** 1-line SQL change at scripts/classify-lifecycle-phase.js:1331 + inline comment
- [ ] **Multi-Agent Review:** Independent code-reviewer + DeepSeek adversarial (per user request)
- [ ] **Green Light:** `npm run typecheck && npm run test`
- [ ] **WF6 close-out:** single commit; archive task

## Operating Boundaries

* **Target files:** `scripts/classify-lifecycle-phase.js` (1 line) + `src/tests/classify-lifecycle-phase.infra.test.ts` (1 regression-lock test)
* **Out-of-scope:**
  - Option B (LEFT JOIN to permits) — different design conversation, not needed if Option A satisfies Phase E.3 design
  - Option C (schema migration) — explicitly counter to Phase E.3
  - Other Step 21 findings — separately addressed

## Reviewer triage (Independent APPROVE + DeepSeek ESCALATE folded)

**Independent code-reviewer (APPROVE):** verified Phase E.3 design intent via `migrations/147_phase_stay_calibration_drop_legacy_pk.sql`: the migration *explicitly* DROPS NOT NULL on `phase_stay_calibration.permit_type` precisely so CoA-side rows can insert with `permit_type = NULL`. The 5-tuple cohort key with `NULLS DISTINCT` was redesigned around this. Option A is architecturally correct, not just expedient. Single occurrence of `ca.permit_type` confirmed at line 1337. Regression test design is sound (negation will match current code; positive will match post-fix).

**DeepSeek adversarial (ESCALATE 2 + 6 broader concerns) — triage:**

1. **DeepSeek CRIT #1 — "Option A causes CoA cohort collapse to (NULL, NULL, NULL, from_seq, to_seq) per §8.9":** REJECTED. DeepSeek conflates a current data-completeness gap (project_type / coa_type_class not yet populated for all CoAs) with the SQL fix. Even if downstream populations are incomplete, the fix here is to stop the script crashing. Cohort quality is a separate concern Phase D (CoA classification scripts) is responsible for populating — not this script. Independent specifically refuted this: the 5-tuple still has 5 dimensions (`project_type`, `coa_type_class`, `from_seq`, `to_seq`) carrying CoA identity; NULL `permit_type` is the *design*, not a gap.

2. **DeepSeek CRIT #2 — "Regression test is brittle source-grep":** PARTIALLY VALID, DEFERRED. The integration-test alternative DeepSeek proposes requires CKAN file fixtures from Phase I.1.1a's deferred work (same blocker as the SAVEPOINT trigger test currently `describe.skip`'d). Source-grep regression locks are the existing convention in this codebase pending fixture work. Adding to `review_followups.md` for fixture-based integration tests as a separate WF.

3-8. **DeepSeek HIGH/MED/LOW (Universal Stream 152-col table; phase-code collisions; CODE DRIFT; trade-mapping errors; bid_value inconsistencies):** SCOPE-CREEP. These are pre-existing design concerns about Spec 84 §2.5/§3/§8.5/§8.9 — orthogonal to this 1-line SQL fix. Documenting as separate WF candidates in `review_followups.md`. None block this fix.

**Decision:** proceed with Option A per Independent APPROVE. DeepSeek findings #1-#2 documented in record; #3-#8 filed as separate WF candidates.
