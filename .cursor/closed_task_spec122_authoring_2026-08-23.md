# Active Task: Spec 122 — pipeline step optimization (island standardization)
**Status:** Implementation

> Prior task record (P0 + Phase B + step-runner programme context) preserved verbatim at
> `.cursor/closed_task_p0_phaseb_programme_2026-08-23.md`. Nothing discarded.

## Context

* **Goal:** Author Spec 122 — standardize all 27 `sources` steps **in place** (each script stays at its path, keeps its lock ID, keeps its `run-chain.js` invocation) by moving every non-compute concern into a shared `pipeline.step(descriptor, compute)` library, with the validator baked in. Deliver the claim survive/die classification, the enforcement model, the cross-step ledger, and the conversion process.
* **Target Spec:** `docs/specs/01-pipeline/122_pipeline_step_optimization.md` (new). Derives from Spec 120 (design), Spec 121 (method), and `docs/reports/2026-08-22-sources-chain-evidence-base.md` (evidence).
* **Domain Mode:** **Backend/Pipeline** — `scripts/CLAUDE.md`. NB the generator is *tooling*, not a chain step: Spec 47 §R1–R12 (advisory lock / `pipeline.run()` / `emitSummary`) governs chain scripts and does **not** apply to `scripts/violations/**`, same posture as `scripts/analysis/**`.
* **Workflow:** WF1 (Genesis — new spec + new tooling).

## Why generated, not written

Spec 121's header records a **measured ~60% citation-error rate on hand-written detail**, with the corrective stated in its own §12.1a: *"the plan must be GENERATED from the spec, not written from it."* The S0 extractor it describes as "built and run 2026-08-22" **does not exist in the repo** — `scripts/violations/` is absent — so every `[generated]` figure in Spec 121 is currently unreproducible. This task builds that tool and commits it.

## Technical Implementation

* **New:** `scripts/violations/extract-claims.mjs` — parses Spec 121 Appendix A into the claim register, applies a small authored rule set, emits the island-architecture classification. Small authored rules + generated rendering (Appendix E's split).
* **New:** `docs/specs/01-pipeline/122_pipeline_step_optimization.md`.
* **Not modified:** the 27 step scripts · `manifest.json` · `run-chain.js` · `LOCK_ID_REGISTRY`. Spec 122's whole premise is that none of these move.

## Standards Compliance

* **Try-Catch Boundary:** N/A — CLI tooling, no API route. Parse failure exits non-zero with the reason.
* **Unhappy Path Tests:** `--self-test` runs the parser against a known-bad fixture and asserts it FIRES, including a negative control. Refuses to emit output if the self-test fails, or if the parsed total is implausibly low (silent-truncation guard).
* **logError Mandate:** N/A — `scripts/` uses `console.error` for tooling; no pipeline SDK context.
* **UI Layout:** N/A.
* **§4.2 / injection:** N/A — reads a markdown file, no SQL.
* **Tooling gate (Spec 121 §12b.6):** *anything that enforces must be proven to fire.* Nine checker bugs in one session reported green because the check never looked properly (App. G) — and this session found a tenth: `parcel-sanity-audit.js` defaulting to the pre-cutover DB, reporting 2,394 violations and 0 FAIL gates where the authoritative DB has 30,288 and 1.

## Execution Plan

- [x] Rollback anchor: `1cb4e308`; prior active task backed up.
- [x] Domain reading: `scripts/CLAUDE.md`; Spec 120 §1–§16; Spec 121 §12 + Appendix A; evidence base §1–§8.
- [x] Step 1: `scripts/violations/extract-claims.mjs` + self-test (9 assertions incl. a negative control).
- [x] Step 2: run it — **290 claims** (the spec's own "288" omits 6a/6b); 3 DEAD / 66 RESHAPED / 40 STRENGTHENED / 181 UNCHANGED; both forks emitted.
- [x] Step 3: three censuses folded. The claim census **corrected the generator on 11 claims** (its first run reported a false 0-DEAD).
- [x] Step 4: Spec 122 authored. A1/A2/A3 operator-ratified 2026-08-23.
- [x] Step 5: eslint **0 problems**, `tsc --noEmit` clean. ⚠️ **NOT registered in the system map** — awaiting operator authorization (Spec 120/121 precedent).
- [x] Filed 2 census findings to `review_followups.md`: the centroid invalidator gap (HIGH) and the false ordering lock (MED).

**PLAN COMPLIANCE GATE (§11):** Database Impact **NO** (no migration, no `logic_variables` key, no `_contracts.json` row). Pipeline Script Modified **NO** — new tooling only. Cross-Layer Contracts: the generator reads Spec 121's markdown, so it is coupled to that file's table shape; the self-test pins the shapes it must parse (4-column and 5-column sections, suffixed IDs, range rows).

> **Authorized by operator 2026-08-23** ("proceed with script writing").
