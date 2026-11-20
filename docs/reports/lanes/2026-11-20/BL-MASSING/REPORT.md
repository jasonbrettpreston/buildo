# REPORT: BL-MASSING (task-396, FIX.MASSING)

1. Nothing changes for a person: the unused copy of the two thresholds (20 and 60 sq m) and its classifier in src/lib/massing/geometry.ts is deleted; nothing in the app called it.
2. No goldens moved (no step or compute file touched); the registered source (seed rows massing_shed_threshold_sqm 20 and massing_garage_max_sqm 60, read by scripts/lib/compute/link-massing.js) stays as the one source.
3. What stays code: the storey heights STORY_HEIGHT_M = 3.0 and STORY_HEIGHT_BY_USE_TYPE (residential 2.9, commercial 4.0, industrial 4.5, mixed-use 3.5) in src/lib/massing/geometry.ts: listed only, left alone as briefed.
4. Unverified: phone-test green is unproven until Mobile CI (no mobile file touched); no full suite run (push station only); every lens finding is untriaged, grounder owed.
5. Operator items: none from this lane. The two plan-stage and output-stage findings about the dropped "DB mirror migration" and the missing rule-list row for the settings seed file are in FINDINGS.md for the grounder; this lane registered nothing, so no migration or seed row was written.

## Evidence
- Grep (git grep -n over src mobile scripts, before the change): run-time callers none. Src hits: src/lib/massing/geometry.ts:27,30,53,62,63 (definitions), src/tests/massing.logic.test.ts:9,21,22,65-90 (test only). Other hits are different functions: scripts/lib/compute/link-massing.js:330 `function classifyStructure(areaSqm, allAreas, shedThreshold, garageMax)` (thresholds passed in), scripts/lib/optimal-config.js:43 `GARAGE_MAX_SQM: 60` (own BYLAW object, not an import), src/lib/classification/coa-scope-classifier.ts:291 classifyStructureType (different name). Importers of geometry.ts after the change: src/app/api/permits/[id]/route.ts:5 (resolveStories, inferMassingUseType), src/components/permits/BuildingMassing.tsx:4 (format helpers), tests.
- Red: red.out, a commit attempt with only the new test and the task file staged: `Tests  1 failed | 6 passed (7)` at src/tests/link-massing.infra.test.ts:93.
- Green: commit.out, commit 602534215 through the real hooks: `Test Files  1 passed (1) Tests  13 passed (13)` and `Test Files  4 passed (4) Tests  108 passed (108)`; typecheck `tsc --noEmit` clean; 25 of 25 --check scripts from .husky/pre-commit PASS before (checks-before.txt) and after (checks-after.txt).
- Diff: geometry.ts -30 lines (the three names, the now-unused StructureType import), massing.logic.test.ts -34 (classifyStructure block, three imports), link-massing.infra.test.ts +5 (new lock).
- Lock decision: RETAINED the compute lock at src/tests/link-massing.infra.test.ts:84-85 unchanged, and ADDED beside it one lock that geometry.ts holds none of classifyStructure, SHED_THRESHOLD_SQM, GARAGE_MAX_SQM. The compute boundary proof (massing.logic.test.ts B13, now :406-412, classifyStructure(15|45 ...) shed/garage with 20/60) and the seed value lock (link-massing.infra.test.ts:24 default 20, :33 default 60) remain.
- Quote check: operator words "Let the grounder resolve them all as long as the result is compliant" verified at ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476; Spec 126 P4 verified at docs/specs/*/126*.md:189.
- Lenses (DeepSeek via the repo review tool): plan: plan-review-deepseek, error-paths, 8 compliance lists; out: code-review, error-paths, 8 compliance lists; files in docs/reports/lanes/2026-11-20/BL-MASSING/ with in- inputs, TASK, FINDINGS.md (92 lines by id). Output verdicts: code-review PASS, error-paths PASS; compliance PASS for v2-122, v3-122, inc-S, step-132; FAIL for 122a, 124a, eng-s2-s4-s10-s11, eng-s5. I give no verdicts on findings. Plan-stage verdicts all FAIL; I did not change the plan on them (no triage by this lane).
- Not done by brief: no GROUNDER.md (owed, separate grounder); task left RUNNING; milestone untouched; no push, no DB, no migration.
- Report gaps UNVERIFIED: the Spec 126 P4 text on the storey heights is flagged by many plan findings (the storey heights stay typed in src); the brief ordered them listed only.

## Follow-up round (grounder ruled 92 findings: 3 CONFIRMED, 81 REJECTED, 8 CONFLICT)
- The settings seed scripts/seeds/logic_variables.json has no rule-list row; owner task-406 (V2.LIST, which replaced task-403).
- B13 (massing.logic.test.ts:406-415) gained three value assertions on the compute function: (10,[10],20,60) primary; (80,[150,80],20,60) other; (100,[100,100],20,60) primary. All hold against scripts/lib/compute/link-massing.js:330-337.
- The task description's operator quote "you need to resolve these?": grep -n -i "resolve these" over ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md finds nothing; not found there (description not edited).
- After `git rebase wf2/board` the commit shas changed; the work commit is now c40c5406d.
- GROUNDER.md copied byte for byte (sha256 2de8c8e557e95acbbfd85386e573080a34aebe04b52f7a9d9dfba9b6930b85e0).

STATUS: BL-MASSING task-396 ready for grounder; commit 602534215 on wf1/inc1b-massing, task RUNNING, grounder owed.
