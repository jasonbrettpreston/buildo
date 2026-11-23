# REPORT — lane BL-HB430, task-430 (INPUTS.2), 2026-11-23

1. What changed: Spec 136 prints every McFrontend ruling whole (no clip), 12 lines carry a Current reading of their dated notes (lane text), and 13 new OWED rows from the RR-0384 list are in Spec 135 and on the page (57 rules, 21 OWED). Commits 62b2ffed6 (records), 0fe6e7712 (A), 25755f51a (B), d429b287d (C).
2. Acceptance printed (pasted on the task; acceptance.out): 0 clip ellipses, section 2 28,691 characters; 12 readings, a planted later note on FE-39 throws "a dated note follows the Current reading; restate it"; 13 lines "Status: OWED · lock owed: <path>", Rules rendered 57, 21 OWED; Spec 133 and scripts/analysis/bylaw/ untouched since 60b601cc9; every --check green.
3. Built as the plan says, with three rulings during the build: Q8 (system map added to the Files line), Q9 (the generator keeps a trailing cite the shared reader strips), RR-0390 (the review size limit raised to 200,000 by the tools' own settings).
4. Unverified: the full suite (push station only); register-locks-resolve and the gate arms on the 13 OWED rows outside the commit hooks that ran; FE-45..FE-57 are placeholders (FE-45 is BL-MFRULES's).
5. Output review done, untriaged: 116 outputs, 427 finding lines (HIGH 50, MED 179, LOW 186, NIT 9, CRIT 1 that reads "none"); a separate grounder is owed (RR-0359). Task RUNNING.

## Output review (RR-0390, "Let's try A.")
- Context: docs/reports/reviews/task-430/context-r5.md (backlog-brief.mjs re-run before the inputs; r4 was made in the first attempt and is kept).
- Material: the whole-change diff, launch base 60b601cc9 to d429b287d, the brief's command plus docs/specs/00-architecture/00_system_map.md (Q8), 258,896 characters.
- n = 200000 for every input (lens-input --max 200000; DEEPSEEK_REVIEW_MAX_CHARS=200000 on every review call; time-out left at the default 900000). Tried in order: 160000 refused for surface-136 ("at most 144366 fit one input beside the rule list part of 692 (bound 160000)"); 180000 refused for orchestrator-doc17 ("at most 142191 fit one input beside the rule list part of 22867 (bound 180000)"); 200000 builds every list and lens. One n is used for all inputs: the smallest n at which the tool builds the inputs of every list (per-list n would have been 180000 for 14 lists, 200000 for one, and 160000 for bylaw-133 with 840 inputs; the default 120000 builds none, because the Spec 135 diff alone is 144,449 characters).
- Inputs: 116 (108 compliance over the 16 lists, 2 each for code-review, ux, error-paths, security); character count of every input in input-sizes.txt (lane dir); largest in-out-compliance-bylaw-133-p6.txt 186,747 bytes (185,747 characters), smallest 41,548.
- Calls: 116 finished with a REVIEW header and a VERDICT line (lens-run.log). Two first attempts ended "DeepSeek API error: terminated" (surface-135-p3, 41 s; surface-135-p2, 97 s) and passed on their one retry. Longest call 382 s (out-compliance-surface-135-p1, input 46,620); the largest input took 145 s.
- Two outputs (agents-s5-1to3-p1, surface-128-p1) finished but the close dry run read their finding lines as unparsable ("the strict reading counts 0 BUG/DEFER lines, a loose reading 3"; "4 ... a loose reading 12"): re-run once each (92 s, 223 s); the re-runs parse.
- FINDINGS.md lists every output with its sha and finding count and every finding id, unedited; post-build#1 MED (Q9) recorded for the grounder. No verdicts by the lane.

## Close dry run (throwaway clone in the lane dir, task staged BUILT, records staged)
First run: the REPORT.md reference was missing (added by --add-ref) and two outputs were unparsable (re-run, above). Second run, on a fresh clone with the records staged (close-dry.out), the only refusals left are the grounder ones:
- "the task's references lack the repo copy docs/reports/lanes/2026-11-22/BL-HB430/GROUNDER.md"
- "GROUNDER.md is missing in docs/reports/lanes/<date>/BL-HB430/ (a build or fix task always needs a separate grounder verdict)"
No refusal about the review material remains: chunk stamps, whole-change coverage, the 200,000-character inputs and the output headers are accepted (the check is indifferent to the bound). The clones were removed afterwards.

## Evidence
- red.out: RED A (5 failed of 26), RED B (9 of 35), RED C (4 of 59), RED Q9 (3 of 60), each at AssertionError lines through the real hooks.
- commit.out: green tails of 0fe6e7712, 25755f51a, d429b287d ("Tests 60 passed (60)", "GATE OK", "POLICY CHECKS OK (commit-msg): 3 file(s)"), commit 0, and the refused C attempts.
- CHECKLISTS.md: self-skeptical checklists per commit.
- Ledger: MF-95 (orchestrator), round-200, FE-46..FE-58 (this lane). FE-45 is BL-MFRULES's; the branch rows renumber if task-388 lands first. task-388 also changes the system-map line: whoever lands second regenerates it.

STATUS: BUILT-PENDING-GROUNDER: commits 0, A, B, C landed; output review round 1 complete (116 outputs, 427 findings untriaged); records committed; task RUNNING, GROUNDER.md owed (RR-0359).
