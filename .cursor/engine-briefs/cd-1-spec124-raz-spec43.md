---
write_scope:
- docs/specs/01-pipeline/124_step_standard_policy.md
- docs/specs/01-pipeline/43_chain_sources.md
allow_commit: false
---
# WF3 chain_args Step 9 cd-1 — Spec 124 R-AZ "Enforced by" + Spec 43 sources chain_args correction — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, anchored text edits verified once, preserve each file's line endings (CRLF in the working tree). NEVER run git add / commit / stash / reset — the orchestrator commits. Touch ONLY the two files in write_scope. Docs only.
**Facts (verified by the orchestrator — re-read to confirm, never invent):**
- `docs/specs/01-pipeline/124_step_standard_policy.md` has ONE line starting `| R-AZ |` (a single-line markdown table row — it MUST stay ONE line; never insert a newline into it). It contains the exact text `**(a′) \`execution.invocation\`** REJECTED — a per-chain argv PIN for manifest↔descriptor drift, not a runtime-read value.` and its last cell begins `\`scripts/steps/_schema/step.schema.json\` (unchanged — no RE-FREEZE);`.
- `docs/specs/01-pipeline/43_chain_sources.md` row 11 contains the exact text `Runs in its default (incremental) mode — it does NOT receive \`--full\` in the sources chain (no \`chain_args.sources\` entry in the manifest; the chain runner only injects a script's \`chain_args[chainId]\`, never a blanket full flag)`; §"Chain-Specific Arguments" contains `In the sources chain exactly **two** scripts carry a \`chain_args.sources = ["--full"]\` override in \`manifest.json\`:`; and the line beginning `Every other step (including \`link_parcels\`, \`link_neighbourhoods\`, \`link_wsib\`, \`geocode_permits\`)`.

1. **Spec 124 R-AZ row — insert** immediately AFTER the text `not a runtime-read value.` (the (a′) sentence; same line, keep one space before the insertion) this text:
```
**Enforced by (2026-10-03, WF3 chain_args, LP-D17):** `scripts/analysis/generate-chain-args.mjs --check`, a pre-commit line after `src-sql-ledger.mjs --check` (position locked GREEN/RED in `src/tests/hooks-composition.infra.test.ts`). For every step in `converted.json`, `manifest.json` `chain_args` is GENERATED from `execution.invocation` (a chain with non-empty `argv` ⇒ a key; `--write` rewrites only the drifted entry); the invocation's chains must equal the manifest chains that list the slug; a declared or manifest-`env` `PIPELINE_CHAIN` must be absent or equal the chain. Fixtures both directions: `src/tests/chain-args-generated.infra.test.ts`. NOT covered: unconverted steps' hand-written `chain_args`. Found by `link_parcels`, whose descriptor `sources.argv ["--full"]` had no manifest counterpart from conversion (b37087f3) until this gate, so run-chain never passed it.
```
2. **Spec 124 R-AZ row, last cell — insert** at the start of that cell, immediately BEFORE `` `scripts/steps/_schema/step.schema.json` (unchanged — no RE-FREEZE); `` the text `` `scripts/analysis/generate-chain-args.mjs`; `` (with one trailing space). Same line.
3. **Spec 43 row 11 — replace** the exact row-11 text quoted above with:
```
Receives `--full` in the sources chain: manifest `chain_args.sources = ["--full"]`, GENERATED from the descriptor's `execution.invocation.sources.argv` since WF3 2026-10-03 (LP-D17; before that the manifest never carried it, so the declared FULL was unreachable from a chain run). `--full` only PERMITS a full relink — the descriptor's `code_version` staleness trigger is the sole trigger, so an unchanged `staleness.logic_version` resolves `incremental:gate_unchanged` (measured, PRE/POST goldens 2026-10-03)
```
4. **Spec 43 §Chain-Specific Arguments — replace** `exactly **two** scripts carry` with `exactly **four** scripts carry`, and append after that line's trailing colon ` (for CONVERTED steps the entry is GENERATED from the descriptor's \`execution.invocation\` and drift-checked in pre-commit by \`scripts/analysis/generate-chain-args.mjs --check\`, Spec 124 R-AZ):` — i.e. the line ends with `R-AZ):` instead of `` `manifest.json`: `` + colon; keep the original words before it. Then, immediately after the existing `enrich_parcels` bullet line (the bullet starting `- \`enrich_parcels\` — full envelope/opt-config re-enrich`), insert two new bullet lines:
```
- `link_wsib` — added by Spec 124 R-L (2026-08-28): the descriptor's destructive full re-link fires only on the chain whose argv carries `--full`.
- `link_parcels` — added by WF3 2026-10-03 (LP-D17, generated from the descriptor); FULL fires only on a `code_version` change (see row 11).
```
5. **Spec 43 — replace** `Every other step (including \`link_parcels\`, \`link_neighbourhoods\`, \`link_wsib\`, \`geocode_permits\`)` with `Every other step (including \`link_neighbourhoods\`, \`geocode_permits\`)`. Nothing else on that line.
Nothing else in either file.
**Verify:** `node scripts/analysis/spec-split-check.mjs --check` (expect exit 0). Report the exact `git diff --stat` line counts you see via `git diff --stat -- docs/specs/01-pipeline/124_step_standard_policy.md docs/specs/01-pipeline/43_chain_sources.md` (expect 1 line changed in 124; 124 must still have exactly one line starting `| R-AZ |`).
