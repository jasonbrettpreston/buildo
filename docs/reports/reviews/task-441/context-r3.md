# Review context for task-441 (no plan id) written 2026-11-23 by backlog-brief.mjs (round 3)

## Task
task-441 FINAL.6 Engineering standards tests: one test per engineering rule that has none, a few at a time, each proven to fail first
status: RUNNING · milestone: m-1 · assignee: @lane-BL-ENG441 · labels: McFix, McFix Final

## Description
Card opened 2026-11-22 by the orchestrator, Spec 137 rule 2, on the operator's ruling RR-0385 (MORNING-DECISIONS.md:1915 entry, RR-0385, decision-170). Operator, verbatim: "We just want to focus on getting the right tests that mirror the engineering and compliance." THIS TASK: tests for the engineering-standards rules ranked by FINAL.5, a few per round; each test is proven red on a planted defect before it counts. Scope and Files line at its plan review. Every build task of this plan follows the six steps, plan written and built on Opus (his words: "I want this plan for each task and built by opus").

Files: src/tests/no-blocking-dialogs.logic.test.ts, src/tests/ui-component-isolation.logic.test.ts, src/tests/non-null-assertion-comment.logic.test.ts, backlog/tasks/task-441 - FINAL.6-Engineering-standards-tests-one-test-per-engineering-rule-that-has-none-a-few-at-a-time-each-proven-to-fail-first.md, docs/reports/reviews/task-441/

## Acceptance criteria

## Implementation Plan
#### PLAN-441-v1

