Grounder: Cairn-Ground-O440
Lane: BL-LOOK440

# GROUNDER-LOOK: separate grounder's verdicts on RULE-CHECKS.md (task-440, plan section 7, RR-0385 item 1)

Pin and method. Every verdict is against S = ba4ac48fd (git rev-parse gives ba4ac48fdb7e6e6297fe431cb62e4d4a4bb86084), read with `git show ba4ac48fd:<path>`, `git grep ... ba4ac48fd` and `git ls-tree -r --name-only ba4ac48fd`. Sections 1 to 12 were written against RULE-CHECKS.md at the lane commit d1a21d0f8 (the look is e0e5b7ffd), so the RULE-CHECKS.md line numbers in them are those of that version; section 13 records the re-check after the corrections. wf2/board has moved on to 6d46ba5a6, a descendant of S. `git diff --stat ba4ac48fd 6d46ba5a6 -- docs/specs/02-web-admin docs/specs/00_engineering_standards.md` is empty, so a re-pin would not change the groups. Read-only: no test was run, no hook was run, nothing was written. Verdict words: CONFIRMED or WRONG. Table lines start with a pipe so they are not read as GROUNDER verdict lines by the K2 command.

Result in one line: 5 WRONG rows in the first pass (fe.15, fe.19, fe.38 enforced is false; fe.20 group 3 none is false; fe.56 group 3 rank is wrong). Everything else checked CONFIRMED. All five are corrected and re-checked (section 13).

## 1. Header counting commands, re-run at the pin

