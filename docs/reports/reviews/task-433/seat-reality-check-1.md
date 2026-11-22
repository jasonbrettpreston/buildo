# Seat: reality-check: task-433 plan (PLAN-433-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 202123397. DRIVEN means I ran a read-only command; READ means I opened the file and line. No DeepSeek call, no tests run, no `.env` read. I counted ids with `grep` on specs 132, 133 and 136.

Facts checked:
- Fact 1: DRIVEN. The template's closing block is at lens-compliance.md:68-73 and "Clauses checked: <n>   Unmet: <n>" is there. `grep -rln` on scripts, src and .claude finds "Clauses checked" only in the template. The two real outputs print "Clauses checked: 14 Unmet: 1" and "10 Unmet: 3" as the plan says, followed by `---` and a timing trailer.
- Fact 3: READ. FINDING_LINE (rule-lists.mjs:301) and the loose count (:299) are as stated, and none matches a "Rules met:" line.
- Fact 5: DRIVEN. The ids are the first bold token of a list line.
- Spec 136: 44 `fe.NN` lines (136_mcfrontend_handbook.md:34).
- Spec 132: 69 lines, with prefixes core, ingestor, x-captures, link, history and others. Its glossary `**slug**:` lines have no `.digits`, so the plan's regex skips them.
- Spec 133: 546 lines, 477 `m.N` and 69 `lc.N` (:34 `m.431`).
- No id carries a letter suffix.
- The plan says "about 500 m.* ids" for 133, which is true.
- Fact 6 (`parseLensInput(...).listPart`, rule-lists.mjs:452-465, and `reEsc` at :565): READ, true.
- Fact 7 (the `findings` subcommand at :840 and the usage line at :845): READ, true.

### rc#1 MED: the ids are known in the repo already, and the plan does not say why it re-derives them
Plan sentence: "Rule ids exist as the bold id that starts a list line ... `/^\s*[-*]\s+\*\*([a-z][a-z0-9-]*\.\d+)\*\*/gm` in `parseLensInput(inputText).listPart`."
Evidence (READ): scripts/analysis/gates/rule-map.mjs and the committed rule maps (`lines[].id`, e.g. scripts/steps/_schema/rule-map.json for 132) already tie every handbook line to an id. Tests read the same fe ids (src/tests/surfaces/handbook-rule-map.logic.test.ts:120, :157). The operator's "you are probably rebuilding stuff that already exists" applies.
Counter-point: the text the reviewer was sent is what matters, and the regex over the in-file is exact to it.
Smallest correction: one sentence stating why the sent text, not the rule map, is the source of ids, and a note that the regex matches the generators' line shape.

### rc#2 LOW: the plan duplicates an id-boundary regex that already exists
Evidence (READ): backlog-brief.mjs:59 `namesId` uses `(?<![\w.-])id(?![\w-]|\.\d)`, which is the same regex the plan writes for T1(b). It is not exported.
Smallest correction: none required; note the copy, or export one helper.

### rc#3 LOW: the planned tests are red now and green after (READ)
- T1/T2: `cli()` falls to `die(2, usage)` for an unknown subcommand (rule-lists.mjs:845). Red.
- T3: the template has no "Rules met". Red.
- T4: green before and after by design (a pin on unchanged parsers), which is its stated purpose.
No test pins the template ending, so none breaks on the edit.

### rc#4 LOW: no measured problem for this task
There is no measured defect for step 6 (B), and the plan says model compliance with the line is unmeasured. The deliverable is a report, so risk is low. The live DeepSeek check is the orchestrator's.
Smallest correction: none.

### rc#5 LOW: the "bold id" sentence in the template is only true for three documents, and the plan says so
The unchecked parts the plan lists (132 section 6, 133 section 3) were not read line by line here either. I checked the three documents as whole files for non-matching bold ids: only the 132 glossary lines differ (DRIVEN).

OPEN QUESTIONS (code evidence, no ruling):
- Q1 option A: the code supports it. For a list part with no ids the regex returns nothing, and the plan's "no rule ids" branch handles it. Option B (headings as ids) would need a different extractor; the table's sections are cut by rule-lists.json.
- Q2: FINDING_LINE counts only BUG and DEFER. MET is capped at 8 per output by the template (:62), so the difference between A and B is at most 8 ids per output. Both are one-line changes in the mention test.
- Q3: nothing reads the report now. A gate would be a protected-path change. Lists run to 546 ids (spec 133) but each lens input holds one part, so the line stays per part.
- Q4: the plan gate recomputes with the board-head template (check-lane-close.mjs:631), so evidence for tasks not yet launched is refused after the edit. docs/reports/reviews/task-432/ already holds plan-compliance inputs. Also see integration ig#1: 433's own lane has a hash problem because the close reads the template at the range base (:764).
