# Runbook: DeepSeek Execution Engine — Brief Template & Multi-Worktree Launch

**SPEC LINK:** `docs/specs/00-architecture/08_agents.md` §B, §C (the tool-call/ledger/denylist contract), §C.6 (multi-worker isolation), F14 (2026-09-22 operator ruling: "use this engine outside step optimization as well, multiple worktrees")
**Engine:** `scripts/deepseek-exec.js` (+ `scripts/lib/exec-tools.js`, `exec-ledger.js`, `exec-policy.json`, `exec-claims.js`, `exec-brief.js`)
**Tracked item:** SUB-ENG-1 (`.cursor/wf1_deepseek_execution_engine_active_task.md`)

This runbook is for the orchestrator (a Claude Code session following `CLAUDE.md` PD 11) launching the engine — on the Step Opt Programme conversions it was built for, AND, per F14, on general repo work in any worktree. It is the brief FILE format the engine's `--brief <file>` flag expects, plus the recipe for running several engines from one shell without them colliding.

## 1. Brief front matter (mandatory)

Every brief opens with a `write_scope` front-matter block — the engine's own minimal parser (`scripts/lib/exec-brief.js`), no YAML library:

```
---
write_scope:
- scripts/steps/enrich_ravines/**
- src/tests/steps/enrich_ravines/**
---
<the WF-shaped body below>
```

- Globs are relative to the repo root; `**` = any depth, `*` = within one path segment.
- `write_file`, `edit_file` and every `git_commit.paths` entry must match at least one glob, or the call is `blocked` `PATH_OUT_OF_SCOPE` (§C.6.1).
- **Not overridable, even by a scope that names them:**
  - `registry_reserved` (§C.6.2) — `scripts/manifest.json`, `scripts/steps/_schema/converted.json`(`.pending`), the census/programme-items/template-freeze/schema-baseline registries, `docs/specs/00-architecture/00_system_map.md`. Blocked `PATH_RESERVED`. These are landed by the ORCHESTRATOR's own commit, never the engine.
  - `claude_only_globs` (§C.6.2, F14) — money/auth/PII/migrations: `migrations/**`, `src/app/api/**/auth/**`, `src/app/api/**/billing/**`, `src/lib/auth/**`, `src/lib/billing/**`, `.github/workflows/**`. Blocked `PATH_CLAUDE_ONLY`. These are the §B "downgrade to claude" surfaces enforced as a mechanical fence, not just a briefing instruction — a step that touches them is a Claude-provider step, full stop.
- A provider `deepseek` run with an empty/missing `write_scope` (or no live DeepSeek client — no `DEEPSEEK_API_KEY` and no `--transcript`) downgrades to `claude` per §B rather than refusing to start (`provider_source: fallback:no_write_scope` / `fallback:engine_unavailable:no_api_key`).

## 2. Body skeleton — WF-shaped, one sentence reason per call

The body (everything after the closing `---`) is the system prompt's payload — write it the way you'd write a WF3/WF2 active task, because the engine has no memory beyond this file and its own tool results:

```
## Goal
<one paragraph: what this task achieves and why>

## Reproduce
<the failing test / the gap to close — the command that shows it>

## Red
<the test(s) that must go from failing to passing; SPEC LINK header requirement>

## Fix
<the specific change — file(s), the expected diff shape, anything NOT to touch>

## Green
<the exact verification commands: `npx vitest run <path>`, `npm run typecheck`>

## Commit
<the commit message scope/subject the orchestrator expects; git_commit.paths must
be exactly the files this task's write_scope covers>

## Stop
<what "done" looks like — do not scope-creep past this>
```

Every tool call the engine makes carries a `reason` field (§C.2, mandatory on all five tools) — the brief should model this by giving the engine ONE clear reason per step of the skeleton above, not a vague multi-purpose goal. A brief that reads like a real WF plan produces a ledger that reads like a real audit trail.

## 3. Multi-worktree launch recipe (F14)

One orchestrator shell can run several engines in parallel, one per worktree, one worktree per task — git gives filesystem + index isolation for free, and `--repo` (F14) plus the active-claims registry (§C.6.3) make the task boundary mechanical:

```bash
# 1. Create the worktree (never a junction into node_modules — see
#    feedback_worktree_node_modules_junction.md; npm ci INSIDE the new
#    worktree, not a symlink/junction from main).
git worktree add ../buildo-<task> -b <branch>
cd ../buildo-<task> && npm ci && cd -

# 2. Launch the engine against that worktree explicitly — --repo is the
#    worktree root, realpath'd, asserted to contain a .git (commit 11).
#    Confinement, claims and the committer lock all derive from --repo, not
#    the orchestrator shell's own cwd.
node scripts/deepseek-exec.js \
  --repo ../buildo-<task> \
  --brief ../buildo-<task>/brief.md \
  --provider=deepseek \
  --ledger-dir "$BUILDO_EXEC_LEDGER_DIR"   # or let it default

# 3. Watch the run — the ledger is a plain JSONL file outside the repo
#    (%LOCALAPPDATA%/buildo-exec-runs on Windows, ~/.local/share/buildo-exec-runs
#    on POSIX, unless BUILDO_EXEC_LEDGER_DIR is set):
tail -f "<ledger_dir>/<run_id>.jsonl"

# 4. Kill a run early if needed — the sentinel is checked before every model
#    turn and every tool call (§C.1.2):
touch "<ledger_dir>/KILL"          # halts every run watching this ledger dir
touch "<ledger_dir>/<run_id>.kill" # halts only that one run
```

A second engine launched against a DIFFERENT worktree or branch with a non-overlapping `write_scope` starts cleanly; one launched against the SAME worktree/branch with an overlapping scope refuses with `CLAIM_CONFLICT` (§C.6.3) — the active-claims registry, not orchestrator discipline, is what catches this.

## 4. What the engine will never do for you

- Land a `registry_reserved` edit (manifest/converted.json/system-map) — that's the orchestrator's own commit, after the engine's PR-shaped diff is reviewed.
- Touch a `claude_only_globs` path — money/auth/PII/migrations stay a Claude-provider step under every `EXECUTION_PROVIDER` value.
- Bypass a husky hook (`--no-verify` and friends are refused and ledgered, never stripped-and-retried, §C.1.8).
- Commit without a live single-committer lock for that worktree (§C.6.4).

See `docs/specs/00-architecture/08_agents.md` §C for the full contract; this runbook is the practical "how do I actually launch it" companion.
