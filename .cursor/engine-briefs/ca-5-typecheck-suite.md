---
write_scope:
- src/tests/chain-args-generated.infra.test.ts
---
# WF3 ca-5 — make `src/tests/chain-args-generated.infra.test.ts` typecheck-clean — LEAVE UNCOMMITTED

**Provider:** deepseek. Tools: `read_file`, `edit_file` only. Touch only this file; change NO assertion and NO runtime behaviour — types only. Never `git add`/`commit`. LF endings.

`npm run typecheck` (tsconfig has `noUncheckedIndexedAccess`) reports 17 errors, all in this file — record-index reads typed `T | undefined`:
```
(303,23) (304,23) TS2538 'undefined' cannot be used as an index type   -> newLines[differing[0]]
(368,14) (381,7) (469,7) TS18048 'X.manifest.scripts.a|b' is possibly 'undefined'
(389-391,14) TS2532 bDrift[0] possibly undefined
(395,30) (414,36) (426,37) (444,30) (456,34) TS2532 descriptors['scripts/…'] possibly undefined
(397,7) (446,7) (458,14) TS18048 '<x>Invocation.sources' possibly 'undefined'
(500,44) TS2488 [...mapped.manifest.chains.sources] — string[] | undefined
```
Fix each with the narrowest type-only change, using the existing style in this repo's tests (`signal!.changed` non-null assertions are used in `src/tests/link-parcels-code-version.logic.test.ts`): e.g. `newLines[differing[0]!]`, `missing.manifest.scripts.a!.chain_args`, `bDrift[0]!.chain`, `both.descriptors['scripts/b.js']!.execution`, `bInvocation.sources!.argv`, `[...(mapped.manifest.chains.sources ?? []), 'zz']`. Line numbers are hints — read the file and fix every site the list names.

## Verify (run, report output)
- `npx tsc --noEmit -p tsconfig.json 2>&1 | grep chain-args-generated` — EMPTY.
- `npx vitest run src/tests/chain-args-generated.infra.test.ts` — still exactly 2 failures ("fleet parity…", "the live CLI is CLEAN…", naming `link_parcels/sources`), 9 pass.
- `npx eslint src/tests/chain-args-generated.infra.test.ts` — clean.
