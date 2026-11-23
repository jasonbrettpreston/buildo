---
id: TASK-441
title: >-
  FINAL.6 Engineering standards tests: one test per engineering rule that has
  none, a few at a time, each proven to fail first
status: LATER
assignee: []
created_date: '2026-11-22T20:24:00Z'
updated_date: '2026-11-23T15:28:00Z'
labels:
  - McFix
  - McFix Final
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-441/GROUNDER-PLAN.md
  - docs/reports/reviews/task-441/TRIAGE-PLAN.md
  - docs/reports/reviews/task-441/seat-integration-1.md
  - docs/reports/reviews/task-441/seat-reality-check-1.md
  - docs/reports/reviews/task-441/seat-regression-1.md
type: build
ordinal: 141012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "We just want to focus on getting the right tests that mirror the engineering and compliance." THIS TASK: tests for the engineering-standards rules ranked by FINAL.5, a few per round; each test is proven red on a planted defect before it counts. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: src/tests/no-blocking-dialogs.logic.test.ts, src/tests/ui-component-isolation.logic.test.ts, src/tests/non-null-assertion-comment.logic.test.ts, backlog/tasks/task-441 - FINAL.6-Engineering-standards-tests-one-test-per-engineering-rule-that-has-none-a-few-at-a-time-each-proven-to-fail-first.md, docs/reports/reviews/task-441/
<!-- SECTION:DESCRIPTION:END -->

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
# PLAN-441-v1

