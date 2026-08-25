# Active Task: WF3 — fix backfill-realtor-permit-trades audit_table emission
**Status:** Implementation (v2 — folded DeepSeek MED #1 + MED #2 + NIT; HIGH refuted)
**Workflow:** WF3 — per-finding fix from Spec 79 SUMMARY.md (HIGH-1; user authorized 2026-05-19; + adversarial DeepSeek)
**Domain Mode:** Backend/Pipeline

---

## Context

* **Goal:** Fix `scripts/backfill-realtor-permit-trades.js` so `pipeline_runs.records_meta.audit_table` is populated per Spec 48 §3.6 contract (FreshnessTimeline + observe-chain narrative read `audit_table`, not custom keys).
* **Surfaced by:** Spec 79 Step 14 validation — SDK emitted warning *"emitSummary called with no audit_table — admin UI will show UNKNOWN verdict. Wire a real audit_table for meaningful observability."*
* **Target Spec:** Spec 48 §3.6 (audit_table standard contract).

## Reproduction

Step 14 validation output (`pipeline_runs.id` from this validation cycle):
- `audit_table.verdict` field — empty/UNKNOWN
- `records_meta` exists with a `backfill` nested object (with phase/name/verdict/rows)
- SDK explicitly warned: *"admin UI will show UNKNOWN verdict"*

The script DOES build a proper audit-table-shaped structure (with phase, name, verdict, rows) — but nests it under `records_meta.backfill` instead of `records_meta.audit_table`. The SDK + observers look for `records_meta.audit_table` specifically; the `backfill` key is invisible to them.

## Root cause

`scripts/backfill-realtor-permit-trades.js:257` opens `records_meta: { backfill: { ... } }` where `backfill` should be `audit_table`. The structure inside is correct (phase, name, verdict, rows). Pure key naming mistake.

Verified: no other script uses `records_meta.backfill` as a custom key. This is unique to this script.

## Proposed fix

Rename `backfill` → `audit_table` in the `records_meta` block at line 257. Verify the inner structure (phase, name, verdict, rows) matches Spec 48 §3.6 + Spec 47 §8.2 contract.

```js
// Before
records_meta: { backfill: { phase: 91, name: '...', verdict: ..., rows: [...] } }

// After
records_meta: { audit_table: { phase: 91, name: '...', verdict: ..., rows: [...] } }
```

The verdict is already row-derived via the `coverageOk && completedNaturally` ternary (line 252) — that's a parallel boolean pattern rather than the row-derived cascade. Spec 79 v8 §3a calls this out as a Spec 48 §3.6 anti-pattern (verdict cascade not row-derived), but fixing the cascade pattern is OUT OF SCOPE for this WF3 — the immediate fix is the key-naming issue. Per `[[feedback_wf3_granularity]]` one finding per WF3; cascade-pattern fix tracked as a follow-up.

## Test plan

Add regression-lock test to `src/tests/quality.infra.test.ts` asserting:
1. `records_meta.audit_table` block exists in the emitSummary call
2. `records_meta.backfill` does NOT exist (regression-lock against re-introducing the key)

## Standards Compliance

* **Spec 48 §3.6:** audit_table standard contract — this fix restores compliance
* **Spec 47 §8.2:** audit_table row construction — preserved (no row changes)
* **Spec 47 §11:** counter semantics — unchanged

## Execution Plan

- [x] Spec touchpoint: Spec 48 §3.6
- [x] Reproduction: Step 14 SDK warning + records_meta.backfill key
- [ ] **Red Light:** add regression-lock test; verify FAIL against current code
- [ ] **Implementation:** rename `backfill` → `audit_table` in records_meta
- [ ] Multi-Agent Review: Independent + DeepSeek
- [ ] Green Light: typecheck + tests
- [ ] WF6 close-out: commit + archive

## Operating Boundaries

* **Target files:** `scripts/backfill-realtor-permit-trades.js` (1-line key rename) + `src/tests/quality.infra.test.ts` (regression-lock test)
* **Out-of-scope:**
  - Migrate parallel-boolean verdict to row-derived cascade per Spec 48 §3.6 (separate WF — wider impact)
  - Any logic changes in the script
  - Adding/removing audit_table.rows entries
