# Plan Review Templates

Reusable plan-review prompts for the R0 (pre-implementation) review step in WF1/WF2/WF3.

## Why these exist

Generic adversarial reviews produce 20-30% noise (hallucinations, conflicts with project invariants, prose summaries that hide non-actionable items). These templates fix that by:

1. **Specializing each reviewer by axis, not by spec.** Gemini owns spec/test/contract compliance. DeepSeek owns failure modes / data reality / edges. No axis overlap → no duplicate findings.
2. **Forcing strict triaged output** (BUG / DEFER / REJECT, one line each). Free prose is rejected by the template's contract.
3. **Calling out anti-patterns explicitly** (e.g., don't hallucinate files, don't repeat the plan's own claims).

## The two templates

| Template | Reviewer | Axes |
|---|---|---|
| `plan-review-gemini.md` | Gemini | Spec Compliance · Test Coverage · Contract / Boundary |
| `plan-review-deepseek.md` | DeepSeek | Failure Modes & Rollback · Data Reality Verification · Sibling Bugs & Edge Cases |

The axes are deliberately disjoint. Run both in parallel at R0; their findings combine without overlap.

## When to use

| Workflow | R0 review recommended? | Notes |
|---|---|---|
| **WF1 (Genesis)** | YES — high leverage | Plan-level architectural mistakes are 10× more expensive at R8 than at R0. |
| **WF2 (Enhancement)** | YES if touching contracts, schema, or UI | Skip if pure refactor / no behavior change. |
| **WF3 (Bug fix)** | Usually skip — too small | One-line fixes don't need a plan review. Bundle WF3s (like `realtor-backfill` 4-finding bundle) should use it. |
| **WF5 (Audit)** | N/A | No plan to review. |
| **WF6 (Review)** | N/A | This IS the review step. |

## Usage

Both `scripts/gemini-review.js` and `scripts/deepseek-review.js` support a `--template <path>` flag on the `plan` subcommand. The script reads the template, splits it at `## User prompt` (so `## System persona` becomes the systemInstruction), and substitutes:

- `{{PLAN}}` → contents of `.cursor/active_task.md`
- `{{SPECS}}` → concatenated contents of files passed via `--specs <comma-separated>` (formatted with `### <path>` headers)
- `{{DATA_CONTEXT}}` (DeepSeek only) → contents of file passed via `--data-context <path>`

### Gemini — spec / test / contract compliance

```bash
npm run review:gemini -- plan \
  --template .claude/review-templates/plan-review-gemini.md \
  --specs docs/specs/02-web-admin/76_lead_feed_health_dashboard.md,docs/specs/02-web-admin/33_web_admin_engineering_protocol.md
```

### DeepSeek — failure modes / data reality / edges

```bash
npm run review:deepseek -- plan \
  --template .claude/review-templates/plan-review-deepseek.md \
  --specs docs/specs/02-web-admin/76_lead_feed_health_dashboard.md \
  --data-context .review-data-context.md
```

If `--data-context` is omitted, the template's `{{DATA_CONTEXT}}` substitutes to a default "no live-DB context provided — flag every data assumption as UNVERIFIED PREMISE" string, so DeepSeek's data-reality axis still runs (just with maximum suspicion).

### Backward compatibility

`npm run review:gemini -- plan` (no flags) and `npm run review:deepseek -- plan` (no flags) still work and use the original hardcoded prompts. No existing caller breaks.

## Recommended R0 cadence

```
R0a — Gemini plan review     (parallel)
R0b — DeepSeek plan review   (parallel)
R0 triage — merge findings, apply BUGs to plan, defer DEFERs to `docs/reports/review_followups.md`
R0 re-lock — present revised plan to user with "applied N findings" summary; ask for authorization
```

This adds ~5-10 minutes to plan-lock for a high-leverage WF — and saves a typical 30-60 minutes of R8 rework loops.

## How these templates were derived

Observations from the four reviews in WF1 #B / WF3 #realtor-backfill / WF1 #C (this codebase, May 2026):

- **R0 (pre-implementation) had highest signal-to-noise** of any review type. WF1 #C's R0 caught 7 plan-level issues in 37 seconds; 5 folded in, 0 false positives.
- **Worktree code-reviewer (isolated-checkout agent) had lowest false-positive rate.** But it can only review code, not plans.
- **Generic adversarial reviews produced ~25% noise.** Gemini hallucinated tables (`permit_products`); DeepSeek contradicted project invariants (`h-11 w-11 too large` violated Spec 33 §9 touch targets). Worktree reviewer also produced one false positive when comparing against `main` while new files existed in the working tree.
- **Specialized axes produced more focused, non-overlapping findings.** When each reviewer had a tight 3-axis brief, ~80% of findings were unique per reviewer.

The templates encode these lessons as guardrails (the "Anti-patterns" sections) + axis specialization (the explicit "you are NOT responsible for X" carve-outs).

## Future improvements

- **Add `--template` flag to both review scripts** so templates can be invoked end-to-end without paste.
- **Add a "data-reality" pre-flight** that runs canned queries (row counts, NULL distribution, FK coverage) against the live DB and feeds the result into the DeepSeek `{{DATA_CONTEXT}}` slot automatically.
- **Add a third template for the worktree code-reviewer** at R8 with the same triage format. The worktree reviewer's free-prose output is the highest-quality but slowest-to-triage of the three reviewers.
