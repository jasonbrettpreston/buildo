# REPORT BL-ENFORCE task-371 ENFORCE.1 stage 1 (a reviewed plan; nothing built)

## Eight plain lines for the operator
1. Rule needs a named check (measure 1): a commit is refused if a rule has no check, owed task or your own "advice" mark, or if a set's unchecked count goes above its pinned ceiling; under 1 s per commit (GUESS; the sibling checks measured 0.04 to 0.64 s), 0 tokens. Today the step list sits exactly at its cap (100 of 100).
2. Push needs a compliance pass and a separate grounder (measure 2): the push is refused if any lane task in the pushed range lacks a lens output per rule list and a grounder verdict from another agent; a lane launch without the BRIEF-FILE line is refused (needs the user-level hook brought into the repo); about 0.2 s per push (GUESS; the log read measured 0.009 s), the cost is the lens and grounder work it demands; it only means something once the two review-tool defects BL-GROUND confirmed are fixed.
3. Phone tests before a push (measure 3): the push is refused if the phone tests fail on that commit; CI takes 60 s (measured, run 44741125636), local 30 to 120 s (GUESS, not run: my rules forbid it); recommended: the station runs them in a cached clean install, not a CI run after the push. The tip already has 18 failing phone tests.
4. A ruling and its check in one step (measure 4): recording a ruling is refused unless it names check:file, owed:task or advice with your own quote; milliseconds, 0 tokens.
5. Board (measure 5): one generated document first under Documents on the 6421 board plus one line in BOARD-STATUS-6421.txt (mock below); 0 tokens; the line is added by the repo script board-ff.zsh.
6. Prune (measure 6): ten retirement candidates with file:line (Spec 90 lines 46 and 71, doc-16 loading-screen lines, stale counts); nothing retired.
7. Order: 2 push side, 3 phone tests, 4 rulings, 1 field and gate, 5 board, 2 lane-guard repo copy, then 6.
8. From you: seven drafted decisions D-1 to D-7 (what counts as a rule, phone-test option, station into the repo, lane-guard into the repo, hand-written decision files, board-ff.zsh edit, which candidates to retire); the grounder rules on 94 lens findings first.

## Board mock (place: Documents list on the 6421 board, generated doc; status line in BOARD-STATUS-6421.txt)
```
Rule enforcement   (generated 2026-11-20, docs/rules/enforcement.json + the three set maps)
set                 rules  checked  owed  advice  unmarked  ceiling  trend
step standard         444     364     0      0       80      100     =
by-laws (133)         543     426   117      0        0      117     =
McFrontend (136)       44      35     8      0        1        9     =
McStorage (doc-16)     12       3     9*     0        0        9     =   (* task-370; draft policy)
queue (137)            14       2     0      0       12       12     =
Spec 08 s7 + s11       30       ?     ?      ?        ?        ?     (seed owed)
mobile 90/96/98/99/100  ?       ?     ?      ?        ?        ?     (seed owed)
engineering standards   ?       ?     ?      ?        ?        ?     (seed owed)
BOARD-STATUS-6421.txt: rules: 8 sets · 1,057+ rules · 830+ checked · 134 owed · 0 advice · 93 unmarked (ceiling 247, down only) 2026-11-20 08:40
```

## Build order
1. check-push-range.mjs (after task-366 lands) called by station and pre-push. 2. mobile-ci-local at the station. 3. backlog-decision --check-ref and one decision-log arm. 4. rule-enforcement gate, data file, pin test, seed. 5. rule-enforcement generator doc and status line (operator present for board-ff.zsh). 6. lane-guard repo copy with BRIEF-FILE refusal (typed go). 7. Operator rules on candidates R1 to R10.

## Operator decision drafts
See PLAN.md section 8 (D-1 to D-7), each with Grounded and Recommendation lines, all Recommendations UNVERIFIED until the grounder and a review round.

## Review
DeepSeek lens set on PLAN.md, round 1 (14 runs: the plan in two parts because the review tool sends the plan twice and bounds the prompt at 120000 characters): compliance once per rule list (Spec 08 sections 5, 7, 11; Spec 137; engineering standards sections 5, 9, 14; Spec 132 sections 4 and 6), each list supplied whole with the operator rulings block; plus code-review, error-paths, security. Findings by id in FINDINGS.md, untriaged, no verdicts. Count by lens: code-review 16, compliance-eng 14, compliance-spec08 15, compliance-spec132 16, compliance-spec137 13, error-paths 16, security 4; total 94 (HIGH or CRITICAL 36). Security part B returned NOT APPLICABLE; part A found 4 (the push gate part). Task left RUNNING: grounder owed.

## UNVERIFIED
- check-lane-close.mjs and rule-lists.json are uncommitted in ~/Buildo-wt-comply2; 366's definition of "on file" may change.
- Cold local mobile install time (not run: lane rule 2).
- Which board status file the operator reads (BOARD-STATUS.txt per Spec 137 rule 14 vs BOARD-STATUS-6421.txt); the file named in the brief at ~/Buildo-scratch/BOARD-STATUS.txt does not exist.
- The three step-standard counts (Spec 132:503, :505, rule-map) disagree.
- Brief's Spec 137 cite 137_mcqueue.md:84 and :109 do not match this tree (rule 10 is at :123): line drift.
- Classification of engineering and mobile rules into now, later, never is GUESS.
- Whether hand-written files in backlog/decisions are refused by any existing hook (not grepped).
- Lens round was run on the plan as written; findings not folded (the grounder rules first).
- Cost of false findings per measure is stated from BL-GROUND's 72 of 101, not re-measured.

STATUS: ready (grounder owed)
