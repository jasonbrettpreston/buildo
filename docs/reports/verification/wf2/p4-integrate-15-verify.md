# Verification: wf2/p4-integrate-15 @ 885c2ad2 (verify-16)

**Lane:** verify-16. Independent and read-only (R-EZ). I did not write any of the commits under review.
**Target:** `wf2/p4-integrate-15` @ `885c2ad2`, base `a7655cec`. It merges `wf1/bylaw-fix-2` @ `5a26c383` and `wf2/v3-cite-1` @ `18574feb`.
**Verdict: PASS-WITH-NOTES.** There are no blocking findings.

## Check table

| # | Command / check | Where | Result |
|---|---|---|---|
| 1 | `npx vitest run --exclude '**/*.db.test.ts'` | detached worktree at 885c2ad2 | First run: 814 files passed, 1 failed, 1 skipped; 19342 tests passed, 28 skipped, 936 todo. The one failure is `admin-lead-schemas.contract.test.ts`: `TSConfckParseError: failed to resolve "extends":"expo/tsconfig.base"` because the fresh worktree had no `mobile/node_modules` symlink. With the symlink added, that file passes 24/24. Net: all pass (N4). |
| 2 | `npx tsc --noEmit` | 885c2ad2 | PASS (exit 0) |
| 3 | `node scripts/analysis/step-validate.mjs --all --fast` | 885c2ad2 | exit 0. "R-EY: 4/43 evaluated step(s) read V3; E1 ratchet PASS (4 listed); E2 cutover PASS; E3 hard gate OFF" |
| 4 | `node scripts/analysis/spec-split-check.mjs --check` | 885c2ad2 | PASS: "41 move(s) verified, 7546 citations checked, 0 dangling, budgets held, 0 reader breaks" |
| 5 | `node scripts/generate-step-handbook.mjs --check` | 885c2ad2 | PASS: "132_step_standard_handbook.md is up to date" |
| 6 | `node scripts/analysis/decision-log.mjs --check` | 885c2ad2 | PASS: 5 logs, 26 decisions, 27 register rows, 52 citations, 0 owed |
| 7 | `node scripts/analysis/report-schema.mjs --check` | 885c2ad2 | PASS. RS-5 WARN (54) is report-only. |
| 8 | `node scripts/analysis/bylaw/generate-answer-tracker.mjs --check` | 885c2ad2 | PASS: 788 answers (785 INCORPORATED, 3 UNFIXED) |
| 9 | `node scripts/analysis/bylaw/generate-maxbld-lineage.mjs --check` | 885c2ad2 | PASS: 107 fields, 0 dangling, no drift |
| 10 | `node scripts/generate-bylaw-provisions.mjs --check` | 885c2ad2 | PASS (exit 0); code-findings current |
| 11 | `node scripts/analysis/bylaw-validation/golden-lots-cases.mjs --check` | 885c2ad2 | PASS (exit 0): 174 PROVEN / 935 OWED / 16 NOT_EXERCISABLE |
| 12 | `node scripts/analysis/report-fields.mjs --check` | 885c2ad2 | PASS: current, 34 fields. The RF gate FAILs are report-only. |
| 13 | `cmp` of `p4-integrate-14-verify.md` against `<scratchpad>/int15/verify-14.md`, at 521f8b8e and at the tip | git show | byte-identical at both |
| 14 | `cmp` of `bylaw-fix-2-and-v3-cite-1.md` against `<scratchpad>/int15/verify-15.md`, at 521f8b8e and at the tip | git show | byte-identical at both |
| 15 | `git merge-tree --write-tree` on the parents of e3d94582 (521f8b8e + 5a26c383) | read-only | clean tree `3b28372f…`, equal to the merge commit's tree |
| 16 | `git merge-tree --write-tree` on the parents of 7e9a83cb (e3d94582 + 18574feb) | read-only | clean tree `d3769fe0…`, equal to the merge commit's tree. `git diff e3d94582 7e9a83cb` is only `v3-label-high-water-mark.json` (+2 lines), the same as 18574feb's own diff from its base a7655cec. |
| 17 | `parseRulings(readSpec69Rulings())` at 7e9a83cb against the tip, using the repo's parser | scratch script | 232 ids on each side, 0 status differences. M-76, M-102 and M-106 are RATIFIED. |
| 18 | Spec 68 budget | `wc -c -l` + manifest | 103,123 B / 530 lines. The ceiling is `floor(93,785 × 1.10)` = 103,163 B and `floor(536 × 1.10)` = 589 lines. Held; 40 B headroom. |
| 19 | Cite drift for Spec 124, 124a, 68 and 69a line cites, comparing 7e9a83cb (base + both merges) with the tip | `git diff -U0` + `git grep` | No line moved (see "Cite drift" below) |
| 20 | Worktree cleanup | plain `git worktree remove <literal path>` | exit 0. I first removed the untracked `mobile/node_modules` symlink by its literal path. The `~/Buildo-wt-int15` checkout is unchanged (HEAD 885c2ad2; only the pre-existing untracked `mobile/node_modules`). |

