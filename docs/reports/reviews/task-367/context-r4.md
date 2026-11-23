# Review context for task-367 (no plan id) written 2026-11-23 by backlog-brief.mjs (round 4)

## Task
task-367 COMPLY.3 Gates for handbook rules no machine checks, the ones Increment 1·B code touches first
status: RUNNING · milestone: m-1 · assignee: @lane-BL-HB367 · labels: McFix, McFix Final

## Description
Operator 2026-11-20 (verbatim): "Add the tasks to incr 1b - the infa freeze needs to be lifted again - what is the point of building a mess - wasted effort." Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: compliance tooling tasks into 1·B". Scope now: from the task-365 coverage table and the grounded findings, one gate per rule that has no mechanical check and that 1·B code touches; candidates named by the orchestrator, UNVERIFIED until task-365 is grounded: (a) the Airtight purity and literal gates scan only scripts/lib/compute: route-side code that calls the engine core (src/lib/parcels/report-compute.ts) is scanned by none; (b) numbers written in mobile code (the 60 s wait) against EXTERNALIZED (Spec 132 core.8); (c) the Spec 90 section 5 never-do list has no check on mobile/; (d) the 8 McFrontend rules whose lock is OWED (Spec 136), those 1·B touches. Each gate: red first on a planted defect, both directions. Waits on: task-365 grounded; the operator confirms the gate list before the build.

Files: src/tests/surfaces/failure-state-declared.logic.test.ts, src/tests/surfaces/scope-fence.logic.test.ts, src/tests/surfaces/nav-tab-switch.logic.test.ts, src/tests/surfaces/handbook-rule-map.logic.test.ts, src/tests/surfaces/register-locks-resolve.infra.test.ts, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, scripts/surfaces/_schema/surface-rule-map.json, docs/reports/generated/rule-lists-by-kind.md, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-98-1.json

## Acceptance criteria
- #1 The gate list is confirmed by the operator before any gate is built
- #2 Each gate is shown red on a planted defect and green on the clean tree
- #3 The handbook no-check lists shrink by the rules gated, by their generators

## Implementation Plan
#### PLAN-367-v1

**Task:** task-367 COMPLY.3 (type build, milestone m-1, letter S). Scope: tests for the McFrontend handbook rules (Spec 136) that no machine checks. This is a clean start (RR-0386). **Plan seat:** Opus, read-only (RR-0385 item 1, MORNING-DECISIONS.md:1917). **Build seat:** Opus (RR-0385 items 1 and 8). **Head read:** wf2/board at b32ea9b4c (`git rev-parse HEAD` gives b32ea9b4cae9350c0b1e3fcad6b3a568f317c154, the same as origin/wf1/mb-rulings). **Commands run:** git reads, sed, grep, `node scripts/analysis/rule-lists.mjs resolve`, and small inline `node -e` scripts that only read (git ls-files, JSON.parse of descriptors, TypeScript AST walks). No test runner was run and nothing was written. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. **Estimate (a guess, not measured):** one Opus lane session, about 450 lines of test code, one records commit, one work commit and one closing commit.

#### 0. Facts verified

**The rulings this plan follows (verbatim):**
- RR-0385 item 6 (MD:1922): "My only direction is the task 367 the handbook rules are key."
- RR-0386 (MD:1929-1933): the handbook tests start clean. Branch wf1/inc1b-gates (a59c93ac4) and its worktree stay untouched. This plan does not read, reuse, land or edit that branch.
- RR-0388 (MD:1947): McFixReborn waits for the tests of 367, 441 and 442.
- RR-0392 (MD:1975): no new infrastructure. This plan opens no card.
- RR-0412 (MD:2098): 442 and 367 run once the push of b32ea9b4c lands.
- RR-0413 (MD:2108, decision-198), his words: "yes to both". A: FE-49, FE-51 and FE-54 flip from OWED to RULED in the commit that lands their three tests. B: he confirms the three rows fe.54, fe.49 and fe.51 as the list, so card acceptance #1 is met for this clean start. His words do not mention the two named tab-switch exceptions of fe.51 (section 11, Q-D).

**What already exists and is reused:**

1. **The source list.** docs/reports/reviews/task-440/RULE-CHECKS.md:23 counts 57 rules: 29 enforced, 8 partly, 20 none. The card's wait on task-365 is met: task-365 is BUILT (grounded close, 2026-11-23). This plan takes its rows from task-440 (DONE), the read-only look at the same rules that RR-0385 item 6 ordered (RULE-CHECKS.md:3), whose rank 1 row feeds this card (RULE-CHECKS.md:102). Its table is at :100-161. Today Spec 136 has 58 lines (`grep -c '^- \*\*fe\.'` gives 58) and 22 OWED (`grep -c 'Status: OWED'` gives 22). fe.58 came from task-446 (136:205-206). Its register row says "the lock is task-367's" (135_mcfrontend_decisions_register.md:80).

2. **The sibling tasks:**
 - task-441 built three source-scan tests (commit 8cf51f3cc).
 - Lessons from 441:
   - A planted file under src/components/ tripped `.husky/pre-commit:38` (generate-surface-registry --check), because the generator walks the .tsx files on disk (task-441 notes :316).
   - The runner prints each failure twice, so an acceptance grep must not expect exactly 1 (task-441 notes :322).
   - Run typecheck and lint once before the red attempt (task-441 plan 3.4).
 - task-442 takes fe.05, fe.18 and fe.27 (task-442 plan §2 table). It leaves every OWED row to task-367: "OWED, lock path reserved: task-367" (its §2, ranks 1-7 and fe.39), and "fe.58 … its lock is task-367's".

3. **How a handbook rule names its lock:**
 - A Spec 135 row's last cell holds its status and lock (135:12-15).
 - Rule 3 (135:13): "A ruled row whose lock is not built reads `OWED` with the lock path."
 - Rule 5 (135:15): an OWED lock path is a reserved `src/tests/surfaces/*.test.ts` that does not exist yet.
 - Spec 136 and the rule map are generated: `node scripts/surfaces/generate-surface-handbook.mjs --write|--check` (136:9, :26).
 - register-locks-resolve.infra.test.ts:45-79 (the check is :76) fails an OWED row whose lock already exists, unless the id is on FLIP_PENDING (:30, today `['FE-39']`).
 - Flip precedent: a landed lock waits "until the operator approves the flip" (register-locks-resolve.infra.test.ts:21-29, MF-37 and FE-39).

4. **A hidden lock this plan must edit:** src/tests/surfaces/handbook-rule-map.logic.test.ts.
 - :258 lists the 13 RR-0384 lock paths, including scope-fence, nav-tab-switch and failure-state-declared.
 - :273 asserts each row is OWED.
 - :274 asserts `fs.existsSync(lock)` is false.
 - :281 asserts `owed >= 21`.
 - :283 asserts each Spec 136 line reads `Status: OWED · lock owed:`.
 - Landing any of these locks turns this test red unless it is edited in the same commit.

5. **task-434** (merged into 367, card :43 and 367 notes :69). It adds:
 - The batch model: "build the owed locks a few at a time … each batch its own plan" (task-434:23).
 - Ownership: rows FE-45..FE-57 say "the lock is task-434's" (135:67-79), and FE-58 says task-367's (135:80).
 - It adds no rule and no file beyond this card.

6. **The old plan** (gates A, B, C on wf1/inc1b-gates) is parked: RR-0386 keeps the branch untouched and names gates A and B for a later card; gate C (mobile-never-do) sits on the same branch, and the card's candidates (a) to (c), the 2026-11-20 report-only proof and its must-fix notes move with it, because RR-0385 item 5 withdraws unbuilt gate cards and item 6 makes the handbook rules this card's direction. Not used here.

#### 1. Scope

**In:**
- Three new locks at their reserved paths, each proven red through the real hooks, then green.
- The three register rows read RULED in the commit that lands their tests (RR-0413 A; FE-51 only with Q-D yes), and their generators are rerun.
- Edits to handbook-rule-map.logic.test.ts to match.
- The MF queue row, prereg and panel record.
- Records under docs/reports/reviews/task-367/.

**Out:**
- Any change to app code, descriptors, mobile code or the gate scripts.
- Any fix of a live break.
- Any other OWED row.
- wf1/inc1b-gates.
- Any new tool, hook or card.

#### 2. Row choice (A)

**Key, in order:**
1. A static test over files that exist today.
2. The card's own title and description: "the ones Increment 1·B code touches first" (task-367:4-5, :26 item d).
3. The look's rank.

Increment 1·B code is the parcel search and lot pages (milestone m-1 deliverable; descriptors with programme.scope parcel_product). Three tests, the size of 441 and 442.

**The 20 rows with no test:**

| Rank | Row | Can a static test read it today? | Code in 1·B? | Taken by 441, 442 or a lock? | Decision and owner |
|---|---|---|---|---|---|
| 1 | fe.54 | Yes: descriptors' `states` and `errors` | Yes (mobile_parcel_search and others) | No | **TAKEN (T1)** |
| 2 | fe.45 | No: "computed client-side" is a reading of code; the arithmetic half is FE-05 (442) | Yes | 442 takes fe.05 | Later batch of 367 |
| 3 | fe.46 | Partly: a Mantine 8.3.18 version pin (package.json) | No | No | Later batch |
| 4 | fe.47 | Two homes read two ways: descriptor `config.debounce_ms` against "registered logic variable" (135:69 note) | Yes | No | Later batch |
| 5 | fe.48 | Weak proxy only (file names) | No | No | Later batch |
| 6 | fe.49 | Yes: declared MaxBLD files and descriptor tables | Yes | Mobile jest checks 3 files only | **TAKEN (T2)** |
| 7 | fe.50 | Yes, 0 Stripe Elements hits today | No (checkout) | No | Later batch |
| 8 | fe.51 | Yes: router.push of a shelf tab route | Yes (parcel shelf) | FE-36 lock does not check it (126:82 "convention, not checked by the lock") | **TAKEN (T3)** |
| 9 | fe.52 | Needs the DB (usage_events CHECK) | n/a | No | Later batch (station) |
| 10 | fe.53 | Yes, a heading check, but it touches docs only | No | No | Later batch |
| 11 | fe.55 | Judgement | No | No | Later batch |
| 12 | fe.56 | Meta (red evidence per lock) | No | No | Later batch |
| 13 | fe.57 | Partly; 44 px is already under FE-31 | No | FE-31 partly | Later batch |
| 14 | fe.04 | No ruled number ("measured first, then ruled", 136:43) | n/a | No | Waits for a ruling |
| 15 | fe.12 | Vacuous or red: admin_market_metrics is REPORT and not converted (estate_other) | No | No | Its conversion row |
| 16 | fe.17 | variants[] not built (report-page.json has none) | No | No | Later batch |
| 17 | fe.21 | Vacuous: no embed declared | No | No | Later batch |
| 18, 19 | fe.25, fe.26 | `.db.test.ts`; a lane may not connect to a DB | n/a | No | Later batch (station) |
| 20 | fe.44 | Not built (135:66); typed factor at parcelCostFormat.ts:11 | Partly | task-411 deletes the phone factor copies | Later batch, after 411 |

