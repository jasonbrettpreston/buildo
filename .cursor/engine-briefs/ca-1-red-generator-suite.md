---
write_scope:
- src/tests/chain-args-generated.infra.test.ts
---
# WF3 ca-1 (RED) — new infra suite for the manifest `chain_args` generator — LEAVE UNCOMMITTED

**Domain:** Backend/Pipeline. **Provider:** deepseek. Tools: `read_file`, `edit_file`/`write_file` only. Never `git add`/`git commit`. No `process.exit()`. Preserve LF line endings.
Plan: `.cursor/wf3_link_parcels_full_mode_active_task.md` (main tree; authorized) Step 1.

## Why
`scripts/link-parcels.descriptor.json` declares `execution.invocation.sources.argv = ["--full"]`, but `scripts/manifest.json` `scripts.link_parcels` has NO `chain_args`, and `scripts/run-chain.js` passes only `scriptEntry.chain_args?.[chainId]` (search the text `const extraArgs = [...(scriptEntry.chain_args?.[chainId]`). So `--full` never reaches link_parcels in the `sources` chain. The fix (a LATER brief, NOT yours) adds `scripts/analysis/generate-chain-args.mjs`, which derives manifest `chain_args` from each CONVERTED step's descriptor. You write ONLY the red test suite. The module does not exist yet — the suite is RED by design (module-not-found, then link_parcels drift).

## Write NEW file `src/tests/chain-args-generated.infra.test.ts`
Read first for conventions: `src/tests/generate-target-files.infra.test.ts` (header style, `cli()` via `spawnSync(process.execPath, …)`, temp dirs + `afterAll` cleanup, `import * as gen from '../../scripts/analysis/<x>.mjs'`).

Header (exact first lines):
```
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-AZ — execution.invocation is the per-chain argv PIN; manifest chain_args GENERATED from it)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md (step.schema.json execution.invocation — "manifest<->descriptor drift is a CHECKABLE difference")
```
then a comment block: WF3 2026-10-02, link_parcels never ran FULL in the sources chain; written red-first; tests 1 and 2 stay RED until the orchestrator runs `--write` on the real manifest.

### The module contract the suite pins (`scripts/analysis/generate-chain-args.mjs`, ESM)
- `deriveChainArgs(descriptor)` → `Record<string,string[]> | null`: for each key of `descriptor.execution.invocation` (in declared order) whose `argv` is a NON-EMPTY array, `{[chain]: argv}`; no non-empty argv (or no invocation) ⇒ `null`.
- `findings({ manifest, converted, descriptors })` where `converted: string[]` (repo-relative step FILE paths) and `descriptors: Record<file, descriptor>` → `{ drift: Array<{slug, chain, expected: string[]|null, actual: string[]|null}>, violations: string[] }`. Slugs come from `manifest.scripts[*].file === file` (one file may map to TWO slugs — every one is checked). Only slugs of converted files are examined; any other slug's `chain_args` is ignored.
  - drift: per slug, per chain in the union of `deriveChainArgs` keys and `manifest.scripts[slug].chain_args` keys, any chain whose expected argv ≠ actual argv (exact array equality; missing ⇒ `null`).
  - violations (strings, each containing `<slug>` and, where a chain is involved, `<chain>`): an invocation chain that is not a `manifest.chains` list containing the slug; a manifest chain containing the slug with no invocation entry; `execution.invocation[chain].env.PIPELINE_CHAIN` present and ≠ chain (absent is fine — run-chain injects it); `manifest.scripts[slug].env.PIPELINE_CHAIN` present and ≠ a chain containing the slug (run-chain spreads `scriptEntry.env` AFTER the injected value, so it would override it); a converted file mapping to no slug (that violation names the file).
- `rewriteEntry(text, slug, chainArgs)` → new manifest text: edits ONLY the single one-line `"<slug>": { … }` entry; `chainArgs` object ⇒ inserts/replaces `"chain_args": { "sources": ["--full"] }` (format: `{ "k": ["a", "b"] }`), `null` ⇒ removes the property; throws (message contains the slug) when the slug has no one-line entry.
- CLI: `node scripts/analysis/generate-chain-args.mjs --check|--write [--root=<dir>]`. Reads `<root>/scripts/manifest.json`, `<root>/scripts/steps/_schema/converted.json` (`.converted`), and each converted file's descriptor at `<file minus .js>.descriptor.json` under root. Exit 0 clean · 1 drift/violation (`drift <slug>/<chain>: expected … actual …` and `violation …` lines on stdout) · 2 error/usage (no flag, or both flags). `--write` rewrites only drifted entries and prints `changed …`; idempotent.

