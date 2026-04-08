# ADR 001: Dual TS↔JS code path for classification, scoring, and scope

**Status:** Accepted
**Date:** 2026-04-08
**Decision-makers:** core team

## Context

Three modules have parallel implementations in TypeScript (used by API routes) and CommonJS (used by pipeline scripts):

- `src/lib/classification/classifier.ts` ↔ `scripts/classify-permits.js`
- `src/features/leads/lib/cost-model.ts` ↔ `scripts/compute-cost-estimates.js`
- (historic) scoring constants in both `src/lib/scoring/scoring.ts` and `scripts/score-leads.js`

Adversarial reviews (Gemini, DeepSeek) flag this on every pass: "manual sync between TS and JS is guaranteed to drift" / "this is a time bomb." The criticism is technically correct — the constants and branch logic must stay byte-for-byte aligned, with no compiler enforcement.

## Decision

Keep the dual code path. CLAUDE.md §7 Backend Mode rule 8 codifies the discipline: when modifying classification/scoring/scope logic, update BOTH the TS module AND the JS pipeline script in the same commit. Cross-reference comments at the top of each file pair name the sibling. Code review checks the dual update.

## Rationale

The pipeline scripts run in Node CommonJS without a TypeScript compile step (per the existing pipeline architecture in spec 30/40). Importing `.ts` files from a CommonJS pipeline script would require either a build step (which the pipeline architecture explicitly rejects to keep deploy-on-push working) or a runtime TS loader (which adds startup latency to scripts that run on a 5-minute cron). Both alternatives are higher-cost than the manual-sync discipline. The cost of drift has been bounded so far by:

1. Cross-reference comments in each TS file pointing at its JS sibling
2. Test-side audits that grep for matching constant names across both files (Phase 1b-i compute-cost-estimates.infra.test.ts pattern)
3. The Phase 1 holistic review caught one drift bug (`pt.trade_slug` vs `JOIN trades`) in `4c04ef5` — proof the review process catches drift before it ships

## Consequences

**Accepted:**
- Reviewers will continue to flag this every cycle (mitigated by ADR link in source headers)
- Drift is possible if a developer forgets the rule (mitigated by cross-reference comments + grep tests)
- Refactoring requires touching two files (manageable; the modules are small)

**Avoided:**
- Pipeline build step that breaks deploy-on-push
- Runtime TS loader latency on cron jobs
- Single-source extraction to JSON, which loses the type system on the API side

## Re-evaluation Triggers

- A third consumer of the same logic emerges (e.g., a Cloud Function or a different service) — at 3+ consumers the manual sync overhead exceeds a shared-JSON refactor
- Pipeline architecture changes to support TS imports natively
- A drift bug ships to production despite the discipline (i.e., the reviews stop catching them)
- TypeScript adds a "loose JS interop" mode that lets CommonJS import compiled .ts modules without a build step
