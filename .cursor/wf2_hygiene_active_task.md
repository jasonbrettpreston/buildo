# Active Task: WF2 — Repo hygiene (LF, big files, tracked plans, CI green, hooks in every worktree, seed check at dispatch)
**Status:** Implementation (subset H4/H5/H2/H6/H7/H9 landed on wf2/hygiene; H1/H3/H8 deferred) — Authorized 2026-09-27 (operator "y", all 11 recommendations accepted incl. ci_green_for_sha)
**Workflow:** WF2 (enhance existing tooling). One commit per item, and every item names what it REPLACES or REMOVES (operator principle 2026-09-27: standardized AND simple, no new gates).
**Domain Mode:** Backend/Pipeline (`scripts/hooks/`, `.husky/`, `.github/workflows/`, `scripts/lib/exec-tools.js`), plus test-only edits.
**Execution Provider:** deepseek drafted this plan: run `20260928T005619Z-0dd1cb13`; the orchestrator re-grounded and rewrote it. At implementation: **claude** for `.github/workflows/**` (engine `claude_only_globs`), `.husky/*`, and the `git rm --cached`/renormalize commits (git index operations, not file writes); **deepseek** for the `exec-tools.js` POSIX kill fix and the test-only fixes (briefs < 5 KB, `write_scope` = named files).

## Context
* **Goal:** TRUST in the gates themselves. Today:
  * CI has been red on every `main` push for 6 days, so nobody reads it.
  * A fresh worktree commits with no hooks at all.
  * 92 MB artifacts ride every clone.
  * Line endings drift per tool.
  * A cloud dispatch can start without its seeds and die mid-run.

  Each item below closes one of these by fixing a root cause, never by adding a checklist line.
* **Target Specs:**
  * Spec 124 R-AG (hook composition) and §5 R-BA item 11(e) ("CI green is the backstop").
  * Spec 08 §C.1.9 (engine bash timeout kill).
  * Spec 123 §7.2 A5 (pre-dispatch checks; `cloud-pre-dispatch.mjs`).
  * Spec 122 R-M (before-image).
  * Spec 59 §8d / #418 DEC-FENCE2 (the stale db lock).
* **Database Impact:** NO.

## 1. CI root cause (measured read-only, `gh run view <id> --log-failed`)
History [MEASURED `gh run list --branch main --limit 30`]:
* **Test Suite:** red on every push since at least `211acc8d` (2026-09-22).
* **DB Integration Tests:** red since `b4913395` (2026-09-24 21:00Z); last green `f122bca7`.
* Latest pair at `d968e3e9`: runs 36363040475 / 36363040495.

**One root cause with five symptoms: the gates only ever run on the Windows dev box, never against Linux or the live-DB suite.** Pre-push runs `npm run test` on Windows [READ `.husky/pre-push`]. `test:db` is structurally excluded from the pre-push/pre-commit hooks [READ `.husky/pre-commit` header; `package.json` `"test"` excludes]. So a test that passes only on NTFS, or only with an untracked local file, or a live-DB lock made stale by a cutover, reaches `main` green locally and red in CI.

