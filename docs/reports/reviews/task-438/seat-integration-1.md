# Seat: integration: task-438 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### ig#1 HIGH: the fixture evidence writer is not in the plan or the Files line, and the plan gate will refuse every launch test that uses it
- Plan sentence: "Plan gate: it has no range base, so the split applies from the landing" and "Fixtures in check-lane-close.logic.test.ts use lists on docs/a.md (:22), so existing close tests are untouched."
- Evidence:
  - backlog-lane.logic.test.ts:36 and :262 and :351 call plantEvidence. It runs docs/reports/reviews/task-375/plant-evidence.mjs.
  - plant-evidence.mjs:24 copies only lens-compliance.md into the temp board. :40 writes `in-plan-compliance-<id>` for every resolved list. :36 stamps `template=lens-compliance.md` on every output.
  - The fixture Files line `scripts/analysis/thing.mjs` hits the lane-tools row (rule-lists.json:159), which carries eng-all. So every build fixture resolves an engineering list.
- What goes wrong: once the plan gate always splits, the plan gate refuses every build launch test with "no plan-engineering-eng-all". That is most of backlog-lane.logic.test.ts, not only the one assertion the plan names.
- Smallest correction:
  - Add docs/reports/reviews/task-375/plant-evidence.mjs to the Files line.
  - Edit it to name the file with `seatOf` (as the code would), copy `lens-engineering.md` too, and use that template for the header and prompt hash. That is about 4 lines.
  - Check that check-task-files.mjs accepts the path once it is on the Files line.

### ig#2 MED: src/tests/review-lens-template.infra.test.ts is not in the plan, and extending it would force edits to lens-compliance.md
- Plan sentence: T1 adds `engineering` to the one-placeholder loop in review-templates.logic.test.ts.
- Evidence:
  - review-lens-template.infra.test.ts:14 has `LENSES = [five names]`.
  - :85 asserts that every lens template names every other `lens-<x>`.
  - :94 asserts that the README names every lens.
- What goes wrong: if the builder adds `engineering` to LENSES, the five templates must all name lens-engineering. That means editing lens-compliance.md, which the plan correctly forbids because the prompt hash of every prepped output would break. If the builder does not add it, the new template gets none of the structural checks. These are the persona, one-question, NOT-responsible, quote-rule, strict-format and VERDICT checks.
- Smallest correction:
  - Do NOT extend LENSES.
  - Give engineering its own `it` in review-templates.logic.test.ts (already in the Files line) that asserts the same structural strings. Add a control: a file with the literal `{{PLAN}}` twice fails the one-placeholder test.
  - State in the plan that the infra test is deliberately left alone.

### ig#3 HIGH: the plan's cut-over text is stale, and the real behaviour for the running lanes is as follows
- Plan sentence: "task-430 (LATER, prepped...): launch it BEFORE 438 lands" and "RUNNING lanes launched before the landing ... close as today".
- Evidence:
  - TASK-430 is RUNNING, lane BL-HB430, worktree Buildo-wt-hb430, branch wf1/inc1b-hb430. Merge-base with the board is 60b601cc9, 27 board commits behind.
  - TASK-444 is RUNNING, lane BL-DOCS444, branch wf1/inc1b-docs444. Merge-base is 707ddef32, 4 behind.
  - check-lane-close.mjs:764 reads templates at `merge-base HEAD <board ref>`.
  - The commit-msg hook (.husky/commit-msg:7) runs the lane's OWN copy of check-lane-close.mjs.
  - check-lane-close.mjs:707-708 returns 0 when MERGE_HEAD exists. The board folds (3500718e6 has two parents; 836b5722b is a merge) therefore skip the close check.
- What happens after 438 lands:
  - BL-HB430 and BL-DOCS444 close with their old code and an old base. They owe `out-compliance-eng-all` only, and re-run nothing. This is the case as long as the lane does not merge or rebase the board before its closing commit.
  - If either lane merges or rebases the board first (BL-DOCS444 edits specs that 436 and 437 also edited, so a conflict is plausible), both the new hook and a base holding lens-engineering.md arrive together. The close then demands `out-engineering-eng-all` (or the whole engineering set for the lists) plus grounder verdicts. The cost is 1 DeepSeek call per engineering list part, plus verdicts.
  - If TASK-444 is not a build task, the plan phase is also demanded: phases are ['plan','out'] at :512, so it also owes `plan-engineering-eng-all`. Its stored `plan-compliance-eng-all.txt` stays in the folder and is ignored.
  - BUILT tasks not yet pushed (412, 418, 419, 423, 432, 433, 435, 436, 437) are untouched. Their close check ran at their own commit. Folds are merge commits and skip the check. The pre-push hook runs vitest and step validate, not the close check. There is no other reader of their evidence except `check-lane-close.mjs --outcomes`, which is name-agnostic.
  - The plan's UNVERIFIED #1 is answered: a board fold of an old-code lane does not re-run the close, because of the MERGE_HEAD skip.
- Smallest correction:
  - Replace ORDER step 1 with this: "Land 438 after BL-HB430 and BL-DOCS444 close, or tell them not to merge the board before closing. If one does merge, it owes out-engineering-eng-all (1 call plus verdicts)."
  - Do not add an alias that accepts the compliance name for eng-all. That would reopen the separation the operator ruled.

