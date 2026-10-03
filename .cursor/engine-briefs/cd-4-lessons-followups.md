---
write_scope:
- tasks/lessons.md
- docs/reports/review_followups.md
allow_commit: false
---
# WF3 chain_args Step 9 cd-4 — lessons entry + three review_followups rows — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, anchored text edits verified once, preserve each file's line endings. NEVER run git add / commit / stash / reset — the orchestrator commits. Touch ONLY the two files in write_scope. Docs only. APPEND only — change no existing line.
**Facts (verified by the orchestrator — re-read to confirm, never invent):**
- `tasks/lessons.md` ends with the section `## 2026-10-01 — A categorical exclusion must be measured against the category's cardinality` whose last bullet starts `- A fix that makes a gate fire by reporting a fake violation from compute is a BYPASS`. Entries are `## <date> — <title>` followed by `- ` bullets, one blank line between entries.
- `docs/reports/review_followups.md` ends with a markdown table whose last row starts `| LOW | **Witness resolver: MERGE fails with an opaque TypeError**`. Rows are 3 cells: `| SEVERITY | **title** (context): detail | action |`, one line each.

1. **lessons.md — append** at the end of the file (after the last bullet, one blank line between):
```
## 2026-10-03 — A lock that reads the descriptor's argv proves the descriptor, not the chain (LP-D17)
- `link_parcels` declared `execution.invocation.sources.argv ["--full"]` at conversion (`b37087f3`), but `scripts/manifest.json` never carried `chain_args`, and `run-chain.js` passes only `chain_args[chain]` — so the FULL relink was unreachable from any chain run for five weeks. LP-D16's T3 built its argv from the descriptor and stayed green the whole time. A test of a runtime path must read the input the runtime reads (here the manifest), not the declaration that is supposed to match it.
- Two hand-kept copies of one fact drift; R-L (`link_wsib`) kept them in step by convention only. Fix the class: generate one from the other and gate the drift in pre-commit — `generate-chain-args.mjs --check` (Spec 124 R-AZ), the same shape as R-BE's generated Target Files. WF3 chain_args, 2026-10-03.
```
2. **review_followups.md — append** these three rows immediately after the last table row (no blank line between rows):
```
| MEDIUM | **Per-chain `code_version` baselines are split by ledger name** (WF3 chain_args, 2026-10-03, LP-D17): `sources:link_parcels`, `permits:link_parcels` and standalone `link_parcels` each keep their own prior (`scripts/lib/step/index.js` `ledgerPipelineName`; `staleness.js` "an ABSENT baseline is not a change"). A future `logic_version` bump repaired by a standalone `LINK_PARCELS_FORCE_FULL=1` run re-bases only `link_parcels`; the next sources run still sees the old baseline ⇒ `changed=true` + `--full` ⇒ a second full retraction/rebuild (~12.7K rows by run 1997's size — derived, not measured). Same split-ledger-name class as `EC-D10` (enrich_centreline). | input to the descriptor-truth programme together with EC-D10 |
| LOW | **Input drift is not a `link_parcels` FULL trigger** (WF3 chain_args, 2026-10-03): `code_version` is the only declared trigger, so parcels cohort rewrites (~1,000 rows ×5) and address_points rewrites (×2) since run 1997 never cause a relink. How many links would change is UNMEASURED. | measure with a FULL run on a scratch DB (the descriptor declares `override.dry_run: "none"`, so there is no dry run); decide whether an input trigger is owed |
| LOW | **5 converted descriptors omit `PIPELINE_CHAIN` from `execution.invocation.*.env`** (WF3 chain_args, 2026-10-03): `compute_centroids`, `enrich_parcels`, `link_parcel_addresses` (sources) and `refresh_snapshot` (all 4 chains) declare `env: {}`. No runtime divergence — `run-chain.js` always injects `PIPELINE_CHAIN` — and `generate-chain-args.mjs --check` accepts absent. | align at each step's next descriptor edit (editing now moves source_fingerprints → recaptures for zero behaviour change) |
```
Nothing else in either file.
**Verify:** `git diff --stat -- tasks/lessons.md docs/reports/review_followups.md` (expect 4 insertions in lessons.md, 3 in review_followups.md, 0 deletions). Report it.
