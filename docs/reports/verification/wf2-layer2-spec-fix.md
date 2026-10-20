# Verification: wf2/layer2-spec fix 89708c1a (verify-13 notes)

- Branch: `wf2/layer2-spec` @ `89708c1a` (parent aed98413). Lane: verify-13b (R-EZ, read-only), 2026-10-20.
- Detail and mutation evidence: `b/l2-detail.md` and `b/l2mut.out` (sub-lane). Throwaway worktrees were removed cleanly (plain `git worktree remove`).

## Verdict: **PASS-WITH-NOTES** (nothing blocks)

| # | Check | Result |
|---|---|---|
| 1 | Full suite at tip (`b/log-l2`) | **18,108 passed / 4 skipped / 0 failed** |
| 2 | tsc / step-validate --all --fast | exit 0 / exit 0 |
| 3 | All 15 pre-commit `--check` arms, plus tracker and lineage | exit 0. `decision-log --check`: 4 logs, 24 decisions, 49 citations, **1 owed** (CHAT-5) |
| 4 | Rows narrowed to the rulings | **R-HG** (124:260) covers only the scenario step's ① and says "does not extend to `resolve_bylaws` ①"; Spec 134:113 agrees. **R-HB** marks rows-form and reset as design defaults. **M-233 / M-234**: "proposed in Spec 134, not ruled". **R-GY** records "the operator did not object". Prior N1 and N2 are closed |
| 5 | CHAT-1…5 imported | The committed raw record is **byte-identical** to `scratchpad/chat-decisions/2026-10-20-batch-a.json`, and the log has 0 field differences. Routing: CHAT-1→LC-62, CHAT-2→R-HL, CHAT-3→R-HK, CHAT-4→R-HM, CHAT-5→69a M-230 `owed: wf1/bylaw-fix-1 (cf4e57a4)` |
| 6 | `decision-log --check` re-derives from raw records | Every mutation fails as it should (exit 1): hand edits to a log's recommendation, decision, question or operator_quote; an amendment quote removed from its row; extra cross-register citations (CHAT-2 in M-231, R-1 in R-HL); a raw-record-only edit; a deleted or unknown row; a wrong route; an M-230 row added while `owed`. Editing a raw record and its log consistently passes (exit 0). Prior N5(i)–(iii) are closed |
| 7 | R-HL / R-HM | Both quote the chat log verbatim and have V3 tables in 124a §B28; the conflict-check quotes are verified at their cited places. R-HM's real lock (`report-schema --check` / `report-schema.logic`) is OWED until integration |
| 8 | M-230 → M-234 renumber | Consistent. No stale reference to layer2's old M-230. The remaining M-230 mentions all mean bylaw-fix-1's CHAT-5 row, or the "drafted as M-230" note |
| 9 | Red-first (tip tests at aed98413) | **13 failed / 25 passed** (decision-log.logic 10, spec134 3). At the tip: 38/38 |
| 10 | Hook | Unchanged since aed98413: 15 chain-era arms; `hook_sha256` matches |

## Notes
- **N-A.** R-GY: Spec number 134 rests on "no objection", not an explicit yes. The coordinator's line is not in any committed record.
- **N-B. Residual `--check` gaps.**
  - `owed:` is free text and not validated, so a lane could delete a row and mark it owed.
  - Amendment quotes (e.g. R-12's) have no raw record, so a consistent edit to the log and the row passes.
- **N-C.** rule-map points R-HM at `decision-log.logic`. Repoint it to `report-schema.logic` at integration, then regenerate Spec 132 with `generate-step-handbook --write`.
- **N-D. Integration hazard (plan §4.1).** bylaw-fix-1's M-230 row cites the scratchpad path, not `2026-10-20-chat-batch-a#CHAT-5`. On the merge, `decision-log --check` goes RED until both of these are done:
  - drop `owed` from CHAT-5 and update the `decision-log.logic` owed assertion;
  - add the stem#id citation to M-230.
- **N-E.** The decision-log stage timing in `precommit-budget.json` (0.09 s) was measured before raw re-derivation; it is now about 0.31 s wall. Re-measure.
