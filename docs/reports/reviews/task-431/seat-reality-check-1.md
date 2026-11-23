# Seat: reality-check: task-431 plan (PLAN-431-v4)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 79f79322f (the plan says 3a77bf98d; every fact below was re-measured at 79f79322f and none moved). Read docs/specs/00_engineering_standards.md, scripts/analysis/rule-lists.json and .mjs, MORNING-DECISIONS.md :1860-1926, docs/reports/reviews/task-438/QUESTIONS-RULED.md. Measured in memory only (resolveTask, validateTable, renderPage, sectionText, headings, buildLensInputs on a copy of the table with the plan's edit applied, plus the de-dup line applied to the result). No tests run, no files written, no .env, no model calls, no git state change.

### rc#1 HIGH: the plan never says that parts reach 3 of the 45 tasks that get engineering text, and the api-lib edit does nothing for any API route
- Plan sentence: "RR-0380 Q1 is carried out by the row edit: every row whose paths sit on one side now sends parts." and, in the table of what the seat is sent, "`src/app/api/parcels/search/route.ts` | eng-all | eng-all (it also hits ui-app; the de-dup keeps eng-all)".
- Evidence:
  - scripts/analysis/rule-lists.json:102 ui-app `"globs": ["src/components/**", "src/app/**", "src/features/**"]` with `"lists": ["eng-all"]` (:103). `src/app/**` also matches `src/app/api/**`, which api-lib claims at :96 `"globs": ["src/app/api/**", "src/lib/**"]`.
  - I resolved every tracked file under each prefix on the edited table with the de-dup applied. src/app/api: 82 of 82 files give eng-all. src/components 36 of 36, src/features 56 of 56, src/app non-api 67 of 67: eng-all. By contrast mobile/ gives eng-front+eng-shared for 222 of 235 (13 are surface paths, eng-all), src/lib 159 of 171 eng-back+eng-shared, scripts/steps 90 of 90 eng-back+eng-shared.
  - The server code the plan cites (fact 3) is not in src/app/api: `grep -l "from 'pg'"` over src/features, src/components, src/app (outside api) finds only src/features/leads/lib/get-lead-feed.ts:32, record-lead-view.ts:11 and timing.ts:18; 3 more pages import `@/lib/db`. Of the 153 .ts/.tsx files under ui-app (non-api), 8 touch the database.
  - Over the 309 open tasks (106 resolve): 61 get no engineering list, 45 get eng-all today. After the edit and the line, 42 of those 45 still get eng-all (21 of the 42 are mixed tasks) and only 3 change: task-372 and task-380 (eng-back+eng-shared), task-381 (eng-front+eng-shared).
- What goes wrong: the operator's words (RR-0385 item 7, MORNING-DECISIONS.md:1923) are "the right sections for the task - front-end vs backend". After this plan every front-end web task and every API route task (the largest back-end path set) still receives all 46,613 characters. The plan's OPERATOR section offers only ui-app and surfaces as an optional veto and says "Nothing needs his word"; it does not give him the 3-of-45 number or name the API routes.
- Smallest correction: state in the plan (OPERATOR and the Q1 sentence above) "after this edit 3 of 45 open tasks get parts; src/app/api stays whole because ui-app's `src/app/**` swallows it". If the operator wants the API routes served, the smallest table change is one existing field, `"not": ["src/app/api/**"]` on ui-app (the `not` field already exists, rule-lists.mjs:260); fact 3's server code is not under src/app/api, so fact 3 still holds. Either choice is one line; the plan must pick and say it. No new tool.

