# Active Task: WF2 — Admin pipeline trigger → GitHub Actions workflow_dispatch  (v2, panel-folded)
**Status:** Planning — awaiting PLAN LOCK
**Domain Mode:** Cross-Domain (admin API route + admin UI)
**Workflow:** WF2 (Enhance)

## Context
* **Goal:** The admin "Run" button `spawn`s `run-chain.js` inside the Vercel serverless function (route.ts:193), which Vercel kills on response return → the `pipeline_runs` row sticks at `'running'`, the chain never runs. Rewrite so a chain "Run" **dispatches the corresponding GitHub Actions workflow** (6h-capable GH runner, Spec 113 §8 / D8). Manual + scheduled runs share one path.
* **Target Spec:** `115_scheduling.md` §2/§3, `113_supabase_infrastructure.md` §8. Auth: `13_authentication.md` / Spec 33 §5. Display: Spec 28.
* **Key Files:** `src/app/api/admin/pipelines/[slug]/route.ts` (rewrite POST+DELETE), **`src/components/FreshnessTimeline.tsx`** (CHAIN_META order L167 + per-step/WSIB Run buttons), `src/components/DataQualityDashboard.tsx` (HealthBanner CHAINS L109 + TRIGGER_GRACE_MS + toast), new `src/lib/admin/github-dispatch.ts`, tests (update ~10 regression locks).

## Operator requirements
1. Chain slugs ONLY dispatch; individual-step runs NOT wired.
2. No client-side timeout cap — GH runner owns the timeout.
3. Reporting UNCHANGED — dispatched runs populate `pipeline_runs` exactly as today.
4. CoA reporting tile at the TOP (runs before permits).