| Command (as in RULE-CHECKS.md header) | Lane output | My output at S | Verdict |
|---|---|---|---|
| `git show S:136_mcfrontend_handbook.md \| grep -c '^- \*\*fe\.'` | 57 | 57 | CONFIRMED |
| same, `grep -c 'Status: RULED'` | 36 | 36 | CONFIRMED |
| same, `grep -c 'Status: OWED'` | 21 | 21 | CONFIRMED |
| same, `grep -c 'fe\.58'` | 0 | 0 | CONFIRMED (task-446 not landed at S, so the pending row is right) |
| `git show S:00_engineering_standards.md \| grep -cE '^### [0-9]+\.[0-9]+'` | 52 | 52 | CONFIRMED |
| `sed -n 462,467p \| grep -c '^\| '` | 6 | 6 | CONFIRMED |
| `git ls-tree -r --name-only S \| grep -c '\.db\.test\.ts$'` | 144 | 144 | CONFIRMED |
| `git grep -l 00_engineering_standards S -- src/tests scripts .husky .github eslint.config.mjs biome.json \| wc -l` | 110 | 110 | CONFIRMED |
| K2 at S (find on the worktree gives docs added by the lane's own commits, so I ran the same grep over every GROUNDER*.md under docs/reports/lanes and docs/reports/reviews listed by git ls-tree at S) | 6 | 6: 3 in BL-RULESACC GROUNDER.md (:114, :136, :138, all mobile/src/lib/maxbldHelp.ts) and 3 in task-440 GROUNDER-PLAN.md (rc#2 :12, rc#3 :13, rg#6 :32) | CONFIRMED (point c) |
| Lock paths tracked: every `Enforced by:` and `lock owed:` path of the 136 Status lines through git ls-tree at S | 29 tracked, 20 not, the 20 all OWED | 29 tracked, 20 untracked; the 20 are exactly the lock-owed paths of fe.04 fe.12 fe.17 fe.21 fe.25 fe.26 fe.44 to fe.57; fe.39's lock is tracked | CONFIRMED |
| Group 3 fixed test on the 136 rule plus Status line | fe.09 fe.18 fe.19 fe.22 fe.25 fe.26 fe.27 fe.39 fe.44 fe.56 | same ten | CONFIRMED |
| Same test on the last cell of Spec 135 rows 23-79 | FE-13 15 18 25 26 31 32 39 44 | same nine | CONFIRMED |
| Same test (case-blind, with SELECT and INSERT) on each engineering subsection | 2.1 3.1 3.2 3.3 4.3 5.2 5.3 5.4 9.1 9.2 9.3 9.4 10.1 10.2 10.3 12.4 12.8 12.10, plus rows :462 and :463 | same 18 subsections; rows :462 and :463 hit | CONFIRMED |
| Group 3 size: seed 24 + added 23 = 47 | file says "Union: 26 + 21 = 47" | seed list is 19 fe + 5 eng = 24; added list is 7 fe + 16 eng = 23; 24 + 23 = 47. The 26 and 21 are the fe and eng split of the same 47 (fe rows 26, eng rows 21), correct but unlabelled | CONFIRMED count, label gap (lens finding inc-S#4, LOW) |

All 57 handbook rows: the cited `136:N` line of each group 1 row is the line of its `- **fe.NN**` heading at S (loop over all 57, 0 mismatches). All 57 Status lines agree with the row's RULED or OWED word. All group 2 and group 3 engineering rows: the cited `00_engineering_standards.md:N` line holds the quoted words (the only differences are markdown marks such as backticks and bold that the quote drops; checked for all 58 plus the group 3 engineering rows).

## 2. Status rule applied per group, and the totals

Row counts in the file at d1a21d0f8: group 2 enforced 7, partly 22, none 29 (= 58); group 1 enforced 33, partly 4, none 20 (= 57, plus the fe.58 pending row, not counted); group 3 enforced 0, partly 17, none 30 (= 47). These agreed with the "Group totals" lines and the operator table as written. After my corrections: group 1 enforced 30, partly 7, none 20; group 3 enforced 0, partly 18, none 29; group 2 unchanged.

- Group 1: the 21 OWED rows are all none except fe.39 (partly, lock tracked; register-locks-resolve.infra.test.ts:30 FLIP_PENDING). CONFIRMED.
- Group 2: 7 enforced, checked in section 4. CONFIRMED.
- Group 3: no row has a Bound and an Available mark that is not "main only", so 0 enforced follows from the plan rule (plan section 3: a db test that CI runs only on push to main leaves the row partly with the words main only). CONFIRMED. The lens read the Available definition at the head of section 4 without that clause (lens finding plan-protocol#2); the clause is in the plan, which the file applies "as written".

## 3. Group 1 (handbook): every mechanical cell, and every row marked enforced

Mechanical cells checked whole (57 rows): rule line number (57/57), RULED or OWED word, Enforced by or lock owed path, tracked state, Status word by the plan rule (OWED and untracked is none, 20 rows; OWED and tracked is partly, 1 row; RULED with no open break and no scope gap is enforced). Rank is in section 7.

Enforced rows (33 in the first pass). Evidence is the lock's own header line (read at S) set against the rule words; I read headers and ran targeted greps for the rule's distinctive nouns, not whole test bodies.

| Row | Verdict | file:line | Quote from the line |
|---|---|---|---|
| fe.01 | CONFIRMED | src/tests/surfaces/mcfrontend-status.infra.test.ts:1 | FE-01 (dated notes 2026-11-06 and 2026-11-09 |
| fe.02 | CONFIRMED | src/tests/surfaces/report-generated-only.infra.test.ts:2 | FE-02 (P1 declared, not coded) |
| fe.03 | CONFIRMED | src/tests/surfaces/surface-validate.infra.test.ts:1 | FE-03 (P2 proven, not reviewed |
| fe.06 | CONFIRMED | src/tests/surfaces/report-honest.logic.test.ts:3 and scripts/surfaces/_schema/report-tree.schema.json:133 | FE-06 (the lock) ; the schema pattern lists not_modelled, at_least, none, not_permitted, not_evaluated, so the "at least" and not_modelled words are covered through the schema the lock validates against |
| fe.07 | CONFIRMED | src/tests/surfaces/parity.golden.test.ts:5 | FE-07 (P6 same everywhere) |
| fe.08 | CONFIRMED | src/tests/surfaces/spec-paths.infra.test.ts:2 | its lock is this one, "see FE-16" (Spec 135 FE-08 at 135:30, FE-16 at 135:38) |
| fe.09 | CONFIRMED | src/tests/surfaces/register-locks-resolve.infra.test.ts:1 | FE-09 (a separate decisions spec with a Lock column that resolves) |
| fe.10 | CONFIRMED | src/tests/surfaces/handbook-rule-map.logic.test.ts:1 | FE-10 (the generator lives in the spec; this is its named lock) |
| fe.11 | CONFIRMED | src/tests/surfaces/mcfrontend-queue.infra.test.ts:1 | FE-11 (product first; admin converts on touch |
| fe.13 | CONFIRMED | src/tests/surfaces/surface-validate.logic.test.ts:3 | FE-13 (the gate) ; budget WAITS MF-08 is a stated waiting for fe.04, not part of fe.13 (:91) |
| fe.14 | CONFIRMED | src/tests/surfaces/mcfrontend-queue.infra.test.ts:2 | FE-14 (LEAN; dated note 2026-11-09 |
| fe.15 | WRONG (corrected, section 13) | docs/specs/02-web-admin/135_mcfrontend_decisions_register.md:37 and 136_mcfrontend_handbook.md:76 | rule: "canaries a-f"; the Lock cell says the lock "covers canaries a, b, c and d. Canary e (25 lots against the answer key) is owned by FE-25 ... and canary f (in-product error count) by FE-26", both OWED and untracked. By the plan's own scope-gap rule this is partly, not enforced. |
| fe.16 | CONFIRMED | src/tests/surfaces/spec-paths.infra.test.ts:1 | FE-16 (Q-MF1 a: all McFrontend specs in docs/specs/02-web-admin |
| fe.18 | CONFIRMED | src/tests/surfaces/report-binding.logic.test.ts:3 | FE-18 (the lock) and FE-27 |
| fe.19 | WRONG (judgement on the scope-gap rule; corrected, section 13) | 136_mcfrontend_handbook.md:88 and src/tests/surfaces/user-input-provenance.logic.test.ts:5-10 | rule: "raises that lot's confidence for every viewer" and "Confidence by source: estimated low, user medium, verified high"; the lock header names no confidence case, and `grep -ci confiden` on that file is 0 (on user-entry-precedence.logic.test.ts also 0). |
| fe.20 | CONFIRMED | src/tests/surfaces/user-entry-precedence.logic.test.ts:1,8 | FE-20 (verified permit/plan facts outrank user entries ; (2) one entry, history kept |
| fe.22 | CONFIRMED | src/tests/surfaces/ad-targeting-keys.logic.test.ts:1 | FE-22 (ads target only declared database keys |
| fe.23 | CONFIRMED | src/tests/surfaces/ad-slot.golden.test.ts:2 | FE-23 (ad slots: own source |
| fe.24 | CONFIRMED | src/tests/surfaces/new-row-zero-code.golden.test.ts:1 | FE-24 (a new catalogue row reaches mobile, web, admin and PDF with zero |
| fe.27 | CONFIRMED | src/tests/surfaces/report-binding.logic.test.ts:95 and :145 | a parcels column that is not a migration column ; a parcels path that is not on the S-001 consumer whitelist |
| fe.28 | CONFIRMED | src/tests/surfaces/report-honest.logic.test.ts:3 | FE-28 listed beside FE-06 and FE-29 |
| fe.29 | CONFIRMED | src/tests/surfaces/report-honest.logic.test.ts:6 | The node contract has ONE home, scripts/surfaces/_schema/report-tree.schema.json |
| fe.30 | CONFIRMED | src/tests/surfaces/report-generator-fields.logic.test.ts:3,7 | FE-30 (every effective-ON catalogue row is a field |
| fe.31 | CONFIRMED with a note | src/tests/surfaces/surface-conformance.logic.test.ts:3 | the render-smoke clause is its own row, FE-33 (136:124 says the same; the clause is carried by fe.33, rated partly) |
| fe.32 | CONFIRMED | src/tests/surfaces/contract-binding.logic.test.ts:1 | FE-32 (contract is a binding kind |
| fe.34 | CONFIRMED | src/tests/surfaces/report-page.logic.test.ts:6 | The v21 report page (approved mock v21 ; the cited lock is the one 136:134 names |
| fe.35 | CONFIRMED | src/tests/surfaces/report-checked.logic.test.ts:3 | FE-35 (this file is its lock) |
| fe.36 | CONFIRMED, observation for the orchestrator | src/components/report/ReportPage.tsx:252 and src/tests/surfaces/nav-by-route.logic.test.ts:15 | D7 fixed: case 'Button': return <Link key={key}. The lock passes with named exceptions: "Four kinds: exception (the six audited VIOLATIONS; reason owed: <row>)", five exception entries at :300, :302, :304, :306, :311 (owed MF-49, MF-50). The plan prescribes fe.36 as enforced (plan section 3, worked example G1) and no grounder verdict calls them breaks, so I keep the row; the operator may prefer partly. The lane kept the observation in the row. |
| fe.37 | CONFIRMED | src/tests/surfaces/web-landing.logic.test.ts:3 | FE-37 listed among the landing locks |
| fe.38 | WRONG (corrected, section 13) | docs/specs/02-web-admin/135_mcfrontend_decisions_register.md:60, 136_mcfrontend_handbook.md:145, src/tests/consumer-parcel-lookup-legacy-hide.logic.test.ts:9 | rule: "The mobile parcel screen and the tracked-lots list then show none of them"; Lock cell: "the screen shows no Envelope constrained note (2 a). Same lock, extended" and "not counted against the monthly allowance"; the lock's own words are "so no legacy value leaves the server" (:9) and it has no hit for allowance or Envelope constrained (grep 0). Server half only: partly. |
| fe.41 | CONFIRMED | src/tests/surfaces/report-page.logic.test.ts:231 | describe('P3a MF-83 (FE-41) the summary |
| fe.42 | CONFIRMED | src/tests/surfaces/report-page.logic.test.ts:285 | describe('P3c MF-83 (FE-42) the lot-view drawing part |
| fe.43 | CONFIRMED | src/tests/surfaces/report-page.logic.test.ts:341 | describe('P3b MF-83 (FE-43) details_view |

Group 1 partly rows (sampled in section 6): fe.05, fe.33, fe.39, fe.40.

## 4. Group 2: every row marked enforced (7)

| Row | Verdict | file:line | Quote |
|---|---|---|---|
| §3.2 | CONFIRMED | scripts/validate-migration.js:222 and .github/workflows/pipeline-lint.yml:105 | missing '-- UP' block ; run: node scripts/validate-migration.js migrations/*.sql |
| §4.1 | CONFIRMED | src/tests/api.infra.test.ts:936 | every /api/admin/** handler export calls verifyAdminAuth as its FIRST statement |
| §6.1 | CONFIRMED | eslint.config.mjs:70 and src/tests/enforcement.logic.test.ts:19 | §6.1 — Ban console.error in API routes ; bans console.error in src/app/api/ files (§6.1) |
| §7.1 | CONFIRMED (tier-rule clause not opened) | src/tests/classify-sync.logic.test.ts:77 and :139 | describe('Classification Sync Gate (§7.1)' ; JS trades are subset of TS trades with matching confidence. Rule :147 also names "tier rules"; I found no tier case in that test (not opened further: UNVERIFIED) |
| §9.6 | CONFIRMED | src/tests/chain.logic.test.ts:1026 and :1038 | every manifest script entry points to an existing file ; every chain step references a known script slug |
| §12.1 | CONFIRMED | package.json:62-72 and .husky/pre-commit:50 | lint-staged biome check on src/features/leads ; npx lint-staged --allow-empty |
| §12.13 | CONFIRMED | stryker.config.mjs:59 and .github/workflows/mutation.yml:15-30 | break: 75 ; weekly cron plus PR path filter. builder-query.ts, the fourth module in the rule at :385, was deleted (stryker.config.mjs:34 comment), so three modules is the live scope |

## 5. Group 3 (front end to database)

No row is marked enforced, so there is no enforced row to check. Rows checked:

| Row | Verdict | file:line | Note |
|---|---|---|---|
| fe.19 (partly, main only) | CONFIRMED | .github/workflows/test.yml:67 and .github/workflows/db-tests.yml:9-17 | test.yml excludes src/tests/db/**; the db-tests PR filter lists migrations/**, src/features/leads/lib/**, src/lib/db/**, src/tests/db/**, scripts/**; src/tests/db/parcel-user-inputs.db.test.ts is the Available check |
| fe.27 (partly, main only) | CONFIRMED | src/tests/db/consumer-parcel-lookup.db.test.ts:4 | exact hit → whitelist payload; the guarded code (src/lib/parcels, the lookup route) is outside the PR filter |
| fe.38 (partly, main only) | CONFIRMED | src/tests/db/consumer-parcel-lookup.db.test.ts:5 | cost-menu-null |
| fe.20 (none) | WRONG (corrected, section 13) | src/tests/db/parcel-user-inputs.db.test.ts:11 and :13 | the row said Available "UNVERIFIED ... none". I opened the db test: "(c) entered once: a second active entry is 23505; after a revert a new entry is accepted (history kept, two rows)" and "read returns the active row only, a reverted row is never read". That is an Available check on the active-entry and history half of fe.20 (main only). Bound stays none, so the row is partly with the words "main only", not none. |
| fe.45, fe.52, fe.21, fe.25, fe.26, fe.44 (none) | CONFIRMED | 136_mcfrontend_handbook.md:166, :187, :94, :106, :109, :163 | each is OWED with its lock untracked (section 1) |
| fe.05 (none) | CONFIRMED | src/tests/surfaces/report-no-maths.logic.test.ts:28 | const DIRS = ['src/lib/surfaces/report', 'src/components/report', ... a no-maths scan, not a binding check |
| fe.40 (none) | CONFIRMED | src/tests/mctest/catalogue.infra.test.ts:4 | The real tests/e2e/scenarios.json is well formed (the catalogue, not the layers) |
| §4.3 (partly) | CONFIRMED | src/tests/api.infra.test.ts:1218 | no public route selects a wildcard from a base table |
| §5.3 (none) | CONFIRMED | scripts/analysis/gates/red-evidence.mjs:4-8 | gate K reads step reports only |
| The 23 added rows are real keyword hits | CONFIRMED | RULE-CHECKS.md (the seed and added list) | the plan fixes "no row is dropped"; keyword false positives such as §12.4 (select in per-selector) and §9.4 (maxRowsPerInsert) are marked case-blind hits in their own rows |

Open point inside group 3: fe.39, fe.13, fe.15, fe.18, fe.22, fe.24, fe.30, fe.31, fe.32, fe.37, fe.41, fe.42 carry a Bound "yes" that I did not open test bodies for (UNVERIFIED, section 12).

## 6. Sample of none and partly rows, named (10 per group)

Group 1 (10): fe.54, fe.45, fe.47, fe.49, fe.57, fe.04, fe.05, fe.33, fe.40, fe.39. All CONFIRMED. Evidence: locks untracked at S for fe.54 fe.45 fe.47 fe.49 fe.57 fe.04; fe.04 also "budget WAITS MF-08" at src/tests/surfaces/surface-validate.logic.test.ts:91; fe.05 DIRS has no mobile/ path (report-no-maths.logic.test.ts:28) and scripts/analysis/gates/mobile-literals.mjs:3 reads "GATE B (COMPLY.3 stage 1, task-367) — numbers in phone and surface code. REPORT-ONLY."; fe.33 lock header src/tests/surfaces/render-smoke.logic.test.ts:6 "the FE-33 lock (web half; MF-35 extends it for mobile by dated note, prose-only until MF-25)"; fe.40 as in section 5; fe.39 tracked lock plus FLIP_PENDING at register-locks-resolve.infra.test.ts:30. Note on fe.57: src/tests/surfaces/surface-conformance.logic.test.ts holds safe-area and 44 px cases (C-9), so the a11y category has a partial check outside its owed lock; the plan rule (OWED with lock untracked is none) still gives none.

Group 2 (10): §12.4, §13.1, §12.2, §8.1 (none) and §3.1, §9.4, §9.5, §12.8, §12.10, §13.4 (partly). All CONFIRMED. Evidence: scripts/ast-grep-rules/ holds seven files (bylaw-literal, compute-shape, env-default-in-lib, loop-query, silent-catch-fallback, step-shape, unbounded-push-in-stream) and `git grep createContext|useContext|captureEvent|useEffect` over them, eslint.config.mjs and biome.json has no hit; scripts/hooks/ast-grep-leads.sh:218 "guard (OOM risk). Informational only — does NOT set fail=1." (§9.5); scripts/validate-migration.js has no ALTER COLUMN arm (§3.1; its Rule 1 comment at :228 covers DROP and TRUNCATE); eslint.config.mjs:103 'warn' for the scripts rules (§9.4); package.json:36 "sql:lint": "sqlfluff lint --dialect postgres migrations/" and `git grep sqlfluff|sql:lint` over .github .husky scripts/hooks finds only package.json (§12.8); .github/workflows/lighthouse.yml:4-11 "branches: [main]" with a paths list (§13.4); db-tests.yml:90 "run: npm run test:db" (§12.10).

Group 3 (10): fe.45, fe.52, fe.05, fe.40, fe.19, fe.27, fe.38, fe.20, §4.3, §5.3. Verdicts in section 5: eight CONFIRMED, fe.20 WRONG (corrected); fe.19, fe.27 and fe.38 are CONFIRMED as group 3 rows (their group 1 status is a separate verdict).

## 7. Rank check

- Group 1: key 1 puts fe.54 first (K2 open break, maxbldHelp.ts:19). Then none rows in REPORT-429 3A order (fe.45 to fe.57; I read ~/Buildo-scratch/lanes-20261119/inc1b/inputs429/REPORT-429.md:116-200: items 1-13 are exactly fe.45 to fe.57 in that order), then the E4 OWED rows fe.04, fe.12, fe.17, fe.21, fe.25, fe.26, fe.44, then partly rows: fe.39 (E4), then fe.05, fe.33, fe.40 in source order. CONFIRMED in the first pass; after the corrections the partly block is fe.39, fe.05, fe.15, fe.19, fe.33, fe.38, fe.40 (ranks 21-27, section 13).
- Group 2: none rows then partly rows, in source order within each, REPORT-429 3A item 2 puts §12.5, §12.3, §12.7 first. CONFIRMED.
- Group 3: WRONG in the first pass. Key 3 means the none rows run fe.45 (3A 1), fe.52 (3A 8), fe.56 (3A 12), then E4 fe.21, fe.25, fe.26, fe.44, then the rest in source order. The file ranked fe.56 eleventh. Corrected (section 13).

## 8. Operator table against the body

| Cell | Verdict |
|---|---|
| Group rule counts 57 (+1), 58, 47 | CONFIRMED |
| Group 2 enforced/partly/none 7/22/29, group 1 33/4/20, group 3 0/17/30 | matched the tables as written at d1a21d0f8; group 1 became 30/7/20 and group 3 0/18/29 after the WRONG rows were corrected |
| Open known breaks 1, 0, 0 | CONFIRMED against the body (fe.54 only). The Outside list holds two more open breaks (D1 CRITICAL, D10 HIGH) and two open K2 lines; the lane added a line under the table naming them (lens findings inc-S#2 and ms-S#2) |
| Top three | followed the rank keys; the group 2 cell named two superseded rules (lens finding plan-protocol#1); corrected to §12.7, §1.2, §2.1 (section 13) |

## 9. Corrections owed in RULE-CHECKS.md (every WRONG), as raised in the first pass

1. fe.15 group 1: enforced to partly (Lock cell 135:37 "covers canaries a, b, c and d"; e and f owned by FE-25 and FE-26, OWED, untracked).
2. fe.19 group 1: enforced to partly (judgement call; the confidence clause of 136:88 has no assertion).
3. fe.38 group 1: enforced to partly (the lock is the server half only, legacy-hide test :9).
4. fe.20 group 3: none to partly, Available "main only" from parcel-user-inputs.db.test.ts:11 and :13.
5. fe.56 group 3: rank 11 to rank 3 (key 3).
6. Totals that follow: group 1 enforced 30, partly 7, none 20, RULED 36 = 30 enforced + 6 partly; group 3 partly 18, none 29; the operator table cells.

## 10. Points the lane raised, ruled from the code and the records

(a) Lens material: acceptable, no re-run owed. scripts/hooks/check-lane-close.mjs:829 sets expectedPaths to the Files-covered changed paths minus the table's exempt paths; scripts/analysis/rule-lists.json:228 exempts docs/reports/lanes/** and docs/reports/reviews/**, which hold both Files paths and all records. So expected is empty and :418 (`if (ph === 'out' && expected.length)`) skips chunkErrors; the close then checks the REVIEW header, the file_sha256 against the committed in- input, the prompt hash, and the list text in the in- first line. I recomputed all four: shasum of each in-out-compliance-<list>.txt equals the file_sha256 in its out- header, and the four Ruled sha12 values equal the committed outputs (fa9b7c3c6271, 8b8ed3ffea52, d7e21bfc4ad7, b2105662ed86). The brief's own command would have fed the lens an empty diff, so the lane's wider diff is the better material. The per-list form is accepted by complianceSetErrors (:441 refuses only both forms in one stage); QUESTIONS-RULED.md Q5 recommended the joined form but did not require it.

(b) Two commits: nothing refuses it. Spec 137 Rule 3 (137_mcqueue.md:92) asks that the status line change in the commit that lands the work; the lane commits do not move the status (the task stays RUNNING), and the two-commit close is for build and fix tasks only (137 dated note 2026-11-20). The close check runs only on a move to BUILT, DONE or MERGED. The plan's "one commit at the end" is a departure the lane stated in REPORT.md. The same holds for the two correction commits of section 13. Acceptance 8 holds: only Files paths, the task file and lane or review records change.

(c) K2 gives 6 lines at the pin, not 3: CONFIRMED (section 1). The extra three are task-440's own GROUNDER-PLAN.md rc#2, rc#3 and rg#6, all mapped in RULE-CHECKS.md section 5.

## 11. Known breaks and the Outside list (whole)

| Id | Verdict | file:line and quote | Note |
|---|---|---|---|
| D1 F-470 CRIT, Outside, open | CONFIRMED | src/lib/report-projection/project.ts:185-187 | compares layer2_table_version, catalogue_sha, switchboard_sha only; settings_sha and evaluator_version are not compared. BL-COMPLY GROUNDER.md:48-50 holds D1 with [CRIT] |
| D2 F-234, fe.44, fixed | CONFIRMED | src/tests/report-projection-settings.logic.test.ts:5 "D2 and D9 of the BL-GROUND verdicts" | git grep 10.7639 finds none under src/lib/report-projection; mobile/src/lib/parcelCostFormat.ts:11 still has the literal (the row notes it) |
| D3 (10 + 6 ids), §14 row 4, fixed | CONFIRMED the cites, per-id fix not checked | contract_parcels_entitlement.descriptor.json:7 "seven fields (corrected 2026-11-20"; 100_mobile_parcel_cost_tool.md:127 "FIX.SPECS · task-376, defect D3"; 126_maxbld_surface_standard.md:879 "defect D3 extension" | the 16 ids were not each re-read: UNVERIFIED |
| D4 Outside, fixed | CONFIRMED | docs/specs/03-mobile/99_mobile_state_architecture.md:236 | the ['parcel-entitlement'] row exists |
| D5 Outside, fixed | CONFIRMED | mobile/app/(app)/parcel-tool/semi-question.tsx:30 "useAnswerParcelLookup()" | the :64 the lane also cites is a `try {` line; the mutation is at :30 |
| D6 §12.12, fixed | CONFIRMED | src/tests/property/report-sqft-rounding.property.test.ts:3 | "D6 of the BL-GROUND verdicts" |
| D7 fe.36, fixed | CONFIRMED | src/components/report/ReportPage.tsx:252 | b01c90e60 is an ancestor of S |
| D8 §1.1, fixed | CONFIRMED | src/tests/surfaces/site-footer-route.ui.test.tsx:6 | "defects D7 and D8 of the BL-GROUND handbook pass"; 49fb1bd92 is an ancestor of S |
| D9 Outside, fixed | CONFIRMED | src/lib/report-projection/project.ts:79 | pinnedWindow(seed ... |
| D10 Outside, open | CONFIRMED | scripts/analysis/proof-slice.mjs:22 | "task-375 D10b OPEN" |
| D11 Outside, fixed in part | CONFIRMED the code line, rest UNVERIFIED | scripts/analysis/backlog-lane.mjs:178 | ctxArgs = `--context ${ctx} ${sectionFlags}` |
| D12 Outside | CONFIRMED the file exists, fix claim UNVERIFIED | mobile/__tests__/reportScreen.gateStability.behaviour.test.tsx | tracked at S, not opened |
| D13 Outside | not checked (the pre-approval log is outside the repo) | | UNVERIFIED, as the file says |
| D14 fe.47, fixed | CONFIRMED | mobile/src/lib/semiQuestion.ts:18 and mobile/src/hooks/useParcelLookup.ts:57 | sliceNumber(slice.config, 'continue_wait_ms') ; sliceNumber(searchSlice.config, 'entitlement_stale_ms') |
| K2 BL-RULESACC :114, :136, :138; task-440 GROUNDER-PLAN rc#2, rc#3, rg#6 | CONFIRMED, each appears once, on a row or under Outside | mobile/src/lib/maxbldHelp.ts:18-19 | open: line 19 "A rejecting openBrowserAsync is caught and logged with the topic only"; the catch only console.warns (:26); fe.54 row cites Spec 128 Rule 12 at 136:193 |
| Severity note | observation | BL-COMPLY GROUNDER.md:84, :88, :92, :96 | the D7 to D10 headers read "(CONFIRMED, low)" while the finding tags read [HIGH]; the file uses the finding tags |
| Conflicts C1 to C5 | CONFIRMED as not ranked | BL-COMPLY GROUNDER.md:108-122; BL-COMPLY3 GROUNDER-2.md:42 | noted, not ranked, as the plan says |

## 12. What I did not check (UNVERIFIED)

- Test bodies of the group 1 locks: only headers, Lock cells and targeted greps (fe.06, fe.15, fe.19, fe.20, fe.27, fe.36, fe.38 got body-level reads).
- Group 2 enforced rows: each cited line was opened; whole-subsection bullet coverage was not compared. §7.1 tier rules not opened.
- Group 3 Bound "yes" cells other than fe.19, fe.27, fe.38.
- The 10 sample rows per group: mechanical cells and one check source each, not a fresh search of every check source for each none row.
- D3 per-id fixes (16 ids), D5 fixing commit, D11 plan-lens location, D12 test content, D13 entirely.
- Whether `npm run lint` (`next lint`, package.json:10) reads scripts/ (§9.4), which §8.2 cases tsc 5.7 reports, whether step-validate covers §9.3, .husky/prepare-commit-msg wiring (§12.14), whether anything runs the McTest layers.
- REPORT-429 was read only for its 3A order (key 3); it is ungrounded and was never used for a status.
- No hook, workflow or script was executed; CI behaviour is read from the workflow files.

## 13. Re-check of the corrections, 2026-11-23 (commits 7a60cc538 and 1e332d979, read-only, whole diffs)

Commit 7a60cc538 (RULE-CHECKS.md only, 45 insertions, 43 deletions) and commit 1e332d979 (RULE-CHECKS.md only, 7 insertions, 7 deletions) are on wf1/inc1b-look440; 1e332d979 is the lane HEAD. Task still RUNNING, nothing landed. Every WRONG row of section 9 is now corrected:

| Item | Verdict | Where at 1e332d979 |
|---|---|---|
| fe.15 group 1 partly, with the Lock cell reason (135:37) | CONFIRMED corrected | group 1 partly block, source order: fe.39, fe.05, fe.15, fe.19, fe.33, fe.38, fe.40 (ranks 21-27) |
| fe.19 group 1 partly (judgement call stated) | CONFIRMED corrected | same block |
| fe.38 group 1 partly (136:145 and 135:60 reason) | CONFIRMED corrected | same block |
| fe.20 group 3 partly, main only, with parcel-user-inputs.db.test.ts:11 and :13 | CONFIRMED corrected | group 3 rank 35, after fe.19 (rank 34) and before fe.22 (rank 36) |
| fe.56 group 3 rank 3 | CONFIRMED corrected | none block ranks 1-29: fe.45, fe.52, fe.56, fe.21, fe.25, fe.26, fe.44, fe.05, fe.09, fe.40, then the engineering rows |
| Totals | CONFIRMED | group 1 {"enforced":30,"partly":7,"none":20}, RULED 36 = 30 + 6; group 3 {"enforced":0,"partly":18,"none":29}; partly ranks 30 to 47 sequential with no duplicate (fixed in 1e332d979; 7a60cc538 had left rank 30 missing and two rows at 35) |
| Operator table | CONFIRMED | group 1 57 / 30 / 7 / 20; group 3 47 / 0 / 18 / 29 with top three fe.45, fe.52, fe.56 |
| Line under the operator table naming D1 CRIT, D10 HIGH and the two open K2 Help lines | CONFIRMED | made in 7a60cc538 |
| Section 7 wording that the grounder checked the enforced rows | CONFIRMED | made in 7a60cc538 (the first bullet of the UNVERIFIED section of the file) |
| §12.7 ruling | CONFIRMED | see below |

The §12.7 ruling. The dated note at docs/specs/00_engineering_standards.md:308 supersedes §12.3 and §12.5 for the front end and says "This note rules nothing on §12.7 (Sonner)". So §12.7 is live, not superseded; the lane was right not to flag it, and my first fix list was wrong to call it superseded. The corrected group 2 top three is §12.7, §1.2, §2.1 (the first three live none rows by rank: §12.5 and §12.3 at ranks 1 and 2 are flagged superseded and are not test targets). 1e332d979 makes exactly this: the operator cell reads "§12.7, §1.2, §2.1 (the first three live none rows by rank; §12.5 and §12.3, ranks 1-2, are flagged superseded in their own rows; §12.7 is live, not superseded)" and the §12.7 row reads "NOT superseded, live".

Nothing else changed: the diff of 1e332d979 holds only the two group 2 lines (operator cell, §12.7 row) and the group 3 rank renumbering; the diff of 7a60cc538 holds only the items in the table above plus the fe.36 observation text, which I had asked to keep as an observation.
