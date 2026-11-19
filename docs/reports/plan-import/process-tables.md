# Process tables: the Definition of Done and the acceptance criteria per task kind

Source: the handbook-process lane report Part C1 and C2 (~/Buildo-scratch/lanes-20261119/boardmove-v2/handbook-process/REPORT.md), every cite resolved to file, section and line at e9bd70288 (the programme tip the plan branches from), every quote re-checked against `git show e9bd70288:<file>` by scripts, the lane verifier method (normalised whitespace, quote contained in the cited line). Scratch files (not in the repo) carry the file sha256 instead of the commit.
Cite form (the plan, Execution Plan R1): `<id or anchor> (<file> §<anchor>; :<line> at e9bd70288) "<quote>"`; the sentence after the dash is the criterion text the loader writes with `--ac` or into `definition_of_done`.

Shorthand resolved (the plan names these without a line):
- the station suite rule (plan section 3 / push AC4): (~/.claude/projects/-Users-brettpreston-macmini/memory/ready-means-hooks-and-suite-on-tip.md §(front matter, no heading); :3 scratch, file sha256 4051a2090541) — memory file text at that line, quoted whole: "description: "A lane's work is \"ready\" only after its exact commits passed the real hooks and one full suite on the current origin tip; every table_version move carries its own G-STOR re-bind""
- gate.mjs --push (push AC5): (.husky/pre-push §pre-push; :41 at e9bd70288) "node scripts/analysis/mcbylaws/gate.mjs --push" — line 41: `node scripts/analysis/mcbylaws/gate.mjs --push && node scripts/analysis/step-validate.mjs --staged --fast && node scripts/analysis/step-validate.mjs --all --fast && node scripts/analysis/spec-split-check.mjs --check && npm run typecheck && VITEST_MIN_FORKS=8 VITEST_MAX_FORKS=8 npm run test`

## C1. Project-level Definition of Done (config `definition_of_done`, 10 items)
Every item applies to every task. Kind-specific gates are acceptance criteria (C2).

