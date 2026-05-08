# Active Task: WF3 — externalize assert-staleness threshold to logic_variables (operator-tunable)
**Status:** Implementation
**Workflow:** WF3 (bug fix — pipeline-blocking hardcoded threshold)
**Domain Mode:** Backend/Pipeline + Web Admin (Cross-Domain — assert script + admin Control Panel surfaces new keys)
**Rollback Anchor:** `9fdd31e` (current HEAD on `worktree-agent-ae19b39afb2228ea4`)

## Context
* **Bug:** `scripts/quality/assert-staleness.js:138` throws `Error: Staleness check failed: 6514 permits stale >30d`. Hardcoded `stale_over_30d == 0` halts the deepscrapes chain (Spec 44 step 7). Reproduced 2026-05-08: verdict FAIL, total_target=62,888, scraped=7,477 (11.9%), max_days_stale=55.
* **Goal:** Replace the hardcoded gate with operator-tunable `logic_variables` per Spec 47 §R4–R5. Mirror commit `91051e0` (WF2 lifecycle bands). Defaults absorb today's snapshot so the deepscrapes chain unblocks; defaults are still FAILable on catastrophic regression.
* **Target Spec:** `docs/specs/01-pipeline/44_chain_deep_scrapes.md` (step 7 description) + `docs/specs/02-web-admin/86_control_panel.md` §1 (admin tunables surface).

## Three new logic_variables keys
| Key | Default | Semantics |
|---|---|---|
| `staleness_max_stale_over_30d` | **10000** | Max stale permits >30d before FAIL. Today's snapshot = 6,514 → WARN, leaves headroom for natural drift but catches catastrophic regression (50K+). Operators tighten as scrape coverage scales (Spec 38). |
| `staleness_min_coverage_pct` | **10** | Below this scraped/total ratio = WARN ("early phase"). Today = 11.9% (just above floor). Doesn't FAIL — Spec 44 §3.5 is informational. |
| `staleness_max_days_stale` | **60** | Single-permit stale ceiling (days). Today's max = 55 days → PASS. Above = WARN (informational; not a halt). |

> **Default-tradeoff rationale:** picked `staleness_max_stale_over_30d=10000` (not 1000) so the deepscrapes chain unblocks immediately on merge. With 6,514 actual stale, we still emit a clear WARN (not silently PASS). Description string says "tighten to <2000 once scrape coverage ≥50% per Spec 38". This is the "absorb today's snapshot" tradeoff per the user's task. 50,000 stale = catastrophic = FAIL.

## Key Files (Modified / New)
- **NEW** `migrations/121_staleness_thresholds.sql` — 3 INSERTs, ON CONFLICT DO NOTHING. Comment-only DOWN block per Rule 6 (commit `8b1c10b`).
- **NEW** `src/tests/migration-121-staleness-thresholds.infra.test.ts` — SQL-shape regex (mirror mig 119 test).
- **MODIFIED** `scripts/seeds/logic_variables.json` — append 3 new entries with min/max bounds.
- **MODIFIED** `scripts/quality/assert-staleness.js` — extend Zod schema; replace hardcoded `== 0` gate with loaded thresholds; surface threshold values in `audit_table.threshold` field.
- **MODIFIED** `src/tests/assert-staleness.infra.test.ts` — extend regression-locks (loads new keys; produces 3-tier verdict via threshold; no `== 0` literal).
- **MODIFIED** `src/features/admin-controls/components/GlobalConfigCard.tsx` — new GROUP "Pipeline Staleness Thresholds" with the 3 keys.
- **MODIFIED** `src/tests/control-panel.logic.test.ts` — append 3 new keys to `EXPECTED_LOGIC_VAR_KEYS`.
- **MODIFIED** `docs/specs/01-pipeline/44_chain_deep_scrapes.md` step 7 + §4 staleness table — note thresholds are operator-tunable.
- **MODIFIED** `docs/specs/02-web-admin/86_control_panel.md` §1 — append the 3 new keys row.

