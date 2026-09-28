---
write_scope:
- scripts/hooks/install-hooks.mjs
- src/tests/install-hooks.infra.test.ts
- scripts/wf8-worktree.mjs
- .claude/workflows.md
- docs/specs/01-pipeline/124_step_standard_policy.md
---
# WF2 hygiene H6 — hooks run in EVERY worktree (tracked hooks path) — STOP BEFORE COMMIT

## Goal
Root cause: `core.hooksPath=.husky/_` is husky-GENERATED and gitignored; `npm ci --ignore-scripts` never creates it, so fresh worktrees run NO hooks. Fix: point `core.hooksPath` at the TRACKED `.husky` directory (orchestrator owns package.json, `.husky/**`, hooks-composition test — never touch). The orchestrator will set `"prepare": "node scripts/hooks/install-hooks.mjs"` and `"worktree:setup": "npm ci --ignore-scripts --no-audit --no-fund && npm rebuild @ast-grep/cli && node scripts/hooks/install-hooks.mjs --verify"`.

## Red first — NEW `src/tests/install-hooks.infra.test.ts`
Header `// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG`. Mirror `src/tests/hook-partial-staging.infra.test.ts`: throwaway repo under `os.tmpdir()`, ALLOWLIST child env (copy its `ENV_ALLOW`/`childEnv`), guarded `git()` helper. Run the script with `spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env })`.
- T1: in a fresh temp git repo containing `.husky/pre-commit`, `.husky/pre-push`, `.husky/commit-msg`, `.husky/prepare-commit-msg` (each `#!/bin/sh\ntrue\n`, added with `git add` then `git update-index --chmod=+x`), no args → exit 0 and `git config core.hooksPath` = `.husky`.
- T2: a temp dir that is NOT a git repo → exit 0, stdout contains `not a git work tree` (npm install outside git must never fail).
- T3: `--verify` in the T1 repo → exit 0.
- T4: `--verify` after deleting `.husky/pre-push` → exit 1, output names `pre-push`.
- T5: `--verify` after `git update-index --chmod=-x .husky/commit-msg` → exit 1, output names `commit-msg` and `executable`.
- T6: `--verify` when a hook's first line is not `#!/bin/sh` → exit 1 naming it.

## Fix — NEW `scripts/hooks/install-hooks.mjs` (ESM, no deps, no `process.exit()` — set `process.exitCode`)
Header: SPEC LINK R-AG + 4-line why (the root cause above). Uses `spawnSync('git', [...], { encoding: 'utf8' })` in `process.cwd()`.
1. `git rev-parse --is-inside-work-tree` fails or git missing → print `install-hooks: not a git work tree — skipped` and exit 0.
2. `git config core.hooksPath .husky` (writes the repo's shared config; relative, so each worktree resolves its OWN tracked `.husky`). Print `install-hooks: core.hooksPath = .husky`.
3. With `--verify`: for each of `pre-commit`, `pre-push`, `commit-msg`, `prepare-commit-msg` under `<git rev-parse --show-toplevel>/.husky/`: file exists; first line is exactly `#!/bin/sh`; `git ls-files -s -- .husky/<name>` mode is `100755` (else `not executable in the index`). Also `git config core.hooksPath` reads back `.husky`. Every failure printed as `install-hooks: FAIL <name>: <reason>`; any failure → exitCode 1; else print `install-hooks: verified 4 hooks`.

## wf8
In `scripts/wf8-worktree.mjs` `run()`, right after `ok(\`worktree created at ${destDir}\`)`: `console.log('\n→ npm run worktree:setup (hooks + deps)'); sh('npm run worktree:setup', { cwd: destDir, stdio: 'inherit' }); ok('worktree:setup done — hooks active');` (a throw propagates: a hookless tree must not be handed off silently).

## Docs (edit_file only)
- `.claude/workflows.md`, WF8 "Run setup" block: after `git worktree add ../buildo-<slug> -b wf<N>/<slug> <base>` add a line `npm run worktree:setup   # npm ci --ignore-scripts + ast-grep binary + hooks path (.husky), verified`.
- Spec 124 row `| R-AG |`: insert before `Both directions locked by \`src/tests/hooks-composition.infra.test.ts\`` the sentence: `Hooks run from the TRACKED \`.husky\` directory in every worktree: \`core.hooksPath=.husky\`, set by \`prepare\`/\`npm run worktree:setup\` via \`scripts/hooks/install-hooks.mjs\` (WF2 hygiene H6, 2026-09-27 — the generated, gitignored \`.husky/_\` left fresh worktrees silently hookless); a tree without \`node_modules\` fails closed. `

## Gate answers
No descriptor field, logic variable, check limit, emits key or counters source — tooling + tests + prose; no Spec 124 §5 R-BA gate reads it.

## Green
`npx vitest run src/tests/install-hooks.infra.test.ts`; `npx eslint scripts/hooks/install-hooks.mjs scripts/wf8-worktree.mjs src/tests/install-hooks.infra.test.ts`; `npx tsc --noEmit`; `node scripts/analysis/spec-split-check.mjs --check`.

## Stop
UNCOMMITTED. Do not call git_commit. Report the diff.

## Round 2 (orchestrator, after run 20260928T020113Z-ab5d703f)
Measured: `execSync(cmd, { encoding: 'utf8', stdio: 'inherit' })` returns `null`, so `sh()` in `scripts/wf8-worktree.mjs` (`execSync(...).trim()`) throws a TypeError AFTER both `stdio: 'inherit'` calls succeed (the pre-existing `git worktree add` line and the new `worktree:setup` line). Fix ONLY `sh`: `return (execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', ...opts }) ?? '').trim();` with a one-line comment (stdio 'inherit' returns null). Nothing else.
