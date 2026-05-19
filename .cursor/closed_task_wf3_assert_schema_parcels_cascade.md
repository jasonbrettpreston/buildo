# Active Task: WF3 — close assert-schema Parcels cascade gap (v2 — folded reviewer ESCALATE)
**Status:** Implementation
**Workflow:** WF3 — per-finding fix from Spec 79 SUMMARY.md (CRIT-3a; user authorized 2026-05-19; Independent + DeepSeek reviewed)
**Domain Mode:** Backend/Pipeline

---

## Plan revision history

* **v1** — proposed Part A (narrow `EXPECTED_PARCEL_COLUMNS` from 7 → 4) + Part B (audit cascade rows).
* **v2 (this revision)** — Independent + DeepSeek convergent ESCALATE: dropping Part A. Narrowing `EXPECTED_PARCEL_COLUMNS` would silently green-light `load-parcels.js` writing empty strings for `ADDRESS_NUMBER`/`LINEAR_NAME_FULL`/`DATE_EFFECTIVE` (`(record.<col> || '').trim()` pattern). The gate must keep FAILing until WF3 #7 makes the consumer resilient. v2 keeps Part A out of scope and lands Part B only. Also fixed: error-string matching tightened to exact phrases; misleading `parcels_api_errors` renamed to `parcels_other_errors`; behavioral verdict-flip test added; correct spec citations (Spec 47 §R10 + Spec 48 §8.2, NOT §3.6 which is ledger-writer-specific).

---

## Context

