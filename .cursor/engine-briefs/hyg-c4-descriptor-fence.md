---
write_scope:
- src/tests/db/load-parcels-ravine-invalidation.db.test.ts
---
# WF2 hygiene H5/C4 — re-point the DEC-FENCE2 (#418) source lock at the descriptor — STOP BEFORE COMMIT

## Goal
`src/tests/db/load-parcels-ravine-invalidation.db.test.ts` block (A) reads `scripts/load-parcels.js` and expects `DEC-FENCE2` plus three `<stamp> = CASE WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb THEN NULL ELSE parcels.<stamp> END` arms. Since the parcels conversion that file is a frozen shell (0 hits); the fence is now DECLARED in `scripts/load-parcels.descriptor.json` `outputs.invalidates[]` (3 entries, `set_null_on_change_of: "geometry"`) and RENDERED by `scripts/lib/step/write.js` `buildWritePlan(writeSpec, descriptor)` (the `invalidatesSetArms` block). Re-point the lock IN PLACE; never weaken it.

## Fix (test file only)
1. Replace `const SCRIPT = fs.readFileSync(... 'scripts/load-parcels.js' ...)` with: `require` of `scripts/lib/step/write.js` and `scripts/load-parcels.descriptor.json` (pattern: `src/tests/ingest-prereq-0t.logic.test.ts` lines 1-12, incl. the eslint-disable/enable comments for no-require-imports). Build `const UPSERT_SQL = writeLib.buildWritePlan(LOAD_PARCELS.outputs.writes[0], LOAD_PARCELS).upsert_sql` — first CONFIRM by reading write.js that the returned plan property holding the ON CONFLICT statement is named `upsert_sql` (ingest-prereq-0t uses it); if not, use the real name.
2. Rename block (A) to `load-parcels descriptor — DEC-FENCE2 source contract (#418)`; keep the `it` title. Assertions:
   - the descriptor's `outputs.invalidates` has, for EACH of `ravine_dataset_version_when_enriched`, `heritage_dataset_version_when_enriched`, `centreline_dataset_version_when_enriched`, an entry with `table === 'parcels'`, `set_null_on_change_of === 'geometry'`, and `when` containing `DEC-FENCE2`;
   - `UPSERT_SQL` matches, for each of the three stamps, `/<stamp> = CASE\s+WHEN parcels\.geometry::jsonb IS DISTINCT FROM EXCLUDED\.geometry::jsonb\s+THEN NULL ELSE parcels\.<stamp> END/` (keep the same three regexes, only `\s*\n\s*` becomes `\s+`);
   - `UPSERT_SQL` does NOT contain `address` inside any of those CASE arms (address-only change must not null the stamp): assert the WHEN of each arm is exactly the geometry predicate — the regex above already pins it; add nothing else.
3. Update the file header comment: the fence moved from `load-parcels.js` inline SQL to the descriptor's `invalidates[]`, rendered by `write.js buildWritePlan`; (A) locks the declaration AND the rendered SQL. Keep the SPEC LINK lines.
4. Block (B) (real DB) is UNCHANGED.

## Gate answers
No descriptor field, logic variable, check limit, emits key or counters source is set — test-only; no Spec 124 §5 R-BA gate reads it.

## Green
`npx vitest run src/tests/db/load-parcels-ravine-invalidation.db.test.ts` (block A runs without a DB; B skips) and `npx eslint src/tests/db/load-parcels-ravine-invalidation.db.test.ts`, `npx tsc --noEmit`.

## Stop
UNCOMMITTED. Do not call git_commit. Report the diff.
