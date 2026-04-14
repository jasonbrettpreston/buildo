# WF3 Sequencing — 80-86 Phase-1 Ship-Blockers

**Source:** `docs/reports/script_review_80_86/holistic/_TRIAGE.md` top 10 findings.
**Domain Mode:** Backend/Pipeline for all 10.
**Constraint:** Per CLAUDE.md Prime Directive §1, no `src/` code writes until the user authorizes each plan.

---

## Pre-requisite: 4 decisions needed BEFORE certain WF3s can start

These are spec-ownership choices the engineering team must resolve. Each blocks one or more WF3s.

| ID | Decision | Options | Blocks |
|---|---|---|---|
| D1 | **Alert delivery mechanism** (spec 82) | (a) INSERT into `notifications` table; (b) emit to a queue; (c) external webhook/email; (d) batch-dispatch downstream step | WF3-10 (H-W12) |
| D2 | **Commercial Shell "interior trades" subset** (spec 83) | (a) list specific trade slugs; (b) derive from trade_configurations flag; (c) all trades receive 0.60x on Shell permits | WF3-07 (H-W10) |
| D3 | **Orphan phase archive policy** (spec 84) | (a) archive-immediately when tracking (terminal-like); (b) assign ordinals so window-closed logic works; (c) custom routing branch | WF3-04 (H-W14) |
| D4 | **`permit_phase_transitions` fate** (spec 84 vs 86) | (a) wire 86 calibration to read transitions (spec 84 intent); (b) drop writes + table; (c) retain as observability-only + add admin UI | WF3-08 (H-W17) |

Each decision is a one-paragraph discussion. Stage them BEFORE the dependent WF3 enters implementation.

---

## Dependency graph

```
Phase 1 (parallel, no cross-deps within phase):
  ┌── WF3-01 (H-W7)  ::int rounding         [86 one-liner]
  ├── WF3-02 (H-W19) pipeline_schedules     [migration + run-chain]
  ├── WF3-03 (H-W1 + H-W2) locks + txn      [81, 82, 85, 86, run-chain]
  ├── WF3-04 (H-W14) orphan phases          [needs D3; shared lib + 82 + 85]
  └── WF3-05 (H-W13) imminent_window_days   [85; small]

Phase 2 (after Phase 1 complete):
  ├── WF3-06 (H-W8/W9) 83 dual-path         [83 JS + TS]
  ├── WF3-07 (H-W10) Commercial Shell       [needs D2; 83 JS + TS]
  └── WF3-08 (H-W17) transitions fate       [needs D4; scope varies]

Phase 3 (after Phase 2 complete — metrics must reflect fixed state):
  ├── WF3-09 (H-W18) audit_table umbrella   [4 sub-tasks: 81, 82, 85, 86]
  └── WF3-10 (H-W12) CRM alert delivery     [needs D1 + WF3-05 landed]
```

---

## Why this ordering

**Phase 1 is parallelizable.** The five items have no overlapping file conflicts if run in parallel feature branches:
- WF3-01 (`compute-timing-calibration-v2.js` L125–247 rounding casts) — isolated
- WF3-02 (migration + `run-chain.js` L84–92 + `pipeline_schedules` schema) — isolated
- WF3-03 (locks + transactions) — touches all 4 tail scripts AND run-chain; this is the largest single plan
- WF3-04 (shared lib `PHASE_ORDINAL` + `update-tracked-projects.js` + `compute-trade-forecasts.js`) — isolated after D3
- WF3-05 (`compute-trade-forecasts.js` urgency threshold) — small, isolated

**Phase 2 addresses correctness that depends on Phase 1 stability.** The 83 dual-path fix (W8/W9) needs transaction boundaries (W2) in place first so the porting of Liar's Gate to TS doesn't break the existing pipeline during the migration window. W10 requires D2.

**Phase 3 ships observability last.** Audit tables and CRM alert delivery only make sense once the underlying data is correct. Shipping audit thresholds before fixing `records_updated` (W21) or before ::int truncation (W7) would bake wrong baselines into the PASS/WARN gates.

**H-W12 (alert delivery) depends on H-W13** — delivering alerts based on a cosmetic threshold just ships wrong alerts at scale. W13 lands first; then W12 turns on the delivery path.

---

## Parallelism map

**Safe to run in parallel branches:**
- WF3-01 + WF3-02 + WF3-05 (all small, non-overlapping files)
- WF3-04 (after D3) in parallel with any of above
- WF3-03 is LARGE — recommend single focused effort; do NOT parallelize transaction + lock work across scripts because the SDK pattern must be consistent

**Must run sequentially:**
- WF3-06 → WF3-07 (both touch `cost-model.ts` + `compute-cost-estimates.js`; merge conflicts likely)
- WF3-05 → WF3-10 (W12 depends on W13's threshold being real)

---

## Index

| Order | File | Title | Est. effort | Blocks | Blocked by |
|---|---|---|---|---|---|
| 1 | `WF3-01_HW7_calibration_rounding.md` | Fix PERCENTILE_CONT ::int truncation | XS (15 min) | — | — |
| 2 | `WF3-02_HW19_pipeline_schedules_chain_id.md` | Chain-scope pipeline_schedules | S (2h) | — | — |
| 3 | `WF3-03_HW1_HW2_locks_and_transactions.md` | Advisory locks + transaction boundaries | L (1-2 days) | — | — |
| 4 | `WF3-04_HW14_orphan_phases.md` | Orphan phase contract across producer + consumers | M (4h) | — | D3 |
| 5 | `WF3-05_HW13_imminent_window_consumption.md` | Consume per-trade imminent_window_days | S (2h) | WF3-10 | — |
| 6 | `WF3-06_HW8_HW9_cost_dual_path.md` | Port dedup + Liar's Gate between JS/TS | M (4h) | WF3-07 | WF3-03 |
| 7 | `WF3-07_HW10_commercial_shell.md` | Add Commercial Shell 0.60x multiplier | S (2h) | — | D2, WF3-06 |
| 8 | `WF3-08_HW17_permit_phase_transitions.md` | Resolve dead write | varies | — | D4 |
| 9 | `WF3-09_HW18_audit_table_umbrella.md` | Audit table for 81/82/85/86 (4 sub-tasks) | M (4h each, 16h total) | — | WF3-03 |
| 10 | `WF3-10_HW12_alert_delivery.md` | Wire CRM alert INSERT into notifications | M (4h) | — | D1, WF3-05 |

---

## Verification gates (apply to every WF3)

Per CLAUDE.md:
1. Rollback anchor commit SHA recorded in plan.
2. Failing test written + verified RED before fix.
3. `npm run test && npm run lint -- --fix` all pass (§CLAUDE.md Prime Directive §4).
4. Pre-Review Self-Checklist: 3-5 sibling bugs that could share the root cause.
5. §10 Plan Compliance Checklist visible in response before commit.
6. WF6 review sweep + independent review agent in worktree before commit (per CLAUDE.md Independent Review Agent protocol).