## Claim-by-claim

**1. Commit 521f8b8e (the R-EZ index and two verbatim reports): confirmed.**
- Both reports are byte-identical to the scratchpad copies (checks 13 and 14).
- The index's R-EZ quote matches line 913 of 124a word for word.

**2. Merges e3d94582 and 7e9a83cb: confirmed.**
- Each merge's tree equals the clean `merge-tree` result of its parents, so nothing was hand-edited during either merge.
- The merge bases are as expected: 5a26c383 forks from 70ec6aed, and 18574feb sits on a7655cec.

**3. Commit 06ad6528 (M-239 now names M-102 and M-106): confirmed.**
- **M-102 quote.** Line 183 of 69a contains "…or mixed bound directions or measures in one unit — the unit is UNUSUAL". The commit message and index quote it with the leading "or"; the register cell drops the "or". Both are accurate.
- **M-106 quote.** Line 190 of 69a contains "A unit whose statements bound `encroachment_m` (max) and `encroachment_clearance_m` (min, "no closer to a lot line than") mixes bound directions, which one unit `bound` cannot carry". The index elides the inner parenthetical as "…", which is accurate.
- **The vocab claim holds.** In `vocab.json`, `dsl_target.encroachment_clearance_m` has only `unit`, `aspect`, `concept` and `patterns`, with no `bound`. Exactly six targets declare a bound:
  - `main_wall_side_share_pct:min`
  - `main_wall_front_rear_share_pct:min`
  - `attic_counted_clearance_m:exact`
  - `attic_qualifying_share_pct:exact`
  - `attic_qualifying_clearance_m:exact`
  - `attic_qualifying_area_m2:exact`

  This matches the index's "two share tiers `min`, four attic thresholds `exact`".
- **The authority is real.** Line 9 of `docs/reports/decisions/raw/2026-10-20-chat-batch-b/2026-10-20-batch-b.json` is CHAT-9, decision "approve", and contains "the operator approves the target shape".
- **The D-3 cross-reference is accurate.** The dated note on line 387 of 69a says D-3 "stays UNUSUAL under M-106; the draft amends M-106 with the M-239 declared target bound", which matches "the drafted D-3 ruling puts M-106 to the operator directly".

**4. Commit 2ebf33e8 (Spec 68 rules 4 and 7a, and the M-76 status cell): confirmed.**
- **The edits are in place.** The commit changes four lines: 343 (rule 4), 356 (rule 7a heading) and 379 (hardening line) of Spec 68, and 154 (M-76) of 69a. No lines were added or removed.
- **Rule 7a quote.** Line 384 of 69a (M-237) contains "Amends Spec 68 §7.5 rule 7a as approved." verbatim. The index's quote of M-237's own words is accurate with ellipses: "rule 7a's "no by-law unit … for the target" skips a unit … declared as `vocab.absence_ignore`".
- **Rule 4 quote.** Line 386 of 69a (M-239) contains "Spec 68 §7.5 rule 4 (a declared target bound)", "Amends M-76 A10 (threshold DEFINE lists)" and "a declared target bound is the unit's bound for that target", all verbatim.
- **M-76 parenthetical.** The appended text "(a DEFINE may list threshold targets that each declare `exact`; a listed target may declare its own bound; operator CHAT-9)" matches M-239's G-SHAPE item (3) and its declared-bound item.
- **Parser.** M-76 still parses as RATIFIED (check 17).
- **Budget.** Held at 103,123 of 103,163 bytes (check 18).
- **The live cite still resolves.** The 2ebf33e8 message says "the live cite 69a:223 in 69a:345 keeps resolving". Line 345 is the M-207 dated note, and its cite points at line 223, which is M-133 and contains "limit_not_modelled".

**5. Commit 885c2ad2 (index only): confirmed.**
- The commit touches only `p4-integrate-15.md`.
- The one block the index labels "verbatim" (verify-14 N6, its lines 95–99) is byte-identical to lines 66–70 of verify-14 (`diff` is empty).
- The carry-forwards for verify-15 N1, N4, N5 and N7, and the N6/N2 records, are paraphrases and are not claimed as verbatim. Each one matches its source report faithfully.
- The index does not label its items (c)–(f), so I matched them by content.

## Cite drift

- Spec 124 and 124a are untouched between 7e9a83cb and the tip. Their line counts are 378 and 1168 on both sides.
- Spec 68 (530 lines) and 69a (387 lines) also keep their line counts. Their only hunks are single-line in-place replacements: lines 343, 356 and 379 of 68, and lines 154 and 386 of 69a.
- So no cite anywhere in the tree can have moved to a different line's content. The cites that target the five edited lines still point at the same rule or row:
  - one pre-existing cite of line 343 of Spec 68 in a `.cursor/mcbylaw/…/family-triage` note, which is still the rule 4 same-direction bullet;
  - the index's own cites of line 379 of Spec 68, and lines 386 and 154 of 69a.