| # | Failing test (CI) | Root cause [evidence] | Fix |
|---|---|---|---|
| C1 | `src/tests/api.infra.test.ts` "every mutating /api/admin/** export refuses the shared non-session sentinels": order mismatch `users/[uid]/route.ts PATCH` vs `users/route.ts POST` | `findRouteFiles` returns `fs.readdirSync` order. NTFS returns sorted, ext4 does not [READ `api.infra.test.ts:1307-1318`; the comparison `expect(offenders).toEqual(SESSION_GATE_GAPS_FILED)` :1102] | `results.sort()` in `findRouteFiles` (test-only). Also fixes the sibling `AUDIT_GAPS_FILED` comparison, which has the same latent order dependency. |
| C2 | `src/tests/agent-roster.infra.test.ts` T3 "every PLANNED row resolves its id in the Part-B plan" | reads `.cursor/wf1_deepseek_execution_engine_active_task.md` [READ :32, :410-412]. The file exists only on disk: untracked, not ignored [MEASURED `git check-ignore` exit 1; `git ls-files .cursor` lists `archive/` only] | item H4 (track the plans). No test edit. |
| C3 | `src/tests/deepseek-exec-fences.infra.test.ts` commit 9 "run_bash_command timeout_ms:500 … the sleep process is no longer running" | **Real engine defect on POSIX, not a flake.** The timeout calls `child.kill('SIGKILL')` on the direct child only [READ `scripts/lib/exec-tools.js` timer block, `child.kill('SIGKILL')`]. For `npm run test`, the child is npm and the sleeping node is its grandchild, which survives, orphaned. Windows uses `killProcessTreeWin32` (fixed by `f8ba3f75`/`2a411ef4`), so the local box is green and Linux is red. | Spawn POSIX children with `detached: true` (their own process group) and kill with `process.kill(-child.pid, 'SIGKILL')`. Keep the test as the lock (Spec 08 §C.1.9). |
| C4 | `src/tests/db/load-parcels-ravine-invalidation.db.test.ts` "NULLs the ravine + heritage stamps via a CASE gated ONLY on geometry change": expected script text to contain `DEC-FENCE2` | a source-text lock on `scripts/load-parcels.js` [READ test :25-27]. Since the parcels conversion, that file is a frozen shell (0 hits) and the fence is DECLARED in `scripts/load-parcels.descriptor.json` (9 hits) as the 0m `invalidates[].set_null_on_change_of` arm [MEASURED `grep -c DEC-FENCE2`]. The parcels ③ cascade never saw it because `test:db` is not in any hook. | Re-point the text lock IN PLACE at the descriptor declaration (`invalidates[]` naming the ravine + heritage stamp columns). The real-DB `describe` block (:45) stays the behavioural proof. Regression Guardian states the #418 fence. |
| C5 | `src/tests/db/refresh-snapshot-recorder-bound.db.test.ts` (V1) "a phase deadline already exhausted by the main reads skips EVERY optional read": main read cancelled by `phase_deadline` | declared deadline `1/60000` min (1 ms) [READ :405-423]. The test assumes the main read finishes inside it, but on CI the 1 ms expired during the main read. This is a wall-clock race by construction; it appeared first on `d968e3e9`. | Make "exhausted after the main reads" deterministic: exhaust it by construction through the recorder's own clock/phase-start input, not by a wall-clock value that is merely very small. If no seam exists, the test drives the optional-read loop with an already-expired deadline object. Either way, no production change unless the Guardian finds the deadline is itself wrong. |

**Overlap, folded by reference (not duplicated):** `.cursor/wf3_test_db_suite_red_active_task.md` (Status: Implementation) owns greening `test:db`. It already REJECTED adding `test:db` to pre-push under R-AG (cost: 319 s plus a container boot) and holds C7 "GATE (operator-authorized only)", which is where the db-tests workflow becomes required. **C4 and C5 above are handed to that WF3 as two more clusters** (they postdate its 2026-09-21 measurement: 74 reds then; CI now shows 2). This plan lands them only if that WF3 is closed first. This plan's own CI scope is therefore C1–C3 (Test Suite).

**Also measured (not CI):** the 2026-09-24 CI run also failed commit-9's `timeout_ms` clamp test; `d968e3e9`'s did not. The Windows timing flakes of the engine fences are fixed by `f8ba3f75`/`2a411ef4` (verified: the kill-tree test is green on CI except the POSIX grandchild case C3). **Disposition: keep both tests.** They are the locks. Only C3's production bug remains.

