# Dev host set-up — Mac mini (and the machine-move checklist)

**Owner specs:** Spec 124 R-CQ (host concurrency, fork caps, memory floor) · Spec 08 §C.6.5 (summary) ·
Spec 113 (local Supabase stack) · `docs/specs/00_claude_code_operating_model.md` §8 (host, timings).
**Established:** 2026-10-15, moving from the Windows PC (`C:\Users\User\Buildo`, WSL2 Docker,
PowerShell) to the Mac mini. Every value below was measured on that day unless marked otherwise.

---

## 1. The host

| Item | Value |
|---|---|
| Machine | Mac mini, Apple Silicon, 24 GB, 12 cores, macOS, zsh |
| Docker | OrbStack (`brew install --cask orbstack`), capped at 12 CPU / **18 GB** (`orb config set memory_mib 18432`, then `orb stop && orb start`). OrbStack takes memory as used, so the cap is a ceiling, not a reservation. |
| Dev DB | local Supabase (`supabase start`), **Postgres 17** (`supabase/config.toml` `major_version = 17`), `127.0.0.1:54322/postgres` |
| Node | `node@24` (v24.x — the PC ran 24.15); Homebrew's default `node` (v26) is shadowed on PATH |
| Postgres client | `libpq` 18.x (`psql`, `pg_dump`, `pg_restore`), `brew pin libpq` — a dump from pg_dump 18 needs pg_restore ≥ 18 |
| Python | 3.11 venv at `~/.venvs/buildo` (`scripts/requirements.txt` + `requirements-dev.txt`); provides both `python` and `python3` |
| Browser | Google Chrome (`brew install --cask google-chrome`) — `scripts/aic-scraper-nodriver.py` drives it |
| Other | `supabase/tap/supabase`, `gh` |
| GitHub auth | `gh auth login` (GitHub.com → HTTPS → web browser) then `gh auth setup-git`. Without it `git push` hangs silently waiting for a username (2026-10-15). Inside Claude Code's `!` shell the prompts are not shown: the one-time device code lands in the background task's output file — enter it at https://github.com/login/device. |

PATH line (in `~/.zshrc`):
```
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/opt/libpq/bin:$HOME/.venvs/buildo/bin:$PATH"
```

## 2. Concurrency on this host (Spec 124 R-CQ — read the row, this is the summary)

- **Serialised, for correctness:** (a) dev-DB writers — captures, cutovers, recapture nights,
  `step-validate --write`, migrations, chain runs; (b) full test suites (they share the engine
  ledger dir `~/.local/share/buildo-exec-runs`); (c) landings onto the programme branch.
- **Everything else runs in parallel:** engine seats (no machine cap — the cap is the token budget),
  Claude seats, targeted vitest, commits in separate worktrees.
- **Forks:** pre-push 8, pre-commit 4, never above 10.
- **Memory floor before (a) or (b):** `memory_pressure -Q` free ≥ 25 % (`node scripts/ai-env-check.mjs`
  prints the `Host memory` line). Below it, poll up to 30 min, then park. Do **not** use "GB free":
  macOS keeps free pages near zero by design, so it reads ≈ 0.1 GB on a healthy machine.
- **Measured:** full suite at 8 forks 68 s, ≥ 62 % free, 0 swapouts; two concurrent 11-fork suites
  147 s each, ≥ 40 % free (and one fence-test collision — hence rule (b)).

## 3. Fresh set-up from a transfer bundle

1. Install §1's toolchain; start OrbStack once to finish its set-up; set the 18 GB cap.
2. Repo: `git clone <bundle> ~/Buildo`, set `origin`, `git fetch`, check out the programme branch,
   copy `.git/info/exclude`. Then `npm ci` and `npm run worktree:setup` (never `npx husky`).
   npm 11 prints "install scripts not covered by allowScripts" for ~16 packages; the ones that
   matter (`@ast-grep/cli`, `esbuild`, `sharp`, `@sentry/cli`) ship prebuilt arm64 binaries and work
   without their postinstall — check with `npx sg --version`.
   **Mobile:** `cd mobile && npm ci --legacy-peer-deps` — exactly as `.github/workflows/mobile-ci.yml`
   does. The committed lockfile omits peer dependencies by design; a plain `npm ci` fails with
   ERESOLVE (react-dom 19.3.1 peer vs react 19.1.0) and a plain `npm install` rewrites the lockfile
   (~790 lines) — never commit that rewrite. `admin-lead-schemas.contract.test.ts` needs these deps.
3. Env files — the operator moves them (never through git or a bundle): `.env`, `.env.local`,
   `mobile/.env`, `mobile/.env.local`.
4. Worktrees: `git worktree add ~/<name> <branch>`, then `git apply --index staged.patch`,
   `git apply unstaged.patch`, `tar -xzf untracked.tgz`. Check each HEAD against the manifest.
   (zsh trap: never name a shell variable `path` — it is tied to `PATH`.)
5. Database — §4.
6. Claude memory: extract the project archive into `~/.claude/projects/` and rename the folder to the
   Mac path key (`/Users/<user>/Buildo` → `-Users-<user>-Buildo`; `_` becomes `-`).
7. Checks: `node scripts/ai-env-check.mjs` (all ✔, `Host memory` ≥ 25 %), `npm run typecheck`,
   `npm run test`, `npm run test:db`.

## 4. Restoring the dev DB from a `pg_dump -Fc` dump

