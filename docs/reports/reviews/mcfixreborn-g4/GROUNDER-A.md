Grounder: Cairn-Ground-G4A
Ruled: out-compliance-agents-s5-1to3-p1.txt sha256:433be06ccbe5 findings:2
Ruled: out-compliance-agents-s5-1to3-p2.txt sha256:666c1903cc34 findings:6
Ruled: out-compliance-agents-s5-1to3-p3.txt sha256:b405237c383e findings:7
Ruled: out-compliance-agents-s5-1to3-p4.txt sha256:60790f5b7314 findings:4
Ruled: out-compliance-agents-s5-1to3-p5.txt sha256:069e2996a141 findings:4
Ruled: out-compliance-agents-s7-s11-p1.txt sha256:366a71c26e1b findings:8
Ruled: out-compliance-agents-s7-s11-p2.txt sha256:13650c4ad50b findings:7
Ruled: out-compliance-agents-s7-s11-p3.txt sha256:6ed4d6ffd35d findings:4
Ruled: out-compliance-agents-s7-s11-p4.txt sha256:3ea20efc0717 findings:6
Ruled: out-compliance-agents-s7-s11-p5.txt sha256:e4d4c03bd2d9 findings:2
Ruled: out-compliance-agents-s7-s11-p6.txt sha256:fcd5f1e504a7 findings:2
Ruled: out-compliance-agents-s7-s11-p7.txt sha256:0dce02584fa1 findings:3
Ruled: out-compliance-agents-s7-s11-p8.txt sha256:c48eb88defbf findings:3
Ruled: out-compliance-agents-s7-s11-p9.txt sha256:364414928ce5 findings:5
Ruled: out-compliance-agents-s7-s11-p10.txt sha256:8d90bcb3cbbe findings:6

Basis: 69 findings in FINDINGS.tsv for my share, 42 of them CRITICAL/HIGH/MED (no CRITICAL, 9 HIGH, 33 MED). `git diff --stat 8dba70e8e HEAD` over the G4 tooling paths prints nothing, so the files I read are the reviewed files. Line numbers in some findings are off by about 2 from the files (rule-lists.mjs BOUND is :29, the finding says :27). MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md.

