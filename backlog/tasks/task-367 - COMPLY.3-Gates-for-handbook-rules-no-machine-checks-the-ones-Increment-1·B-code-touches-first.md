---
id: TASK-367
title: >-
  COMPLY.3 Gates for handbook rules no machine checks, the ones Increment 1·B
  code touches first
status: RUNNING
assignee:
  - '@lane-BL-HB367'
created_date: '2026-11-20T13:04:00Z'
updated_date: '2026-11-23T20:51:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
references:
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
  - >-
    compliance:surface-126
    docs/specs/02-web-admin/126_maxbld_surface_standard.md
  - >-
    compliance:surface-127
    docs/specs/02-web-admin/127_surface_conversion_procedure.md
  - >-
    compliance:surface-128
    docs/specs/02-web-admin/128_surface_standard_policy.md
  - >-
    compliance:surface-135
    docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
  - >-
    compliance:policy-124-s2-s5
    docs/specs/01-pipeline/124_step_standard_policy.md
  - compliance:agents-s5-1to3 docs/specs/00-architecture/08_agents.md
  - >-
    compliance:orchestrator-doc17 backlog/docs/doc-17 -
    Orchestrator-readings-not-rulings.md
  - compliance:bylaw-133 docs/specs/01-pipeline/133_bylaw_handbook.md
  - compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-23/BL-HB367/REPORT.md
type: build
ordinal: 67012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator 2026-11-20 (verbatim): "Add the tasks to incr 1b - the infa freeze needs to be lifted again - what is the point of building a mess - wasted effort." Record: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md, entry "Operator: compliance tooling tasks into 1·B". Scope now: from the task-365 coverage table and the grounded findings, one gate per rule that has no mechanical check and that 1·B code touches; candidates named by the orchestrator, UNVERIFIED until task-365 is grounded: (a) the Airtight purity and literal gates scan only scripts/lib/compute: route-side code that calls the engine core (src/lib/parcels/report-compute.ts) is scanned by none; (b) numbers written in mobile code (the 60 s wait) against EXTERNALIZED (Spec 132 core.8); (c) the Spec 90 section 5 never-do list has no check on mobile/; (d) the 8 McFrontend rules whose lock is OWED (Spec 136), those 1·B touches. Each gate: red first on a planted defect, both directions. Waits on: task-365 grounded; the operator confirms the gate list before the build.

Files: src/tests/surfaces/failure-state-declared.logic.test.ts, src/tests/surfaces/scope-fence.logic.test.ts, src/tests/surfaces/nav-tab-switch.logic.test.ts, src/tests/surfaces/handbook-rule-map.logic.test.ts, src/tests/surfaces/register-locks-resolve.infra.test.ts, docs/specs/02-web-admin/135_mcfrontend_decisions_register.md, docs/specs/02-web-admin/136_mcfrontend_handbook.md, scripts/surfaces/_schema/surface-rule-map.json, docs/reports/generated/rule-lists-by-kind.md, .cursor/MCFRONTEND-QUEUE.md, docs/reports/panels/, scripts/analysis/bylaw-validation/coa-expected/prereg-MF-98-1.json
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The gate list is confirmed by the operator before any gate is built
- [ ] #2 Each gate is shown red on a planted defect and green on the clean tree
- [ ] #3 The handbook no-check lists shrink by the rules gated, by their generators
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# PLAN-367-v1

**Task:** task-367 COMPLY.3 (type build, milestone m-1, letter S). Scope: tests for the McFrontend handbook rules (Spec 136) that no machine checks. This is a clean start (RR-0386). **Plan seat:** Opus, read-only (RR-0385 item 1, MORNING-DECISIONS.md:1917). **Build seat:** Opus (RR-0385 items 1 and 8). **Head read:** wf2/board at b32ea9b4c (`git rev-parse HEAD` gives b32ea9b4cae9350c0b1e3fcad6b3a568f317c154, the same as origin/wf1/mb-rulings). **Commands run:** git reads, sed, grep, `node scripts/analysis/rule-lists.mjs resolve`, and small inline `node -e` scripts that only read (git ls-files, JSON.parse of descriptors, TypeScript AST walks). No test runner was run and nothing was written. MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md. **Estimate (a guess, not measured):** one Opus lane session, about 450 lines of test code, one records commit, one work commit and one closing commit.