### rc#2 MED: the DIRECTION section's own example is not a rule lost under parts-win; the real losses are different, and the ruling still stands
- Plan sentence: "Example: `mobile/x.ts, src/tests/x.test.ts` resolves front + shared, but the tests row also needs sections 3 and 9." and, in OPERATOR, "it loses sections 3 and 9 on mobile-plus-tests tasks and section 1 on features-plus-lib tasks".
- Evidence:
  - scripts/analysis/rule-lists.json:221, the tests row why: "test files are governed by the engineering standards (testing, section 5)". Section 5 is in eng-shared. Under parts-win, `mobile/x.ts, src/tests/x.test.ts` gives eng-front + eng-shared: nothing the tests row names is lost. Sections 3 and 9 are asked for by no tests row text.
  - Real losses exist where the eng-all row names a section that the other row's parts omit: scripts/analysis/rule-lists.json:104 ui-app names "section 1 ... and sections 2, 4, 10 and 11", so ui-app + api-lib (task-383) loses section 1 under parts-win. rule-lists.json:203 specs-docs names "sections 14 ..., 9 and 5", so a mobile task that also edits a spec (task-373) loses section 9.
  - Across the 21 open mixed tasks, parts-win would drop a whole side (section 1, or sections 3 and 9) in 15 and nothing in 6 (tasks 267, 317, 354, 357, 378, 411).
- What goes wrong: a reader checking the example against the table finds it false and doubts the ruling.
- Smallest correction: replace the tests example with "ui-app + api-lib: ui-app names section 1 (rule-lists.json:104), the api-lib parts omit it" and "mobile + specs-docs: specs-docs names section 9 (:203)".
- Direction judgment (asked for): whole-wins is consistent with the operator's words and is settled by the rules, not by him. RR-0380 Q1 (MORNING-DECISIONS.md:1866) reads "the whole engineering document is dropped when its parts can be sent (option b)". The condition is "when its parts can be sent"; on a mixed task the parts that resolve do not cover what the other row asked for (rc#2 evidence), so the condition is not met and whole-wins sends each rule once. docs/reports/reviews/task-438/QUESTIONS-RULED.md Q3 gave the direction to 431's panel ("whether whole or parts should survive is for 431's panel with its sections in hand"), and RR-0385 item 4 (MORNING-DECISIONS.md:1920) sends a matter to him only when "an earlier answer of his ... reads two ways" or rests on a wrong fact; the direction does not. What does come close to needing his one-line word is rc#1 (whether "front-end vs backend" is met when front-end and API tasks stay whole), not the de-dup direction.

### rc#3 LOW: eng-back and eng-shared are described as "same file" with no generated_by, and validate refuses a list without one
- Plan sentence: `"eng-back"`: same file, `["3. Database ...", ...]`; `"eng-shared"`: same file, `[...]` (only eng-front shows `"generated_by": "hand-written"`).
- Evidence: scripts/analysis/rule-lists.mjs:134 `if (typeof l.generated_by !== 'string' || !l.generated_by) bad.push(\`list ${id}: generated_by missing ...\`)`. My first in-memory validateTable run, with eng-shared lacking the key, returned `list eng-shared: generated_by missing (a generator path or "hand-written")`. With `generated_by: "hand-written"` on all three, validateTable returns [] (so each selector matches exactly one heading).
- Smallest correction: write `"generated_by": "hand-written"` on all three entries in the plan.

### rc#4 LOW: the Spec 08 note says "every other row keeps `eng-all`"; ten rows keep it and ten never had it
- Plan sentence (note text): "the pipeline-step and API and library rows get `eng-back` and `eng-shared`; every other row keeps `eng-all`."
- Evidence: rows that hold eng-all after the edit: ui-app, middleware-config, surfaces, lane-tools, generated-reports, generated-127, policy-reports, reference-docs, specs-docs, tests (rule-lists.json:103, :109, :141, :159, :166, :172, :178, :184, :202, :220). Rows with no engineering list at all: bylaw (:91), surface-importers, surface-contract-routes, storage, compute-import, queue-records, specs-mobile, specs-web-admin, panel-records, review-followups.
- What goes wrong: a verbatim dated note (Spec 137 Rule 10) that over-states cannot be edited later, only noted.
- Smallest correction: "every other row that had `eng-all` keeps it".

