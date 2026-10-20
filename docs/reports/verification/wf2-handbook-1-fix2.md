# Verification: wf2/handbook-1 handbook-fix round 3 @ 316c8f38

- **Lane:** verify-12d. Independent and read-only (R-EZ). I did not write this work.
- **Branch:** wf2/handbook-1 @ 316c8f38 (worktree ~/Buildo-wt-hb1), parent a864e66c.
- **Scope:** the narrow BLOCK E28 and E29–E32 plus the glossary gaps from wf2-handbook-1-fix.md and handbook-errata-2.md.
- **Evidence** (scratchpad/verify-12/fix2/): hooks.mjs (my own acorn-AST scanner), suite-316c8f38.log, tsc.log, sv-all-fast.log.
- **Worktree:** one throwaway detached worktree (fix2/wt-mut @ 316c8f38) for the mutations. Reverted with sed, then removed with `git worktree remove`. hb1 is clean apart from its pre-existing untracked `mobile/node_modules`.
- **Disclosure:** in wt-mut I once ran `git checkout --` with no pathspec. It was a no-op (it only printed status) and I reverted by sed. Nothing in hb1 was touched.

## Checks

### 1. E28, table 1a hooks: PASS

**Method.** My scanner parses index.js with acorn. For every top-level function it collects its `compute.X` reads (static and computed) and every call site that passes `compute`, either as an argument or as an object-property value. It then reaches from each phase through every top-level function that is actually passed `compute`. This is a call-site test, not a signature regex. It does not follow phases into each other.

**Result.** It matches table 1a exactly, for all 10 phase rows and the runner row: the same hooks and the same "via" helpers.
- runLinkPhase via primaryMatchBinds
- runMaterializePhase via materializeRowsArm: `buildMaterializeSql`, `buildPostSql`, `buildSourceSql`, `finalizeMatched`, `materializeRows`
- runBackfillPhase via runBackfillFullRecompute: adds `buildPreSql`, `buildPostSql`
- runWithPool via makePreWriteGate: `DISTRIBUTION_SCOPE`

**What I ruled out:**
- No hook is missing and no listed hook is spurious.
- The only call sites that pass `compute` are the ones the generator follows.
- No destructuring of `compute` exists.
- No other scripts/lib/step file reads `compute.X`. plausibility.js mentions DISTRIBUTION_SCOPE only in an error string.
- The new tests lock `materializeRows` and the rest of the row.

**Runner-row attribution.** `DISTRIBUTION_SCOPE` is read **directly in `runWithPool`**, at index.js:7454 (`runnable.compute.DISTRIBUTION_SCOPE`). It is **not** read through makePreWriteGate. makePreWriteGate (6124) reads no named hook; it only calls the main function, `compute(probeCtx)`.
- The row `runWithPool` via `makePreWriteGate` is true under the caption: "via" names the helpers that were followed.
- The lane's verbal claim, "read via makePreWriteGate", is wrong (see N1).

### 2. E29–E31: PASS (one upstream staleness note)

**E29.** link.4 now separates Q-B1 from R-CR's trigger form, matching 124a:277, Spec 78:762/:904/ML-10 and Spec 130:139. But "averaging stays `not_evaluated` until Q-B1" copies 124a R-CR, and that is itself superseded (see N5).

**E30.** True:
- `writeBeforeImage` is defined at write.js:1936.
- The phases call it at index.js:2380, 2612 and 5218.
- reset.js:253 reuses it on the recovery.reset path.

**E31.** True. Gate K is at step-validate.mjs:2996, gate H at 4318, and gate V (the five words) around 4359–4382. The other gates are in `gates/`.

### 3. E32, the fact lock: PASS, with a residual overstatement

**Mutation A.** I left `seamOwned` in index.js only in comments (lines 141, 5247, 5824) and renamed its 4 code uses.
- `--check` exits 1 with "symbol seamOwned does not occur outside comments in scripts/lib/step/index.js".
- The parent a864e66c generator, run on the same tree, reports nothing. So the fix is real.

**Mutation B.** I renamed the bare `--replay` to `--replayx` in capture-step-golden.js. `--replay-all` and `--replay-ts` were left alone.
- `factFindings(['`--replay=<capture>`'])` now reports "flag --replay does not occur". The parent generator reports nothing.
- The real `--check` **stays green**, because no hand-written text cites bare `--replay`. Only `--replay-all` is cited, and the FLAG_HOME `--replay` entry is unused.
- The flag check reads raw text, comments included. In capture-step-golden.js the literal `--replay` exists only in comments and an error string, since argv is parsed generically (`opts.replay`, 1403). So renaming the real CLI option would not be caught (N4).

