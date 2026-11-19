# TRIAGE r1 (plan review, review mode; r1-plan.txt). Lines are of docs/reports/reviews/task-3/context-2026-11-19.md:203-211 (plan steps) and the brief.
KEEP = folded into the build; REJECT = reason with the opened line.

## KEEP
- B1 dot/escape order and anchoring (step 4, :208): KEEP. Test `src/a.b.c.ts` vs impostor `src/aXbYc.ts` must fail; regex anchored ^...$, every non-glob char escaped.
- B2 `[` in glob test (:208): KEEP. `[` dropped from the glob characters; treated as a literal; documented.
- B3 empty entries (:208): KEEP. Empty entries after split/trim are skipped; a Files: line with only empty entries counts as no declaration (WARN). Boundary predicate verbatim: p === e || p.startsWith(e + '/').
- B4 `**` zero depth (:208): KEEP. `src/**/x.ts` matches `src/x.ts`; test added.
- B5 `./` and leading-slash normalisation (:208): KEEP (cheap): leading `./` stripped, backslashes not supported (documented).
- C6 all violations printed (step 6, :210): KEEP: one line per file, still naming the file and the Files: line.
- C3 task file absent from the index (:207): KEEP as a behaviour: exit 0 (G3 owns the "task file not in diff" refusal, check-backlog-task.mjs:28-30); test added.
- B-Files-anchor (step 3, :207): KEEP in part: the match is anchored at line start and the first match wins; the exact form is documented in the script header and on task-3.

## REJECT
- A1 self-attesting (HEAD read, :207): REJECT. The brief fixes the home of the declaration (the task file in the same diff, brief Goal) and G3 requires that file in the diff (check-backlog-task.mjs:28-30); a widened Files: line is a visible diff line in the same commit. A HEAD-read would break the first use (task-3 gains its Files: line in the commit that uses it). Hardening is a new card, not this slice (PLAN-PROTOCOL.md:3).
- A2 docs/reports/lanes/ unscoped (:209): REJECT. The brief names docs/reports/lanes/ as always allowed.
- A3 WARN-and-pass (:207): REJECT. Ruled in the brief ("no Files: line = WARN and pass"; the declaration is recommended, not yet a card).
- A4 no tasks dir fails open (:205): REJECT. Same as G3 (check-backlog-task.mjs:19); the brief says copy the gate shape.
- A5 code-only predicate / .husky not policed (:205): REJECT. Brief: docs-only and backlog-only exempt "as in G3"; G3 predicate src|scripts|mobile|migrations (check-backlog-task.mjs:23). Widening is scope creep.
- A6 CI/--no-verify (:205): REJECT. Out of scope; push station is the second gate (enforced-hooks ruling).
- A7 range/Slice-Files/lane mode vs title: REJECT. Narrowed by the R9 note on task-3 ("Scope now") and the brief Goal.
- A8 declaration width cap, A9 merge exemption: REJECT. No ruling asks for either; merge exemption is copied from G3 (check-backlog-task.mjs:17-18).
- B6 multiple trailers: REJECT. G3 reads the first trailer the same way; no ruling to change.
- C1 unborn HEAD: REJECT. `git diff --cached` works on an unborn branch (opened: G3 uses the same call, :22).
- C4 shell quoting: REJECT. spawnSync with an argv array, as G3 (:13).
- C5 trailer parser shared module, error-path tests: REJECT. G3 parser is a one-line regexp; a module is new infrastructure.
- D (generator defects in the context file): REJECT for this lane: outside the Scope now of task-3 (a different task).

# TRIAGE r2 (output review, one lens: error paths and path matching; r2-output.txt; L = line of scripts/hooks/check-task-files.mjs at 978e64e1c)
## KEEP
- MEDIUM L54-57/L66 renamed task file: both names are staged (--no-renames); `always()` whitelisted only one; the other was reported outside scope. KEPT, fixed in fb21775c6 (isTask accepts any staged path of the task).
- MEDIUM L56-57 deleted task file: `git show :path` failed and the check returned 0 silently. KEPT, fixed: index copy, else HEAD copy, test added.
## REJECT
- HIGH L17/L42 git() ignores failures: REJECT. Same shape as G3 (check-backlog-task.mjs:13, :19, :22), brief says copy the gate shape; hardening is a new task.
- MEDIUM L47 partial-commit index: REJECT. Hook runs with the commit's index (opened: G3 uses the same call, :22); same behaviour as G3.
- MEDIUM L48 code predicate: REJECT. Copied from G3 (:23) per the brief.
- LOW comma in a path, `././`, `/src`, `.`: REJECT, low value; no such path in the repo and an unmatched entry fails visibly naming the Files: line.
- LOW L50 unreadable message file, L59 list-item Files: line, NITs (`a**/b`, case on macOS, cherry-pick/revert): REJECT, no ruling asks for them; the Files: form is documented in the script header.