## Panel-folded decisions (7-reviewer PLAN panel — adjudication log at end)
* **F1 [CRITICAL, Code Reviewer + DeepSeek] — ADD `verifyAdminAuth`** as line 1 of POST + DELETE (route currently has none; `middleware.ts` is presence-only; the rewrite lets a forged cookie fire real `workflow_dispatch`). Sibling pattern: `pipeline/step-output/route.ts:29`.
* **F2 [Integration + RC — OD1 RESOLVED] — NO pre-inserted DB row.** A route-inserted `'running'` row makes the workflow's own `check-chain-running.js` SKIP the real run; and RC confirms it keeps freshness math honest. Feedback instead = **client-only `'dispatching'` pseudo-state** (not DB-backed) + raise `TRIGGER_GRACE_MS` 15s→90s for chain slugs (Observability: GH boot is 30–60s, current 15s reverts the button early and invites re-clicks).
* **F3 [DeepSeek + Reg Guardian] — pre-dispatch `isChainRunning` guard → 409.** Restores the instant reject the removed in-memory 409 gave; without it a double-click fires two dispatches → GH queues a full DUPLICATE serialized run (not deduped). Return 409 "already running" + skip the GH call.
* **F4 [Integration + RC — OD2/OD3 RESOLVED] — cancel = GH-run-cancel of the whole run, unified control.** For the combined `chain-coa-permits.yml`, DB-row-cancel alone is INSUFFICIENT: cancelling coa's row leaves permits to run anyway (`if: always()`), and slug-scoped cancel strands the other chain's row `'running'` for 12h (RC's named "dashboard lie"). DELETE therefore: look up the workflow's in-progress **OR queued** run (`GET .../actions/workflows/{file}/runs?event=workflow_dispatch&status=…`), `POST .../runs/{id}/cancel`, THEN mark every `'running'`/`'queued'` `pipeline_runs` row for that workflow's chains (`chain_coa` AND `chain_permits` together) `'cancelled'`. **Token scope = `actions:read` + `actions:write`.** OD3: the UI presents a **single "CoA → Permits" Run/Cancel control** (separate reporting tiles kept, CoA on top); no independent "Run Permits" button (it would run coa anyway — RC Finding 2 honesty).
* **F5 [Integration] — reorder targets:** `DataQualityDashboard.tsx:109` (HealthBanner CHAINS, permits→coa) AND `FreshnessTimeline.tsx:167` (CHAIN_META, permits→coa). NOT line 213 (already CoA-first). Fix stale cadence labels (sources Quarterly→Weekly, deep_scrapes Weekly→Weekdays ×3/day).
* **F6 [Reg Guardian] — strip/disable the per-step "Run" buttons** (`FreshnessTimeline.tsx:901`) and the WSIB "Run All" button — else they 400 confusingly post-deploy.
* **F7 [Reg Guardian — BLOCKING] — update the ~10 regression-lock tests** that pin the deleted behavior (`chain.logic.test.ts:1266-1299`, `admin.ui.test.tsx:1460/1848-1936/2106-2117`, `inspections.logic.test.ts:814-828/1064-1080`, `enrichment.infra.test.ts:74-88`) — the mandatory pre-push `npm run test` fails otherwise. Explicit Execution-Plan item.
* **F8 [Code Reviewer] — mapping-existence test:** assert every chain slug maps to a workflow file that ACTUALLY exists (`fs.readdirSync('.github/workflows')`), not a hardcoded-string equality — a future rename would else 404 silently in prod.
* **F9 [Integration] — precondition:** dispatch requires the workflows on the **default branch** (they are, via the F1h FF) + explicit `GITHUB_REPO` env (Vercel doesn't auto-set `GITHUB_REPOSITORY`). Add a 404→clear-message test.

## Chain→workflow map
`chain_coa` + `chain_permits` → `chain-coa-permits.yml` (combined; single "CoA → Permits" control) · `chain_sources` → `chain-sources.yml` · `chain_entities` → `chain-entities.yml` · `chain_deep_scrapes` → `chain-deep-scrapes.yml` · `chain_wsib` → **OD5 (no workflow — reject; operator sign-off below)** · non-chain step slugs → 400.

## Env (Vercel)
`GITHUB_DISPATCH_TOKEN` (fine-grained PAT, **`actions:read`+`actions:write`**, this repo only) · `GITHUB_REPO` (`owner/repo`) · `GITHUB_DISPATCH_REF` (default `main`).

## Standards Compliance
* Try-Catch/logError: helper + route via `withApiEnvelope`; GH non-2xx sanitized (never echo token/GH body); network/transport errors → 500 clear message (DeepSeek LOW).
* Unhappy paths (tests): missing token→500; unknown/unmapped slug→400; non-chain slug→400; chain already running→409; GH 401/403/404/422→surfaced; GH 204→dispatched; each chain slug→existing workflow file (F8); default-branch-missing 404 (F9).
* DB Impact: NO (run-chain.js owns `pipeline_runs`; no schema change — `correlation_id`/`dispatch_batch_id` column REJECTED as over-scope, see adjudication).

## Execution Plan
- [ ] 1. `src/lib/admin/github-dispatch.ts` — `dispatchWorkflow(file, ref)` + `cancelWorkflowRun(file)` (lookup in_progress|queued run → cancel) + env validation + typed errors.
- [ ] 2. `route.ts`: `verifyAdminAuth` first (F1); POST = validate chain slug → `isChainRunning` 409 (F3) → dispatch, no DB row (F2), return `{status:'dispatched'}`; DELETE = GH-run-cancel + mark both chains' rows cancelled (F4). Remove spawn/`runningProcesses`/`fs`/timeout/PIPELINE_SUMMARY parsing + individual-step map.
- [ ] 3. UI: reorder CHAINS (F5, both files) + cadence labels; single "CoA → Permits" control (F4/OD3); `'dispatching'` state + `TRIGGER_GRACE_MS`→90s (F2); strip per-step + WSIB Run buttons (F6); dispatched toast.
- [ ] 4. Tests: rewrite the ~10 regression locks (F7); add dispatch-mapping-existence (F8) + all unhappy paths + 404/default-branch (F9).
- [ ] 5. `npm run typecheck && npm run lint && npm run test`.

## Open Decisions for operator (at PLAN LOCK)
* **OD5 — `chain_wsib`:** it loses its ONLY cloud-trigger path (no workflow + steps dropped). Accept (WSIB manual via GH-UI / defer), or author `chain-wsib.yml` in this WF2? *(Recommend: accept + defer — WSIB isn't in your nightly cadence.)*
* **OD-token:** confirm you'll provision the `actions:read`+`actions:write` fine-grained PAT as `GITHUB_DISPATCH_TOKEN` in Vercel.

## Panel Adjudication Log (7 reviewers, 2026-07-25, PLAN altitude)
* **FOLDED:** F1 verifyAdminAuth (Code Reviewer+DeepSeek CRITICAL) · F2 no-placeholder + client dispatching + grace 90s (Integration+RC+Observability) · F3 pre-dispatch 409 (DeepSeek+Guardian) · F4 whole-run cancel + unified control + actions:read (RC Finding 1/2/3 + Gemini HIGH + DeepSeek HIGH-2/3) · F5 reorder both files, not L213 (Integration) · F6 strip step/WSIB buttons (Guardian) · F7 update 10 regression tests (Guardian BLOCKING) · F8 mapping-existence test (Code Reviewer) · F9 default-branch precondition + GITHUB_REPO (Integration).
* **REJECTED with reason:** Gemini CRITICAL correlation-id column — refuted by Integration (slug-based `DISTINCT ON pipeline` tracking works) + resolved by F4's cancel-time run lookup (no stored id needed); a schema column + workflow inputs + run-chain.js changes is disproportionate for a solo, singleton-chain operator. RC Finding 5's `dispatch_batch_id` — same: whole-run cancel (F4) makes the coa/permits linkage moot (both stop together), so the batch-marker it was needed for is unnecessary.
* **CONFIRMED-CORRECT by panel:** OD1 no-placeholder (freshness stays honest — RC F4); dead-code removal complete (Integration+Observability — PIPELINE_SUMMARY parsing already `isChain`-skipped for chains today); double-dispatch queues not corrupts (Code Reviewer).
