# Re-verification: wf2/scorecard-max fix commit

**Branch:** `wf2/scorecard-max` @ `7fc0670d` (parent `b4ca48bb`), worktree `~/Buildo-wt-scmax`
**Scope:** fixes verify-11 B1 (neighbourhoods row 21 grounding) and N3 (prose-only Rule 4 pins), as described in `wf2-scorecard-max.md`
**Verifier:** lane verify-11b (R-EZ), read-only, 2026-10-20
**Verdict:** **BLOCK**, as the brief defines it: 2 of the 3 new ledger rows (N-D21 and N-D22) are not recognized as definitions by gate #36. The cause is a gate regex that predates this commit. The commit's own content is accurate. See B2 for what each remedy would cost.

## Checks

| # | Check | Result |
|---|---|---|
| 1 | `git diff b4ca48bb..7fc0670d --stat` and review | 3 files, +11/−8: the AGC assessment (IL-11, IL-12 and 2 regenerated scorecard lines), the neighbourhoods assessment (rows 20 and 21 and 2 scorecard lines), and `defect-ledger.md` (+3 rows). Nothing outside the commit's description changed. No code, spec or descriptor was touched |
| 2 | Row 21 against `scripts/load-neighbourhoods.notes.json` `read_this_way[0]`, read with node | `CONSTRUCTION_PERIODS` ✓ and `PERIOD_MAP` ✓ are present. The characteristic labels are named only at family level ("every family / tenure / … row the pivot matches"); the literal `Married or living common-law` is **not** in the entry (N1). `Total -` occurs 0 times in the whole file ✓, matching what the row now says |
| 3 | Where the prefixes live, by grep in `scripts/lib/compute/load-neighbourhoods.js` | `Total -` appears only at `:144` (comment) and at `:322`, `:345`, `:367`, `:389`, `:411` (`startsWith`) ✓. This matches the row exactly |
| 4 | G-2 on row 21 (`checkPreservedInComputeHasWhy`, `step-validate.mjs:2929-2939`) | Row 21 passes because it contains `notes.json`. That is legitimate for the vocabulary half (CONSTRUCTION_PERIODS and PERIOD_MAP really are in `read_this_way[0]`), not a substring accident. The row also says outright that the prefix half is ungrounded and points to N-D22. The row-granularity limit remains (N2) |
| 5 | Ledger rows AGC-D8 (`:135`), N-D21 (`:246`), N-D22 (`:247`) | Each sits in its family block in ID order, has the 7-column format (ID / Step / Anchor / One-line / Status / Closes at / Source), and uses status `OPEN · **PIN** REFREEZE-BUNDLE-1` (the same form as 207 existing PIN rows). Each cites "Spec 124 §2 Rule 4" and links back to its report row |
| 6 | Cited file:lines | `assert-global-coverage.js:258-265` is the `mbc` FILTER(has_bldg) block, with the `has_bldg` EXISTS at `:265` ✓. `:287` is the `pcm` `has_bldg` EXISTS ✓. `load-neighbourhoods.js:143` is the comment naming the `’`→`'` normalisation ✓. `:335` is `.replace(/’/g, "'")` ✓. N-D22's lines match check 3 ✓ |
| 7 | #36 count 497 → 498, read with `defectDefinitionRows` / `checkDefectIdUniqueness` (`scripts/analysis/gates/registries.mjs:245-293`) and counted with `verify-11/defcount.mjs` | Reproduced: 497 at `b4ca48bb`, 498 at `7fc0670d`, 101 mirrors, 0 violations. Only **AGC-D8** is recognized. `DEFECT_ID_RE = /^([A-Z]{2,5}-D\d+[a-z]?)$/` (`registries.mjs:53`) requires a 2–5 letter prefix, so the 1-letter `N-` ids never match. That accounts for the +1 instead of +3 (B2) |
| 8 | Full suite at `7fc0670d` (`suite-scmax-fix.log`) | **17,825 passed / 0 failed / 4 skipped**, 794 files, EXIT 0 ✓ |
| 9 | `step-validate --all --fast` at `7fc0670d` (`sv-scmax-fix.log`) | **EXIT 0** ✓ |
| 10 | Scorecard freshness: in a throwaway detached worktree at `7fc0670d`, ran `--step=neighbourhoods --write --fast` and `--step=assert_global_coverage --write --fast`, then `git diff` | **Empty diff.** The committed blocks are exactly fresh `--fast` output. Both steps are at 16/17. Worktree removed afterwards |