## 2. Items (each: replaces/removes · files · proof)
| Item | Change | Replaces / removes | Proof |
|---|---|---|---|
| **H1 LF** | New `.gitattributes`: `* text=auto eol=lf`, plus `-text` for binaries (png/jpg/zip/xlsx/pdf). Then `git add --renormalize .` | Removes the per-tool CRLF workarounds (memory "Python writes CRLF"; Bash-heredoc cautions). Gate F's LF-only path check stays as the backstop, now nearly idle. Index today: **35 `i/crlf` + 1 `i/mixed`** of 2,727 [MEASURED `git ls-files --eol`], incl. `converted.json`, `programme-items.json`, census, specs 08/41/43/56/83/88. **No golden recapture:** `source_fingerprint` hashes `normaliseEol(...)` [READ `capture-step-golden.js:332`] and `lib_fingerprint` is LF-normalised [READ `gates/captures.mjs:23-26`]. | After: `git ls-files --eol \| grep -c -E '^i/(crlf\|mixed)'` = 0; `npm run step:validate -- --all` unchanged; full suite green. |
| **H2 50 MB cap** | Add to the EXISTING staged-content preamble `scripts/hooks/check-partial-staging.sh` (runs first in `.husky/pre-commit`): refuse any staged blob > 50 MB (`git cat-file -s :<path>`), naming the file and the ignore rule to add. | Nothing replaced: it closes the class (GitHub warns at 50 MB and rejects at 100 MB). No new hook file; `hooks-composition.infra.test.ts` stays unchanged because the pre-commit line is the same. | Temp-repo test: 51 MB staged ⇒ exit 1 + filename; 1 KB ⇒ exit 0. |
| **H3 before-images** | `.gitignore` += `docs/reports/golden/*/before-image/`; `git rm --cached` the **21** tracked jsonl [MEASURED `git ls-files \| grep before-image \| wc -l`] (incl. 3 × 92,398,269 B `link_massing` files [MEASURED]). | Removes ~420 MB of run artifacts from every future checkout diff. The writer `persistBeforeImageRows` [READ `write.js:1530-1545`] still writes locally first (R-M: before the write; fail-loud unchanged). No test reads a committed before-image: the only test hit is a path-string assertion [READ `step-library.logic.test.ts:2979`]. **History is NOT rewritten** (no force-push, standing rule), so the 92 MB blobs stay in `origin` history. | `git ls-files \| grep -c before-image` = 0; a golden capture of a retracting step still produces the file locally. Guardian: R-M's recovery promise is a LOCAL file, so the Spec 122 R-M text gets one clarifying sentence in the same commit. |
| **H4 track plans** | `git add .cursor/*.md .cursor/engine-briefs/` (the `.cursor/active_task*` ignore stays [READ `.gitignore:80-81`]). | Removes the "plan exists only on one disk" class: fixes C2, and makes every PLAN LOCKED plan auditable from git. | CI C2 green; `git status --short .cursor` empty after. Pre-check: grep the plans for secrets (`DEEPSEEK_API_KEY=`, `postgres://`, tokens); a hit is scrubbed first. |
| **H5 CI green** | C1 (sort), C3 (POSIX process-group kill), C4 (re-point to the descriptor), C5 (deterministic deadline). C2 by H4. | Removes 5 red tests, so CI means something again (R-BA 11(e)). | Next `main` push: both workflows `success`. |
| **H6 hooks in every worktree** | **Root cause [MEASURED]:** `git config core.hooksPath` = `.husky/_`, a relative path shared by ALL worktrees, pointing at a directory husky GENERATES and gitignores [MEASURED `git check-ignore -v .husky/_/h` → `.husky/_/.gitignore`]. `npm ci --ignore-scripts` skips `"prepare": "husky"` [READ package.json], so a fresh worktree has no `.husky/_` and git **silently runs no hooks**. This is how 21 hookless commits landed on 2026-09-27. **Fix:** point hooks at the TRACKED directory: `core.hooksPath=.husky`, and `"prepare": "git config core.hooksPath .husky"` (husky's `_/h` wrapper only adds `node_modules/.bin` to PATH and the `HUSKY=0` skip [READ `.husky/_/h`]; every hook already calls `npx`/`node`/`bash`). Every checkout then has its hooks, and a tree without `node_modules` fails CLOSED (npx errors), never open. Plus `npm run worktree:setup` = `npm ci --ignore-scripts && npm rebuild @ast-grep/cli` for the ast-grep binary, called by `scripts/wf8-worktree.mjs` [READ: today it runs no install step]. | Removes the manual `npx husky` step and the silent-skip failure mode. **Why not the suggested pre-push check:** a hookless tree never runs its own pre-push, so a check there cannot see the case it targets. The hooks path is the only mechanical answer. | In a fresh `git worktree add` + `worktree:setup`: a commit that violates lint is REFUSED. Without `node_modules`, the commit is refused (not silently allowed). `hooks-composition.infra.test.ts` gains one assertion: `prepare` sets `core.hooksPath .husky`. |
| **H7 seed check at dispatch** | `scripts/analysis/cloud-pre-dispatch.mjs` already implements `seed_rows_present`, `migrations_missing`, `declared_guards_present` [READ header rows 2–5; `npm run cloud:pre` in package.json:38]. It is only run by hand. Add an `--only=<ids>` filter to its existing `parseArgs`, and one step in each `.github/workflows/chain-*.yml` after `migrate.js --verify` [READ chain-sources.yml:184-185]: `node scripts/analysis/cloud-pre-dispatch.mjs --dry --only=seed_rows_present,migrations_missing,declared_guards_present`. Exit 1 ⇒ the job stops before any step runs. | Replaces the operator's manual pre-dispatch checklist rows (a)–(c) (runbook §3c; the owed cloud mig 248 + 48 seed keys) and the LM-D15 "throws mid-chain after the dispatch is spent" failure. `stranded_running_rows` and `sharing_chain_running` are deliberately NOT wired: `check-chain-running.js` and `reconcile` own them (one owner per concern). | Logic test: `--only` filters rows and the verdict; an unknown id throws by name. Cloud: the first dispatch after merge shows the step's table in the job log. |
| **H8 one reaper** | FOLD BY REFERENCE: `.cursor/wf2_one_reaper_rule_active_task.md` stays its own WF (queued after neighbourhoods). This plan only hands it its acceptance fixture: local stranded `running` rows **1737** (`link_wsib`, started 2026-08-29), **1985** (`enrich_ravines`, 2026-09-24), **2010** (`parcels`, 2026-09-26) [MEASURED `SELECT id, pipeline, started_at FROM pipeline_runs WHERE status='running'`]. | — | That WF's RED lock runs against these three rows. |
| **H9 typecheck staleness (measure first)** | Memory reports (unverified) that `tsc --noEmit` with `"incremental": true` [READ tsconfig.json:20] let a type error slip on 2026-09-27. Reproduce: introduce a type error in a file only imported transitively, run `npm run typecheck` twice. | If it reproduces: pre-commit calls `tsc --noEmit --incremental false` (removes the stale-buildinfo read). If it does not: drop the item and record the measurement in the plan. | The measurement itself. |

## 3. Target file review (operator ruling: the item's own files)
Greps: `git grep -n "hooksPath\|\"prepare\"" -- package.json .husky src/tests`; `git ls-files --eol`; `git ls-files | grep before-image`; `git grep -n "before-image/" -- src/tests scripts`; `git grep -n "cloud-pre-dispatch\|cloud:pre"`; `git grep -n "findRouteFiles"`.

| File | READ | Touched | Impact | Registration / spec |
|---|---|---|---|---|
| `.gitattributes` | absent | new | EOL normalisation | Spec 124 R-AG row: one sentence |
| `.gitignore` | :80-81 | Y | before-image ignored | — |
| `scripts/hooks/check-partial-staging.sh` | full | Y | + size cap | R-AG |
| `.husky/pre-commit`, `.husky/pre-push`, `.husky/_/h` | head/full | N (pre-commit line unchanged) | hooks path only | `hooks-composition.infra.test.ts` + 1 assertion |
| `package.json` `prepare`, new `worktree:setup` | hit lines | Y | hooks path | — |
| `scripts/wf8-worktree.mjs` | :1-40 | Y (call `worktree:setup`) | fresh worktrees usable | `.claude/workflows.md` WF8 line |
| `scripts/lib/exec-tools.js` | timer block + `spawnAllowlisted` | Y | POSIX tree kill | Spec 08 §C.1.9 sentence |
| `scripts/lib/step/write.js` `persistBeforeImageRows` | :1520-1545 | N | still writes locally | Spec 122 R-M sentence |
| `scripts/analysis/cloud-pre-dispatch.mjs` | header + `main`/`parseArgs` | Y (`--only`) | filter | Spec 123 §7.2 A5 sentence |
| `.github/workflows/chain-{sources,coa-permits,deep-scrapes,entities,wsib}.yml` | chain-sources :184-239 | Y (one step each) | dispatch refuses unseeded DB | Spec 115 scheduling note |
| `src/tests/api.infra.test.ts` | :1050-1103, :1307-1318 | Y (sort) | test-only | — |
| `src/tests/agent-roster.infra.test.ts` | :32, :405-435 | N | green via H4 | — |
| `src/tests/deepseek-exec-fences.infra.test.ts` | :477-545 | N (the lock) | — | — |
| `src/tests/db/load-parcels-ravine-invalidation.db.test.ts` | :1-45 | Y (re-point) | #418 fence kept | Spec 59 §8d |
| `src/tests/db/refresh-snapshot-recorder-bound.db.test.ts` | :405-430 | Y | deterministic | — |
| 21 before-image jsonl | listed | untracked | — | — |
| 36 CRLF/mixed files | listed | renormalized | EOL only | — |

## Standards Compliance
* **Try-Catch Boundary:** `exec-tools.js` kill stays inside its existing try (process may already be gone). No new API route.
* **Unhappy Path Tests:** oversize staged file; hookless tree (no node_modules) refuses; `--only` unknown id; POSIX grandchild killed; deadline exhausted deterministically.
* **logError Mandate:** N/A (CLI/hooks; non-zero exits with named reasons).
* **UI Layout:** N/A.
* **McDonald's Airtight:** no gate is added or weakened. H5 makes gate R-BA 11(e) (CI backstop) real, and the ledger is untouched.

## Execution Plan (one commit each; one committer; order chosen so each commit is green in CI)
- [ ] 0. `node scripts/ai-env-check.mjs`. Wait until no push/suite is running on this machine.
- [x] 1. H4 track plans (secret grep first) → C2 green.
- [x] 2. H5: C1 sort (test-only), then C3 POSIX kill (engine brief, Spec 08 sentence); `npm run test`. C4/C5 → append to `.cursor/wf3_test_db_suite_red_active_task.md` as clusters (its C7 owns making db-tests required). **SUPERSEDED at implementation (orchestrator scope, 2026-09-27): C4 and C5 were FIXED on this branch (3d656b23, ed9943d2; 18/18 against a testcontainer), because `ci_green_for_sha` requires DB Integration Tests green — deferring them would have blocked every cloud dispatch.** Output panel (Guardian + Code Reviewer) folded: lessons.md `npx husky` line (HIGH), size-cap fail-closed (MED).
- [ ] 3. (DEFERRED 2026-09-27 by orchestrator scope) H3 before-image untrack + ignore + Spec 122 R-M sentence.
- [ ] 4. (DEFERRED 2026-09-27 by orchestrator scope) H1 `.gitattributes` + renormalize (a commit that touches only EOL; verify `step:validate --all` unchanged).
- [x] 5. H2 size cap (+ temp-repo test).
- [x] 6. H6 hooks path + `worktree:setup` + wf8 + hooks-composition assertion; prove in a throwaway worktree.
- [x] 7. H7 `--only` (+ `ci_green_for_sha`, D2) + workflow steps (claude) + Spec 123 A5 sentence.
- [x] 8. H9 measure; commit or drop. **DROPPED — REFUTED 2026-09-27:** in this worktree (warm `tsconfig.tsbuildinfo`), a probe chain a.ts→b.ts (untyped re-export)→c.ts was type-checked clean, then ONLY a.ts changed its return type to `string`; `npx tsc --noEmit` reported `c.ts(2,14): TS2322` on BOTH consecutive runs and `npm run typecheck` reported it too. Incremental buildinfo does not hide a transitive error. The 2026-09-27 slip is explained by H6 instead (the hook never ran in that hookless worktree). No change to pre-commit.
- [ ] 9. Panel: Regression Guardian (C4 fence #418, H3 R-M, H6 husky history), Code Reviewer grounded, Integration (workflow env: `DATABASE_URL` secret available at the new step). Push. **Exit criterion:** both CI workflows green on the pushed SHA.

## Operator decisions
* **D1:** leave the three 92 MB blobs in `origin` history (recommended: rewriting history needs a force-push, which is banned), or approve a one-time history rewrite with its own plan?
* **D2 (recommend YES):** add one row `ci_green_for_sha` to `cloud-pre-dispatch.mjs` (reads `gh run list --commit $GITHUB_SHA` conclusions) so a cloud chain never dispatches on a SHA whose CI is red. It reuses the H7 step, and it is the one place red CI must stop work (trust in the data). It is a new check row, so it needs your y/n under "no new gates".

> **PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
> §11 note: H6 deliberately does NOT add a pre-push "hooks installed" check (it cannot fire in the tree it targets); the tracked hooks path is the mechanical fix.
