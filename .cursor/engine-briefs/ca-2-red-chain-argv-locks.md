---
write_scope:
- src/tests/link-parcels-code-version.logic.test.ts
- src/tests/step-library.logic.test.ts
---
# WF3 ca-2 (RED) — the link_parcels FULL locks read the CHAIN's argv, not the descriptor's — LEAVE UNCOMMITTED

**Domain:** Backend/Pipeline. **Provider:** deepseek. Tools: `read_file`, `edit_file` only (anchored text edits — text anchors are authoritative, line numbers are hints). Never `git add`/`git commit`. No `process.exit()`. Preserve LF line endings. Edit ONLY the two files in `write_scope`; change nothing else in them.
Plan: `.cursor/wf3_link_parcels_full_mode_active_task.md` (main tree; authorized) Steps 2 and 2b.

## Why
`scripts/run-chain.js` passes a step only `manifest.scripts[slug].chain_args?.[chainId]`. `link_parcels`'s T3 lock proves FULL using the DESCRIPTOR's `execution.invocation.sources.argv` — so it stayed green while the manifest (what run-chain really passes) carried no `--full`. These edits make the locks read the manifest. They are RED today, and turn GREEN only when the orchestrator later adds `"chain_args": { "sources": ["--full"] }` to `scripts/manifest.json` `link_parcels` (NOT your job — never edit the manifest).

## Edit 1 — `src/tests/link-parcels-code-version.logic.test.ts`
Read the whole file first. `SOURCES_ARGV` (the descriptor const) is used by BOTH T3 and T4. T4 and its const stay byte-identical. T1/T2/T4 untouched.

(a) Directly AFTER the existing block that ends with
```
const SOURCES_ARGV = descriptor.execution.invocation.sources.argv;
```
insert:
```

/**
 * What `scripts/run-chain.js` ACTUALLY passes the step in each chain: `manifest.scripts[slug].chain_args?.[chain]`
 * (absent ⇒ []). WF3 2026-10-02: T3 used to read the DESCRIPTOR argv above and stayed green while the manifest
 * carried no `--full` — a lock that reads the descriptor's argv proves the descriptor, not the chain.
 */
const manifest = JSON.parse(readFileSync(join(process.cwd(), 'scripts/manifest.json'), 'utf8')) as {
  scripts: Record<string, { chain_args?: Record<string, string[]> }>;
};
const CHAIN_SOURCES_ARGV: string[] = manifest.scripts.link_parcels?.chain_args?.sources ?? [];
const CHAIN_PERMITS_ARGV: string[] = manifest.scripts.link_parcels?.chain_args?.permits ?? [];
```
(b) In the test whose title starts `'T3 — consumer side`: change ONLY `argv: SOURCES_ARGV,` to `argv: CHAIN_SOURCES_ARGV,` and change the title's `(GREEN both sides)` to `(RED until manifest chain_args.sources carries --full)`; replace its comment line `// chain argv the descriptor itself declares.` with `// argv run-chain passes in the sources chain (manifest chain_args — RED today: [] ⇒ incremental:no_full_arg).`. Every `expect` in T3 stays byte-identical.
(c) After the T3 `it(...)` block (before T4), add two tests:
```
  it('T3b — permits chain (GREEN both sides): prior v0-old + permits chain argv ⇒ NEVER full (the permits chain carries no --full)', async () => {
    const result = await staleness.selectMode({
      descriptor,
      pool,
      prior: { code_version: 'v0-old' },
      argv: CHAIN_PERMITS_ARGV,
      env: {},
    });
    expect(result.changed, 'the differing baseline is still measured as a change').toBe(true);
    expect(result.mode).toBe('incremental');
    expect(result.reason).toBe('incremental:no_full_arg');
  });

  it('T3c — fresh DB (RED until manifest chain_args.sources carries --full): NO prior run + sources chain argv ⇒ full (gate:no_prior_run)', async () => {
    // Plan consequence (b): a new target DB has no prior run row at all ⇒ changed (fail-safe) ⇒ the first
    // sources run is FULL — harmless on an empty permit_parcels. RED today: chain argv [] ⇒ incremental:no_full_arg.
    const result = await staleness.selectMode({
      descriptor,
      pool,
      prior: null,
      argv: CHAIN_SOURCES_ARGV,
      env: {},
    });
    expect(result.changed).toBe(true);
    expect(result.mode).toBe('full');
    expect(result.reason).toBe('gate:no_prior_run');
  });
```
The `staleness.selectMode` type in this file declares `prior: Record<string, string> | null` already — no type change needed. Also update the file's top comment list (the lines starting `//   T3 —` / `//   T4 —`): after the `T3` two lines add
```
//   T3b — permits chain argv never resolves full.   T3c — no prior run + sources chain argv ⇒ full.
//   (WF3 2026-10-02: T3/T3c read the MANIFEST chain_args run-chain passes, not the descriptor argv.)
```

## Edit 2 — `src/tests/step-library.logic.test.ts`
Find the test whose title is `'the real manifest.json agrees this shape exists for at least one live slug (non-vacuity)'` inside `describe('guard 2 — assertForceFullAuthorized (R-L)'`. Directly AFTER that `it(...)` block's closing `});` (and before the describe's closing `});`), add:
```

    it('link_parcels (WF3 2026-10-02): the real manifest declares chain_args.sources "--full", so a force_full reset is authorized (RED until the manifest carries it)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real committed manifest
      const manifest = require(join(process.cwd(), 'scripts/manifest.json'));
      expect(() => stepLib.assertForceFullAuthorized({ overrides: { force_full: true }, manifest, slug: 'link_parcels' })).not.toThrow();
    });
```
Match the surrounding indentation exactly (4 spaces for `it`).

## Verify (run, report output)
- `npx vitest run src/tests/link-parcels-code-version.logic.test.ts` — EXPECTED: T1, T2, T3b, T4 pass; **T3 and T3c FAIL** (T3: mode `incremental`, not `full`; T3c: same). That RED is correct — do not "fix" it.
- `npx vitest run src/tests/step-library.logic.test.ts -t "assertForceFullAuthorized"` — EXPECTED: only the new link_parcels test FAILS (throws `chain_args`).
- `npx eslint src/tests/link-parcels-code-version.logic.test.ts src/tests/step-library.logic.test.ts` — clean.
