# Seat: regression: task-448 plan (PLAN-448-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head daf3f7201. The plan says it was read at a75713110, and the two commits between them add the task-448 card and decision-209 (RR-0424). Files read: the whole task-448 card; MD:1515-1525, 1851-1856 and 2135-2177; PLAN-418-v1.md section C; GROUNDER-PLAN-418-v1.md V6; scripts/analysis/rule-lists.json; rule-lists.mjs (resolveTask, candidates); check-lane-close.mjs :262-282, :383-426, :498-506, :688-716; backlog-lane.mjs :180-192; mcbylaws/cite-arms.mjs and paths.mjs; the three test files at the cited lines; check-lane-close.logic.test.ts :344-355; Spec 08 :229, :356, :360, :361, :480-490; Spec 137 :134 and :136; decision-209; FOLD-CHECK.md of tasks 367, 442 and 441; commits d04026fe5, 4fca5346d, 005cb438e, 48f251d38 and cb026342c.

Method: I applied the plan's table edits in memory with small node scripts. I ran resolveTask over every tracked file and over the exact-equal assertions. No file was written. Everything below is read-only.

## Checked and clean
- **Brief sentence 3.3 against the close check.**
  - listProof proves only base names `out-<seat>-<id>[-pN].txt`, so a `-rN` file never stands in for round 1.
  - The round number comes from `Review round N:` lines in the HEAD copy of the Final Summary (:274-275, `headText`).
  - Task-446 (d04026fe5) and task-442 (4fca5346d, 005cb438e) match the sentence. Round 2 was re-made under the base names, the `-r2` files were deleted, and round 1's grounder and triage sat outside the repo.
  - Spec 08:360 (task-399 note) already says "every lens output re-run under the same names".
  - The grounder sentence at backlog-lane.mjs:189 does not contradict it. The PARITY fragments at test :290 and :298 survive, because the plan keeps `-rN.txt` in the text.
- **The `not` globs.**
  - `prereg-MF-**` matches `prereg-MF-*` of any extension and any depth.
  - It does not match `prereg-MFX-1.json`, `prereg-MB-*`, or a file in a subfolder.
  - `prereg-MF-*.json` (panel-records) does not cross `/` or match `.json.bak`.
  - A non-json `prereg-MF-*` file would resolve to no row and be refused, which fails closed.
  - 63 MF pre-registrations are tracked. The cite arms (cite-arms.mjs:36 and :69, `MF_NAMED`) work from file names and trailers, not from the table, so they still run for MF files.
- **Path kinds with code and no handbook and no engineering list (item 3).** I resolved all 13,893 tracked files against the edited table. Only record kinds end with just the four every-task lists: `docs/reports/panels`, the 63 MF pre-registrations, `.cursor/*QUEUE*`, `review_followups.md` and `backlog/**`. No code path loses both. The 20 table-edit anchors in 3.2 each occur once (the one planted twice is `gets them through the specs-web-admin row`, as the plan says).
- **Assertions the plan says stay green.** FILES_423 still resolves exactly 9 lists. Every exact `toEqual` the plan quotes resolves as stated, including `eng-all,five-words,plan-protocol,inc-1,ms-1` for the Spec 132 file. `validate` raises no complaint about unattached lists.
- **Earlier rulings kept.** RR-0378 and RR-0391 are kept: the lane-tools row keeps agents-s5-1to3, agents-s7-s11, queue-137, eng-all and orchestrator-doc17, as MD:2162 rules. The plan records the reversal of RR-0383 in the `why` text, in test titles and in the 08 and 137 notes. The task-366 and task-439 words it supersedes are named in 3.4 and 3.6.
- **Other open work.** No branch or worktree is ahead of the board on rule-lists.json, rule-lists.mjs, the three test files, backlog-lane.mjs or check-lane-close.mjs. The worktrees of hb367, thinroute, areafactor, fedb442, eng441, docs444, cfgbounds, chk6a and comply3 have no local edits to those paths. The page conflict with hb367 is already covered by the plan's "re-runs `page --write` if it lands second".

