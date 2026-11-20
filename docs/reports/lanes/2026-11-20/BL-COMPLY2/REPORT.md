# REPORT: BL-COMPLY2, task-366 COMPLY.2 (rule lists attached by touched path; close needs a lens set per list and a separate grounder verdict)

Six plain lines for the operator

1. A lane now receives, at launch, the rule lists its task's Files line attaches (from the data table scripts/analysis/rule-lists.json): each named with its file, sections and why, "READ each whole before planning", plus the requirements document of its increment; and the compliance lens line now runs once per list with that list pasted whole ahead of the plan or diff (helper `rule-lists.mjs lens-input`, split by the list's own headings when it would pass the 120000 character bound, never trimmed).
2. The commit that sets a lane's task BUILT or DONE is now refused unless the lane report holds the lens set for the task type (compliance per list, plus code-review and error-paths, ux and security by the Files line, and a plan-stage output) and a GROUNDER.md from an agent that is not the lane or any assignee, restating the sha256 and finding count of every lens output (an output edited after grounding is refused) with a verdict, file:line and a quote that really is on that line of a repo file for every finding. A code commit that closes a task with no lane assignee is refused too.
3. Reused, not rebuilt: mcbylaws/protected-paths.json (keys layer23 = by-law code, frontend = McFrontend surfaces) is read by the table (globs_from) and its glob matcher scripts/analysis/mcbylaws/paths.mjs does the matching. No existing map goes file to rule (surface-rule-map.json and the handbook rule maps go rule to handbook line; Target Files sections list a spec's own files).
4. A task with no Files line, or a Files path no row matches, is refused at launch with the path named (record-only tasks get the queue lists). Measured on the real board: of 240 LATER/WAITS tasks only 56 would launch today, 178 have no Files line, 6 name a path no row matches (docs/specs/02-web-admin/, docs/specs/03-mobile/, tests/, src/components/report/): those need Files lines or rows before launch.
5. Not built: the push-range arm (reported below), a by-law rulings register list (69a is a 1.2 MB heading-less table, owed), the scratch standing-rules file that brief.mjs reads (outside this lane's write scope; the grounder rule is written into the text backlog-lane.mjs generates), plan-stage compliance per list, the other four lens templates' doubled plan placeholder.
6. Unverified: that the grounder, once launched, does its work well (the check cannot prove it), the 128 findings (verdicts owed), and the lens outputs saw only the code diff, not the tests. GROUNDER OWED: the task stays RUNNING.

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
03cd4e3e0 (table, helper, launch attach, close check v1, notes, README, review-template fix), 50f82611e (round-1 fixes and the stricter close check). The report commit follows (docs/reports/lanes/2026-11-20/BL-COMPLY2/).

## Enabling fixes in the review tool (small, red first, named as the coordinator allowed)
(a) scripts/lib/review-template.js substitutePlaceholders: one pass with a function replacer (a pasted value held dollar sequences and token text; measured: this lane's own plan review produced a 317388 character prompt against the 120000 bound). Tests in src/tests/review-template.logic.test.ts. (b) .claude/review-templates/lens-compliance.md: the plan placeholder appeared twice (once in its own prose) so the material was sent twice; the prose no longer carries the token; test in review-lens-template.infra.test.ts. Listed, NOT fixed: lens-code-review, lens-error-paths, lens-ux, lens-security, plan-review-gemini still carry the token twice (material sent twice, bound halved: the code-review and error-paths runs of this lane used a code-only diff for that reason).

## The push-range arm (not built; what it needs)
closeErrors, resolveTask, findingsIn, lensSet, ruledLine and filesEntries are exported. A `--push` arm in scripts/analysis/mcbylaws/gate.mjs (pre-push:41 composes arms per range) would, per ref range: list the commits (git rev-list); for each commit read the `Task:` trailer and refuse a commit that changes src, scripts, mobile or migrations with NO trailer (G3 only runs at commit time and --no-verify defeats it); for each commit that moves a task file to BUILT or DONE call closeErrors with the task text at that commit, the lane files read with git ls-tree at that commit and readRepo = git show <commit>:<path>; refuse the push on any line. It needs commit-level readers (the hook reads the index), a FAIL: code in the gate's vocabulary and a decision on grandfathering tasks closed before this commit.

## What the check still CANNOT prove
That the grounder did the work well or opened more than the lines it quoted; that a lens output was not edited before the grounder received it (the Ruled hash binds only what the grounder saw: keep the raw redirect outside the lane's reach or re-run); that the lens outputs are the right lens run on the right material; positional finding ids shift when a lens is re-run (a re-run needs fresh verdicts); every docs/reports/lanes/*/<lane>/ is pooled (a lane name reused across tasks can satisfy a later close with an earlier task's outputs); a lane that deletes the highest -pN output.

## Findings
See FINDINGS.md in this directory: 128 findings by id (plan 23, output round 1 55, output round 2 50) with the lane's note on each and answers to the coordinator's seven points. The VERDICTS are the separate grounder's.

## UNVERIFIED
- The 128 findings (not opened by the lane except where FINDINGS.md says fixed).
- Real launch on the live board (only dry-run on the real board and temp boards): backlog-lane.mjs against ~/Buildo-wt-board was run with --dry-run only.
- The date of the lane dir (every lane date counts), a lane with the same name on two tasks.
- Whether the table's by-law row (layer23) matches by-law rows data files (it reuses the McBylaws gate's own code path list; no by-law data file is under it).

`node ~/Buildo-scratch/panel-tools/gate.mjs gate --lane BL-COMPLY2 --report REPORT.md --outputs red.out,commit.out,FINDINGS.md,REPORT.md --scope <lane dir>,~/Buildo-wt-comply2 --snapshot START.snapshot.json --allow-ref-move` printed: `GATE PASS (BL-COMPLY2): output exists: .../REPORT.md; output exists: .../red.out; ...`

STATUS: ready (task-366 stays RUNNING: grounder owed)
