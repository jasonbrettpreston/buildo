---
write_scope:
- scripts/analysis/generate-chain-args.mjs
---
# WF3 ca-3 (GREEN) — `scripts/analysis/generate-chain-args.mjs` — LEAVE UNCOMMITTED

**Domain:** Backend/Pipeline. **Provider:** deepseek. Tools: `read_file`, `write_file`/`edit_file` only. Never `git add`/`git commit`. Never edit `scripts/manifest.json` (registry-reserved — the orchestrator runs `--write` later) or any test. LF line endings. NEVER call `process.exit()` — the CLI sets `process.exitCode`.
Plan: `.cursor/wf3_link_parcels_full_mode_active_task.md` (main tree; authorized) Step 4.

## ⚠️ WORK ORDER — WRITE THE FILE FIRST (a previous run spent its whole budget investigating and wrote nothing)
1. Read ONLY `src/tests/chain-args-generated.infra.test.ts` and the first 60 + last 60 lines of `scripts/analysis/generate-target-files.mjs`. Do NOT read or grep descriptors, the fleet, or other steps: the orchestrator ALREADY MEASURED the fleet (24 converted files, each maps to exactly one slug, every one has `execution.invocation`, exactly one drift = `link_parcels/sources`). Do not try `node -e` / `git grep` — they are not on your allowlist.
2. By iteration 6, `write_file` the complete module per the spec below.
3. Then run `npx vitest run src/tests/chain-args-generated.infra.test.ts`; fix only what the failures name. Tests 1 and 2 are EXPECTED to fail naming `link_parcels/sources`.

## What it is
The ONE writer of `scripts/manifest.json` `scripts[slug].chain_args` for CONVERTED steps: each converted step's descriptor `execution.invocation.<chain>.argv` is the source of truth (Spec 124 R-AZ: "a per-chain argv PIN for manifest↔descriptor drift"); the manifest value is derived from it. `--check` is a drift gate; `--write` regenerates surgically. Unconverted slugs' hand-written `chain_args` are never touched.