### ig#4 MED: task-431's stored plan evidence is already stale at this head, and 438 does not change that
- Evidence: I recomputed `wholeListText` against the committed in-plan-compliance inputs. Tasks 430, 431 and 444 all show agents-s7-s11 stale. The cause is the Spec 08 edits of 836b5722b and 3500718e6 (2 lines). Task-438's own evidence is current.
- What goes wrong: when 431 is launched, the plan gate refuses it for agents-s7-s11 regardless of 438. After 438 it additionally refuses on the missing plan-engineering-eng-all. The plan says "1 call" for 430 and says nothing about 431.
- Smallest correction: say that 431 is re-prepped after 438 lands, which makes the eng-all re-make free because it is made under the new name. Do not edit sections of Spec 08 that agents-s5-1to3 or agents-s7-s11 cover (see ig#5), or every prepped plan goes stale again.

### ig#5 MED: the open question on Spec 08 has a measurable answer
- Plan sentence: "Does Spec 08 section 5.1 need an Engineering row (one line)...? The record does not say."
- Evidence:
  - The A-table roster is at 08_agents.md:174-178. A10 is Compliance at :175. There is no engineering row.
  - Section 5.1 starts at :213.
  - The pattern of 423, 436 and 437 is a dated note in Spec 08 plus the code. Compare 3500718e6, which also regenerated rule-lists-by-kind.md (8 lines changed). Dated notes at :241 and :350-351 state the `out-compliance-<list>` rule for every list.
  - DoD #5 is already met by decision-170.
  - A Spec 08 edit inside a list section changes the list text. That changes the generated page, makes every prepped plan stale for that list, and needs a Spec-diff trailer.
- Smallest correction, two choices for the operator:
  - (a) No Spec 08 edit in 438. Record the seat in the README and decision-170 only. This keeps the task at its size. The cost is that Spec 08 :241 and :350 say "per list" with no engineering seat, until 431 or a later spec task.
  - (b) One dated note in section 7 rule 4. Then add 08_agents.md and docs/reports/generated/rule-lists-by-kind.md to the Files line, regenerate the page, and re-prep every prepped plan for agents-s7-s11.
- I recommend (a).

### ig#6 MED: the brief's joined-run sentence must be made per seat, and the plan does not say how
- Plan sentence: "The joined form is per seat (out-engineering-rules), with joinLists over that seat's lists only."
- Evidence:
  - backlog-lane.mjs:184 tells the lane `lens-input --list rules --lists <ids>` for "all the lists" and "one set out-compliance-rules[-pN].txt".
  - check-lane-close.mjs:446-449 recomputes `joinLists(table, <that seat's lists>)`.
- What goes wrong: a lane following the unchanged sentence joins all ids. The compliance proof then refuses with "do not carry the whole list ... as it is now".
- Smallest correction: change the sentence to "`--lists <the compliance list ids>`". Keep the substring `accepted form that is not the default ... RR-0374` and the substring `--list rules --lists`, because backlog-lane.logic.test.ts:398-408 pins both.

### ig#7 LOW: strings that name compliance and are not in the plan's change list
- check-lane-close.mjs:420, :437, :443, :632 (the plan gate `layout`: "plan-compliance-rules[-pN].txt ... in-plan-compliance-<name>"). Each needs `${seat}`.
- The header comment at check-lane-close.mjs:12-21.
- README item 5 (~:160): "one compliance lens output per attached list (out-compliance-<list id>.txt)".
- Smallest correction: name them in the plan. They add about 4 lines.

### ig#8 LOW: generated page and table
- Evidence:
  - renderPage (rule-lists.mjs:532) sizes every list with lens-compliance.md at :534, and its title says "compliance review documents".
  - rule-lists.json is not edited by the plan, and the page does not change (verified in memory).
- What goes wrong: the part count shown for eng-all is the compliance-template count, which is fine today (46,897 characters plus a 30,000 nominal material is one part). If a later list is near the bound, the engineering count could differ.
- Smallest correction: leave it as is, because "Renaming the generated page" is already out of scope. Add a note to 431.
- `compliance:<id>` labels (complianceRefs :487) would stay on the engineering list. The plan marks this out of scope. I agree. Changing it would churn the references of about 20 tasks.

### Integration, what I checked and found true
- Every reader of the compliance names was found by grep. Scripts: rule-lists.mjs, check-lane-close.mjs, backlog-lane.mjs. Non-scripts: the README, 08_agents.md and 137_mcqueue.md as dated notes, and the tests.
- findingsIn (:303), ruledLine (:191), isLensOutput (:302), unmentionedRules and the `--outcomes` CLI all take any `plan-*` or `out-*` file by name. They need no change, and a plan-engineering-<id> name works in them.
- deepseek-review.js takes any --template. The REVIEW header uses `path.basename(templatePath)` (:161), so lens-engineering.md gets its own header name. No template registry exists. README plus the tests are the only registration.
- listProof is reused for chunk coverage, whole-list recompute and the committed input, so an engineering list gets V2.WHOLE for free.
- rule-lists.json (the table) and the protected-paths line (:22) are not changed. check-lane-close.mjs and rule-lists.mjs are protected, so two commits are needed. The Files line names both protected paths.
- Edits to the template, README and tests do not stale any plan evidence, because lens-compliance.md is not edited.
