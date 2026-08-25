# Active Task: P4 Hardening WF2 — Env-Verifier Tiers + Schema-Authority Tripwire + Window-Closure Truth (v2, 10-lens panel folded)
**Status:** Planning
**Domain Mode:** Backend/Pipeline (`scripts/` CLIs + `src/tests/` + spec text) — `scripts/CLAUDE.md` applies. No pipeline.run step is touched.
**Workflow:** WF2 (Enhance). Operator-directed 2026-07-22: the four Round-3 defer items (GT#4–GT#7) promoted to their own WF2. **v2 = the full 10-lens PLAN panel folded** (Gemini + DeepSeek CLIs, Code Reviewer, Observability, Integration, Regression Guardian, Ground-truth, Reality-Check, Schema-Fidelity, Security). Round-2 adjudication by orchestrator-as-grounder; rejects recorded at the bottom.

## Context
* **Goal:** Close the four Spec-113 spec-vs-code gaps at the minimum-complexity tier: (H1) two-tier public-var leak scan, (H2) `supabase/migrations/` tripwire, (H3) coexistence-window closure recorded truthfully, (H4) `PG_POOL_MAX` pin asserted by the env verifier.
* **Target Spec:** `docs/specs/00-architecture/113_supabase_infrastructure.md` §3.2 (H1 — BOTH the allowlist claim AND the "only values permitted" enumeration, GT-F2), §5 (H4 + invocation point, GT-F4), §7 (H2 guard citation + residuals), §12 + §14 (H3), §13 (dashboard-comparison guard sentence truth-up, GT-F3). Cross-refs: Spec 115 §3, Spec 05.
* **Key Files:** `scripts/verify-vercel-env.js` (+ `src/tests/verify-vercel-env.logic.test.ts`) · `scripts/ai-env-check.mjs` · NEW `src/tests/schema-authority.logic.test.ts` · Spec 113.

## Technical Implementation

### H1 — Public-var NAME-allowlist tier (GT#4)
* **Tier 1 (unchanged, hard-fail every env):** the `secretShapeReason` blocklist.
* **Tier 2 (NEW):** `PUBLIC_VAR_NAME_ALLOWLIST` — unknown public-prefixed NAME → **`error` in production AND preview, `warn` in development** (Security F1 ruling: the bundle artifact is durable while protection is a toggle; a preview-scoped var never meets the prod tier at all; `vercel dev` yields no deployed bundle. This is a PRINCIPLED deviation from the C4 pattern — C4 scopes degradation-type findings, Tier-2 hits are exposure-type events on the shared project — state this in a code comment).
* **BOTH tiers evaluate every public var independently** — an unknown-name + secret-shaped var emits TWO findings (Tier-1 error + Tier-2 finding); no short-circuit (Observability #1). Tier 2 uses a distinct `check: 'public_var_name'` label (never reuse `leaked_secret`).
* **Never-echo (Security F2):** the Tier-2 message contains the var NAME + a fixed reason string, NEVER the value — test-locked (`not.toContain(plantedValue)`), mirroring the existing line-174 lock.
* **The FROZEN allowlist (census verified by Integration + Schema-Fidelity + Reality-Check, 3-way converged — 8 names):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy group member), `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_DEV_MODE` (value policed by the dev_mode check), `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, **`NEXT_PUBLIC_GOOGLE_MAPS_KEY`** (live read `PropertyPhoto.tsx:41`; its 39-char `AIza…` value evades the 40-char blob regex — the name tier is the ONLY check that ever sees it). PLUS a **`NEXT_PUBLIC_VERCEL_` prefix carve-out** (platform-injected system vars — `NEXT_PUBLIC_VERCEL_URL`/`_ENV`/`_GIT_*` — structurally invisible to any repo grep; Integration/SF HIGH). The 4 stale `.env.example` names (`NEXT_PUBLIC_FIREBASE_*` ×3, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — zero live `src/` reads, RC-verified) are NOT allowlisted: allowlist = names read by live code; `.env.example` is a candidate list only. If one is still set in a Vercel env, Tier 2 firing on it is a DESIRED hit (leftover retired config).
* **Drift prevention (DeepSeek + CR #4):** two invariant tests — (a) census-sync: grep `src/` for `NEXT_PUBLIC_[A-Z_]+` names read by live code (non-test) and assert every hit ∈ allowlist ∪ carve-out; (b) `REQUIRED_GROUPS`' public-prefixed `anyOf` names ⊆ allowlist. Adding a public var without an allowlist entry becomes a test failure, not a memory burden.
* Update the verifier's "Three checks" header docstring to the new check count (Guardian F4).

### H2 — `supabase/migrations/` tripwire (GT#5)
* NEW `src/tests/schema-authority.logic.test.ts` (SPEC LINK 113 §7): PASS iff the dir is absent OR contains no files other than `.gitkeep` (Gemini/DeepSeek placeholder nit; dir does not exist today — SF-verified — so born green via the absent branch). Enforcement = the test inside the husky gauntlet (`.husky/pre-commit:2` runs `npm run test` — verified; DeepSeek's contrary CRITICAL refuted with 8 live gauntlet runs today).
* `scripts/ai-env-check.mjs`: one visibility check — `✘` glyph (repo convention, not `✖`), `readdirSync` added to the fs import, message NAMES the offending files and cites `migrate.js` as the sole schema authority + remedy (Observability #3 actionability bar). **ai-env-check is report-only by convention (never sets exitCode)** — the §7 amendment attributes enforcement to the test, visibility to the env-check (Integration/SF/GT converged).
* §7 amendment also RECORDS the residuals (Security F3): `git commit --no-verify` bypasses the gauntlet with no CI backstop (caught at next pre-flight/test run); a push-then-delete-files slip applies out-of-band DDL invisible to both the tripwire and `migrate.js --verify` — inherent, accepted, stated.

### H3 — Coexistence-window closure (GT#6) — SPEC TEXT ONLY
* **Closure date corrected (GT F1 — my v1 date was wrong):** the D13 cutover executed **2026-07-18 EOD** (three-way evidence: migration memory record; Phase-0 output-panel date in `review_followups.md:2687`; commit `45a9def0` "post-cutover" 2026-07-19), re-verified live 2026-07-22 (`inet_server_addr()`). Amend §12 covering the WHOLE block (dual-verify sentence + "replayed to both" rule + the future-tense cutover paragraph → historical marking, GT F6) + §14's single line (discharges the dual-DB claim AND adds the H2 guard citation in one edit). Discharge citations verified real: `ai-env-check.mjs:103` single local verify; all five chain YAMLs carry cloud `migrate.js --verify` (Integration, file:line).
* **+ §13 truth-up (GT F3, folded into Commit C):** the "comparing actual Vercel env values against the Supabase dashboard's keys" guard sentence describes an unbuilt (and SEC-3-incompatible) mechanism — rewrite to what verify-vercel-env actually does (presence + shape + name tiers over `process.env`).

### H4 — `PG_POOL_MAX` pin check (GT#7)
* **Operator ruling: `PG_POOL_MAX=5`** in Vercel production + preview (+ development optional). RC's live measurements STRENGTHEN the case: Supavisor's empirical backend ceiling is **~14–17** (wave-timed, not the raw max_conn=90) — the current default 20 can contend with a SINGLE instance; 5 leaves ~3 instances of headroom. Measured cost: **+1.2–1.4s (~15–18%)** on the admin stats fan-out (which is **33 queries, not the ~12 in client.ts's stale comment**) over a 7.3–7.7s baseline that pool size doesn't move.
* Verifier check: value = trim → `/^\d{1,2}$/` → integer in `[1, PG_POOL_MAX_PROD_CEILING=10]` (CR #3 + SF F3 adjudicated: accepts `' 5 '`/`'05'` — which the runtime honors — rejects `'5.9'`/`'7abc'`/`'0x10'`/`'1e2'` — which the runtime silently mangles; zero verifier-pass/runtime-discard gap). **`error` in production AND preview** (Security F4 — preview shares the one cloud DB; the operator TODO already sets it there, so zero added friction), `warn` in development.
* **Message distinguishes the two runtime outcomes (Observability #2):** missing/invalid → "runtime silently falls back to the unsafe default 20"; out-of-range-but-honored → "honored but exceeds ceiling". Matches the `ADMIN_MFA_ENFORCED` message convention.
* **The WF3 2026-04-10 fence, stated (Integration MED + Guardian):** pool 10 + 5s timeout once broke the ~12-query (now 33) admin fan-out; the pin re-enters that regime KNOWINGLY — it survives because `PG_CONNECTION_TIMEOUT_MS` now defaults to 10s and RC measured the delta non-catastrophic; residual routed to the Phase 4.4 Supavisor monitoring window (Spec 113 §13). The check also REPORTS `PG_CONNECTION_TIMEOUT_MS` when set, so a future operator can't shrink both knobs blind.
* Spec §5 sentence names the mechanism AND the invocation point (GT F4): operator-set var + verifier assertion, run manually per env at the F1 checklist / pre-deploy — there is NO automated build-time wiring (settled SEC-3 design; do not imply continuous gating).
* **Operator TODO gated before F1g preview smoke:** set `PG_POOL_MAX=5` in Vercel production + preview.

### Regression fences the implementation MUST handle (Guardian F1/F2 + CR, both CRITICAL-certain)
* `validEnv()` fixture gains `PG_POOL_MAX: '5'` — else 3 existing green production assertions flip red.
* The `NEXT_PUBLIC_ANON` anon-JWT test re-targets `NEXT_PUBLIC_SUPABASE_ANON_KEY` (allowlisted) — preserving its Tier-1 intent (anon-role JWT values are legitimately public) instead of silently becoming a Tier-2 casualty.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes; pure predicates + `process.exitCode`.
* **Unhappy Path Tests:** H1 unknown-name (prod=error / preview=error / dev=warn / known-name=ok / **unknown-name+secret-shaped → BOTH findings** / never-echo lock / VERCEL_-prefix carve-out); H4 matrix `absent/'0'/'11'/non-numeric/'5'/'05'/' 5 '/'5.9'` with message-differentiation asserts; H2 non-placeholder-file failure path; the two drift-invariant tests.
* **logError Mandate:** N/A — CLI console idiom.
* **UI Layout:** N/A.
* **Database Impact:** NO.
* **§11 note:** `PG_POOL_MAX_PROD_CEILING=10` + the allowlist are named constants in `verify-vercel-env.js`, test-locked; NOT `_contracts.json` (single consumer, no SQL/Zod/migration leg). Ceiling stays 10 (band allows tuning without code change) with RC's thin-margin numbers cited in the comment; the RULED value is 5.

## Execution Plan
- [ ] 0. Freeze the allowlist from the panel-verified census (8 names + VERCEL_ carve-out; `.env.example` candidates pruned per RC)
- [ ] 1. Commit A (code): H1 tiers + H4 check + header docstring + fixture/anon-test updates + full test matrix + 2 drift-invariant tests
- [ ] 2. Commit B (code): H2 `schema-authority.logic.test.ts` + `ai-env-check.mjs` visibility line
- [ ] 3. Commit C (docs): H3 §12/§14 (dated 2026-07-18) + §3.2 two-tier + enumeration rewrite + §5 mechanism/invocation + §7 citation/residuals + §13 truth-up
- [ ] 4. File the panel's out-of-scope finds to `review_followups.md`: admin-stats 7–9s perf bug (33-query fan-out, 2 unindexed `COUNT(DISTINCT)` full scans — WF3 candidate w/ RC's timings); `client.ts:5-16` stale "~12 queries" comment; stale `.env.example` Firebase/Stripe entries; `pipeline.js createPool()` localhost-default trap; Gemini's EAS-side inverse check (mobile-domain, out of scope)
- [ ] 5. Multi-Agent OUTPUT review on the diff → Round-2 → fold
- [ ] 6. Green Light: ⬜ full `npm run test` green (husky per commit) · ⬜ operator sets `PG_POOL_MAX=5` in Vercel prod+preview (F1 checklist) · ⬜ push

## Round-2 rejects (recorded)
* DeepSeek CRITICAL "husky may not run tests" — REFUTED: `.husky/pre-commit:2` runs `npm run test`; 8 live gauntlet runs today.
* Gemini `.gitignore` bypass of H2 — REFUTED: the test reads the filesystem; git-visibility is irrelevant.
* Gemini "preview publicly reachable" premise — REFUTED (Deployment Protection all-envs is a positively-verified hard gate) though its error-in-preview conclusion was SUSTAINED on Security's better grounds.
* DeepSeek "window cannot be closed before cutover" — REFUTED: cutover executed 2026-07-18 (three-way evidence); its caution absorbed via the evidenced date.
* DeepSeek "ceiling must be 5 not 10" — DECLINED: the band permits operator tuning without code change; RC's margin data cited at the constant.
* Gemini EAS-side inverse check — OUT OF SCOPE (mobile domain); filed as a followups note.
