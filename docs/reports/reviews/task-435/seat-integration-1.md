# Seat: integration: task-435 plan (PLAN-435-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 6c3f450c9 (~/Buildo-wt-board). Ran, read-only: `backlog task view task-435/430/431 --plain`; `node scripts/analysis/rule-lists.mjs resolve --files ... --type build --letter S` (once with the one-spec Files line, once with the card's two-file Files line); `rule-lists.mjs page --check` (exit 0, page current today); `spec-split-check.mjs --check` (clean); greps over src, scripts, .husky, docs; `git blame`; read .husky/pre-commit:40-48, gates/generated-docs.mjs:53, rule-lists.json:31, PLAN-431-v1.md, docs/reports/reviews/task-431/432/433 listings. No files written, no .env, no model calls, no runner named.

### ig#1 MED: the plan's resolved-list set is wrong for the card's own Files line (seven, not ten)
Plan sentence: "The Files line `docs/specs/00_engineering_standards.md` resolves, by the spec-only kind ..., to seven lists: queue-137, agents-s7-s11, eng-all, five-words, plan-protocol, inc-S, ms-S ... (UNVERIFIED)".
Evidence: `resolve` needs a milestone letter (without one it refuses: "the task has no milestone"; task-435 is milestone m-1, group S, so `--letter S`). With the card's actual Files line ("docs/specs/00_engineering_standards.md, docs/reports/generated/rule-lists-by-kind.md") it returns TEN lists: eng-all, agents-s7-s11, queue-137, policy-124-s2-s5, agents-s5-1to3, orchestrator-doc17, five-words, plan-protocol, inc-S, ms-S. The three extra come from the generated-reports row (rule-lists.json, row generated-reports), because the generated page is on the Files line. With the spec path alone it is the seven the plan read off the page. exempt and unmatched are empty. (The `-432` evidence folder shows the same 9-10 file pattern: agents-s5-1to3, orchestrator-doc17 etc.)
What would go wrong: the plan sizes the landing as "seven lists"; plan-phase compliance outputs (and the out-compliance files the close check requires) are owed for ten. A lane prepared for seven fails the close check or has to redo plan-prep.
Smallest correction: say ten, naming them; the plan's FACTS 7 and LANDING must use the resolve output, not the page example. (Dropping the page from the Files line is not an option: pre-commit `page --check` refuses a stale page.)

### ig#2 NIT: the "UNVERIFIED" resolve is now verified; no change to the sentence beyond ig#1
Plan sentence: "I did not run `rule-lists.mjs resolve` (UNVERIFIED for the exact docs/specs glob...)".
Evidence: resolve ran; eng-all is attached via rows specs-docs and generated-reports ("whole": true, rule-lists.json:31). Nothing hidden by a docs/specs glob beyond the lists above.
Smallest correction: replace UNVERIFIED with the ten-list output.

### ig#3 LOW: the readers of the changed file are all benign; one line-number citation shifts
Plan sentence: "None pins a line number, section size or the 46,076 figure".
Evidence: true for src/tests (rule-lists.logic.test.ts:339 pins only {file, whole:true}; others are SPEC LINK comments). The figure 46,076 appears only in docs/reports/generated/rule-lists-by-kind.md among tracked non-fixture text (other hits are unrelated data files). `page --check` (.husky/pre-commit:44) and gates/generated-docs.mjs:53 (rule-lists-by-kind.md, has_check true) both go red until `page --write` is run; the page has six kinds (pipeline step, McFrontend web, phone, storage, tooling, spec-only), each total changes. spec-split-check: clean today, does not name the file; its citation checker would only trip on a spec-section citation, and a note under a Status line adds no heading. Line citations at or after :307 shift by the note's line count (2 with blank lines): `.cursor/pilot1_assert_schema_active_task.md:292` and its archive copy cite `00_engineering_standards.md:381`; docs/specs/01-pipeline/123_step_opt_assessment_validation.md:240 cites :112-114 (before the insert, safe). Both :381 hits are historical records.
What would go wrong: nothing that blocks; a historical record's :381 drifts by 2.
Smallest correction: none needed; at most name it as known and leave it (prior text kept).