## rg#1 HIGH: the plan contradicts RR-0424 (decision-209, MD:2176-2177), which landed after the plan was read
Plan: Section 2 "No edit to scripts/hooks/check-lane-close.mjs"; section 2 "The refusal text at check-lane-close.mjs:502 stays as it is"; section 6 Files line; A9 `git diff --stat <launch>..HEAD -- scripts/hooks ...` expects empty; section 8 "The brief and the refusal disagree until a later task"; the last sentence of the 3.4 note ("the close check's refusal text still names the -rN form until a later task"); section 4 "check-lane-close.logic.test.ts ... Not pinned".
Evidence: MD:2177: "Ruled (RR-0424): task 448 also changes the one refusal-message clause at check-lane-close.mjs:502 (text only). This is the only edit to the close check". decision-209: "Operator, verbatim, 2026-11-23: \"add it\"". The put-to-him text says it "puts the close check file and one test comment into task 448". The test comment is check-lane-close.logic.test.ts:346: "the form the brief gives for a later round: out-<lens>[-<list id>]-r2.txt beside the round-1 file ... it pins what the brief now promises". The title of the test below it says "round 1 is not replaced", which is the opposite of the new brief. The clause to change is the layout literal at check-lane-close.mjs:502: "a later round (r2, r3, ...) is out-<lens>[-<list id>]-rN.txt". Parity test :290 and :298 require `out-<lens>[-<list id>]-rN.txt` in BOTH backlog-lane.mjs and check-lane-close.mjs.
Fix: fold RR-0424 in.
- Add check-lane-close.mjs (clause at :502 only) and check-lane-close.logic.test.ts (the :346 comment) to the Files line and to section 1.
- Reword that clause to the "same names; a `-rN` file is read for findings but never stands in for a round-1 name" form, and keep the literal `out-<lens>[-<list id>]-rN.txt` so the :290 and :298 parity pin stays green.
- Add a red-first line in the same style as the plan's `under the SAME names` line, pinned in both sources.
- Change A9 to "only the :502 clause", and drop the "disagree until a later task" known limit and the last sentence of the 3.4 note.
- Note that check-lane-close.mjs is a protected path, so the work commit must stay separate from the close, as the plan already says.

## rg#2 MED: the 3.4 note says the Spec 124 list stays on the lane-tools row; no row attaches it after the edit
Plan: 3.4, "Spec 08 sections 5.1 to 5.3, 7 and 11, Spec 137, doc-17 and the Spec 124 list stay on the lane-tools row only."
Evidence: lane-tools lists today are agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17. `policy-124-s2-s5` is attached only by generated-reports and generated-127, and the plan empties both. My in-memory run of the edited table returns the unattached lists: `airtight-124a airtight-v3-122 airtight-v2-122 airtight-122a storage-doc16 surface-126 surface-127 surface-135 surface-128 mobile-100 mobile-96 policy-124-s2-s5`. A dated note that misstates which rule lists remain attached is a false record in rule text.
Fix: drop "and the Spec 124 list" from that sentence. Add "Spec 124 sections 2 and 5 are attached to no row (Rule 13 stays enforced by gate J, the R-GW banner by spec-split-check.mjs:547)".

## rg#3 MED: the 3.5 fold-check note narrows Spec 08 section 11.2 beyond RR-0423
Plan: 3.5 "claims the fold did not touch were executed when the grounder ruled them and are not run again. This narrows 're-executes every claim in the fold' (:486)". Q1 asks the grounder this and does not escalate it.
Evidence: RR-0423 (MD:2171) says only "the plan grounder writes the fold check itself, once, after the last fold". The 2026-11-21 note at 08_agents.md:489 already has the grounder write FOLD-CHECK.md. Section 11.2 (:486) adds two sub-rules: "an expanded edit set kills every restated scope claim" and "Folds are read as a SET ... collisions between corrections adopted separately". Both concern text the fold did not edit. The past checks did exactly that: task-367 FOLD-CHECK (6) sampled "About 70 cited lines ... Unchanged cites hold", and its header says the first run "failed on four stale line cites"; task-441 (2) checks "Nothing else moved". A "changed claims only" scope would not require these.
Fix: do not write the narrowing. Make the note say only "the plan grounder writes FOLD-CHECK.md itself, once, after the last fold; scope unchanged (every claim in the fold, plus any restated claim or cite the folded text makes false)". If the narrowing is wanted, put it to the operator as a separate question.