## Findings

| ID | Class | Finding | Evidence |
|---|---|---|---|
| B1 (prior) | **RESOLVED** | Row 21 no longer claims the prefixes are in notes.json. It names the compute lines, quotes the old wrong claim as corrected, and pins the gap as N-D22 | checks 2–4 |
| N3 (prior) | **RESOLVED** | AGC-D8, N-D21 and N-D22 are now ledger rows, and G6 counts them (AGC 7→8, neighbourhoods 20→22, both "0 without CLOSED/PIN") | checks 5–6 |
| B2 | **BLOCKING** (by the brief's criterion; a gate defect that predates this commit) | N-D21 and N-D22 are not recognized as definition rows by #36 DEFECT-ID-UNIQUENESS: `DEFECT_ID_RE` requires `[A-Z]{2,5}`. The same blind spot already hides all 40 single-letter-prefix ledger rows (M-D×13, N-D×22, P-D×5) and their report mirrors. With the regex widened to `{1,5}` (what-if, `verify-11/defcount-wide.mjs`), #36 would count 571 definitions and turn **RED on 13 pre-existing disagreeing mirrors** (M-D1…M-D13, massing assessment vs ledger). N-D21 and N-D22 themselves have no duplicates, so they would pass. The commit cannot fix this in scope, since the remedy is a code change to `registries.mjs` plus reconciling the M-D mirrors (or ledgering them). **Operator choice:** (a) fix the gate on a tooling lane, after which this branch needs nothing; or (b) downgrade B2 to NOTE for this branch and track the gate defect separately | `registries.mjs:53`, `:245-255`; `defcount.mjs` output: ledger defs 380→381, only AGC-D8 matched |
| N1 | NOTE | Row 21 says `Married or living common-law` is "among the characteristic labels" in `read_this_way[0]`. The entry names the labels only by family ("every family / … row the pivot matches"); the literal and its `common law` / `common-law` variant pair (`load-neighbourhoods.js:312`) are written only in compute. This is defensible as family-level grounding, but it is the same kind of gap as the U+2019 rule (N-D21), and the row's "variant-spelled" theme rests on it | node read of `read_this_way[0]`; `load-neighbourhoods.js:311-312` |
| N2 | NOTE | G-2 checks each row whole: one grounding token (`notes.json`) anywhere in the row greens a row that is half-grounded by its own admission (row 21 prefix half, row 20 normalisation). The rows are now honest and both gaps are ledgered, so nothing is hidden, but the scorer cannot tell a half-grounded row from a grounded one | `step-validate.mjs:2933-2934` |
| N3b | NOTE | The defect-ledger header reads "Anchor (HEAD `8b857169`)", while the new rows anchor current `scripts/lib/compute/*` lines. Several existing rows already do this, so it is consistent with practice; recorded only | `defect-ledger.md:6` |

## Verdict

**BLOCK** (B2), per the brief's rule. Everything in the commit's content is accurate, minimal and fresh: B1 and N3 are resolved, suite 17,825/0/4, `--all --fast` exit 0, scorecards byte-fresh. If the operator rules B2 a gate defect outside this branch (option b), the branch verdict becomes **PASS-WITH-NOTES**.

Scripts: `verify-11/defcount.mjs`, `verify-11/defcount-wide.mjs`. Logs: `suite-scmax-fix.log`, `sv-scmax-fix.log`.