**Header.**
- These parts are accurate: whole tokens outside comments, whole flags, paths, #NN, run order, the `ctx.report` guard, and "names exist and the order holds, not what each sentence says".
- This part is overstated: "every backticked camelCase or snake_case identifier names an entry in `SYMBOL_HOME`". Lowercase snake_case ids with no home are skipped silently (`if (!home) { if (/[A-Z]/.test(id)) out.push(...); continue; }`).
- I counted 23 such ids in the hand-written texts: write_inventory, by_mode, red_suite, shape_clean, schema_drift, idempotent_rerun, declared_drift, seen_drift, rls_bypass_or_policy, on_missing, pre_write, run_at, and others (N4).

### 4. Glossary: mostly accurate

| Entry | Verdict | Basis or problem |
|---|---|---|
| G-2 | ✓ | step-validate.mjs:2917/2933, 124a R-FA/R-FB |
| §R Reflection | ✓ | Spec 123:311 G9; G9 also checks that DEFERRED items are carried forward |
| seam | ✓ | Spec 124 Rule 13 (`inputs.reads.steps` edges); `ctx.exec` at index.js:108; `ctx.joinUpdate` at 5228 |
| sources chain | ✓ | manifest `chains` includes `sources`, `coa` and others; run-chain.js |
| P0 … P3 | ✓ | Spec 122:1322, Spec 123:15. See N7. |
| Intent Ledger | **MINOR error** | The dispositions "(kept, fixed, retired, preserved-in-compute)" are not the closed `DISPOSITION_VOCAB` (step-validate.mjs:338): preserved-in-runner, preserved-in-validator, preserved-in-compute, encoded-as-descriptor-field, encoded-as-deviation, knowingly-retired (N6). |

### 5. Reproduction: PASS

| Claim | Result |
|---|---|
| Suite | 800 files passed / 1 skipped. **17,897 passed, 0 failed, 4 skipped.** Exit 0. Matches the claim (17,895 plus the 2 new tests). |
| tsc (`--noEmit -p .`) | Exit 0 |
| `step-validate --all --fast` | Exit 0 |
| `generate-step-handbook.mjs --check` | Exit 0, "up to date" |

### 6. Diff a864e66c..316c8f38: PASS

The diff touches 4 files:
- The generator: helper traversal, the runner row, the stricter `factFindings`, 2 SYMBOL_HOME entries, the step 8 text, the caption, the header and the glossary.
- rule-map.json: the link.4 text only.
- The handbook: regenerated, with exactly the matching lines.
- handbook-rule-map.logic.test.ts: the type widening and 2 new tests (one GREEN, one RED).

Nothing else changed.

## Findings

### BLOCKING
None.

### NOTE
- **N1.** The runner row is truthful under the caption. But `DISTRIBUTION_SCOPE` is read directly in runWithPool (7454), not via makePreWriteGate, which reads no named hook. The lane's description of it is wrong. The cell could avoid implying attribution, for example "(helpers followed: …)".
- **N2 (MINOR).** The enrich row cannot list the descriptor-named `execution.enrich_hooks` exports. They are resolved dynamically by `compute[exportName]` (4854). No current descriptor declares any, and enricher.2 mentions them.
- **N3 (MINOR).** The materializeRowsArm `compute[fn]` probe covers only `buildSourceSql` and `materializeRows`, and both are listed.
- **N4 (header residue of E32).** Three gaps:
  - Lowercase snake_case ids with no SYMBOL_HOME entry (23 of them) are skipped silently, contrary to "names an entry in SYMBOL_HOME".
  - Flags are matched against raw text, comments included.
  - FLAG_HOME `--replay` is uncited, so the real `--check` does not exercise it.
- **N5 (SHOULD, upstream).** link.4 and 124a:277 both say averaging is `not_evaluated` until Q-B1. Spec 130:93 (amended 2026-10-19), Spec 131 LC-58 and the 69a M-205(1) dated note now apply max(estimate + porch allowance, zone default) with "needs survey", and Q-B1 stays open only for a better estimator. The handbook is faithful to 124a, but 124a's R-CR cell is stale. Add it to INTEGRATION.md's owed list.
- **N6 (MINOR).** The Intent Ledger glossary's disposition examples do not match `DISPOSITION_VOCAB`.
- **N7 (MINOR).** history.1's "P0 categories" uses Spec 122's other "P0" sense ("a P0 missing category", 122:416), not the programme stage. The new glossary entry would mislead a reader there.

## Verdict: **PASS-WITH-NOTES**

E28 is fixed and independently confirmed complete. E29–E31 are true against 124a and the code. E32's stricter lock catches both target mutations at the function level. The suite (17,897/0/4), tsc, step-validate and `--check` all reproduce, and the diff is scoped. No note is blocking.
