# REPORT BL-SEMI3 (task-361, SRCH.SEMI-3 semi page Continue)

## Five plain lines for the operator
1. Continue tapped: before, nothing changed on screen for the second or two the lookup ran; now the Continue button dims (the approved mock's busy rule, opacity .85) and tells a screen reader it is busy. The mock draws only that rule, no busy section, no text, no spinner (semi-question.html:130; v8 choose-lot.html:132). After a hot reload (dev only) Continue used to fetch and count the report and never open it; now it opens it. An empty lot id now does nothing instead of calling the server. A lookup that never answers now ends in the same error page a failed one shows, after 60 seconds, and Try again then Continue works (before, every later tap was silently ignored).
2. Not built: what a person sees after a failed Continue (draft D-1, unruled); cancelling the abandoned request; logging; the answer changing while Continue runs (loose ends).
3. Operator item: the wait of 60 s (SEMI_CONTINUE_WAIT_MS, mobile/src/lib/semiQuestion.ts) is a timeframe. Grounded: no ruling gives a number for this wait; RR-0176 (MORNING-DECISIONS.md:785) removed the cap on the loading screen only; ONE-4 (first-open compute p95 well under 35 s) says a slow success is possible, so 60 s was chosen so a slow success is not shown as a failure. Recommendation: keep 60 s (UNVERIFIED by the repo review: DeepSeek lenses only flagged it as design-silent).
4. Lenses: plan round compliance, code-review, ux, error-paths (DeepSeek) changed the plan in two ways (busy class built from the one base class; the mock pin quoted in the binding and the test title); output round on the diff, same four, all PASS, changed two nits (unused export dropped, one test assertion added). Every finding adjudicated in TRIAGE.md.
5. Unproven: the mobile jest cases are not run by any hook and were not run (task-343 line 10); the busy look on a device; the 60 s figure.

## Defects confirmed on head 0eaa22fc0 before fixing
- UX-4/LX-U1: grep busy over SemiQuestionBinding.tsx and semiQuestion.ts, 0 hits (before the change); mock rule at semi-question.html:130.
- CR-1: semi-question.tsx:32-33 `const mountedRef = useRef(true); useEffect(() => () => { mountedRef.current = false; }, []);`.
- LX-R2: continueToReport passed `parcelId: id` with id possibly ''.
- LX-E1: no timeout in fetchParcelLookup (useParcelLookup.ts) or apiClient.ts (grep timeout/abort/signal: none).
All true; none was already fixed.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| 1 busy node state, case first | checked | case "semi-question.html:130 ... pending the Continue node is busy" in semiQuestionPage.behaviour.test.tsx (red commit 9b43c7e7d); binding sets accessibilityState busy true plus opacity-[0.85] (SemiQuestionBinding.tsx continueButton); golden-test named case ask_yes_busy asserts the tree. Jest not run: UNVERIFIED as a run; reasoned from the assertions |
| 2 mountedRef true in effect body, remount case | checked | semi-question.tsx effect body `mountedRef.current = true`; case under React.StrictMode (cleanup then re-run) sees replace called. Not run |
| 3 goldens by repo script, no new finding | checked | no golden moved (ask_yes_busy is a named case); checks.out AFTER-REBASE: semi-question goldens ok (8), S-sbind ok (17 surfaces, 425 strings), surface-validate current, all 9 checks exit 0 |
| 4 typecheck clean; jest UNVERIFIED | checked for typecheck | `npm run typecheck` tsc --noEmit no output, exit 0 on tip 033bf0cbf; mobile jest UNVERIFIED (not run on CI or device) |
| 5 empty-id guard, case first | checked | `if (!id) return;` before the latch; case "an empty parcel id never calls the lookup" asserts fetch not called. Not run |
| 6 bounded wait, next Continue works | checked | boundedWait + SEMI_CONTINUE_WAIT_MS; finally resets submittingRef; fake-timer case: no error at MS-1, error at MS, Try again, second Continue opens the report, fetch called twice. Not run |
| 7 pin quotes the mock | checked | the busy case title and the golden named-case comment quote semi-question.html:130 `.btn.p[aria-busy="true"]`; the binding comment too |

## Lenses (DeepSeek, deepseek-reasoner, template lens-<name>.md)
- Plan stage (context file docs/reports/reviews/task-361/context-2026-11-19.md plus the plan): compliance, code-review, ux, error-paths -> r1-*.txt; all four FAIL verdicts as written, adjudicated in TRIAGE.md: 4 findings KEPT in whole or part (class built from one base; mock pin; process steps; the 60 s figure as operator item), the rest REJECTED with file:line.
- Output stage (diff.patch with pasted-context.md): the same four -> r2-*.txt, all PASS; two nits kept.
- "verified" in this report means: by the named hook output or check output only; lens text is not verification.

## Pasted checks and hook tails
- checks.out BEFORE and AFTER-REBASE: surface-validate "S-sbind ok (17 surfaces, 425 strings)"; "surfaces ok (4 surfaces, 30 goldens)"; "[surface-registry] clean"; consumer registry "is fresh"; "search goldens ok (11)"; "lotmap goldens ok (11)"; "semi-question goldens ok (8)"; "[spec-split-check] clean"; generate-target-files exit 0. (An earlier BEFORE run used a wrong path for generate-target-files; the script path was fixed and the whole set rerun.)
- red.out (second attempt; first refusal kept in red-attempt1.out: check-task-files, the fixture outside the task Files line, widened through the backlog CLI): the test-only commit landed, "pre-commit: no staged src/ or scripts/ source files - skipping the related-tests run", "GATE OK", "POLICY CHECKS OK (commit-msg): 2 file(s)". So the hook cannot make a mobile jest case red: red is by reasoning (the cases import SEMI_CONTINUE_WAIT_MS and read `busy`, `.busy` and the guards that did not exist, and the StrictMode case fails on the old effect). UNVERIFIED as an executed red.
- commit.out (fix commit): "GATE OK", "POLICY CHECKS OK (commit-msg): 4 file(s)", same skip of the related run (no src/scripts files staged).

## Commits (after the rebase onto wf2/board d0d930d65)
- 9b43c7e7d test: red cases (before the rebase 825305ee5)
- 033bf0cbf fix: the four fixes (before the rebase 92b906863)
- the reports commit follows (docs/reports/lanes/2026-11-19/BL-SEMI3/)

## UNVERIFIED
- mobile jest cases never run (no hook runs them; not run on CI or device).
- the busy look on a device; that opacity-[0.85] takes effect through the app's class pipeline.
- the 60 s wait value (operator item).
- whether an abandoned request still running past 60 s completes server-side: the server counts once per lot (route.ts:157, meter 'already_counted' at :160) so a repeat does not double count; not run against a live server.

## Process disclosures
- The red tests were drafted in the worktree before TRIAGE.md was written (rule 16 order); no source file was changed before TRIAGE.md.
- `git checkout -- mobile/src/constants/lotMap.ts` was run once to undo my own uncommitted edit to a file outside the task Files line (a path restore, not a branch change); noted as a deviation from the no-checkout rule.
- lane-dir drafts: desc.txt, runchecks.sh, diff.patch, pasted-context.md are working files.

## Loose ends (appended to task-343 only)
1. Abort or cancel of the abandoned answered lookup (AbortSignal through fetchParcelLookup/fetchWithAuth) - not in the task.
2. No log line on a Continue timeout, a failed Continue, or the empty-id return.
3. A person who changes the answer while Continue runs still gets the report for the answer pressed (route bound at press).
4. After a timeout the built error copy says "Check your connection": carry into the D-1 ruling.

STATUS: ready