**Task:** task-441 FINAL.6, engineering-standards tests (type build, card `backlog task view task-441 --plain`). **Plan seat:** Opus, read-only (RR-0385 item 1, MORNING-DECISIONS.md:1917). **Build seat:** Opus (the build lane runs on Opus, RR-0385 item 1 and the card's words plan written and built on Opus); the three plan seats and the grounders run on Sonnet (RR-0385 item 1). **Board read:** wf2/board at cc584b87b, and re-read at 81882a1e3. The five commits between them touch only src/tests/hooks-composition.infra.test.ts and step-validate-vitest-fork-cap. They change none of the app code, the standards doc or the task-440 files this plan reads (`git diff --stat cc584b87b..HEAD -- src mobile docs/specs/00_engineering_standards.md eslint.config.mjs docs/reports/reviews/task-440`). All counts below were measured at 81882a1e3 with read-only node scripts, and re-measured by the plan grounder at 086e6bcc6 (535 files, 177 assertions, 166 undocumented, 60 files: the same). **Estimate (GUESS, not measured):** one Opus lane session for the build, about 600 lines of new test code in three files, one work commit and one closing commit; the review rounds are the orchestrator's and are not in this figure.

## 0. Facts verified (file:line)

- The look's group 2 (FINAL.5 is task-440, RULE-CHECKS.md:1) top three are §12.7, §1.2 and §2.1, "the first three live none rows by rank". §12.5 and §12.3 are flagged superseded (docs/reports/reviews/task-440/RULE-CHECKS.md:24, rows :35-39). The grounder confirmed this (GROUNDER-LOOK.md:202-204). The next none row is rank 6, §2.3 (RULE-CHECKS.md:40).
- §12.7 is live. The dated note says "This note rules nothing on §12.7 (Sonner)" (docs/specs/00_engineering_standards.md:308).
- Rule texts: §1.2 at :17-18, §2.1 at :37-39, §2.3 at :45-47, §12.7 at :342-345. Section 12's status line is at :306.
- Search for existing checks:
  - eslint.config.mjs:22-36 has no no-alert rule and no non-null-assertion rule.
  - biome.json covers only src/features/leads, src/lib/observability and src/app/api (biome.json:8-13). Biome has a `noAlert` rule (node_modules/@biomejs/biome/configuration_schema.json:12772). Settled: biome explain noAlert prints default severity info and no recommended line, so it is off, and ESLint core no-alert is off too (eslint.config.mjs:22-36). Biome's recommended noNonNullAssertion IS on for src/features/leads and src/lib/observability (biome.json:21; the src/app/api override at :44 sets recommended false): it warns on every `!` whether commented or not, and a plain biome lint run today reports 0 of its warnings, because those two folders hold none. So §2.3 stays a none row of the look: no check reads the "document why" comment.
  - scripts/ast-grep-rules/ holds seven files, none of them on these rules (`ls`; GROUNDER-LOOK.md:118).
  - In src/tests, scripts/hooks and .husky, `git grep -nE "noAlert|no-alert|window\.alert|'alert'"` hits only `role='alert'` assertions in three .ui tests.
  - scripts/analysis/gates/: mobile-never-do.mjs checks the Spec 90 list for mobile only (mobile-never-do.mjs:1-10, :19-20). No gate checks these four rules.
- Helpers and patterns this plan reuses:
  - The tracked-file listing through `git ls-files`, and its reason (src/tests/script-source-scan.ts:6-24, :94-101).
  - The KNOWN_BAD planted-fixture case that "proves each pattern still fires" (src/tests/resolve-db-adoption.logic.test.ts:63-76).
  - The reasoned exception map `FENCED: Record<string, string>`: "An entry here is a promise the exclusion was reasoned about" (script-source-scan.ts:33-45).
  - The exact per-file pin, "exact counts in both directions ... shrink-only" (src/tests/surfaces/surface-conformance.logic.test.ts:36-38).
  - The TypeScript parser, used the same way at surface-conformance.logic.test.ts:24 and mobile-never-do.mjs:14.
  - The mobile scope regex `export const SKIP` (mobile-never-do.mjs:20), its module is already imported by a test (src/tests/gate-mobile-compliance.infra.test.ts:7, which reads gateC.scan and gateC.ROWS, not SKIP).
- Live state:
  - §12.7: no call to alert, confirm or prompt in src/ code. The only hits are comments, at src/components/admin/FlightCenterTool.tsx:9 and :102 (`git grep` of the bare calls and of the window, globalThis, self and bracket forms alike; the grounder re-ran it: 0 other hits, and no function, import or destructured name called alert, confirm or prompt exists in src outside src/tests).
  - §1.2: src/components/ui/ holds 2 tracked files, Badge.tsx and ScoreBadge.tsx (`git ls-files src/components/ui`). Neither has a fetch, context read or query hook (`git grep`, 0 hits).
  - §2.3: 177 non-null assertions in 535 scanned files. 166 of them have no comment on their own line or the line above, in 60 files: 148 in 49 src files and 18 in 11 mobile files (TypeScript AST count). The top files are src/lib/parcels/geometry.ts 19, src/lib/quality/metrics.ts 17, src/app/api/admin/users/[uid]/route.ts 12, src/lib/massing/geometry.ts 12 and src/lib/admin/parcel-lookup.ts 11.
- tsconfig.json:7-8 sets `strict` and `noUncheckedIndexedAccess`, and mobile/tsconfig.json:4 sets `strict`. So the compiler already enforces the first sentence of §2.3 (check for null before access) wherever no `!` overrides it.
- Hooks:
  - The pre-commit hook runs typecheck, then lint, then the related run on staged `src|scripts` .ts/.tsx/.js/.mjs files (.husky/pre-commit:54-55, :56, :85). A staged test file therefore runs itself.
  - Commit subjects must match `type(NN_name): ...`, with `test` allowed (scripts/hooks/validate-commit-msg.sh:4, :24).
  - A code commit needs `Task: task-N` (CLAUDE.md Prime Directive 12; scripts/hooks/check-backlog-task.mjs).
- Plain `src/tests/*.logic.test.ts` paths are not in mcbylaws/protected-paths.json. The protected and frontend globs are `src/tests/surfaces/**`, `bylaw*` and `mcbylaws-*` (:11, :20-30, :63).
- Not on the card or the board: the task has no separate queue row. `git grep task-441 -- .cursor docs/specs/00-architecture/137_mcqueue.md` finds nothing, so the backlog task file is the row.

UNVERIFIED:
- (Nothing left on noAlert: settled in section 0.)
- That a new test carrying an `00_engineering_standards.md` SPEC LINK needs no system-map edit. Precedent: test-db-setup-guard.logic.test.ts:1 carries that link and 00_system_map.md has no 00_engineering_standards row. Settled by reading: scripts/generate-system-map.mjs:100-111 builds map rows from spec text (Target Files and the test names written inside a spec), never from a test's SPEC LINK header, and src/tests/system-map.infra.test.ts (pre-commit :47) compares the committed map with that build, so a new test adds no row.

## 1. Scope

In:
- Three new test files under src/tests/, one per rule (section 3), each with a real-tree case, planted RED cases and controls.
- Each proven red on a planted file through the real pre-commit hook.
- The task file updated through the backlog CLI in the same commit.
- Review records under docs/reports/reviews/task-441/.

Out:
- No fix of any live break: the 166 `!` in section 4 stay as they are.
- No edit to eslint.config.mjs, biome.json, scripts/ast-grep-rules, hooks, gates or the standards doc.
- No new helper file. No card.
- No check of the parts of each rule that a machine cannot judge (named in section 2).
- §2.1 is not planned this round (section 2, Q1).

## 2. Rules chosen (look rank, rule text)

1. **§12.7, rank 3** (RULE-CHECKS.md:37). :343 "Use Shadcn's Sonner integration for all success/error/info notifications. Use `toast.success()`, `toast.error()`, `toast.info()`." :344 "**Never:** Build custom alert banners. Never use `alert()`, `confirm()`, or `prompt()` (they freeze the entire mobile browser)."
   - Tested: the `alert()`, `confirm()`, `prompt()` sentence.
   - Not tested: "for all ... notifications" and "custom alert banners". A scan cannot tell a notification or a banner from other UI.
2. **§1.2, rank 4** (RULE-CHECKS.md:38). :18 "Shared UI components (`src/components/ui/`) must remain pure and stateless where possible. They should not directly fetch data via API calls or rely on global context unless explicitly engineered to do so."
   - Tested: the second sentence, with "unless explicitly engineered" as a reasoned exception map (empty today).
   - Not tested: "stateless where possible", because "where possible" is a judgment.
3. **§2.1, rank 5: not machine-testable as written, so it is skipped.**
   - :38 "When writing integration tests (`.infra.test.ts`), you MUST include tests for **error paths and silent failures**."
   - :39 "Force errors in the deepest layer of the call stack ... and explicitly assert that the top layer recovers gracefully or returns a safe HTTP 500 without leaking the raw `.message`."
   - RULED (Q1): skipped, for two reasons. (a) The name does not say which .infra files the rule binds: the standard gives `*.infra.test.ts` to API routes, DB queries and external calls (:107, :127), and also to parity batteries (:111) and to the DB-replay example assert-data-bounds.infra.test.ts (:109), so the set the rule binds is not defined by the name. (b) is the next line.
   - Whether a case "forces errors in the deepest layer" and checks "recovers gracefully" is a reading of the test body. A scan sees names and assertions, not where an error was forced.
   - Measured: of 307 tracked .infra.test.ts files, 125 have neither an error-worded case title nor a throw or reject assertion. 234 have no throw, reject, 5xx or non-zero-exit assertion. Of the 34 files that import a route handler, 13 have no `toBe(500)`.
   - Those numbers depend on the proxy chosen, not on the rule. So the next row is taken (brief; Q1). The skip is not a re-rank: ranks 3, 4 and 6 are tested and rank 5 stays a none row in the look, named in REPORT.md for a later round (no card, RR-0392, MORNING-DECISIONS.md:1975). RR-0385 item 4(ii) (:1920) asks for the operator only on a product choice no spec settles, and the operator's words on the card, the right tests that mirror the engineering and compliance, ask for tests that can be proven red, which a rule no machine check can judge cannot be.
4. **§2.3, rank 6** (RULE-CHECKS.md:40). :46 "Before accessing nested object properties, explicitly check for `null` or `undefined`." :47 "Do NOT use the non-null assertion operator (`!`) unless the value's existence is mathematically guaranteed by a prior validation step. If using `!`, you must document why in an inline comment."
   - Tested: "If using `!`, you must document why in an inline comment".
   - Not tested: "mathematically guaranteed", which is a judgment. :46 is already compiler-enforced (tsconfig.json:7).

## 3. The tests

All three files follow these rules:
- First line `// SPEC LINK: docs/specs/00_engineering_standards.md §N.M (:line)` (CLAUDE.md Prime Directive 3).
- No DB, no network.
- Files are listed with `execFileSync('git', ['ls-files', '--', ...])` (script-source-scan.ts:94-101 pattern). Staged files are in the index, so a staged plant is seen.
- Parsing uses `ts.createSourceFile` with TSX kind for .tsx files, and a `ts.forEachChild` walk.
- Each file exports one pure finder `(rel, text) => Hit[]` with `Hit = { file, line, what }`. The real-tree case reports hits as `file:line what`, and the scanned-file count is printed (the vacuous-pass guard of surface-conformance.logic.test.ts:16-17).
- The name pattern is `<subject>.logic.test.ts`, like the source-scan locks resolve-db-adoption.logic.test.ts and test-db-setup-guard.logic.test.ts.

### 3.1 §12.7: src/tests/no-blocking-dialogs.logic.test.ts

- **Scope:** tracked `src/**/*.ts(x)`, minus `src/tests/**`, `*.test.*` and `*.d.ts`. That is 400 files today. Mobile is out: section 12 is web front end (:304-306), and mobile has its own list (Spec 90 §5, mobile-never-do.mjs:5).
- **Finder:** a CallExpression whose callee is:
  - the Identifier `alert`, `confirm` or `prompt`; or
  - a PropertyAccessExpression on `window`, `globalThis` or `self` with one of those names.
- **Cases:**
  - A. Real tree: `expect(hits, report).toEqual([])` and `expect(files.length).toBeGreaterThan(300)` (400 today: a listing that silently shrinks turns it red).
  - B. RED planted, KNOWN_BAD style: `alert('x')`, `window.confirm('y')` and `globalThis.prompt('z')` each give exactly one hit with that name.
  - C. Controls, 0 hits: `toast.error('x')`, `form.confirm()`, `// alert('x')`, `const s = 'please confirm (now)'` and `<p>alert(1)</p>`.
- **Planted defect:** `alert('planted-441')` in the shared plant file (section 3.4). It turns case A red at `toEqual([])` with the plant's file:line.
- **Reuse:** the KNOWN_BAD case shape (resolve-db-adoption.logic.test.ts:63-76), git ls-files (script-source-scan.ts:94-101) and the TypeScript parser (surface-conformance.logic.test.ts:24). ESLint core `no-alert` and Biome `noAlert` exist but are not turned on. Turning one on is a config change the card does not name (Q2).

### 3.2 §1.2: src/tests/ui-component-isolation.logic.test.ts

- **Scope:** tracked `src/components/ui/**/*.ts(x)`, 2 files today.
- **Exception map:** `ENGINEERED: Record<string, string> = {}`. It mirrors "unless explicitly engineered to do so", in the FENCED form of script-source-scan.ts:33-45: one entry per file, with its reason.
- **Finder:**
  - a CallExpression whose callee is the Identifier `fetch`, `useContext`, `use`, `useQuery`, `useMutation`, `useInfiniteQuery` or `useSuspenseQuery`;
  - or `React.useContext`, `React.use` or `window.fetch`;
  - or an ImportDeclaration from `'@tanstack/react-query'`.
- **Cases:**
  - A. Real tree minus ENGINEERED gives `[]`, and the file count is more than 0.
  - B. Each ENGINEERED key is a tracked file under src/components/ui. One line; it stops a stale entry.
  - C. RED planted: `fetch('/api/x')`, `useContext(Theme)`, `React.useContext(T)`, `use(Ctx)`, `useQuery({ queryKey: ['k'] })` and `import { useQueryClient } from '@tanstack/react-query'` each give one hit.
  - D. Controls, 0 hits: `useState(0)`, `cn('a')`, `api.fetch()`, `// fetch('/api')` and `'fetch('`.
- **Planted defect:** the shared plant file lives under src/components/ui/ and holds `fetch` and `useContext`. It turns case A red with two hits.
- **Reuse:** the FENCED pattern and the KNOWN_BAD pattern. maxbld-web-pages.logic.test.ts:191-193 bans `useQuery` in page files with a local regex list that is not exported, so it cannot be imported. This test reuses its planted-text form instead.

### 3.3 §2.3: src/tests/non-null-assertion-comment.logic.test.ts

- **Scope:**
  - tracked `src/**/*.ts(x)`, minus `src/tests/**`, `*.test.*` and `*.d.ts`;
  - plus tracked `mobile/**/*.ts(x)`, minus `mobile/__tests__/**`, `*.test.*` and anything `SKIP` (imported from scripts/analysis/gates/mobile-never-do.mjs:20) matches.
  - That is 535 files today.
- **Documented:** a comment range (from `ts.getLeadingCommentRanges` or `ts.getTrailingCommentRanges` collected over the file) touches the `!`'s own line or the line directly above (Q3).
- **Finder:** each `ts.isNonNullExpression` node that is not documented.
- **Header note:** the file header says that Biome's recommended noNonNullAssertion also covers two folders (warn only, every `!` documented or not; section 0) and that this test is the comment-present half of §2.3, the half no other check reads.
- **Pin:** `UNDOCUMENTED_BANG_PIN: Readonly<Record<string, number>>`. RULED (plan review round 1): it is a CEILING, not an exact pin. It holds the 60 files and the count each has today (166 total), measured by the lane at its own head just before commit 1. A file may hold fewer than its number, and nothing is edited when a `!` is fixed or documented; a file with more than its number, or a file not in the pin with any, turns the test red. No number is ever raised: a new undocumented `!` is fixed by writing its why comment on the line or the line above, which is what §2.3 asks, in the lane's own file. The pin comment says so, and says that counts are AST nodes (`x!!` counts twice). It keeps the shape of REPORT_RENDERER_PIN (surface-conformance.logic.test.ts:36-38) without its lower-bound half.
- **Comparison:** a small pure `pinProblems(actual, pin)` lists:
  - a file with hits that is not in the pin;
  - a count above its pin;
  - nothing for a count below its pin, a pinned file now at 0 or a pinned file that is gone (the ceiling refuses growth only).
- **Cases:**
  - A. Real tree: `expect(pinProblems(actual, PIN), report).toEqual([])`, and the sum of the pin is printed. The failure text for a file over its number says: document the `!` with a why comment on the line or the line above; do not raise the number.
  - B. RED planted: `x!.a` gives 1. `const v = m.get(k)!;` gives 1. `foo!()` gives 1.
  - C. Controls, 0: `x!.a // guarded by parse() above`, `x!.a` with `// why` on the line above, `x?.a` and `let y!: number` (a definite assignment, not a NonNullExpression). Also: `mobile/node_modules/x.ts` matches the imported SKIP, so a rename of the export fails loudly.
  - D. `pinProblems` in memory: `({a:2},{a:1})` gives 1 problem, `({a:0},{a:1})` gives `[]` (a fixed `!` is not a problem), `({b:1},{})` gives 1, and equal input gives `[]`.
- **Planted defect:** an undocumented `v!.n` in the shared plant file. It turns case A red at `toEqual([])` with "not in the pin, 1".
- **Reuse:** the per-file pin form (surface-conformance.logic.test.ts:38), used as a ceiling that only refuses growth, mobile `SKIP` (mobile-never-do.mjs:20) and git ls-files.

### 3.4 Shared plant and passing control (red through the real hook)

The plant is `src/components/ui/Planted441.tsx`, staged with the three tests, never committed:

```tsx
import { createContext, useContext } from 'react';
const Ctx = createContext(0);
export function Planted441({ v }: { v?: { n: number } }) {
  const c = useContext(Ctx);
  void fetch('/api/planted-441');
  alert('planted-441');
  return <span>{v!.n + c}</span>;
}
```

Steps:
1. Run `git commit` with the three tests and the plant staged. Typecheck and lint pass: no rule bans these forms (eslint.config.mjs:22-36). The related run (.husky/pre-commit:85) then fails:
   - 3.1 A, red at `toEqual([])` with the alert line;
   - 3.2 A, red with fetch and useContext;
   - 3.3 A, red at the pin with Planted441.tsx "not in the pin, 1".
   The lane saves the hook output to docs/reports/reviews/task-441/red.out. A red for any other reason, such as a typecheck error, is a test defect and is fixed now (08_agents.md §11.3). Before the red run the lane runs `npm run typecheck` and `npm run lint` once with the three tests present, so a refusal at those stages is not mistaken for the red. red.out names the stage that refused (the related run, .husky/pre-commit:85) and the test files it ran, and the red is checked by the failure texts of section 7 item 2, not by the plant's file name. The plant also turns src/tests/surface-registry.infra.test.ts red if that test runs while the plant is on disk (it walks src/components on disk, :31, and pins the unowned set exactly, :213-224); the related run does not select it (no import edge to the plant), the lane runs no full suite while the plant exists, and step 2 deletes the plant right after the red run. If the commit succeeds with the plant staged, the related run did not select the tests: the lane removes the plant in an immediate follow-up commit (`git rm`, same trailer), records it in REPORT.md and does not push.
2. Passing control: `git rm --cached` the plant and delete it, then commit the three tests. The same hook runs them green (commit 1). Before the red run, and again against the actual diff before Green Light, the lane writes in its report a 5-10 item PASS/FAIL self-skeptical checklist drawn from §12.7, §1.2 and §2.3 (00_engineering_standards.md:288, the Pre-Review Self-Checklist of section 11).

## 4. Known live breaks (named for the orchestrator, not fixed)

- §2.3: 166 undocumented `!` in 60 files (148 in 49 src files, 18 in 11 mobile files; section 0). They land as a per-file ceiling that only refuses growth: the pin form the repo uses for known exceptions (surface-conformance.logic.test.ts:36-38), without its lower-bound half. A fix card, if any, is the orchestrator's call; this card opens none (RR-0392).
- §12.7: 0. §1.2: 0.
- §12.7 observation, not a break this test judges: the rule names "Shadcn's Sonner integration", but there is no Shadcn sonner wrapper (src/components/ui holds only Badge.tsx and ScoreBadge.tsx). Code imports `sonner` directly (for example src/app/(maxbld)/admin/layout.tsx:13). The dated note :308 supersedes Shadcn for §12.5 only and "rules nothing on §12.7".

## 5. Files

Files: src/tests/no-blocking-dialogs.logic.test.ts, src/tests/ui-component-isolation.logic.test.ts, src/tests/non-null-assertion-comment.logic.test.ts, backlog/tasks/task-441 - FINAL.6-Engineering-standards-tests-one-test-per-engineering-rule-that-has-none-a-few-at-a-time-each-proven-to-fail-first.md, docs/reports/reviews/task-441/

The plant src/components/ui/Planted441.tsx is never committed.

## 6. Landing

- **Commit 1 (work):** the three tests and the task file (through the backlog CLI: plan and notes text only; the status moves to BUILT in the separate closing commit, Spec 137 rule 3 note 2026-11-20), in one commit through the real hooks, none bypassed.
  - Subject: `test(00_engineering_standards): task-441 tests for §12.7, §1.2 and §2.3, each proven red on a planted file`
  - Trailer: `Task: task-441`.
  - The body names the principles served (DoD #9). It also states the ceiling (166 in 60 files, re-measured at the head just before the commit) and that §2.1 was skipped (section 2 item 3, Q1).
- **Output review:**
  - DeepSeek runs, on the output, the Spec 08 section 7 lens set that rule-lists.mjs lensSet and check-lane-close.mjs enforce for this Files line (code-review and error-paths), the compliance lens once per resolved list (queue-137, agents-s7-s11, five-words, plan-protocol, inc-S, ms-S: files out-compliance-<list id>.txt) and the engineering lens (eng-all: out-engineering-eng-all.txt) (RR-0385 item 2), then a separate grounder runs BEFORE any fold (RR-0359, MORNING-DECISIONS.md:1687).
  - Two rounds at most: round 1 fixes CRITICAL, HIGH and MED, round 2 fixes CRITICAL and HIGH (RR-0385 item 3, :1919).
  - Fixes are new commits with the same trailer; after each fix commit every lens input is re-made with rule-lists.mjs lens-input and every lens output re-run under the same names (08_agents.md section 7, note 2026-11-20, task-399 fix round 1).
- **Close:** a separate closing commit holds the records only: red.out in docs/reports/reviews/task-441/, and the lane report copy docs/reports/lanes/<date>/<lane>/ with REPORT.md, GROUNDER.md, the out- lens outputs and TRIAGE.md (one outcome line per CONFIRMED id; check-task-files always allows that path, so it is not on the Files line). The same commit sets the task file BUILT with the evidence: sha, test names and hook result (DoD #7), adds the refs (backlog task edit task-441 --add-ref for REPORT.md, GROUNDER.md and TRIAGE.md) and sets the expires date (close date plus 7 days).
- The lane never pushes. The orchestrator folds and pushes with the operator's y (RR-0385 item 4(iii)). Landing order for the ceiling: other branches add `!` (the Integration seat counted, by merge-base, mf83-daylight +9, wf1/mf83-g3 +10, mf47-checkout +4, wf1/mf37-1109 +1, wf1/mf48-1111 +1; wf1/inc1b-thinroute -1 is a fix and stays green under a ceiling; which are still alive is not known). The related run at a lane's commit does not select this test (it reads files and imports none), so a red from one of those lanes first shows at the push suite. Before the push the orchestrator runs this test on the push head: the lane that added the `!` documents it in its own file, and when task-441 lands last the orchestrator re-measures the pin in a fix commit on task-441 (the pin file is on its Files line). No other lane edits the pin file.

## 7. Acceptance

1. Lane: `git ls-files src/tests | grep -cE '^src/tests/(no-blocking-dialogs|ui-component-isolation|non-null-assertion-comment)\.logic\.test\.ts$'` prints `3`.
2. Lane: in docs/reports/reviews/task-441/red.out, `grep -c 'not in the pin, 1'` prints `1`, and the alert line of 3.1 A and the fetch and useContext lines of 3.2 A each appear as the failure text of their own test, not as a lint or typecheck line (the file name alone is not proof). The file shows the three designed assertions failing in one refused pre-commit run, with the related run named as the stage that refused.
3. Lane: `git ls-files src/components/ui` prints Badge.tsx and ScoreBadge.tsx only, so the plant is not tracked.
4. Lane: `git log -1 --format=%B <commit 1> | grep -c '^Task: task-441$'` prints `1`. The commit's hook log shows the three files green in the related run.
5. Lane: `head -1` of each test file starts with `// SPEC LINK: docs/specs/00_engineering_standards.md`.
6. Lane: `git diff --stat <launch>..HEAD -- eslint.config.mjs biome.json scripts .husky docs/specs src mobile ':!src/tests'` prints nothing.
7. Lane: in the §2.3 test, the pin's values sum to the count the lane measures at its own head immediately before commit 1 (166 in 60 files at 81882a1e3, and the same at 086e6bcc6), and the pin has one entry per file with hits at that head.
8. Orchestrator: `npm run test` passes at pre-push.

## 8. Risks and rollback

- **The ceiling is hit by another lane.** A lane that adds an undocumented `!` in src or mobile turns 3.3 red at the push suite (section 6, landing order). That is the rule working: the fix is the why comment, never a raised number. A fixed or documented `!` turns nothing red. Slack remains: a file that falls below its number leaves room for new undocumented `!` up to that number until the next re-measure, and the pin comment says so. Risk: low to moderate on a busy board.
- **Lint on the plant.** If lint flags the plant's floating `fetch`, red comes from the wrong step. `void fetch(...)` avoids that. If typecheck or lint still fails, the lane fixes the plant, not the hook.
- **Proxy limits.**
  - 3.1 misses `window['alert']()` and aliased calls, and it matches by name only: a local function, an import or a destructured name called alert, confirm or prompt gives a false red and is renamed (none exists in src today).
  - 3.2 misses data reads through a custom hook.
  - 3.3 accepts any comment as "document why".
  These limits are stated in each file's header, not widened (no scope creep).
- **Related-run cost.** The plant is a new file with no importers, so only the three staged tests run (no heavy lane).
- **Rollback.** `git revert` commit 1. No runtime code changes.

## 9. Questions for the plan grounder

- **Q1.** Is the skip of §2.1 right under the brief's "cannot be tested by a machine check at all" (section 2 item 3)? The other choice is a ratchet over the 34 route-importing .infra tests, with a 13-file grandfather list that the proxy picks. RULED: skip, and not an operator question (section 2 item 3; the ruling is in QUESTIONS-RULED.md of the review folder).
- **Q2.** §12.7: test (recommended), or turn on ESLint core `no-alert`, the check that "already exists"? The card's DoD #4 names a test, and eslint.config.mjs is not on the card (DoD #8). Turning the rule on is a config change that RR-0392's "no other infrastructure" may cover. RULED: the test, the only route this round. A search of the record (the card, MORNING-DECISIONS.md RR-0385 and RR-0392, 08_agents.md) finds no ruling asking for a lint rule; the card names a test (DoD #4), its Files line holds no config file, and RR-0392 (:1975) allows no other infrastructure. Not an operator question.
- **Q3.** §2.3 reading of "inline comment": a comment on the same line or the line directly above RULED: the line directly above counts (11 of 177 pass); the same line only would pass 1 of 177 and give 176 undocumented, not 166, so every number in this plan assumes the ruling.
- **Q4.** §2.3 scope: src and mobile RULED: src and mobile; section 2 has no path scope (:35-47) and the standard binds all developers of the codebase (:5), so mobile is in, with 18 of the 166 in 11 mobile files; scripts/*.ts is left out this round.
- **Q5.** §12.7 scope: all of src RULED: all of src. The status line (:306) says the section was adopted for src/features/leads and is to be expanded; it does not exclude the rest, §12.7 has no path scope (:342-345), and the test is clean today (0 hits in all of src, all call forms).

Plan review round 1: 51 folded, 0 task, 0 ruling, 0 wontfix, 3 pile; grounder docs/reports/reviews/task-441/GROUNDER-PLAN.md; triage docs/reports/reviews/task-441/TRIAGE-PLAN.md
plan-compliance-agents-s7-s11#2 MED folded out-engineering-eng-
plan-compliance-agents-s7-s11#3 MED folded lens input is re-mad
plan-compliance-agents-s7-s11#4 MED folded TRIAGE.md (one outco
plan-compliance-agents-s7-s11#5 MED folded Settled: biome expla
plan-compliance-agents-s7-s11#6 MED folded none row in the look
plan-compliance-five-words#1 MED folded none row in the look
plan-compliance-five-words#2 MED folded RULED: the test, the
plan-compliance-five-words#3 MED folded build lane runs on O
plan-compliance-inc-S#1 MED folded none row in the look
plan-compliance-inc-S#2 MED folded build lane runs on O
plan-compliance-inc-S#3 MED folded RULED: the test, the
plan-compliance-inc-S#4 MED folded the same line only w
plan-compliance-ms-S#2 MED folded none row in the look
plan-compliance-ms-S#3 MED folded RULED: src and mobil
plan-compliance-ms-S#5 MED folded the push the orchest
plan-compliance-plan-protocol#2 MED folded none row in the look
plan-compliance-plan-protocol#4 MED folded Spec 08 section 7 le
plan-compliance-plan-protocol#6 MED folded build lane runs on O
plan-compliance-queue-137#1 MED folded the lane report copy
plan-compliance-queue-137#3 MED folded and notes text only;
plan-compliance-queue-137#4 MED folded TRIAGE.md (one outco
plan-compliance-queue-137#5 MED folded backlog task edit ta
plan-engineering-eng-all#1 MED folded PASS/FAIL self-skept
plan-error-paths#1 MED folded No number is ever ra
plan-plan-review-deepseek#1 MED folded file name alone is n
plan-plan-review-deepseek#2 MED folded from a test's SPEC L
plan-plan-review-deepseek#5 MED folded measured by the lane
rc#1 MED folded recommended noNonNul
rc#2 MED folded the set the rule bin
in#1 MED folded it is a CEILING, not
rg#1 MED folded this test is the com
rg#2 MED folded do not raise the num
<!-- SECTION:PLAN:END -->