**PIN-1 is confirmed pre-existing.**
- At `a7655cec`, line 326 of 69a is already the M-197 dated note ("Dated note 2026-10-19 (M-197; …"), and the M-198 row is on line 327.
- The stale "M-198(1)" line cites are therefore older than these commits, and the commits did not change them. They appear in:
  - `golden-lots-cases.mjs:82`
  - `cases.json:36546`
  - `wf1-bylaw-e2e-1.md:33`
  - `2026-10-20-bylaw-e2e-verification.md:56,65`

## Findings

**BLOCKING:** none.

**N1 (NOTE). The M-76 status-cell append does not use the register's defined dated-note form.**
- The edit is permitted; my full judgement is in the next section.
- The canonical dated-note form in 69a §1a (lines 137–138) is a separate row whose first cell is empty and whose text starts `*Dated note <date> (M-n; <source>):*`.
- The precedent the integrator cites is a different kind of edit.
- Recommendation: ask the operator to confirm status-cell appends as a sanctioned form, or codify them in 69a §1a.

**N2 (NOTE). Spec 68 has 40 bytes of budget headroom left.**
- The next growth needs a reviewed bump to `measured_at`, or a split.

**N3 (NOTE). "R-DV-1" and "R-7a-v2" are labels that nothing in the tree defines yet.**
- "R-DV-1" appears only in the integrate-15 index (lines 86 and 105).
- "R-7a-v2" appears only in the index. The register calls it "rule 7a v2" (M-220 and M-237 rows).
- Both are pending-ruling names, presumably taken from the lane report. They are not resolvable rule ids.

**N4 (NOTE). The full suite in a fresh detached worktree needs both symlinks.**
- It needs `node_modules` and `mobile/node_modules`.
- This repeats verify-14 N7; it is an environment issue, not a code defect.

**N5 (NOTE). The "13 V3 condition-9 families" count is not re-derived by the integrator.**
- The index discloses this ("the count as the integrate-15 brief lists it; not re-derived in this lane").
- I did not re-derive it either; it is outside this brief.

## Judgement on the M-76 edit

**Text of the rules:**
- Spec 69 header (`69_mcbylaw_policy.md` line 7): "**Amended only by adding rows** (or appending a dated note to a row); a superseded ruling is struck through and points at its successor; **an id is never reused.**"
- 69a header (line 7): "its register — one row per ruling plus dated notes, amended only by adding rows".
- 69a line 3: "the status column of each row below is authoritative".
- 69a §1a (lines 137–138): "A dated note on a row above is a row below whose first cell is empty and whose text starts `*Dated note <date> (M-n; <source>):*`."

**The edit:**
- Before: "RATIFIED 2026-10-08 (operator)".
- After: "RATIFIED 2026-10-08 (operator); (A10) AMENDED 2026-10-20 by M-239 (a DEFINE may list threshold targets that each declare `exact`; a listed target may declare its own bound; operator CHAT-9)".
- It is a pure append: the old text is kept byte-for-byte as a prefix.

**The precedent the integrator cites:**
- bylaw-fix-2 (a7655cec..5a26c383) edited the status cells of M-219, M-220 and M-223.
- Those edits replaced text in place, for example `OWED` became "APPLIED 2026-10-20 (M-239, operator CHAT-9)", and "OWED (by-law keying/evaluator lane)" became "(1) APPLIED 2026-10-20 (M-238, operator CHAT-10); …".
- verify-15 did not flag them.

**Judgement: permitted, with a note.**
- **It fits the header literally.** The edit is an append to the row, it is dated (2026-10-20), it names its source (M-239, CHAT-9), and it removes or rewrites nothing. That satisfies the Spec 69 header's "appending a dated note to a row". It also lands in the column 69a line 3 makes authoritative for status, and `parseRulings` still reads RATIFIED.
- **It is the more conservative choice.** It changes nothing about the rule text of A10. It mirrors how a superseded ruling is marked in place ("struck through and points at its successor"). It avoids shifting every later line of 69a, which would stale the cite of line 223 in line 345 and the many line cites of rows after 154 in reports.
- **But it is not the defined dated-note form.** 69a §1a defines a dated note as a separate empty-first-cell row. That definition is scoped to rows "above", meaning the hash-locked moved block. M-76 (line 154) sits inside §1a, so the text does not strictly require that form, but it is the only defined form.
- **The precedent is weaker than claimed.** The M-219/M-220/M-223 edits were status-lifecycle replacements on defect rows (OWED → APPLIED). The M-76 edit records an amendment to a ratified rule's content. That is a different kind of change, and the precedent is more invasive, not less.
- **Net:** this is not a forbidden in-place edit, and it does not block. The register protocol leaves the form ambiguous, so the operator should either sanction status-cell append notes or require the §1a row form (finding N1).

Scratch files: `<scratchpad>/verify-16/` (`vitest.log`, `tsc.log`, `m76.mjs`, `cmp.mjs`, `old/`). Nothing was written in the repo.
