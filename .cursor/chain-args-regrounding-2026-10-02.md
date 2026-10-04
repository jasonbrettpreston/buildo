# Re-grounding — wf3_link_parcels_full_mode plan vs tip cba60e3c (2026-10-02)

Executor seat, worktree `Buildo-wt-chainargs`, branch `wf3/chain-args-generated`. Every claim below was re-executed (grep/sed/node) against the live tree; DB claims were NOT re-measured (DB read was denied to this seat — see last section).

| Plan claim | Live tree (MEASURED) | Drift |
|---|---|---|
| `scripts/link-parcels.descriptor.json:262` sources argv `["--full"]` | `:262` `"sources": { "argv": ["--full"], "env": { "PIPELINE_CHAIN": "sources" } }` | none |
| `scripts/manifest.json:28` link_parcels has no `chain_args` | `:28`, no `chain_args` | none |
| `scripts/run-chain.js:874` passes only `chain_args?.[chainId]` | now `:903` `const extraArgs = [...(scriptEntry.chain_args?.[chainId] \|\| [])];`; `PIPELINE_CHAIN` injection block moved too (~`:880-903`) | line drift only |
| `staleness.js:309` `fullArgPresent`; `:512` mode rule | `:309`, `:512` | none |
| `step-validate.mjs:1309-1315` `derivedInvocations` | `:1310-1317` | line drift only |
| `golden-fingerprint.infra.test.ts:70-76` | `:70-76` | none |
| `reset.js:187-200` `assertForceFullAuthorized` | `:187-205`, throws at `:196-202` on missing `chain_args.sources "--full"` | line drift only |
| `link-parcels-code-version.logic.test.ts:63-64,130,148` | `SOURCES_ARGV` const `:63`; used by T3 (`:126`) AND T4 (`:149`) | **behavioural note:** `SOURCES_ARGV` is shared by T3 and T4. "Change ONLY T3's argv source" is implemented as a NEW const read from the manifest, used by T3/T3c only; T4 keeps the descriptor const (unchanged) |
| `step-library.logic.test.ts` STA-3 `:3513-3553` | guard-2 block `:3512-3535` | line drift only |
| `hooks-composition.infra.test.ts:219-230` pattern | `:219-231` | none |
| `step.schema.json:3518-3519` "CHECKABLE difference" | `:3519` | none |
| link_massing finding 5 `violations.test.ts:1724-1730`; enrich_parcels `:644` | same lines | none |
| pilot-7 assessment `:2010` "no `chain_args`" | `:2010` | none |
| `tasks/lessons.md:207` forced-FULL lesson | section header `:205`, `linked_at` churn bullet `:207` | none |
| `.husky/pre-commit` has `generate-target-files.mjs --check` | `:20` | none |
| `converted.json` holds 23 FILE paths | **24** converted files (+`load-heritage.js` in `pending`) | count drift (load_wsib converted since) |
| Fleet: argv mismatch 1 (link_parcels/sources); chain-membership 0; env 0 | re-measured over all 24 converted (node, every slug mapped via `manifest.scripts[*].file`): argv mismatch **exactly 1** = `link_parcels/sources` expected `["--full"]` actual absent; invocation keys ≡ manifest chains for all 24; no invocation `env.PIPELINE_CHAIN` ≠ chain; no manifest `scripts[*].env.PIPELINE_CHAIN` | none |
| one file serving two slugs (`enrich-permits.js`) | not in `converted` today — every converted file maps to exactly one slug; the two-slug case is fixture-only | none (fixture still required) |
| `chain_args` holders today | `enrich_parcels`, `link_massing`, `link_wsib` (all `{ "sources": ["--full"] }`) | none |
| `scripts/manifest.json` line endings | LF (`file` reports no CRLF) | n/a |

## Setup incident (fixed)
The orchestrator's setup line ran `npx husky`, which reset the SHARED `core.hooksPath` (in `C:/Users/User/Buildo/.git/config`) to `.husky/_` — the exact hookless hole `tasks/lessons.md` 2026-09-27 says never to reopen. Restored with `node scripts/hooks/install-hooks.mjs --verify` → `core.hooksPath = .husky`, 4 hooks verified (MEASURED). Use `npm run worktree:setup` next time.

## NOT re-measured (orchestrator owes before Step 3)
Plan Status line: "Re-measure before starting: the 2026-09-30 local sources chain run stamps `sources:link_parcels`". A read-only `pipeline_runs` query was denied to this seat. Step 3's expected `incremental:gate_unchanged` (NULL baseline) is UNVERIFIED: if `sources:link_parcels` now carries `code_version = v1-knn-boundary-distance`, the PRE capture still resolves `incremental:gate_unchanged` (match, not absent) — same mode, different reason in `signals[].prior`.