## rg#4 MED: the append-only `why` edits leave the stale clause in place on the two rows RR-0423 names
Plan: 3.2, "Nothing is deleted, so the test-pinned phrases stay"; Q2.
Evidence: RR-0423 item 1 (MD:2171) is "the table's stale 'why' notes on the rows that lose lists (rule-lists.json:152 phone row, :140 compute row), a few words each". After the append, :140 still opens "gets the step standard and Airtight lists, because ...", :152 "governed by Specs 90, 98, 99, 100, 96 and Spec 136" (the plan does rewrite its opening, but the later clauses stay), and :133 still says "DRAFT, attached anyway". The pinned phrases are only on policy-reports (:45 test), reference-docs (:50), surface-contract-routes (:104-107). `grep` of the tests for "compute gates scan", "governed by Specs 90" and `.why` finds none on :140 or :152. So the risk that justifies append-only does not apply to those rows.
Fix: rewrite the false clause on :140, :152, :133 and :121, in place, and keep append-only only on the three pinned rows. The same applies to any row whose lead clause the appended text contradicts (:158, :171, :177, :183, :189, :195, :207, :213, :219).

## rg#5 MED: the step-pipeline edit (:88, four Airtight lists off) is pinned by no test
Plan: 3.1 row step-pipeline; section 4 "Designed red".
Evidence: `grep -n "airtight|step-pipeline"` across the three test files finds only rule-lists.logic.test.ts:53, which resolves `src/lib/parcels/report-compute.ts` (the compute-import row, not step-pipeline). Nothing resolves `scripts/steps/**` or `scripts/lib/compute/**`. So the edit is not seen red first. A later regain of the four Airtight lists on that row turns no test red; only the generated-page drift check notices, and regenerating the page silences it.
Fix: add to rule-lists.logic.test.ts :53 `for (const p of ['scripts/steps/x.mjs', 'scripts/lib/compute/x.js']) for (const l of AIRTIGHT) expect(lists(p)).not.toContain(l)` and `toContain('step-132')`. Add the same kind of exact pin for the surface-importers row (`lists` toEqual([])). Today its only pin is :61, which covers just 126 and 128.

## rg#6 MED: seven new exact-list assertions are tied to the current every-task, increment and milestone set
Plan: section 4, rule-lists-table.logic.test.ts :30, :34-37, :43, :48 and :240, plus rule-lists.logic.test.ts :71. Each is `toEqual(['eng-all'?, 'five-words', 'plan-protocol', 'inc-S', 'ms-S'])`, and :71 is order-dependent.
Evidence: rule-lists.json has `"every_task": ["five-words", "plan-protocol"]`. MD:2135 shows the operator floating more every-task lists: "Plan protocol, milestone obejctives , rulings and reference may make sense." Adding one every_task list, or another milestone list, would fail all seven assertions although no row changed. This is the "ordinary future list additions fail wrongly" case.
Fix: build the expected tail from the table, for example `const EVERY = [...t.every_task, 'inc-S', 'ms-S']` and `lists(p).filter((l) => !EVERY.includes(l))` toEqual the row lists (`[]` or `['eng-all']`). That still turns red when a row regains or loses a list.

## rg#7 LOW: the inverted N2 test only exercises the resolver
Plan: section 4, :360-361 (`lists: [...r.lists, ...FOUR]` then `expect(planted).toContain('surface-128')`).
Evidence: N2 was added in 48f251d38 (task-439, RR-0383) and N1 in the same file proves each planted defect with `expect(() => handbookOnly(surf, 'planted surfaces')).toThrow()`. The inverted N2 only checks that the planted row resolves to include 128, which is true by construction, and not that the lock at :358-359 fails on the planted table. The old form had the same weakness; the inversion keeps it.
Fix: replace :361 with `expect(() => handbookOnly(planted, 'planted')).toThrow();`.

## rg#8 LOW: the doc-16 "operator confirms it binds" status lock is deleted and not replaced
Plan: section 4, rule-lists.logic.test.ts :38-39 and backlog-lane.logic.test.ts :400.
Evidence: those two lines (added in cb026342c, task-366, "yes to McStorage") are the only tests of the `status` "draft, operator to confirm it binds". `grep` finds no other test of `storage-doc16` status. The new form is `not.toContain('storage-doc16')`. The list stays defined in the table, and the operator's draft status of doc-16 has not been ruled on.
Fix: keep one assertion on the definition: `expect(table().lists['storage-doc16'].status).toMatch(/draft, operator to confirm it binds/)`.

