# TRIAGE: BL-R9 review r1 (r1-review.txt, 29 findings, one round, review mode)
Each row: finding (short) - KEEP/REJECT - the line opened. The review ran on the G1 context file with the plan template, as the brief says; the template is a plan reviewer, so several findings audit the pack, not the table.

| # | finding | verdict | opened line / reason |
|---|---|---|---|
| 1 | CRITICAL: READY vs LATER contradiction | REJECT | READY is not a status word. Config statuses are the nine at backlog/config.yml:3 (LATER first). `node scripts/analysis/backlog-next.mjs` prints "READY: 69" and lists task-2 and task-11 as `[LATER ...]` (backlog-next.mjs:3-4: LATER or WAITS with every dependency DONE). The brief's READY = LATER with DONE dependencies. KEPT part: the notes will say "LATER, ready by backlog-next" once. |
| 2 | CRITICAL: CHK.3/CHK.5 pushed against RR-0196 | KEEP (flag, not fix) | `git branch -r --contains 2ba07f464` and `95aa88604` both list origin/wf1/mb-rulings; the task notes (task-64, task-66 last line) record push fa08e8f24. RR-0196 (:825 "dont do itl... if its going to make another mess") says not before push 6. No reversing ruling is in this lane's inputs. Not mine to resolve (record-only): the notes state the fact as on the task, and REPORT.md raises it as the one question. UNVERIFIED whether a later ruling reversed it. |
| 3 | CRITICAL: status written on a lane reading | KEEP in part | Only INFRA.1 gets a status (MERGED); its cite is the operator words at MORNING-DECISIONS.md:750 and the ruling text :751 ("INFRA.1 uses scripts/deepseek-exec.js"), which is the re-use ruling, plus RR-0214. No task is DROPPED (no new ruling). The nine status words are at backlog/config.yml:3. |
| 4 | HIGH: R8f absent, RR-0220 not in lists | REJECT in part | task-314 (R8f, LATER) is named in the table by the task id; MORNING-DECISIONS.md:960 states "the G1 decisions block ends at RR-0219 today". KEPT: the task-2 note names task-314 as not yet built. |
| 5 | HIGH: BL.0 no hash | REJECT | BL.0 loader and backlog-next first commit 3002ef51c (git log of scripts/analysis/backlog-next.mjs in ~/Buildo-wt-r8e). The notes cite it. |
| 6 | HIGH: backlog-next and backlog-brief have two authors | REJECT | One file each, extended in order: `git log --oneline -- scripts/analysis/backlog-next.mjs` = 40aecea1c (R8a) on top of 3002ef51c (BL.0). The R8a OPERATOR section is not lost (it is the later commit on the same file). |
| 7 | HIGH: task-309 undefined | REJECT | task-309 = "R8d McLane context pack ..." (`backlog task view task-309`), commits c9f7f40fc and 81b43da8a (git log of r8e). INFRA.1 has no remaining named part. |
| 8 | HIGH: pack loads no documents | REJECT (context) | task-315 has no Documentation reference of its own, and the worktree is cut from the board head, which does not yet carry R8b/R8d (git ls-files in ~/Buildo-wt-r9 shows no backlog-lane.mjs). Pack emptiness is correct for this task; not part of the table question. |
| 9 | HIGH: template cannot emit the table | REJECT | The brief names the template for this round; the table in the context file is the question. No outcome depends on the template shape. |
| 10 | HIGH: decisions block paraphrase, identical strings | REJECT (out of scope) | Block is the generated pack, not this lane's deliverable; the notes cite only :750-751, :910-913, :979 which I opened. |
| 11 | HIGH: "Decisions naming this task: (none)" false | REJECT | The task description cites :910 and :751 as References, not an RR id; the linker matches ids. Not changed by this lane (no code). |
| 12 | HIGH: cites are scratch paths | REJECT | The rulings of record are in MORNING-DECISIONS.md (brief: "THE RULINGS" at that path); the notes also carry the repo-side cites (backlog/config.yml, scripts/...). |
| 13 | MEDIUM: :751 vs :750-751 drift | KEEP | Fixed: notes cite :750-751 (the words at :750, the list at :751). |
| 14 | MEDIUM: record-only contradicts status writes | REJECT | The brief defines record-only as notes plus MERGED/DROPPED statuses, no code. |
| 15 | MEDIUM: task-2 CHANGED vs MERGED, task-314 LATER | KEEP | Resolved: CHANGED stays (task-314 not built, so MERGED is not allowed yet); Scope now names the exact remainder: no new register or gate; the rulings after RR-0219 enter through G2 via task-314; task-2 closes as covered once task-314 is DONE. |
| 16 | MEDIUM: CHK.8 delta vs G3 not stated | KEEP | Opened scripts/hooks/check-backlog-task.mjs:25-33: G3 checks that a code commit names a task and the file is in the diff; it never reads the task's status. Scope now states that predicate (status vs commit evidence) as the delta. |
| 17 | MEDIUM: CHK.1 OPEN declaration | KEEP | Scope now picks the home: a `Files:` line in the task description (the task file is already in every code commit, check-backlog-task.mjs:28-32); a recommendation under the six criteria, the launching lane logs it as a card (RR-0192/0193); the trailer stays unused. |
| 18 | MEDIUM: lane-mode drop relies on backlog-lane.mjs | KEEP in part | Lane mode dropped for the git-isolation reason (backlog-lane.mjs:6 one worktree per lane); the git-mode check covers any lane because it reads the commit range, so no extra predicate is added. |
| 19 | MEDIUM: task-8 conditional | KEEP | Resolved to one outcome: CHANGED. Pack cache half dropped (its only reader was run-panel.mjs, retired). Claims registry half stays, small, in the repo as the module the lane-guard hook reads (~/.claude/hooks/lane-guard.mjs:111 reads panel-tools/lanes.json; :127 B5), not replaced by worktrees because lane dirs under ~/Buildo-scratch and other write paths are not worktrees. Not DROPPED: no operator ruling names it. |
| 20 | MEDIUM: prior reviews (none) | REJECT | Same as 8: task-315 has none; R7b note quoted inline from `backlog task view`. |
| 21 | MEDIUM: Dependencies (none) | REJECT | task-315 has no dependencies; the table lists task-9's own dependency on task-8 from `backlog task view task-9`. |
| 22 | MEDIUM: covering deliverables by filename only | KEEP | Notes carry file, commit and line where one exists. |
| 23 | MEDIUM: uncited numbers (68, 125, nine) | KEEP | 68 from the R7b note on task-2; 125 from task-63's plan text; nine from backlog/config.yml:3. Cited in the notes. |
| 24 | MEDIUM: triage has no destination | REJECT | TRIAGE.md in the lane dir, copied to docs/reports/lanes/<date>/BL-R9/ (rule 19). |
| 25 | MEDIUM: eleven "open" includes BUILT | REJECT | Brief lists the eleven; BUILT rows get a note only. |
| 26 | MEDIUM: CHK.6 blocked on an artefact | KEEP | task-67 note says blocked on the designed report elements file, in addition to push 6 (its description already says so). |
| 27 | MEDIUM: this pass trips CHK.1 | REJECT | CHK.1 is unbuilt; G3 exempts docs and backlog-only commits (check-backlog-task.mjs:4-5). |
| 28 | LOW: truncated quote | REJECT | In the generated pack, not this lane's text. |
| 29 | LOW: G1 name used twice; NITs on ordering | REJECT | Cosmetic, generated pack. |

KEPT changes made to the table before recording: task-2 stays CHANGED with the closing path; task-5 stated delta; task-3 declaration home; task-8 single outcome (CHANGED, pack-cache half dropped).
