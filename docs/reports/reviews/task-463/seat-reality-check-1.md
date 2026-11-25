# Seat: reality-check: task-463 plan (PLAN-463-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 9de5c2129 (wf2/board). Files read: the task-463 file, FINDINGS-PLAN.md, mobile/package.json, mobile/eas.json, mobile/package-lock.json (grep), .github/workflows/mobile-ci.yml, .husky/pre-push-checks.sh, src/tests/hooks-composition.infra.test.ts (:15-21, :525-560), Spec 98, scripts/analysis/rule-lists.json, docs/reports/generated/rule-lists-by-kind.md, commit 06811e273 (stat), src/tests/backlog/rule-lists.logic.test.ts (:920-921, :975-992), MD:1975, :2200-2204, :2388-2394, 00_system_map.md:126-130. Ran only read-only greps and in-memory `node -e` copies of the text. No file written, no test runner, no database, no dotenv.

## Checked and clean
- mobile/package.json:13 is `"lint": "eslint src app --ext .ts,.tsx",`. Line 12 is `typecheck` with a trailing comma and line 14 is `safe-start`. The only "eslint" hit in the file is :13.
- No eslint config in mobile/ (`ls -a mobile | grep -i eslint` is empty). mobile/eas.json has no "lint" hit. mobile/package-lock.json has 0 hits for `"lint"`.
- .github/workflows/mobile-ci.yml:29-31 are `npm ci --legacy-peer-deps`, `npm run typecheck`, `npm run test:ci`.
- .husky/pre-push-checks.sh:12-13 are `step mobile-typecheck …` and `step mobile-tests …`. The step list is static text.
- The other `npm run lint` hits are all the web (root) lint: .husky/pre-commit:55, .github/workflows/test.yml:63, package.json:15, CLAUDE.md:33 and :59. My grep also hit scripts/task-init.mjs:106,119,130 (template text) and scripts/analysis/precommit-budget.mjs:164-166 (fixture strings). Neither touches mobile. `grep "mobile.*run lint|lint.*mobile"` over .github, .husky, package.json and scripts/*.mjs found nothing.
- hooks-composition.infra.test.ts: `describe('task-424 — one list of pre-push checks'` is at :529. LIST_LINES carry the phone steps at :551-552 (the plan's range is right). `fs`, `path` and `REPO_ROOT` exist at :15, :16, :21.
- Spec 98: :118 is `- `npm run lint` (ESLint)`. :120 is a blank line, and the "Pre-Build Checks" text is at :121. The plan quotes it as :120, so that is off by one (the NIT below). :125 is the task-462 dated note. `## 5. ` and `## 6. ` each occur exactly once (:113, :127). The task-462 note at :125 sits inside section 5. There are no `###` headings numbered 5.
- Today `lint` is in mobile/package.json scripts (keys: start, android, ios, web, test, test:ci, typecheck, lint, safe-start). Today the Spec 98 section 5 slice contains `` `npm run lint` ``. The plan's step 1 is therefore red on assertion 1 and on assertion 3, and assertion 2 also fails (all three fail today, as the plan says).
- rule-lists.json:44 is the `mobile-98` entry with `"whole": true, "generated_by": "hand-written"`. rule-lists-by-kind.md:42 is `| mobile-98 | … | whole file | 11,801 | 1 |`. The phone total at :50 is `| total | 9 lists | | 216,323 | 9 |`. Spec 98 today is exactly 11,801 characters (11,857 bytes), so the page counts characters.
- Commit 06811e273 exists and the message says "The rule-lists page is regenerated (the mobile-98 list grew by the note)". It touched Spec 98 (+2 lines) and rule-lists-by-kind.md.
- The cap: rule-lists.logic.test.ts:981-989 loops FILES_423, `filesLineOf(419)` and `filesLineOf(412)` and asserts `toBeLessThanOrEqual(3)`. The task-419 and task-412 Files lines have 0 mobile mentions, and FILES_423 (:921) names no mobile path. So Spec 98 is not under that cap and the plan's claim holds. MD:2203 reads "Ruled (RR-0429): dated notes are kept short. The cap is not raised." MD:2390-2393 is RR-0462 step 5, and MD:1975 is the RR-0392 text.
- 00_system_map.md:128 is `| 98 | … | Mobile Testing Protocol & Local Environment | — | — | ACTIVE |`. It needs no regeneration.
- Planned note length: 248 characters, against the plan's "about 260". That is fine, and shorter than the task-462 note (303).
- Simulated edits in memory (delete :118, insert a blank line and the note after the task-462 note). Assertion 1 holds (no `lint` key after deleting it). Assertion 3 holds (the note is inside section 5). Assertion 2 does NOT hold (see rc#1).
- Expected page delta from the simulation: Spec 98 grows by 224 characters, 11,801 to 12,025, so the page row becomes `12,025` and the phone total becomes `216,547`. This assumes `page --write` counts characters like today. Not run, so UNVERIFIED.

## rc#1 HIGH: the planned note makes the plan's own green step impossible (confirmed by simulation)
Plan: (B) step 3 note "so the `npm run lint` line above and the dead `lint` script … are removed" with step 1 `expect(s5).not.toContain('`npm run lint`')` and step 5 "(green)".
Evidence: I applied the planned edits to a copy of Spec 98 in memory and ran the three assertions. Output: `a1 true`, `a2 no backtick lint: false`, `a3 note: true`. The note text at the end of section 5 itself contains `` `npm run lint` ``, so assertion 2 fails after the edits. plan-ux#1 raised the contradiction by reading. This line confirms it by running the plan's own text, so the plan's expected result "green.out" is false as written.
Fix: reword the note without the backticked command, for example "there is no phone lint step; the phone app has no lint tool installed, so the lint line in this list and the dead `lint` script in `mobile/package.json` are removed." Check that the new wording is under 250 characters and has no `` `npm run lint` ``. Then the note is about 235 characters and the page count changes accordingly (re-derive the delta after the edit).

## rc#2 NIT: two small line-number slips in the facts
Plan: (A) "Spec 98:120 'EAS Build runs the above sequence natively…'" and (E) "the task file has one [Files line] at :22".
Evidence: Spec 98:120 is blank and the Pre-Build text starts at :121 (`sed -n 112,130p` and the `node -e` line print `120 ` empty). The task file's Files line is at line 23 (`grep -n "^Files:" backlog/tasks/task-463*` gives `23:Files: mobile/package.json, …`).
Fix: write :121 and :23. The plan already tells the builder to match text rather than line numbers, so nothing else changes.

STATUS: 2 findings (1 HIGH, 1 NIT); every fact, count and line number checks out except that the planned note fails the plan's own second assertion, so the expected green result is false until the note is reworded.