- D1 (.cursor/MCBYLAWS-QUEUE.md §Process (every task; Spec 08 governs how it runs); :107 at e9bd70288) "Quote the rule first" — The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule
- D2 (docs/specs/00-architecture/08_agents.md §11.3 Red-first mechanics; :462 at e9bd70288) "Every lock is proven in BOTH directions" — The tests were written first and proven red, then green
- D3 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :490 at e9bd70288) "Red tests first, then the code, through the real hooks." — The work is committed through the real hooks, none bypassed
- D4 (CLAUDE.md §Prime Directive; :32 at e9bd70288) "Never declare a task done until" — The named test is green before the task is called done
- D5 (docs/specs/00-architecture/137_mcqueue.md §4. The rules, with sources; :109 at e9bd70288) "A ruling enters a row as a verbatim dated note." — Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row
- D6 (docs/specs/00-architecture/137_mcqueue.md §4. The rules, with sources; :84 at e9bd70288) "The status line changes in the same commit as the work." — The task file and its queue row are updated in the same commit as the work
- D7 (docs/specs/00-architecture/137_mcqueue.md §3. The status line; :63 at e9bd70288) "The work landed and the evidence exists" — DONE carries its evidence (commit sha, test, hook result)
- D8 (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md §Appendix §B26 — Register rows R-EQ…R-FB (moved from Spec 124 §5) — LIV; :988 at e9bd70288) "no change adds a tool, field or rule its card or ruling did not name" — Nothing was added that the card or ruling did not name
- D9 (.cursor/MCBYLAWS-QUEUE.md §Five principles; :104 at e9bd70288) "Each task names the ones it serves." — The principles the task serves are named
- D10 (docs/specs/00-architecture/08_agents.md §11.9 Ticket header and closed reply status (TKT; operator 2026-11-06, ; :505 at e9bd70288) "Every reply ends with one line" — The close-out reply ends with one STATUS line and at most one question

Mapping to Process 10 (MBQ:119 "committed + named test green + ruling recorded + this line updated"): committed = D3, named test green = D2 and D4, ruling recorded = D5, this line updated = D6 and D7. D1, D8, D9 and D10 are the other universal rules found in Part A.

## C2. Acceptance criteria per task kind (counts from sequence.json, census 2026-11-19: build 162, record 79, decision 22, DB-rehearsal 14, DB-GO 12, check 11, push 9, fix 6, night 3, DB-run 1 = 319)
Each AC is one `--ac` line, in the order the stages run.


### build (162)
- build.AC1 (.cursor/MCBYLAWS-QUEUE.md §Process (every task; Spec 08 governs how it runs); :109 at e9bd70288) "Pre-register the task's `rules[]` and expected moves" — Pre-register the expected moves, committed alone
- build.AC2 (docs/specs/00-architecture/08_agents.md §11.4 Tests live in the plan; the plan panel reviews them; :465 at e9bd70288) "are written INTO the plan and reviewed at PLAN altitude" — Failing tests are written into the plan and reviewed at plan altitude
- build.AC3 (docs/specs/00-architecture/08_agents.md §C.6 Multi-worker isolation (F13, ratified by operator 2026-09-22) — wr; :144 at e9bd70288) "The brief file opens with a front-matter block" — `write_scope` declared in the brief
- build.AC4 (docs/specs/00-architecture/08_agents.md §7. Rules & economics; :334 at e9bd70288) "NEVER run one generic pass" — PLAN panel run with the lens set, never one generic pass
- build.AC5 (docs/specs/00-architecture/08_agents.md §11.2 Fold-validation is a STEP, not a courtesy; :458 at e9bd70288) "one grounder re-executes every claim in the fold" — Fold validated by a grounder that re-executes every claim
- build.AC6 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :490 at e9bd70288) "Red tests first, then the code, through the real hooks." — Built red first, then green, on the tip
- build.AC7 (.cursor/MCBYLAWS-QUEUE.md §Process (every task; Spec 08 governs how it runs); :116 at e9bd70288) "is committed with the work (R-KM)." — OUTPUT panel record committed with the work
- build.AC8 (docs/specs/02-web-admin/126_maxbld_surface_standard.md §0b. How McFrontend work is done (the working standard, added 2026-11-1; :72 at e9bd70288) "No McFrontend work starts without its row in" — McFrontend build only: queue row first

### record (79)
- record.AC1 (docs/specs/00-architecture/137_mcqueue.md §4. The rules, with sources; :109 at e9bd70288) "A ruling enters a row as a verbatim dated note." — The ruling is copied verbatim with date and row id, prior text kept
- record.AC2 (docs/specs/00-architecture/137_mcqueue.md §4. The rules, with sources; :87 at e9bd70288) "The orchestrator writes each ruling into the row's status line the same day." — Entered the same day
- record.AC3 (scripts/analysis/decision-log.mjs §decision-log.mjs; :16 at e9bd70288) "RED (exit 1) when an approved decision has no citing register row" — Where it is a register row, it cites its log entry and the log check is green
- record.AC4 (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md §Appendix §B26 — Register rows R-EQ…R-FB (moved from Spec 124 §5) — LIV; :988 at e9bd70288) "every V3-step or by-law decision cites" — The handbook line is cited, or a new register row is drafted
- record.AC5 (docs/specs/00-architecture/137_mcqueue.md §4. The rules, with sources; :84 at e9bd70288) "The status line changes in the same commit as the work." — The status line of the row changes in the same commit

### decision (22)
- decision.AC1 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :489 at e9bd70288) "One decision list. Every ruling the map needs goes to the operator at once." — One decision list to the operator, rule quoted, compliant options only, recommendation
- decision.AC2 (.cursor/MCBYLAWS-QUEUE.md §The ten stages of every task (the status line names the current stage;; :226 at e9bd70288) "If it is not in a handbook or spec, STOP" — No rule found means a card with the search shown, not a decision
- decision.AC3 (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md §Appendix §B26 — Register rows R-EQ…R-FB (moved from Spec 124 §5) — LIV; :988 at e9bd70288) "scope may expand only by a ruling" — Scope grows only by a ruling
- decision.AC4 (~/Buildo-scratch/panel-tools/PROTOCOL.md §Operating rules (each learned from a failure on 2026-11-17); :48 scratch, file sha256 dac88a1ab800) "before any recommendation reaches the operator, the orchestrator opens the cited source lines itself" — Before it reaches the operator the cited lines are opened and any no-rule claim is grep-checked
- decision.AC5 (docs/specs/00-architecture/137_mcqueue.md §1. Purpose; :18 at e9bd70288) "Operator, 2026-11-14, verbatim" — The answer is recorded verbatim

### check (11)
- check.AC1 (docs/specs/00-architecture/08_agents.md §11.1 No unexecuted executable claim; :454 at e9bd70288) "A plan or fold may not contain a claim that COULD be executed but wasn't" — No claim that could be executed is left unexecuted
- check.AC2 (.cursor/MCBYLAWS-QUEUE.md §The ten stages of every task (the status line names the current stage;; :235 at e9bd70288) "the checker updates the status line, never a person" — The result is a checker or test output, not a person's word
- check.AC3 (docs/specs/00-architecture/137_mcqueue.md §5. The weekly snapshot; :125 at e9bd70288) "For each row it checks the `Status:` line against what landed." — Each status line is compared with what landed
- check.AC4 (CLAUDE.md §Prime Directive; :32 at e9bd70288) "Never declare a task done until" — The named test passes

### push (9)
- push.AC1 (.cursor/MCBYLAWS-QUEUE.md §Process (every task; Spec 08 governs how it runs); :117 at e9bd70288) "the operator reads the one-screen summary of protected-path changes and approves the push" — The operator approves at the terminal
- push.AC2 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :492 at e9bd70288) "One push per landing set." — One push per landing set
- push.AC3 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :496 at e9bd70288) "The orchestrator runs the ledger check" — The ID ledger check ran before the push command
- push.AC4 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :490 at e9bd70288) "The full suite runs on the current origin tip before" — The full suite ran on the tip before ready
- push.AC5 (.husky/pre-push §pre-push; :41 at e9bd70288) "node scripts/analysis/mcbylaws/gate.mjs --push" — The gate summary is shown and the push gate passes

