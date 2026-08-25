# Close-Stale Permits — One-Off Backlog Drain (2026-07-07)

**Operator:** Brett (user-authorized one-off) · **DB:** local `buildo` (dev)
**Script:** `scripts/close-stale-permits.js` · **Spec:** `docs/specs/01-pipeline/41_chain_permits.md` (step 3, `close_stale_permits`)

## Context

Tonight's P7 permits-chain run had `close_stale_permits` **FAIL its fail-safe**:
`would_close = 40,402` = **15.98 %** of 252,753 permits, exceeding the **10 %** abort
bound. A ~12-day dev-run gap accumulated the backlog; the fail-safe correctly modified
**0 rows** (verdict FAIL, no data touched). User decision: one-off bound raise to drain,
then restore.

## Bound Mechanism (as found)

- The abort bound is logic variable **`stale_closure_abort_pct`**, sourced from the
  `logic_variables` DB table via `loadMarketplaceConfigs()` (fallback = seed default
  in `scripts/seeds/logic_variables.json`, default **10**, min 1 / max 50).
- Validated by the script's Zod schema `stale_closure_abort_pct: z.coerce.number().finite().positive()`.
- Abort test (`close-stale-permits.js:96`): `if (pendingClosedRate >= abortPct) { … return; }`.
- **No env override / `--force` / documented runbook flag exists.** The only sanctioned
  lever is the `logic_variables` value → mechanism used = a **temporary `logic_variables`
  UPDATE**, no code change, fully restorable.

## Close Semantics & Reversibility (verified before acting)

- Step 1 (`:127`): `UPDATE permits SET status='Pending Closed',
  completed_date=COALESCE(completed_date, CURRENT_DATE)
  WHERE status NOT IN ('Pending Closed','Closed') AND last_seen_at < <last_load>`.
- Step 2 (`:145`): promote `Pending Closed` with `completed_date < NOW() - grace_days`
  (30) to `Closed`.
- **Reversible.** `permits` PK = `(permit_num, revision_num)`. Triggers on the table
  (`set_updated_at`, `trg_permits_lead_id` [fires only on permit_num/revision_num change],
  `trg_permits_set_location` [fires only on lat/long change]) are all benign for a
  status/completed_date update — **no cascade**. Restore = write `status` +
  `completed_date` back from the backup, keyed on the PK.

## Actions & Counts

| Step | Result |
|------|--------|
| Backup | `CREATE TABLE _backup_close_stale_20260707 (permit_num, revision_num, status, completed_date)` from the script's own would-close predicate — **40,402 rows** captured (all had `completed_date IS NULL`; original statuses: Inspection 23,653 / Permit Issued 11,847 / Revision Issued 2,425 / Revocation Pending 522 / …). |
| Raise bound | `logic_variables.stale_closure_abort_pct` **10 → 25** (DB UPDATE). |
| Drain run | `node scripts/close-stale-permits.js` → verdict **PASS**, `pending_closed = 40,402`, `promoted_to_closed = 0` (all newly-marked rows got `completed_date = CURRENT_DATE`, so none are >30d old), `pending_closed_rate = 16.0 % < 25 %`. No crash; audit rows honest. |
| Post-drain state | `Pending Closed = 40,402`, `Closed = 3` (pre-existing). All 40,402 carry `completed_date = 2026-07-08` (DB UTC clock). |
| **Restore bound** | `logic_variables.stale_closure_abort_pct` **25 → 10** — **verified live** (`SELECT` returns 10). |
| Confirm clean | Re-ran the script at the restored 10 % bound → verdict **PASS**, `would_close = 0`, `pending_closed_rate = 0.0 % < 10 %`, **no fail-safe trip**. Backlog drained. |

Residual would-close after drain: **0**.

## Downstream Lifecycle Expectation — and a Caveat

- **Rule (confirmed):** `status = 'Pending Closed'` → `classifyLifecyclePhase()` **Rule 4 /
  `WINDDOWN_P19_SET`** (`scripts/lib/lifecycle-phase.js:39-46`, `506-515`) → phase **P19**
  (wind-down terminal). The 3 `Closed` rows → **Rule 3 / `TERMINAL_P20_SET`** → **P20**.
  Not null-by-design; they map to a valid terminal wind-down phase. Spot-checked 5 drained
  permits through the classifier — all returned `phase=P19, rule=4, stalled=false`.

- **CAVEAT / follow-up candidate (not fixed here):** The drained permits will **NOT** be
  re-classified on the next incremental classify run. `classify-lifecycle-phase.js` dirty
  predicate (`:1105-1107`) is `lifecycle_classified_at IS NULL OR last_seen_at >
  lifecycle_classified_at OR matched_rule IS NULL`. `close-stale-permits.js` changes
  `status`/`completed_date` but **does not advance `last_seen_at`**; for all 40,402 rows
  `lifecycle_classified_at` is already ≥ `last_seen_at` and `matched_rule` is populated →
  **0 of 40,402 are dirty**. Their `lifecycle_phase` therefore stays frozen at the last
  active-status value (P18 17,976 / O3 10,015 / P7c 7,235 / … ; only the 645 whose prior
  status was itself a P19 status already read P19). Realizing the P19 mapping requires the
  permit to reappear in-feed (load-permits bumps `last_seen_at` → dirty) or a forced/backfill
  reclassify. This is a **pre-existing pipeline characteristic** (close-stale ↔ classifier
  incremental-key mismatch), not a defect introduced by this drain — flagged for a possible
  WF3 follow-up.

## Restore / Rollback Assets

- Backup table `_backup_close_stale_20260707` retained in the dev DB for reversal:
  `UPDATE permits p SET status = b.status, completed_date = b.completed_date
   FROM _backup_close_stale_20260707 b
   WHERE p.permit_num = b.permit_num AND p.revision_num = b.revision_num;`
- `stale_closure_abort_pct` restored to 10 (seed default unchanged; no code/config file edited).

**Not pushed** (per instruction).

## Addendum — lifecycle completion (orchestrator, 2026-07-07)
The drained rows were not dirty by the classifier's incremental predicate (close-stale changes status, not last_seen_at). Completed the drain's intent: `UPDATE permits SET matched_rule = NULL` scoped to the backup table (40,402), then one standalone `classify-lifecycle-phase` run — all 40,402 reclassified to **P19** via rule 4 (verdict PASS, 39,757 transitions ledgered, stalled_count 33,877 → 23,754 as closed permits left the stall set). The next forecast run closes their windows. Root-cause follow-up filed: close-stale should mark its rows dirty itself.
