# Seat: regression: task-441 plan (PLAN-441-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file; no word of the findings below is the orchestrator's.

Basis: board head 18cc2752e. Read: biome.json and `biome explain`/`biome lint --only=style/noNonNullAssertion` output; eslint.config.mjs (resolved config); scripts/ast-grep-rules/ (7 files by name); scripts/analysis/gates/mobile-never-do.mjs rows; src/tests/maxbld-web-pages.logic.test.ts:191-193; docs/specs/00_engineering_standards.md :104-127; .husky/pre-commit; vitest.config.ts; `git grep` for alert, confirm, non-null terms across src/tests, scripts and mobile. FINDINGS-PLAN.md was read and is not repeated.

Nothing deleted or altered: the plan's Files line holds three new test files, the task file and the review directory; section 1 Out and acceptance #6 (`git diff --stat` over eslint, biome, scripts, .husky, docs/specs, src and mobile outside src/tests prints nothing) guard it. No existing test, config or gate is edited. Checked and clean.

## rg#1 MED: §2.3 is enforced twice with different answers (Biome warns on every `!`; the new test allows 166 and counts only undocumented ones)
Plan: section 3.3 and section 4 treat the pin as the only check of `!`.
Evidence: Biome's recommended `style/noNonNullAssertion` (warn) is live for src/features/leads and src/lib/observability (biome.json:17-18 recommended true; 30 warnings at this head from `biome lint --only=style/noNonNullAssertion`). src/app/api opts out (biome.json override, `"recommended": false`). It counts documented `!` as well; the new test treats a `!` with a nearby comment as fine.
What goes wrong: a developer who adds a commented `!` in src/lib/observability gets a Biome warning and a green test; one who adds an uncommented `!` there gets both. No commit is refused by Biome (warnings exit 0 in lint-staged), so nothing blocks today, but the repo now has two statements of §2.3 and the plan's text says it has one. If someone later raises Biome to error for those folders, documented `!` become refused while the test says they are fine.
Fix: say in the 3.3 file header that Biome's recommended rule also warns in two folders and that this test is the "comment present" half; no code change needed.

## rg#2 MED: the exact pin fails other lanes late, at pre-push, with no owner for the fix
Plan: section 8 "The pin goes stale ... Risk: moderate on a busy board."
Evidence: the pre-commit related run (.husky/pre-commit:85) selects tests through the import graph of the staged files. The new §2.3 test reads source with `fs` and `git ls-files`; it imports none of the files it scans. So a lane that adds or removes a `!` in, say, src/lib/stripe/parcel-checkout.ts will not have this test selected at its own commit; the red first appears at the full-suite pre-push run or in CI, after the lane thinks it is done. The failure text tells the reader to edit UNDOCUMENTED_BANG_PIN, a file the lane's own Files line does not name, so check-task-files.mjs would refuse that edit in the lane's commit unless the lane adds the file to its Files line. Measured: six unmerged branches change the count (mf83-daylight +9, wf1/mf83-g3 +10, mf47-checkout +4, wf1/mf37-1109 +1, wf1/mf48-1111 +1, wf1/inc1b-thinroute -1; see integration seat in#1). A removal turns the test red as well ("lower the pin"), so a good fix is blocked until the pin is edited.
What the repo calls this: I searched docs/specs/00-architecture/08_agents.md, 137_mcqueue.md, CLAUDE.md and .cursor for "unowned red" and "flake" and found no rule that classes a pin-red from another lane; whether the repo would call it an unowned red is UNVERIFIED. The same shape already exists (REPORT_RENDERER_PIN, surface-conformance.logic.test.ts:36-38), but that pin covers three files owned by one surface, not 60 files across src and mobile.
Fix: name the owner in the failure text and in the plan (the lane that changes a count edits the pin and adds the pin file to its Files line), and consider a per-folder or per-file allowance only if the grounder rules the whole-repo pin too broad. Do not read this as a block; it is the design the plan chose.

## rg#3 LOW: §12.7 finder matches any local function named alert, confirm or prompt, because it does no scope lookup
Plan: section 3.1 finder "a CallExpression whose callee is the Identifier `alert`, `confirm` or `prompt`".
Evidence: today 0 calls match anywhere in src (AST walk plus `git grep`), so nothing breaks now. The match is by name only, so a local helper `prompt(...)` (this repo builds AI prompts), an imported `confirm` from a dialog library, or a method destructured as `const { confirm } = useDialog()` would fail the test although none freezes the browser.
What goes wrong: a future false red, fixed by renaming, and a pin-free test has no exception map (unlike 3.2's ENGINEERED).
Fix: note the limit in the header (the plan already lists misses; this is a false-positive limit) or add a small reasoned exception map like FENCED.

## rg#4 LOW: no overlap for §12.7 and §1.2; existing neighbours are different scope
Evidence: eslint.config.mjs resolved config has no `no-alert`; `biome explain noAlert` shows it is not in the recommended set (so even Biome's three folders do not enforce it); scripts/ast-grep-rules has seven files (bylaw-literal, compute-shape, env-default-in-lib, loop-query, silent-catch-fallback, step-shape, unbounded-push-in-stream), none on dialogs or UI isolation; mobile-never-do.mjs rows C1-C6 cover mobile only and say nothing about dialogs or src/components/ui; maxbld-web-pages.logic.test.ts:191-193 bans `useQuery` in page files, not in src/components/ui. src/tests/admin-flight-center.ui.test.tsx:288 only has a comment about confirm. So two of the three finders add a first check; they do not duplicate one.
Fix: none.

## rg#5 NIT: `.logic.test.ts` is defined as pure-function tests; these read the git tree
Evidence: 00_engineering_standards.md:105 "`*.logic.test.ts` | Pure functions, scoring, classification". The three tests shell out to `git ls-files` and read files. Precedent for source-scan locks under that suffix exists (resolve-db-adoption.logic.test.ts, test-db-setup-guard.logic.test.ts), and the Files line already names these file names. Name only; no action unless the grounder wants the standards table to list source-scan locks.

## rg#6 NIT: the planted red is in the same case that guards the real tree
Plan: 3.4 relies on the real-tree case A going red on the plant. If a later lane unstages or deletes the plant before pre-commit finishes there is nothing to scan; the KNOWN_BAD cases B and C of each file (in-memory planted text) already prove the finders fire without a file. Both directions are therefore covered twice. No weakening found; stating it so the red.out is not the only proof.

UNVERIFIED (not checked by this seat):
- Whether the repo's rules call a pin-red from another lane a flake or an unowned red (no rule text found in the four places searched).
- Run time of the three tests inside the 4-fork related run and the full-suite pre-push run (not timed).
- That none of the other 350-odd `*.logic.test.ts` tests asserts the file count or content of src/tests (a `git grep` for directory listings of src/tests found only generic helpers, not each read).
- CI (test.yml) behaviour on a shallow clone for `git ls-files` of mobile (not read).
- Whether lint-staged's Biome run is still warn-only in CI.