**The 8 partly rows:**

| Row | Reason not taken | Owner |
|---|---|---|
| fe.39 | Lock tracked, on FLIP_PENDING, waits for its operator flip | FE-39 row |
| fe.05 | Taken elsewhere | 442 |
| fe.15 | Canaries e and f | FE-25 and FE-26 rows |
| fe.19 | Confidence clause is a grounder judgement; db | Later batch |
| fe.33 | Mobile half runs in mobile jest | MF-25 |
| fe.36 | Five named exceptions | MF-49 and MF-50 |
| fe.38 | Screen half runs in mobile jest | Later batch |
| fe.40 | Runs against a local stack | Station |

fe.58 (pending, unranked) is clean today: no `use server`, `use client` or `next/` import in mobile, and no mobile descriptor with state.answer `server_only`. Next batch.

**Rule texts as verified today:**
- fe.54, 136:193: "A visible state for every failure. "a surface declares what the user sees when it fails" and "An unhandled state is a FAIL, not a blank screen." (Spec 128 Rule 12, 128:39)." Lock owed at 136:194. Row 135:76.
- fe.49, 136:178: "The scope fence. "Spec 100 stays fenced. No linkage to LeadDetail, the flight board, or the lead feed. lead_parcels is read by no surface." (128:205, R-03)." Lock owed at 136:179. Row 135:71.
- fe.51, 136:184: "Navigation extras that FE-36 does not state. "A tab switch uses navigate, not push." (126:82, §0b item 11). … PROSE-ONLY until the lock below exists." Lock owed at 136:185. Row 135:73.

**Overlap check:**
- 442's rows are fe.05, fe.18, fe.27 (and fe.24 and fe.29 in its Rule trailer). None are T1-T3.
- 441's rows are §12.7, §1.2, §2.3. None are handbook rows.
- Existing locks:
- fe.51 is outside FE-36 (126:82).
- fe.49 extends mobile/__tests__/parcelScreens.golden.test.ts:217-220 (3 files, lead hooks, mobile jest only, not the root suite). It is not parcel-tool-fence.infra.test.ts, which locks the subscription gate (its :1-3).
- fe.54: the schema requires an `errors` answer (surface.schema.json:24, :2081-2090) but allows `none` and does not tie it to a contract read. No test checks it: a grep of the three surface scripts and src/tests found nothing.

#### 3. The tests

**Common to all three:**
- Path: the reserved lock path. The register reserves the exact name (135:15; OWED_LOCK_RE at register-locks-resolve.infra.test.ts:19).
- First line: `// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-nn (Spec 136 §fe.nn)` (CLAUDE.md directive 3; the form of register-locks-resolve.infra.test.ts:1).
- No DB, no network.
- Files are listed with `git ls-files`.
- The scope list comes from scripts/surfaces/_schema/converted-surfaces.json `scope.programme_scopes`, which is `["parcel_product","parcel_admin"]` with `expected_count` 33. This reuses the manifest; it is not a new list.
- One pure finder is exported per test.
- Each test has KNOWN_BAD cases in memory, controls, and a printed scanned count (the 441 form).

#### T1 fe.54: src/tests/surfaces/failure-state-declared.logic.test.ts

