# Step handbook: what the integrate lane must do

Hand-written (not generated). Scope: `scripts/steps/_schema/rule-map.json`, `docs/handbook/step-standard.md` and their lock `src/tests/handbook-rule-map.logic.test.ts`. Written by lane handbook-fix under operator y 2026-10-20 (consolidation 1-4), from verify-12 check 6 and N6.

The rule map is locked in both directions. When another branch adds register rows or defect ids, the lock goes red **by design** until the same integrate commit updates the map. Do every step below in that one commit.

## When wf2/rulings-7 (b348e360) lands

It brings register rows R-EW and R-EX, Defect Ledger rows COA-D13 and COA-D14, `src/tests/steps/coa/dispatch.logic.test.ts`, and the `seen_drift` mode of `scripts/analysis/capture-rerun-proof.js`.

1. In `rule-map.json` `meta.pending_integration`, empty `rules` (R-EW, R-EX) and `defects` (COA-D13, COA-D14). Arm (d) fails until you do.
2. On the R-EW and R-EX rule entries, delete `source.pending_integration`. Leave `source.register: true`.
3. Confirm each lock now resolves and names its rule:
   - R-EW: `src/tests/steps/coa/dispatch.logic.test.ts` must exist and mention `R-EW`.
   - R-EX: `src/tests/capture-rerun-proof.logic.test.ts` must mention `R-EX` and assert rewritten == touched for a `written:"seen"` column.

   If a test does not mention its rule, add a `// rule-map: R-Ex — <what it asserts>` comment where it asserts the rule. Otherwise set the enforcement to `none` and list the rule on `unenforced[]`.
4. Revisit the two `unenforced[]` entries whose reason says "rul7 branch only". If the lock now fully asserts the rule, remove the entry; the list only shrinks. If it asserts part of the rule, keep it as `partial` with a new reason.
5. In `scripts/generate-step-handbook.mjs` §5, remove the † from the `seen_drift` pointer in the COA-D14 row once the mode exists on the integrated tree.
6. Add a rule-map entry for every new register row the branch adds (see "Every lane" below).

## When backfill-9 lands (W4A register rows)

1. `meta.register_rows_owed` lists W4A-R1 to W4A-R6. For each W4A id that gains a register row:
   - Add the new register id as a rule entry with `source.register: true`, its `handbook_line` (the line the W4A id is on today), its `status` and its enforcement.
   - Make the W4A entry point at it. Set `status: "superseded"` with `by: ["<new id>"]` (or `amended-by` if the W4A text still reads alongside it), and add a `status_reason`.
2. Remove each landed id from `meta.register_rows_owed.ids`. When none remain, leave the list empty.
3. Re-check the W4A entries' enforcement. W4A-R1 is `partial` and W4A-R4 is `none` (see `unenforced[]`); a new register row that names a lock may close them.

## Every lane that adds register rows (R-FC … R-GO and later)

For each new id that `extractRegisterRulingIds` reads from Spec 124 §5 or a 124a LIVE REGISTER section:

1. Add one rule entry to `rule-map.json`:
   - `id`, `kind: "register-ruling"`, `status`, `handbook_line` (an existing line, or a new line in the right section with `text` and `why`), `statement` (one sentence), `source: { "register": true }`.
   - `enforcement`: `{ "kind": "lock", "ref": "src/tests/<file>.test.ts" }` only if that test mentions the id and asserts the rule. Use `lock-db` for a `*.db.test.ts`, `check` for a step-validate token, or `none`.
2. If the rule is in force and its enforcement is `none` or partial, add it to `unenforced[]` with a reason. Raising the ceiling in the lock needs a register ruling.
3. If the id collides with another name, add `aliases` (for example `PURITY-…`, `SPEC121-…`). If the bare id is ambiguous in test text, also add `mention_by_alias_only: true`.

## Then, always

```
node scripts/generate-step-handbook.mjs --write
npx vitest run src/tests/handbook-rule-map.logic.test.ts
node scripts/generate-step-handbook.mjs --check
```

The generator also checks the hand-written §1, §5 and glossary against the code. If an integrated branch renames a runner function, a phase, a flag or a file that the handbook names, `--write` fails and names the fact. Fix the text in `scripts/generate-step-handbook.mjs` (`SECTION_1`, `DIAGNOSIS`, `MESSAGES`, `GLOSSARY`, `SYMBOL_HOME`, `FLAG_HOME`, `RUN_ORDER`). Tables 1a and 1b regenerate by themselves.

Still owed to a later ruling lane, and not tracked by any lock:
- The register row recording decision 2 (the register is the authority; Specs 119–123 are historical design records; see `meta.precedence`).
- Correcting the stale Spec 124 §3 Rule 7 cell, which still names the deleted `outputs.publish` (verify-12 E6).

## Status after `wf2/p4-integrate-12` (2026-10-20)

- rulings-7: done. `meta.pending_integration` is empty; R-EW and R-EX resolve and stay `partial` on `unenforced[]` with rewritten reasons.
- backfill-9: done. R-FC…R-FH are the W4A register rows (each W4A id `superseded` by its row); `meta.register_rows_owed` is empty. R-FI…R-GO (except R-GF, historical) are locked by the condition-9 block in `src/tests/v3-label-enforcement.logic.test.ts`.
- tooling-fix-1: done. R-GP…R-GT mapped and locked.
- `unenforced[]` stayed at 67 (ceiling 67): the W4A entries moved to their register rows; nothing was added.
- Also owed to a ruling lane: 124a R-CR's cell still says averaging is `not_evaluated` until Q-B1; Spec 130:93, Spec 131 LC-58 and Spec 69a M-205(1) superseded that on 2026-10-19 (verify-12d N5). Handbook line link.4 now says so.
