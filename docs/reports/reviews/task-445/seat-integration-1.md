# Seat: integration: task-445 plan (PLAN-445-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 6b3fc4ddf. Grepped scripts, src/tests, tests, .husky, .claude, CLAUDE.md and docs/specs for lensSet, filesText, lens-security, plan-security, out-security; read every call site; read check-lane-close.mjs :460-600, :609-700, :716-850; re-derived every open task's lens set in memory (old and new `sec`) and its Files overlap with task-445's six files; ran `resolve` on task-445's own Files line, `check-tasks` and `page --check` read-only. No test run, no file written, no .env read, no model call, no git state change.

### ig#1 LOW: the plan gives no order against other cards that share files, and it names none of them
- Plan sentence: none (CUT-OVER and LANDING say nothing about other open cards).
- Evidence (open tasks whose Files line shares an entry with task-445's, computed in memory):
  - task-430 (RUNNING, @lane-BL-HB430): no shared file. Its Files names src/tests/backlog/rule-lists-table.logic.test.ts and docs/reports/generated/rule-lists-by-kind.md, not rule-lists.logic.test.ts; task-445's note does not change the page (see ig#6 of the reality seat: five sections compared identical). So no order is needed against 430.
  - tasks 439, 440, 441, 442: no Files line yet (empty), nothing to collide with today.
  - McFix cards (not McFix Final) that share a file: task-404 (LATER, scripts/analysis/rule-lists.mjs), task-414 (LATER, rule-lists.mjs per its Files overlap line? no: 414 shares scripts/analysis/rule-lists.mjs), task-415 and task-417 (LATER, src/tests/backlog/check-lane-close.logic.test.ts), task-403 (LATER, src/tests/backlog/rule-lists.logic.test.ts), task-428 (LATER, .claude/review-templates/README.md). Also tasks 366, 375, 406, 407, 387, 378 carry the same files but their branches (wf1/inc1b-comply2, -gate375, -v2list) are already merged into wf2/board (`git branch --merged`), so their RUNNING status on the board is stale, not a live lane.
  - task-367 (RUNNING, "the handbook rules are key") has no Files line text on the board; I cannot tell whether its lane touches src/tests/backlog.
- What goes wrong: nothing in the code; whichever of 445 and a later card lands second must merge the other's edit of the same file. The precedent plan (task-431) had to be told this by its integration seat.
- Smallest correction: one sentence in LANDING: "no hard order; 430 shares no file; the LATER McFix cards 403, 404, 414, 415, 417, 428 share a file and merge after this lands".
(Typo note for the grounder: in the 414 bullet the clause "rule-lists.mjs per its Files overlap line? no:" is mine and is only a restated fact; the fact is that 414 shares scripts/analysis/rule-lists.mjs.)

### ig#2 LOW: task-409 also changes lens set when it gets a milestone, and the cut-over does not name it
- Plan sentence: "Not launched: tasks 379 and 380 get plan-security at plan-prep and out-security in the brief. Nothing to re-prep."
- Evidence: task-409 (LATER, build, milestone undefined) Files "src/lib/massing/geometry.ts, src/app/api/permits/[id]/route.ts, src/tests/massing.logic.test.ts"; `check-tasks` lists it as "the task has no milestone (a build or fix task needs one ...)". With the new line it fires; with the old it did not (no six word). docs/reports/reviews/task-409 does not exist (0 files), so nothing is prepped.
- What goes wrong: when 409 is given a milestone and prepped, it gets plan-security.txt and owes out-security.txt, which the plan's "5 newly covered" list does not tell the orchestrator.
- Smallest correction: add "task-409 once it has a milestone" to the NOT LAUNCHED sentence.

### ig#3 NIT: the plan's "check-spec-diff" remark is true but the hook is not triggered by this change
- Plan sentence: "the staged spec satisfies check-spec-diff".
- Evidence: scripts/hooks/check-spec-diff.mjs:12-13 "TRIGGER — any staged path under `scripts/steps/`, `scripts/lib/compute/`, or any `*.descriptor.json`". Task-445 stages none of these, so the hook exits 0 whether or not a spec is staged. The reason the spec note is owed is docs/specs/00_engineering_standards.md:465 ("A behavior-changing ruling updates ALL cited specs + runbooks in the SAME commit") and Spec 137 rule 10 (137_mcqueue.md:125), which the plan also cites.
- Smallest correction: drop the clause, or say "(the hook is not triggered; the rule is 00_engineering_standards.md:465)".

### ig#4 NIT: the two tests that add nothing the plan's own tests do not already hold are extra to "small"
- Plan sentence: "S2 (survive-the-fix lock, green both ways, stated as such). The six words still fire off the back end: scripts/pii-scrub.mjs, src/app/admin/page.tsx, src/components/auth/LoginForm.tsx." and "S4 (type gate unchanged)".
- Evidence: src/tests/backlog/rule-lists.logic.test.ts:704-710 (D11b) already asserts plan and out contain security for src/app/admin/page.tsx and scripts/pii-scrub.mjs, and :716-718 for src/lib/stripe/webhook.ts; D11b's control :711-715 holds a path with none. S2 repeats two of its three paths. S4 locks `code &&` at rule-lists.mjs:189-190, which the new line does not touch. RR-0385 item 6 (MORNING-DECISIONS.md:1922) makes tests the focus, so this is not a scope finding; it is only that S2 can be one added path (src/components/auth/LoginForm.tsx) inside D11b.
- Smallest correction: fold S2's one new path into D11b's list, keep S4 only if the planted defect is stated on lines :189-190 (it is a survive-the-fix lock, green both ways).

### ig#5 NIT: the page-regeneration contingency is dead text
- Plan sentence: "If `page --check` fails at the work commit anyway, the lane runs `page --write` and adds docs/reports/generated/rule-lists-by-kind.md to the first Files line of its own task file ..."
- Evidence: I inserted a note line after 08_agents.md:261 in memory; sectionText of "5.1 Compliance", "5.2 Ground-truth", "5.3 Round-2 adjudication", "7. Rules & economics" and "11. Grounded Verification Protocol" is byte-identical (rule-lists.json:48-49 are the only lists on that file, both by section). `page --check` today: "rule-lists-by-kind.md is current".
- What goes wrong: a builder who sees a fallback may use it; RR-0392 says no more than the one change.
- Smallest correction: delete the sentence or say "the page does not change (measured)".

## What happens when security joins the set (every consumer), checked
- Launch brief (backlog-lane.mjs:179 `lensSet({ type: task.fm.type, files: filesText(task.body) })`): `out.map(f)` names lens-security.md for the output stage; `f` maps any other name to `lens-<name>.md` (:180), so no code change; the brief orders no plan stage (RR-0374).
- Plan-prep (rule-lists.mjs:653): `lensSet(...).plan.map(l => ({ out: \`plan-${l}.txt\`, tpl: ... \`lens-${l}.md\` }))`, so plan-security.txt on lens-security.md, one more review call at :680ish; for a fix `lists` is [] (:654 `type === 'build' ? r.lists : []`) and only the lens outputs are written. The REVIEW header and VERDICT line it checks (:696-697 area) are the stub's and the real tool's for any template; a "NOT APPLICABLE" answer ends with `VERDICT: PASS, FAIL or NOT APPLICABLE on exploitability` (lens-security.md:71), which still starts with `VERDICT:`.
- Close (check-lane-close.mjs:526-560): `for (const lens of set.out)` requires `out-${lens}.txt` or parts `out-${lens}-pN.txt` with their committed inputs and the whole-range file_sha256; the code is generic in the lens name, so a large diff is chunked by the same tool for security as for code-review (:529-547 `chunkErrors`). The security template is read from the range base (`readBase('.claude/review-templates/lens-security.md')`, :540, :556); it exists in the repo and in the test fixture's LENS_TEMPLATES (check-lane-close.logic.test.ts:41).
- The close judges the UNION of the launch Files line and the staged one (check-lane-close.mjs:843-845, `resolveText ... Files: ${unionFiles.join(', ')}`), so a lane that adds a src/lib entry to its Files line at close newly owes out-security.txt, and one that narrows it cannot drop it. Same behaviour as the six words today.
- Grounder: `grounder()` in the close test and the real GROUNDER.md must carry a `Ruled: out-security.txt sha256:... findings:n` line; lens names are not enumerated anywhere (`isLensOutput` is `/^(plan|out)-.+\.txt$/`, rule-lists.mjs:307; `findingsIn` and `lensKindOf` at check-lane-close.mjs:146 read the line, not the name).
- Launch gate (planGateInner, check-lane-close.mjs:613-700): a build needs the compliance and engineering plan outputs per resolved list only; a fix needs at least one `plan-<lens>.txt` and validates each header against `lens-<name>.md` (:660 area), so a plan-security.txt would validate and its absence is never refused. The plan's FACT 2 is right.
- docs/reports/reviews/task-375/plant-evidence.mjs writes only the compliance and engineering inputs and, for a fix, plan-code-review.txt (:24-48); no lens-set call, so the fixture writer is untouched.
- No board or report script reads the lens names (grep of scripts for lens-security, plan-security, out-security: only rule-lists.mjs, the three tests and the templates).

## RUNNING and prepped tasks, re-derived
- Newly covered, from the board: 372 (build, RUNNING, @lane-BL-FIXPROJ), 383 (build, RUNNING, @lane-BL-THINROUTE), 396 (fix, RUNNING, @lane-BL-MASSING), 379 (build, LATER), 380 (fix, LATER). Plan evidence on the board (docs/reports/reviews/task-<id>/): 372 0 files, 379 0, 380 0, 383 0, 396 one file (context-2026-11-20.md, not a plan file), 409 0. So no prepped-but-unlaunched task changes and no launch would be refused: the gate never asks for plan-security (see above). Others: only task-409 (ig#2). Tasks that already had security (267, 317, 357, 376, 378, 387, 388, 411, 430) are unchanged.
- A lane judged by its own base copy owes nothing, confirmed: .husky/commit-msg:7 is `node scripts/hooks/check-lane-close.mjs "$1"` run from the lane's own worktree; check-lane-close.mjs:45 imports `../analysis/rule-lists.mjs` relatively, so the lane's own lensSet decides; :720-721 returns 0 on a merge; :748 `if (moves.length === 0) return 0`; the table fields come from the board ref (:728-759) but lensSet is code, not table, so a lane that never merges the board keeps the old function and the old brief. A lane that merges the board before closing gets the new function and owes out-security.txt; the plan says the orchestrator tells it not to merge, as 438 Q4 and 431 Q-F did.
- The protected-path two-commit landing is the practice: rule-lists.json:22 lists scripts/analysis/rule-lists.mjs; check-lane-close.mjs:752-753 refuses a commit that changes it and also moves a task to a finished status. Precedent: 8745ee6dc (task-438 code) before b579388d9 (its close); a870bdf41 (task-431 code) for rule-lists.mjs.

## The Files line, resolved
- `rule-lists.mjs resolve` on the six entries (type build, letter F) resolves with no unmatched path: agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, five-words, plan-protocol, inc-F, ms-F. It is complete: every file the plan changes is on it (rule-lists.mjs; the three test files; 08_agents.md; the README). It is minimal: no entry the plan does not touch. docs/reports/reviews/task-445/, the task file and the lane records are exempt (the table exempts docs/reports/lanes/**; backlog/ is always allowed).

## RR-0392 (no other infrastructure): is anything beyond the one line, its tests and its notes
- RR-0392 (MORNING-DECISIONS.md:1976): "(2) no other infrastructure is needed beyond this", and the reading at :1977 "beyond the McFix Final cards now on the board (430, 439, 440, 367, 441, 442, 445, 424, 386)". Task-445 is on that list, so one more card is not infrastructure.
- In the plan: one `sec` line; seven tests (S1-S4, B1, B2, C1); a Spec 08 note; two README lines; an OPERATOR question; a page contingency (ig#5). No new gate, tool, lens, table field or script. The alternatives (a)-(e) are rejected in the plan's own text. Nothing else beyond the card.

## Checked and found sound
- Consumers, cut-over rule, protected-path landing, Files line, no plan evidence for the newly covered tasks, launch gate not reading lensSet: as above, measured.
- Spec 137 rule numbers: 137_mcqueue.md:125 "Rule 10. A ruling enters a row as a verbatim dated note." (the card's DoD cites :109, which is Rule 6; the plan cites :125 correctly).

## Could not verify
- Whether the live lanes of 372, 383 and 396 have merged the board since launch (their trees were not read).
- Task-367's Files (none on the board) and whether its lane will touch src/tests/backlog.
- The real hook run on the work commit (check-lane-close is not triggered by it, check-task-files and check-spec-diff were read, not run).
