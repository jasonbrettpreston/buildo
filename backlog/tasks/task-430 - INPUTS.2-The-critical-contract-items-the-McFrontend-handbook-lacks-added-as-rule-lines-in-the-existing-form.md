---
id: TASK-430
title: >-
  INPUTS.2 The critical contract items the McFrontend handbook lacks, added as
  rule lines in the existing form
status: BUILT
assignee:
  - '@lane-BL-HB430'
created_date: '2026-11-22T16:25:00Z'
updated_date: '2026-11-24T14:42:00Z'
labels:
  - McFix
  - McFix V2
  - McFix Final
  - dead
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-430/GROUNDER-PLAN.md
  - docs/reports/reviews/task-430/TRIAGE-PLAN.md
  - docs/reports/reviews/task-430/seat-integration-1.md
  - docs/reports/reviews/task-430/seat-reality-check-1.md
  - docs/reports/reviews/task-430/seat-regression-1.md
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - >-
    compliance:surface-126
    docs/specs/02-web-admin/126_maxbld_surface_standard.md
  - >-
    compliance:surface-127
    docs/specs/02-web-admin/127_surface_conversion_procedure.md
  - >-
    compliance:surface-128
    docs/specs/02-web-admin/128_surface_standard_policy.md
  - >-
    compliance:surface-135
    docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
  - compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
  - >-
    compliance:policy-124-s2-s5
    docs/specs/01-pipeline/124_step_standard_policy.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - compliance:bylaw-133 docs/specs/01-pipeline/133_bylaw_handbook.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-22/BL-HB430/REPORT.md
  - docs/reports/lanes/2026-11-22/BL-HB430/GROUNDER.md
  - docs/reports/lanes/2026-11-22/BL-HB430/TRIAGE.md
type: build
ordinal: 130012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0378 (MORNING-DECISIONS.md:1852, verbatim: "Plan approved. We are running right now on this? Add the tasks?"). Why: the compliance reviewer is sent about 534,000 characters for a front-end task, of which the handbook is 3 percent; measured, one small document per call finds more than large or joined ones. THIS TASK (step 2): add the items the INPUTS.1 report lists, and the operator has read, to the McFrontend rule source so the generated Spec 136 carries them as lines, by the existing generator and its lock (scripts/surfaces/generate-surface-handbook.mjs, src/tests/surfaces/handbook-rule-map.logic.test.ts); nothing in Specs 126, 127, 128 deleted or rewritten. Scope and Files line are set at its plan review from the INPUTS.1 report.

Files: scripts/surfaces/generate-surface-handbook.mjs, scripts/surfaces/_schema/surface-rule-map.json, src/tests/surfaces/handbook-rule-map.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/, docs/reports/generated/rule-lists-by-kind.md, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-95-1.json, docs/specs/00-architecture/00_system_map.md
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# PLAN-430-v1: INPUTS.2, three small things for Spec 136 (the McFrontend handbook)

Planner: read-only. Paths are relative to ~/Buildo-wt-board unless they start with ~. Nothing was run except in-memory node reads. Every fact below has a file:line or is under UNVERIFIED. Principles served: standardized, observable, scalable, accurate, understandable; simple, no scope creep; build with existing components.

## 0. Ruling and scope (round 1: section 17 governs wherever it conflicts with a sentence below; in particular 11 readings read 12, 12 new rows read 13, 56 rules read 57, 8 OWED to 20 reads 8 to 21, and every OPEN QUESTION is ruled)

- RR-0384 (backlog/decisions/decision-169, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1901), his own words, the only words of his in that entry, are "These look great - teh 13 are perfect" and "Approved"; the rest of the quoted reply ("Task 430 becomes three small things: stop the clipping, make each line reflect its notes, and add these 13 lines. Item 9 stays a pointer, so the page does not grow by copying tables.") is the orchestrator's own sentence put to him (MORNING-DECISIONS.md:1895-1901) and approved by him, so the scope is orchestrator text he approved
- Three separable pieces, three commits, each green alone and each regenerating Spec 136: A (stop the clipping), B (each line reflects its notes), C (the new lines). Dropping B or C does not touch A, and item 4 has its own row in C (THIRTEEN ROWS, 17.1), so C no longer depends on B. Order: commit 0 (records), then A, B, C (17.5).
- Hard rule behind all three, found and quoted: "A new ruling is a new row in Spec 135, never a line here" (docs/specs/02-web-admin/136_mcfrontend_handbook.md:5, generator scripts/surfaces/generate-surface-handbook.mjs:157). Spec 136 is never hand-edited; spec text in 126/127/128 is never rewritten; Spec 133 output must not change.

## 1. How Spec 136 is made (verified)

