# Seat: integration: task-439 plan (PLAN-439-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head abaee3190. Read scripts/hooks/check-lane-close.mjs :380-470 (listProof, complianceSetErrors), :480-575 (closeErrors), :609-700 (planGateInner), :740-850 (the close), scripts/analysis/rule-lists.mjs (resolveTask, checkTasks, planPrep header, renderPage), scripts/analysis/backlog-lane.mjs :190-200, scripts/hooks/validate-commit-msg.sh, check-lesson-routing.sh, check-spec-diff.mjs, check-backlog-task.mjs, scripts/analysis/policy-checks.mjs, .husky/commit-msg and .husky/pre-commit, git show of a870bdf41, 8745ee6dc, b579388d9, 4b3bd3633, the task-445 plan evidence, the untracked task-439 plan evidence, backlog/tasks Files lines. Computed in memory: resolveTask over all open tasks on the old and the edited table, parseLensInput/wholeListText comparison of committed plan inputs against today's lists, git diff wf2/board...<branch> for the unmerged lane branches. No test run, no file written, no .env read, no model call, no git state change.

### ig#1 LOW: the 445 cut-over sentence is true but leaves out what exactly 445 owes, and what the reverse order moves
- Plan sentence: "If 439's work commit lands first, 445 owes a fresh plan review of those two lists before launch. Likewise, if task-445 lands before 439 launches: 445's note goes in §5.7, which is in no list (task-445 plan), so 439's evidence is unaffected."
- Evidence:
  - check-lane-close.mjs:413 `whole = listBlocks(table.lists[l.id], root, l.id).map((b) => b.text).join('');` and :417 "the committed inputs ... do not carry the whole list ${l.id} (${l.file}) as it is now: the list was shortened, softened or is out of date". planGateInner (:609-700) calls the same listProof for the plan phase, so the launch gate compares every committed `in-plan-compliance-<list>` input with the list at the board head.
  - I compared, with parseLensInput and wholeListText (whitespace squashed, as :417 does), the embedded list part of every committed per-list plan input of task-445 (docs/reports/reviews/task-445/in-plan-compliance-*.txt) and of task-439's untracked evidence folder against the lists at abaee3190: all equal today (445: agents-s5-1to3 12,386, agents-s7-s11 35,632, five-words 4,588, inc-S 16,754, ms-S 2,173, orchestrator-doc17 27,928, plan-protocol 7,378, queue-137 30,864; 439: the same plus policy-124-s2-s5 77,672). So both are valid now.
  - 439's work puts a note in 08_agents.md section 7 (selected by agents-s7-s11, rule-lists.json:48) and in 137_mcqueue.md (whole, :47): exactly those two inputs of 445 go stale. 445's note (after :261, section 5.7, in no selector: 445's own seat measured five sections identical) leaves every 439 input valid.
- What 445 owes if 439's work lands first, precisely: regenerate `in-plan-compliance-agents-s7-s11[-pN].txt` and `in-plan-compliance-queue-137[-pN].txt` with `lens-input --material-from context-r1.md`; re-run those two DeepSeek compliance reviews (their old outputs are bound to the old input by the prompt hash, reviewErrors); a grounder verdict for any new finding; refresh FINDINGS-PLAN, GROUNDER-PLAN and FOLD-CHECK as the folder holds them; recommit through plan-prep. The other seven per-list inputs, plan-engineering-eng-all, plan-error-paths and plan-plan-review-deepseek are untouched.
- What 439 owes if 445's work lands first: nothing for evidence. But every line of 08_agents.md after :261 moves down by the inserted lines (a note and, if it gets its blank line, two), so 439's anchors ":353" and ":489" must be found by text; the builder must not insert by line number. 137_mcqueue.md :134 does not move.
- Cheapest safe order: 445 first (also the orchestrator's stated order, MORNING-DECISIONS.md:1983, an orchestrator reading, not a ruling): zero re-reviews. 439 first costs a re-run of two lists and a grounder pass for 445.
- Smallest correction: replace the two plan sentences with the exact list above and "440 and 445 are the only open cards whose lists change text; 445 first costs nothing".

### ig#2 LOW: other open cards that share the five files or whose list text changes are not named
- Plan sentence: none (CUT-OVER names only 445).
- Evidence, from every open task's Files line against the five files (coveredBy), and git diff wf2/board...branch for every unmerged inc1b branch (areafactor, cfgbounds, gates, hooks3, mfrules, pagetable, thinroute): no unmerged lane branch changes any of the five files.
  - Share rule-lists.json: task-403 (LATER), 404 (LATER), 413 (LATER; also names src/tests/backlog/rule-lists-table.logic.test.ts), 366, 406 (statuses RUNNING, branches merged).
  - Share the test file or the page: 413, 384 (RUNNING, @lane-BL-REPORTOWN2; its Files names the test file and docs/reports/generated/rule-lists-by-kind.md and its own describe block at :181-208 is the one this plan edits), 406, 375, 378, 420 (`docs/reports/`).
  - Share 08_agents.md: 445 (LATER), 387 (RUNNING), 375, 366. Share 137_mcqueue.md: 366, 375.
  - No Files line yet: task-367 (RUNNING, no unmerged change to the five files on wf1/inc1b-gates), 441, 442, 440. task-440 is type record, so no_files_default (rule-lists.json:229) gives it queue-137 and agents-s7-s11: their text changes with this plan, no plan evidence exists. task-424 (.husky/pre-push) and task-386 (a lane report path) resolve; their sets do not change.
  - Only 445 has committed plan evidence among open unlaunched cards. 375 has evidence but is already launched.
- What goes wrong: nothing hard; the second lander of any of these must re-run `page --write` (.husky/pre-commit runs `page --check` on every commit) and, for 403, 404, 413, merge a table edit.
- Smallest correction: one sentence listing 384, 403, 404, 413, 420, 440 as sharing files and saying no order is needed beyond 445 before 439.

### ig#3 NIT: the plan's cut-over sentence cites :842 for "the close takes the table from the merge-base", and :840-842 is the exception that applies to task-439 itself
- Evidence: check-lane-close.mjs:840 `const ownsTable = coveredBy(filesEntries(baseTask ?? mv.now), 'scripts/analysis/rule-lists.json');` and :842 `const judge = !baseTable ? { ...table, ...pin } : ownsTable ? { ...table, ...pin, every_task: baseTable.every_task } : { ...baseTable, ...pin };`. 439's Files line names the table, so its own close is judged by its branch table.
- What goes wrong: nothing; resolveTask of 439's own Files line gives the same ten lists on the old and the new table (listed in the reality seat), so the set it owes is identical either way.
- Smallest correction: one clause: "439 itself is judged by its own branch table (:840-842) and resolves the same ten lists".

### ig#4 NIT: the work-commit instructions are right but incomplete as to what the hooks require
- Plan sentence: "No Spec-diff trailer is needed: check-spec-diff.mjs triggers only on steps, compute or descriptor paths."
- Evidence: check-spec-diff.mjs:38-42 TRIGGER_RES = /^scripts\/steps\//, /^scripts\/lib\/compute\//, /\.descriptor\.json$/; none of the plan's five files nor the task file matches. a870bdf41 (task-431), which also changed 08_agents.md, carries only "Task: task-431" and the Co-Authored-By line; 8745ee6dc the same with "Task: task-438". What fires for the work commit (.husky/commit-msg): validate-commit-msg.sh requires a subject `type(NN_spec): text` (the precedents: `feat(08_agents): ...`); check-backlog-task.mjs:25 requires `Task: task-439` as a trailer line because scripts/analysis/rule-lists.json is under scripts/, and the task file in the same diff (:26-28); check-lesson-routing.sh only if a body line starts with CRITICAL or HIGH; policy-checks.mjs --commit-msg needs Operator-Ruling only for ledger rows ADDED (none); check-task-files.mjs checks the changed paths against the Files line (the five files, the task file, docs/reports/reviews/task-439/ and docs/reports/lanes/ are allowed); check-lane-close.mjs returns 0 at :748 because the commit moves no task to a finished status. .husky/pre-commit runs `rule-lists.mjs page --check` (hence the page last) and spec-split-check, which does not read 08_agents.md or 137_mcqueue.md.
- Trailers the work commit must carry: `Task: task-439`, and the attribution line the session gives (`Co-Authored-By: ...`). No Spec-diff, no Lesson-routing, no Operator-Ruling.
- Smallest correction: say "subject `feat(08_agents): ...`, trailer `Task: task-439`, task file staged" instead of "with `Task: task-439`".

### ig#5 NIT: commit sequence is simpler than the precedent
- Plan sentence: "1. Work commit ... 2. Close commit: the lane records and the status line only."
- Evidence: task-431 landed as a870bdf41 (work), then 32fc877bf (output review round 1 records), f16762780 (lane report), d71c5d815 (count fix), then 4b3bd3633 (close, "task-431 close (BUILT; ...)") which stages the task file, GROUNDER.md, TRIAGE.md. task-438: 8745ee6dc (work), b579388d9 (close). check-lane-close.mjs:753 refuses a commit that changes a protected path (rule-lists.json is in protected_paths, rule-lists.json:22) and also moves a task to a finished status; :836-ff requires the close to stage records only.
- What goes wrong: nothing; the plan's two commits are the minimum and the precedent allows records commits between them.
- Smallest correction: "record commits of the output review may sit between; the close stages only the task file and the lane report directory".

### ig#6 NIT: line cites to the close
- :751 is a comment, the refusal is :753; :765 is a comment, the base-table read is :766. :413, :748, :842 exact.

## (a) Consumers of the rows and lists
- resolveTask (rule-lists.mjs:237-288) reads the rows from the table passed in and the de-dup line at :286 ("a whole list and a sections list of the same file ... the whole list is kept"); the edit gives no file both a whole and a sections list on the 16 tasks (the 16-task diff lost only whole lists). checkTasks on the edited copy: 308 open, 106 resolve, 0 bad (the real run: same, no FAILED).
- backlog-lane.mjs :190-200 builds the brief from resolved lists: `- ${l.id}: ${l.file} (...) why: ${l.why.join(' | ')}` (:196), so the `why` text goes to the lane (reality seat rc#5); the lens line names one `out-compliance-<id>` or `out-engineering-<id>` per resolved list (so a launched lane's brief lists fewer outputs after the edit).
- plan-prep (rule-lists.mjs planPrep :585-): resolves per task and writes one plan review per resolved list; no list name is hard coded.
- check-lane-close.mjs: launch gate planGateInner (:609-700) and close closeErrors (:480-575): listProof per resolved list (complianceSetErrors :456 `if (perPh.length) for (const l of lists)`); lists come from resolveTask on the judged table; the page renderer (renderPage) resolves the `kinds`; gates/generated-docs.mjs registers the page.
- backlog-brief.mjs: does not read the table (not in the grep of rule-lists.json users: backlog-lane.mjs, check-lane-close.mjs, rule-lists.mjs, gates/generated-docs.mjs, README, tests). No board script names surface-126/127/128/135 (grep of scripts, src, tests, .husky, .claude: only the two test files and the table).
- README: .claude/review-templates/README.md :103, :141 (the manual fe-126/127/128/135 packs, run by hand with `--context packs/<pack>.md`, no script reads `packs/`), :161 name no surface list as attached to a row. Nothing to edit.

## (b) The cut-over
- The 10 RUNNING lanes re-derived by resolve on the old and edited table: 354, 373, 374, 378, 381, 384, 389, 390, 395, 411, all with an assignee lane. Each is judged at its close by the table at its range base (check-lane-close.mjs:766 reads `${base}:scripts/analysis/rule-lists.json`; :842 `{ ...baseTable, ...pin }`), the same rule as task-438 QUESTIONS-RULED.md Q4 and task-431 QUESTIONS-RULED.md Q-F; the close runs only on a commit that moves a task to a finished status (:748), never on a merge (a merge commit returns 0). So a lane that does not merge the board owes what it was launched with.
- A lane that merges the board before it closes: its merge-base becomes the board tip, so it is judged by the new table: it owes `out-compliance-<id>` (or `out-engineering-<id>`) for the lists left, which for its Files line are the same lists minus the four.
- The plan's UNVERIFIED claim, answered by reading: extra per-list outputs for lists no longer attached are accepted. complianceSetErrors proves only the lists in `lists` (the resolved set; :456); outputs for any other list name are never proved, but they are lens outputs (:565 `files.filter((f) => isLensOutput(f.name) ...)`), so their findings need grounder verdicts, and their finding lines must parse (:566-570). No code path refuses an output for a list that is not resolved. A joined `out-compliance-rules` made from the old set is refused: :452-453 recomputes joinLists over the resolved ids, and the input embeds the list text, so the old join does not match (and a stage holding joined and per-list forms is refused, :440-446).
- Order-only tasks 267 (WAITS), 317 (WAITS), 357 (LATER): same set, new order; the joined form joins in table order, so a joined set built on the old order would not match, but none of the three has plan evidence.

## (c) Prepped but not launched
- Committed plan evidence among open tasks: task-445 (LATER, 9 per-list plan files, commit 72d721e94) and task-375 (RUNNING, already launched). task-439's own evidence is untracked. None of the 16 changed tasks (345, 382, 391-394 are LATER) has a docs/reports/reviews folder.
- Lists whose text changes with this plan: agents-s7-s11 (the 08 note, section 7) and queue-137 (the 137 note). Everything else keeps its text. See ig#1 for what 445 owes and the reverse order.

## (d) The protected-path landing
- rule-lists.json is protected (rule-lists.json:22); :753 refuses a protected change in a commit that also finishes a task. Precedents: task-438 8745ee6dc then b579388d9 (close, 3 files: task file, GROUNDER.md, TRIAGE.md); task-431 a870bdf41 then 4b3bd3633. The plan's two commits are right.

## (e) The Spec-diff trailer
- See ig#4: not needed, and why.

## (f) The Files line
- Resolved: agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, policy-124-s2-s5, five-words, plan-protocol, inc-S, ms-S (ten, the same as task-431's), no exempt, no unmatched, on the old and the edited table. Minimal and complete for the plan's changes: no other file in the repo names the surface lists or the page, and rule-lists.logic.test.ts, backlog-lane.logic.test.ts and check-lane-close.logic.test.ts need no edit (regression seat).

## (g) RR-0392
- MORNING-DECISIONS.md:1976 "(2) no other infrastructure is needed beyond this", read by the orchestrator at :1977 as "beyond the McFix Final cards now on the board (430, 439, ...)". The plan contains: the table edit (two rows), its three why sentences, tests N1 and N2 and two changed assertions, two dated notes, the regenerated page. No tool, gate, lens, list or row is added. Within scope. Mild: the header says "Two rows change, and only their lists and why" and then edits a third `why` (specs-web-admin); that is a text-only edit to stop a false sentence ("the same lists as the surfaces row", rule-lists.json:219) and is justified.

## Checked and found sound
- All consumers in (a): none reads the four lists by name; all follow the resolved set.
- The cut-over rule for running lanes, and the answer that closes the plan's UNVERIFIED (extra outputs accepted).
- The protected-path two-commit landing.
- No Spec-diff trailer.
- The Files line: ten lists, same as task-431.
- 445's note placement (section 5.7, no selector) and 439's note placement (section 7 and a whole-file list), with the effect on 445 as described.

## Could not verify
- Whether any RUNNING lane's worktree is live or has merged the board (I read the board, not the lane trees).
- That the hooks pass on the actual commit (nothing staged; I read the hooks and ran only read-only checks).
- policy-checks CHK.3 and CHK.5 on the real staged diff (the plan adds no dependency, tool or field, so none is expected to fire).
