# Active Task: WF2 #review-templates — wire `--template` flag into gemini-review.js + deepseek-review.js
**Status:** Done (committed 2026-05-11 — R0 Gemini review caught missing tests; extracted shared lib + added 10 unit tests in-loop)
**Workflow:** WF2 (Enhancement — dev-tooling change to existing operator-invoked review scripts; no production / chain impact)
**Domain Mode:** Backend/Pipeline (`scripts/` files only — but **NOT** chain-running scripts; these are operator-invoked dev utilities. The Spec 47 §R1–R12 mandatory skeleton does NOT apply — these scripts don't use `pipeline.run`, advisory locks, or PIPELINE_SUMMARY.)
**Rollback Anchor:** `2e445dd` (current HEAD on `main` — WF1 #C admin Lifecycle Timeline panel)
**Multi-Agent Review:** SKIP per WF2 cadence default — these are dev-tooling scripts with no production blast radius; a 30-line CLI flag addition doesn't warrant Gemini/DeepSeek/worktree. Worktree code-reviewer only at R3 if any concerns surface.

---

## Context

* **Goal:** Make the two plan-review templates I just wrote (`plan-review-gemini.md`, `plan-review-deepseek.md`) trivially invokable from the existing review scripts without manual paste.

* **Why now:** Templates exist but are paste-only today. Adding a `--template` flag makes the R0 review cadence a 2-command operation:
  ```bash
  npm run review:gemini -- plan --template .claude/review-templates/plan-review-gemini.md --specs docs/specs/02-web-admin/76,docs/specs/02-web-admin/33
  npm run review:deepseek -- plan --template .claude/review-templates/plan-review-deepseek.md --specs docs/specs/02-web-admin/76 --data-context .review-data-context.md
  ```

* **Key Files (modified):**
  - **MODIFY `scripts/gemini-review.js`** — extend `cmdReviewPlan()` to accept `{ templatePath, specPaths }` opts; when template is supplied, split it at `## User prompt` heading (system persona before, user template after), substitute `{{PLAN}}` from `.cursor/active_task.md` and `{{SPECS}}` from comma-separated `--specs` arg. Legacy mode (no `--template`) preserved unchanged for backward compatibility.
  - **MODIFY `scripts/deepseek-review.js`** — same change + additional `--data-context <path>` flag that substitutes `{{DATA_CONTEXT}}` from a markdown file containing live-DB query results.
  - **MODIFY `.claude/review-templates/README.md`** — replace the "current (manual paste)" section with the new `--template` flag invocation. Remove the "deferred until first user" line.

* **NO** new files, tests, migrations, or chain changes. The two scripts are not in `manifest.json` (they're operator-invoked, not chain steps). No Bundle G lock registry impact.

## Technical Implementation

* **New/Modified Components:** N/A (no UI).

* **Data Hooks/Libs:** N/A.

* **Database Impact:** NO.

* **Template format contract** (already encoded in the two template files):
  - Templates use markdown sections `## System persona` (first) and `## User prompt` (second).
  - The script splits at `## User prompt` — text before that heading becomes `systemInstruction`; text from `## User prompt` onward becomes the user prompt.
  - Placeholders `{{PLAN}}` and `{{SPECS}}` (Gemini) + `{{DATA_CONTEXT}}` (DeepSeek) are substituted with file contents before sending.
  - Fallback: if a template lacks `## User prompt` heading, the whole file is used as the user prompt with a generic systemInstruction.

* **Backward compatibility:** `--template` is optional. When absent, `cmdReviewPlan()` uses the original hardcoded prompt + systemInstruction unchanged. Existing callers (any CI / scripts / muscle memory) keep working without modification.

* **CLI flag parsing:** simple `args.indexOf('--template')` / `args.indexOf('--specs')` / `args.indexOf('--data-context')` — matches the existing `--context` pattern in `cmdReviewFile`.

## Standards Compliance

* **Try-Catch Boundary:** N/A — these are CLI scripts, not API routes.
* **Unhappy Path Tests:** N/A — no automated tests. Smoke test at R3 (run the script end-to-end with the new flag against the just-committed WF1 #C plan; verify the substituted prompt actually produces a Gemini response).
* **logError Mandate:** N/A — these scripts use `console.error` for CLI feedback, which is fine for dev tooling.
* **UI Layout:** N/A.

## Execution Plan

- [ ] **R1 — Implementation.**
  1. `scripts/gemini-review.js` — extend `cmdReviewPlan()` to accept `{ templatePath, specPaths }` opts; extend CLI dispatch to parse `--template` + `--specs` flags. Help text updated.
  2. `scripts/deepseek-review.js` — same change + `--data-context` flag for the `{{DATA_CONTEXT}}` substitution.
  3. `.claude/review-templates/README.md` — replace manual-paste section with the new flag-based invocation.

- [ ] **R2 — Typecheck + lint.**
  - `npm run typecheck` (these are `.js` files; tsc -noEmit will skip but lint should catch syntax).
  - `npm run lint -- --fix`.

- [ ] **R3 — Smoke test the new flag against a real plan.**
  - Re-run the WF1 #C plan review using the new mechanic:
    ```
    npm run review:gemini -- plan --template .claude/review-templates/plan-review-gemini.md --specs docs/specs/02-web-admin/76_lead_feed_health_dashboard.md,docs/specs/02-web-admin/33_web_admin_engineering_protocol.md
    ```
  - Verify: (a) the script reads the template + specs, (b) substitutes `{{PLAN}}` + `{{SPECS}}`, (c) sends the prompt to Gemini, (d) returns a response in the strict triage format the template requires.
  - If the response format is wrong (e.g., template's "Anti-patterns" section gets ignored), iterate on the template wording.
  - **Note:** since the plan is "Done" status, the smoke test result is just confirming the wiring works — it doesn't gate this WF.

- [ ] **R4 — Atomic commit + push + close active task.**
  - Single commit: `chore(review-templates): wire --template flag into gemini-review + deepseek-review scripts`
  - No multi-agent review (WF2 dev-tooling default).

---

> **PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
>
> §10 note: this is a CLI dev-tool change with no production impact, no chain integration, no schema/contract/API changes. The §11 Plan Compliance Checklist items overwhelmingly N/A (no DB migration, no API route, no pipeline script touched, no shared classification logic, no UI surface). The two files touched are explicitly NOT chain-running scripts despite living in `scripts/` (they aren't in `manifest.json`, don't use `pipeline.run`, no advisory locks). Spec 47 §R1–R12 doesn't apply.
>
> Multi-agent review is SKIPPED per WF2 dev-tooling default. If you want a worktree review pass anyway, add it before authorizing.
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