### DB-rehearsal (14)
- DB-rehearsal.AC1 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :495 at e9bd70288) "Rehearse every DB job before the go." — The job ran end to end on the test stack first
- DB-rehearsal.AC2 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :495 at e9bd70288) "Then the real commit hooks run on the rehearsal captures" — The real commit hooks ran on the rehearsal captures with rc 0
- DB-rehearsal.AC3 (.cursor/MCBYLAWS-QUEUE.md §Panel size by task class (smallest diverse panel, 08 §7 rules 5 and 7); :244 at e9bd70288) "Idempotency lens (mandatory)" — The Idempotency lens ran on the job
- DB-rehearsal.AC4 (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md §ST-3. The standing night sizing rule: exact G-STOR plus a measured tes; :75 scratch, file sha256 6e2f331ff5a6) "exact G-STOR plus a measured test write" — The night is sized with the exact G-STOR figure plus a measured test write

### DB-GO (12)
- DB-GO.AC1 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :495 at e9bd70288) "OPERATOR-GO is asked only after both pass." — The go is asked only after the rehearsal gates pass
- DB-GO.AC2 (.cursor/MCBYLAWS-QUEUE.md §Lanes (08 §C.6: one worktree per task, write scopes must not overlap, ; :256 at e9bd70288) "with an operator go, a dump first, disk ≥ 10 GiB" — One DB job at a time, an operator go, a dump first, disk 10 GiB or more
- DB-GO.AC3 (docs/specs/00-architecture/137_mcqueue.md §4. The rules, with sources; :106 at e9bd70288) "The DB lane runs one job at a time, beside the other lanes." — The DB lane runs one job at a time

### night (3)
- night.AC1 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :491 at e9bd70288) "At most one Layer 2 night per increment, from the standard checklist." — At most one Layer 2 night per increment
- night.AC2 (docs/specs/00-architecture/08_agents.md §11.8 The McIncrement recipe (MCINC; operator 2026-11-06); :491 at e9bd70288) "dry run, prereg, go, C1-C6, the night record" — The night record follows the checklist form
- night.AC3 (.cursor/MCBYLAWS-QUEUE.md §Panel size by task class (smallest diverse panel, 08 §7 rules 5 and 7); :244 at e9bd70288) "Reality-Check on the loaded rows + Guardian" — Reality-Check reads the loaded rows

### fix (6)
- fix.AC1 (docs/specs/00-architecture/08_agents.md §7. Rules & economics; :336 at e9bd70288) "BUG → WF3 before Green Light" — A found bug goes to a fix task before the green light
- fix.AC2 (docs/specs/00-architecture/08_agents.md §11.3 Red-first mechanics; :462 at e9bd70288) "Every lock is proven in BOTH directions" — The fix has a test red on the old shape and green on the new
- fix.AC3 (scripts/hooks/check-lesson-routing.sh §check-lesson-routing.sh; :2 at e9bd70288) "Enforces Lesson-routing footer on commits fixing CRITICAL/HIGH findings." — A CRITICAL or HIGH fix carries the lesson-routing footer
- fix.AC4 (CLAUDE.md §Review Agent Reference; :132 at e9bd70288) "always applies (a fix alters existing code by definition)" — The Regression Guardian runs, because a fix alters existing code

### DB-run (1; id MB-86, "bounded cohort only") — a tenth kind not in the brief
- DB-run.AC (.cursor/MCBYLAWS-QUEUE.md §FOLLOW-ON (after the exit) — 7 tasks; :786 at e9bd70288) "the cost capture needs its own GO" — AC pattern: DB-GO AC1-AC3 plus night AC2, plus the row's own gate