**Task:** task-441 FINAL.6, engineering-standards tests (type build, card `backlog task view task-441 --plain`). **Plan seat:** Opus, read-only (RR-0385 item 1, MORNING-DECISIONS.md:1917). **Build seat:** Opus (the build lane runs on Opus, RR-0385 item 1 and the card's words plan written and built on Opus); the three plan seats and the grounders run on Sonnet (RR-0385 item 1). **Board read:** wf2/board at cc584b87b, and re-read at 81882a1e3. The five commits between them touch only src/tests/hooks-composition.infra.test.ts and step-validate-vitest-fork-cap. They change none of the app code, the standards doc or the task-440 files this plan reads (`git diff --stat cc584b87b..HEAD -- src mobile docs/specs/00_engineering_standards.md eslint.config.mjs docs/reports/reviews/task-440`). All counts below were measured at 81882a1e3 with read-only node scripts, and re-measured by the plan grounder at 086e6bcc6 (535 files, 177 assertions, 166 undocumented, 60 files: the same). **Estimate (GUESS, not measured):** one Opus lane session for the build, about 600 lines of new test code in three files, one work commit and one closing commit; the review rounds are the orchestrator's and are not in this figure.

#### 0. Facts verified (file:line)

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

#### 1. Scope

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

#### 2. Rules chosen (look rank, rule text)

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

#### 3. The tests

All three files follow these rules:
- First line `// SPEC LINK: docs/specs/00_engineering_standards.md §N.M (:line)` (CLAUDE.md Prime Directive 3).
- No DB, no network.
- Files are listed with `execFileSync('git', ['ls-files', '--', ...])` (script-source-scan.ts:94-101 pattern). Staged files are in the index, so a staged plant is seen.
- Parsing uses `ts.createSourceFile` with TSX kind for .tsx files, and a `ts.forEachChild` walk.
- Each file exports one pure finder `(rel, text) => Hit[]` with `Hit = { file, line, what }`. The real-tree case reports hits as `file:line what`, and the scanned-file count is printed (the vacuous-pass guard of surface-conformance.logic.test.ts:16-17).
- The name pattern is `<subject>.logic.test.ts`, like the source-scan locks resolve-db-adoption.logic.test.ts and test-db-setup-guard.logic.test.ts.

#### 3.1 §12.7: src/tests/no-blocking-dialogs.logic.test.ts

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

#### 3.2 §1.2: src/tests/ui-component-isolation.logic.test.ts

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

#### 3.3 §2.3: src/tests/non-null-assertion-comment.logic.test.ts

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

#### 3.4 Shared plant and passing control (red through the real hook)

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

#### 4. Known live breaks (named for the orchestrator, not fixed)

- §2.3: 166 undocumented `!` in 60 files (148 in 49 src files, 18 in 11 mobile files; section 0). They land as a per-file ceiling that only refuses growth: the pin form the repo uses for known exceptions (surface-conformance.logic.test.ts:36-38), without its lower-bound half. A fix card, if any, is the orchestrator's call; this card opens none (RR-0392).
- §12.7: 0. §1.2: 0.
- §12.7 observation, not a break this test judges: the rule names "Shadcn's Sonner integration", but there is no Shadcn sonner wrapper (src/components/ui holds only Badge.tsx and ScoreBadge.tsx). Code imports `sonner` directly (for example src/app/(maxbld)/admin/layout.tsx:13). The dated note :308 supersedes Shadcn for §12.5 only and "rules nothing on §12.7".

#### 5. Files

Files: src/tests/no-blocking-dialogs.logic.test.ts, src/tests/ui-component-isolation.logic.test.ts, src/tests/non-null-assertion-comment.logic.test.ts, backlog/tasks/task-441 - FINAL.6-Engineering-standards-tests-one-test-per-engineering-rule-that-has-none-a-few-at-a-time-each-proven-to-fail-first.md, docs/reports/reviews/task-441/

The plant src/components/ui/Planted441.tsx is never committed.

#### 6. Landing

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

#### 7. Acceptance

1. Lane: `git ls-files src/tests | grep -cE '^src/tests/(no-blocking-dialogs|ui-component-isolation|non-null-assertion-comment)\.logic\.test\.ts$'` prints `3`.
2. Lane: in docs/reports/reviews/task-441/red.out, `grep -c 'not in the pin, 1'` prints `1`, and the alert line of 3.1 A and the fetch and useContext lines of 3.2 A each appear as the failure text of their own test, not as a lint or typecheck line (the file name alone is not proof). The file shows the three designed assertions failing in one refused pre-commit run, with the related run named as the stage that refused.
3. Lane: `git ls-files src/components/ui` prints Badge.tsx and ScoreBadge.tsx only, so the plant is not tracked.
4. Lane: `git log -1 --format=%B <commit 1> | grep -c '^Task: task-441$'` prints `1`. The commit's hook log shows the three files green in the related run.
5. Lane: `head -1` of each test file starts with `// SPEC LINK: docs/specs/00_engineering_standards.md`.
6. Lane: `git diff --stat <launch>..HEAD -- eslint.config.mjs biome.json scripts .husky docs/specs src mobile ':!src/tests'` prints nothing.
7. Lane: in the §2.3 test, the pin's values sum to the count the lane measures at its own head immediately before commit 1 (166 in 60 files at 81882a1e3, and the same at 086e6bcc6), and the pin has one entry per file with hits at that head.
8. Orchestrator: `npm run test` passes at pre-push.

#### 8. Risks and rollback

- **The ceiling is hit by another lane.** A lane that adds an undocumented `!` in src or mobile turns 3.3 red at the push suite (section 6, landing order). That is the rule working: the fix is the why comment, never a raised number. A fixed or documented `!` turns nothing red. Slack remains: a file that falls below its number leaves room for new undocumented `!` up to that number until the next re-measure, and the pin comment says so. Risk: low to moderate on a busy board.
- **Lint on the plant.** If lint flags the plant's floating `fetch`, red comes from the wrong step. `void fetch(...)` avoids that. If typecheck or lint still fails, the lane fixes the plant, not the hook.
- **Proxy limits.**
  - 3.1 misses `window['alert']()` and aliased calls, and it matches by name only: a local function, an import or a destructured name called alert, confirm or prompt gives a false red and is renamed (none exists in src today).
  - 3.2 misses data reads through a custom hook.
  - 3.3 accepts any comment as "document why".
  These limits are stated in each file's header, not widened (no scope creep).
- **Related-run cost.** The plant is a new file with no importers, so only the three staged tests run (no heavy lane).
- **Rollback.** `git revert` commit 1. No runtime code changes.

#### 9. Questions for the plan grounder

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

## Implementation Notes
2026-11-23 taken on the board at lane launch (lane BL-ENG441, worktree /Users/brettpreston_macmini/Buildo-wt-eng441, branch wf1/inc1b-eng441), RR-0240

2026-11-23 lane BL-ENG441 build: three tests written (src/tests/no-blocking-dialogs.logic.test.ts, src/tests/ui-component-isolation.logic.test.ts, src/tests/non-null-assertion-comment.logic.test.ts). Ceiling measured at head efaca9109 just before commit 1: 535 files scanned, 166 undocumented ! in 60 files (148 in 49 src files, 18 in 11 mobile files), equal to the plan. npm run typecheck and npm run lint passed with the three tests and the plant present. Red run next: plant src/components/ui/Planted441.tsx staged with the tests, never committed.

2026-11-23 lane BL-ENG441 STOPPED at the red run (brief: a hook refusal for a file not on the Files line stops the lane). The commit attempt with the three tests, the task file and the plan's plant src/components/ui/Planted441.tsx staged was refused by .husky/pre-commit:38 (node scripts/violations/generate-surface-registry.mjs --check), hook text: [surface-registry] DRIFT — docs/reports/generated/127-surface-registry.md is stale. The generator walks src/components on disk for .tsx files (scripts/violations/generate-surface-registry.mjs:229-240, used at :1425 as unowned components), so the plant drifts the registry before typecheck, lint and the related run (:85). The plan fact in QUESTIONS-RULED.md:37 (the generator the hook runs at :38 reads the census JSON not the disk) is wrong. The plant was unstaged and deleted at once; git ls-files src/components/ui prints Badge.tsx and ScoreBadge.tsx only. No commit made; no output review run. Ruling owed: e.g. the plant as a .ts file (the walker reads .tsx only, :238), a plan change.

2026-11-23 plant ruling (Cairn-Ground-P441): the plant is src/components/ui/Planted441.ts, exporting usePlanted441; the surface-registry generator at .husky/pre-commit:38 walks src/components .tsx files on disk (generate-surface-registry.mjs:229-240); plan 3.4 and its Planted441.tsx references read as the .ts file.

2026-11-23 red (lane BL-ENG441): commit attempt with the three tests, the task file and src/components/ui/Planted441.ts staged, refused by the related run (.husky/pre-commit:85) after typecheck and lint passed: Test Files 3 failed (3), Tests 3 failed | 8 passed (11). 3.1 A: 'src/components/ui/Planted441.ts:6 alert()'; 3.2 A: 'src/components/ui/Planted441.ts:4 useContext()' and ':5 fetch()'; 3.3 A: 'src/components/ui/Planted441.ts: not in the pin, 1'. Plant unstaged and deleted right after (git ls-files src/components/ui: Badge.tsx, ScoreBadge.tsx). Hook output: docs/reports/reviews/task-441/red.out.

2026-11-23 green and acceptance (lane BL-ENG441): commit 1 = 8cf51f3cc through the real hooks (commit-exit 0); related run: '§1.2: scanned 2 files, 0 hits', '§12.7: scanned 400 files, 0 hits', '§2.3: scanned 535 files, 166 undocumented ! in 60 files, pin sum 166', 'Test Files 3 passed (3) / Tests 11 passed (11)'. Acceptance 1: prints 3. Acceptance 2: grep -c 'not in the pin, 1' red.out prints 2, not 1 (the runner prints each failure twice: under the test row, red.out:752, and in the Failed Tests section, red.out:785); the alert, useContext and fetch lines appear as the failure text of 3.1 A (red.out:757-759), 3.2 A (red.out:810-813) and 3.3 A (red.out:783-785) in the related run (Test Files 3 failed (3)), after tsc --noEmit (red.out:126) and next lint (red.out:130). Acceptance 3: git ls-files src/components/ui prints Badge.tsx and ScoreBadge.tsx only. Acceptance 4: prints 1. Acceptance 5: all three start with '// SPEC LINK: docs/specs/00_engineering_standards.md'. Acceptance 6: git diff --stat efaca9109..HEAD on the config, scripts, hooks, specs, src and mobile minus src/tests prints nothing. Acceptance 7: pin sum 166 over 60 entries equals the measure at efaca9109 (166 in 60 files) and the green run prints the same. Acceptance 8 is the orchestrator's (pre-push suite), not run.

## References
- docs/reports/reviews/task-441/GROUNDER-PLAN.md
- docs/reports/reviews/task-441/TRIAGE-PLAN.md
- docs/reports/reviews/task-441/seat-integration-1.md
- docs/reports/reviews/task-441/seat-reality-check-1.md
- docs/reports/reviews/task-441/seat-regression-1.md
- compliance:eng-all docs/specs/00_engineering_standards.md
- compliance:queue-137 docs/specs/00-architecture/137_mcqueue.md
- compliance:agents-s7-s11 docs/specs/00-architecture/08_agents.md
- compliance:five-words docs/specs/01-pipeline/132_step_standard_handbook.md
- compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
- compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
- compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md

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
- RR-0384 Task-430 scope approved: stop the handbook clipping, lines reflect their dated notes, add the 13 lines (item 9 a pointer)
- RR-0140 Operator: faster pushes and GOs asked
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0386 Task-367: gates parked, handbook tests start fresh; landing gates A and B is a later decision with its own card
- RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped
- RR-0388 McFixReborn waits until the new tests are in place
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
- RR-0012 2026-11-15 morning: INC5 recapture commit 068a51af0, not push-ready
- RR-0144 Operator answer PRG-1: purge rule
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
- RR-0385 McFix Final plan: Opus plans and builds, engineering seat, two rounds, validation without the operator, unbuilt gates withdrawn, tests are the focus (names RR-0385) — "proceed. Are there any more questions - Label all realted tasks McFix Final. Ensure the previously mentioned tasks outside this plan are either updated or deleted or kept" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1915)
- RR-0388 McFixReborn waits until the new tests are in place (names task-441) — "Let's wait for the McFixReborn until the new tests are in place - does that make sense?" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1947)
- RR-0392 one push for all four; no other infrastructure beyond this (names RR-0392) — "Push for all 4. I  don't think we need any other infastrcuture beyond this.. we are good to go!" (/Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1975)

## Prior reviews and lane reports
### task-441 (this task)
- docs/reports/reviews/task-441/FINDINGS-PLAN.md
- docs/reports/reviews/task-441/FOLD-CHECK.md
- docs/reports/reviews/task-441/GROUNDER-PLAN.md
- docs/reports/reviews/task-441/QUESTIONS-RULED.md
- docs/reports/reviews/task-441/TRIAGE-PLAN.md
- docs/reports/reviews/task-441/seat-integration-1.md
- docs/reports/reviews/task-441/seat-reality-check-1.md
- docs/reports/reviews/task-441/seat-regression-1.md

## Dependencies
- (none)
