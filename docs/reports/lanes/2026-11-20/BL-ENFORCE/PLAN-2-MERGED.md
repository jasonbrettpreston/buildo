# Compliance plan for Increment 1·B, merged (orchestrator draft, 2026-11-20, UNVERIFIED until the lens set and a separate grounder rule on it)

Operator, 2026-11-20, verbatim: "I agree. teh other question is about modularization - teh footer for example - this should be a seperate module or component (we use preexisting components) how do we also ensure this is happening? okay so let's merge this [the five-step 1·B plan] with this [the five recommendations] plus modularization. Let's see the task list for this - full plan of your reocmmendations. Let's have them reviewed with a view to enforcement. Whether this will work?"
Operator, same day: "If you can trick the gate - whats the point"; "we just do half measures to create the impression we are solving the problem"; "no fasades".

## The reading this plan rests on (orchestrator reading, NOT yet tested)
The schema part of the front end (schema, content, generic renderer) held in 1·B; nearly every grounder-confirmed defect (D1 to D15, docs/reports/lanes/2026-11-20/BL-GROUND/VERDICTS-SUMMARY.md and VERDICTS-SUMMARY-2.md) sits in hand-written code around it: the lookup route, the server projection and formatter, the per-page binding files, the phone hooks. Pipeline steps are enforceable because every step has one shape in scanned folders; this code has no standard shape and sits outside the gates' scan (grounder scan-scope answer, BL-GROUND REPORT: report-compute.ts is scanned by the silent-catch rule and the SQL ledger only).

## Acceptance standard for every refusal in this plan
A refusal is accepted only when a separate agent's attempts to get past it are all refused and the refusal lines are pasted. A way past that works is reported as STILL OPEN. The lane never runs or writes its own verdict: the orchestrator launches the grounder.

## Task list, in order

### Part A: already running or created
- A1 task-366 close check and rule lists attached at launch. State: 24 of 37 attacks refused; 13 holes sent back. Accept on a clean re-attack.
- A2 task-367 gates A (engine reach), B (conversion factor by value), C (Spec 90 never-do list) wired to refuse at commit with dated baselines. Accept on a clean attack.
- A3 fix tasks from confirmed defects: task-374 footer links (router link, 44 px), task-375 review-tool and proof-runner fixes, task-376 specs and contracts brought up to the 1·B rulings (D3 and its extension), task-378 phone tunables into surface config, contract entries, the length factor. Each: lens set with rule lists whole and rulings pasted, then a grounder the orchestrator launches.
- A4 owed with operator input: D1 freshness compare (design decision drafted in BL-FIXPROJ/D1-OPERATOR-DRAFT.md); a DB mirror migration for two new settings (operator typed GO).

### Part B: new tasks proposed
- B1 TEST THE READING FIRST. A read-only grounder classifies the pushed 1·B diff (9f04d9074..3a36e8b26) and today's fixes: lines and files that are schema/content/generated against hand-written code, and for each confirmed defect which kind of file it sits in. If the reading fails, B4 to B7 are withdrawn.
- B2 PUSH CHECK. The close check's functions run over every commit in the pushed range, as an arm of the existing push gate (scripts/analysis/mcbylaws/gate.mjs --push, .husky/pre-push); refuses a code commit with no Task trailer; covers skipped hooks. Also refuses a verdict file committed on the lane's own branch (the lane never judges itself).
- B3 LAUNCH CHECK. The user-level lane guard refuses a build brief with no rule-list block from the launch script. Minimal in-place edit; operator typed go.
- B4 ONE ENGINE ENTRY. Rule: code outside scripts/lib/compute reaches the engine only through one sanctioned entry on a closed list; the existing compute gates (shape, literals, purity, closure, estate literals) widen their scan to every file on that list, so the step and Airtight rules bind it. Plus the C1 lock: a test that the engine core's closure never reads the runner-only context keys (run_at, descriptor, clock). Refusal: Gate A (new reacher) plus the existing gates on the allowed files.
- B5 BEHAVIOUR AS DATA. Rule already written: Spec 126 P4 "All tunables are data; zero thresholds in src/", Spec 128 Rule 3 "every debounce, page size, stale time and rate limit is a registered logic variable with bounds". Refusal: a numeric literal in a timing, retry, stale-time, page-size or limit position in bindings, phone hooks and routes is refused at commit (the informational classes removed from gate B return as blocking, with a dated shrink-only baseline). Pattern to follow: mobile SearchBinding reads SEARCH_SLICE.config.debounce_ms.
- B6 CAP ON HAND-WRITTEN CODE. A closed, dated list of the code files that exist today under the routes, server surface libs, per-page bindings and phone hooks. A NEW file there is refused at commit unless the list is extended with a named reason and the operator's ruling id. Existing rule: memory 'build with existing components: new ones need a named reason and a ruling'; Spec 136 (existing components only).
- B7 MODULARIZATION (one definition, many users). (a) Every part used on more than one surface is defined once as a shared part and referenced; the footer is the first case (task-374; the shared footer builder and its parity tests exist: verify). (b) Refusal 1: a new component or binding file not on the B6 list is refused. (c) Refusal 2: a duplicate check at commit: the same node structure or the same content keys defined in two surfaces without going through a shared part is refused (what Spec 127 section 4 'Unowned components' and the surface registry already check must be verified before anything is built: extend, do not duplicate). (d) Every schema node type must resolve to a registered renderer component (verify whether surface-validate already refuses an unknown type).
- B8 PHONE TESTS BEFORE A PUSH. The station runs the phone tests on the commit and refuses the push on a failure (repair the shared mobile install; use the existing scripts). Until then the push sequence waits for Mobile CI green.
- B9 RULE ACCURACY. Retire list to the operator (grounder-verified stale: Spec 90 :46 Firebase, :71 shared-types; 08_agents :343, :19/:28; doc-16 body now marked); by-law handbook count reclassified so 'report-only' and 'no code change' are not counted as enforced; the rulings register attached to the compliance pass; Specs 126 and 128 attached to server code that serves surfaces; conflicts C1 to C5 settled by the operator and written as dated notes citing his words.

### Part C: sequence for the product
- C1 hold the push (29 commits on the board; tasks 354, 372, 373, 90 grounded and folded).
- C2 A3 fixes folded after grounding; A1 and A2 accepted on attack tests; B2 built and attacked; B3 on typed go.
- C3 full suite on the final head through the station; the operator's y; Mobile CI green before any other work.
- C4 remaining 1·B builds (LOAD.2, LOAD.4, the no-plan page, PROOF.S and the rest) one at a time under A1, B2, B4 to B7.

## Dropped (grounder ruled them a facade: BL-ENFORCE grounder verdict in task-371 notes)
The per-rule check field, the ruling-records-its-check field, the board number.

## What this plan cannot give
Proof that a grounder judged well; protection against deliberate forgery of a verdict; a rule for behaviour that has no pattern yet.

## Coverage as known today
Machine-refused: step standard 334 (pipeline folders only until B4), McFrontend 35, storage 3, queue 2, by-laws at most 426 (count soft). New machine refusals: 8 rules (A2) plus what B4, B5, B6, B7 add (to be counted by the review). Forced review: about 250 unchecked rules plus Specs 90, 96, 98, 99, 100, 126, 127, 128, the engineering standards and Spec 08, through A1 and B2.