```
supabase start
# pg_restore -n public does NOT create extensions — create them first, in the PC's schemas:
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
SQL
PGOPTIONS="-c maintenance_work_mem=512MB -c synchronous_commit=off" \
  pg_restore --no-owner --no-privileges --clean --if-exists -n public -j 10 \
  -d postgresql://postgres:postgres@127.0.0.1:54322/postgres <dump>
```
- Measured 2026-10-15: 120 tables, 6 GB, **43 s**. `--clean` on an empty DB prints ~44 harmless
  "relation … does not exist" errors from `DROP POLICY/TRIGGER IF EXISTS … ON <table>`.
- `-j` is incompatible with `--single-transaction`; a partial restore is re-run whole (`--clean`).
- **auth rows:** four FKs reference `auth.users` (`admin_audit_log`, `admin_backup_codes`,
  `admin_watchlist`, `profiles`) and fail while it is empty. Restore the rows data-only, users
  BEFORE identities (TOC order is the reverse), then the four FK entries:
  ```
  pg_restore -l <dump> | grep -E "TABLE DATA auth users " > users.lst
  pg_restore -l <dump> | grep -E "TABLE DATA auth identities " > ident.lst
  pg_restore -l <dump> | grep -E "FK CONSTRAINT public .*(fk_admin_audit_log_admin|admin_backup_codes_user_id_fkey|fk_admin_watchlist_admin|profiles_id_fkey)" > fk.lst
  for l in users.lst ident.lst; do pg_restore --data-only --no-owner -L $l -d <db> <dump>; done
  pg_restore --no-owner -L fk.lst -d <db> <dump>
  ```
- The `cron` schema is not restored unless the dev cron jobs are wanted (`-n cron`).
- **Shared memory (once per fresh container):** a new Supabase container runs
  `dynamic_shared_memory_type = posix` on a 64 MB `/dev/shm`, so the capture harness and run-chain
  refuse it (`sys_dsm_capacity`, Spec 30 §4.1a). Run the fix that `scripts/lib/preflight-dsm.js`
  names, then check that `SHOW dynamic_shared_memory_type` reads `mmap`:
  ```
  docker exec supabase_db_Buildo psql -U supabase_admin -d postgres -c "ALTER SYSTEM SET dynamic_shared_memory_type = 'mmap'" && docker restart supabase_db_Buildo
  ```
  Measured 2026-10-16: the Mac restore missed this step, and the first H6 capture refused until it ran.
- **Worktrees have no `.env`** (never copy it). A DB command in a worktree loads the main tree's file
  for that one process only: `DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config <script>`.
- **Worktrees have no `data/`** (it is gitignored). A filesystem-source step (load_wsib) skips with
  `no_source_file`, and a `--source-csv` bracket refuses. Clone the files from the main tree with
  `cp -c ~/Buildo/data/<file> <worktree>/data/` (APFS, no extra space). Measured on the V3 fleet night, 2026-10-16.
- **`db:generate` on the restored DB:** drizzle introspect reorders every table, drops the
  `usersInAuth` MANUAL PATCH and picks up stray `*_bak_*` / `_backup_*` tables. Splice only the
  migration's new definitions into `src/lib/db/generated/{schema,relations}.ts` (measured H6, 2026-10-16).

## 5. Machine-move checklist — everything git does NOT carry

| Item | Why it matters | How it moves |
|---|---|---|
| `.env`, `.env.local`, `mobile/.env`, `mobile/.env.local` | secrets; the env-plane check | operator, by hand |
| `data/` | operator-dropped source CSVs (gitignored) — `load_wsib` and cohort captures refuse without it | operator copy |
| Untracked `.cursor/**` | `QUEUE.md`, `NEXT_SESSION_PROMPT.md`, active tasks, engine briefs, McBylaw state and keying (`authored/**`), morning-questions | the main tree's `untracked.tgz` / ignored-files pack |
| Untracked `docs/reports/**` | generated and session reports not yet committed | ignored-files pack |
| `docs/reports/golden/*/before-image/` | the local before-image audit trail (R-M; gitignored, never committed) | ignored-files pack |
| Worktree state | staged / unstaged / untracked work per worktree | per-worktree patches + tarballs + MANIFEST |
| Claude memory + transcripts | `~/.claude/projects/<key>/` | archive; rename the key (§3.6) |
| Session scratchpads | runner scripts (e.g. `fleet4-run.sh`), sims, briefs | archive → `~/Buildo-scratch/<session-id>/`; re-point PC paths before reuse |
| **Excluded by design** | `.cursor/mcbylaw/coa-spike/` (PII text) | never moved |

**Capture worktrees need `data/` too.** Prefer an APFS clone — `cp -cR ~/Buildo/data ~/<worktree>/data`
(measured: a 50 MB tree cost 4 KB, and a write to the clone left the source untouched). The PC's
`cp -al` hard links also work on macOS, but a hard-linked file shares every in-place edit with the
main tree.

## 6. macOS differences that have bitten (BSD userland)

- `xargs -d` does not exist → `tr '\n' '\0' | xargs -0` (fixed in `.husky/pre-commit`, 2026-10-15).
- `/var` → `/private/var` (and `/tmp` → `/private/tmp`): compare paths by realpath, through the deepest
  existing ancestor for not-yet-existing paths (`realpathDeepestAncestor`, `scripts/lib/exec-path.js`).
- `sed -i` needs an explicit suffix argument (`sed -i ''`).
- "Free memory" is not a health signal (§2).
- The Windows-only global audit hook (`audit-command.ps1`) is retired; Claude Code's session
  transcripts are the audit trail.