## 0. Facts verified

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

## 1. Scope

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

## 2. Row choice (A)

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

## 3. The tests

**Common to all three:**
- Path: the reserved lock path. The register reserves the exact name (135:15; OWED_LOCK_RE at register-locks-resolve.infra.test.ts:19).
- First line: `// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-nn (Spec 136 §fe.nn)` (CLAUDE.md directive 3; the form of register-locks-resolve.infra.test.ts:1).
- No DB, no network.
- Files are listed with `git ls-files`.
- The scope list comes from scripts/surfaces/_schema/converted-surfaces.json `scope.programme_scopes`, which is `["parcel_product","parcel_admin"]` with `expected_count` 33. This reuses the manifest; it is not a new list.
- One pure finder is exported per test.
- Each test has KNOWN_BAD cases in memory, controls, and a printed scanned count (the 441 form).

### T1 fe.54: src/tests/surfaces/failure-state-declared.logic.test.ts

- **Reads:** every tracked `scripts/surfaces/**/surfaces/*.descriptor.json` with kind SURFACE and programme.scope in scope.
- **Finder:** a descriptor with `inputs.answer === 'contract'` fails when `states[]` has no `error` entry, or when `errors.answer` is `none` or `UNRESEARCHED`.
- **Assertions:**
- (A) `expect(problems).toEqual([])` first, then the scanned SURFACE count equals `scope.expected_count` (the problems assertion runs first, so the plant's red names the descriptor, not the count).
- (B) In memory: a copy of mobile_parcel_search without its error state gives 1 problem; a copy with errors.answer `none` gives 1; `UNRESEARCHED` gives 1.
- (C) Controls give 0: a STATIC descriptor with inputs `none`, and an estate_other descriptor with no error state.
- **Today:** 33 in scope, 25 read a contract, 0 problems. 8 problems lie outside scope (estate_other and platform_shared) and are not judged.
- **Plant:** a temporary line in (A) pushes the (B) copy into the scanned list. It turns (A) red with "mobile_parcel_search: reads a contract but declares no error state". The line is deleted before the green commit. No file on disk changes, so no generator hook can trip.
- **Limit (stated in the header):** it checks declarations only. The known break at mobile/src/lib/maxbldHelp.ts:19 (RULE-CHECKS.md:102: a failed Help open is only logged) is code and is not caught.

### T2 fe.49: src/tests/surfaces/scope-fence.logic.test.ts

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

### T3 fe.51: src/tests/surfaces/nav-tab-switch.logic.test.ts

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

### The red attempt (through the real hooks)

1. Stage the three tests (with T1's and T2's plant lines, and T3's empty list) and the task file. Typecheck and lint were run once beforehand. Before the red run and before the work commit the lane writes a 5 to 10 item PASS/FAIL self-skeptical checklist from Spec 135 rules 3 and 5 and Spec 136 section 2 and walks it against the actual diff (00_engineering_standards.md:288).
2. The related run (.husky/pre-commit:56, :85) refuses: 3 test files failed at the designed (A) assertions.
3. The output is saved to docs/reports/reviews/task-367/red.out. That folder is always allowed (check-task-files.mjs:10).
4. A refusal at any other stage is a test defect and is fixed first.

## 4. Live breaks (named, not fixed)

- fe.51: 2 tab pushes, owned by MF-49/MF-50 and MF-51/MF-52 (126:82).
- fe.54: maxbldHelp.ts:19 is code, out of the declaration test.
- Out of scope and only noted: 8 contract-reading descriptors in estate_other and platform_shared have no error state.

## 5. Files (C)

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

## 6. Commits (D), in order, following the six steps (08_agents.md:515-525)

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

## 7. Landing order (E)

- **442:** both commit 0s edit .cursor/MCFRONTEND-QUEUE.md line 5 (the next-free id), so this is a textual conflict. 442's MF-97 folds first. Whichever lands second rewrites the line by dated note (the 135:17 precedent) to one past the larger of the two ids. No other shared file: 442's panel and prereg are different files.
- **383 (wf1/inc1b-thinroute, 5a0d52644):** touches contract_parcels_lookup.descriptor.json, which T2 reads. Its version holds 0 `lead_parcels` (`git show … | grep -c` gives 0). No conflict.
- **411 (wf1/inc1b-areafactor, f00af29ed):** touches an estate_other descriptor only, which is out of scope.
- **388 (wf1/inc1b-mfrules, e467590a6, RUNNING):** edits Spec 135, Spec 136, the queue and the rule map. Textual conflicts are expected; the second lander regenerates. Its rows are renumbered after FE-58 (135:17), so FE-49, FE-51 and FE-54 do not move.
- **McFixReborn:** its group file list was not found (UNVERIFIED). A fix to _layout.tsx:48 or tracked.tsx:99 makes T3's entry stale. The fixer removes the entry in the same commit, because the list only shrinks.

## 8. Acceptance (F)

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

## 9. Risks and rollback (G)

- Another lane adds a tab push or a lead import: red at the push suite. That is the rule working.
- If `x-draft.files` is dropped by a later conversion, the file set shrinks. The floors catch it.
- The 442 and 388 conflicts are textual only.
- Rollback: `git revert` commit 1, then commit 0. No runtime code changes.

## 10. Questions for the plan grounder (H), answered in docs/reports/reviews/task-367/QUESTIONS-RULED.md (G1 yes; G2 surface-rule-map.json changes, 00_system_map.md does not; G3 yes; G4 keep; G5 yes; G6 no other lock)

- G1. Does `gate.mjs --staged` (pre-commit:19, holdForCommit) pass staged `src/tests/surfaces/*.ts` before the commit-msg trailers are read? 442 is the precedent, but it is UNVERIFIED.
- G2. Does the flip leave surface-rule-map.json and docs/specs/00-architecture/00_system_map.md unchanged? The system map row for 135 already lists the three paths (00_system_map.md:100). If the map does change, it must be added to the Files line, which would add policy-124-s2-s5, a list the rule-lists page entry already attaches (16 lists, section 5).
- G3. Does arm C pass a work commit that cites no FE id with RULED-only prereg rules, as with MF-96 (2905df62d)?
- G4. Is `identity.route` plus `x-draft.files` the right MaxBLD file set, or should it be the Spec 126 §11b.3 page set?
- G5. Is T1's reading of 128:39 right: a contract reader must declare an `error` state and a non-`none` errors answer?
- G6. Does any other text lock (for example rules-acc-notes.logic.test.ts) pin the FE-49, FE-51 or FE-54 cells?

## 11. Questions for the operator (H)

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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
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

2026-11-23 lane BL-HB367 output review round 2 (RR-0385 item 3, the last round): fresh context docs/reports/reviews/task-367/context-r4.md; 90 lens inputs re-made by rule-lists.mjs lens-input on the diff cf5c7be06..9f47c3454 under the round-1 base names; 90 of 90 outputs; findings untriaged in docs/reports/lanes/2026-11-23/BL-HB367/FINDINGS.md (round 2: 315;  36 severity=HIGH; 146 severity=LOW; 125 severity=MED; 6 severity=NIT;). Task stays RUNNING; the grounder rules round 2.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
task-367 (COMPLY.3, MF-98): three locks for the handbook rules fe.54 (failure-state-declared), fe.49 (scope-fence) and fe.51 (nav-tab-switch) at their reserved src/tests/surfaces paths, each seen red at its designed assertion then green; fe.49, fe.51 and fe.54 read RULED (RR-0413, RR-0417); Spec 136, the rule map and the rule-lists page regenerated (19 OWED); commits 7dc3b9132 (records), d5e3695b9 (work), 9f47c3454 (round 1 fix); red in docs/reports/reviews/task-367/red.out

Review round 1: 4 fixed, 0 task, 0 ruling, 0 wontfix, 12 pile; grounder /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/hb367-lane/grounder/r1/GROUNDER.md (round 1 as ruled, outputs at 3cb6f98d6); triage /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/hb367-lane/grounder/r1/TRIAGE.md
out-compliance-policy-124-s2-s5-p6#1 MED fixed 9f47c34
out-compliance-surface-126-p7#2 MED fixed 9f47c34
out-compliance-surface-135-p7#1 MED fixed 9f47c34
<!-- SECTION:FINAL_SUMMARY:END -->