## rg#9 LOW: the "1-5 y" item 2 reversal (MD:1520) is recorded only in a test title
Plan: 3.2 :127 appended text "(RR-0421 item 1 a ... reverses RR-0383): Specs 126, 128 and 135 are off"; 3.6 note.
Evidence: MD:1520 item 2 is the standing "Attach Specs 135 and 136 to the contract routes ... 1-5 y", and the row's own lead text cites :1517 and :1520. RR-0421 item 1 a plainly covers "the lookup routes", so no ruling is missing. But the attachment of 126, 128 and 135 to these routes came from task-406 round 4 and "1-5 y", not from RR-0383 (task-439 left the row alone, per the 137:136 note). The plan's table-test title does name :1520, but the rule text (the `why` and the notes) does not.
Fix: in the :127 suffix and the 3.6 note, add "and the operator's \"1-5 y\" item 2 (MD:1520), for Spec 135 and Spec 126/128 on the census routes".

## rg#10 LOW: the brief sentence is ambiguous about when the round-1 line must be added
Plan: 3.3 "named by one line 'Review round 1: <counts>; ...' added to the Final Summary before the close".
Evidence: check-lane-close.mjs:274 counts `Review round N:` lines in `summary.headText` (the committed HEAD copy), so a line added in the closing commit itself gives round 1 again and the close refuses. The precedent commit message d04026fe5 says it was added "ahead of the closing commit (the close check numbers the round from the Final Summary at HEAD)", and 4fca5346d is the same shape.
Fix: write "added in its own commit before the closing commit".

## rg#11 LOW: a by-law pre-registration keeps all five process lists, and the new test hides it
Plan: 3.1 (bylaw and lane-tools `not`); section 4 :30 `lists('...prereg-MB-18-1.json')).toContain('bylaw-133')`; A5.
Evidence: my resolve of `prereg-MB-18-1.json` returns `bylaw-133,agents-s5-1to3,agents-s7-s11,queue-137,eng-all,orchestrator-doc17,five-words,plan-protocol,inc-S,ms-S`. It matches `scripts/analysis/**` of lane-tools. This is within the letter of RR-0421 4a. It is a data record in the tooling folder that still takes the queue and agent lists, which RR-0418 ("Why are individual taks being sent information about the queue, agents?", MD:2135) objects to.
Fix: state it in the 3.4 note as a known residue. Or ask the operator whether the `not` should be widened to the by-law prereg records. At minimum make the test assertion exact, so the residue is visible rather than hidden by `toContain`.

## rg#12 LOW: the known-loss paragraph omits residue the plan's own inputs flagged
Plan: 3.4 "Known loss, measured on tasks 367 and 442"; section 0 known loss.
Evidence: PLAN-418-v1 C says "Rule 10, the verbatim dated note: no machine check found" for Spec 137, "The round cap and the round-2 severity rule: UNVERIFIED by a machine check", and "orchestrator-doc17: no script reads it". The part-1 grounder V6 adds that Spec 136 "carries no line for any" of the five mobile specs. After the edit, only lane-tools files get the Spec 08 and Spec 137 lists, so an edit to Spec 08, Spec 137 or `.cursor/*QUEUE*` alone gets eng-all or nothing. MD:1853 recorded "Infrastructure tasks are unchanged" at the plan stage, and the later RR-0421 4a wording ("tooling row") overrides it.
Fix: add one sentence to the 3.4 note: rules with no machine check (Rule 10, the round cap, doc-17) reach a reviewer only on the lane-tools row, and a task editing only Spec 08, Spec 137 or the queue documents is no longer reviewed against them.

## rg#13 NIT: stale branches with edits near the insertion points (UNVERIFIED relevance)
Plan: 3.4 to 3.6 insertion points (08_agents.md after :356 and :489, 137_mcqueue.md after :136).
Evidence: `git diff -U0` against the merge-base shows wf1/spec137-board adding at Spec 137 :131-135, wf1/mcinc7-1112 at Spec 08 :491-492, and wf2/board-move editing both specs. All are old (2026-11-06 to 11-18) and unlanded. I did not check whether they are live.
Fix: none, or say in section 7 that these are dormant.

UNVERIFIED: whether the plan gate or the close refuses plan-stage lens evidence for a list the new table no longer attaches. This matters for waiting plans (task-447 and task-443 are LATER) and for task-441's plan, which resolved 7 lists. I did not read the gate's treatment of extra evidence, so the plan's "plans become stale" concern is open.

STATUS: 13 findings (1 HIGH, 5 MED, 6 LOW, 1 NIT); the plan is stale against RR-0424 (decision-209), which adds check-lane-close.mjs:502 and one test comment to this task, and it has one false dated-note sentence (Spec 124), an unpinned step-pipeline edit, and an unauthorised fold-check narrowing.