## Read first
- `src/tests/chain-args-generated.infra.test.ts` — THE CONTRACT. Every test in it except the first two must pass after your change (tests 1 "fleet parity" and 2 "the live CLI is CLEAN" are EXPECTED to stay RED, naming `link_parcels/sources`, until the orchestrator's `--write` on the real manifest — do NOT edit the manifest to make them pass).
- `scripts/analysis/generate-target-files.mjs` — copy its shape: header comment with `// SPEC LINK:`, `import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';`, `export function run(...)`, `export function main(argv = process.argv.slice(2), streams = {})` returning 0/1/2 inside one try/catch, and the bottom guard `if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) { process.exitCode = main(); }`.
- `scripts/manifest.json` lines for `enrich_parcels`, `link_massing`, `link_wsib` — the exact existing `"chain_args": { "sources": ["--full"] }` placement (right after `"supports_dry_run": <bool>, `).

## Header
```
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-AZ — execution.invocation is the per-chain argv PIN); 122_pipeline_step_optimization.md (step.schema.json execution.invocation)
```
plus a short comment: WF3 2026-10-02 — link_parcels declared `sources: ["--full"]` but the manifest never carried it, and `scripts/run-chain.js` passes only `chain_args[chain]`, so FULL was unreachable from a chain run; this generator makes the descriptor the one source; `--check` runs in pre-commit (wired by the orchestrator).

## Exports (exact names; JSDoc types — no `any`)
- `REPO_ROOT` — `path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')`.
- `descriptorPathFor(file)` → `file.replace(/\.js$/, '') + '.descriptor.json'`.
- `deriveChainArgs(descriptor)` (`@param {object} descriptor`, returns `Record<string,string[]>|null`): iterate `descriptor.execution.invocation` entries in declared order; keep `chain → argv` when `argv` is a non-empty array (copy the array); none ⇒ `null`. Missing `execution`/`invocation` ⇒ `null`.
- `slugsForFile(manifest, file)` → slugs whose `manifest.scripts[slug].file === file`, sorted.
- `findings({ manifest, converted, descriptors })` — `@param {{manifest: object, converted: string[], descriptors: Record<string, object>}}`, returns `{drift: Array<{slug: string, chain: string, expected: string[]|null, actual: string[]|null}>, violations: string[]}`. For each converted `file` in order:
  - no slug maps it ⇒ violation `` `${file}: converted step file maps to no manifest.scripts slug` ``; continue.
  - descriptor = `descriptors[file]`; for each slug (sorted):
    - `expected = deriveChainArgs(descriptor)`, `actual = manifest.scripts[slug].chain_args || null`. For each chain in the union of both key sets (expected keys first in declared order, then actual-only keys): `e = expected?.[chain] ?? null`, `a = actual?.[chain] ?? null`; if `JSON.stringify(e) !== JSON.stringify(a)` push `{slug, chain, expected: e, actual: a}`.
    - membership: `memberChains` = keys of `manifest.chains` whose list includes the slug; `invChains` = keys of `descriptor.execution.invocation` (or `[]`). For each inv chain not in memberChains ⇒ `` `${slug}: execution.invocation names chain "${chain}", which is not a manifest chain containing ${slug}` ``. For each member chain not in invChains ⇒ `` `${slug}: manifest chain "${chain}" contains ${slug} but execution.invocation has no "${chain}" entry` ``.
    - for each inv chain whose `env` has an own `PIPELINE_CHAIN` ≠ chain ⇒ `` `${slug}/${chain}: execution.invocation.${chain}.env.PIPELINE_CHAIN is "${v}" — must be absent (run-chain injects it) or "${chain}"` ``.
    - if `manifest.scripts[slug].env` has an own `PIPELINE_CHAIN` `v`: for each member chain ≠ `v` ⇒ `` `${slug}/${chain}: manifest scripts.${slug}.env.PIPELINE_CHAIN is "${v}" — run-chain spreads scriptEntry.env after the injected PIPELINE_CHAIN, so it would override "${chain}"` ``.
- `formatDrift(d)` → `` `${d.slug}/${d.chain}: expected ${JSON.stringify(d.expected)} actual ${JSON.stringify(d.actual)}` ``.
- `serializeChainArgs(chainArgs)` → `{ "k": ["a", "b"], "k2": ["c"] }` i.e. `'{ ' + entries.map(([k, v]) => `${JSON.stringify(k)}: [${v.map((s) => JSON.stringify(s)).join(', ')}]`).join(', ') + ' }'`.
- `rewriteEntry(text, slug, chainArgs)` → new text. Split on `\n`; for each line compare with a trailing `\r` stripped (re-append it when rebuilding). Find lines matching `^\s*"<escaped slug>"\s*:\s*\{` . Exactly one required, and its trimmed text must end with `}` or `},`; otherwise throw `` new Error(`rewriteEntry: expected exactly one one-line manifest entry for "${slug}", found ${n}`) `` (or `… entry for "${slug}" is not on one line`). On that line:
  - if it contains `"chain_args"` matched by `/"chain_args"\s*:\s*\{[^{}]*\}/`: `chainArgs` null ⇒ remove the property: first try removing `/"chain_args"\s*:\s*\{[^{}]*\},\s*/`; if no match (it is the last property) remove `/,\s*"chain_args"\s*:\s*\{[^{}]*\}/`. Otherwise replace the value with `serializeChainArgs(chainArgs)` keeping `"chain_args": ` prefix.
  - else if `chainArgs` null ⇒ unchanged.
  - else insert `` `"chain_args": ${serializeChainArgs(chainArgs)}, ` `` immediately after the match of `/"supports_dry_run"\s*:\s*(true|false),\s*/`; if absent, after `/"file"\s*:\s*("[^"]*"|null),\s*/`; if neither, throw naming the slug.
  Return the rebuilt text (all other lines byte-identical).
- `run({ root = REPO_ROOT, check = false } = {})` → `{changed: string[], drift: string[], violations: string[]}`:
  - read + `JSON.parse` `<root>/scripts/manifest.json` and `<root>/scripts/steps/_schema/converted.json` (use its `.converted` array); read each converted file's descriptor at `path.join(root, descriptorPathFor(file))`. Any read/parse failure ⇒ throw `` new Error(`generate-chain-args: cannot read ${relPath}: ${err.message}`) `` naming the repo-relative path.
  - `const f = findings(...)`. If `check`: return `{changed: [], drift: f.drift.map(formatDrift), violations: f.violations}`.
  - write mode: if `f.violations.length` ⇒ write NOTHING, return `{changed: [], drift: f.drift.map(formatDrift), violations: f.violations}` (membership/env violations are not regenerable — fix the descriptor or manifest by hand).
  - otherwise for each distinct drifted slug (in order): `text = rewriteEntry(text, slug, deriveChainArgs(descriptorOf(slug)))` where `descriptorOf` is the descriptor of the converted file the slug maps to. Then VERIFY before writing: `JSON.parse(newText)` must deep-equal `JSON.parse(oldText)` with exactly those slugs' `chain_args` set to the derived value (deleted when null) — compare via a canonical `JSON.stringify` of both after applying the expected edits to a clone of the old parse; mismatch ⇒ throw `generate-chain-args: surgical rewrite verification failed` (nothing written). Then re-run `findings` on the new parse: any drift left ⇒ throw. Write `newText` with `fs.writeFileSync(abs, newText, 'utf8')` only if it differs; `changed` = one line per slug: `` `scripts/manifest.json scripts.${slug}.chain_args` ``. Return `{changed, drift: [], violations: []}`.
- `main(argv, streams)`: flags `--check`, `--write`, `--root=<dir>` (resolve with `path.resolve`). Exactly one of `--check`/`--write` else write a usage line to stderr and return 2. Call `run`; print `changed <x>` (stdout), `drift <x>` and `violation <x>` (stdout AND stderr). Return 1 if any drift or violation, else 0. Catch ⇒ message to stderr, return 2.

## Verify (run, report output)
- `npx vitest run src/tests/chain-args-generated.infra.test.ts` — EXPECTED: tests 1 and 2 FAIL naming `link_parcels/sources` (correct, until the orchestrator's `--write`); ALL other tests pass.
- `node scripts/analysis/generate-chain-args.mjs --check` — EXPECTED exit 1, exactly one line `drift link_parcels/sources: expected ["--full"] actual null`.
- `npx eslint scripts/analysis/generate-chain-args.mjs` — clean.
- `npm run typecheck` — clean.