2. TABLE (id = file stem without "out-compliance-agents-", then #n)

id | sev | verdict | reason
s5-1to3-p1#1 | MED | REFUTED | The lens line is built by backlog-lane.mjs:176-190 and put last in the BRIEF's `extra` (:211). The brief.mjs "lens line of this brief" points at that BRIEF. The unused `sectionFlags` at backlog-brief.mjs:16 is dead code only (LOW).
s5-1to3-p2#1 | MED | CONFIRMED (known) | proof-slice.mjs:75 uses the typed DEFAULT_TIMEOUT_MS (:22); timeoutMsFromVariable has no caller. This is task-375 D10b, recorded OPEN and needing the operator's DB GO. Task-375 is still RUNNING. Not new.
s5-1to3-p2#2 | MED | CONFIRMED | proof-slice.mjs:160 and :148: mkdirSync recursive succeeds on an existing read-only dir, then writeFile throws uncaught (exit 1). Task-363's own notes call it a "leftover".
s5-1to3-p2#3 | MED | NOT-APPLICABLE | The 2026-11-20 note (08_agents.md:237) states what check-lane-close.mjs reads at close. It says nothing about the launcher (backlog-lane.mjs:63). The close check still reads the board ref copy.
s5-1to3-p2#5 | MED | REFUTED | backlog-lane.mjs:188 reads "lenses whose prompt would pass the bound use the same tool", meaning exceed it. The lenses are not optional: :186 ends with "an out-<lens>.txt for every other output lens named above".
s5-1to3-p3#1 | HIGH | REFUTED-BY-RULING | rule-lists.json:159 and :231: record-only tasks get no queue list. RR-0418 (MD:2142,2145), RR-0421 item 4a (MD:2162). Spec 08 task-448 note (08_agents.md:356) says "This supersedes (a record-only task gets the queue lists)".
s5-1to3-p3#2 | HIGH | REFUTED-BY-RULING | RR-0421 item 1a (MD:2161-2162) reverses RR-0383; Specs 126/127/128/135 are "off on every row". rule-lists.json:147 and :153 record it.
s5-1to3-p3#3 | MED | REFUTED-BY-RULING | RR-0421 item 3a (MD:2162): "the storage row loses its policy list". rule-lists.json:134 says so.
s5-1to3-p3#4 | MED | CONFIRMED | Run in memory: Files "scripts/gemini-review.js" gives "refused: Files path(s) matched by no row". step-pipeline (rule-lists.json:87) excludes it as a "lane tool, see lane-tools", but the lane-tools globs (:163) never name it.
s5-1to3-p3#5 | MED | REFUTED | MERGED is a real status: backlog/config.yml:3 lists it. A finished-status set containing it is correct.
s5-1to3-p4#1 | HIGH | REFUTED-BY-RULING | RR-0385 item 2 (MD:1918): a review seat `engineering` separate from compliance, at plan and output. seatOf (rule-lists.mjs:113) implements it.
s5-1to3-p4#2 | MED | REFUTED-BY-RULING | Operator at MD:1546: "files too large to review even when split. or split smaller". splitFlat cuts at rows and paragraphs, so nothing is trimmed. The comment itself discloses it as a reading (caveat: that is an orchestrator reading of his words).
s5-1to3-p4#3 | MED | NOT-APPLICABLE | RR-0439 (MD:2260) fixes the call size of this review run. The tool default equals it (deepseek-review.js:35 = 120000). The env knob dates from 2026-10-03 (:33-35) and no ruling forbids it. LOW residual.
s5-1to3-p4#4 | MED | REFUTED | lensSet (rule-lists.mjs:183-192) chooses lenses, not rule lists. The task-366 "data, not code" sentence concerns rule lists. Spec 08 §5.7 note (task-445, :263) says "`lensSet` ... decides it".
s5-1to3-p5#1 | MED | REFUTED | Executed: the hook's matcher and rule-lists `coveredBy` agreed on every pair in 11 Files entries x 18 paths (brackets, braces, `**`, `?`), 0 differences. Both read the same grammar, and the hook already shares filesEntries.
s7-s11-p1#1 | HIGH | CONFIRMED (mis-rated) | README.md:27-28 "Skip if pure refactor" and "Usually skip" for WF3 contradict Spec 08 §7.1 and §6.4 (WF3 has a lean plan roster). The launch gate still forces plan evidence on every build and fix task (check-lane-close.mjs:640-660), so impact is a stale page. Should be LOW/MED.
s7-s11-p1#2 | MED | CONFIRMED | README.md:110 calls the grounder pass "round 2, Spec 08 section 5.3". Spec 08 §7.6 note (08_agents.md:362) says round 2 is "not the grounder's 5.3 round-2 pass".
s7-s11-p1#3 | MED | REFUTED | The re-make sentence is in the lens line the launcher puts in the brief: backlog-lane.mjs:188 "round 2 re-makes ALL of them under the SAME names".
s7-s11-p1#4 | MED | REFUTED | The 120 KiB cap covers only the "Document sections" block of context-rN.md. No lens call sends it: CONTEXT_SECTIONS (review-template.js:115) is five sections, and lens-input counts the room. Bytes versus characters does not matter.
s7-s11-p10#1 | HIGH | REFUTED | `plan --template` is the legacy route. Plan-prep (rule-lists.mjs:649-650) and the documented lane runs use `review --template`, which prints the REVIEW header (deepseek-review.js:174). The README text that documents the legacy route is folded into D1.
s7-s11-p10#2 | MED | DUPLICATE of s7-s11-p2#4 | No STATUS line from the review tool. See D5.
s7-s11-p10#3 | MED | NOT-APPLICABLE | §11.9 header: "Added check: none; no tool or code change". TKT-4: "this rule changes no code. Output-cap and stop-reason logging are infra and frozen". A timeout already sets exit 1 (deepseek-review.js:95).
s7-s11-p10#4 | MED | DUPLICATE of s7-s11-p2#4 | No Ticket header on lens prompts. See D5.
s7-s11-p2#1 | HIGH | DUPLICATE of s5-1to3-p1#1 | REFUTED there.
s7-s11-p2#2 | HIGH | DUPLICATE of s7-s11-p1#4 | REFUTED there.
s7-s11-p2#3 | MED | CONFIRMED | Counted: `{{PLAN}}` appears once in each of lens-code-review, lens-ux, lens-error-paths and lens-security (line 34), and once in lens-compliance. README.md:165 ("carry the placeholder twice") and :151 (`$` expansion; "Double each `$`") are false. review-template.js:75-77 now substitutes in one pass with function replacers.
s7-s11-p2#4 | MED | CONFIRMED (low impact) | See D5. No lens template ends with STATUS or opens with a Ticket header. Spec 08 §10.3 note (08_agents.md:438) says "a CLI or DeepSeek prompt carries the same two lines".
s7-s11-p2#5 | MED | CONFIRMED | README.md:111 "Reality-Check ... runs only when values are served" contradicts the task-375 note (08_agents.md:539): "Reality-Check is required at every build or fix launch".
s7-s11-p2#6 | MED | REFUTED | Executed: 112 of 448 tasks, and nearly all McFix tasks (e.g. 375, 399, 406, 448), carry no plan label or ROW id, so the "no plan id" fallback (backlog-brief.mjs:36) is the normal path. Dying there would refuse their launches. The header still names task-N.
s7-s11-p4#1 | HIGH | NOT-APPLICABLE | §11.1 governs "a plan or fold". The gate J registry (generated-docs.mjs:39-74) is a closed list. Executed: all 12 generator paths exist, and every `has_check:true` generator contains `--check` (the 123-* and 122-claim rows are retired and are not read as "keep").
s7-s11-p4#2 | MED | REFUTED | The gate's own rule 1 (generated-docs.mjs:16) says `docs/reports/generated/*.md`. Executed: find shows no .md below the top level.
s7-s11-p4#3 | MED | REFUTED | planGateErrors requires FOLD-CHECK.md (check-lane-close.mjs:692-711: presence, Checked by, Verdict: PASS, Plan hash). Only the comment at backlog-lane.mjs:88 omits it (LOW).
s7-s11-p4#4 | MED | NOT-APPLICABLE | proof-slices.json:8 is data in a finished tool, and its reason names the lane rule that refuses the test-runner call. §11.1 governs plans and folds.
s7-s11-p4#5 | MED | REFUTED | backlog-brief.mjs:169 always prints the Ticket line, and a non-zero brief fails the launch (step must=true). The placeholder at backlog-lane.mjs:193 only reaches a dry-run print.
s7-s11-p5#1 | MED | REFUTED | rule-lists.json:109 records that the surface paths among ui-app also match the surfaces row (protected-paths frontend includes src/components/report/** and src/app/(maxbld)/**). Executed: src/components/foo/x.tsx gets eng-all plus the four every-task lists. Any wider front-end reading is a product call, not a defect.
s7-s11-p7#1 | MED | REFUTED | The tool accepts a mixed-seat join, but the close proves each seat's joined set from that seat's own lists only (check-lane-close.mjs:430-455) and checks the template name (reviewErrors :66). A mixed join cannot pass the close.
s7-s11-p7#2 | MED | REFUTED-BY-RULING | RR-0391 (MD:1968-1970 "add it") widens security to src/app/api and src/lib. Spec 08 §5.7 task-445 note (08_agents.md:263) says "`lensSet` ... decides it" and that the "only" lines are unchanged for the Claude panel seat.
s7-s11-p7#3 | MED | REFUTED | Spec 08 §6.4 and §7.1: WF3 (fix) "runs a LEAN plan roster". The gate for a fix task is "at least one plan-<lens>.txt" (check-lane-close.mjs:654-659). Attaching no lists to a fix task follows that.
s7-s11-p8#1 | HIGH | REFUTED | commitPhase (rule-lists.mjs:786-797) runs the launch gate dry run after the commit. That gate requires FOLD-CHECK.md (check-lane-close.mjs:692). Spec 137 :146 says: "the gate runs at the launch and at the plan-prep commit dry run only". The commit succeeds without FOLD-CHECK.md, but the command exits 3.
s7-s11-p9#1 | MED | DUPLICATE of s5-1to3-p4#3 | NOT-APPLICABLE there.
s7-s11-p9#2 | MED | REFUTED | The close refuses a lens output with no matching context or with the placeholder context (lensContexts check-lane-close.mjs:320-327; prompt hash reviewErrors :73). The tool is not the enforcement point.
s7-s11-p9#3 | MED | REFUTED | Spec 08 §11.9 task-375 note: the context is "context-rN.md, one per review round and never overwritten (N = the context-r*.md files already there + 1)". Review files, not context files, are re-made under the same names.

3. CONFIRMED DEFECTS (deduplicated)

D1. README.md contradicts later Spec 08 notes. Findings: s7-s11-p1#1, p1#2, p2#3, p2#5, plus LOW p1#5, p1#7, p2#7 and the README half of p10#1.
 - Rule: Spec 08 §7.1 and §6.4 (plan review mandatory per WF; WF3 lean roster); §7.6 note 2026-11-22 (round 2 is the second review round); the task-375 note at 08_agents.md:539 (Reality-Check required at every build or fix launch); review-template.js:75-77 (substitution is one pass); task-448 note (record-only gets no queue lists).
 - Where and what happens: .claude/review-templates/README.md has these stale statements.
   - :27-28: "Skip if pure refactor" and "Usually skip" for WF3.
   - :110: the grounder is "round 2".
   - :111: Reality-Check "runs only when values are served".
   - :127-135: the lens plan route is `plan --template`, which prints no REVIEW header, so its output fails the gate (check-lane-close.mjs:65).
   - :109 and :122: output names `r1-<lens>.txt`, which the close does not read.
   - :151 and :165: the placeholder and `$`-doubling claims (counted and read above).
   - :158: "(a record-only task gets the queue lists)".
 - Smallest fix: edit those lines to match the Spec 08 notes (one README edit; line-size). The README is not in protected_paths. Do not add more dated notes to Spec 08 (RR-0429).
 - Owning task: task-358 (README lens section). Task-423 and task-448 touched the lines.
 - Real impact: a lane following the page runs a plan review with a command whose output the gate refuses. A refused output is not a pass, so nothing wrong gets through. The cost is wasted calls and a lane that believes WF3 or a refactor can skip the plan, though the launch gate still forces it. The HIGH rating of p1#1 is too high.

D2. scripts/gemini-review.js matches no table row.
 - Rule: task-366 "an unmatched path with the path named" refuses at launch. The step-pipeline `why` (rule-lists.json:89) says gemini-review.js is a lane tool "see lane-tools".
 - Where and what happens: rule-lists.json:86-87 excludes the file from step-pipeline (`scripts/*.js`). The lane-tools globs (:163) do not name it. Executed `resolveTask` with `Files: scripts/gemini-review.js` gave "refused: Files path(s) matched by no row".
 - Smallest fix: rule-lists.json:163, add "scripts/gemini-review.js" to the lane-tools globs. `validate` needs the file to be tracked (it is).
 - Owning task: task-448 (rule-lists.json). The file is in protected_paths, so it needs a lane. That needs a task, and RR-0392 says no new cards without the operator's word.
 - Real impact: a task that edits gemini-review.js is refused at launch with a clear message. Nothing wrong gets through.

D3. proof-slice exits 1 with a stack on an existing read-only --out directory.
 - Rule: task-363 AC "an unwritable --out directory exits 2 (not the FAIL code 1)".
 - Where and what happens: proof-slice.mjs:148 `mkdir: fs.mkdirSync(d, {recursive:true})` returns cleanly for an existing directory. The first evidence write in commandRow (:79) then throws uncaught (exit 1). Task-363's notes record this as "leftover".
 - Smallest fix: proof-slice.mjs:148, add `fs.accessSync(d, fs.constants.W_OK)` after mkdirSync inside io.mkdir. The existing catch at :160 then returns 2. Also reword the header at :11 ("cannot be created" becomes "cannot be created or written").
 - Owning task: task-363 (BUILT; a fix task or a reopen).
 - Size: two lines.
 - Real impact: the tool reports FAIL code 1 where its table says 2. No false PASS: the crash is non-zero.

D4. Known, not new: task-375 D10b. proof-slice.mjs:22-27 timeout still typed (s5-1to3-p2#1; LOW s7-s11-p3#2 and p4#6 are the same). It needs the operator's DB GO to register `tooling_proof_slice_timeout_ms`; task-375 stays RUNNING. The comment at :24 ("the registered tooling variable the row timeout is read from") overstates the code. A reword to "will be read from once registered" is one line, but it is the same task and needs no new card.

D5. TKT-1/TKT-2 not carried by DeepSeek lens prompts. Findings: s7-s11-p2#4, p10#2, p10#4.
 - Rule: Spec 08 §10.3 note 2026-11-06 (08_agents.md:438): "a CLI or DeepSeek prompt carries the same two lines" (TICKET and CLOSE). §11.9 TKT-1 and TKT-2 say items 1 and 2 apply to every seat "Claude and DeepSeek".
 - Where and what happens: none of the seven lens templates (.claude/review-templates/lens-*.md, plan-review-deepseek.md) opens with Ticket/Rule/Scope/Done/max_fix_rounds or ends with STATUS. deepseek-review.js sends no header either (:194, :231, :293). The same spec header says "Added check: none; no tool or code change", so the spec contradicts itself.
 - Mitigation (executed by reading): a truncated or empty lens reply cannot pass. check-lane-close.mjs:75 refuses a lens output with no VERDICT line, and reviewErrors recomputes the prompt hash.
 - Smallest fix: needs a decision, not code. Either record that strict-format lens templates are exempt, closed by their VERDICT line (a spec note, capped by RR-0429), or add the two lines to every template. The second option changes every prompt hash and breaks any lane in flight, so I recommend the first.
 - Owning task: task-358 (lens templates).
 - Real impact: none that lets a wrong result through. It is a literal spec gap.

4. LOW/NIT (recorded only, ids as in FINDINGS.tsv)
LOW: s5-1to3-p1#2, p2#4, p3#6, p3#7, p5#2, p5#3; s7-s11-p1#5, p1#6, p1#7, p1#8, p10#5, p10#6, p2#7, p3#1, p3#2, p3#3, p3#4, p4#6, p5#2, p6#1, p6#2, p8#2, p8#3, p9#4, p9#5.
NIT: s5-1to3-p2#6, p5#4.
Group notes:
 - s7-s11-p1#5, p1#7 and p2#7 are README staleness (D1).
 - s7-s11-p3#2 and p4#6 are D4.
 - s7-s11-p1#6 is settled by RR-0391 (the task-445 note).
 - s7-s11-p5#2: `every_task` has two lists because increment and milestone docs come from `increment_docs` and `milestone_docs`, so the RR-0418 four are all attached.
 - s7-s11-p8#2 is the env bound again, same as s5-1to3-p4#3.
 - None is a mis-rated HIGH-class defect.

5. TOTALS (42 CRITICAL/HIGH/MED findings)
confirmed 8 (s5-1to3-p2#1, p2#2, p3#4; s7-s11-p1#1, p1#2, p2#3, p2#4, p2#5) | refuted 18 | refuted-by-ruling 6 | not-applicable 5 | duplicate 5 | undetermined 0.
The 8 confirmed fold into 5 defects (D1 to D5), of which D4 is already known.
Refuted: s5-1to3-p1#1, p2#5, p3#5, p4#4, p5#1; s7-s11-p1#3, p1#4, p10#1, p2#6, p4#2, p4#3, p4#5, p5#1, p7#1, p7#3, p8#1, p9#2, p9#3.
By ruling: s5-1to3-p3#1, p3#2, p3#3, p4#1, p4#2; s7-s11-p7#2.
Not applicable: s5-1to3-p2#3, p4#3; s7-s11-p10#3, p4#1, p4#4.
Duplicate: s7-s11-p10#2, p10#4, p2#1, p2#2, p9#1.

6. UNVERIFIED
 - I did not run backlog-brief.mjs or lens-input, because both write files. The refutations of s5-1to3-p1#1, s7-s11-p1#3 and p2#1 rest on reading backlog-lane.mjs:176-211 (the lens line goes into the spec's `extra`) and not on a real launch. I did not run the brief.mjs merge of `extra` into BRIEF.md (panel-tools, outside the repo).
 - I did not run the review tool or the close check end to end. Close-check claims (VERDICT line, prompt-hash recompute, per-seat joined proof, FOLD-CHECK form) are from reading check-lane-close.mjs, not from planted-defect runs.
 - I ruled D5 from the spec text only. I did not verify how ~/.claude/hooks/lane-guard.mjs treats a lens prompt, because that file is absent here.
 - The MD line numbers I cite (1546, 1918, 1970, 2142-2145, 2161-2162, 2187, 2260) were read in the file at the time of this review.
 - The `check-task-files` matcher comparison used 198 made-up pairs, not the full tracked tree.
 - The s5-1to3-p4#2 ruling leans on "or split smaller" at MD:1546, which is the operator's wording. The row-and-paragraph cut itself is the orchestrator's reading (admitted in the code comment, rule-lists.mjs:320).
