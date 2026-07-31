# Active Task: WF3 — two migration-safety gates that fail silently
**Status:** Planning — LEAN plan panel running, then PLAN LOCKED.
**Domain Mode:** Backend/Pipeline. Parent: `.cursor/wf2_deep_scrapes_restore.md` §Queued work 2 & 3.
**Operator ruling 2026-07-31:** items 2 and 3 are a WF3; item 1 (credential leak) was a direct fix, done (`d295188b`).

## Context
* **Goal:** close two gates that pass while the thing they check is wrong. Neither is specific to
  the deep-scrapes branch; both are repo-wide.
* **Target Spec:** `docs/specs/00_engineering_standards.md` §3 (Database), `docs/runbook/README.md`
  (rule 2, deploy ordering). Migration protocol: `scripts/validate-migration.js`,
  `scripts/hooks/validate-migrations.sh`.
* **Key Files:** `scripts/hooks/validate-migrations.sh`, `scripts/migrate.js`,
  `.github/workflows/*.yml`, `docs/runbook/README.md`.

## Premises — VERIFIED FIRST-HAND (WF3 eager-fix antibody; both came from one reviewer)
**P1 — a migration merged to main reds every scheduled chain. CONFIRMED.**
* `node scripts/migrate.js --verify` is the pre-flight in **6** workflows: `chain-coa-permits`,
  `chain-deep-scrapes`, `chain-entities`, `chain-sources`, `chain-wsib`, `pipeline-watchdog`.
* `scripts/migrate.js:145-166` — `if (missing > 0 || drift > 0) process.exit(1)`. **MISSING alone
  is fatal**, not just drift.
* **No workflow applies migrations.** Every `migrate.js` invocation across `.github/workflows/` is
  `--verify`; `db-tests.yml` and `pipeline-lint.yml` only reference the file as a path trigger.
* **Crons ARE live on `origin/main`:** coa-permits 1, deep-scrapes 1, entities 1, sources 1,
  watchdog 1, wsib 0 (annual by ruling). **5 live schedules.**
* ⚠ **Correction recorded:** my first check reported "0 active crons" — a Git-Bash path-conversion
  bug mangled `origin/main:` to `origin\main;`, `git show` failed, and `grep -c` counted 0 on empty
  output. A silently-failing command produced a plausible false premise. Re-run with
  `MSYS_NO_PATHCONV=1`. **The same class of defect this whole WF is about.**

**P2 — pre-commit hooks validate the worktree, not the staged blob. CONFIRMED.**
* `scripts/hooks/validate-migrations.sh:15-27` loops `while IFS= read -r FILE` over
  `$STAGED_MIGRATIONS` (a list of PATHS) and runs `grep -qiE … "$FILE"` — reading the working-tree
  file at that path.
* `:38` — `node scripts/validate-migration.js $STAGED_MIGRATIONS` likewise takes paths.
* Consequence, observed during the reverted WF2: `git status` showed `AM`; the staged blob was the
  pre-hardening migration (no `CONCURRENTLY`), the worktree file was correct, and a plain
  `git commit` would have passed validation while committing the unsafe version.
* **Repo-wide:** affects any hook that lints staged content by path.

## GROUND-TRUTH CORRECTIONS — five of my assertions were wrong; all fixed here
1. **`migrate.js:145-166` → actually `:147-165`** (exit at `:164`). Logic claim correct.
2. **"5 live schedules" → 6 exist repo-wide.** I missed `mutation.yml` (`0 12 * * 1`). It runs no
   `migrate.js` step so the conclusion holds, but I made a repo-wide claim without a repo-wide
   scan — *the same shortcut that produced the `origin\main;` error*. Correct phrasing:
   **"5 scheduled workflows run the pre-flight."** Also: deep-scrapes is one cron expression firing
   **3×/weekday**, so weekday exposure is 5 chain runs + watchdog.
3. **"db-tests.yml … only a path trigger" — wrong on both halves.** `db-tests.yml` **does** apply
   the full migration set, via `npm run test:db` → `src/tests/db/setup-testcontainer.ts:156` →
   `execSync('node scripts/migrate.js')` — against an ephemeral `postgis:16` container, not cloud.
   Conclusion ("nothing applies to cloud") survives. `pipeline-lint.yml`'s mention is a code
   comment, not a path filter.