### rc#5 LOW: the page-change claim is incomplete, and the order of the page write against the note matters
- Plan sentence: "The phone, pipeline step and storage sections of the page change."
- Evidence: the Spec 08 note lands at 08_agents.md:352, inside "## 7. Rules & economics" (:344-366). The page prints agents-s7-s11 at docs/reports/generated/rule-lists-by-kind.md:99 (tooling) and :116 (spec-only) as `40,664` characters; that number changes with the note. I rendered the page on the edited table in memory: the web section is unchanged only because the de-dup keeps eng-all there. .husky/pre-commit:44 runs `rule-lists.mjs page --check` on every commit.
- Smallest correction: say "phone, pipeline step, storage, tooling and spec-only", and order the steps: note first, then `page --write` (CODE AND TABLE step 3 is written before the note).

### rc#6 LOW: acceptance claim that check-tasks shows "no open task with both eng-all and a sections list"
- Plan sentence: "`check-tasks` shows tasks 372, 380 and 381 with their new sets, and no open task with both eng-all and a sections list."
- Evidence: scripts/analysis/rule-lists.mjs:839 prints only counts; :844-846 print `backlog task edit ... --add-ref` commands for tasks whose compliance: references differ. Run today (old table) it prints add-ref lines for tasks 372, 380, 381 and 431 because none carries compliance: refs yet. It cannot print "no task has both".
- Smallest correction: replace with the in-memory count (21 mixed tasks with the line removed, 0 with it) that the plan already measured, or drop the clause.

### rc#7 NIT: two small number notes
- "The 550 characters left over are the title block": the text before the first level-2 heading is 537 characters; the other 13 are sectionText's trimEnd plus newline (rule-lists.mjs:96). Front 3,214 + back 5,377 + shared 37,472 = 46,063; the file is 46,613 characters (46,897 bytes by wc -c: the emoji headings). Harmless; P1's whitespace squash covers it.
- Fact 4 holds, with one remark: mobile/src has no `pool.query`, no `.from(` outside `Array.from` (3 hits), no `.rpc(`; it does call the Supabase auth client (mobile/src/lib/supabase.ts:6, confirmEmail.ts:65, apiClient.ts:78), which is not a database call.

### Checked and found sound (none)
- Heading lines 9, 35, 51, 71, 97, 136, 144, 160, 175, 218, 235, 304, 412, 454: exact. Each of the 14 level-2 headings lands in exactly one list by the prefix rule (sectionText, rule-lists.mjs:88-96); 8, 10, 12 are in shared (Q2, MORNING-DECISIONS.md:1867). Character counts 3,214 / 5,377 / 37,472 / 46,613 exact; `40,686`, `42,849`, `46,063` exact.
- "21 of 106" (309 open): re-run, exact. 478 / 1,900 of 2,378 layer23 files: exact; none gains a list.
- Table of what the seat is sent: every row re-resolved with the de-dup. mobile/src/app/x.tsx 40,686; pipeline kind and src/lib/parcels/report-compute.ts 42,849; src/app/api/parcels/search/route.ts eng-all; mobile + src/lib 46,063 with all three; mobile + tests eng-all; web, tooling, spec, src/features, scripts/hooks eng-all. All as the plan says (but see rc#1 on what the api row means).
- Fact 5: no other file has both a whole and a sections list (scan of all 55 lists). Fact 1 seatOf :112-113 and :246. Fact 8 `return result` is :281. Line anchors: eng-all :31, step-pipeline lists :85, bylaw lists :91, api-lib lists :97, mobile lists :147, protected_paths :22, README :101 ("today `eng-all`"), Spec 08 :352 (the 438 note, "today `eng-all`"), :344-366 section 7.
- The de-dup line is order independent (it filters over the unfiltered array): rows in either order give the whole list only, and a task with eng-front + eng-back + eng-shared and no eng-all is untouched (run in memory).
- The exact Spec 08 note text is accurate against the table edit except the rc#4 sentence; its two quotes are substrings of MORNING-DECISIONS.md:1913 and :1865.
- Card-level quotes: RR-0385 item 7 is at :1923, item 5 and 6 as the plan reads them; Q1/Q2/Q4 at :1866-1868.

### Could not verify
- That mobile/ never gains database code (the plan's own UNVERIFIED).
- Call counts at real diff sizes (the page measures a 30,000 character material only).
- Whether the +1 line of Spec 08 (about 1,900 characters in the note) keeps spec-split-check budgets: it passes today ("budgets held") and I could not run it on an edited file.
