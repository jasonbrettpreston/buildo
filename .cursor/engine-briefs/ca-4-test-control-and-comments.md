---
write_scope:
- src/tests/chain-args-generated.infra.test.ts
- src/tests/link-parcels-code-version.logic.test.ts
---
# WF3 ca-4 — one wrong test control + two stale comments — LEAVE UNCOMMITTED

**Provider:** deepseek. Tools: `read_file`, `edit_file` only. Make exactly these three anchored edits, run Verify, stop. Do not investigate anything else. Never `git add`/`commit`. LF endings.

## Edit 1 — `src/tests/chain-args-generated.infra.test.ts` (the orphan test's CONTROL)
The control adds slug `zz` mapped to `scripts/zz.js` but puts `zz` in NO manifest chain, while the `zz` descriptor invokes `sources` — so the generator correctly reports "invocation names chain sources, which is not a manifest chain containing zz". The control must make `zz` a real `sources` member. Find:
```
      mapped.manifest.scripts.zz = { file: 'scripts/zz.js' };
```
and replace with:
```
      mapped.manifest.scripts.zz = { file: 'scripts/zz.js' };
      mapped.manifest.chains.sources = [...mapped.manifest.chains.sources, 'zz'];
```

## Edit 2 — same file, header comment (it misdescribes test 3)
Replace these three lines:
```
// root and therefore stays STABLE across the real `--write` — it strips the `link_parcels` chain_args
// line from the COPY first, so it is RED before the write and still RED after it, without ever
// depending on the committed manifest's state.
```
with:
```
// root and therefore stays STABLE across the real `--write` — it strips any `link_parcels` chain_args
// from the COPY first, so it reproduces the bug and proves the fix GREEN whether or not the committed
// manifest has been regenerated yet.
```

## Edit 3 — `src/tests/link-parcels-code-version.logic.test.ts` (T3's first comment line is stale)
Inside the test whose title starts `'T3 — consumer side (RED until manifest chain_args.sources carries --full)`, replace
```
    // GREEN both sides — pins the contract the fix feeds. `changed` ALONE never selects
```
with
```
    // RED until the manifest carries the pin — pins the contract the fix feeds. `changed` ALONE never selects
```

## Verify (run, report output)
- `npx vitest run src/tests/chain-args-generated.infra.test.ts` — EXPECTED exactly 2 failures: "fleet parity…" and "the live CLI is CLEAN…" (both name `link_parcels/sources`; correct until the orchestrator's real `--write`). 9 pass.
- `npx eslint src/tests/chain-args-generated.infra.test.ts src/tests/link-parcels-code-version.logic.test.ts` — clean.