4. **"Repo-wide: any hook that lints staged content by path" — over-broad.** Exactly **2 of 6**
   hooks are affected (`validate-migrations.sh`, `check-migration-down-comments.sh`).
   `ast-grep-leads.sh` scans fixed scopes and never reads the staged list. **lint-staged is immune
   by construction** — `gitWorkflow.js:262` runs `git stash push --keep-index`, so during its
   window the worktree *is* the staged content (this is also why routing the hooks through
   lint-staged is a real fix, not a workaround).
5. **The migration-236 near-miss is NOT reconstructible from git** — no commit, no stash, no
   dangling object; it lived entirely in an uncommitted tree. Ground-truth proposed one surviving
   corroboration: querying the dev DB's `schema_migrations` for `236%`. **That evidence no longer
   exists — I deleted that row during the authorized rollback.** So the near-miss is
   **operator-observed, not reconstructible**, and must be cited that way. It does not matter for
   the ruling: Ground-truth reproduced the *class* from scratch (below), so Gate A stands on its
   own evidence.

## ⚠ NEW DEFECT — worse than A1, and not in my A1–A5 table
**`check-migration-down-comments.sh` fails OPEN, silently.** On the `AD` case (blob staged,
worktree copy deleted) `awk` errors to stderr, `HIT` stays empty, `BAD_REPORT` stays empty, and the
hook **exits 0 having validated nothing** — a silent pass on the mig-118 invariant. Its sibling
`validate-migrations.sh` exits 1 on the identical input (fails closed, by accident). **`--diff-filter=ACM`
does NOT exclude `AD`** — contradicting the "no handling needed" line in the Integration fold, which
is true for hook #1 and false for hook #2. **Any Gate A fix must give BOTH hooks the same
fail-closed posture, and the test list must assert exit 1 from BOTH on the staged-only case** — the
current wording would pass today against a hook that validates nothing.

## PROOF — Ground-truth reproduced P2 by experiment, not by reading
Staged a blob with **no `-- DOWN`** and a bare `CREATE INDEX ON permits` (a `LARGE_TABLES` member),
then fixed only the worktree copy. `git status: AM`. **Hook exit = 0.** The same blob fails
`validate-migration.js` with `CREATE INDEX on large table 'permits' must use CONCURRENTLY`, exit 1.
Probe cleaned up, no residue. Gate A no longer depends on my account of 236.

## 🔑 THE REFRAMING — the urgency is not merely low, it is *unprecedented*
* **No migration has landed on main since the crons went live** (`git log f7993025..origin/main --
  migrations/` → empty). **The MISSING-reds-the-chains scenario has never occurred.**
* **The pre-flight's only real-world firing was a FALSE POSITIVE**: the first Linux GH-runner
  checkout reported 28 spurious DRIFTs from a CRLF hashing bug and failed the chain-coa-permits
  pre-flight (`scripts/analysis/reconcile-migration-checksums.js` header, 2026-07-29).
* **Conclusion: a gate whose sole production firing was spurious argues FOR decoupling the watchdog
  and AGAINST adding any new blocking.** This is now the strongest argument for the revised
  Gate B order, and against the B1 I originally proposed.

## ROOT CAUSE CONFIRMED — the rule was never written, not ignored
`docs/runbook/README.md:85` rule 2 says *"Drift = stop"* **three times and never mentions MISSING**,
while the code treats them identically. §3 has **no procedure for applying a migration to cloud at
all** — zero hits for `SUPABASE_DATABASE_URL`/apply/session-mode. The de-facto procedure is an
ad-hoc laptop command (evidenced by the permission entry it required in `.claude/settings.local.json`).
So my B4 framing — "documentation is what failed" — was wrong: **the documentation was never
written.** Ruled item 4 (`apply-migrations.yml` behind a reviewed Environment) would be this repo's
first documented, audited apply path.

