# Active Task: runMaterializePhase gains the interrupted-retraction term (R-B/LW-D20 recurrence)
**Status:** Implementation

## Context
* **Goal:** `runMaterializePhase` (`scripts/lib/step/index.js:1519`) computes `bypassed = overrides.force_full === true`, missing the `|| interruptedRetraction.interrupted` term that `runCascadePhase`/`runLinkPhase` carry since LW-D20 (`8adf5d19`). The materialize runner was added at pilot 5 (`5ee14f5b`) and never received the fold — an ARCHETYPE-level gap, not a single-step one.
* **Target Spec:** `docs/specs/01-pipeline/124_step_standard_policy.md` R-B / SS5
* **Key Files:** `scripts/lib/step/index.js` (runMaterializePhase, runWithPool call site), `scripts/lib/step/staleness.js` (detectInterruptedRetraction — already generic, gated on `recovery.interrupted === "force_full_on_next_run"`), `src/tests/step-library.logic.test.ts` (LW-D20 fake-pool lock)

## Fence (Chesterton's) — why the term exists, and why it's applicable here
LW-D20 (`8adf5d19`, 2026-08-29): a killed/crashed prior run left a destructive retraction half-done; the NEXT run's ledger-gated-skip returned SKIP before `selectMode` ever ran, so the interrupted state was silently never repaired. Fix: compute `detectInterruptedRetraction` BEFORE `ledgerGatedSkip` and fold it into `bypassed` — same shape `dry_run`/`force_full` already use — for CASCADE. `detectInterruptedRetraction` is self-gating: it returns `{interrupted:false}` WITHOUT querying the DB when a descriptor's `recovery.interrupted !== "force_full_on_next_run"`. `link_parcel_addresses` (today's only converted MATERIALIZER) declares `recovery.interrupted: "none"` (LPA-D1, `retract:"none"`, ruling R-F item 1) — genuinely a no-op for it today. But `runMaterializePhase` is the SHARED runner for the whole MATERIALIZER archetype, which — like CASCADE — has its own `ledgerGatedSkip` early-return (LG-15, identical shape). The first future MATERIALIZE step that ever declares a genuine destructive retraction (`recovery.interrupted: "force_full_on_next_run"`) would hit the EXACT unreachable-check bug LW-D20 already found and fixed once, because the runner never wires the term or threads `ownRunId` at all. Fix is safe (no-op today) and closes the archetype-level gap per the "a fold applied to N runners must be locked by a test that iterates ALL runners" lesson.

## Technical Implementation
* **Modified:** `runMaterializePhase` signature gains `ownRunId`; `bypassed = overrides.force_full === true || interruptedRetraction.interrupted` (computed via `staleness.detectInterruptedRetraction` before `ledgerGatedSkip`, mirroring `runCascadePhase`'s comment/placement). Call site (`runWithPool`, `isMaterializeStep` branch) passes `ownRunId: runId`.
* **Database Impact:** NO — read-only query addition, self-gated off today by every converted MATERIALIZER's own declaration.

## Standards Compliance
* **Unhappy Path Tests:** RED — interrupted retraction present + ledger-gate stubbed to a definite SKIP answer must NOT skip (bypassed:true short-circuits `ledgerGatedSkip` before the SKIP query is ever consulted). Reverse: no interrupted row + force_full false must reach the real ledger-gate query and skip when it says so.
* **logError Mandate:** N/A — no new catch block.

## Execution Plan
- [x] Step 1: PREMISE verified (git show 8adf5d19, LW-D20 lessons.md entries, descriptor read) — confirmed structural, not theoretical.
- [x] Step 2: This plan file.
- [x] Step 3: RED test in `src/tests/step-library.logic.test.ts` (both directions) → confirmed fails today (interrupted-retraction reader never invoked).
- [x] Step 4: One-line fix in `scripts/lib/step/index.js` (function + call site) → confirmed GREEN (138/138 file, 9975/9975 suite, typecheck clean, lint clean).
- [x] Step 5: `step-validate.mjs --step=link_parcel_addresses --write` scorecard — 14/17 hard-stop=false, 0 unexplained diffs, no golden recapture (index.js not a fingerprint input).
- [x] Step 6: Spec 124 R-B row + review_followups.md HIGH→CLOSED-in-commit + lessons.md line — all done.
- [ ] Step 7: Commit.
