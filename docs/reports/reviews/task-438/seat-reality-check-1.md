# Seat: reality-check: task-438 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### rc#1 HIGH: as written the template is a renamed copy that tells the seat to skip its own rules
- Plan sentence: "A copy of lens-compliance.md with exactly these line changes. All other lines are verbatim."
- Evidence:
  - lens-compliance.md:16-21 tell the model it is NOT responsible for "code quality, types, logging, dead code", "error, empty, retry, time-out, double-submit paths" and "exploit paths for money, auth, PII", each assigned to another lens.
  - docs/specs/00_engineering_standards.md headings: 1 Architecture and UI (:9), 2 Error Handling and Stability (:35), 3 Database (:51), 4 Security and API Contracts (:71), 5 Testing (:97), 6 Centralized Logging (:136), 7 Dual Code Path (:144), 8 Next.js and TypeScript (:160), 9 Pipeline and Script Safety (:175), 10 Frontend/Backend Boundary (:218), 11 Plan Compliance Checklist (:235), 12 Frontend Foundation Tooling (:304), 13 Observability (:412), 14 Prevention Loop (:454).
  - So errors, security, logging, types and dead code are exactly the pasted engineering rules.
- What goes wrong: with L17-L21 kept verbatim, the engineering seat is told to ignore sections 2, 4, 6 and 8. It would also say "a rule I recall from elsewhere is not pasted" about them. The lens would be a weak duplicate of compliance with different labels, not a second seat.
- What lens-engineering.md must differ in, to be a real second seat:
  - Binding rule: the pasted engineering rules are yours even when another lens also covers the topic (errors, security, logging, types, tests). You are NOT responsible for spec clauses, rulings, design text and "nothing added" (lens-compliance), for quality that no pasted rule states (lens-code-review), or for spec truth against the live tree (Ground-truth).
  - Unit of judgement: a numbered section of the standards, cited as the "clause ref", for example `4. Security and API Contracts`. Drop the "clause by clause / operator ruling" language. Operator rulings stay with compliance (the plan's new first bullet covers this).
  - A MUST/NEVER versus SHOULD distinction: only MUST/NEVER-form rules are BUG or CRIT/HIGH. The document is 46,897 characters of mixed prose and checklists.
  - Walk step 4 ("adds behaviour no pasted clause names") stays with compliance. The plan does delete it (L51), so that part is right.
  - Companion line, anti-patterns and the NOT-responsible list must be rewritten, not only L12-L16.
- Smallest correction: add to the plan one line replacing L16-L21 with the list above, and one line replacing the L82-L86 anti-patterns. The template is still about 86 lines.

### rc#2 MED: the "Rules met" block is dead weight for this document, and the plan's own fact 11 says so
- Plan sentence: "The engineering file has 0 bold name.N rule ids (grep), so its Rules met: line will read none." T1 then asserts the line exists.
- Evidence: I counted 0 bullet lines of the form `**name.N**` in the standards file. lens-compliance.md:73-76 and rule-lists.mjs:473 (`unmentionedRules`) read ids of that shape only.
- What goes wrong: the line is "standardized" but always says `none`, and it costs prompt tokens. It also gives the grounder a false signal that coverage was checked.
- Smallest correction: either keep it for the shape (state "kept for the shape, always none") or replace it with `Sections met: <numbers of sections judged met>`. If it is replaced, T1 must assert the replacement instead.

### rc#3 MED: the de-dup line has no effect today and is not seat work
- Plan sentence: "Add one de-dup line in resolveTask ... Today this changes 0 open tasks (measured)."
- Evidence: I checked the table. No file has both a whole list and a sections list, and eng-all is the only list on docs/specs/00_engineering_standards.md. The filter would only ever act after 431 adds sections lists on that file.
- What goes wrong: it is dead code in 438 and untestable on the real table (only on a temp table). It is also generic. It would silently drop any section list when a whole list names the same file, for compliance lists too, and complianceRefs would then tell tasks to remove the dropped `compliance:` reference.
- Smallest correction: move the line, with its tests, to 431. PLAN-431-v3 says it "relies on 438's de-dup" (:77), so edit that line of 431's plan too. If it stays, 438 must say so and state that the ruling RR-0380 needs it.

### rc#4 MED: stale line numbers and facts
| Plan cite | True at head now |
|---|---|
| lensLine backlog-lane.mjs:181-183 | `lensLine` is at :177-184. The `per` sentence is :184. 436 added MODEL_LINE above it. |
| resolveTask `return result` :282 | :278 |
| readBase (close) :763 | :764 |
| "Fixture pin" backlog-lane.logic.test.ts :343 | The `eng-all` loop is :398-403. :343 is a pin on `lens-input --list L`. |
| self-edit/two-commit :740 | :738 |
| README "after :100" | The compliance row is :100 and the security row :104. |
| "task-430 is LATER, launch first" | It is RUNNING (BL-HB430). Task-444 is RUNNING too, and carries `plan-compliance-eng-all.txt`. |
| "task-430's 28" | 25 `plan-compliance-*` outputs (11 for 431, 7 for 444, 9 for 438). |
| PLAN-431-v3:74 says backlog-lane.logic.test.ts:343 unchanged | 438's plan says :343 changes. Both cite the wrong line. The real pin (:400) changes in 438. |

The "20 RUNNING tasks with eng-all" claim I did not recount (see the unverified list).
Facts that hold: inputArgv :651, dry run :654-656, jobs :666, summary :679, listProof :386/:399/:420, complianceSetErrors :428 called at :514 and :639, readBase at the plan gate :631, precedent text :425, isLensOutput :302, lens-input default template :827, eng-all at rule-lists.json:31, template lines L1/L3/L4/L5/L12/L14/L30/L48-51/L71/L82. Test refs are exact: LENS_TEMPLATES :33 and TABLE docs/a.md :22. The plan-gate fixture near :874 is exact.
- Smallest correction: refresh the line numbers in the plan text before the build uses them.

### rc#5 LOW: "about 30 lines" is about 40, and the extra lines are real
- Plan estimate: 8 lines in rule-lists.mjs, 17 in check-lane-close.mjs, 3 in backlog-lane.mjs, so 28.
- Missing from it:
  - plant-evidence.mjs, about 4 lines (ig#1).
  - `layout` and message strings at check-lane-close.mjs:420, :437, :443, :632 (ig#7).
  - The README item 5 clause.
  - The joined-sentence edit (ig#6).
  - A new `it` in review-templates.logic.test.ts (ig#2).
- The brief's `per` sentence is one very long line. A "3-line" edit there is long in characters.
- The real count is about 40 code lines plus an 86-line template, still "small" on the operator's terms. State it as about 40.

### rc#6 LOW: cost in review calls, before and after
- eng-all is 46,897 characters. With the compliance template (4,842 characters) and a 30,000-character nominal material, one list part fits the 120,000 bound. So 1 call per stage now and after.
- No extra call: the call just moves seat. Plan-prep prepares the same jobs; only the template and the file name change.
- Measured plan outputs (one of them is eng-all in each folder):
  - 430: 25 before, 25 after (24 compliance plus 1 engineering).
  - 431: 11 before, 11 after.
  - 444: 7 before, 7 after.
  - 438: 9 before, 9 after.
- Output stage: the same number of chunks times parts per list. The engineering template is shorter or equal, so the part count cannot rise.
- Extra calls occur only in these cases:
  - 431 is re-prepped (1 call for eng-all under the new name, plus the agents-s7-s11 re-make it owes anyway).
  - A running lane merges the board before its close (ig#3).
- After 431: three engineering lists (eng-front, eng-back, eng-shared) in the per-list default form are up to 3 calls instead of 1. The joined engineering form is 1. 431's plan counts calls for the compliance seat only.

### Reality-check, what I checked and found true
- Every quoted function name exists and does what the plan says: resolveTask, listProof, complianceSetErrors, planGateErrors, reviewErrors.
- The plan-prep inputArgv takes `--material-from`, and the plan-gate recompute reads the repo template.
- `lens-compliance.md` is NOT edited: the hash argument is correct (plan gate `readBase: i.readRepo` at :631 recomputes the prompt hash from the repo template).
- The REVIEW header error text "the REVIEW header names template X, expected Y" (:61) matches T3(c).
- The engineering file is the only engineering list in the table. Routing by the file name is simpler than a `seat` field and is data-free.
- Operator wording is consistent: "a review seat named engineering, separate from compliance, at plan and at output" (MORNING-DECISIONS RR-0385 item 2). The reading seats in that entry (reviewers DeepSeek) match a lens template.
- RR-0385 item 5 (no new gate work): the plan only renames what the gate requires. The cut-over lines are small; see rg#4.