### Tests (describe `'manifest chain_args are generated from execution.invocation (R-AZ)'`)
1. **fleet parity (independent of the module — do NOT import it for this test):** read `scripts/manifest.json` + `converted.json` with `fs`; for every converted file, every slug mapped to it, compute expected from the descriptor exactly as `deriveChainArgs` describes, and collect `"<slug>/<chain>"` for each mismatch with `manifest.scripts[slug].chain_args`. `expect(mismatches).toEqual([])`. Non-vacuity in the same test: `converted.length >= 24` and at least 3 converted slugs carry `chain_args` today. (RED today: `['link_parcels/sources']`.)
2. **live tree CLI:** `cli(['--check'])` ⇒ `status === 0` and stdout has no `drift`/`violation` line. (RED: module missing today; after the generator lands, RED with `drift link_parcels/sources` until the orchestrator's `--write`.)
3. **temp-root reproduction, both directions, STABLE before and after the real `--write`:** make a temp dir; copy `scripts/manifest.json`, `scripts/steps/_schema/converted.json`, and every converted file's `.descriptor.json` into it at the same relative paths. In the COPIED manifest text, strip any `"chain_args": { … }, ` from the `"link_parcels":` line (regex on that one line only; a no-op today). Then:
   - `--check --root=<tmp>` ⇒ `status 1`; stdout `drift` lines === exactly one, containing `link_parcels/sources`.
   - `--write --root=<tmp>` ⇒ `status 0`, stdout contains `changed`. Split old/new manifest text on `\n`: same line count, exactly ONE differing line, it is the `"link_parcels":` line, and it contains `"chain_args": { "sources": ["--full"] }`. `JSON.parse` of the new text: `scripts.link_parcels.chain_args` deep-equals `{ sources: ['--full'] }`; every other `scripts` entry and `chains` deep-equal the old parse.
   - `--check --root=<tmp>` ⇒ `status 0`. A second `--write` ⇒ `status 0` and the file is byte-identical (idempotent).
4. **`deriveChainArgs`:** `{execution:{invocation:{sources:{argv:['--full']},permits:{argv:[]}}}}` ⇒ `{sources:['--full']}`; all-empty ⇒ `null`; no `execution` ⇒ `null`.
5. **`findings` unhappy paths, each BOTH directions** — build this exact in-memory fixture (a factory function returning a fresh copy):
   `manifest = { chains: { sources: ['a','b','c'], permits: ['a'] }, scripts: { a: {file:'scripts/a.js', chain_args:{sources:['--full']}}, b: {file:'scripts/b.js'}, c: {file:'scripts/b.js'}, u: {file:'scripts/u.js', chain_args:{sources:['--anything']}} } }`,
   `converted = ['scripts/a.js','scripts/b.js']`,
   `descriptors = { 'scripts/a.js': {execution:{invocation:{sources:{argv:['--full'],env:{PIPELINE_CHAIN:'sources'}}, permits:{argv:[],env:{}}}}}, 'scripts/b.js': {execution:{invocation:{sources:{argv:[]}}}} }`
   (`b` and `c` both map to `scripts/b.js` — the enrich-permits.js two-slug shape; `u` is unconverted). Baseline assertion: `findings(...)` ⇒ `drift: []`, `violations: []` (GREEN control — the unconverted `u` with chain_args is ignored). Then deep-clone and mutate one thing per case, asserting the named finding:
   - delete `scripts.a.chain_args` ⇒ drift `{slug:'a', chain:'sources', expected:['--full'], actual:null}`.
   - set `scripts.b.chain_args = {sources:['--full']}` ⇒ drift with slug `b`, expected `null`.
   - two slugs one file: set the b.js invocation `sources.argv = ['--full']` ⇒ drift for BOTH `b` and `c` (exactly 2 drift items).
   - add invocation chain `coa` to `a` ⇒ a violation matching `/a\b.*coa/`.
   - remove `permits` from `a`'s invocation ⇒ a violation matching `/a\b.*permits/`.
   - `a` invocation `sources.env.PIPELINE_CHAIN = 'permits'` ⇒ violation containing `PIPELINE_CHAIN`; and absent `env` entirely ⇒ no violation (control).
   - `scripts.a.env = { PIPELINE_CHAIN: 'permits' }` ⇒ violation containing `PIPELINE_CHAIN` and `a`.
   - converted contains `scripts/zz.js` (descriptor supplied, no slug) ⇒ violation containing `scripts/zz.js`.
6. **`rewriteEntry`:** on a 3-line fixture text `{\n  "scripts": {\n    "x":  { "file": "scripts/x.js", "supports_full": true,  "supports_dry_run": false, "telemetry_tables": [] }\n  }\n}` (adjust to valid JSON): insert ⇒ line contains `"supports_dry_run": false, "chain_args": { "sources": ["--full"] }, "telemetry_tables"` and `JSON.parse` works; replace with `{permits:['--a','--b']}` ⇒ contains `"chain_args": { "permits": ["--a", "--b"] }`; remove (`null`) ⇒ result === the original text; unknown slug ⇒ throws `/nope/`.
7. **CLI usage:** no flag ⇒ `status 2`; both `--check --write` ⇒ `status 2`.

Use `afterAll` to `fs.rmSync` every temp dir. Run the CLI with `cwd: REPO_ROOT`, `timeout: 60_000`. Type everything (no `any`; use `unknown` + narrow, or small interfaces). eslint must pass.

## Verify (run, report output)
- `npx vitest run src/tests/chain-args-generated.infra.test.ts` — EXPECTED RED (module not found / suite fails). That is correct; do not create the module.
- `npx eslint src/tests/chain-args-generated.infra.test.ts` — must be clean.