## Technical Implementation — OPTIONS, for the panel and the operator to rule
### Gate A (P2) — **SCOPE WIDENED by the DeepSeek lens: the hook is fail-open in FIVE ways, not one**
I scoped this as "validate the staged blob". The lens found that the staged-blob gap is one of
several paths by which this hook passes while the thing it checks is wrong. Fixing only my item
would leave a gate that still lets bad migrations through. All confirmed by reading
`scripts/hooks/validate-migrations.sh`:

| # | Defect | Line | Why it matters |
|---|---|---|---|
| A1 | **Validates the worktree, not the staged blob** | 17, 23, 38 | The original finding. Also fails spuriously if the worktree copy was deleted after staging, and follows worktree symlinks. |
| A2 | **`if command -v node` is a silent bypass** | 37-38 | No node on the hook's PATH ⇒ the DROP guards, the **CONCURRENTLY check** and NOT-NULL-DEFAULT checks are skipped and the hook **exits 0**. This is the check that caught migration 236's unsafe index; it is optional today. |
| A3 | **`git diff` failure is swallowed** | 5-6 | Command substitution hides a non-zero exit (index lock, corrupt index). `STAGED_MIGRATIONS` becomes empty ⇒ hook exits 0 having validated nothing. |
| A4 | **Unanchored UP/DOWN regex** | 17, 23 | `-- UPDATE`, `-- DOWNGRADE`, or the words inside a dollar-quoted body satisfy the marker check. A migration with no real UP/DOWN passes. |
| A5 | **Unquoted `$STAGED_MIGRATIONS`** | 38 | Word-splits and glob-expands: a path with a space becomes three arguments; `*`/`?`/`[` can expand to unrelated files. The loop above handles spaces; this line does not. |

Lower severity, same file: assumes CWD is the repo root (breaks under `core.hooksPath` or manual
invocation); `core.quotePath` makes non-ASCII filenames silently skip the `^migrations/` filter;
marker ordering/duplication is unchecked.

**Design principle for the fix, and it is the whole point of this WF3: every one of these is a
FAIL-OPEN. A safety gate whose validator is unavailable, whose input list is empty, or whose git
command failed must REJECT, never pass.** Proposed: materialise the index blob
(`git show :"$FILE"`) into a temp file and validate that; make node mandatory; check `git diff`'s
exit status; anchor the marker regexes; NUL-delimit and quote the file list.
**PANEL CORRECTIONS TO GATE A — scope, mechanism, and the tests all change:**
* **A second hook has the identical defect and I missed it.** `check-migration-down-comments.sh:31-46`
  uses the same `--diff-filter=ACM` path loop and `awk … "$FILE"` on the worktree. Fixing only
  `validate-migrations.sh` leaves the sibling invariant (uncommented DDL under `-- DOWN` — the
  mig-118 bug-of-record) validating the wrong bytes. **Both files are in scope.**
* **Mechanism: do NOT use temp files.** `validate-migration.js` already exports
  `validateMigration(content, filename)` (`:398`). Pipe `git show ":$FILE"` into a short node
  invocation passing the ORIGINAL path as `filename` — correct messages, no `mktemp -d`, no
  `trap … EXIT`, no Windows temp-dir semantics. **Alternative preferred by Integration: route both
  hooks through `lint-staged`** (already in `.husky/pre-commit` line 1, already configured at
  `package.json:41-53`), whose stash gives staged-only semantics for free and handles
  deletions/renames correctly. Cost: hooks must accept filenames as `$@`. Decide at implementation.
* **`src/tests/enforcement.logic.test.ts:81-113` will break, and it deserves to.** Six tests assert
  on the hook's SOURCE STRING (`toContain('while IFS= read -r FILE')`, `toContain('git diff')`).
  One is literally named `it('scans only staged migration files')` and asserts a **substring**
  instead of the behaviour — **which is exactly why this bug survived a test that claimed to cover
  it.** Replace with a behavioural fixture test (temp repo, stage-bad/worktree-good, assert exit 1).
  A false-assurance lock is itself a finding.
* **Fail-closed needs care:** the script has **no `set -e`**, so `git show` failure must be checked
  explicitly per file.