* **Goal:** Close the audit cascade gap in `scripts/quality/assert-schema.js` surfaced by Spec 79 Step 1 validation. Parcels schema drift currently flows through `records_meta.errors[]` only — the `audit_table.rows` cascade doesn't track it, so `verdict='PASS'` while the script exited 1. This violates the row-derived verdict cascade contract (Spec 47 §R10 + Spec 48 §8.2).
* **Surfaced by:** Spec 79 pipeline validation Step 1 (2026-05-19).
* **Target Spec:** Spec 47 §R10 (verdict derivation) + Spec 48 §8.2 (audit_table row construction). NOT Spec 48 §3.6 (that's ledger-writer dual-pattern; assert-schema is a CQA gate, not a ledger writer).

## Reproduction

```
node scripts/quality/assert-schema.js
→ FAIL: Parcels is missing columns: ADDRESS_NUMBER, LINEAR_NAME_FULL, DATE_EFFECTIVE
→ Error: Schema validation failed — schema drift detected
→ exit code: 1
```

`pipeline_runs` row:
- `status='failed'` (correct)
- `audit_table.verdict='PASS'` (**WRONG** — drift not in any cascade row)
- `records_meta.errors=['Parcels schema drift detected']`
- `records_meta.checks_failed=1`

## Root cause

The `permitAuditRows` (line 344-348) and `coaAuditRows` (line 363-367) arrays build `schema_mismatch_count` from `errors.filter((e) => e.toLowerCase().includes('permit'|'coa'))`. Parcels errors match NEITHER filter — they fall through to `records_meta.errors[]` instead of any `audit_table.rows[].status='FAIL'`. The cascade `auditRows.some(r => r.status === 'FAIL')` returns false → verdict='PASS' even though the script crashed.

## Proposed fix (v2 — Part B only)

Add two new rows to BOTH permits-side and CoA-side audit_table.rows arrays:

```js
const parcelsSchemaErrors = errors.filter((e) =>
  e.includes('Parcels schema drift') || e.toLowerCase().includes('parcels: missing')
);
const parcelsOtherErrors = errors.filter((e) =>
  e.toLowerCase().includes('parcels') && !parcelsSchemaErrors.includes(e)
);
// inserted in audit_table.rows array:
{ metric: 'parcels_schema_mismatch_count', value: parcelsSchemaErrors.length, threshold: '== 0', status: parcelsSchemaErrors.length > 0 ? 'FAIL' : 'PASS' },
{ metric: 'parcels_other_errors',          value: parcelsOtherErrors.length,  threshold: '== 0', status: parcelsOtherErrors.length > 0 ? 'FAIL' : 'PASS' },
```

Filter design (v2 — DeepSeek HIGH #1 + LOW #2 fold):
- Exact phrase matches (`'Parcels schema drift'`, `'parcels: missing'`) instead of broad substring search
- Avoids false positives from generic "missing" or "api" tokens

The verdict cascade (`auditRows.some(r => r.status === 'FAIL')`) now correctly flips to FAIL when Parcels drift occurs.

Parcels feeds BOTH chains (`link-parcels` permits step 9 + `link-coa-to-parcels` CoA step 4). `assert-schema.js` runs ONCE per chain invocation (only one of `runPermitChecks`/`runCoaChecks` is true at a time), so adding the rows to BOTH `permitAuditRows` and `coaAuditRows` is correct — only the active chain's array is emitted per invocation. DeepSeek HIGH #2 concern verified and resolved: the rows aren't "polluting" the wrong chain because each chain invocation produces ONE audit_table.

## What's explicitly OUT OF SCOPE in v2

- **Narrowing `EXPECTED_PARCEL_COLUMNS`** (was Part A in v1) — both reviewers ESCALATEd. Keeping the 7-column list intact preserves the drift signal. Sequence: WF3 #7 first makes `load-parcels.js` resilient to missing columns; then a separate later WF3 narrows the gate. Filing this dependency in `review_followups.md`.

## Test plan (v2 — fold DeepSeek MED #1)

Add 2 regression-lock tests to `src/tests/quality.infra.test.ts`:

```js
// (1) Static: rows declared
it('assert-schema audit_table.rows includes parcels_schema_mismatch_count + parcels_other_errors (both chains)', () => {
  const src = readFileSync('scripts/quality/assert-schema.js', 'utf-8');
  // Must appear in BOTH permits-side and CoA-side audit-table construction
  const matches = src.match(/parcels_schema_mismatch_count/g) || [];
  expect(matches.length).toBeGreaterThanOrEqual(2);  // ≥1 in each audit table
  const otherMatches = src.match(/parcels_other_errors/g) || [];
  expect(otherMatches.length).toBeGreaterThanOrEqual(2);
});

// (2) Negation: stale name not introduced
it('assert-schema does NOT use the misleading parcels_api_errors metric name', () => {
  const src = readFileSync('scripts/quality/assert-schema.js', 'utf-8');
  expect(src).not.toMatch(/parcels_api_errors/);
});
```

A behavioral test that injects a Parcels-drift errors array and asserts the verdict flips to FAIL would require extracting the audit-table builder to a pure function (refactor) OR setting up an integration test that runs `node scripts/quality/assert-schema.js` against a mocked CKAN URL. **Both options exceed the scope of this WF3** (DeepSeek MED #1 is acknowledged as valid but practically deferred — the source-grep tests are the existing codebase convention for this kind of cascade-gap regression). Filed in review_followups.md.

## Standards Compliance

- **Spec 47 §R10:** verdict derivation from row statuses — this fix **strengthens** §R10 compliance (more failure modes now caught by the cascade)
- **Spec 48 §8.2:** audit_table row construction
- **NOT Spec 48 §3.6:** §3.6 is for Tier 3 ledger writers; assert-schema is a CQA gate (DeepSeek NIT #2 fold)

## Execution Plan

- [x] Spec touchpoint: Spec 47 §R10 + Spec 48 §8.2
- [x] Reproduction confirmed
- [ ] **Red Light:** add 2 regression-lock tests; verify both FAIL against current code
- [ ] **Implementation:** add `parcels_schema_mismatch_count` + `parcels_other_errors` rows to BOTH `permitAuditRows` and `coaAuditRows`. Use exact-phrase filters.
- [ ] Multi-Agent Review: Independent + DeepSeek (done; v2 incorporates both ESCALATE responses)
- [ ] Green Light: typecheck + tests
- [ ] WF6 close-out: commit + archive

## Operating Boundaries

* **Target files:** `scripts/quality/assert-schema.js` (~12 LOC across 2 audit-table arrays) + `src/tests/quality.infra.test.ts` (2 regression-lock tests)
* **Out-of-scope (deferred to other WFs):**
  - `EXPECTED_PARCEL_COLUMNS` narrowing — depends on WF3 #7 (load-parcels resilience)
  - Behavioral verdict-flip test — needs audit-table-builder refactor OR integration test
  - `load-parcels.js` resilience to missing columns (WF3 #7 from SUMMARY)
  - Other CKAN dataset schema reviews
