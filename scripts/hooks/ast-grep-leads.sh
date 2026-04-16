#!/usr/bin/env bash
# Footgun gate — runs the AST-grep rules + 3 grep-based pattern checks
# that AST-grep can't easily express (comment-rot near throws, silent
# row dropping after .map, pool boundary). Each rule maps to a bug class
# the holistic reviews keep catching across phases. Initially scoped to
# src/features/leads/ and src/lib/ per CLAUDE.md §12 expansion model.
#
# Wired into .husky/pre-commit before npm run test so it fails fast.
# Manually: `npm run ast-grep:leads`.
#
# Exit codes:
#   0 = clean
#   1 = at least one rule fired
set -u
fail=0

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root" || exit 2

scope_leads="src/features/leads"
scope_lib="src/lib"

# ---------------------------------------------------------------------------
# 1. silent-catch-fallback: scoped to leads/ + lib/ (codebase-wide bug class)
# 2. env-default-in-lib: scoped to leads/ ONLY for now (src/lib/db/client.ts
#    has pre-existing env defaults grandfathered until a separate WF
#    addresses them; expand the scope per CLAUDE.md §12 expansion model).
# ---------------------------------------------------------------------------
if [ -d "$scope_leads" ]; then
  npx ast-grep scan --error=info "$scope_leads" || fail=1
fi
if [ -d "$scope_lib" ]; then
  npx ast-grep scan --error=info --rule scripts/ast-grep-rules/silent-catch-fallback.yml "$scope_lib" || fail=1
fi

# ---------------------------------------------------------------------------
# 3. Comment rot near throws — "never throws" / "always returns" comments
#    that sit within ~10 lines of an actual `throw` statement.
# ---------------------------------------------------------------------------
# AST-grep doesn't model comments as nodes in TypeScript reliably, so we
# use a grep heuristic: find files containing the prohibited comment, then
# check if the same file has a `throw` statement. False positives are
# possible but the message tells the dev to delete the stale comment.
comment_rot=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if grep -qE '\bthrow [a-zA-Z_]' "$f"; then
    echo "footgun[comment-rot]: $f contains a 'never throws' / 'always returns' comment AND a throw statement. Delete the stale comment or refactor the function. Phase 2 holistic review caught this in feed/route.ts (commit 449fb2a)."
    comment_rot=1
  fi
done < <(grep -rl -E '// (never throws|always returns)' "$scope_leads" "$scope_lib" 2>/dev/null || true)
[ $comment_rot -eq 1 ] && fail=1

# ---------------------------------------------------------------------------
# 4. Silent row dropping — `.map(mapRow).filter(...x !== null)` chains
#    without an upstream logWarn in the same file.
# ---------------------------------------------------------------------------
# Heuristic: find files with the type-guard filter shape, then check
# whether `logWarn` appears in the file. If not, the silent drop has no
# observability.
silent_drop=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! grep -qE 'logWarn\(' "$f"; then
    echo "footgun[silent-row-drop]: $f filters mapped rows by null without a logWarn anywhere in the file. If the SQL UNION shape ever drifts, items will silently disappear from the response. Phase 0+1+2 holistic review caught this in get-lead-feed.ts (commit 449fb2a)."
    silent_drop=1
  fi
done < <(grep -rl -E '\.filter\([^)]*\): [a-zA-Z]+ is [a-zA-Z]+ =>' "$scope_leads" "$scope_lib" 2>/dev/null || true)
[ $silent_drop -eq 1 ] && fail=1

# ---------------------------------------------------------------------------
# 5. Pool boundary — `new Pool(` instantiation outside src/lib/db/ + scripts/.
# ---------------------------------------------------------------------------
# Per CLAUDE.md Backend Mode rule 3: "No `Pool` instantiation outside
# `src/lib/db/client.ts` — use the shared pool." The rule is about
# INSTANTIATION, not usage; importing the shared pool and calling
# pool.query() is fine. We only flag `new Pool(`.
boundary=0
while IFS=: read -r f _; do
  [ -z "$f" ] && continue
  case "$f" in
    src/lib/db/*) ;;
    src/tests/*) ;;  # tests may construct mock pools
    scripts/*) ;;
    *)
      echo "footgun[pool-boundary]: $f instantiates a new Pool outside the allowed boundary (src/lib/db/, src/tests/, scripts/). Per CLAUDE.md Backend Mode rule 3: import the shared pool from @/lib/db/client instead."
      boundary=1
      ;;
  esac
done < <(grep -rEln 'new Pool\(' src/ 2>/dev/null | grep -v 'interface Pool\|type Pool' || true)
[ $boundary -eq 1 ] && fail=1

# ---------------------------------------------------------------------------
# 6. Direct pg_try_advisory_lock — banned in scripts/ after Bundle A migration.
#    scripts/run-chain.js uses the 2-arg form (separate key namespace) and is
#    exempt. scripts/lib/pipeline.js is the helper implementation — also exempt.
# ---------------------------------------------------------------------------
advisory_lock=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    scripts/run-chain.js) ;;           # 2-arg form, separate namespace — exempt
    scripts/lib/pipeline.js) ;;        # helper implementation — exempt
    *)
      echo "footgun[direct-advisory-lock]: $f calls pg_try_advisory_lock directly. Use pipeline.withAdvisoryLock() instead (spec 47 §5, Bundle A migration). Exception: scripts/run-chain.js (2-arg form) and scripts/lib/pipeline.js (helper)."
      advisory_lock=1
      ;;
  esac
done < <(grep -rEln 'pg_try_advisory_lock' scripts/ 2>/dev/null | grep -v 'scripts/hooks/' || true)
[ $advisory_lock -eq 1 ] && fail=1

if [ $fail -ne 0 ]; then
  echo
  echo "❌ Footgun gate failed. See messages above. To suppress a single line, add \`// ast-grep-disable-next-line <rule-id>\` with a justification."
  exit 1
fi

echo "✅ Footgun gate clean (silent-catch-fallback, env-default-in-lib, comment-rot, silent-row-drop, pool-boundary, direct-advisory-lock)"
exit 0