* **Edge cases tested by Integration, no handling needed:** staged deletions are already excluded
  by `--diff-filter=ACM`; newly-added files work with `git show :FILE`; renames pass through;
  **CRLF is safe and validating the LF blob is MORE correct** — it is what `migrate.js`'s
  normalising sha256 hashes and what the Linux runner sees. No checksum risk (the hook computes
  none). A staged-then-deleted-from-worktree file currently emits a *misleading* "missing UP block"
  error; Gate A strictly improves it.

**Two implementation questions, both settled by reading rather than assumption:**
* *Does `validate-migration.js` derive anything semantic from the filename?* **No** — `filename`
  is display-only (`:164` `const display = filename || '<input>'`, used solely in error strings).
  So a temp file is safe; preserve the basename purely so error messages stay readable.
* *`runCli` reads by path* (`:373 fs.readFileSync(file)`), and already **fails closed on an empty
  file list** (`:365-370`, exit 1) — good precedent, and exactly the posture the shell wrapper
  lacks.

**Honest severity note on A4:** I tested every existing migration for the false-marker case
(passes the loose `-- UP` regex but not an anchored one) — **zero hits**. A4 is a latent hazard,
not an active defect. Recorded as such rather than inflated; it is cheap to fix while we are here.

### Gate B — **REWRITTEN AFTER THE PANEL. My recommendation was structurally impossible.**
**B1 is dead. Integration killed it and is right:** at PR time a newly-added migration is *by
definition* absent from cloud's `schema_migrations`, so `migrate.js --verify` on the PR head
reports `MISSING: 237_foo.sql` and exits 1 **on every PR that adds a migration** — the only PR the
check exists for. A required check that is red by construction, unless the operator applies
unreviewed DDL to production *before* review. That inverts review-then-deploy. It would also be
the repo's first credentialed `pull_request`-triggered job, cutting against a standing fence at
`chain-deep-scrapes.yml:122-125` (added in `1e405bce`, naming the cache-poisoning vector).

**And my urgency framing was wrong.** There is **no migration pending** (`origin/main` tops out at
235; 236 was reverted). The pre-flight is the 4th step — before `check-chain-running.js`, before
any `run-chain.js` — so it fails fast with no advisory lock, no `pipeline_runs` row, no writes, and
GitHub notifies the owner. **The cost is staleness, not damage.** "Reds every scheduled chain" was
true but rhetorically inflated; I should have measured the consequence before asserting severity.

**The genuine risk is one I never identified** (Integration, verified): `pipeline-watchdog.yml:81`
runs `--verify` as a plain step **before** `check-pipeline-freshness.js` and before the
`backup_fallback` → `scripts/backup-db.js` step. So a missing migration ① blocks every chain
including permits, whose final `backup_db` step is the primary backup path, ② **blocks the
watchdog's Spec 112 §6 backup safety net — the thing that exists to cover ①** — and ③ reddens the
watchdog for the wrong reason, making the freshness alarm indistinguishable from the schema alarm.
**Database backups stop entirely, and the net designed to catch that is disabled by the same
condition.** Neither `check-pipeline-freshness.js` (reads `pipeline_runs` only) nor `backup-db.js`
(shells `pg_dump`) depends on new schema — that `--verify` step is copy-paste from the chain
workflows and is not load-bearing for the watchdog's own work.

**Ruled order (was: B1+B3; now):**
1. **Decouple the watchdog** — `continue-on-error: true` + a `::warning` on that one step. **One
   line, and it captures essentially all of the real risk.** Restores the backup safety net and
   separates the two alarms.
2. **Runbook §3 first, not last** — rule 2 says *"Drift = stop"*, is **silent on MISSING**, and
   §3 contains **no procedure for applying a migration to cloud at all**. The code is stricter
   than the documented rule and the rule has no completion path. *That is the root cause*, not the
   gate.
3. **B3** — MISSING and DRIFT get distinct messages; MISSING prints the exact apply command and
   the runbook anchor. (B3 alone was never sufficient, and without (2) it points at nothing.)
4. **`apply-migrations.yml`, `workflow_dispatch`-only, behind a GitHub Environment with a required
   reviewer.** This is **not** B2: nothing is automatic, the operator clicks Run. It gives an
   audited, credentialed apply path, removes "run production DDL from a laptop `.env`", and keeps
   every credentialed workflow `pull_request`-free.