- Generator scripts/surfaces/generate-surface-handbook.mjs. readFeRows (:52-89) reads the FE rows of Spec 135: six cells (ROW_COLUMNS :40: id, Ruling, Amends, Six, Full, Status). Headline = headlineOf(cells[1]) (:82). Notes = count of "Dated note <date>" inside the Status cell (DATED_NOTE :43, count :86). It throws on a gap in ids, a wrong "Next free id" (:72-73), a bad status word (:77).
- lineRow (:121-125) builds { id, headline, status, enforcedBy, notes }; the line text comes from renderLine in the Spec 133 generator (scripts/generate-bylaw-handbook.mjs:127-134): `- **<line id>** <headline>` then `  Status: ... · Enforced by: ... · +N dated notes`. So the page shows only the headline, the status and the note count.
- Rule map scripts/surfaces/_schema/surface-rule-map.json is generated by buildRuleMap (:94-118), one line and one rule per FE row. The CLI shell is runHandbookCli (scripts/analysis/gates/rule-map.mjs:45; --write / --check; --check compares both files, :68-77). HANDBOOKS['136'] is at rule-map.mjs:35.
- The clip: scripts/analysis/bylaw/bylaw-register.mjs:38 `HEADLINE_MAX = 300`; clip() :76-80; headlineOf :120-131 ends `return clip(head || plain(ruleCell), HEADLINE_MAX)`. HEADLINE_MAX is not exported and headlineOf has no length argument. The clip had no ruling behind it: it entered in 1c3bc7dfa (2026-10-21) as a lane choice and its only mention in a spec is an aside in the Spec 133 size-cap why. headlineOf is called only by bylaw-register.mjs, generate-surface-handbook.mjs and the tests spec133-bylaw-handbook.logic.test.ts and handbook-rule-map.logic.test.ts (grep of scripts and src, round 1).
- Who else uses it: readBylawRegisterRows (bylaw-register.mjs:147, headline at :174) feeds the Spec 133 generator. Measured in memory: 546 Spec 133 rows, 13 clipped (M-29, M-30, M-47, M-60, M-72, M-88, M-322, M-480, M-487, M-498, M-499, M-500, LC-33). With the cap removed those 13 lines grow by 1,920 bytes in total. Spec 133 is 139,467 bytes (wc) against its size cap max_bytes 140,000 (docs/specs/01-pipeline/122_split_manifest.json generated_size_caps["133"]; locked by src/tests/spec133-bylaw-handbook.logic.test.ts:218-233). Room is 533 bytes, so raising the shared cap would break Spec 133's cap and its --check. The shared cap must not change.
- Protection: scripts/analysis/bylaw/** is a layer23 path (mcbylaws/protected-paths.json, list layer23 :4-5), so an edit to bylaw-register.mjs is a McBylaws commit (McBylaws-Task trailer, panel arm P, arm C: scripts/analysis/mcbylaws/cite-arms.mjs:14, panel.mjs header). The generator's own header (generate-surface-handbook.mjs:18) says nothing under scripts/analysis/bylaw/ is edited.
- Where --check runs: NOT in .husky/pre-commit (the generator list at pre-commit :38-40 has the surface registry, the step handbook and the by-law handbook only). The Spec 136 --check runs as a test: src/tests/surfaces/handbook-rule-map.logic.test.ts:273 ("the committed files are current"), so it runs in the pre-commit related run when the generator is staged, in pre-push (full suite, .husky/pre-push) and in CI. Spec 133's --check is in pre-commit. No line is added to .husky/pre-commit for the Spec 136 --check: Spec 128 Rule 19 is met by the lock test that runs at pre-commit when the generator is staged, at pre-push and in CI, and a .husky edit is a protected edit no ruling named.

## 2. How a Spec 135 FE row is shaped, and what OWED and RULED mean (verified)

- Rules of the register (135:11-15): 2. "A rule without a lock is not yet a rule"; 3. status words `RULED <date>` / `OWED` / `PROPOSED` / `RETIRED`, "A ruled row whose lock is not built reads OWED with the lock path. Never an OWED marker with no lock path"; 4. Six cell; 5. "an OWED row's lock path must be a valid src/tests/surfaces/*.test.ts that does NOT yet exist". Enforced by src/tests/surfaces/register-locks-resolve.infra.test.ts (OWED_LOCK_RE :19; "OWED with no lock path" :73; a RULED row with no lock path must say "see FE-nn", :64-68).
- So the 12 new rows (no lock exists) are OWED rows, each naming a lock path that does not exist yet. This is exactly how existing rows entered: FE-04, FE-12, FE-17, FE-25, FE-26, FE-44 (135:26, :34, :39, :47, :48, :66) are OWED with a future lock path; FE-04, FE-26 and FE-44 mark parts PROSE-ONLY inside the Ruling text. The register has no PROSE-ONLY status word (rule 3). 8 OWED rows today (fe.04, 12, 17, 21, 25, 26, 39, 44; handbook line "Rules rendered: 44: 44 in force (8 OWED...)", 136:23).
- "+N dated notes" = count of "Dated note <date>" in the Status cell (generate-surface-handbook.mjs:43, :86). Measured: 51 notes in 26 rows; 22 of the 51 are status "flip" notes (a row flips OWED to RULED), 29 are not; average length 751 characters. Notes sit inside the Status cell of the same table row (not separate rows).
- Who may add a row: rule 1 (135:11) "A different party adjudicates"; the Full cell carries the operator's verbatim words (135 header: "Operator verbatim" = the operator's own words). Spec 135 is in the `protected` list of mcbylaws/protected-paths.json (entry docs/specs/**/135_mcfrontend_decisions_register.md, list `protected`), so a change needs the owner at push (scripts/analysis/mcbylaws/gate.mjs:568-582). FE-row discipline for `frontend` paths: the McFrontend-Task trailer and docs/reports/panels/MF-n.json in the commit's own tree (panel.mjs header; .husky/commit-msg runs gate.mjs --commit-msg). The generator, its lock and the rule map are under the `frontend` list (scripts/surfaces/**, src/tests/surfaces/**), so every one of the three commits needs the trailer and the panel record. Precedent for rows first plus panel record: commit 85955d3dd (FE-41..FE-44, queue row, panel MF-83).
- Arm Q: a DONE MF queue heading must carry "- FE rows owned: none." or a list of rows; a listed OWED row is refused (Spec 128 §4.11 item 7, 128:171-ish dated note). The 12 new rows are OWED, so the MF queue row for this task states "FE rows owned: none." (the locks are task-434's).

## 3. Size of Spec 136 section 2

- Today: section 2 is 13,784 characters (whole file 17,216), 44 lines. The review table sends this section (scripts/analysis/rule-lists.json:34, "surface-136" sections ["2. Rules"]).
- After A: the 16 clipped lines (fe.18, 19, 29, 30, 31, 34 to 44) are whole. Unclipped lengths: 377, 328, 546, 932, 576, 681, 1062, 350, 359, 675, 1190, 576, 544, 1132, 629, 500; extra 5,657 characters. Section 2 about 19.4K. Longest line 1,190 (fe.39).
- After B: about +3K (11 readings, 2,081 characters of text plus the fixed words).
- After C: about +8K (12 rows: rulings about 450 each plus a Status line).
- Measured in memory by the integration seat and this grounder (12 draft rows, 11 readings): section 2 13,784 -> 19,551 (A) -> 22,100 (A+B) -> 27,228 (A+B+C); the whole file 17,216 -> 30,661 (the earlier 31K was the whole file). Round 1 adds a 13th row (about +500) and one more reading net (about +0.4K): section 2 about 28K, to be re-measured at the end. It stays under the 30,000-character NOMINAL material of one review call (rule-lists.mjs:529, BOUND 120,000 at :29); no size cap exists for Spec 135 or 136 (generated_size_caps holds 132 and 133 only); Spec 135 grows 84,215 -> about 103K and the page rule-lists-by-kind.md pins both sizes (17.6).

## 4. THING 1: stop the clipping (commit A)

Smallest correct change: the Spec 136 generator no longer clips; Spec 133 and bylaw-register.mjs are not touched.

Options:
- A1 (recommended): in generate-surface-handbook.mjs readFeRows, `headline` = the shared headlineOf result unless the shared result was clipped (it ends in "…" AND the plain text of the cell is longer than 300 characters, so an authored ellipsis is never mistaken for a clip; and only for a cell with no leading bold span, where the shared rule prints the bold title and not the whole cell), in which case the plain text of the Ruling cell (a one-line `plain`: strip `<br>`, `**`, `~~`, backticks, collapse spaces; the same three regexes as bylaw-register.mjs:83-85). Named reason for the small copy: the shared reader is a layer23 McBylaws path (an edit there needs a McBylaws task and panel, and Spec 133 is 533 bytes under its size cap). Measured equivalence: for all 44 FE rows, the plain text equals the shared headline wherever the shared headline is not clipped (checked in memory: no difference), and equals the unclipped shared headline for all 44. stripProvenance (bylaw-register.mjs:88-104) changes none of the 44 today. The copy has a drift lock: A-T6 compares it with the shared headlineOf over all 44 real rows and over planted cells (a long unclipped cell, a cell ending in a provenance bracket, a cell with a br tag); the copy does not call stripProvenance and the test names that trade.
- A2: add an optional `max` argument to headlineOf (default HEADLINE_MAX). Output of Spec 133 stays identical. Cost: edits a layer23 file, so the commit needs `McBylaws-Task:` plus an MB panel record plus arm C, and a second panel for the frontend files. Pure reuse, but needs an MB task that does not exist for this work. A2 is STRUCK (round 1, Q1): it edits a layer23 file outside the Files line and needs a McBylaws task that does not exist; A1 reuses the shared function for every unclipped line and copies one line because the shared one cannot be lengthened without that task.
- Rejected: raise HEADLINE_MAX for both (breaks the Spec 133 cap: +1,920 B against 533 B room; also a layer23 edit). No replacement ceiling is added: the operator ordered the clip stopped, and a long ruling shows whole. Spec 133's 13 clipped lines stay clipped; they are not this task's and the orchestrator may card them.

Files: scripts/surfaces/generate-surface-handbook.mjs; src/tests/surfaces/handbook-rule-map.logic.test.ts; regenerated docs/specs/02-web-admin/136_mcfrontend_handbook.md. The rule map JSON does not change in A.

Tests, red first (all in handbook-rule-map.logic.test.ts, in-memory register text via the existing `reg`/`row` helpers, :36-39):
- A-T1 RED: a planted Ruling cell of 700 characters with no bold: today the headline ends in "…" and is 300 long, so `expect(headline.endsWith('…')).toBe(false)` and `headline === plain(cell)` fail. Control: a 120-character ruling is unchanged and equals headlineOf(cell).
- A-T2 real register: no FE headline ends in "…"; the 16 named rows are longer than 300; every headline equals the plain text of its cell.
- A-T3 existing assertions that encode the clip must change in the same commit (they would fail for the right reason): :59 (`headline.length <= 300`) and :61 (`endsWith('…')` implies length > 250) become "no headline ends in an ellipsis". The pin on the shared function (:92-95, a long cell still clips at 300) STAYS; it is the proof the shared reader is untouched.
- A-T4 Spec 133 untouched (control): src/tests/spec133-bylaw-handbook.logic.test.ts green, `node scripts/generate-bylaw-handbook.mjs --check` exits 0, `git diff --stat` shows no change under scripts/analysis/bylaw/ or docs/specs/01-pipeline/133_bylaw_handbook.md.
Result to record: the 16 lines whole, section 2 19,551 (measured by the seat; re-measure). A-T5 plants a 299-character cell with an authored ellipsis (unchanged), a 700-character cell and a 990-character cell (both whole).

## 5. THING 2: each line reflects its notes (commit B)

Honest count (read all 51 notes of 26 rows): 11 rows have a note that contradicts or widens the printed ruling: FE-01, FE-07, FE-11, FE-14, FE-18, FE-19, FE-20, FE-31, FE-33, FE-38, FE-39. (The report named 5 to 7: fe.01, fe.19, fe.14, fe.07, fe.20, fe.31, plus fe.06.) Round 1 rules the set is 12 rows, not 11: FE-29 is added (its 2026-11-11 note adds an image node kind with no value, status, confidence, provenance or disclosures, so the printed line is false for image nodes); FE-02 is added (its 2026-11-11 note confirms the standard for the web pages and points to Spec 126 section 0b, and the line carried a stale pointer); FE-33 is dropped (its headline already says mobile jest-expo and its note adds lock scope only); FE-32 stays out (its printed line stays true, the member is now a path); fe.06 stays a stated gap (its amendment is Spec 128:85, outside the row). Rule for a reading: a dated note of the row contradicts or widens what the printed line tells a reader to do; flip, lock-landing and build-detail notes get none, and the count of dated notes on every line still shows the rest. Five more rows have notes that add build detail without making the headline false (FE-13, FE-24, FE-29, FE-32, FE-02: FE-02's note says its own row "is owed as FE-40" while FE-40 is the McTest row, 135:62; a stale pointer, not contradiction). The other 10 rows with notes carry flips and lock-landing notes only. fe.06 in the report is not a Spec 135 note: its "oracle = catalogue flags" is amended by Spec 128 dated note at 128:85, outside the row, so a reading from "its notes" cannot cover it (stated as a gap, not fixed here).

Options, with cost (not chosen silently):
- (a) the generator prints a "current reading" from a marked field or the latest dated note. Cost: low code, but the latest note is often a flip note (22 of 51) or begins with a 300-character provenance bracket; it would print provenance, not meaning. Rejected.
- (b) each affected row gets ONE new dated note in a fixed form, `Current reading: <text> (from notes dated <d1>, <d2>)`; the generator prints it after the headline. Cost: about 25 lines of generator code, 11 notes written once, one small lock. A dated note is the register's existing amendment form (prior text kept, M-246 form, used 51 times). RECOMMENDED: smallest that is accurate, and understandable because the page shows a plain sentence and its source dates.
- (c) print the first sentence of each note. Cost: the shared firstSentence (bylaw-register.mjs:110-117) would return "Dated note 2026-11-09 (M-246, prior text kept; ..." (every note starts with a bracket of metadata); rejected.

Design of (b):
- Form of the note appended last in the Status cell: `Dated note 2026-11-22 (M-246, prior text kept; task-430, RR-0384; operator, verbatim: "make each line reflect its notes" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1901)): Current reading: <text> (from notes dated <d1>, <d2>). The cell text above is kept.` It states no new ruling: each reading restates what dated notes of the same row already say, and the cited dates name them. The notes it restates carry the operator's own words. A Current reading is lane text, labelled so in its own bracket (not an operator word, not a ruling, changes no status or lock); the adjudicator is the plan grounder Cairn-Ground-P430 on 2026-11-22 for the texts of 17.3, and a separate output grounder at the lane close checks each sentence against the cited note (135:11).
- Generator: in readFeRows, from the Status cell find the LAST dated note; if it contains `Current reading: (.+?) \(from notes dated (dates)\)`, set row.reading. lineRow appends ` Current reading: <text> (notes <dates>)` to the SAME line as the headline (not a new line), because the existing test at handbook-rule-map.logic.test.ts:157 matches `^- \*\*fe\.N\*\*[^\n]*\n {2}Status: OWED` and a new line would break it for FE-39. Spec 133's renderLine is not touched.
- Staleness lock (in readFeRows, so --check and the lock both fail): (i) a "Current reading" note that is not the last note of its row throws `FE-nn: a dated note follows the Current reading; restate it`; (ii) every cited date must be the date of another dated note of the same row, else throws; (iii) the reading is at most 800 characters (chosen, not derived; keeps the page from growing; the longest reading is 496); (iv) the set of rows that carry a reading is pinned in the test to the 12 ids of 17.3 (adding one is a deliberate edit); (v) a status cell that contains Current reading: but whose last note does not parse in the one strict, end-anchored form of 17.4 throws; (vi) each cited date must be the date of an EARLIER note of the row, never the reading's own date. What the lock cannot do: decide that a row with no reading needs one. That stays a reviewer judgment (said so plainly).
- The 11 readings (drafts in ROWS-430-draft.md section B; each sentence traceable to a note I read in 135:23, :29, :33, :36, :40, :41, :42, :53, :55, :60, :61).

Files: scripts/surfaces/generate-surface-handbook.mjs; handbook-rule-map.logic.test.ts; docs/specs/02-web-admin/135_mcfrontend_decisions_register.md (11 notes); regenerated 136. Rule map JSON unchanged (it holds structure only, buildRuleMap :94-118).

Tests, red first:
- B-T1 RED: a planted row whose last note is a Current reading: the rendered line contains "Current reading: ..." (today: absent). B-T2 control: the same row without the reading note renders as today. B-T3 RED stale: a row with a later dated note after the reading throws /follows the Current reading/. Control: reading last, builds. B-T4 RED: cited date that is not a note date of the row throws; control: real dates. B-T5 RED: reading of 401 characters throws; control 400. B-T6 real register: the 11 pinned ids carry a reading, every other row prints none, the OWED regex at :157 still returns the 8 OWED ids plus no new one from B. B-T7 the "+N dated notes" count rises by exactly 1 on those 11 rows (51 to 62), shown on their lines.

## 6. THING 3: the 13 lines (commit C)

Verified each of the 13 cites in the specs (docs/specs/02-web-admin). Per-item decision, with evidence, against the existing 44 rows:

| Item | Verdict | Evidence |
|---|---|---|
| 1 client is glass | new row | 128:29 and 128:55 say it; FE-05 (135:27) says "no maths in the UI" only. No FE row mentions "deviations" or "glass" (searched all 44 rows). |
| 2 libraries | new row | No FE row names Mantine. 126:1005 (Mantine 8.3 by dated note), :1006, :925, :75. package.json:78-83,107 has @mantine/core 8.3.18, @rjsf/mantine 6.11.1, mantine-datatable 8.3.13; "sonner" at package.json:122. CORRECTION to the report: it says "Not ... Sonner"; Spec 33:47 (docs/specs/02-web-admin/33_web_admin_engineering_protocol.md:47, operator "P42 decisions approved") says "toasts are unchanged: `sonner`, for the MaxBLD web pages too (no `@mantine/notifications`)". Round 1: The libraries row says nothing on the toast library (RR-0384 did not rule it and the operator was asked and did not answer); it carries only the Mantine, Reusables, hand-built and new-library words. No ruling found on React Hook Form, so it is not in the row. Shadcn is superseded at 126:467. Task-435 adds a dated note to the engineering standards on the same subject; this row cites Spec 126 and Spec 33, not that note, so the two do not depend on each other. |
| 3 tunables | new row | 128:30 (general) and 126:189 (P4 of the eleven ADMIN principles, section 2.2.1 at 126:180, so cited as admin). FE-35 mentions logic_variables only for its own pace field. |
| 4 scratch mocks | new row (round 1: item 4 has its own row; its first sentence, never copied into the repo, is at 126:79 and in no FE row or note, FE-31's note of 2026-11-11 holds only the second sentence) | 126:79 (§0b item 8); FE-31 (135:53). |
| 5 scope fence | new row | 128:205 (R-03), 126:140, 126:147. FE-39's mention of scope is unrelated. |
| 6 auth and checkout | new row | 126:928; the in-app purchase amendment at 126:1120 (item 1 of a dated-note block that opens at :1116/:1118; the heading date of that item is UNVERIFIED). FE-21 (135:43) covers embeds only. |
| 7 navigation extras | new row, narrowed | FE-36 (135:58) already states router, role and name, window.location. Missing from FE-36: "A tab switch uses `navigate`, not `push`" and the reach to every MaxBLD screen; both at 126:82, where the spec itself says the tab sentence is "convention, not checked by the lock". Row says only the missing part. |
| 8 parcel id names | new row, reworded | 128:206 (R-04, ACCEPTED, lock pending). Round 1: the seam IS in Spec 126 section 14 (126:1238): "the consumer API's parcelId = parcels.parcel_id = parcel_ref"; the row carries it. Only "in URLs" is not a spec sentence and is dropped. |
| 9 page-set rulings | pointer row | 126 §11b.3 starts at :963, §11b.7 at :1032 (verified headings). Words are the operator's pointer ruling in RR-0384; the row copies no table. |
| 10 visible failure state | new row, reworded | The spec words are at 128:39 (Rule 12), NOT :37 (report; :37 is Rule 10 "verdict row-derived"). The report's form adds "empty, offline"; not in the spec; dropped. FE-28 (135:50) and FE-31 cover specific closed lists, not this sentence. |
| 11 admin is a projection | new row | 126:186 (P1). FE-05 and FE-11 (135:27, :33) do not say "never a parallel data path". |
| 12 locks proven red | new row | CORRECTION: "A rule without a lock is not yet a rule" is at 128:127 (row 4) and 128:150, and as rule 2 of Spec 135 itself (135:12); the report's 128:44 is an empty line. The "prove each lock RED" words are at 127:59 (report said :60, an empty line). FE-03 (135:25) says only "both-directions locks" inside principle P2; the sentence "a lock never red against the defect it names is not a lock" is not in any row. |
| 13 accessibility | new row, reworded | 126:351 is a row of the check-category vocabulary: "a11y ... touch-target floor (44×44) · labels · dark-mode tokens · safe-area · reduced-motion". It is a category list, not a mandate; the report's "interactive elements 44 px minimum; every control has a name" goes beyond it. The 44 px mandate is at docs/specs/00_engineering_standards.md:14. The 44 px check C-9 exists (src/tests/surfaces/surface-conformance.logic.test.ts:631-641) for converted web golden nodes only, under FE-31's lock; the row says so and keeps the rest OWED. Against C-9 this is not a duplicate: C-9 is a lock, the row is the rule the lock does not state. |

Result (round 1): THIRTEEN ROWS, one per item, in item order (placeholders FE-45..FE-57; the real ids come from "Next free id" at landing); item 9 is a pointer row. The operator said "13 lines" and the count is met.

Status and enforcement (round 1: the 13 rows of 17.2 govern and their texts are final): each is `OWED` with one lock path under src/tests/surfaces/ that does not yet exist (rule 5; names in the draft: client-glass-boundary, ui-library-set, tunables-are-data, scope-fence, auth-checkout-hosted, nav-tab-switch, parcel-id-names, page-set-pointer, failure-state-declared, admin-same-descriptor, lock-planted-defect, a11y-category, all `.logic.test.ts`; all 12 names checked absent in src/tests/surfaces). They are reservations; task-434 builds the checks and may rename by a dated note. Where no check is possible the row says PROSE-ONLY in its Ruling, as FE-04/26/44 do (item 9 row: lock checks only that the two cited headings exist). Handbook honesty: render shows "OWED · lock owed: <path>" and no "Enforced by" (generate-surface-handbook.mjs:121-125; the existing lock at handbook-rule-map.logic.test.ts:157-165 requires this).

Collision (important): lane BL-MFRULES (task-388, status RUNNING) already holds FE-45 in an unlanded commit on branch wf1/inc1b-mfrules (~/Buildo-wt-mfrules, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md:67 there; its Next free id is FE-46). Whichever lands second takes the next free id at the moment of landing (read from the board head), renumbers its rows, rewrites the "Next free id" line with a dated note (135:17 shows the form) and runs the generator and its --check at once (Landing checklist, 17.5); the orchestrator orders the two landings (task-388 holds FE-45 and MF-94; this task takes MF-95). The draft uses FE-45.. as placeholders; the real ids are set at landing.

Other effects: src/tests/backlog/rule-lists-table.logic.test.ts:205-210 pins "fe.01 to fe.44 (44 distinct ids)" and will fail for the right reason once 136 has fe.45 (task-388 hits the same). Fix in commit C: compute the expected range from readFeRows of the real register (it already throws unless "Next free id" is the row count plus one), so no new parse is added. Comments citing 136 line numbers (scripts/analysis/gates/mobile-literals.mjs:9 "136:163 fe.44") are text only, not locked; they go stale by position, not by id.

Tests, red first (commit C):
- C-T1 RED: the committed register with the 12 rows and no regenerated 136/rule map: `--check` exits 1 naming both files; control: after --write, exit 0 (existing test :273 does this).
- C-T2 real register: ids contiguous FE-01..FE-(44+12), "Next free id" = next (readFeRows throws otherwise, :68-73); each new row OWED with exactly one lock path that matches OWED_LOCK_RE and is not tracked (register-locks-resolve covers this; planted case exists at :185). The existing generic tests (every FE row appears once, :150-155; rule-map deep-equal) stay green with 56 rows (they use realRows().length).
- C-T3 the 44 -> 56 count: the handbook header line "Rules rendered: 56" and "v1 covers the 56 FE rulings" (generator :163, :180; asserted at handbook-rule-map.logic.test.ts:~200 via realRows().length, so no edit needed). Planted defect: delete one new row from a temp register copy: --check names the rule map and handbook stale and the id gap throws "no gap or reorder" (:70).
- C-T4 quote lock is dropped (round 1, Q3: no ruling names it; the 31 quoted spans of the draft rows were checked against the specs by the integration seat and this grounder and the row texts are fixed in 17.2). The rest of this C-T4 paragraph is struck. Every double-quoted span of 25 or more characters in the Ruling cell of the 12 rows occurs, after whitespace collapse, in the spec file it cites. Planted: change one word of a quote: fails; control: real rows pass. It is the only mechanical proof of "the spec's own words". Cost: about 20 lines in the existing test file.
- C-T5 rule-lists-table.logic.test.ts:205 computed range (red first: add a planted FE-45 line and the old pin fails).

## 7. Order

1. Commit 0 (records), then A, then B, then C (17.5); A is a precondition for B and C reading whole lines; each of A, B, C is independently green.
2. Per commit: write the tests, prove red (run them before the change, saved output as the red evidence), make the change, run `node scripts/surfaces/generate-surface-handbook.mjs --write`, then the checks below.
3. Checks that must stay green after each commit: the Spec 136 lock (handbook-rule-map.logic.test.ts, all describes), register-locks-resolve.infra.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts and rule-lists.logic.test.ts, spec133-bylaw-handbook.logic.test.ts, `node scripts/generate-bylaw-handbook.mjs --check`, `node scripts/surfaces/surface-validate.mjs --check`, `node scripts/violations/generate-surface-registry.mjs --check`, `node scripts/analysis/spec-split-check.mjs --check`, the pre-commit gates, and at pre-push the full suite. Generated files per commit: A: 136 and the page docs/reports/generated/rule-lists-by-kind.md (run node scripts/analysis/rule-lists.mjs page --write; page --check is in pre-commit and in rule-lists.logic.test.ts:447-452); B: the same two; C: 136, the page and surface-rule-map.json (44 to 57 rules and lines). The Spec 128 spec-mirror check is not in this list: generate-spec-mirror.mjs --check fails at the board head on an unrelated Spec 124 block and it mirrors Spec 124 into 128, not 135 or 136.

## 8. Landing

- Trailers on each commit: `Task: task-430` and `McFrontend-Task: MF-n` (n = MF-95, the next free number, claimed in the id ledger by the orchestrator before the launch; MF-94 is held by task-388's lane), plus an Operator-Ruling line naming his word Approved (RR-0384, 2026-11-22, MORNING-DECISIONS.md:1901; Spec 126 section 0b item 6), plus a Spec-diff line as the precedent commits carry (e2b2523e3, 85955d3dd; harmless, check-spec-diff.mjs is triggered only by scripts/steps, scripts/lib/compute and descriptor.json paths). No commit message holds an FE token: cite-parse.mjs FE_ID_RE reads every FE-nn in the message and arm C refuses an OWED id and any id outside the prereg rules[]; rows are named by the lowercase line id (fe.n) or not at all. Panel record docs/reports/panels/MF-n.json with task, item, plan, output non-empty (panel.mjs recordOk); one record serves all three commits (read from the commit's own tree). Queue row for MF-n with "- FE rows owned: none." (Spec 128 §4.11 item 7 note).
- Protected paths touched: scripts/surfaces/**, src/tests/surfaces/** (frontend), Spec 135 and the panel directory (protected): the owner is prompted at push. No file under scripts/analysis/bylaw/ in the recommended A1.
- Close: work commits, then the MF-95 queue row moves to DONE in its own commit (the closing commit may stage only the lane report directory, the review context directory, task files and decision records, Spec 137 section 4 task-410 note), then the closing commit holds only the lane records and the task file (Spec 137 rule; the DoD item 6 in task-430 says the status line changes "in the same commit as the work": the sha is recorded by the later close commit).
- Through the real hooks, none bypassed (task DoD 3).

## 9. Acceptance

1. Spec 136 section 2 has no line ending in "…"; the 16 lines are whole; measured size recorded.
2. The 12 rows of 17.3 carry a Current reading on their line, with the cited note dates; a later note makes `--check` fail (the refusals (i) to (vii) are agreed scope).
3. Spec 136 has 13 new lines (the ids Next free id gave at landing), each OWED with its lock path, each citing the spec's own words with file:line; item 9 is a pointer; item 4 is its own line.
4. Spec 133 byte-identical; scripts/analysis/bylaw/** untouched (A1).
5. All checks in section 7 green; red evidence for every planted case saved. Before each commit the lane writes its 5-10 item self-skeptical checklist from the spec section that governs the change and records PASS or FAIL per item (engineering standards section 11).

## 10. NOT in scope

Dropping Specs 126-128 from the review table (task-431, second step); building the locks of the 12 new rows (task-434); the Spec 128 R-01..R-34 rows and MF-31; fe.06's "oracle = catalogue flags" (its amendment is in Spec 128:85, not in the row); the engineering-standards note (task-435); rewriting FE-02's stale "owed as FE-40"; mobile specs; any change to Spec 133 or to bylaw-register.mjs.

## 11. Effect on other tasks' plan evidence

- Tasks whose evidence quotes the surface-136 or surface-135 lists: task-431 (review table; sends section "2. Rules" of 136, rule-lists.json:34), task-433 (BUILT, rules-checked line; counts rule ids per list, so 12 more ids appear in the list), task-399, task-375, task-376, task-384, task-387, task-388, task-429 (all mention them; found by grep of backlog/tasks). Not-yet-launched ones are 431 and 434 (and 436 if it exists): their plan evidence that says "44 lines", "8 OWED" or "section 2 is about 13,800 characters" is stale after C (56 lines, 20 OWED, about 31K). Test pin at rule-lists-table.logic.test.ts:205 is the only code pin found (searched src/tests and scripts for fe.44, "44 FE", "44 rules").
- task-388 (running) adds FE-45 and needs the same re-numbering and the same pin fix. Precondition for task-431 (RR-0380: the surface specs stop being sent once the handbook holds the critical items): task-431's transition waits for commit C of this task to land; at that close the page still shows 21 OWED rows, reservations whose locks are task-434's (stated here, for the orchestrator to put to the operator at task-431).

## 12. QUESTIONS (round 1: all four are RULED by the rules and the record, none goes to the operator; see QUESTIONS-RULED.md; the text below is the question as first asked)

1. Landing cost of the clip fix. Option A1 (recommended): a one-line plain-text copy inside the McFrontend generator, no McBylaws commit. Option A2: add a length argument to the shared reader: no copy, but a McBylaws task, panel and owner step for a layer23 file. Rules cannot settle it, because both are allowed and cost differs.
2. Rows versus items. 12 new rows, not 13: item 4 is already a dated note on FE-31 and reaches the page through the reading. Keep (page is 300 characters smaller, no duplicate) or add a 13th duplicate row (his "13 lines" count exactly)?
3. OWED stays visible. Twelve OWED rows take the page from 8 to 20 OWED. The register has no PROSE-ONLY status (135:13). Accept OWED until task-434 builds each lock, or rule a new status word (which changes the gate reader cite-parse.mjs, a protected McBylaws file)? Recommend accept.
4. The optional quote lock C-T4: keep or drop.

## 13. UNVERIFIED

- Whether the McBylaws gate refuses a McFrontend-only commit that adds OWED rows without red evidence: Spec 128 §4.11 item 3 puts the red-evidence condition on the OWED to RULED flip only; I did not run the gate.
- The next free MF queue number and the exact queue-heading form for arm Q; the exact hooks (check-spec-diff.mjs) a docs/specs commit triggers beyond the Spec-diff precedent.
- Whether any test other than the ones named pins note counts or line counts of Spec 136 or 135 (I searched src/tests and scripts for the literal strings only).
- FE-01 note 1 says the surface paths "move to layer23"; mcbylaws/protected-paths.json now lists them under `frontend`. The reading therefore says only "no longer held".
- 126:1120's own note date; item 8's claim about parcelId in routes (dropped); the report's claims about the scan scope of report-no-maths (report-no-maths.logic.test.ts:23, :225-240; not read by me, left out of the rows).
- Section-2 sizes after B and C are estimates (about 31K); A is arithmetic from measured line lengths.
- That Spec 33:47 and 126:467 are still the latest rulings on toasts and Shadcn (read only those lines).

## 14. GUESS estimate

About 5 to 6 agent-hours of lane time: A 1 hour, B 2 hours (11 readings plus lock), C 2 hours (12 rows, per-quote check, the test pin), plus the plan review and landing steps. About 25 new test cases.

## 15. Files

scripts/surfaces/generate-surface-handbook.mjs; src/tests/surfaces/handbook-rule-map.logic.test.ts; docs/specs/02-web-admin/135_mcfrontend_decisions_register.md; docs/specs/02-web-admin/136_mcfrontend_handbook.md (generated); scripts/surfaces/_schema/surface-rule-map.json (generated); src/tests/backlog/rule-lists-table.logic.test.ts; .cursor/MCFRONTEND-QUEUE.md; docs/reports/panels/MF-n.json; backlog/tasks/task-430.

## 16. Files line to set on the card (round 1; the task file, docs/reports/reviews/task-430/ and docs/reports/lanes/ are always allowed; MF-95 is the number to claim; the page and the prereg are added because check-task-files.mjs refuses a staged path the Files line does not declare; the added paths resolve four more rule lists, policy-124-s2-s5, agents-s5-1to3, orchestrator-doc17 and bylaw-133, DRIVEN with rule-lists.mjs resolve, so a second plan review round runs their plan compliance outputs on the folded plan)

Files: scripts/surfaces/generate-surface-handbook.mjs, scripts/surfaces/_schema/surface-rule-map.json, src/tests/surfaces/handbook-rule-map.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/, docs/reports/generated/rule-lists-by-kind.md, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-95-1.json

## 17. ROUND 1 RULINGS (plan grounder Cairn-Ground-P430, 2026-11-22; section 17 governs wherever it conflicts with a sentence above; reasons: docs/reports/reviews/task-430/GROUNDER-PLAN.md and QUESTIONS-RULED.md)

### 17.1 Ruled by the rules and the record (nothing is left for the operator)
- A1 RULED by the rules (Q1): the Spec 136 generator copies one line of plain text and keeps the shared headlineOf for every unclipped line; A2 is struck.
- OWED rows are accepted until task-434 builds each lock (Q2): rule 3 of Spec 135 has no other word and rule 5 requires the unbuilt lock path; no new status word; the page header already says an OWED lock is still to land.
- C-T4 quote lock is dropped (Q3).
- THIRTEEN ROWS (Q4): item 4 has its own row because its first sentence, "never copied into the repo" (126:79), is in no FE row or note.
- The libraries row says nothing on the toast library: the operator was asked about Sonner and did not answer, so the row neither keeps nor drops it; Spec 33:47 is untouched.
- The Full cell quotes only his two phrases, "These look great - teh 13 are perfect" and "Approved", as his own words and labels the rest as orchestrator text he approved (round 2: it also quotes the recorded reply in full, as 17.2 gives it, so the cell neither under-quotes the record nor attributes the orchestrator's sentences to him); no Status cell says Ruled with the approval date.
- The words dropped from the report forms (the rows quote only what a spec says; he may add any of them by his own words as a later row): item 2 "Not Shadcn, React Hook Form or Sonner"; item 8 "in URLs"; item 10 "empty, offline"; item 13 "interactive elements 44 px minimum; every control has a name" beyond the vocabulary row and the engineering standards line. Item 8 gains the seam sentence of 126:1238 that the report form had.
- Readings: 12 rows (FE-33 dropped, FE-02 and FE-29 added), by the Rule for a reading of section 5.

### 17.2 The 13 rows (final texts; ids are placeholders FE-45..FE-57 until landing; six cells per row, no pipe inside a cell)
Full cell of every row, with N the item number: Operator verbatim as recorded (2026-11-22, RR-0384, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1901-1903 and backlog/decisions/decision-169): his reply pasted the orchestrator's message back and added two phrases of his own, "These look great - teh 13 are perfect" (first) and "Approved" (last, line 1903). The recorded reply in full: "These look great - teh 13 are perfect. Task 430 becomes three small things: stop the clipping, make each line reflect its notes, and add these 13 lines. Item 9 stays a pointer, so the page does not grow by copying tables. I have not started task 430. You said you would read the list first, and this is it. Approved". The scope and the list (item N of ~/Buildo-scratch/lanes-20261119/inc1b/inputs429/REPORT-429.md section 3A) are orchestrator text he approved. The Ruling cell quotes the spec's own words; this row rules nothing new.
Status cell of every row: OWED followed by the lock path in backticks, then "; added 2026-11-22 (RR-0384); no machine check yet, the lock is task-434's and the path is a reservation." and the row's extra sentence.
Item 1 (FE-45): Ruling: The client is just glass. "Five things may stay client-side (device state · optimistic UI · offline cache · animation · nav position); everything else is server-projected." (Spec 128 Rule 2, 128:29). "Anything else computed client-side is a Rule 2 violation and needs a `deviations[]` row with an adjudicator and a date." (128:55). | Amends: 128 rule 2 (128:29), 128:55; FE-05 | Six: D n/a, P owed, F pass, S pass, H n/a, E pass | lock path: src/tests/surfaces/client-glass-boundary.logic.test.ts | extra sentence: FE-05's no-maths lock covers arithmetic only.
Item 2 (FE-46): Ruling: Libraries. "the web library is Mantine 8.3" with `@rjsf/mantine` and `mantine-datatable` (126:1005, dated note 2026-11-09); mobile is "React Native Reusables per Spec 90 §6", vendored unmodified (126:1006). "No hand-built standard component." (126:925). "a new library, a new component kind or a new binding outside §11b.5 is an operator ruling before it is built" (126:75). This row says nothing on the toast library: RR-0384 did not rule it. | Amends: 126 §11b.4 (126:1005, :1006, :925, :75) | Six: D pass, P owed, F n/a, S pass, H n/a, E pass | lock path: src/tests/surfaces/ui-library-set.logic.test.ts | extra sentence: FE-31 checks the listed binding modules only.
Item 3 (FE-47): Ruling: Tunables are data. "every debounce, page size, stale time and rate limit is a registered logic variable with bounds and an `on_invalid` posture" (128:30, Rule 3). "All tunables are data; zero thresholds in `src/`." (126:189, admin principle P4, 126:180). | Amends: 128 rule 3 (128:30); 126:189 | Six: D pass, P owed, F n/a, S pass, H n/a, E pass | lock path: src/tests/surfaces/tunables-are-data.logic.test.ts | extra sentence: The schema requires config.debounce_ms on SEARCH only.
Item 4 (FE-48): Ruling: Scratch mocks are design inputs only. "Mocks, briefs, Stitch exports and research in `~/Buildo-scratch/` are references, never copied into the repo" (126:79, §0b item 8). "Anything in a Stitch export with no source (a ruling, a spec, a setting or a DB field) is left out and is not raised as a decision" (126:79); the dated note 2026-11-11 of FE-31 carries this second sentence. | Amends: 126 §0b item 8 (126:79); FE-31 | Six: D pass, P owed, F n/a, S pass, H n/a, E n/a | lock path: src/tests/surfaces/scratch-mocks-not-in-repo.logic.test.ts | extra sentence: Nothing checks the first sentence today.
Item 5 (FE-49): Ruling: The scope fence. "Spec 100 stays fenced. No linkage to LeadDetail, the flight board, or the lead feed. `lead_parcels` is read by no surface." (128:205, R-03). "Scope D is fenced, and the fence is Spec 128 R-03." (126:140). "A scope-C change is a two-product change. Its plan says so, and its review panel is sized for it." (126:147). | Amends: 128 R-03 (128:205); 126:140, :147 | Six: D pass, P owed, F n/a, S pass, H n/a, E n/a | lock path: src/tests/surfaces/scope-fence.logic.test.ts | extra sentence: R-03 stays ACCEPTED in Spec 128 until MF-31 moves it. Known standing exception: a platform_shared contract descriptor note already names lead_parcels (REPORT-429 section 3A item 5); task-434 meets it when it builds the lock.
Item 6 (FE-50): Ruling: Auth and checkout. "Auth and checkout are existing or hosted, not converted. Sign-in is the existing Buildo sign-in (web and mobile), shared and declared" and "Checkout and billing are Stripe-hosted (Checkout, Customer Portal)." (126:928). Amended by the dated note of 2026-11-11 at 126:1120: "The monthly plan is also offered as an Apple in-app purchase beside web checkout, on one account and the same `parcel_tool` entitlement" (queued as MF-70); "the later operator ruling governs". | Amends: 126:928; 126:1120 | Six: D pass, P owed, F n/a, S pass, H n/a, E pass | lock path: src/tests/surfaces/auth-checkout-hosted.logic.test.ts | extra sentence: Nothing checks this today.
Item 7 (FE-51): Ruling: Navigation extras that FE-36 does not state. "A tab switch uses `navigate`, not `push`." (126:82, §0b item 11). The navigation rule reaches "every MaxBLD screen, web and mobile" (126:82). Spec 126 calls the tab sentence "convention, not checked by the lock" (126:82), so it is PROSE-ONLY until the lock below exists. | Amends: 126 §0b item 11 (126:82); FE-36 | Six: D pass, P owed, F n/a, S pass, H n/a, E pass | lock path: src/tests/surfaces/nav-tab-switch.logic.test.ts | extra sentence: FE-36's nav-by-route lock covers the rest of the rule.
Item 8 (FE-52): Ruling: The two parcel ids have two names. "`parcel_ref` = `parcels.parcel_id` `VARCHAR(20)` (municipal); `parcel_pk` = `parcels.id` `SERIAL`." and "`usage_events.subject_kind` is required and closed so a ledger row can never blend them." (Spec 128 R-04, 128:206, ACCEPTED). The id-translation seam: "the consumer API's `parcelId` = `parcels.parcel_id` = `parcel_ref`" (126:1238, §14). | Amends: 128 R-04 (128:206); 126 §7, §3.4, §14 (126:1238) | Six: D pass, P owed, F n/a, S pass, H n/a, E n/a | lock path: src/tests/surfaces/parcel-id-names.logic.test.ts | extra sentence: Spec 128 marks the R-04 lock pending and R-04 stays ACCEPTED there until MF-31 moves it; nothing checks UI or route code.
Item 9 (FE-53): Ruling: POINTER, not a copy: before changing a MaxBLD page, read its row in Spec 126 §11b.3 (126:963) and the rules and amendments in §11b.7 (126:1032): routes, what is special, the ruled rules with the operator's words. Where a later dated note amends a rule above it, "the later operator ruling governs" (126:1120). The tables are not copied here. PROSE-ONLY: the lock below checks only that the two cited headings exist; it checks no page ruling. | Amends: 126 §11b.3 (126:963), §11b.7 (126:1032) | Six: D n/a, P owed, F n/a, S pass, H n/a, E n/a | lock path: src/tests/surfaces/page-set-pointer.logic.test.ts | extra sentence: The page rulings are pinned only where a page test exists.
Item 10 (FE-54): Ruling: A visible state for every failure. "a surface declares what the user sees when it fails" and "An unhandled state is a FAIL, not a blank screen." (Spec 128 Rule 12, 128:39). | Amends: 128 rule 12 (128:39); FE-28, FE-31 | Six: D pass, P owed, F n/a, S pass, H pass, E pass | lock path: src/tests/surfaces/failure-state-declared.logic.test.ts | extra sentence: Goldens per declared state exist for converted surfaces only (FE-31).
Item 11 (FE-55): Ruling: The admin is a projection. "The admin is a projection, not a product. An admin page is the same SURFACE/CONTRACT descriptor with an admin audience — never a parallel data path." (126:186, admin principle P1). | Amends: 126 §2.2.1 P1 (126:186); FE-05, FE-11 | Six: D pass, P owed, F n/a, S pass, H n/a, E n/a | lock path: src/tests/surfaces/admin-same-descriptor.logic.test.ts | extra sentence: Nothing checks it today.
Item 12 (FE-56): Ruling: Locks are proven red. "A rule without a lock is not yet a rule" (128:127, rule 4; Spec 135 rule 2). "Prove each lock RED on a fixture that declares a column or a policy that does not exist" and "a lock never red against the defect it names is not a lock" (127:59, the row numbered 6). | Amends: 128 rule 4 (128:127, :150); 127:59; FE-03 | Six: D n/a, P owed, F n/a, S pass, H n/a, E n/a | lock path: src/tests/surfaces/lock-planted-defect.logic.test.ts | extra sentence: Today only the red-evidence file is checked, for an OWED flip.
Item 13 (FE-57): Ruling: Accessibility. The a11y check category is "touch-target floor (44×44) · labels · dark-mode tokens · safe-area · reduced-motion" (126:351, a row of the check vocabulary, not a mandate). The 44 px floor is also stated at docs/specs/00_engineering_standards.md:14: "All interactive elements (buttons, links, toggles, icons) MUST have a minimum tappable area of" 44px x 44px. It is checked on converted web goldens (C-9) and mobile (C-9m) under FE-31; the rest is PROSE-ONLY until the lock below exists. | Amends: 126 §4 row 24 (126:351); 00_engineering_standards.md:14; FE-31 | Six: D pass, P owed, F n/a, S pass, H n/a, E pass | lock path: src/tests/surfaces/a11y-category.logic.test.ts | extra sentence: Labels, dark-mode tokens, safe-area and reduced-motion have no check.

### 17.3 The 12 Current readings (appended last in each row's Status cell, preceded by one space, or by br where the row already uses br between notes)
Frame, with ID the row and D the cited dates: Dated note 2026-11-22 (M-246, prior text kept; ID · McFrontend queue · lane BL-HB430; RR-0384, operator, verbatim: "Approved"; lane text restating the notes dated D of this row, not an operator word and not a ruling): Current reading: TEXT (from notes dated D). The cell text above is kept.
FE-01 | dates 2026-11-06, 2026-11-09 | Phase 1 (the report page) is open since 2026-11-06 and Phase 2 (every MaxBLD page, Spec 126 §11b) since 2026-11-09; the 2026-11-02 infra freeze is lifted by name for both. The lock asserts that the Spec 126 status line names Phase 1 and Phase 2, not Phase 1 only.
FE-02 | dates 2026-11-11 | The standard is confirmed for the web pages as well as the report, and the working standard is written down in Spec 126 §0b.
FE-07 | dates 2026-11-09 | The parity rule applies to every MaxBLD page with more than one declared target (Spec 126 §11b.2), keyed by surface; for non-REPORT surfaces it is checked inside the conformance lock (FE-31). This lock, its REPORT scope and its status are unchanged.
FE-11 | dates 2026-11-09 | Admin tasks only as listed for Phase 2 (MF-30, MF-37, MF-40); no MF task outside Phase 0-2 or convert-on-touch.
FE-14 | dates 2026-11-09 | LEAN now covers McFrontend Phase 2 as ruled: no MF task outside Phase 0-2 or convert-on-touch.
FE-18 | dates 2026-11-06 | The closed set has six sources: catalogue, content, user_input, ad_slot, external_embed and parcels (FE-27); it lives in scripts/surfaces/_schema/binding-sources.json.
FE-19 | dates 2026-11-11, 2026-11-15 | Confidence for a user lot-size entry reads high, not medium; the re-evaluation is McBylaws MB-89, not increment 6; the entry is width and depth, with the area form as the link's alternative.
FE-20 | dates 2026-11-11, 2026-11-15 | One active entry per lot, whichever form made it; "the newest user entry is shown" reads as the active entry; history is kept; a width entry then an area attempt is a 409.
FE-29 | dates 2026-11-11 | One closed image node kind exists (field, source, kind image, label, images); it carries no value, status, confidence, provenance or disclosures, because an image is not a reading; every other node is unchanged.
FE-31 | dates 2026-11-09, 2026-11-11, 2026-11-20 | The render-smoke clause is its own row, FE-33, and this row's lock does not check it. The mount-file import rule governs UI page, screen and mount files only. Every build reuses existing components, bindings and patterns; a new library, component kind or binding is an operator ruling first; an element in a Stitch export or scratch mock with no source is left out. The web footer is one shared component, footerNode.ts.
FE-38 | dates 2026-11-12 | The scope is wider: a hit with no evaluated option is not counted against the monthly allowance; max_buildable_footprint_sqm, envelope_constrained, envelope_constraint_reason and compStats.neighbourhoodCostPremium are also sent as null, and the screen shows no Envelope constrained note. Same lock, extended.
FE-39 | dates 2026-11-20 | One record per lot and option, computed on first open (or track, or owner input) and stored with its stamp; a record whose stamp differs is never served and is recomputed (ST-5 as amended; the two sentences it replaces are SUPERSEDED). The cost sentence is not amended; it waits for open point 3 of doc-16 section 7. When the web live switch flips, engine numbers go to every paying user at once, not testers only (operator "4 a"). The amendment text is policy text of doc-16, not operator words.

### 17.4 The generator lock for B
The page line carries the reading after the headline: " Current reading (lane text, notes D): TEXT" on the SAME line (the pin at handbook-rule-map.logic.test.ts:157 and Spec 133's shared renderLine stay untouched). Strict form, tested on the LAST note segment of the Status cell (from the last "Dated note " to the end of the cell): /^Dated note (\d{4}-\d{2}-\d{2}) \(M-246, prior text kept; (FE-\d+) · McFrontend queue · lane [A-Za-z0-9-]+; RR-0384, operator, verbatim: "Approved"; lane text restating the notes dated ([0-9, -]+) of this row, not an operator word and not a ruling\): Current reading: (.+) \(from notes dated \3\)\. The cell text above is kept\.$/. The refusals: (i) a Current reading note that is not the last note of its row throws; (ii) each cited date is the date of an earlier note of the row; (iii) at most 800 characters; (iv) the 12 ids are pinned; (v) a status cell with Current reading: that does not parse strictly throws; (vi) a cited date is never the reading's own date; (vii) the reading text has no pipe. The refusals (i) to (vii) are agreed scope. Coupling, accepted: a later dated note on any of the 12 rows (a flip note on FE-39 when its flip is approved, or any amendment, also one dated the next day) makes --check fail until the reading is restated in the same commit; only FE-39 of the 12 is OWED today.

### 17.5 Landing
- Before the launch the orchestrator claims MF-95 in the id ledger (~/Buildo-scratch/ids).
- Commit 0 (records), alone and first, trailers Task: task-430 and McFrontend-Task: MF-95, the task file edited in the same diff (G3, check-backlog-task.mjs; the same for A, B and C): the MF-95 row of .cursor/MCFRONTEND-QUEUE.md under Phase 2 (mcfrontend-queue.infra.test.ts refuses a heading outside Phase 0-2 or convert-on-touch and, for a title with the word admin outside parentheses, any task but MF-30, 37, 40) with the bullet "- FE rows owned: none." (arm Q, Spec 128:173, item 7 and its dated note 2026-11-09); the prereg scripts/analysis/bylaw-validation/coa-expected/prereg-MF-95-1.json (schema coa-round-prereg-v1; rules[] holds RULED ids only, for example FE-16; totals and floors copied from prereg-MF-93-1.json; round claimed in the ledger; the precedent is commit 36b402f0f); the panel record docs/reports/panels/MF-95.json (task, item, plan, output non-empty). cite-arms.mjs findFrontendPrereg reads the newest prereg of the task from the PARENT tree (Spec 128 section 4.11 item 5), so commit 0 is in the parent of A.
- A, B and C each: the work, the regenerated files (136, the page, and for C the rule map), the task file in the diff, no FE token in the message (section 8).
- Landing checklist for the second lander of task-388 and this task: read "Next free id" at the board head; renumber the rows (ids, and every line that names them; the lock file names carry no id); rewrite the "Next free id" line with a dated note (135:17); run generate-surface-handbook.mjs --write then --check; run rule-lists.mjs page --write; change nothing else before the commit.
- Close: the MF-95 row to DONE in its own commit, then the closing commit holds only the lane records and the task file; the lane report directory carries one out-phase compliance output per attached list, GROUNDER.md and TRIAGE.md; check-lane-close.mjs is run before BUILT.

### 17.6 Tests and checks added or changed by round 1
- A-T6 drift lock (copy against the shared headlineOf over the 44 rows and planted cells); A-T5 (299, 700 and 990 characters); the pins at handbook-rule-map.logic.test.ts:59 and :61 change as A-T3 says.
- B tests: B-T1..B-T7 as written, plus B-T8 a malformed note (from note dated) throws and the phrase Current reading in the prose of an earlier note is not read as a reading; B-T9 a reading citing its own date throws; B-T10 a RULED row with a reading renders on the same line; B-T11 the 12 real readings parse and are at most 800 characters.
- C tests: C-T1..C-T3 and C-T5 as written with 57 rows; the 13 lock names are absent from src/tests/surfaces (DRIVEN); register-locks-resolve.infra.test.ts and the gate parse accept each row as OWED with one lock (measured by the seat for the 12 draft rows).
- Census (round 1, grep of src/tests and scripts for fe.4n, 44 FE, 44 rules, Rules rendered, 8 OWED and dated notes): the only test pin of the FE count is rule-lists-table.logic.test.ts:205-210; every other hit is a SPEC LINK comment or an fe.44 id cite that does not move. The 8 OWED figure is computed by the generator (render counts the OWED rows), not literal text.
- The page docs/reports/generated/rule-lists-by-kind.md pins surface-136 (2. Rules, 13,783) and surface-135 (84,215): each commit runs page --write.

### 17.7 Adjudication and what stays unverified
The adjudicator of the 13 rows and 12 readings at plan is the grounder Cairn-Ground-P430, 2026-11-22; a separate output grounder at the lane close re-checks each reading sentence against its cited note and each row quote against its spec line. Unverified after round 1: the McBylaws gate has not been run on a commit that adds OWED rows (Spec 128 section 4.11 item 3 puts the red-evidence condition on the flip only); the page part counts after page --write; the line numbers of Specs 126, 127 and 128 are as read at board head b03085db7.

Section 16 as the planner wrote it (v1; the Files line above replaces it):

Files: scripts/surfaces/generate-surface-handbook.mjs, scripts/surfaces/_schema/surface-rule-map.json, src/tests/surfaces/handbook-rule-map.logic.test.ts, src/tests/backlog/rule-lists-table.logic.test.ts, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/

Plan review round 1: 134 folded, 0 task, 7 ruling, 0 wontfix, 10 pile; grounder docs/reports/reviews/task-430/GROUNDER-PLAN.md; triage docs/reports/reviews/task-430/TRIAGE-PLAN.md
plan-compliance-agents-s7-s11#1 MED folded Result (round 1): TH
plan-compliance-agents-s7-s11#2 MED folded Census (round 1, gre
plan-compliance-agents-s7-s11#3 MED folded all four are RULED b
plan-compliance-agents-s7-s11#7 MED folded FE-02 is added (its 
plan-compliance-eng-all#1 MED folded Result (round 1): TH
plan-compliance-eng-all#2 MED folded FE-02 is added (its 
plan-compliance-eng-all#3 MED folded The words dropped fr
plan-compliance-eng-all#4 MED folded The copy has a drift
plan-compliance-five-words#1 MED folded Result (round 1): TH
plan-compliance-five-words#3 MED folded The words dropped fr
plan-compliance-inc-S#1 MED folded Result (round 1): TH
plan-compliance-inc-S#2 MED folded The words dropped fr
plan-compliance-inc-S#3 MED folded FE-02 is added (its 
plan-compliance-inc-S#4 MED folded so C no longer depen
plan-compliance-ms-S#1 MED folded Result (round 1): TH
plan-compliance-ms-S#2 MED folded The words dropped fr
plan-compliance-ms-S#3 MED folded A2 is STRUCK (round 
plan-compliance-plan-protocol#1 MED folded Result (round 1): TH
plan-compliance-plan-protocol#2 MED folded The words dropped fr
plan-compliance-plan-protocol#3 MED folded A2 is STRUCK (round 
plan-compliance-queue-137#1 MED folded the closing commit h
plan-compliance-queue-137#2 MED folded the closing commit h
plan-compliance-queue-137#3 MED folded the task file edited
plan-compliance-queue-137#4 MED folded M-246, prior text ke
plan-compliance-queue-137#5 MED folded all four are RULED b
plan-compliance-queue-137#6 MED folded Result (round 1): TH
plan-compliance-surface-126-p1#1 MED folded Result (round 1): TH
plan-compliance-surface-126-p1#2 HIGH folded Commit 0 (records), 
plan-compliance-surface-126-p1#3 MED folded an Operator-Ruling l
plan-compliance-surface-126-p1#4 MED folded MF-95, the next free
plan-compliance-surface-126-p2#1 MED folded Result (round 1): TH
plan-compliance-surface-126-p2#2 MED folded FE-02 is added (its 
plan-compliance-surface-126-p3#1 MED folded Result (round 1): TH
plan-compliance-surface-126-p3#2 MED folded The words dropped fr
plan-compliance-surface-126-p3#3 MED folded A Current reading is
plan-compliance-surface-126-p4#1 MED folded Result (round 1): TH
plan-compliance-surface-126-p4#2 MED folded The words dropped fr
plan-compliance-surface-126-p5#1 MED folded Result (round 1): TH
plan-compliance-surface-126-p5#2 MED folded FE-02 is added (its 
plan-compliance-surface-126-p5#3 MED folded the seam IS in Spec 
plan-compliance-surface-126-p5#6 MED folded The words dropped fr
plan-compliance-surface-127#1 MED folded Result (round 1): TH
plan-compliance-surface-127#2 MED folded The words dropped fr
plan-compliance-surface-127#3 MED folded The libraries row sa
plan-compliance-surface-128#1 MED folded Result (round 1): TH
plan-compliance-surface-128#2 MED folded No commit message ho
plan-compliance-surface-128#4 MED folded the 13 rows of 17.2 
plan-compliance-surface-128#6 MED folded Measured in memory b
plan-compliance-surface-128#7 MED folded The words dropped fr
plan-compliance-surface-135-p1#1 MED folded Result (round 1): TH
plan-compliance-surface-135-p1#2 MED folded the 13 rows of 17.2 
plan-compliance-surface-135-p1#4 MED folded 13 new lines (the id
plan-compliance-surface-135-p2#1 MED folded Result (round 1): TH
plan-compliance-surface-135-p2#3 MED folded The words dropped fr
plan-compliance-surface-136#1 MED folded Result (round 1): TH
plan-compliance-surface-136#2 MED folded FE-02 is added (its 
plan-compliance-surface-136#4 MED folded The words dropped fr
plan-error-paths#1 MED folded a status cell that c
plan-error-paths#2 MED folded must be the date of 
plan-error-paths#3 MED folded an authored ellipsis
plan-error-paths#4 MED folded compute the expected
plan-error-paths#6 MED folded Whichever lands seco
plan-plan-review-deepseek#3 MED folded Whichever lands seco
plan-plan-review-deepseek#5 MED folded The copy has a drift
plan-plan-review-deepseek#8 MED folded a status cell that c
plan-plan-review-deepseek#16 MED folded Spec 133's 13 clippe
plan-ux#2 MED folded Result (round 1): TH
plan-ux#3 MED folded the 13 rows of 17.2 
ig#1 HIGH folded Commit 0 (records), 
ig#2 HIGH folded The page docs/report
ig#3 MED folded Whichever lands seco
ig#4 MED folded under Phase 2 (mcfro
rc#1 MED folded Result (round 1): TH
rc#2 MED folded The libraries row sa
rc#3 MED folded The Full cell quotes
rc#4 MED folded The render-smoke cla
rc#5 MED folded FE-29 is added (its 
rg#2 MED folded A Current reading is
rg#3 MED folded R-03 stays ACCEPTED 
rg#4 MED folded Known standing excep
plan-compliance-agents-s5-1to3#5 MED ruling RR-0385
plan-compliance-bylaw-133-p1#1 HIGH folded Operator verbatim as
plan-compliance-bylaw-133-p1#2 MED ruling RR-0385
plan-compliance-bylaw-133-p2#1 HIGH folded Operator verbatim as
plan-compliance-bylaw-133-p3#1 MED ruling RR-0385
plan-compliance-bylaw-133-p3#2 MED ruling RR-0385
plan-compliance-bylaw-133-p3#4 MED ruling RR-0385
plan-compliance-orchestrator-doc17#1 HIGH folded Operator verbatim as
plan-compliance-policy-124-s2-s5-p1#2 MED ruling RR-0385
plan-compliance-policy-124-s2-s5-p2#5 HIGH folded Operator verbatim as
plan-compliance-policy-124-s2-s5-p3#1 HIGH folded Operator verbatim as
plan-compliance-policy-124-s2-s5-p3#3 MED ruling RR-0385
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dated note 2026-11-22 (M-246, prior text kept; RR-0379 · task-430 · Backlog; operator, verbatim: "We can run step 1 in parellel - we will add to the rules overtime")

Dated note 2026-11-22 (M-246, prior text kept; RR-0384 · task-430 · Backlog; operator, verbatim: "These look great - teh 13 are perfect. Task 430 becomes three small things: stop the clipping, make each line reflect its notes, and add these 13 lines. Item 9 stays a pointer, so the page does not grow by copying tables.")

2026-11-22 taken on the board at lane launch (lane BL-HB430, worktree /Users/brettpreston_macmini/Buildo-wt-hb430, branch wf1/inc1b-hb430), RR-0240

2026-11-22 lane BL-HB430 commit 0 (records, alone and first, plan 17.5): MF-95 queue row under Phase 2 with "FE rows owned: none." (Next free id MF-96: MF-94 held by BL-MFRULES unlanded), prereg-MF-95-1.json (round 200, claimed in ~/Buildo-scratch/ids/round-200; rules FE-09, FE-10, FE-16 RULED), panel record docs/reports/panels/MF-95.json. Ledger: MF-95 (orchestrator), round-200 and FE-46..FE-58 claimed by this lane; FE-45 is held by BL-MFRULES, so the branch rows FE-45..FE-57 are placeholders renumbered by the second lander (plan 17.5 landing checklist).

2026-11-22 lane BL-HB430 commit A red: tests A-T1, A-T2, A-T3 (the :59/:61 clip pins become no headline ends in an ellipsis), A-T5, A-T6 in src/tests/surfaces/handbook-rule-map.logic.test.ts, staged alone with this task file; red.out holds the refused commit attempt.

2026-11-22 lane BL-HB430 commit A: scripts/surfaces/generate-surface-handbook.mjs prints the plain Ruling cell where the shared headlineOf clipped (wholeHeadline; shared reader untouched); Spec 136 and rule-lists-by-kind.md regenerated; Spec 136 section 2 measured 19,551 characters (whole file 22,983); 0 lines end in the clip ellipsis; Spec 133 --check up to date (546 rules); git diff on scripts/analysis/bylaw/ empty.

2026-11-22 lane BL-HB430 commit B red: tests B-T1..B-T11 and refusal (vii) in src/tests/surfaces/handbook-rule-map.logic.test.ts (the reading read through a cast so the attempt fails at its assertions, not at typecheck), staged alone with this task file; red.out holds the refused commit attempt.

2026-11-22 lane BL-HB430 commit B: 12 Current reading dated notes appended to Spec 135 rows FE-01, 02, 07, 11, 14, 18, 19, 20, 29, 31, 38, 39 (texts and dates of plan 17.3, frame of 17.3, lane text, not rulings); the generator reads the last note in the strict 17.4 form and prints it on the headline line; refusals (i)..(vii) throw. Gate reader statuses and locks unchanged (0 of 44 differ). Spec 136 section 2 measured 22,993 characters (file 26,535).

2026-11-22 lane BL-HB430 commit C red: tests C-T1, C-T2, C-T3 in src/tests/surfaces/handbook-rule-map.logic.test.ts (the 13 rows pinned by lock path in item order, not by id) and C-T5 in src/tests/backlog/rule-lists-table.logic.test.ts (the fe.01..fe.N range computed from the register), staged alone with this task file; red.out holds the refused commit attempt.

2026-11-22 lane BL-HB430 commit C: thirteen OWED rows added to Spec 135 as FE-45..FE-57 (placeholders: FE-45 is held by BL-MFRULES unlanded; FE-46..FE-58 claimed in ~/Buildo-scratch/ids for the renumbering), texts of plan 17.2, one reserved lock path each (all 13 absent); Next free id FE-58 by a dated note; Spec 136 and surface-rule-map.json regenerated (57 rules, 21 OWED); rule-lists-table pin computed from the register. Spec 136 section 2 measured 28,664 characters (file 32,207); Spec 135 112,035 bytes.

2026-11-22 lane BL-HB430 ruling Q9 (plan grounder, docs/reports/reviews/task-430/QUESTIONS-RULED.md): A-T6 reworded (short-provenance planted case keeps the bracket) and a pin that the failure-state row (FE-54 on this branch) keeps (Spec 128 Rule 12, 128:39); red on the staged generator before the wholeHeadline change; then wholeHeadline prints the plain cell also where the shared rule stripped a trailing bracket of an unclipped cell.

2026-11-22 lane BL-HB430 acceptance on real inputs (plan section 9), after commit C d429b287d (commits 62b2ffed6, 0fe6e7712, 25755f51a, d429b287d):
(1) Spec 136 lines ending in the clip ellipsis: 0 (grep -c); section 2 28,691 characters, 57 lines; the 16 formerly clipped lines whole (fe.18 604, fe.30 944, fe.35 1074, fe.39 1746, fe.42 1144 characters with their Status-free line text).
(2) 12 rows carry a reading (FE-01 FE-02 FE-07 FE-11 FE-14 FE-18 FE-19 FE-20 FE-29 FE-31 FE-38 FE-39), 12 printed; planted later note on FE-39: [surface-handbook] FE-39: a dated note follows the Current reading; restate it.
(3) 13 new lines fe.45..fe.57 (placeholders, plan 17.5), each Status: OWED · lock owed: <path> (client-glass-boundary, ui-library-set, tunables-are-data, scratch-mocks-not-in-repo, scope-fence, auth-checkout-hosted, nav-tab-switch, parcel-id-names, page-set-pointer, failure-state-declared, admin-same-descriptor, lock-planted-defect, a11y-category); Rules rendered: 57, 21 OWED; item 9 pointer row, item 4 own row; fe.54 keeps (Spec 128 Rule 12, 128:39) per ruling Q9.
(4) git diff --stat 60b601cc9 HEAD -- docs/specs/01-pipeline/133_bylaw_handbook.md scripts/analysis/bylaw/: empty; bylaw handbook --check up to date (546 rules).
(5) --check green: surface-handbook (57 rules), bylaw-handbook, surface-validate, surface-registry, spec-split-check, rule-lists page; commit hooks: commit C related run Tests 60 passed (60), GATE OK, POLICY CHECKS OK; red evidence for every planted case in the lane red.out (A, B, C, Q9). Full suite not run (push station only). Self-checklists in the lane CHECKLISTS.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
INPUTS.2 built (lane BL-HB430): Spec 136 prints every McFrontend ruling whole (commit A 0fe6e7712), 12 lines carry a Current reading of their dated notes (commit B 25755f51a), 13 new OWED register rows from the RR-0384 list (commit C d429b287d, rulings Q8 and Q9); records 62b2ffed6 and 7393fbd43. Output review round 1: 116 outputs, ruled by the separate grounder Cairn-Ground-O430, fix list none. Left for the landing: the MF-95 queue row to DONE (plan 17.5), the FE-45..FE-57 renumbering against task-388 by landing order, and the system map line regenerated by the second lander.

Review round 1: 1 fixed, 0 task, 0 ruling, 0 wontfix, 33 pile; grounder docs/reports/lanes/2026-11-22/BL-HB430/GROUNDER.md; triage docs/reports/lanes/2026-11-22/BL-HB430/TRIAGE.md
post-build#1 MED fixed d429b28
<!-- SECTION:FINAL_SUMMARY:END -->
