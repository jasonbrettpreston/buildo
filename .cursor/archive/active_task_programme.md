# RETIRED — see `.cursor/active_task.md`

> **2026-08-23 (S0):** This file was a GENERATED projection of the v1 programme plan, emitted by
> `scripts/violations/build-active-task.mjs --write`. **That generator is now retired** (its source,
> `.cursor/queued_task_step_opt_programme.md`, was promoted to `.cursor/active_task.md` and is a pointer
> stub; and the v2 plan's shape no longer matches the generator's hard-coded stage-table assumptions).
>
> ⚠️ It carried `**Status:** Planning`, which made it read as a **competing active task**. It is not one.
> The programme's single source of record is **`.cursor/active_task.md`** (Spec 122 §10), hand-maintained
> with operator rulings R1–R6 + V1–V6 applied.
>
> Nothing unique was lost: this file only ever restated the v1 plan, which is preserved in git history at
> `623a1ce8` (`.cursor/queued_task_step_opt_programme.md`).
>
> **The drift guards that survived** — these still generate and still hard-fail:
>
> ```
> node scripts/violations/plan-claims.mjs    docs/reports/generated/123-claim-plan.md
> node scripts/violations/plan-claims.mjs --checklist docs/reports/generated/123-per-step-checklist.md
> node scripts/violations/map-categories.mjs docs/reports/generated/122-category-coverage.md
> node scripts/violations/map-concerns.mjs   docs/reports/generated/122-concern-homes.md
> ```