* **B2 (CI auto-applies) stays rejected** — and (4) answers the need without auto-DDL.
* Tolerating MISSING with a WARN is **correct for the watchdog and wrong for the chains**: chain
  steps read/write the columns a migration adds, so a stale schema throws mid-chain, possibly
  after partial writes, leaving a `running` row that blocks the next dispatch. Hard-fail is
  correct containment there.

### Superseded — original Gate B options (kept for the record)
* **B1 — pre-merge CI check (RECOMMENDED).** A job on PRs touching `migrations/**` that runs
  `migrate.js --verify` against cloud and fails with the exact apply command. Catches it before
  merge, when it is cheap. Needs cloud credentials available to PR CI — **verify that is true and
  acceptable; it may not be for fork PRs.**
* **B2 — CI applies migrations on merge to main.** Removes the manual step entirely, but means
  automated DDL against production from CI. Given migration 236's own near-miss (a plain
  `CREATE INDEX` on an 891 MB table nearly committed), auto-apply amplifies a bad migration
  instead of containing it. **I am against it.**
* **B3 — improve the failure message only.** `--verify` already fails loudly; make MISSING print
  the exact command and the runbook link. Cheapest, changes no control flow, but leaves the
  window open — the chains still red until a human acts.
* **B4 — runbook + a merge-gate checklist.** Documentation only. Weakest; documentation is what
  failed here already (runbook rule 2 exists and was not enough).
* **My position:** **B1 + B3** — block before merge where it is cheap, and make the runtime failure
  self-explanatory for the case that slips through. Explicitly NOT B2.

## Standards Compliance
* **Try-Catch Boundary:** hook changes must fail CLOSED — if `git show :$FILE` errors, the hook
  must reject, never skip validation.
* **Unhappy Path Tests:** staged-differs-from-worktree is caught · staged-only (worktree deleted)
  still validates · a hook temp-file failure rejects rather than passes · MISSING vs DRIFT produce
  distinct, actionable messages.
* **logError Mandate:** N/A (shell/node scripts) — existing echo/console conventions.
* **UI Layout:** N/A.
* **Database Impact:** **NO.** No schema change. This WF only changes when/what gets validated.

## Non-Goals
* Not changing any existing migration, and not re-litigating migration 236 (reverted).
* Not touching the chains' runtime behaviour beyond the pre-flight message.
* Not auto-applying migrations (B2 is explicitly rejected above unless the panel overturns).

## Execution Plan — FINAL (panel folded; ordered by evidence, not by my original framing)
- [x] 1. LEAN plan panel: Integration + DeepSeek lens + Ground-truth. **Done.** Outcome: my Gate B
      recommendation was refuted as structurally impossible, my urgency framing was refuted as
      unprecedented, five factual assertions corrected, one worse defect found, P2 reproduced.
- [ ] 2. **PLAN LOCKED — halt for authorization.**
- [ ] 3. **Runbook §3 first** (root cause): rule 2 to cover MISSING as well as DRIFT, plus the
      apply procedure that has never existed — direct/session mode (5432, never 6543) per Spec 113,
      the exact command, and the known-accepted-drift note.
- [ ] 4. **Decouple the watchdog** — `continue-on-error: true` + `::warning` on
      `pipeline-watchdog.yml:81`. One line; restores the Spec 112 §6 backup safety net.
- [ ] 5. **Gate A, both hooks**, fail-closed and staged-blob-correct: `validate-migrations.sh` AND
      `check-migration-down-comments.sh`. Mechanism decided at implementation — lint-staged routing
      (preferred: its stash gives staged semantics free) or `git show ":$FILE"` piped to node via
      the exported `validateMigration(content, filename)`. **No temp files.** Also: make node
      mandatory (A2), check `git diff`'s exit status (A3), anchor the UP/DOWN regexes (A4, latent),
      quote/NUL-delimit the file list (A5).
- [ ] 6. **Replace the false-assurance tests** — `src/tests/enforcement.logic.test.ts:81-113` asserts
      on hook SOURCE STRINGS, including `it('scans only staged migration files')` which checks a
      substring instead of behaviour. Swap for a behavioural fixture: temp repo, stage-bad /
      worktree-good, **assert exit 1 from BOTH hooks**, plus the `AD` staged-only case.