- **Reads:** every tracked `scripts/surfaces/**/surfaces/*.descriptor.json` with kind SURFACE and programme.scope in scope.
- **Finder:** a descriptor with `inputs.answer === 'contract'` fails when `states[]` has no `error` entry, or when `errors.answer` is `none` or `UNRESEARCHED`.
- **Assertions:**
- (A) `expect(problems).toEqual([])` first, then the scanned SURFACE count equals `scope.expected_count` (the problems assertion runs first, so the plant's red names the descriptor, not the count).
- (B) In memory: a copy of mobile_parcel_search without its error state gives 1 problem; a copy with errors.answer `none` gives 1; `UNRESEARCHED` gives 1.
- (C) Controls give 0: a STATIC descriptor with inputs `none`, and an estate_other descriptor with no error state.
- **Today:** 33 in scope, 25 read a contract, 0 problems. 8 problems lie outside scope (estate_other and platform_shared) and are not judged.
- **Plant:** a temporary line in (A) pushes the (B) copy into the scanned list. It turns (A) red with "mobile_parcel_search: reads a contract but declares no error state". The line is deleted before the green commit. No file on disk changes, so no generator hook can trip.
- **Limit (stated in the header):** it checks declarations only. The known break at mobile/src/lib/maxbldHelp.ts:19 (RULE-CHECKS.md:102: a failed Help open is only logged) is code and is not caught.

#### T2 fe.49: src/tests/surfaces/scope-fence.logic.test.ts

- **Reads:**
- The tracked .ts and .tsx files named by in-scope descriptors (`identity.route` plus `x-draft.files`): 41 today (31 parcel_product, 10 parcel_admin).
- The `inputs`, `outputs` and `evidence` table refs of the 45 in-scope descriptors.
- **AST finder:**
- (1) a string or template text containing `lead_parcels` in any letter case (SQL folds case), or an identifier containing it;
- (2) an import or export specifier naming a lead screen (`LeadDetail`, `lead-detail`, `FlightBoard`, `flight-board`, `LeadFeed`, `lead-feed`, `useLeadFeed`, `useFlightBoard`, `useLeadDetail`, `[lead]`, `[flight-job]`);
- (3) a route string starting `/api/leads`, `/(app)/[lead]`, `/(app)/[flight-job]`, `/(app)/flight-board` or `/(app)/map`;
- (4) a descriptor table ref `lead_parcels`.
- **Not banned:** `@/features/leads/api/envelope` and `error-mapping`. These are shared API helpers used by the three parcel routes (src/app/api/parcels/lookup/route.ts:40, :48; entitlement/route.ts:19-20; lot-size/route.ts:25-26). They are not lead screens.
- **Assertions:**
- (A) hits are `[]`, files ≥ 41, descriptors ≥ 45, mobile files ≥ 20 (today's counts, printed; a drop is a red, a rise needs no edit).
- (B) KNOWN_BAD gives one hit each: `import { useLeadFeed } from '@/hooks/useLeadFeed'`, `pool.query('SELECT * FROM lead_parcels')`, `pool.query('SELECT * FROM LEAD_PARCELS')`, `router.push('/(app)/[lead]?id=1')`, `fetch('/api/leads/feed')`, and a descriptor copy with `{table:'lead_parcels'}`.
- (C) Controls give 0: `// lead_parcels`, the envelope import, `'/(app)/parcel-tool'`.
- **Today:** 41 files with 0 hits; 45 descriptors with 0 hits. The only lead text in these files is a comment, at mobile/src/hooks/useTrackedLots.ts:22, which the AST skips.
- **Plant:** a temporary line in (A) adds a virtual file with the useLeadFeed import. (A) fails naming it.
- **Limit:** declared files only, no import hop. I measured one hop: 64 more files and false hits in shared mobile/src/lib/schemas.ts and authStore.ts.

#### T3 fe.51: src/tests/surfaces/nav-tab-switch.logic.test.ts

- **Reads:**
- The mobile files among T2's set: 20 today.
- The tab routes, parsed by AST from `PARCEL_TAB_ROUTE` (mobile/src/lib/parcelSearchMatch.ts:252-256), not copied; the parse is fail-closed: it must find exactly 3 routes (lookup, tracked, account) or the test fails, so a renamed or reshaped constant cannot leave (A) passing on an empty map.
- **Finder:** a call `<router>.push(arg)` where arg is `PARCEL_TAB_ROUTE[...]` or `PARCEL_TAB_ROUTE.x`, or a literal equal to a tab route.
- **Fail-closed list** in the nav-by-route form (nav-by-route.logic.test.ts:13-16, :361, :386). A stale entry fails, and the list only shrinks.
- `mobile/app/(app)/parcel-tool/_layout.tsx` `router.push(PARCEL_TAB_ROUTE[tab])`, count 1, why "owed: MF-49/MF-50 (NAV-AUDIT #1, 126:82)".
- `mobile/app/(app)/parcel-tool/tracked.tsx` `router.push(PARCEL_TAB_ROUTE.account)`, count 1, why "owed: MF-51/MF-52 (NAV-AUDIT #12, 126:82)".
- The owners already exist and are LATER rows (.cursor/MCFRONTEND-QUEUE.md:353, :376, :382, :394), so no card is needed.
- **Cases:**
- (A) every hit is explained by an entry, and each entry matches exactly.
- (B) KNOWN_BAD: `router.push(PARCEL_TAB_ROUTE.tracked)` and `router.push('/(app)/parcel-tool/account')` give 1 each.
- (C) Controls give 0: `router.navigate(PARCEL_TAB_ROUTE.tracked)`, `router.replace(PARCEL_TAB_ROUTE.lookup)`, `router.push(trackedLotRoute(id))`.
- **Today:** 2 hits, both owned. Audit #6 (index.tsx) is already fixed.
- **Red on the real tree:** the red attempt stages T3 with an empty list. (A) fails naming _layout.tsx:48 and tracked.tsx:99. Then the two entries are added.
- **Limits:**
- A route held in a variable is missed.
- The lead-gen five-tab bar is not MaxBLD.
- Web has no tab bar: a grep for Tabs in src/app/(maxbld), src/components/surfaces and src/components/report finds 0.

#### The red attempt (through the real hooks)

1. Stage the three tests (with T1's and T2's plant lines, and T3's empty list) and the task file. Typecheck and lint were run once beforehand. Before the red run and before the work commit the lane writes a 5 to 10 item PASS/FAIL self-skeptical checklist from Spec 135 rules 3 and 5 and Spec 136 section 2 and walks it against the actual diff (00_engineering_standards.md:288).
2. The related run (.husky/pre-commit:56, :85) refuses: 3 test files failed at the designed (A) assertions.
3. The output is saved to docs/reports/reviews/task-367/red.out. That folder is always allowed (check-task-files.mjs:10).
4. A refusal at any other stage is a test defect and is fixed first.

#### 4. Live breaks (named, not fixed)

- fe.51: 2 tab pushes, owned by MF-49/MF-50 and MF-51/MF-52 (126:82).
- fe.54: maxbldHelp.ts:19 is code, out of the declaration test.
- Out of scope and only noted: 8 contract-reading descriptors in estate_other and platform_shared have no error state.

#### 5. Files (C)

Files: src/tests/surfaces/failure-state-declared.logic.test.ts, src/tests/surfaces/scope-fence.logic.test.ts, src/tests/surfaces/nav-tab-switch.logic.test.ts, src/tests/surfaces/handbook-rule-map.logic.test.ts, src/tests/surfaces/register-locks-resolve.infra.test.ts, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, scripts/surfaces/_schema/surface-rule-map.json, docs/reports/generated/rule-lists-by-kind.md, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-98-1.json

**Rule lists.** `node scripts/analysis/rule-lists.mjs resolve --files "<the line above, minus the rule-lists page>" --type build --letter S` gives 15 lists, exempt [], unmatched [] (the whole Files line with the page resolves 16, see below): surface-136, eng-all, agents-s7-s11, queue-137, surface-126, surface-127, surface-128, surface-135, bylaw-133, agents-s5-1to3, orchestrator-doc17, five-words, plan-protocol, inc-S, ms-S. The whole Files line, with the rule-lists page, resolves 16 lists: these 15 plus policy-124-s2-s5 (the page entry matches the generated-reports row of scripts/analysis/rule-lists.json). The output review and the close need one compliance output per list for 15 lists and the engineering output for eng-all. 442's set is the same 15 unless its Files line also names the page.

**Measured refusals and why two files are in the line:**
- Adding `docs/reports/red-evidence/MF-98/` is refused ("matched by no row"). So the red evidence goes to the review folder, and no OWED id is cited in a message (see section 6).
- Adding the two mobile files of a fix would add 5 mobile lists. Not needed, because T3 uses owned exceptions.
- The rule-lists page is in the line because it records the Spec 136 section 2 size (rule-lists-by-kind.md:33, 29,076 characters), and `rule-lists.mjs page --check` runs at pre-commit (:44).

**Protected paths and the McFrontend queue:**
- Protected (mcbylaws/protected-paths.json): Spec 135 (:68), the queue (:70), docs/reports/panels/** (:55), and coa-expected/** (:38).
- McFrontend frontend paths: src/tests/surfaces/** (:23) and scripts/surfaces/** (:21).
- **Yes, an MF queue row is needed:** "A task not listed here is not done" (.cursor/MCFRONTEND-QUEUE.md:5; Spec 137 table :41). The commit-msg arm C needs a `McFrontend-Task:` trailer and a prereg with rules (cite-arms.mjs:145-150).
- Next free ids (not claimed): the ledger held MF-96 and round-201 at the plan read; BL-FEDB442 (task-442) has since claimed MF-97 and round-202 (`ls ~/Buildo-scratch/ids`), so MF-98 and round-203 stand. So task-367 plans **MF-98** and **round-203**. The orchestrator claims the ids at launch, one past the highest claim in ~/Buildo-scratch/ids (its README: highest existing claim + 1 is next free; MCINC-8, 08_agents.md:526): if 367 launches first it takes MF-97 and round-202, and the orchestrator renames MF-98 to MF-97 in this plan and in the prereg file name on the Files line before launch (the Plan hash is then grounded again) while 442 takes MF-98 and round-203; if 442 claims first, MF-98 and round-203 stand. Arm Q refuses a heading at or above the Next free id (mcbylaws-queue-check.mjs:308), so commit 0 sets the line one past the id it takes.

#### 6. Commits (D), in order, following the six steps (08_agents.md:515-525)

**Commit 0 (records, alone and first):**
- Contents: the MF-98 row in Phase 2 ("FE rows owned: FE-49, FE-54." at commit 0, in the MF-96 row form at queue :654-657; the commit that flips FE-51 adds it, because arm Q refuses a DONE row that owns an OWED row, mcbylaws-queue-check.mjs:178-215); the next-free line moves to MF-99 by dated note; prereg-MF-98-1.json (round 203, totals copied from the newest prereg); docs/reports/panels/MF-98.json (the MF-96.json form); the task file.
- Prereg `rules`: RULED ids only, FE-09, FE-10, FE-16 and FE-36 (the MF-96 form: "The new row is OWED and is never cited").
- Subject: `docs(135_mcfrontend_decisions_register): MF-98 queue row, prereg and panel record`.
- Trailers: `Task: task-367`, `McFrontend-Task: MF-98`, `Operator-Ruling: RR-0385 …, RR-0386 …`, `Spec-diff: queue row and records only, no spec rule text moves` (precedent 0ae43e69c).
- **Two-step fold:** commit 0 holds protected paths, so the orchestrator folds it first. The work commit is its child, because the gate reads the prereg from the parent tree.

**Red attempt:** section 3 (not a commit).

**Commit 1 (work):**
- The three tests, with plant lines removed and T3's two entries in.
- Spec 135 cells FE-49, FE-51, FE-54 change to `RULED 2026-11-23 (RR-0413), lock lands with the MF-98 work commit. Lock: \`<path>\``, each with a dated note in the Spec 135 rule 3 form (the FE-09 and FE-37 flips, 135:31 and :59): Dated note 2026-11-23 (M-246, prior text kept; MF-98 · McFrontend queue · lane BL-HB367, task-367; RR-0413, operator, verbatim: "yes to both"; Spec 135 rule 3), the row reads RULED 2026-11-23; prior status OWED (the cell read as before; RR-0384 added the row on 2026-11-22). Each note also says the lock landed under task-367, into which task-434 was merged (RR-0385 item 6), so "the lock is task-434's" is prior text. FE-51: the PROSE-ONLY words in the rule cell are prior text, the lock now checks the tab-push half. FE-49: the platform_shared standing exception is outside the lock (the fence is converted-surfaces.json programme_scopes; the one mention is a notes string at scripts/surfaces/platform_shared/F16/contracts/contract_admin_pipeline_step_output.descriptor.json:410, not a table ref, scope key at :433), so it stays out of T2 with the FE-49 note as its record and a widening of T2 to platform_shared is a later batch row of this card. FE-54: the lock is declaration-only for contract readers in programme scope and the error state only; 8 contract-reading descriptors outside scope (6 estate_other, 2 platform_shared) are not judged; the live break mobile/src/lib/maxbldHelp.ts:19 (a failed Help open is only logged) is owned by the task-343 leftovers (item 1, a Help sheet that fails to open). The notes must not hold the words Current reading: (the strict form of generate-surface-handbook.mjs:72). FE-51 flips only with Q-D yes; then its dated note also quotes the operator's Q-D answer verbatim with its RR id, and the same commit sets the MF-98 row to `FE rows owned: FE-49, FE-51, FE-54.`
- handbook-rule-map.logic.test.ts: a named list `BUILT_BY_367 = ['failure-state-declared','scope-fence','nav-tab-switch']`.
- :273 and :274: rows on that list have their lock tracked and read RULED, or read OWED and are on FLIP_PENDING (FE-51 if Q-D is not yes).
- :281: the floor becomes 21 minus the rows of that list that read RULED (18 when all three flip).
- :283: RULED rows read `Status: RULED … · Enforced by: <path>`; an OWED row keeps its `Status: OWED · lock owed:` line.
- Generators: `generate-surface-handbook.mjs --write`, then `--check`; `rule-lists.mjs page --write`, then `--check`.
- The task file (plan and notes text only; its status moves in the close commit, Spec 137 rule 3 note of 2026-11-20) and the queue row status (137:98, Rule 3).
- No FE-nn id is written in the message. Use fe.49, fe.51, fe.54, which FE_ID_RE (cite-parse.mjs:31) does not match.
- Subject: `test(135_mcfrontend_decisions_register): task-367 locks for fe.54, fe.49 and fe.51, each proven red; three rows read RULED` (if Q-D is not yes the tail reads `two rows read RULED, FE-51 waits`).
- **If Q-D is not yes:** FE-51 stays OWED: commit 1 adds 'FE-51' to FLIP_PENDING (register-locks-resolve.infra.test.ts:30, the FE-39 form), its Spec 135 cell and Spec 136 line are untouched, and the MF-98 row keeps FE-51 out of its FE rows owned (mcbylaws-queue-check.mjs:178-215). Acceptance #3 then reads 20, not 19.

**Output review:** DeepSeek runs, on the output, the lens set that rule-lists.mjs lensSet gives for this Files line (code-review, ux, error-paths, security), the compliance lens once per list (the 15 compliance lists: out-compliance-<list id>.txt) and the engineering lens (eng-all: out-engineering-eng-all.txt) (RR-0385 item 2); then a separate grounder runs BEFORE any fold. Two rounds at most (RR-0385 item 3). Fixes are new commits with the same trailers; after each fix commit every lens input is re-made with rule-lists.mjs lens-input and every output re-run under the same names (08_agents.md section 7, task-399 note of 2026-11-20).

**Close commit (records only):** red.out in docs/reports/reviews/task-367/, and the lane report copy docs/reports/lanes/<date>/<lane>/ with REPORT.md, GROUNDER.md, the out- lens outputs and TRIAGE.md (one outcome line per CONFIRMED id; check-task-files always allows both paths, so they are not new Files entries). The same commit sets the task file BUILT, not DONE, until the push suite has run, with the evidence (sha, test names, hook result), adds the refs (backlog task edit task-367 --add-ref for REPORT.md, GROUNDER.md and TRIAGE.md), appends the Final Summary round line and one line per CRITICAL, HIGH or MED outcome (check-lane-close.mjs outcomeErrors), and sets the expires date (close date plus 7 days). The lane never pushes.

#### 7. Landing order (E)

- **442:** both commit 0s edit .cursor/MCFRONTEND-QUEUE.md line 5 (the next-free id), so this is a textual conflict. 442's MF-97 folds first. Whichever lands second rewrites the line by dated note (the 135:17 precedent) to one past the larger of the two ids. No other shared file: 442's panel and prereg are different files.
- **383 (wf1/inc1b-thinroute, 5a0d52644):** touches contract_parcels_lookup.descriptor.json, which T2 reads. Its version holds 0 `lead_parcels` (`git show … | grep -c` gives 0). No conflict.
- **411 (wf1/inc1b-areafactor, f00af29ed):** touches an estate_other descriptor only, which is out of scope.
- **388 (wf1/inc1b-mfrules, e467590a6, RUNNING):** edits Spec 135, Spec 136, the queue and the rule map. Textual conflicts are expected; the second lander regenerates. Its rows are renumbered after FE-58 (135:17), so FE-49, FE-51 and FE-54 do not move.
- **McFixReborn:** its group file list was not found (UNVERIFIED). A fix to _layout.tsx:48 or tracked.tsx:99 makes T3's entry stale. The fixer removes the entry in the same commit, because the list only shrinks.

#### 8. Acceptance (F)

1. Lane: `git ls-files src/tests/surfaces | grep -cE '(failure-state-declared|scope-fence|nav-tab-switch)\.logic\.test\.ts$'` prints 3.
2. Lane: docs/reports/reviews/task-367/red.out shows the related run with "Test Files 3 failed (3)". It holds at least one line each of: "mobile_parcel_search: reads a contract but declares no error state", "useLeadFeed", "_layout.tsx" and "tracked.tsx". Counts are at least 1, because each failure prints twice. No typecheck or lint line is the cause.
3. Lane: `grep -c 'Status: OWED' docs/specs/02-web-admin/136_mcfrontend_handbook.md` prints 19 (20 if Q-D is not yes). `node scripts/surfaces/generate-surface-handbook.mjs --check` and `node scripts/analysis/rule-lists.mjs page --check` both exit 0.
4. Lane: `git log -1 --format=%B <work>` holds `Task: task-367` and `McFrontend-Task: MF-98`, and `grep -cE '\bFE-[0-9]+\b'` on it prints 0.
5. Lane: `git diff --stat <launch>..HEAD -- mobile src/app src/lib src/components scripts/surfaces ':(exclude)scripts/surfaces/_schema/surface-rule-map.json'` prints nothing (Spec 126 section 14 keeps descriptors out of this work).
6. Lane: `head -1` of each new test starts with `// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md`.
7. Orchestrator: the pre-push list (.husky/pre-push-checks.sh) passes, including handbook-rule-map, register-locks-resolve and the three locks. Lanes run no full suite. The lane's own green is the related run of commit 1 (.husky/pre-commit:56, :85), which runs the staged tests on the clean tree and passes; REPORT.md records it.

**Old acceptance criteria under the clean start (meaning only, not changed):**
- #1 "gate list confirmed by the operator": is met for this clean start by RR-0413 B: he confirms the three rows.
- #2 "red on a planted defect and green on the clean tree": unchanged; it is acceptance item 2.
- #3 "no-check lists shrink … by their generators": acceptance item 3; RR-0413 A allows the flip (FE-51 with Q-D).

#### 9. Risks and rollback (G)

- Another lane adds a tab push or a lead import: red at the push suite. That is the rule working.
- If `x-draft.files` is dropped by a later conversion, the file set shrinks. The floors catch it.
- The 442 and 388 conflicts are textual only.
- Rollback: `git revert` commit 1, then commit 0. No runtime code changes.

#### 10. Questions for the plan grounder (H), answered in docs/reports/reviews/task-367/QUESTIONS-RULED.md (G1 yes; G2 surface-rule-map.json changes, 00_system_map.md does not; G3 yes; G4 keep; G5 yes; G6 no other lock)

- G1. Does `gate.mjs --staged` (pre-commit:19, holdForCommit) pass staged `src/tests/surfaces/*.ts` before the commit-msg trailers are read? 442 is the precedent, but it is UNVERIFIED.
- G2. Does the flip leave surface-rule-map.json and docs/specs/00-architecture/00_system_map.md unchanged? The system map row for 135 already lists the three paths (00_system_map.md:100). If the map does change, it must be added to the Files line, which would add policy-124-s2-s5, a list the rule-lists page entry already attaches (16 lists, section 5).
- G3. Does arm C pass a work commit that cites no FE id with RULED-only prereg rules, as with MF-96 (2905df62d)?
- G4. Is `identity.route` plus `x-draft.files` the right MaxBLD file set, or should it be the Spec 126 §11b.3 page set?
- G5. Is T1's reading of 128:39 right: a contract reader must declare an `error` state and a non-`none` errors answer?
- G6. Does any other text lock (for example rules-acc-notes.logic.test.ts) pin the FE-49, FE-51 or FE-54 cells?

#### 11. Questions for the operator (H)

- OQ1 ANSWERED (RR-0413 A, MD:2108, his words "yes to both"): FE-49, FE-51 and FE-54 flip from OWED to RULED in the commit that lands their three tests, the untested list dropping from 22 to 19.
- OQ2 ANSWERED (RR-0413 B): he confirms the three rows fe.54, fe.49 and fe.51 as the list; card acceptance #1 is met for this clean start.
- Q-D (open, one question): May FE-51 read RULED while its lock carries two named, owned tab-push exceptions (MF-49/MF-50 and MF-51/MF-52), as FE-36 did with its six named exceptions (FE-36 row; nav-by-route.logic.test.ts:5-7), y or n? If n or unanswered at build time, the nav-tab-switch test still lands, FE-51 is added to FLIP_PENDING and stays OWED until he says, and FE-49 and FE-54 flip as planned.

Plan review round 1: 73 folded, 0 task, 46 ruling, 0 wontfix, 22 pile; grounder docs/reports/reviews/task-367/GROUNDER-PLAN.md; triage docs/reports/reviews/task-367/TRIAGE-PLAN.md
plan-compliance-agents-s5-1to3#1 MED ruling RR-0413
plan-compliance-agents-s5-1to3#2 MED folded task-365 is BUILT (g
plan-compliance-agents-s5-1to3#3 MED ruling RR-0413
plan-compliance-agents-s5-1to3#4 MED folded appends the Final Su
plan-compliance-agents-s5-1to3#6 MED folded Can a static test re
plan-compliance-agents-s7-s11#1 MED ruling RR-0413
plan-compliance-agents-s7-s11#3 MED folded RULED 2026-11-23 (RR
plan-compliance-agents-s7-s11#4 MED ruling RR-0413
plan-compliance-agents-s7-s11#5 MED folded appends the Final Su
plan-compliance-agents-s7-s11#7 MED folded task-365 is BUILT (g
plan-compliance-bylaw-133-p1#1 MED ruling RR-0413
plan-compliance-bylaw-133-p1#2 MED folded task-365 is BUILT (g
plan-compliance-bylaw-133-p1#4 MED ruling RR-0413
plan-compliance-bylaw-133-p1#5 MED folded The lane's own green
plan-compliance-bylaw-133-p1#6 MED folded RULED 2026-11-23 (RR
plan-compliance-bylaw-133-p2#1 MED ruling RR-0413
plan-compliance-bylaw-133-p2#2 MED folded task-365 is BUILT (g
plan-compliance-bylaw-133-p2#3 MED ruling RR-0413
plan-compliance-bylaw-133-p2#4 MED folded gate C (mobile-never
plan-compliance-bylaw-133-p2#5 MED folded the live break mobil
plan-compliance-bylaw-133-p3#1 MED ruling RR-0413
plan-compliance-bylaw-133-p3#2 MED ruling RR-0413
plan-compliance-bylaw-133-p3#4 MED folded task-365 is BUILT (g
plan-compliance-five-words#1 MED ruling RR-0413
plan-compliance-five-words#2 MED folded task-365 is BUILT (g
plan-compliance-five-words#3 MED ruling RR-0413
plan-compliance-five-words#6 MED folded The lane's own green
plan-compliance-inc-S#1 MED ruling RR-0413
plan-compliance-inc-S#2 MED folded task-365 is BUILT (g
plan-compliance-inc-S#3 MED ruling RR-0413
plan-compliance-inc-S#4 MED folded gate C (mobile-never
plan-compliance-ms-S#2 MED ruling RR-0413
plan-compliance-ms-S#3 MED ruling RR-0413
plan-compliance-ms-S#5 MED folded task-365 is BUILT (g
plan-compliance-orchestrator-doc17#1 MED ruling RR-0413
plan-compliance-orchestrator-doc17#2 MED folded task-365 is BUILT (g
plan-compliance-orchestrator-doc17#3 MED ruling RR-0413
plan-compliance-orchestrator-doc17#7 MED folded the live break mobil
plan-compliance-plan-protocol#1 MED ruling RR-0413
plan-compliance-plan-protocol#2 MED folded task-365 is BUILT (g
plan-compliance-plan-protocol#4 MED folded gate C (mobile-never
plan-compliance-policy-124-s2-s5-p1#1 MED ruling RR-0413
plan-compliance-policy-124-s2-s5-p1#2 MED ruling RR-0413
plan-compliance-policy-124-s2-s5-p2#1 MED ruling RR-0413
plan-compliance-policy-124-s2-s5-p2#2 MED folded task-365 is BUILT (g
plan-compliance-policy-124-s2-s5-p2#3 MED ruling RR-0413
plan-compliance-queue-137#1 MED ruling RR-0413
plan-compliance-queue-137#2 MED folded appends the Final Su
plan-compliance-queue-137#3 MED folded appends the Final Su
plan-compliance-queue-137#4 MED folded RULED 2026-11-23 (RR
plan-compliance-surface-126-p1#2 MED ruling RR-0413
plan-compliance-surface-126-p1#3 MED folded the live break mobil
plan-compliance-surface-126-p1#5 MED folded task-365 is BUILT (g
plan-compliance-surface-126-p1#6 MED ruling RR-0413
plan-compliance-surface-126-p2#1 MED ruling RR-0413
plan-compliance-surface-126-p2#4 MED ruling RR-0413
plan-compliance-surface-126-p2#5 MED folded the live break mobil
plan-compliance-surface-126-p3#1 MED ruling RR-0413
plan-compliance-surface-126-p3#2 MED folded task-365 is BUILT (g
plan-compliance-surface-126-p3#4 MED folded RULED 2026-11-23 (RR
plan-compliance-surface-126-p3#6 MED folded the live break mobil
plan-compliance-surface-126-p4#1 MED ruling RR-0413
plan-compliance-surface-126-p4#2 MED ruling RR-0413
plan-compliance-surface-126-p4#3 MED folded task-365 is BUILT (g
plan-compliance-surface-126-p4#4 MED folded the live break mobil
plan-compliance-surface-126-p5#1 MED ruling RR-0413
plan-compliance-surface-126-p5#2 MED folded task-365 is BUILT (g
plan-compliance-surface-126-p5#4 MED ruling RR-0413
plan-compliance-surface-126-p5#5 MED folded RULED 2026-11-23 (RR
plan-compliance-surface-126-p5#6 MED folded :(exclude)scripts/su
plan-compliance-surface-127#1 MED ruling RR-0413
plan-compliance-surface-127#3 MED folded task-365 is BUILT (g
plan-compliance-surface-127#4 MED ruling RR-0413
plan-compliance-surface-127#7 MED folded the live break mobil
plan-compliance-surface-128#1 MED ruling RR-0413
plan-compliance-surface-128#2 MED folded task-365 is BUILT (g
plan-compliance-surface-128#4 MED ruling RR-0413
plan-compliance-surface-128#5 MED folded RULED 2026-11-23 (RR
plan-compliance-surface-128#6 MED folded the live break mobil
plan-compliance-surface-135-p1#1 MED ruling RR-0413
plan-compliance-surface-135-p1#3 MED folded task-365 is BUILT (g
plan-compliance-surface-135-p1#4 MED ruling RR-0413
plan-compliance-surface-135-p2#1 MED ruling RR-0413
plan-compliance-surface-135-p2#2 MED folded task-365 is BUILT (g
plan-compliance-surface-135-p2#4 MED ruling RR-0413
plan-compliance-surface-135-p2#7 MED folded the live break mobil
plan-compliance-surface-135-p3#2 MED folded the live break mobil
plan-compliance-surface-135-p3#4 MED folded the live break mobil
plan-compliance-surface-135-p3#5 MED ruling RR-0413
plan-compliance-surface-135-p3#6 MED ruling RR-0413
plan-compliance-surface-136#1 MED ruling RR-0413
plan-compliance-surface-136#2 MED folded task-365 is BUILT (g
plan-compliance-surface-136#3 MED ruling RR-0413
plan-compliance-surface-136#6 MED folded the live break mobil
plan-engineering-eng-all#3 MED folded PASS/FAIL self-skept
plan-error-paths#1 MED folded files ≥ 41, descript
plan-error-paths#2 MED folded it must find exactly
plan-error-paths#3 MED folded if 367 launches firs
plan-error-paths#4 MED folded the live break mobil
plan-error-paths#5 MED folded the problems asserti
plan-plan-review-deepseek#1 MED folded files ≥ 41, descript
plan-plan-review-deepseek#2 MED folded it must find exactly
plan-plan-review-deepseek#3 MED folded RULED 2026-11-23 (RR
plan-plan-review-deepseek#11 MED folded in any letter case (
plan-ux#1 MED folded the live break mobil
plan-ux#2 MED folded the live break mobil
plan-ux#3 MED folded the live break mobil
plan-ux#4 MED folded May FE-51 read RULED
in#1 MED folded with the rule-lists 
in#2 MED folded FE rows owned: FE-49
rg#1 MED folded the live break mobil
rg#2 MED folded May FE-51 read RULED

## Implementation Notes
2026-11-20 operator, verbatim: "I also what you to test the new gates as part of the Task 367 - small test and show me it works and what is catches.  ie the review you are running now will catch items - try the file with the gates and see the result.  Only do this if it doesnt take too much time. I want to know they work especially on the key items". Stage 1 is therefore a small report-only proof of three gates on the real pushed files; blocking wiring waits for the operator to confirm the gate list (stage 2).

2026-11-20 taken on the board at lane launch (lane BL-GATES, worktree /Users/brettpreston_macmini/Buildo-wt-gates, branch wf1/inc1b-gates), RR-0240

2026-11-20 grounder verdict (separate read-only agent, on caa14e6cb): SAFE TO FOLD AS REPORT-ONLY; NOT safe to block. Must fix before any gate blocks: (1) compute-reach.mjs:142,155-156 strip the extension on the import spec, handle index barrels and the mobile @app alias; add a .js-caller test and a require-form test (G-001, G-023 residue); (2) ast-grep exit 1 with empty or unparsable output must fail closed (G-065, G-066); (3) print the scanned-file count, fail on a zero-file walk, stop skipping build/dist/coverage directories at depth (G-070); (4) mobile-never-do.mjs:61 shadowing is file-wide: one local named document hides every real use; the clean fixture bakes it in (G-002); namespace Image, export-from, useEffect(fetcher) gaps closed or documented; (5) main() needs a distinct error exit code (EP-1); 8 fixtures lack SPEC LINK (G-059); (6) mobile-literals.mjs matches seven exact strings only: 107639/10000, 1.0764e1 or a string form pass (G-040). CONFLICTS for the operator: G-029 the factor list held as strings to pass estate-literals against Spec 132 core.8 binding gate scripts; G-037/G-042 Spec 136 fe.01 and fe.13 timing against the operator's 2026-11-20 request. Stage 2 waits on the operator confirming the gate list.

2026-11-20 operator (verbatim, MORNING-DECISIONS.md entry 'two gate answers'): '1 y 2. whate very you recommend'. Item 1 RULED: the gate conversion factors are registered as a pinned setting, not strings (G-029). Item 2 left to the orchestrator recommendation (a reading, not operator words): gates B and C may be built now under the 2026-11-20 request; the fe.01 / fe.13 dated note is owed in stage 2 for the operator to confirm. Still open with the operator: the gate list; whether Spec 90 covers the native icon package; whether core.8 binds the phone app.

Operator 2026-11-20, verbatim: "Let the grounder resolve them all as long as the result is compliant" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1476). Resolved by the separate grounder's recommendation of 2026-11-20: migration 333: option (b): keep the seed row gate_unit_factor_tolerance, delete migrations/333_gate_unit_factor_tolerance.sql, release mig-333 in the ID ledger; npm run migrate already loads every seed key (scripts/seeds/apply-logic-variables.js; scripts/migrate.js near :324), and Spec 132 core.8 asks for a registered variable, not a migration. Fold order: this branch folds LAST, after the pilot, with the baseline at 3 rows.

Dated note 2026-11-22 (M-246, prior text kept; RR-0385 · Backlog; operator, verbatim: "My only direction is the task 367 the handbook rules are key."): this is the KEY card of the McFix Final plan: tests for handbook rules that have no machine check. Task-434 is merged into it. A read-only look at the lane branch comes first.

Dated note 2026-11-22 (M-246, prior text kept; RR-0386 · task-367 · Backlog; operator, verbatim: "a")

Dated note 2026-11-23 (M-246, prior text kept in git history at b32ea9b4c; RR-0386, RR-0412 · task-367 · Backlog; operator, verbatim: "So both 442 and 367 should be running once this push lands."): the Implementation Plan section now holds PLAN-367-v1, the clean start for the handbook rule tests written by the Opus plan seat; the earlier gates plan (gates A, B, C on wf1/inc1b-gates) is parked by RR-0386 and its text stays in history. The plan is not reviewed or grounded yet.

Dated note 2026-11-23 (M-246, prior text kept; RR-0386, RR-0412 · task-367 · Backlog; operator, verbatim: "So both 442 and 367 should be running once this push lands."): status RUNNING to LATER and the parked lane @lane-BL-GATES taken off the card by the orchestrator, because the plan review tool and the launch script take only a waiting task (rule-lists.mjs plan-prep refusal "only a waiting task is prepared"; scripts/analysis/backlog-lane.mjs:66) and the handbook tests start clean (RR-0386). The parked branch wf1/inc1b-gates and its records are untouched. The card returns to RUNNING when lane BL-HB367 is launched by the launch script. Orchestrator decision under the six criteria, logged for the operator.

2026-11-23 taken on the board at lane launch (lane BL-HB367, worktree /Users/brettpreston_macmini/Buildo-wt-hb367, branch wf1/inc1b-hb367), RR-0240

2026-11-23 lane BL-HB367 commit 0 (plan section 6, alone and first): the MF-98 row in Phase 2 of .cursor/MCFRONTEND-QUEUE.md (RUNNING; FE rows owned: FE-49, FE-54; Next free id MF-99 by dated note, MF-97 held by BL-FEDB442), prereg-MF-98-1.json (round 203, rules FE-09, FE-10, FE-16, FE-36; totals copied from prereg-MF-96-1.json, the newest) and docs/reports/panels/MF-98.json. Q-D is not answered: the build follows the plan NOT-YES branch (fe.51 lock lands, row stays OWED on FLIP_PENDING).

2026-11-23 lane BL-HB367 red attempt: the three tests staged with T1's and T2's plant lines and T3's empty allow-list, plus this task file; self-skeptical checklist (9 items, all PASS) walked against the diff first (lane CHECKLIST.md); typecheck clean, lint 0 errors beforehand. Output saved to docs/reports/reviews/task-367/red.out.

2026-11-23 lane BL-HB367 commit 1 (work): the three locks land with the plant lines removed and the two owned nav-tab-switch entries in; red proven first at the designed (A) assertions (docs/reports/reviews/task-367/red.out: Test Files 3 failed (3), Tests 3 failed | 8 passed (11)). Q-D unanswered, NOT-YES branch: FE-49 and FE-54 read RULED (RR-0413, "yes to both") with dated notes; FE-51 stays OWED and joins FLIP_PENDING in register-locks-resolve.infra.test.ts; handbook-rule-map.logic.test.ts reads FLIP_PENDING from that file's text (no second list). Spec 136, the rule map and the rule-lists page regenerated (generate-surface-handbook.mjs --write/--check, rule-lists.mjs page --write/--check, both exit 0); Spec 136 OWED count 20. MF-98 row stays RUNNING, next: the closing commit.

2026-11-23 lane BL-HB367 acceptance (plan section 8), run on the lane head d5e3695b9; items 1-6 are the lane's, item 7 (pre-push list) waits for the orchestrator:
AC1: 3
AC2: red.out 'Test Files  3 failed (3)' lines: 1; 'mobile_parcel_search: reads a contract but declares no error state' 3; useLeadFeed 1; _layout.tsx 1; tracked.tsx 1
AC3: Status: OWED count 20 (NOT-YES branch: 20)
[surface-handbook] docs/specs/02-web-admin/136_mcfrontend_handbook.md is up to date (58 rules)
AC3 generate-surface-handbook --check exit 0
rule-lists: docs/reports/generated/rule-lists-by-kind.md is current
AC3 rule-lists page --check exit 0
AC4: trailers: 2 of 2; FE-id count in message: 0
AC4 (commit 0 too): FE-id count 0
AC5: diff --stat cf5c7be0668a6addd4a1d24bf98dca5eb31d740b..HEAD over mobile src/app src/lib src/components scripts/surfaces (minus the rule map) prints []
AC6 failure-state-declared: // SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-54 (Spec 136 §fe.54)
AC6 scope-fence: // SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-49 (Spec 136 §fe.49)
AC6 nav-tab-switch: // SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-51 (Spec 136 §fe.51)
Item 7 own green: the related run of commit d5e3695b9 passed: register-locks-resolve (15), failure-state-declared (3), scope-fence (3), nav-tab-switch (5), handbook-rule-map (41): Test Files 5 passed (5), Tests 67 passed (67).

2026-11-23 lane BL-HB367 output review round 1 (context docs/reports/reviews/task-367/context-r3.md, made by backlog-brief.mjs with --board ~/Buildo-wt-board): 78 lens inputs made by rule-lists.mjs lens-input (15 compliance lists, engineering eng-all, code-review, ux, error-paths, security); 43 outputs ran, 35 failed at DeepSeek with 402 Insufficient Balance (operator-only blocker: top up). Findings of the 43, untriaged: docs/reports/lanes/2026-11-23/BL-HB367/FINDINGS.md (174: 1 CRIT, 42 HIGH, 71 MED, 60 LOW). Task stays RUNNING, grounder owed.

2026-11-23 lane BL-HB367 output review round 1 completed after the DeepSeek top-up (operator: "deepseek is updated", relayed by the orchestrator): the 35 missing outputs ran under their names at concurrency 3, 0 failed; 78 of 78 outputs present. Findings, untriaged: docs/reports/lanes/2026-11-23/BL-HB367/FINDINGS.md (285: 2 CRIT, 73 HIGH, 115 MED, 95 LOW). Task stays RUNNING, grounder owed (RR-0359).

2026-11-23 lane BL-HB367 output round 1 fix (grounder Cairn-Ground-O367, parts A to H): RR-0417, operator, verbatim: "yes. worktrees removed" (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2134), put to him as "may FE-51 read RULED with its two named exceptions, yes or no?". The plan YES branch now applies: fe.51 reads RULED with its two named, owned tab-push exceptions and leaves FLIP_PENDING; the three Six cells read P pass; the fe.49 and fe.54 notes cite MORNING-DECISIONS.md:2108; the fe.54 note gives the 32 out-of-scope contract readers (8 would fail the finder); the MF-98 row owns fe.49, fe.51 and fe.54; the panel record carries RR-0417 and no blocker. Acceptance 3 now reads 19 (grep -c Status: OWED on Spec 136); generate-surface-handbook.mjs --check and rule-lists.mjs page --check exit 0. Task stays RUNNING; output round 2 is owed.

## References
- docs/reports/lanes/2026-11-20/BL-GATES/REPORT.md
- docs/reports/lanes/2026-11-20/BL-GATES/FINDINGS.md
- docs/reports/reviews/task-367/GROUNDER-PLAN.md
- docs/reports/reviews/task-367/TRIAGE-PLAN.md
- docs/reports/reviews/task-367/seat-integration-1.md
- docs/reports/reviews/task-367/seat-reality-check-1.md
- docs/reports/reviews/task-367/seat-regression-1.md
- compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:surface-126 docs/specs/02-web-admin/126_maxbld_surface_standard.md
- compliance:surface-127 docs/specs/02-web-admin/127_surface_conversion_procedure.md
- compliance:surface-128 docs/specs/02-web-admin/128_surface_standard_policy.md
- compliance:surface-135 docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
- compliance:policy-124-s2-s5 docs/specs/01-pipeline/124_step_standard_policy.md
- compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
- compliance:orchestrator-doc17 backlog/docs/doc-17 - Orchestrator-readings-not-rulings.md
- compliance:bylaw-133 docs/specs/01-pipeline/133_bylaw_handbook.md
- compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
- docs/reports/lanes/2026-11-23/BL-HB367/REPORT.md

## Documents
- (none)

## Decisions in force (titles; the ones this task names carry the operator's words)
- RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0087 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0315 Plan: go on sections A and B; tasks added to Increment 1B
- RR-0316 Plan: close check folded as built
- RR-0317 Plan: review enforcement only
- RR-0318 Plan: section E accepted
- RR-0319 C2 failed compute: error screen with Try again, not counted
- RR-0320 C3 legal line at the bottom of the phone search page
- RR-0321 D13 semi page buttons 48 px is the operator ruling
- RR-0322 C5 engine numbers to every paying user at once
- RR-0323 D1 freshness compare left until stored records exist
- RR-0324 Semi page cache write accepted as built
- RR-0088 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0325 Phone keeps its 3 retries (reading)
- RR-0326 Web search legal line at the bottom (reading)
- RR-0327 Page structure to table-driven pages: the five items go ahead
- RR-0328 The app is not in use, in development
- RR-0329 Task 370 dropped from Increment 1B (reading of the answer)
- RR-0330 Six-row table as put, including task-348 answered (reading)
- RR-0331 Report meter stays in the lookup route
- RR-0332 A McFix task may file under the McFrontend row that built what it fixes
- RR-0333 A task is not complete until it works
- RR-0334 Five reviewer-input items agreed, existing mechanisms first
- RR-0092 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0335 Rule 3 two-commit close for lane build and fix tasks
- RR-0336 Items 0 to 8 approved for task-399 and task-375
- RR-0337 Two binding checks added to the existing tasks, full panel on them
- RR-0338 Low-priority findings go to a review pile; Reality-Check and Integration on the additions
- RR-0339 Hardening rounds are warranted and bounded
- RR-0340 Four uncovered parts of the six steps go into the plans, with a second pass
- RR-0341 Loading screen gives up after 60 seconds
- RR-0342 Regression and Reality-Check seats in the lane protocol, by their written triggers
- RR-0343 Compliance documents on a task are labelled as compliance
- RR-0344 Reviews re-run; BUILT needs an output review; seats on plans
- RR-0099 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0345 Pre-launch steps by hand for task-375 then scripted
- RR-0346 The lane fixes and closes a grounder verifies the orchestrator routes
- RR-0347 Reality-Check runs when it cannot be told that no figure changes
- RR-0348 The tool-having seats run on the plan only
- RR-0349 Starting shape compliance on plan and output
- RR-0350 Build authorized tonight open questions grounded and taken as approved
- RR-0351 The cross-read adversary pass is not needed
- RR-0352 Design gaps 1 and 2 resolved now, the plan reviewed first
- RR-0353 The 29 scorecards are resolved the right way
- RR-0354 The spec wording on the cross-read adversary is changed
- RR-0136 Operator: start Increment 1·A
- RR-0355 Scorecard plan agreed, push as soon as possible, gaps in parallel
- RR-0356 A plan for the output review of the built tasks, with a grounded recommendation
- RR-0357 GO for the scorecards, given in the chat before the rehearsal
- RR-0358 The scorecard rehearsal is waived if it gives no benefit
- RR-0359 Nothing is folded before the grounder has ruled — "That's ridiculous to fold before the grounder review - the focus is on getting it right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1687)
- RR-0360 CLAUDE.md loses the cross check; the wording 'stays available on request' is approved
- RR-0361 Built tasks: ground the old findings and include them in a new pass; plan not approved
- RR-0362 GO on the queue row for migration 334 so the push can be retried
- RR-0363 The protocol shape: rules for the reviewer; plan review, grounding, fold, build, output review, grounding, fold; no review of paperwork
- RR-0364 Medium and low findings recorded not fixed; paperwork tasks get a grounder check, no review
- RR-0137 Operator: completeness, holistic and per-increment optimisation
- RR-0365 Cut the task-423 plan to the five adjustments; panel review, ground, present with tasks ready
- RR-0366 The tasks of the task-423 plan are pre-approved; output reviews limited to something reasonable
- RR-0367 Paperwork yes; plan findings ruled once yes; fix-only re-review held; important medium findings are fixed
- RR-0368 Go on step 1 of the rules sections: the check plus Spec 137, Spec 08 and the engineering standards
- RR-0369 Output round 1 fixes mediums with highs and criticals; round 2 is highs and criticals only
- RR-0370 Task-419 closing round approved on condition; station option C plus the one line; spec rules sections as later board tasks
- RR-0371 Round caps: two rounds on the plan, then to the operator; three rounds on the output
- RR-0372 Task-423 fix round; per-document form stays the default; joining decided by a three-run measure in task-427
- RR-0373 RR-0372 is withdrawn: the operator did not approve it
- RR-0374 Task-423 fix round approved (step 1); rules sections approved when they arrive (step 2)
- RR-0139 Operator: push 6, re-sort, answer page
- RR-0375 Task-423 closes if it is verified
- RR-0376 Step 2 re-scoped: Spec 137 and Spec 08 left as they are; engineering standards rule list and handbook; a look at what front-end tasks attach beside Spec 136
- RR-0377 RR-0376 is planning only: nothing starts on the step 2 re-scope
- RR-0378 Review-inputs plan approved and running: handbook plus relevant engineering sections; fresh context; rules-checked line; tasks 427 and 425 removed
- RR-0379 Step 1 runs in parallel; handbook rules are added over time
- RR-0380 Plan 431 questions: surface specs dropped once the handbook holds the critical items; engineering sent by parts now; sections 8, 10, 12 to both sides; by-law tasks gain no engineering rules
- RR-0381 Task-433: the lane reviews with a copy of the launch-commit compliance template (grounded fix approved)
- RR-0382 Engineering standards get a dated note: UI library lines superseded by Spec 126 for the front end
- RR-0383 Plan 431 question 3: tasks that edit the surface specs keep those specs attached
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer) — "These look great - teh 13 are perfect. Task 430 becomes three small things: stop the clipping, make each line reflect its notes, and add these 13 lines. Item 9 stays a pointer, so the page does not grow by copying tables." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1901)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card — "a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1930)
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place — "Let's wait for the McFixReborn until the new tests are in place - does that make sense?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1947)
- RR-0389 The model conflict is resolved by updating the key specs and docs themselves
- RR-0390 task-430 output review size: option A, one larger review message, tried once
- RR-0391 a card to widen the security lens; McFixReborn next once these close
- RR-0392 one push for all four; no other infrastructure beyond this — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0393 McFixReborn next, continued after tasks 424 and 386
- RR-0394 security lens option A: API routes and library code
- RR-0141 Operator: Q-LT-1
- RR-0395 one small task adds the missing handbook lines before task-439 lands
- RR-0396 the handbook task adds the R-22 line only; no seam sentence on fe.49
- RR-0397 chain more pushes together: fewer, larger pushes
- RR-0398 the one-list task writes one Files entry with a star (option A)
- RR-0399 rule fe.36 is marked partly in the rule look
- RR-0400 R-22 only was not a limit; what is best governs
- RR-0401 investigate the typed 10 percent circulation text on the houseplex option
- RR-0402 circulation text: option A, drop the percent; card opened
- RR-0403 circulation text fix merged into task-442; no separate process for task-447
- RR-0404 planner redirect approved: task-447 planner returns a section for task-442
- RR-0143 Operator answer IMG-1: six lot-size bands
- RR-0405 houseplex size basis wording: the basement, not shared stairs and halls
- RR-0406 McFixReborn label on the tasks that process covers
- RR-0407 next push as soon as possible; does not wait for task-442
- RR-0408 McFixReborn in merged groups by shared files; map validated before anything proceeds
- RR-0409 McFixReborn map: the three hand-written schema files are reviewed; a plan is needed for the oversized files
- RR-0410 McFixReborn map: the script with no rule-list row is not reviewed
- RR-0411 McFixReborn label stays on task 349; merged groups move forward
- RR-0412 task 386 merged into McFixReborn; tasks 442 and 367 run once the push lands — "Merge or remove 386 - because we have the updated McFix Reborn process. So both 442 and 367 should be running once this push lands." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2098)
- RR-0413 task-367: the three handbook rows flip to RULED with their tests; the operator confirms the three rows — "yes to both A. Status flip." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2108)
- RR-0414 task 442 re-makes only its three changed lists; five McFixReborn map decisions
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
- RR-0415 McFixReborn group reviews outside a lane: liked, to be grounded; tasks 442 and 367 to be running
- RR-0416 Operator pre-approves removing lane work folders to free disk space
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions — "yes. worktrees removed" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2134)
- RR-0145 Operator answer TRK-1: tracked lots refresh
- RR-0146 Operator answer PG-1: pushes and GOs
- RR-0147 Operator answer NAME-1
- RR-0149 Increment 1·A tooling location
- RR-0150 Infra freeze named list
- RR-0152 Increment 1·A re-use and drops
- RR-0154 Work pulling
- RR-0156 Push 6 literal test
- RR-0157 Push 6 R-MD
- RR-0014 McSTORAGE-RULINGS.md:5
- RR-0159 Push 6 recapture; 1·A panel scope
- RR-0161 Work pulling
- RR-0162 Answer ONE-1
- RR-0163 Answer ONE-2
- RR-0164 Answer ONE-4
- RR-0165 Answer ONE-5
- RR-0166 Answer ONE-12
- RR-0167 Answer ONE-13
- RR-0168 Answer ONE-21
- RR-0169 Answer ONE-22
- RR-0028 open-questions.md:1088
- RR-0170 Answer ONE-35
- RR-0172 Search lot map street name
- RR-0174 Loading screen
- RR-0176 Loading screen
- RR-0178 MB-44 W timing
- RR-0179 Load-failure page
- RR-0180 Web recent-search chips
- RR-0182 Search identification and semi wiring
- RR-0184 Semi question page design
- RR-0186 Inc6 protection window
- RR-0044 2026-11-18 · Operator direction: page-level lot information in increme
- RR-0188 Push 6 recapture
- RR-0190 Enforcement
- RR-0192 Operator oversight scope
- RR-0193 McRecommendations
- RR-0195 Push CHK.5/CHK.3
- RR-0196 Push CHK.5/CHK.3
- RR-0198 Push 6 recapture
- RR-0200 Recommendation tracking tools
- RR-0202 Backlog working board
- RR-0203 Backlog working board
- RR-0060 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0205 Backlog home of the plan
- RR-0207 Backlog: use all features, bring content and process over, ensure use
- RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- RR-0210 McLane is the lane policy name
- RR-0212 Backlog plan v8 scope: loader + three gates
- RR-0214 1·A not replaced; relevancy pass after the move
- RR-0215 Images round 4 directions
- RR-0217 Concept gallery scope
- RR-0219 Backlog plan v8 approved
- 2026-11-18 re-use ruling: drop INFRA.2 guard.mjs and CHK.4 (operator words)
- RR-0080 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- Q-H2 drop the J5 storeys backfill chain (7.7-7.9, 7.23)
- RR-0232 Open decisions: grounding and verified recommendation
- RR-0233 Operator expertise scope
- RR-0235 McLane brief: full context from milestone, reviews and decisions
- RR-0242 One-command lane launch
- RR-0248 Increment 1·A parallel lanes
- RR-0264 Semi page placeholder in 1·B
- RR-0270 Web search footer: once, approved
- RR-0273 Shared footer component
- RR-0271 LOAD.1 drives the report now, ST.P1 split
- RR-0081 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0277 Search fuzzy matching reuses the permit address spec
- RR-0278 Report meter counts on report production only
- RR-0281 No clear-search button (A.11 not required)
- RR-0282 Daylight restyle token substitutions stay as built
- RR-0284 Lot map: two data reads allowed (C.5 footprint, C.7 card line)
- RR-0299 SRCH.C12 support address is a placeholder until launch
- RR-0300 1·B blockers as OPERATOR tasks
- RR-0298 Status changes only by the launch script
- RR-0301 task-341 approved: run tasks 121, 122, 123 now, then LOAD.1, LOAD.2, LOAD.4
- RR-0302 Loose ends task per milestone
- RR-0086 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0303 design-elements file: produce now if not a big job
- RR-0306 task-342 answered: the proof tool does not wait for the design-fit check
- RR-0307 task-340 answered: A.6 is built now from the existing entitlement read, compliant and researched first
- RR-0308 Semi question mock approved (task-319)
- RR-0309 Regenerated semi mock approved (task-319 stage 2)
- RR-0310 A.6 reset date served as a Toronto-time label (task-320)
- RR-0311 A.6 zero reports left still shows the line (task-352 question 1)
- RR-0312 No plan: an error page with a way to sign up (task-352 question 2)
- RR-0313 Search box says Enter a Toronto address (task-352 question 3)
- RR-0314 Outside-Toronto notice stays

## Milestone
m-1 Increment 1·B Search [S]

### Description

Increment S (re-opened, scenario slice)

### Problems
- None named in the S brief (docs/reports/plan-import/raw/2026-11-19/search-brief.json carries inc, deliverable and specs only).
- Found by the R10 validation pass (task-316, 2026-11-19), text left as found: the first two Storage set-up lines below still say a 35 s loading screen and LOAD.3; RR-0176 (decision-43, supersedes RR-0174) rules no 35 s cap and LOAD.3 dropped (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- Found by the R10 validation pass: two Storage set-up lines and four Register rulings lines end with the word undefined where a quote belongs (generator defect, draft task on backlog-brief.mjs); doc-16 section 5 row S still reads LOAD.1 to LOAD.3 (backlog/docs/doc-16 - McStorage-policy-v2.md:108)

### Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

### Increment objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion (docs/reports/plan-import/raw/2026-11-19/search-brief.json inc; ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- The search identifies two-or-more parcels at one address, a mis-typed address, or a possible semi lot, and wires each to the report; the semi calculation stays in Increment 7 (7.25) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- What the customer sees: the 65 designed search elements A (search page), B (address confusion), C (lot confusion, lot map), D (semi question page), E (web search pages), F (landing entry), G (hand-off to the report) (backlog/docs/increments/doc-2 - Increment-S-requirements.md:27) "| id | element | where | status | deliverers | built |"

### Objectives
- Search comes before increment 1: the search page, then (1) address confusion, (2) lot confusion; most of it is already built (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"

### Deliverable
- A user types any Toronto address, resolves address or lot confusion through the designed pages (choose your lot, and the three states: intersection, no lot linked, many lots), and lands on the report (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:682) "Readings: (1) Q-GAP-0 image hold R-IMG1..3 LIFTED (dated note owed, M-246 form). (2) Q-GAP-2 "Most space": every option, a tie goes to the l"
- The search pages follow the Daylight product standard (small pages v8); today they are still old dark on origin (mobile/src/constants/parcelSearch.ts:58) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1100) "R-D1 Daylight is the product standard: small pages (v8), landing (v10+), report (B v3: summary + concept gallery), demo "

### Specs
- Spec 89 parcel cost model tool (search parser rules): origin:docs/specs/02-web-admin/89_parcel_cost_model_tool.md
- Spec 126 MaxBLD surface standard: origin:docs/specs/02-web-admin/126_maxbld_surface_standard.md
- Current search (latest rendering + later rulings): ~/Buildo-scratch/lanes-20261117/search-delta/CURRENT-SEARCH.md
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md
- McFrontend phase1 open-questions.md (search and small-pages rulings): ~/Buildo-scratch/mcfrontend/phase1/open-questions.md
- PROTOCOL.md: ~/Buildo-scratch/panel-tools/PROTOCOL.md

### Rulings
- Search pages come first in the plan, before increment 1 (RR-0005) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "the search pages should be even before the increment 1"
- Search parser: fix the street direction guard and the unit-token strip before launch (RR-0166) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- W5 choose your parcel on the web is deferred and the web live switch stays off (RR-0170) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- Lot map: the street name on the road comes from the map's own road labels (RR-0172) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- The 'faces the street' rule question was withdrawn by the operator (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:774) "why does this matter? do you not know how to do the lookup?"
- Loading screen: the animation keeps its own length and always runs to completion; the button waits for the report AND See details; LOAD.3 not needed (RR-0176, supersedes RR-0174 which said 35,000 ms) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- The customer read module W (1.3) is built now in Increment 1 (RR-0178) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- A load-failure page is a task, built from the other small pages (RR-0179) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- Web recent-search chips (E.6) stay deferred (RR-0180) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- 1·B builds A.6 and C.12 as their own tasks and identifies the semi lot; the semi calculation stays in 7.25 (RR-0182) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- The semi question page is designed like the other small pages: a v8 mock for approval, then built (RR-0184) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- Small pages: Daylight ("modern") is the product standard (R-D1) (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1098) "Just looking at the small pages - love it! Let's go with modern."
- Increment 1·B starts as a validation pass of its tasks, the semi page placeholder, the McFrontend fields and page tasks, dependencies and the prior panel records (RR-0257) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1019) "This work has been done - just validation."

### Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Loading screen: starts at the search pick, waits for the numbers up to 35,000 ms (LOAD.1 to LOAD.3); skipped for a re-opened lot (its record is read); no screen for owner input or the Tracked Lots list (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696; ~/Buildo-scratch/mcfrontend/MF-62/plan.md:44) "undefined"
- Search shows addresses only; the pick (lookup hit) starts the one-lot compute (LOAD.1) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:696) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

### Register rulings of this group (operator words)
- RR-0005 2026-11-18: Search pages first in the plan, before increment 1 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:673) "Operator, verbatim: "because we have done this plan by increments what about the "This Lot" information (Main page) and details as well as t"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0166 2026-11-18: Search parser (1.4): fix the two defects before launch (street direction guard, unit-token strip), with two labels and one dated note on Spec 89 line 33 (ONE-12 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-12 a"
- RR-0170 2026-11-18: W5 (choose your parcel) on the web: deferred; the web live switch stays off (ONE-35 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-35 b"
- RR-0172 2026-11-18: Lot map: the street name on the road comes from the map's own road labels; no new data read or drawing code. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:775) "Map's road labels (Recommended)"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0178 2026-11-18: MB-44: T now, per-increment checks now, and the customer read module W (1.3) built NOW in Increment 1 (not after J9 in increment 8), because McStorage policy v2 computes at the search pick (MD:704). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "1. it has to happen now - read the objectives"
- RR-0179 2026-11-18: New task: the load-failure page shown when a lot's report or See details fails to load, built from the other small pages (small-pages-v8) as its template. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "2. Add it as a task using the othr mini pages as a template"
- RR-0180 2026-11-18: Web recent-search chips (E.6) stay deferred. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:789) "3. This can stay defferred for now"
- RR-0182 2026-11-18: Increment 1·B builds A.6 (reports-left line, app search page) and C.12 (help link) as their own tasks; the search identifies two-or-more parcels, a mis-typed address, or a possible semi lot; the search portion and the semi question page are done now with the wiring (link) to the report; the semi calculation stays in Increment 7 (7.25). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:796) "Maybe the search portion done now with the page."
- RR-0184 2026-11-18: The semi question page is designed like the other small pages (small-pages-v8 Daylight): a mock from the v8 template for operator approval, then built (SRCH.SEMI). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:801) "also need a semi question page similar to a min page"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0214 2026-11-19: Increment 1·A is not replaced by the Backlog plan; after the move every task on the board is re-checked for relevancy against the plan (kept / merged / changed) before 1·B starts. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:857) "ensure the tasks are updated and relevancy determined in light of the plan"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

### Compliance codes in use
- None named: no 1·B task (task-12, 13, 14, 68, 69, 266, 267, 268, and the promoted and created task-317 to task-325) carries a comp: label (checked on the task files, 2026-11-19).

### Decisions
Every file in backlog/decisions whose Groups line names S or whose Tasks named line names a 1·B plan id (checked 2026-11-19, R10):
- decision-1: RR-0005 2026-11-18 · Operator direction: page-level lot information in increme
- decision-15: RR-0137 Operator: completeness, holistic and per-increment optimisation
- decision-20: RR-0144 Operator answer PRG-1: purge rule
- decision-21: RR-0145 Operator answer TRK-1: tracked lots refresh
- decision-27: RR-0154 Work pulling
- decision-36: RR-0166 Answer ONE-12
- decision-40: RR-0170 Answer ONE-35
- decision-41: RR-0172 Search lot map street name
- decision-42: RR-0174 Loading screen
- decision-43: RR-0176 Loading screen
- decision-44: RR-0178 MB-44 W timing
- decision-45: RR-0179 Load-failure page
- decision-46: RR-0180 Web recent-search chips
- decision-47: RR-0182 Search identification and semi wiring
- decision-48: RR-0184 Semi question page design
- decision-49: RR-0186 Inc6 protection window
- decision-51: RR-0190 Enforcement
- decision-52: RR-0192 Operator oversight scope
- decision-53: RR-0193 McRecommendations
- decision-58: RR-0202 Backlog working board
- decision-59: RR-0203 Backlog working board
- decision-60: RR-0205 Backlog home of the plan
- decision-61: RR-0207 Backlog: use all features, bring content and process over, ensure use
- decision-62: RR-0208 Gates: assess necessity; Backlog to make the process followed and reviews validated
- decision-63: RR-0210 McLane is the lane policy name
- decision-64: RR-0212 Backlog plan v8 scope: loader + three gates
- decision-65: RR-0214 1·A not replaced; relevancy pass after the move
- decision-68: RR-0219 Backlog plan v8 approved

### Documents
- Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md#L27) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#S
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L108-L108 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#S

## Document sections
Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.

### Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at Requirements: backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md (not readable: ENOENT; read it at McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-2 - Increment-S-requirements.md)

### McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md (not readable: ENOENT; read it at McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md)

## Decisions naming this task
- RR-0359 Nothing is folded before the grounder has ruled (names RR-0359) — "That's ridiculous to fold before the grounder review - the focus is on getting it right" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1687)
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer) (names RR-0384) — "These look great - teh 13 are perfect. Task 430 becomes three small things: stop the clipping, make each line reflect its notes, and add these 13 lines. Item 9 stays a pointer, so the page does not grow by copying tables." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1901)
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card (names task-367, RR-0386) — "a" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1930)
- RR-0388 McFixReborn waits until the new tests are in place (names task-367, RR-0388) — "Let's wait for the McFixReborn until the new tests are in place - does that make sense?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1947)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)
- RR-0406 McFixReborn label on the tasks that process covers (names task-367) — "That would help to determine which running tasks and built tasks will close with that process." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2057)
- RR-0412 task 386 merged into McFixReborn; tasks 442 and 367 run once the push lands (names RR-0412) — "Merge or remove 386 - because we have the updated McFix Reborn process. So both 442 and 367 should be running once this push lands." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2098)
- RR-0413 task-367: the three handbook rows flip to RULED with their tests; the operator confirms the three rows (names task-367, RR-0413) — "yes to both A. Status flip." (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2108)
- RR-0417 FE-51 tab switch may read RULED with its two named owned exceptions (names task-367, RR-0417) — "yes. worktrees removed" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2134)

## Prior reviews and lane reports
### task-367 (this task)
- docs/reports/reviews/task-367/FINDINGS-PLAN.md
- docs/reports/reviews/task-367/FOLD-CHECK.md
- docs/reports/reviews/task-367/GROUNDER-PLAN.md
- docs/reports/reviews/task-367/QUESTIONS-RULED.md
- docs/reports/reviews/task-367/TRIAGE-PLAN.md
- docs/reports/reviews/task-367/seat-integration-1.md
- docs/reports/reviews/task-367/seat-reality-check-1.md
- docs/reports/reviews/task-367/seat-regression-1.md
- docs/reports/lanes/2026-11-20/BL-GATES/REPORT.md (lane report naming task-367)
- docs/reports/lanes/2026-11-23/BL-HB367/REPORT.md (lane report naming task-367)
- docs/reports/lanes/2026-11-23/BL-HB446/REPORT.md (lane report naming task-367)

## Dependencies
- (none)
