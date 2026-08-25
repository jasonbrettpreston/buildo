# Defect Ledger — fleet register (Spec 123 §6 G6 / G8)

> Generated **by hand** for Pilot 1 (`assert_schema`, 2026-08-25) — the first register in the repo. From S5 onward this file is **generator-owned** (`scripts/violations/plan-claims.mjs` family); do not hand-edit rows after that point, regenerate.
> ID scheme: `<STEP-PREFIX>-D<n>`; a row is OPEN until the closing commit lands and the differential points at it (G8: *every explained diff points at a Defect Ledger ID*). Anchors are `file:line` at the HEAD stated in the source assessment and rot with the file — re-derive before citing.

| ID | Step | Anchor (HEAD `8b857169`) | One-line | Status | Closes at | Source |
|---|---|---|---|---|---|---|
| AS-D1 | assert_schema | `scripts/quality/assert-schema.js:546` | sources verdict `sourceErrors.length` — not row-derived | OPEN · PIN | commit 8b | [pilot 1 assessment](2026-08-25-pilot1-assert-schema-assessment.md) §4.4 |
| AS-D1b | assert_schema (fleet) | `scripts/lib/` (absent) | no shared `verdictCascade`; 13 per-script copies | OPEN | DEFERRED — Spec 120 §9.3 ① | same |
| AS-D2 | assert_schema | `scripts/quality/assert-schema.js:290-602` | process-kill strand inside the 21-request window (throws now closed by `f32b1485`) | OPEN (narrowed) | DEFERRED — runner-level | same |
| AS-D3 | assert_schema | `scripts/quality/assert-schema.js:282-284` | ledger INSERT failure swallowed, `runId` null | OPEN · PIN | commit 7 (verify library `openLedgerRow` does not swallow) | same |
| AS-D4 | assert_schema | `scripts/quality/assert-schema.js:567` | finalize UPDATE failure `.catch(warn)`; window relabels `failed` but real meta lost | OPEN (partially mitigated) | commit 7 (verify `finalizeLedgerRow`) | same |
| AS-D5 | assert_schema | `scripts/quality/assert-schema.js:539`, `:536` | hand-maintained `sources_checked` = 18 + unrecorded regex-token obligation | OPEN · PIN | commit 8c | same |
| AS-D6 | assert_schema | `scripts/quality/assert-schema.js:473-483`, `:503-504`, `:535-537` | error attribution by substring / alternation regex | OPEN · PIN | commit 8b | same |
| AS-D7 | assert_schema | `scripts/quality/assert-schema.js:527` | `checks_passed` is `'all'`/`undefined`, never a count | OPEN · PIN | commit 7 (declared diff) | same |
| AS-D8 | assert_schema | `scripts/quality/assert-schema.js:118,162,205,224,251` | 21 HTTP requests, no timeout/retry/abort | OPEN · PIN (`network.timeout: "none"`) | DEFERRED — peel-8c candidate, own lock | same |
| AS-D9 | assert_schema | `scripts/quality/assert-schema.js:605` | lock contention → `return;` with no step-level emit | OPEN · PIN | commit 7 (library SKIP emit + `self_skipped`; declared diff) | same |
| AS-D10 | assert_schema | file (`module.exports` = 0) | no exports; 13 source-text test sites across 6 files | OPEN | commit 7 (compute module; sites re-homed) | same |
