Grounder: Cairn-Ground-G4D
Ruled: out-code-review-p1.txt sha256:3dc5283cbcb7 findings:7
Ruled: out-code-review-p2.txt sha256:ef8645b85c8e findings:6
Ruled: out-code-review-p3.txt sha256:0f061893d499 findings:6
Ruled: out-code-review-p4.txt sha256:8fb0fcbd59cb findings:8
Ruled: out-code-review-p5.txt sha256:5bf51ef93836 findings:6
Ruled: out-code-review-p6.txt sha256:5e777b7f4cbc findings:8
Ruled: out-code-review-p7.txt sha256:5274aff671eb findings:6
Ruled: out-engineering-eng-all-p1.txt sha256:b0d69c461d76 findings:2
Ruled: out-engineering-eng-all-p2.txt sha256:f7dc04129205 findings:1
Ruled: out-engineering-eng-all-p3.txt sha256:10e811321d3f findings:2
Ruled: out-engineering-eng-all-p4.txt sha256:5b3729868ece findings:3
Ruled: out-engineering-eng-all-p5.txt sha256:c2b3da7552d1 findings:0
Ruled: out-engineering-eng-all-p6.txt sha256:f1e56bf0a0bf findings:0
Ruled: out-engineering-eng-all-p7.txt sha256:909b5df0c0d7 findings:3
Ruled: out-engineering-eng-all-p8.txt sha256:fe79886d9731 findings:2
Ruled: out-engineering-eng-all-p9.txt sha256:c730deb5748d findings:1
Ruled: out-engineering-eng-all-p10.txt sha256:4d23035964df findings:3
Ruled: out-engineering-eng-all-p11.txt sha256:674d2d8eda99 findings:3
Ruled: out-engineering-eng-all-p12.txt sha256:c5c6c3b41ed0 findings:0
Ruled: out-engineering-eng-all-p13.txt sha256:4a0272f7a172 findings:3
Ruled: out-engineering-eng-all-p14.txt sha256:865c53fe10e5 findings:3
Ruled: out-engineering-eng-all-p15.txt sha256:71a1a52883e4 findings:5
Ruled: out-engineering-eng-all-p16.txt sha256:3a7a60f7f5b6 findings:1
Ruled: out-engineering-eng-all-p17.txt sha256:a144f4213e38 findings:6
Ruled: out-engineering-eng-all-p18.txt sha256:b8b9153d51ec findings:3
Ruled: out-engineering-eng-back.txt sha256:c012420869cb findings:2
Ruled: out-engineering-eng-shared.txt sha256:e9cfa3c2e395 findings:1
Ruled: out-error-paths-p1.txt sha256:a4410c18d2c7 findings:7
Ruled: out-error-paths-p2.txt sha256:8f87eabe8c9b findings:7
Ruled: out-error-paths-p3.txt sha256:d984eb0fbb90 findings:7
Ruled: out-error-paths-p4.txt sha256:5594294aee84 findings:5
Ruled: out-error-paths-p5.txt sha256:716e6c996c5f findings:6
Ruled: out-error-paths-p6.txt sha256:d49a69e1623e findings:7
Ruled: out-error-paths-p7.txt sha256:08d57a18c96a findings:7
(Plus SEAT-close-check.md, findings 1-11, ruled in section 2b.)