### ig#4 LOW: parts of the page do not flip
Evidence: the parts column is per list at a 30,000-char material; eng-all is one part at ~46k, and ~2k more chars stays one part (bound 120,000). Only the character counts (six eng-all rows, six totals) change, as the plan says. I did not run `--write` (read-only), so "the diff is only counts and totals" stays a prediction, to be checked at build.

### ig#5 INFO: stale plan evidence at the board head (the plan left this open)
Plan sentence: "Whether tasks 432 and 433 are launched ... (UNVERIFIED)".
Evidence at 6c3f450c9: task-432 and task-433 are status BUILT, and each folder holds FOLD-CHECK.md, FINDINGS-PLAN.md, GROUNDER-PLAN.md and in-plan-compliance-eng-all.txt (432 also has seat-*-1.md). They are launched, built and folded, so their committed eng-all input is history, not a gate; nothing goes stale that anyone will re-run. task-431 has no review folder (docs/reports/reviews/task-431 does not exist): it has no evidence yet, and its plan compliance will be made at the board head after whichever of 431/435 lands first, so it is unaffected if 435 lands first. task-435 itself has no folder yet. task-430 (Spec 126 to 128 handbook items) is LATER with dependencies [] and a Files line on the McFrontend rule source, not this file: independent of 435.
What would go wrong: nothing; the plan's worry (stale committed eng-all evidence of an unlaunched task) has no instance at the head.
Smallest correction: state this in the plan: 432 and 433 BUILT and folded; 431 none; no stale evidence.

### ig#6 MED: order against task-431 needs one sentence, and the blockquote lands inside the section as intended
Plan sentence: "The engineering sections split: task-431" (NOT IN SCOPE) and no order given.
Evidence: PLAN-431-v1 splits eng-all by full level-2 title (eng-front = "1. Architecture & UI Standards"; eng-back = 3 and 9; eng-shared = 2, 4-8, 10, 11, "12. Frontend Foundation Tooling", 13, 14); eng-all stays (eight rows keep it, including specs-docs and generated-reports, so task-435's own Files line still resolves eng-all whole, not the sections). Section text rule (rule-lists.mjs:70 "a section runs to the next heading of the same or a higher level"): section 12 starts at the "## 12." heading at :304 and runs to the "## 13." heading, so the blockquote at :307 (between the Status line :306 and "### 12.1" :308) is inside the section 12 text. As intended. Consequence: under 431 the note rides in eng-shared, i.e. goes to every front-end and back-end compliance call (about 1.5-2k chars each). 431's T4 test (every char of every section held by exactly one of the three lists) holds either way. 431's prose cites sizes (46,076; section 12 = 12,962; 40,149; 42,312); those are prose in the plan, not pinned by a test I could see (T4 is computed).
What would go wrong: no break in either order. Real costs are (a) both tasks regenerate the same generated page, so the second lander gets a page conflict that must be resolved by `page --write`, not hand-merging; (b) if 435 lands first, 431's quoted sizes are about 2k off.
Smallest correction: state the order. Either order is mechanically safe; 435 first is the smaller (431 then measures the file as it is). Say the second lander regenerates the page after rebase. Neither plan should list the other's files.

### ig#7 LOW: `page --write` and the generated-docs gate are the only live readers; no test, spec-split or system-map reader of the text
Evidence: pre-commit also runs `system-map.infra.test.ts` and spec-split-check; the system map does not name the file's content (docs/specs/00_system_map.md does not exist at that path; the grep found nothing). Nothing else reads section 12's text.
Smallest correction: none.

Open questions (say what the code supports, no ruling):
- Q1 cite Spec 33:47 or not: see rc#4/rg#2. For integration: citing it adds ~25 words to every eng-all/eng-shared review input; not a mechanical issue.
- Q2 second pointer note in section 11: it would sit in section 11, which 431 sorts as shared; mechanically it is a second insert and a second line shift, no new reader risk.
- Q3 red-first: the page check is the test of record for this change (pre-commit refuses a stale page, in both directions: red now only after the edit, green after regeneration). No code lock exists to prove red. The cited rule is 08_agents.md:485, not :462 (see rc#9).
- Q4 scope D: integration-neutral.
