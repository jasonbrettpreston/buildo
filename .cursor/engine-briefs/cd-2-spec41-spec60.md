---
write_scope:
- docs/specs/01-pipeline/41_chain_permits.md
- docs/specs/01-pipeline/60_shared_steps.md
allow_commit: false
---
# WF3 chain_args Step 9 cd-2 — Spec 41 row-9 note + Spec 60 LP-D17 as-built addendum — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, anchored text edits verified once, preserve each file's line endings (CRLF in the working tree). NEVER run git add / commit / stash / reset — the orchestrator commits. Touch ONLY the two files in write_scope. Docs only.
**Facts (verified by the orchestrator — re-read to confirm, never invent):**
- `docs/specs/01-pipeline/41_chain_permits.md` row 9 (the line starting `| 9 | \`link_parcels\` |`) is ONE table line ending with `elsewhere in the city. | permit_parcels |`. It must stay ONE line.
- `docs/specs/01-pipeline/60_shared_steps.md` §"Link Parcels" has a blockquote addendum whose last line is `> \`LP-D16\` for the full measurement.`, followed by a blank line and `---`.

1. **Spec 41 row 9 — insert** immediately BEFORE ` | permit_parcels |` at the end of that line (same line) this text (with one leading space):
```
 **Chain argv (WF3 2026-10-03, LP-D17):** the permits chain passes NO argv (descriptor `execution.invocation.permits.argv: []`, so the generated manifest `chain_args` has no `permits` key) — a `logic_version` bump never forces a FULL relink in this chain; only the sources chain carries `--full` (Spec 43 row 11). Locked by `src/tests/link-parcels-code-version.logic.test.ts` T3b.
```
2. **Spec 60 — insert** after the line `> \`LP-D16\` for the full measurement.` a line containing only `>` and then these lines (each starting `> `), keeping them inside the same blockquote:
```
> **As-built addendum (WF3, LP-D17, 2026-10-03):** the LP-D16 fix made the `code_version` trigger able to fire,
> but only on a run whose argv carries `--full` — and `scripts/run-chain.js` passes only the manifest's
> `chain_args[chain]`, which `link_parcels` never had. The descriptor's `execution.invocation.sources.argv
> ["--full"]` was therefore unreachable from any chain run; LP-D16's T3 passed because it read the descriptor's
> argv, not the chain's. Fixed by GENERATING every converted step's manifest `chain_args` from
> `execution.invocation` (`scripts/analysis/generate-chain-args.mjs`, `--check` in pre-commit, Spec 124 R-AZ);
> the only manifest change is `link_parcels` gaining `chain_args: {"sources": ["--full"]}`, and T3/T3c now read
> the manifest. No data remediation: run 1997 had already rebuilt the table under v1. Measured 2026-10-03, PRE
> golden (committed 4cfce13f) vs POST `sources --full` golden: both `incremental:gate_unchanged`, `permit_parcels`
> 239,939 rows, `permits` 254,082, all four invariants 0, compare identical after normalisation. Each ledger name
> (`sources:link_parcels`, `permits:link_parcels`, standalone `link_parcels`) keeps its own `code_version`
> baseline — filed in `review_followups.md`. See [pilot 7 assessment](../../reports/2026-08-30-pilot7-link-parcels-assessment.md)
> §17 and `defect-ledger.md` `LP-D17`.
```
Nothing else in either file.
**Verify:** `node scripts/analysis/spec-split-check.mjs --check` (expect exit 0). `git diff --stat -- docs/specs/01-pipeline/41_chain_permits.md docs/specs/01-pipeline/60_shared_steps.md` (expect 41: 1 line changed; 60: 14 insertions). Report each result.