Basis: no G4 file changed after 8dba70e8e (git diff --stat over scripts, src/tests, .husky, .claude, migrations: empty). check-lane-close.mjs hashes f22ffbeec564. No CRIT in my share: the only "CRIT" hits in FINDINGS.tsv are non-findings ("none found", plan-protocol-p3#1; eng-all-p14#1 and p15#1 say none). Share has 50 HIGH/MED rows (4 HIGH, 46 MED). Short names: cr = code-review, eng = engineering-eng-all, ep = error-paths.

1. HIGH/MED RULINGS (D-numbers are in section 3)
cr-p2#1 | MED | CONFIRMED D1 | proof-slice.mjs:146 `.stdout.trim()`; executed: spawnSync of a missing command gives stdout undefined, ENOENT.
cr-p3#1 | MED | CONFIRMED D2 | review-template.js:138 counts files, not the highest N.
cr-p3#2 | MED | CONFIRMED D3 | rule-lists.mjs:558 bare catch turns any error into "does not fit".
cr-p4#1 | MED | CONFIRMED D4 | backlog-lane test :564-565 asserts only an absence; its own rule is at :604.
cr-p5#1 | MED | REFUTED | rule-lists.mjs:174 splits `--files` on commas; the two-path entry at table test :363 is a legal Files line.
cr-p6#1 | MED | REFUTED | parseLensInput really returns `ok` (rule-lists.mjs:468); only the declared test type is loose (nit).
cr-p7#1 | MED | CONFIRMED D5 | proof-slice.db.test.ts:20.
eng-p1#1 | MED | REFUTED | backlog-brief.logic.test.ts (6 cases) and backlog-brief-context.logic.test.ts (22) pin the #L range, 12 KB and 120 KB caps (:63, :85, :94).
eng-p10#1 | MED | CONFIRMED D6 | SPEC LINK without section: review-template.js:14; none in deepseek-review.js or check-task-files.mjs.
eng-p10#2 | MED | NOT-APPLICABLE | 13.3 is "Backend Structured Logging"; ESLint bans console.error only in API routes (eslint.config.mjs:70-86). 19 tooling files use console.error, 2 use logError. The notes-JSON null is pinned by review-template.logic.test.ts:163.
eng-p11#1 | MED | DUPLICATE-OF-G2 | test-layer naming (G2 eng-all-p1#2, ruled a file-name question).
eng-p11#2 | MED | DUPLICATE-OF-G2 D6 | fact confirmed, see D6 note.
eng-p13#1 | HIGH | DUPLICATE-OF-G2 D6 | fact confirmed (rule-lists-table.logic.test.ts:26,27,39,45,50,102,246,286,309,316,347,364 carry `!` with no comment). Mis-rated HIGH: test-only, and a missing row fails loudly with a TypeError.
eng-p15#2 | MED | DUPLICATE-OF-G2 | test-layer naming.
eng-p15#3 | MED | DUPLICATE-OF-G2 D6 | fact confirmed.
eng-p16#1 | MED | NOT-APPLICABLE | 12.12 names scoring formulas, key normalizers, unit conversions, cursor comparators. The parts-equal-whole invariant is already checked at close by the whole-list comparison. A new property suite is also new infrastructure (RR-0392 MD:1975).
eng-p17#1 | MED | CONFIRMED D7 | review-lens-template.infra.test.ts has no error-path case.
eng-p17#2 | MED | REFUTED-BY-RULING | the DB test is meant to be unrun until the operator's DB GO after the MCINC-7 rehearsal (MD:141, MD:186; card 375 AC #13 open). The variable is not in the seed yet (grep empty). The header :6 says so.
eng-p2#1 | MED | NOT-APPLICABLE | backlog-brief.mjs:65-68 are file-read fallbacks in a CLI; same 13.3 scope as eng-p10#2.
eng-p3#1 | MED | DUPLICATE of cr-p2#1 | same line.
eng-p4#1 | MED | NOT-APPLICABLE | 13.3 scope as eng-p10#2; proof-slice's console.error lines are its exit-2 contract (header :11).
eng-p7#1 | MED | CONFIRMED D8 | rule-lists.mjs:134 and :140.
eng-p8#1 | MED | REFUTED | a null `paths` on a chunk input is refused at check-lane-close.mjs:97, and :407 re-renders the whole input and compares it, so the head line is covered.
eng-back#1 | HIGH | REFUTED | the commented DOWN is the enforced form: validate-migration.js:11-19 (rule 6) says migrate.js runs the whole file as one batch, so executable SQL after `-- DOWN` runs on every apply. Migrations 159, 283, 294, 296, 316 have the same form. Standard 12.8 names the validator as the check.
eng-back#2 | MED | CONFIRMED D9 | migration 334:17 restores value only.
eng-shared#1 | HIGH | DUPLICATE of eng-back#1 | refuted for the same reason.
ep-p1#1 | MED | CONFIRMED D10 | backlog-lane.mjs:109 undo.
ep-p1#2 | MED | REFUTED | the preflight (:81-84) already proved git runs. If git fails later, the empty HEAD makes `worktree add` fail (:238 fail with the undo line). Fail-closed.
ep-p1#3 | MED | REFUTED | board-commit.zsh does `git add backlog` then commits the working tree. After the undo the file holds LATER, so it cannot commit RUNNING. A held index.lock only defers the job (warn, exit 0).
ep-p1#4 | MED | CONFIRMED D11 | backlog-brief.mjs:172.
ep-p1#5 | MED | REFUTED | the round is a count of existing files, so a retry after a crash picks N+1 once the first write landed. Only two truly simultaneous runs could collide.
ep-p1#7 | MED | REFUTED | the step suite run at pre-commit :67 collects .db.test.ts but each self-skips (describe.skipIf, steps/link_massing/rung1-inline-wkt.db.test.ts); vitest.config.ts:25-26. Only the header wording overstates it.
ep-p2#1 | MED | CONFIRMED D12 | known leftover of task-363 (card :73, :79).
ep-p2#2 | MED | DUPLICATE of cr-p2#1 | same line.
ep-p2#3 | MED | REFUTED | gateVariable throws and never returns undefined (variables.cjs:59-63, "Throws on any refusal"), so no NaN. The seed entry is registered (logic_variables.json:9759).
ep-p2#4 | MED | REFUTED | `expect` is optional by design (proof-slice.mjs:89 comment). All 6 shipped argv rows carry it, and proof-slice.logic.test.ts:228 asserts that.
ep-p3#1 | MED | CONFIRMED D13 | rule-lists.mjs:582, :690.
ep-p3#2 | MED | CONFIRMED D14 | rule-lists.mjs:753.
ep-p3#3 | MED | CONFIRMED D15 | rule-lists.mjs:600. Hang only; no wrong result.
ep-p3#4 | MED | REFUTED | deepseek-review.js:95 sets exitCode 1 on abort, and a cut answer lacks the VERDICT line that the close requires (check-lane-close.mjs:57-70; plan-prep checks it at rule-lists.mjs:680).
ep-p4#1 | HIGH | CONFIRMED D16 (mis-rated: test gap, the code prints the undo) | backlog-lane.logic.test.ts:245-250.
ep-p4#2 | MED | REFUTED | rm covers plan-*.txt (rule-lists.mjs:665) and FINDINGS-PLAN.md is written only after every check passes (:684).
ep-p4#3 | MED | REFUTED | the bound exists (CALL_MS :582, spawn timeout :690). A hang test needs a 910 s wait or a new seam (RR-0392).
ep-p5#1 | MED | REFUTED | executed over the real census: 12 in-scope entries, 0 name two route files. The "first route" choice is stated in the comment at table test :77.
ep-p6#1 | MED | REFUTED | rule-lists.mjs:836 removes only `<base>.txt` or `<base>-p<digits>.txt`, so `…-r2-p1.txt` is not matched by base `…`.
ep-p6#2 | MED | REFUTED | executed joinLists(table,['five-words','five-words']): one member.
ep-p7#1 | MED | CONFIRMED D5 | proof-slice.db.test.ts:34.
ep-p7#2 | MED | DUPLICATE of cr-p7#1 | same afterAll.
ep-p7#3 | MED | REFUTED | hooks-composition.infra.test.ts:28-30 (Sept 2026, not touched by G4). A missing hook gives an ENOENT naming the path and the file goes red.
ep-p7#4 | MED | REFUTED | line 398 (Oct 2026) throws at collection when the evidence is missing: red, fail-closed.

2a. CLAIMS BEHIND THE "NOT-APPLICABLE" 13.3 RULINGS
Engineering standards 13.3 text: "All catch blocks use logError(tag, err, context). NEVER bare console.error. ESLint enforces." Its heading is Backend Structured Logging. The enforcing ESLint block is "API routes" (eslint.config.mjs:70-86). Line 188 covers DB pipeline scripts. A dev-tool CLI that prints its own exit-2 message is neither.

2b. THE SEAT'S 11 FINDINGS (SEAT-close-check.md). Hook hash f22ffbeec564 matches. I imported the exported functions in memory (parseVerdicts, outcomeErrors, chunkErrors) on made-up input.
S1 MED CONFIRMED. Executed: seat file `### rc1#1 LOW: a` with verdict `rc1#1 REJECTED a:1 ""` gives {"errors":[],"ids":0}. A CONFIRMED seat verdict with the 1-char quote "x" fails only on the missing TRIAGE line, not on the quote. The quote, line and reason checks (:363-376) run on lens findings only. Header :591 claims only "presence, sha256 and every finding ruled and closed", so this is a gap against Spec 08 5.3 "rejections carry reasons", not against the header. Operator RR on seats: they "only run on the plan" (MD:1630 area), so close-time seats are mostly empty. Plan mode (:679) still uses the same loop.
S2 MED CONFIRMED (fail-open, partly by design). Code path: check() :720-725. With no table in the working tree and none in HEAD it returns 0 before the board is read (:729 onward). Header :3-5 quotes "If you can trick the gate - whats the point" and says EVERY staged move is checked; the comment at :725 only intends repos that never had the table (test 387-389). I counted: the table was added on 2026-11-20 (cb026342c), and 429 of 478 local branches lack it. So a person must do this: stay on, or cut from, a branch older than 2026-11-20 that has backlog/tasks, stage a task file set to BUILT/DONE, and commit. No lane report, grounder, Files or lens check runs. A branch cut today has the table, and a deletion commit would first turn the table-dependent tests red (and --no-verify skips every hook anyway). No operator ruling covers it.
S3 MED CONFIRMED, deliberate by convention, needs a decision. Path half executed: `git rev-parse --git-path MERGE_HEAD` prints an absolute path here (/Users/.../Buildo/.git/worktrees/Buildo-wt-board/MERGE_HEAD). Code: :720-721 returns 0 on mere existence (contents not read), before anything staged is looked at. To get an unreviewed close through: `git merge --no-ff --no-commit <any other commit>` (or leave an old conflicted merge), stage a task file with status BUILT, `git commit`. The hook never runs. A stale MERGE_HEAD does it by accident. The skip is in the hook's first commit (cb026342c) and mirrors check-backlog-task.mjs:4 and check-task-files.mjs:11 ("merge commits exempt"). Spec 137 Rule 3 (137_mcqueue.md:23) exempts merge commits only from the task-named rule. This hook's own header says nothing about merges. I grep'd MORNING-DECISIONS.md for MERGE_HEAD and merge-skip wording: no line. RR-0433 (MD:2225, six tasks fold as they are and STAY RUNNING) and RR-0435 (MD:2236, orchestrator may do merge edits) authorise folds and merge edits, not a close without review; they do not mention the skip. The five folds relied on it knowingly (your statement); nothing there needed a finished-status close. Test file has 0 MERGE_HEAD tests.
S4 LOW CONFIRMED (executed). A seat file holding `rc1#1` and `reality-check#2 CRITICAL` gives errors [] (the hyphenated id is never read); a file with only that line gives the "holds no finding line" refusal. A seat can hide a finding by hyphenating its id. Ids in repo are hyphen-free.
S5 LOW CONFIRMED (executed). Lens CRITICAL with reason "NIT-picking aside, this moves money wrongly" and `pile:"..."` gives errors []. Control reason "real defect, ..." is refused ("pile is not allowed for a CRITICAL BUG"). The downgrade-by-reason is intended (test 729-737); the bare-word trigger is the defect.
S6 LOW CONFIRMED (executed). Quote `say \"hi\" now please ok` parses as quote `say `, reason `hi" now please ok" r`; the refusal then says "20+ characters".
S7 LOW CONFIRMED. 08_agents.md:346 is the heading "## 7. Rules & economics", :350 is rule 3, :359 is rule 6. The hook prints "rule 6 (08_agents.md:350)" and "rule 3 (:346)": both wrong (check-lane-close.mjs:139, :199, :200).
S8 LOW CONFIRMED by reading only (:553, :828-829): expected is empty when all covered paths are exempt, so code-review and error-paths outputs get a header-form check only. Harmless.
S9 LOW CONFIRMED, latent. Regex executed: true for `backlog/tasks/task-12 - A.md`, false for `task-12.1 - Sub.md` and `backlog/archive/tasks/task-12 - A.md`. To get through: create a subtask-named file, or move a task to backlog/archive/tasks in the same commit with status DONE. Today backlog/archive/tasks is empty and no subtask file exists (448 flat task files); the launcher and plan-prep use the same flat `task-\d+` form (rule-lists.mjs:723). Header :4 states the flat form. No ruling.
S10 NIT CONFIRMED (executed: chunkErrors with items [] and expected ['a.ts'] returns []). Unreachable by callers.
S11 LOW CONFIRMED. check-lane-close.logic.test.ts:656 `not.toBeNull()`; refusal alternations at :367, :376, :380; `refused()` (:191) asserts status 1 plus the regex only. No test mentions MERGE_HEAD; the board-has-table, seat-verdict-form and archive/subtask cases are missing.

3. CONFIRMED DEFECTS (deduplicated)
D1. cr-p2#1 = eng-p3#1 = ep-p2#2. Rule: proof-slice.mjs:11 "exit 2 ... usage"; the guard at :156 shows intent; 2.3 null check. proof-slice.mjs:146: with git unspawnable `.stdout` is undefined, `.trim()` throws inside realIo() before main's guard, so exit 2 becomes a stack. Fix: `head: (spawnSync(...).stdout ?? '').trim(),`. Owner task-363. Line-size. Impact: a stack instead of the stated message when git cannot start; nothing wrong passes.
D2. cr-p3#1. review-template.js:138 `.length + 1` → `Math.max(0, ...names.map((f) => Number(/^context-r(\d+)\.md$/.exec(f)[1]))) + 1`. After a removed context-r1.md with r2 present the next round is 2 and overwrites r2, breaking the one-file-per-round evidence. Owner task-375 (A5), reused by task-432. Line-size.
D3. cr-p3#2. rule-lists.mjs:558 `catch { p = 0; }` → `catch (e) { p = 0; why = e.message; }` and print it in the cell, or rethrow non-"over the bound" errors. A missing lens-compliance.md reads as a size problem on the generated page (the --check does still differ). Owner task-406. Line-size.
D4. cr-p4#1. backlog-lane.logic.test.ts:564-565: add `expect(ok.status).toBe(<the table's real exit>)` and one output line before `not.toMatch`. The fake table has no lists, so the run may stop for another reason and still pass. Owner task-418 (its own rule at :604). Line-size.
D5. cr-p7#1 = ep-p7#2 = ep-p7#1. proof-slice.db.test.ts:20 `if (pool) await pool.end().catch(...)`; :34 add `expect(rows, TIMEOUT_VARIABLE).toHaveLength(1)` before `rows[0]`. Both errors are reported today, so only noise and a worse message; the file is written-not-run. Owner task-375. Line-size.
D6. eng-p10#1. Engineering standards 14 registry row "SPEC LINK points at the spec AND the section (§N)" (a "candidate gate"). review-template.js:14 points at a README; deepseek-review.js and check-task-files.mjs have none. Fix: add `SPEC LINK: docs/specs/00-architecture/08_agents.md §<n>` lines (the review tool is a protected path, so land it outside a closing commit). Owner task-358 / 366. Line-size. Conformity only.
D7. eng-p17#1. 2.1 "(.infra.test.ts) you MUST include tests for error paths". review-lens-template.infra.test.ts has only successful dry runs. The claimed silent fallback is partly wrong: a missing template or file exits 1 (readFileOrFail); a template with no `## User prompt` uses a neutral persona at deepseek-review.js:168 (rule-lists.mjs:376 does the same). Fix: one case with a nonexistent `--template` asserting exit 1 and "File not found". Owner task-358. Line-size.
D8. eng-p7#1. Executed validateTable({lists:{a:null}...}) and rows [null]: both throw TypeError ("reading 'generated_by'", "reading 'id'"). Fix: before :134 `if (!l || typeof l !== 'object') { bad.push(`list ${id}: not an object`); continue; }`; same before :141 for rows. Fails closed either way (non-zero exit), so only a stack instead of the problem list. Owner task-406. Line-size.
D9. eng-back#2. Migration 334 UP sets value and description; the DOWN comment line restores value only, so the rollback note is incomplete. Fix: add the pre-334 description text to the commented DOWN (take it from the seed at the commit before 334). Owner task-406. Line-size; a migration is already pushed, so it needs the operator's word to edit.
D10. ep-p1#1. backlog-lane.mjs:109/113. After step 3 fails, the worktree and branch survive and relaunch is refused at :68/:70 (clear message). The printed undo resets only the task. Fix: the failure line after step 3 also names `git worktree remove <wt>` and `git branch -D <branch>`. Owner task-418. Line-size. Impact: manual cleanup only.
D11. ep-p1#4. backlog-brief.mjs:172: with no `AC:BEGIN` block (68 of 448 task files have none) the brief prints "Done-condition: every acceptance criterion below..." and nothing below. Fix: when `ac.length === 0` print "(none found in <task file>)". Owner task-375. Line-size. Impact: a lane starts with an empty done-condition and no warning.
D12. ep-p2#1. proof-slice.mjs:79: writeFile throws out of main on a read-only existing --out dir (executed: main() with a throwing writeFile throws EACCES). Known: task-363 card :73 and :79 record it as "leftover"; the header :11 says only "cannot be created". Fix: wrap the runSlice call in try/catch, print `proof-slice: cannot write evidence (code)`, return 2. Owner task-363 (leftover). Line-size.
D13. ep-p3#1. rule-lists.mjs:582 `CALL_MS = 900000 + 10000` vs deepseek-review.js:36 env DEEPSEEK_REVIEW_TIMEOUT_MS; env passes through gitFreeEnv. Raise the env above 900 s and plan-prep kills the call at 910 s. Fix: `const CALL_MS = (Number(process.env.DEEPSEEK_REVIEW_TIMEOUT_MS) || 900000) + 10000;`. Owner task-418. Line-size. Fails closed.
D14. ep-p3#2. rule-lists.mjs:753: on spawn failure stderr and stdout are undefined (executed: prints "undefined"), so the Stop text reads "backlog task edit failed: undefined". Fix: `first(e.stderr || e.stdout || e.error?.message, 3)`; same for the gate at :783. Owner task-418. Line-size.
D15. ep-p3#3. rule-lists.mjs:600 `sh` has no `timeout`. A hung backlog CLI hangs plan-prep. Fix: add `timeout: 120000` and name the null status. Owner task-418. Line-size. No wrong result, hang only; low priority.
D16. ep-p4#1 (rated HIGH, really a test gap). The branch of backlog-lane.mjs :113/:238 (failure after the take prints "undo with:") has no test; no test in the file contains "undo". Fix: one case with a brief.mjs stub that exits 1, asserting exit 1, "FAILED at" and the undo command, and statusOf RUNNING. Owner task-418. Line-size.

D6 note, DUPLICATE-OF-G2 facts confirmed: undocumented `!` is present (rule-lists-table 12 lines; rule-lists.logic 19 pattern hits; backlog-lane 6). The mirror test non-null-assertion-comment.logic.test.ts excludes src/tests/** (:12), so no pin covers these test files. Same decision as G2 D6.

4. LOW / NIT (recorded)
code-review-p1#1-#7; p2#2-#6; p3#3-#6; p4#2-#8; p5#2-#6; p6#2-#8; p7#2-#6; eng-all-p1#2; p3#2; p4#2,#3; p7#2,#3; p8#2; p9#1; p10#3; p11#3; p13#2,#3; p14#2,#3; p15#4,#5; p17#3-#6; p18#1-#3; error-paths-p1#6; p2#5-#7; p3#5-#7; p4#4,#5; p5#2-#6; p6#3-#7; p7#5-#7. That is 85 LOW/NIT.
G2 D4 recurrences (typed factories), facts seen (local untyped builders, e.g. rule-lists-table.logic.test.ts:97): eng-all-p11#3, p13#3, p15#5, p17#4, p9#1: DUPLICATE-OF-G2 D4.
Mis-rating check: none is HIGH-class on its face. Seen and fine: p1#2 (4000-char cut unmarked), p2#5 (timeoutMs), p3#6 (placeholder replace), error-paths-p1#6 (migration UPDATE row count: key is in the seed).

5. TOTALS (50 HIGH/MED rows)
Confirmed 17 (cr-p2#1, cr-p3#1, cr-p3#2, cr-p4#1, cr-p7#1, eng-p10#1, eng-p17#1, eng-p7#1, eng-back#2, ep-p1#1, ep-p1#4, ep-p2#1, ep-p3#1, ep-p3#2, ep-p3#3, ep-p4#1, ep-p7#1); none is a fail-open or wrong-result defect. Refuted 19. By-ruling 1 (eng-p17#2). Not-applicable 4. Duplicate-of-G2 5. Duplicate-internal 4 (eng-p3#1, ep-p2#2, eng-shared#1, ep-p7#2). Undetermined 0.
Seat's 11 findings: all 11 confirmed (S1-S3 MED, S4-S9 and S11 LOW, S10 NIT). S2 and S3 are the real fail-open paths. S2 is a one-function fix (read the board ref first, return 0 only when neither the branch nor the board has the table; add the board-has-table test). S3 needs the operator's decision: narrow the skip to moves whose staged blob equals the MERGE_HEAD or first-parent blob, versus keep it and write it into the hook header and Spec 137. S1, S9 and S11 are small. S7 is a line-size text fix. Owner of the hook: tasks 366, 410, 399, 419.

6. UNVERIFIED
- S2, S3, S9 end to end (no repo or merge created; read-only brief). I executed only the regex (S9), the MERGE_HEAD path half (S3), and the branch count (S2).
- S8 and S11 by reading only; S1, S4, S5, S6, S10 re-executed in memory.
- The 85 LOW/NIT were not individually ruled, as the brief says.
- Whether the pre-commit hooks would stop an old-branch close beyond the commit-msg check (only .husky/commit-msg wires check-lane-close; no push-time re-check found).
- eng-p10#2's "malformed notes silently dropped" is pinned by a test, so deliberate; I did not rule whether it should warn.
- Test file whole-run behaviour was not run (runner forbidden).
