---
write_scope:
- docs/reports/2026-08-30-pilot7-link-parcels-assessment.md
- docs/reports/defect-ledger.md
allow_commit: false
---
# WF3 chain_args Step 9 cd-3 — pilot-7 assessment §17 LP-D17 + defect-ledger LP-D17 row — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, anchored text edits verified once, preserve each file's line endings (CRLF in the working tree). NEVER run git add / commit / stash / reset — the orchestrator commits. Touch ONLY the two files in write_scope. Docs only. Do NOT touch the generated "Validation scorecard" section at the end of the assessment.
**Facts (verified by the orchestrator — re-read to confirm, never invent):**
- In `docs/reports/2026-08-30-pilot7-link-parcels-assessment.md`, §16's last paragraph ends with the line `descriptor's own \`staleness.trigger[].emit_key\`, never by reading the descriptor alone.`, followed by a blank line, a line `---`, a blank line, then `## §R Reflection (FULL — promoted at commit 9, per Spec 123 §7/Spec 124 R-F)`.
- In `docs/reports/defect-ledger.md`, the row starting `| LP-D16 |` is ONE line; the next line starts `| EC-D9 |`. Ledger rows are 7 cells: `| ID | Step | Anchor | One-line | Status | Closes at | Source |`. G6 requires the Status cell to contain the word CLOSED or PIN.

1. **Assessment — insert** a new section between the `---` line after §16 and `## §R Reflection`: directly after that `---` line insert a blank line followed by this block, then a blank line and a `---` line (so §17 is fenced by `---` lines exactly like §16):
```
## §17. LP-D17 — the sources chain never passed the declared `--full` (WF3 chain_args, 2026-10-03)

**The defect.** The descriptor declares `execution.invocation.sources.argv = ["--full"]` (since conversion,
`b37087f3`, 2026-08-30), but `scripts/manifest.json`'s `link_parcels` entry never carried `chain_args`, and
`scripts/run-chain.js` passes only `chain_args[chain]`. So no chain run ever received `--full`, and the
`code_version` trigger LP-D16 repaired could not force a FULL from a chain. §0.3 below recorded "no
`chain_args`" for both chains at planning time. LP-D16's T3 stayed green because it built its argv from the
descriptor, not from what the chain passes — a lock that reads the descriptor's argv proves the descriptor,
not the chain.

**THE FIX (class, not instance).** `scripts/analysis/generate-chain-args.mjs` derives every converted step's
manifest `chain_args` from `execution.invocation`; `--check` runs in pre-commit (Spec 124 R-AZ). `--write`
changed exactly one manifest entry: `link_parcels` gains `"chain_args": { "sources": ["--full"] }`. T3/T3c in
`src/tests/link-parcels-code-version.logic.test.ts` now read `manifest.scripts.link_parcels.chain_args.sources`
(RED before the manifest change, GREEN after); T3b pins that the permits chain never resolves FULL. The
`step-library.logic.test.ts` STA-3 case proves `assertForceFullAuthorized` now accepts a `force_full` reset for
`link_parcels` (RED before). RED evidence: `docs/reports/red-evidence/chain-args/`.

**Data.** No remediation owed — run 1997 (2026-09-26, `LINK_PARCELS_FORCE_FULL=1`) already rebuilt the table
under `v1-knn-boundary-distance`. G8, measured 2026-10-03:

| | PRE (`pre/sources-full.json`, committed 4cfce13f) | POST (`post/sources-full.json`) |
|---|---|---|
| args | `["--full"]` | `["--full"]` |
| mode gate | `incremental:gate_unchanged` | `incremental:gate_unchanged` |
| `permit_parcels` rows | 239,939 | 239,939 |
| `permits` rows | 254,082 | 254,082 |
| invariants (4) | all 0 | all 0 |
| verdict | PASS | PASS |

`--compare` POST vs PRE: identical after normalisation. Both captures pass `--full` directly to the step, so
they prove the step's behaviour under that argv, not run-chain's injection; the injection is covered by the
generator check plus T3 reading the manifest (enforced, not measured on a chain run).

### G-verdict, LP-D17

**CLOSED.** `LP-D17` closed in `defect-ledger.md`. Lesson routed to `tasks/lessons.md`. Per-chain baseline split
(each ledger name keeps its own `code_version`) filed in `review_followups.md`, cross-ref `EC-D10`.
```
2. **Defect ledger — insert** a new ONE-line row immediately after the `| LP-D16 |` row (before `| EC-D9 |`):
```
| LP-D17 | link_parcels (`scripts/manifest.json` `scripts.link_parcels`; `scripts/link-parcels.descriptor.json` `execution.invocation.sources.argv`) | The descriptor declares `sources.argv ["--full"]` but the manifest never carried `chain_args`, and `scripts/run-chain.js` passes only `chain_args[chain]` — so no chain run received `--full` and the `code_version` trigger (LP-D16) could not force a FULL from a chain; LP-D16's T3 read the descriptor's argv, not the chain's | **CLOSED this commit (WF3 chain_args, 2026-10-03).** Present since conversion (`b37087f3`, 2026-08-30). Fix: `scripts/analysis/generate-chain-args.mjs` generates converted steps' `chain_args` from `execution.invocation`, `--check` in pre-commit (Spec 124 R-AZ); `link_parcels` gains `chain_args: {"sources": ["--full"]}`, the only manifest change. T3/T3c read the manifest (RED→GREEN), T3b pins permits never FULL. No data remediation (run 1997 rebuilt under v1). Measured PRE (4cfce13f) vs POST `sources --full` goldens: both `incremental:gate_unchanged`, `permit_parcels` 239,939, `permits` 254,082, invariants 0, compare identical (normalised) | present since b37087f3 (2026-08-30), fixed WF3 (2026-10-03) | [pilot 7 assessment](2026-08-30-pilot7-link-parcels-assessment.md) §17; `src/tests/chain-args-generated.infra.test.ts`; `src/tests/link-parcels-code-version.logic.test.ts` |
```
Nothing else in either file.
**Verify:** `node scripts/analysis/step-validate.mjs --step=link_parcels --fast` — report the G6 line verbatim (expect LP-D17 counted, 0 rows without CLOSED/PIN). `git diff --stat -- docs/reports/2026-08-30-pilot7-link-parcels-assessment.md docs/reports/defect-ledger.md`. Report each result.