- [ ] 7. **B3 messages** — MISSING vs DRIFT distinct; MISSING prints the apply command + runbook
      anchor (meaningful only after step 3 exists).
- [ ] 8. *(Operator ruling needed)* `apply-migrations.yml`, `workflow_dispatch`-only, behind a
      GitHub Environment with a required reviewer. **Not** auto-apply. First audited apply path.
- [ ] 9. Full gate (`npm run test:py`, `npm run test`, typecheck, lint), commit, push.
- [ ] 10. Output panel on the diff.

## FOLD OVERRIDE — the plan said "no temp files"; the implementation uses one
The plan (folding Integration's PLAN-altitude advice) ruled *"do NOT use temp files … no
`mktemp -d`, no `trap … EXIT`"*, preferring `git show ":$FILE"` piped straight to node. That part
stands — the node call IS a pipe, no temp file. **But the FILE LIST needed one**, and the plan did
not anticipate why: bash cannot hold NUL bytes in a variable, so `-z` output cannot be captured
with `$(...)`, and `done < <(git diff …)` re-invokes git inside a process substitution whose exit
status is unobservable — re-opening the A3 fail-open one layer down (Regression Guardian F4).
A temp file is the only shape that gives ONE list, NUL-safe, with a checkable exit status.
**Cost, stated rather than hidden:** if `mktemp` is unavailable the hook exits 1 and every commit
touching a migration is blocked. That is the correct direction for a fail-closed gate, but it is a
new hard dependency and is recorded here as a deliberate reversal, not a silent one.

## OUTPUT PANEL — folded (Gemini · Regression Guardian · Integration)
* **Gemini: both CRITICALs REFUTED by experiment.** "The `git show` exit-code check is
  non-functional" — `if ! VAR=$(cmd)` propagates status; verified for failure, success, and a
  missing blob. "printf format-string vulnerability" — the code is `printf '%s\n' "$VAR"`, which
  prints payloads verbatim; the probe ran the genuinely unsafe form for contrast. Gemini's
  suggested fix was what was already written. Its MEDIUM on duplicate list-building was fair and
  is now resolved by the single-list rewrite.
* **Regression Guardian: the 232-migration anchored-regex claim VERIFIED TRUE** (0 files regress).
  Its F1 caught my commit message and code comment claiming four deleted tests "would have blocked
  the fix" — **false and mechanically disprovable**; only one would have. Corrected in place.
  F3 (quotePath fence claimed but absent — reproduced live: both hooks exited 0 on an unsafe
  non-ASCII migration) and F4 (second `git diff` unobservable) are fixed by the single-list
  rewrite; F2 (case-insensitivity had no behavioural lock) now has one.
* **Integration F1 — the worst finding, and mine.** The node-guard test **never ran the hook**:
  `PATH: '/nonexistent-bin'` made `execFileSync` fail to spawn *bash itself* (ENOENT → `status:
  null` → my `?? 1` scored it a pass). Reverting the fix left it green — a new instance of the
  exact false-assurance class this WF3 exists to remove, on the third attempt at the same test.
  Now: PATH built from where bash/git actually live, bash spawned by absolute path (Windows
  resolves the executable via the WINDOWS PATH), ENOENT asserted against, stderr content asserted,
  and `ctx.skip()` if node cannot be excluded — **a test that cannot exercise its subject must not
  report success. Verified by MUTATION: reverting the guard fails the test.**
* Also folded: awk's exit status now checked (F4), `setEncoding('utf8')` before reading stdin (F6),
  isolated missing-`-- UP` case (F5), the misleading empty DDL report on the fail-closed path, the
  dead `continue-on-error` (the `if ! …; then` wrapper made the step always exit 0), the runbook's
  "five scheduled workflows" (four block; the watchdog is now advisory), and Spec 115 §2.5 amended.

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §11 note: Database Impact NO — this WF changes only *when and what* gets validated. Step 8 is
> flagged as a separate operator ruling because it adds a credentialed workflow; steps 3-7 stand
> without it.
