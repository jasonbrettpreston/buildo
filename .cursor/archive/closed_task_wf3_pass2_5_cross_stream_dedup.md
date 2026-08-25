# Active Task: WF3 #1 — Finding A — Cross-stream timeline duplicate permit row
**Status:** Implementation
**Workflow:** WF3 — Pass-2.5 finding from §7a Inspector spot-check
**Domain Mode:** Backend/Pipeline (admin API)
**Tracked in:** `docs/reports/pipeline-validation/wf3-queue.md` row A

## Context
- §7a Inspector spot-check on permit `25 237692 PLB--00` (a permit linked to CoA `B0030/26TEY`) showed the cross-stream timeline returning the **same `lifecycle_status_history` row twice** for the permit:
  ```
  2026-05-19T18:28:51 | permit | None → Permit Issued | permit:25 237692 PLB:00
  2026-05-19T18:28:51 | permit | None → Permit Issued | permit:25 237692 PLB:00  ← DUPLICATE
  2026-05-20T01:05:05 | coa    | None → Approved with Conditions | coa:B0030/26TEY
  ```
- 12-permit sample confirms: **every** CoA-linked permit (4/4 in the sample) produces this duplicate — 100% reproducible.
- DB cross-check: `lifecycle_status_history` has **exactly 1 row** for `permit:25 237692 PLB:00`. The duplicate is created by the SQL query, not the data.

## Root cause
`COA_CROSS_STREAM_SQL` (`src/lib/leads/lead-inspect-query.ts:683-705`) is a 3-arm UNION ALL:
- Arm 1: `WHERE lead_id = $1` (the active lead)
- Arm 2: `WHERE $2::text IS NOT NULL AND lead_id LIKE 'permit:' || $2::text || ':%'` (all permit revisions for the permit_num)
- Arm 3: `WHERE $3::text IS NOT NULL AND lead_id = $3::text` (the linked CoA)

When fetchLeadInspect is called on a **permit** that's linked to a CoA (e.g. `25 237692 PLB:00`):
- `$1 = 'permit:25 237692 PLB:00'`
- `$2 = '25 237692 PLB'` (permit_num for Arm 2)
- `$3 = 'coa:B0030/26TEY'`

Arm 1 matches `permit:25 237692 PLB:00` → 1 row.
Arm 2's `LIKE 'permit:25 237692 PLB:%'` also matches `permit:25 237692 PLB:00` → same row again.
Result: duplicate.

DeepSeek flagged this in the prior `8c6a9bc` review. I rejected it incorrectly on the assumption that `fetchCoaPanel` is only called with `$1 = 'coa:...'`. That assumption was wrong — `fetchCoaPanel` is also called for permits with `linked_coa_application_number` set.

## Proposed fix (with plan-review folds)
Add `AND lead_id <> $1` to Arm 2 (primary fix) + Arm 3 (defense-only) + cheap empty-string guard from DeepSeek MED.

```sql
UNION ALL
-- Arm 2: all permit revisions for the linked permit_num.
-- $1 is always set to the canonical activeLeadId (`permit:NUM:REV` or `coa:APP`)
-- per fetchCoaPanel callsite. The `lead_id <> $1` exclusion prevents Arm 1
-- and Arm 2 from both emitting the active permit's own ledger row (the
-- duplicate that this WF3 fixes). Empty-string guard added per DeepSeek
-- plan-review — $2='' would otherwise let `LIKE 'permit::%'` through.
SELECT lead_id, 'permit', from_status, to_status, transitioned_at::text, id::int
  FROM lifecycle_status_history
 WHERE $2::text IS NOT NULL
   AND $2::text <> ''
   AND lead_id LIKE 'permit:' || $2::text || ':%' ESCAPE '\\'
   AND lead_id <> $1
UNION ALL
-- Arm 3: cross-stream coa lead. The `lead_id <> $1` guard here is paranoid
-- defense-in-depth — $1 is always `permit:...` or `coa:APP` matching this
-- arm's own lead, never the OTHER stream's. Independent plan-review marked
-- this as unreachable but harmless; kept for future-proofing.
SELECT lead_id, 'coa', from_status, to_status, transitioned_at::text, id::int
  FROM lifecycle_status_history
 WHERE $3::text IS NOT NULL
   AND lead_id = $3::text
   AND lead_id <> $1
```

## Test plan
Extend `src/tests/lead-inspect-query.infra.test.ts` (the Pass-2 §7 Surface 1 describe block) with whitespace-tolerant regex assertions:
1. `COA_CROSS_STREAM_SQL` Arm 2 has `lead_id <> $1` exclusion
2. `COA_CROSS_STREAM_SQL` Arm 3 has the same exclusion (defense-in-depth)
3. Arm 2 has `$2::text <> ''` empty-string guard (DeepSeek plan-review fold)
4. Count of `lead_id <> $1` occurrences is exactly 2 (catches future drift where someone removes one)

Regex uses `\s+` between tokens for whitespace tolerance (DeepSeek plan-review #5 fold).

These are source-shape regression-locks — Red Light against current code, Green Light after fix.

## Standards Compliance
- Spec 76 §3.5 (Inspector contract): cross_stream_timeline should not duplicate rows.
- §2 Error Handling: no new catch blocks.
- §6 Logging: unchanged.

## Execution Plan
- [ ] **Adversarial PLAN review** — DeepSeek + Independent code-reviewer evaluate the plan BEFORE implementation. Validate that the `AND lead_id <> $1` fix is sound and doesn't have hidden side effects (e.g., when $1 doesn't follow the canonical `permit:X:Y` shape, when LIKE matching introduces wildcards).
- [ ] **User authorization gate**
- [ ] Red Light: 2 new tests asserting the SQL has the `lead_id <> $1` guard in both arms
- [ ] Implementation: 2-line SQL change in COA_CROSS_STREAM_SQL
- [ ] **Adversarial IMPL review** — DeepSeek + Independent on the diff
- [ ] Green Light: tests + typecheck pass
- [ ] Verify via live API: `curl /api/admin/leads/inspect/25%20237692%20PLB--00` shows 1 permit row (not 2) in cross_stream_timeline
- [ ] Commit + push; update wf3-queue.md row A to "closed"

## Operating Boundaries
- Target: `src/lib/leads/lead-inspect-query.ts` (2 LOC SQL change in COA_CROSS_STREAM_SQL block)
- Target: `src/tests/lead-inspect-query.infra.test.ts` (2 new assertions ~15 LOC)
- Out of scope: any other finding (B-K + L); other SQL blocks; UI rendering changes
