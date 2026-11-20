# REPORT: BL-COMPLY2, task-366 COMPLY.2 (rule lists attached by touched path; close needs a lens set per list and a separate grounder verdict)

Six plain lines for the operator

1. A lane now receives, at launch, the rule lists its task's Files line attaches (from the data table scripts/analysis/rule-lists.json): each named with its file, sections and why, "READ each whole before planning", plus the requirements document of its increment; and the compliance lens line now runs once per list with that list pasted whole ahead of the plan or diff (helper `rule-lists.mjs lens-input`, split by the list's own headings when it would pass the 120000 character bound, never trimmed).
2. The commit that sets a lane's task BUILT or DONE is now refused unless the lane report holds the lens set for the task type (compliance per list, plus code-review and error-paths, ux and security by the Files line, and a plan-stage output) and a GROUNDER.md from an agent that is not the lane or any assignee, restating the sha256 and finding count of every lens output (an output edited after grounding is refused) with a verdict, file:line and a quote that really is on that line of a repo file for every finding. A code commit that closes a task with no lane assignee is refused too.
3. Reused, not rebuilt: mcbylaws/protected-paths.json (keys layer23 = by-law code, frontend = McFrontend surfaces) is read by the table (globs_from) and its glob matcher scripts/analysis/mcbylaws/paths.mjs does the matching. No existing map goes file to rule (surface-rule-map.json and the handbook rule maps go rule to handbook line; Target Files sections list a spec's own files).
4. A task with no Files line, or a Files path no row matches, is refused at launch with the path named (record-only tasks get the queue lists). Measured on the real board: of 240 LATER/WAITS tasks only 56 would launch today, 178 have no Files line, 6 name a path no row matches (docs/specs/02-web-admin/, docs/specs/03-mobile/, tests/, src/components/report/): those need Files lines or rows before launch.
5. Not built: the push-range arm (reported below), a by-law rulings register list (69a is a 1.2 MB heading-less table, owed), the scratch standing-rules file that brief.mjs reads (outside this lane's write scope; the grounder rule is written into the text backlog-lane.mjs generates), plan-stage compliance per list, the other four lens templates' doubled plan placeholder.
6. Unverified: that the grounder, once launched, does its work well (the check cannot prove it), the 178 findings (verdicts owed), and the lens outputs saw only the code diff, not the tests. GROUNDER OWED: the task stays RUNNING.

## The table as built (scripts/analysis/rule-lists.json)
| row | globs | lists (whole file or sections) |
|---|---|---|
| step-pipeline | scripts/*.js, scripts/**/*.descriptor.json, scripts/lib/compute/**, scripts/lib/step/**, scripts/quality/**, migrations/** | step-132, airtight-124a, airtight-v3-122, airtight-v2-122, airtight-122a, eng-s3-s9 |
| bylaw | globs_from mcbylaws/protected-paths.json key layer23 | bylaw-133 |
| api-lib | src/app/api/**, src/lib/** | eng-s2-s4-s10-s11 |
| storage | src/lib/parcels/**, src/lib/report-projection/**, src/app/api/parcels/** | storage-doc16 |
| compute-import | src/**/*.ts, src/**/*.tsx (only a file that imports from scripts/lib/compute) | step-132, airtight-124a, airtight-v3-122, airtight-v2-122, airtight-122a |
| surfaces | globs_from mcbylaws/protected-paths.json key frontend | surface-136, surface-126, surface-127, surface-128, surface-135 |
| mobile | mobile/** | mobile-90, mobile-98, mobile-99, mobile-100, mobile-96, surface-136, surface-126, surface-127, surface-128, surface-135 |
| queue-records | backlog/**, .cursor/*QUEUE*, docs/specs/00-architecture/** | queue-137, agents-s7-s11 |
| lane-tools | scripts/analysis/**, scripts/hooks/**, scripts/deepseek-review.js, scripts/lib/review-template.js, .husky/**, .claude/** | agents-s5-1to3, agents-s7-s11, queue-137, eng-s5-s9-s14, orchestrator-doc17 |
| tests | src/tests/** | eng-s5 |

exempt (no list): docs/reports/lanes/**, docs/reports/reviews/**

lists:
- step-132: docs/specs/01-pipeline/132_step_standard_handbook.md (2. Every step; 3. By archetype; 4. Cross-cutting; 6. Rules with no or partial machine check)
- airtight-124a: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md (Appendix §B10; Appendix §B12)
- airtight-v3-122: docs/specs/01-pipeline/122_pipeline_step_optimization.md (5.5 Condition 4)
- airtight-v2-122: docs/specs/01-pipeline/122_pipeline_step_optimization.md (6.6.1 Registry and ledger truth)
- airtight-122a: docs/specs/01-pipeline/122a_step_optimization_appendix.md (Appendix §A26; Appendix §A27)
- eng-s3-s9: docs/specs/00_engineering_standards.md (3. Database Management; 9. Pipeline & Script Safety)
- eng-s2-s4-s10-s11: docs/specs/00_engineering_standards.md (2. Error Handling; 4. Security & API Contracts; 10. Frontend/Backend Boundary; 11. Plan Compliance Checklist)
- eng-s5-s9-s14: docs/specs/00_engineering_standards.md (5. Testing Standards; 9. Pipeline & Script Safety; 14. The Prevention Loop)
- eng-s5: docs/specs/00_engineering_standards.md (5. Testing Standards)
- bylaw-133: docs/specs/01-pipeline/133_bylaw_handbook.md (2. Rules by provision family)
- storage-doc16: backlog/docs/doc-16 - McStorage-policy-v2.md (whole) [draft, operator to confirm it binds]
- surface-136: docs/specs/02-web-admin/136_mcfrontend_handbook.md (2. Rules)
- surface-126: docs/specs/02-web-admin/126_maxbld_surface_standard.md (whole)
- surface-127: docs/specs/02-web-admin/127_surface_conversion_procedure.md (whole)
- surface-135: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md (whole)
- surface-128: docs/specs/02-web-admin/128_surface_standard_policy.md (whole)
- mobile-90: docs/specs/03-mobile/90_mobile_engineering_protocol.md (whole)
- mobile-98: docs/specs/03-mobile/98_mobile_testing_protocol.md (whole)
- mobile-99: docs/specs/03-mobile/99_mobile_state_architecture.md (whole)
- mobile-100: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md (whole)
- mobile-96: docs/specs/03-mobile/96_mobile_subscription.md (whole)
- queue-137: docs/specs/00-architecture/137_mcqueue.md (whole)
- agents-s7-s11: docs/specs/00-architecture/08_agents.md (7. Rules & economics; 11. Grounded Verification Protocol)
- agents-s5-1to3: docs/specs/00-architecture/08_agents.md (5.1 Compliance; 5.2 Ground-truth; 5.3 Round-2 adjudication)
- orchestrator-doc17: backlog/docs/doc-17 - Orchestrator-readings-not-rulings.md (whole)
- inc-F..inc-AL: the requirements document of the milestone group letter (backlog/docs/increments/doc-1..doc-15)
Corrections to the starting rows, stated: Spec 124 R-BA does not live in Spec 124: its row is in 124a_step_standard_policy_appendix.md (R-BA row at :240 under the heading "Appendix §B10", V3 rows under "Appendix §B12"), so the Airtight lists are 124a B10 and B12, 122 section 5.5 (V3 checklist near :809), 122 section 6.6.1 (V2 near :1042), 122a A26 and A27. Two rows ADDED (the starting rows left this lane's own Files line unmatched): lane-tools and tests. Per the coordinator's addition (operator 2026-11-20 "yes to McStorage and 1,2,3 yes as recommended") the surface and mobile rows attach Specs 126, 127, 128 and the full Spec 135 register whole. The storage row points at doc-16 with the status field "draft, operator to confirm it binds"; lane BL-STN1 (task-90) is landing McStorage in the rule records: the row must follow wherever that lane says the rules now live.

## Sample brief block (a mobile file plus an API route; real output of backlog-lane.mjs --dry-run on a temp board, sample.mjs)
```
THE RULE LISTS THAT GOVERN THIS TASK (Rule lists that govern this task; resolved from the Files line through scripts/analysis/rule-lists.json: data decides; 13 lists; READ each whole before planning, never hand-pick a clause):
- mobile-90: docs/specs/03-mobile/90_mobile_engineering_protocol.md (whole file) [hand-written] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- mobile-98: docs/specs/03-mobile/98_mobile_testing_protocol.md (whole file) [hand-written] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- mobile-99: docs/specs/03-mobile/99_mobile_state_architecture.md (whole file) [hand-written] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- mobile-100: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md (whole file) [hand-written] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- mobile-96: docs/specs/03-mobile/96_mobile_subscription.md (whole file) [hand-written] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- surface-136: docs/specs/02-web-admin/136_mcfrontend_handbook.md (sections: 2. Rules) [scripts/surfaces/generate-surface-handbook.mjs] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- surface-126: docs/specs/02-web-admin/126_maxbld_surface_standard.md (whole file) [hand-written] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- surface-127: docs/specs/02-web-admin/127_surface_conversion_procedure.md (whole file) [hand-written] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- surface-128: docs/specs/02-web-admin/128_surface_standard_policy.md (whole file) [hand-written] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- surface-135: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md (whole file) [hand-written] why: the mobile app is governed by Specs 90, 98, 99, 100, 96 and Spec 136, plus the surface contract and register (Specs 126, 127, 128, 135) for its surface files
- eng-s2-s4-s10-s11: docs/specs/00_engineering_standards.md (sections: 2. Error Handling; 4. Security & API Contracts; 10. Frontend/Backend Boundary; 11. Plan Compliance Checklist) [hand-written] why: API routes and src/lib are governed by engineering standards sections 2, 4, 10 and 11
- storage-doc16: backlog/docs/doc-16 - McStorage-policy-v2.md (whole file) [hand-written; status: draft, operator to confirm it binds] why: a report computed or stored under src/lib/parcels, src/lib/report-projection or src/app/api/parcels is governed by the McStorage policy (doc-16; DRAFT, attached anyway: the operator confirms it binds)
- inc-S: backlog/docs/increments/doc-2 - Increment-S-requirements.md (whole file) [hand-written] why: every task also gets the requirements document of its increment (the milestone group letter)

[lens line, compliance part]
Compliance lens, ONCE PER RULE LIST (the lists of the "Rule lists that govern this task" input, each pasted WHOLE ahead of the material; a list is never trimmed): for each list id L and each phase P (plan: material = docs/reports/reviews/task-1/context-2026-11-20.md; out: material = the diff file), `node scripts/analysis/rule-lists.mjs lens-input --list L --material <material> --out <lane dir>/in-P-compliance-L` writes the input file (list part first, then the material; parts -p1..-pN only when list plus material would pass the review tool's 120000 character bound), then `DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r $HOME/Buildo/node_modules/dotenv/config scripts/deepseek-review.js review <each input file> --template .claude/review-templates/lens-compliance.md > P-compliance-L[-pN].txt`. Files to produce, one per list: plan-compliance-mobile-90.txt, out-compliance-mobile-90.txt; plan-compliance-mobile-98.txt, out-compliance-mobile-98.txt; plan-compliance-mobile-99.txt, out-compliance-mobile-99.txt; plan-compliance-mobile-100.txt, out-compliance-mobile-100.txt; plan-compliance-mobile- ...
```

## Acceptance criteria with evidence
| # | criterion | evidence |
|---|---|---|
| 1 | the path to rule-list table is data, a test that every listed rule file exists | scripts/analysis/rule-lists.json; src/tests/backlog/rule-lists.logic.test.ts "the real table" (validate: files, one heading per selector, every glob matches a tracked path); `node scripts/analysis/rule-lists.mjs validate` printed `rule-lists: ok 40 lists, 10 rows`; green in commit.out (87 passed) and commit2.out (43 passed) |
| 2 | a brief for a task touching mobile/ and src/app/api names every list (test, red first) | rule-lists.logic "a mobile file plus an API route names every list of both rows" and backlog-lane.logic "attaches the rule lists by touched path"; red.out (40 failing, commit refused), green 03cd4e3e0; sample block above |
| 3 | close is refused without one lens output per attached list (test, red first) | check-lane-close.logic "the lens set (AC #3)"; red.out, red3.out (11 failing, refused), green 50f82611e |
| 4 | close is refused without a grounder verdict file from a different agent (test, red first) | check-lane-close.logic "the separate grounder (AC #4)"; same red/green; this lane's own dir: `node dogfood.mjs` printed only `REFUSED: task-366: GROUNDER.md is missing ...` (grounder owed) |
| 5 | Spec 08 and Spec 137 carry the dated note with the operator words | docs/specs/00-architecture/08_agents.md (under 5.3, before 5.4) and 137_mcqueue.md (end of section 4, before section 5): "Dated note 2026-11-20 (M-246 ...)" with both operator quotes; README "Rule lists" section in .claude/review-templates/README.md |

Tests proven red then green through the real hooks (RR-0225): red.out (4 files failed, 40 tests; commit refused), red2.out (3 tests failed), red3.out (11 tests failed); green commit.out (03cd4e3e0: 87 passed) and commit2.out (50f82611e: 43 passed). `npm run typecheck` ran in every commit attempt (clean on the landed ones).

## Hook tails (pasted)
commit.out (03cd4e3e0): `[wf1/inc1b-comply2 03cd4e3e0] feat(08_agents): rule lists attached by touched path; ... (COMPLY.2)` / ` 17 files changed, 1284 insertions(+), 14 deletions(-)`; Test Files 5 passed (5), Tests 87 passed (87).
commit2.out (50f82611e): `POLICY CHECKS OK (commit-msg): 5 file(s)` / `[wf1/inc1b-comply2 50f82611e] fix(08_agents): close check needs the lens set, a ruled-output hash and quoted verdicts ...` / ` 7 files changed, 295 insertions(+), 171 deletions(-)`; Test Files 2 passed (2), Tests 43 passed (43). `backlog doctor`: "No duplicate IDs, self-referential dependencies, or dependency cycles found."

## Commit shas
After the rebase onto wf2/board (the shas changed): 7f8d5ecd7 (table, helper, launch attach, close check v1, notes, README, review-template fix), 28f902a81 (round-1 fixes, the stricter close check), 273cd1892 (report v1), 30580a04b (round 3: the grounder's attacks), 7e8eedac1 (row exclusion). The report commit follows (docs/reports/lanes/2026-11-20/BL-COMPLY2/).

## Enabling fixes in the review tool (small, red first, named as the coordinator allowed)
(a) scripts/lib/review-template.js substitutePlaceholders: one pass with a function replacer (a pasted value held dollar sequences and token text; measured: this lane's own plan review produced a 317388 character prompt against the 120000 bound). Tests in src/tests/review-template.logic.test.ts. (b) .claude/review-templates/lens-compliance.md: the plan placeholder appeared twice (once in its own prose) so the material was sent twice; the prose no longer carries the token; test in review-lens-template.infra.test.ts. Listed, NOT fixed: lens-code-review, lens-error-paths, lens-ux, lens-security, plan-review-gemini still carry the token twice (material sent twice, bound halved: the code-review and error-paths runs of this lane used a code-only diff for that reason).

## The push-range arm (not built; what it needs)
closeErrors, resolveTask, findingsIn, lensSet, ruledLine and filesEntries are exported. A `--push` arm in scripts/analysis/mcbylaws/gate.mjs (pre-push:41 composes arms per range) would, per ref range: list the commits (git rev-list); for each commit read the `Task:` trailer and refuse a commit that changes src, scripts, mobile or migrations with NO trailer (G3 only runs at commit time and --no-verify defeats it); for each commit that moves a task file to BUILT or DONE call closeErrors with the task text at that commit, the lane files read with git ls-tree at that commit and readRepo = git show <commit>:<path>; refuse the push on any line. It needs commit-level readers (the hook reads the index), a FAIL: code in the gate's vocabulary and a decision on grandfathering tasks closed before this commit.

## What the check still CANNOT prove
That the grounder did the work well or opened more than the lines it quoted; that a lens output was not edited before the grounder received it (the Ruled hash binds only what the grounder saw: keep the raw redirect outside the lane's reach or re-run); that the lens outputs are the right lens run on the right material; positional finding ids shift when a lens is re-run (a re-run needs fresh verdicts); every docs/reports/lanes/*/<lane>/ is pooled (a lane name reused across tasks can satisfy a later close with an earlier task's outputs); a lane that deletes the highest -pN output.

## Findings
See FINDINGS.md in this directory: 178 findings by id (plan 23, output round 1 55, round 2 50, round 3 50) with the lane's note on each and answers to the coordinator's seven points. The VERDICTS are the separate grounder's.

## UNVERIFIED
- The 178 findings (not opened by the lane except where FINDINGS.md says fixed).
- Real launch on the live board (only dry-run on the real board and temp boards): backlog-lane.mjs against ~/Buildo-wt-board was run with --dry-run only.
- The date of the lane dir (every lane date counts), a lane with the same name on two tasks.
- Whether the table's by-law row (layer23) matches by-law rows data files (it reuses the McBylaws gate's own code path list; no by-law data file is under it).

`node ~/Buildo-scratch/panel-tools/gate.mjs gate --lane BL-COMPLY2 ...` printed GATE PASS (see the first report; re-run below).

## Round 3: the grounder's attacks (REFUSED, each with its test, RED first in red4.out, GREEN in commit4.out)
The coordinator's message named twelve numbered closes ("CLOSE (1)-(10)", "LAUNCH (11)-(12)") for 13 attacks that got through; (2) and (6) each cover two attacks, so the rows below are 14. Every refusal line below is pasted from the real hook (scripts/hooks/check-lane-close.mjs, rule-lists.mjs, backlog-lane.mjs) run by the test in the landed commit 30580a04b (commit4.out, `ATTACK n:` lines); the attack tests are in src/tests/backlog/check-lane-close.logic.test.ts, rule-lists.logic.test.ts, backlog-lane.logic.test.ts and src/tests/review-lens-template.infra.test.ts.

| # | attack | test | refusal line (real run) |
|---|---|---|---|
| 1 | a finished status other than BUILT/DONE (MERGED) skipped the check | check-lane-close.logic "ATTACK 1" | REFUSED: check-lane-close: GROUNDER.md has no "Grounder: <name>" header line |
| 2a | a wrong-task trailer, or no trailer, avoided the check | "ATTACK 2a" | REFUSED: check-lane-close: task-7: GROUNDER.md is missing in docs/reports/lanes/<date>/BL-COMPLY2/ (a build or fix task always needs a separate grounder verdict) |
| 2b | the board auto-commit (docs message, only the task file staged) | "ATTACK 2b" | REFUSED: check-lane-close: task-7: no docs/reports/lanes/<date>/BL-COMPLY2/ holds a TASK file naming exactly task-7 (a lane report dir is scoped to one task: write the task id in TASK; a dir used for another task does not count) |
| 3 | grounder named comply2-b / comply-2 (contains or is the lane or an assignee) | "ATTACK 3" | REFUSED: check-lane-close: GROUNDER.md: Grounder "comply-2" is the lane (BL-COMPLY2) or a name that contains or is contained in it; a separate agent must ground |
| 4 | one-word quote, short reason, one quote reused, a boilerplate line | "ATTACK 4" | REFUSED: check-lane-close: GROUNDER.md: finding out-compliance-first#1: the quote must be 20+ characters taken from src/a.ts:1 / REFUSED: check-lane-close: GROUNDER.md: finding out-compliance-first#1 has the same quote as out-code-review#1; each finding needs its own quote from the line i |
| 5 | finding lines the strict matcher misses (bold, numbered, lower case, colon, quoted) | "ATTACK 5" | REFUSED: check-lane-close: task-7: out-code-review.txt: finding lines altered or unparsable (the strict reading counts 0 BUG/DEFER lines, a loose reading 1): restore the review tool's own output |
| 6a | a lens output with only a VERDICT line, no review header | "ATTACK 6a" | REFUSED: check-lane-close: task-7: list first (docs/a.md) has no valid compliance lens output in docs/reports/lanes/<date>/BL-COMPLY2/: write out-compliance-first.txt (out-compliance-first.txt: no REVIEW header in its first lines (the review tool wri |
| 6b | a header for another template, an input hash that is not the committed input, an edited or shortened list re-stamped | "ATTACK 6b" | REFUSED: check-lane-close: task-7: list first (docs/a.md) has no valid compliance lens output in docs/reports/lanes/<date>/BL-COMPLY2/: write out-compliance-first.txt (in-out-compliance-first.txt: the / REFUSED: check-lane-close: task-7: list first (docs/a.md) has no valid compliance lens output in docs/reports/lanes/<date>/BL-COMPLY2/: write out-compliance-first.txt (the committed inputs do not carr |
| 7 | the lane report dir reused for another task | "ATTACK 7" | REFUSED: check-lane-close: task-7: no docs/reports/lanes/<date>/BL-COMPLY2/ holds a TASK file naming exactly task-7 (a lane report dir is scoped to one task: write the task id in TASK; a dir used for another task does not count) |
| 8 | a path changed in the lane but not on the Files line; a build task whose Files are only exempt paths | "ATTACK 8" | REFUSED: check-lane-close: task-7: 1 changed path(s) are outside the task's Files line: src/sneaky.ts (declare them on the task or move them to their own task) / REFUSED: check-lane-close: task-7: the Files line of a build task resolves to no rule list (only exempt paths: docs/reports/lanes/x/); a build or fix  |
| 9 | no @lane assignee, or the assignee dropped in the closing commit | "ATTACK 9" | REFUSED: check-lane-close: task-7: a build task closes only with an @lane-<name> assignee (the assignee @lane-BL-COMPLY2 was dropped in the closing commit): take it through the launch script; no lane report can be checked otherwise |
| 10 | a commit that edits the check/hook and also closes a task | "ATTACK 10" | REFUSED: check-lane-close: this commit changes protected path(s) (.husky/commit-msg) and also moves task-7 - Lan to a finished status: land the check or hook change first, close the task in a later commit (self-edit rule, COMPLY.2) |
| 11 | launch with another rule table (--rule-lists); a build task with only exempt Files | backlog-lane.logic and rule-lists.logic "ATTACK 11" | REFUSED: backlog-lane: refused: --rule-lists /var/folders/8l/mcyqkj6d1pd5nm0bry4bql100000gn/T/bl-lane-A4OojE/fake-table.json is not the repo table (/Users/brettpreston_macmini/Buildo-wt-comply2/script |
| 12 | real paths with no row (components, app, middleware, package.json, CI); surface importers without Specs 126/128 | rule-lists.logic "ATTACK 12" | RESOLVES: src/components, src/app, src/middleware.ts, package.json, .github ; importer lists eng-s2-s4-s10-s11,surface-126,surface-128,storage-doc16,inc-S |

## Round 3: what changed, in the order the coordinator gave it
- CLOSE (1) finished statuses are data (rule-lists.json finished_statuses: BUILT, DONE, MERGED; DROPPED, FROZEN, OPERATOR are not finished). (2) the check runs for every staged task file whose status moves to a finished status, trailer or none. The board auto-commit (scripts/board/board-commit.zsh) runs `git commit` through the real hooks, so the commit-msg hook runs the check there too (test "ATTACK 2b"); a refusal is a WARN line in .board/board-commit.log and the edit stays in the tree. Until this branch lands on wf2/board the board checkout has no table and no check (the hook returns 0 for a repo that never had the table): what re-checks it before that is the push-range arm (next task, exports in place: closeErrors, resolveTask, findingsIn, lensSet, ruledLine, coveredBy, parseLensInput, looseFindingCount). (3) grounder names are compared with case, punctuation and digit separators removed and refused on containment (3+ characters). (4) quotes 20+ characters, distinct per finding, not on a line occurring more than 3 times in the cited file, REJECTED and CONFLICT reasons 30+. (5) a loose reading of the finding lines must count the same as the strict one. (6) scripts/deepseek-review.js now writes `REVIEW template=.. model=.. at=.. file_sha256=.. prompt_sha256=..` before anything else in lens mode; lens-input stamps `LIST <id> sha256:<hex> material sha256:<hex> part i of n`; the check requires the header on every required output, matches file_sha256 to the committed input in-<output name>, recomputes the stamped list hash and requires the parts to carry the whole list as it is now. (7) a file TASK holding the task id scopes the lane report dir (the smaller of the two options). (8) Files against the diff: paths changed since the merge-base with base_ref (wf2/board) or staged, outside docs/reports and backlog, must be covered; a build or fix task whose Files resolve to no rule list is refused. (9) build, fix and check tasks need an @lane assignee, and may not drop it in the closing commit. (10) protected_paths in the table (this check, the table, the helper, the review tool, .husky/*) may not change in a commit that also closes a task.
  What else protects them, stated: mcbylaws/protected-paths.json already lists .husky/* in protected (a push needs the owner y); it says it is edited by the MB-67 lane only, so I did NOT add the other four paths there: that is an MB-67 owner commit (owed: scripts/hooks/check-lane-close.mjs, scripts/analysis/rule-lists.mjs, scripts/analysis/rule-lists.json, scripts/deepseek-review.js).
- LAUNCH (11) --rule-lists with a table other than the repo one is refused unless RULE_LISTS_ALLOW_OVERRIDE=1 (the tests set it); a build or fix task whose Files are only exempt paths is refused at launch and at close. (12) rows added: ui-app (src/components/**, src/app/** to eng-s1 and eng-s2-s4-s10-s11), middleware-config (src/middleware.ts, package.json, .github/** to eng-s2-s4-s10-s11 and eng-s5-s9-s14), surface-importers (src/lib/**, src/app/api/** that import from src/lib/surfaces or scripts/surfaces: Specs 126 and 128; the import match is anchored on the resolved module path, comments and strings are not imports). One more data change found by this lane's own run: a row may exclude paths (`not`), so scripts/deepseek-review.js and scripts/gemini-review.js (matched by the step row's scripts/*.js) are lane tools, not step shells (red5.out). No Files line was written into any of the 178 tasks and the push arm is not built.

## What no check can prove (kept plain)
- That the grounder judged well: a grounder can quote a real, distinct, specific line and still be wrong about the finding.
- That a quote is relevant to the finding it is attached to (only that it exists on that line and is not boilerplate).
- That the grounder is truly a different agent: the check compares names; an agent can use any name that is not close to the lane or an assignee.
- That a lens output is the right lens run on the right material: the header and hashes bind the output to the committed input and the list text, not to the diff the lane meant to review (a lane can choose a trivial material).
- That the raw output was not edited before the grounder saw it.
- Positional finding ids shift when a lens is re-run; every docs/reports/lanes/*/<lane>/ for the lane is scanned only through the dirs whose TASK names the task; a lane that deletes the highest -pN output (with its input) is not detected.

## Hook tails (round 3, pasted)
red4.out: Test Files 4 failed (4), Tests 18 failed | 76 passed (94); commit refused. red5.out: Test Files 1 failed (1), Tests 1 failed | 27 passed (28); commit refused.
commit4.out (30580a04b): Test Files 4 passed (4), Tests 94 passed (94); landed. commit5.out (7e8eedac1): Test Files 1 passed (1), Tests 28 passed (28); landed.
Dogfood on this lane's own report dir (the closing commit's view, node dogfood.mjs): `REFUSED: task-366: GROUNDER.md is missing in docs/reports/lanes/<date>/BL-COMPLY2/ (a build or fix task always needs a separate grounder verdict)` and nothing else: every lens output has its REVIEW header, its committed input and its hash; the loose and strict finding counts agree; Files cover the diff.

## UNVERIFIED (round 3 additions)
- That the board job's WARN-and-leave behaviour on a refusal is what the operator wants (it follows from board-commit.zsh warn(); not changed).
- That the review tool's REVIEW header survives a real (non dry-run) call: the header is printed before the call and tested through --dry-run only; the round-3 outputs in this directory carry it from real calls (grep -c '^REVIEW' on each).
- That the refused cases are all the shortcuts: the grounder's list was 13; others may exist.

GATE: `gate.mjs gate --lane BL-COMPLY2 ... --allow-ref-move` re-run after this update printed `GATE PASS (BL-COMPLY2): output exists: ./REPORT.md; output exists: ./red.out; ...`.

STATUS: ready (task-366 stays RUNNING: grounder owed)
