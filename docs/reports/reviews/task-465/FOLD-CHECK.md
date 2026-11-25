# Fold check: task-465 (PLAN-465-v1), round 1
Checked by: Cairn-Ground-P465
Lane: BL-MCFIX465
Board head read: 84d46c9bc (wf2/board), working tree of ~/Buildo-wt-board with the folded card.

- **Pairs:** all 93 pairs of FOLD-465.json are present exactly once. 87 `new` strings were checked from the saved fold text and 6 from the cite pairs. The (h) pair carries `(:2544)`, as applied. No `old` text is left, and none is doubled or lost. The Files pair is in the Description, and `Files:` occurs once in the card.
- **Round block:** one line, `Plan review round 1: 41 folded, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/reviews/task-465/GROUNDER-PLAN.md; triage docs/reports/reviews/task-465/TRIAGE-PLAN.md`. 28 HIGH and MED outcome lines follow it. The counts match GROUNDER-PLAN.md and TRIAGE-PLAN.md (42 CONFIRMED, 41 folded, 1 pile).
- **Triage quotes:** 21 distinct quotes, covering every HIGH and MED id, were re-checked and are present in the folded card. The LOW-id quotes were not re-checked.
- **Files line:** it has 35 entries. `resolveTask` returns mobile-90, mobile-98, mobile-99, surface-136, eng-all, step-132, plan-protocol, inc-S and ms-S, with no unmatched path. The card's references already carry step-132.
- **Ruled lines:** `rule-lists.mjs findings` prints the same three Ruled lines (fddcef965c28 with 7 findings, 2362a3dc0a1d with 12, 08d8b9b287e8 with 8).
- **Saved files:** GROUNDER-PLAN.md is 567ab6b2f8f0, TRIAGE-PLAN.md is 7d75be79e2a6 and QUESTIONS-RULED.md is 27d643257650. These equal the orchestrator's report.
- **Lane name:** BL-MCFIX465 is fine to use as the real lane name; no edit is needed.
- **RR-0490 and RR-0491:** both are about the loading screen (tasks 267 and 317). No folded line is now false.
- **Q1:** it stands with A (table-row conversion left out) until the operator answers.

Verdict: PASS

Plan: task-465 sha256:b8e40a149a3f