## Standards Compliance
* **§2 Error handling:** assert-staleness already throws via `pipeline.run`. The new threshold-aware gate preserves the throw on FAIL (just driven by loaded values, not hardcoded `0`).
* **§6 Logging:** new WARN tier uses `pipeline.log.warn` (not `console.log`).
* **§9 Pipeline safety:** no DB writes (Observer archetype, `records_total: 0`). Idempotent — re-running produces same audit table.
* **Spec 47 §R4 (Zod schema):** new schema fields `.int()` + `.nonnegative()`. Re-validates via `validateLogicVars`.
* **Spec 47 §R5 (startup guard):** loads inside `withAdvisoryLock`, throws on validation failure (mirrors lifecycle script).
* **Spec 47 §10.2 (audit_table threshold field):** rows now carry meaningful `threshold` strings derived from loaded values.
* **Rule 6 (no executable post-DOWN SQL):** mig 121 follows the comment-only convention from mig 119.

## State Verification (DONE — recorded above)
- `node scripts/quality/assert-staleness.js` → **FAIL** with `stale_over_30d=6514`. Reproduces today.
- mig 119 confirms ON CONFLICT DO NOTHING + DOWN-comment convention. mig 121 mirrors.
- existing test `src/tests/assert-staleness.infra.test.ts` already locks 2 prior thresholds (`scrape_early_phase_threshold_pct`, `scrape_stale_days`); we extend it for the new 3.

## Execution Plan
- [x] **R1** — Rollback anchor recorded: `9fdd31e`.
- [x] **R2** — State verification: live FAIL reproduced (`stale_over_30d=6514`).
- [x] **R3** — Spec Review: read Spec 47 §R4-R5 + §10.2, Spec 44 step 7, Spec 86 §1, mig 119 + 8b1c10b conventions.
- [ ] **R4** — Reproduction test FIRST (Red Light): write `migration-121-staleness-thresholds.infra.test.ts` + extend `assert-staleness.infra.test.ts` → run vitest → MUST fail.
- [ ] **R5** — Implementation (one file at a time):
  - mig 121 SQL with 3 INSERTs + comment-only DOWN
  - seeds JSON: 3 new entries
  - assert-staleness.js: Zod schema + gate refactor + audit_table threshold field
  - GlobalConfigCard.tsx: new GROUP
  - control-panel.logic.test.ts: extend EXPECTED_LOGIC_VAR_KEYS
  - Spec 44 + Spec 86 doc updates
- [ ] **R6** — Green Light: new tests pass; `npm run typecheck && npm run lint -- --fix && npm run test`.
- [ ] **R7** — Idempotency: re-run vitest twice; confirm deterministic.
- [ ] **R8** — Live verification: re-run `node scripts/quality/assert-staleness.js`. Expected: verdict=WARN (not FAIL). 6514 < 10000 = WARN. Chain proceeds.
- [ ] **R9** — Pre-Review Self-Checklist (5 items):
  1. Mig 121 ON CONFLICT DO NOTHING + commented DOWN block?
  2. Zod schema covers all 3 new keys (.int().nonnegative())?
  3. assert-staleness produces 3-tier verdict (PASS/WARN/FAIL) — no hardcoded `== 0`?
  4. audit_table.threshold field carries the loaded value (e.g. `<= 10000`)?
  5. EXPECTED_LOGIC_VAR_KEYS extended; control-panel.logic.test.ts passes?
- [ ] **R10** — Self-review (in-worktree): re-read diff against Spec 47 §R4-R5 + Spec 86 §1.
- [ ] **R11** — Atomic commit on `worktree-agent-ae19b39afb2228ea4` (or new branch `wf3/staleness-thresholds`): `fix(44_chain_deep_scrapes): WF3 — externalize assert-staleness thresholds to logic_variables (mig 121)`. Footer per Spec 05 §5.
- [ ] **R12** — Push the branch.

§10 note: chose default `staleness_max_stale_over_30d=10000` (not 1000) to absorb today's 6,514-stale snapshot so the deepscrapes chain unblocks immediately on merge. The threshold remains operator-tunable; description says "tighten to <2000 once scrape coverage ≥50% per Spec 38". With 6,514 < 10,000 we still emit a clear WARN (not a silent PASS), and 50K+ stale would still FAIL.
