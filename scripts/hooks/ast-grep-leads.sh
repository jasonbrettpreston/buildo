#!/usr/bin/env bash
# Footgun gate — runs the AST-grep rules + grep-based pattern checks
# that AST-grep can't easily express (comment-rot near throws, silent
# row dropping after .map, pool boundary, bare mutations, sql-now).
# Each rule maps to a bug class the holistic reviews keep catching.
# Initially scoped to src/features/leads/ and src/lib/ per CLAUDE.md §12
# expansion model. Phase 7 checks (7-9) scope to scripts/*.js pipeline steps.
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

# ---------------------------------------------------------------------------
# Phase 7 amnesty: load per-rule exempt file lists from scripts/amnesty.json.
# Only inert files (seeds, SDK, orchestrator, migration runner, analysis tools)
# are amnestied. Active pipeline scripts are NOT eligible.
# ---------------------------------------------------------------------------
amnesty_bare_mutation=""
amnesty_sql_now=""
amnesty_loop_query=""
amnesty_push_in_stream=""
if [ -f "scripts/amnesty.json" ]; then
  # Merge permanent + temporary entries: temporary entries are Phase B mop-up work items.
  # Remove temporary entries from amnesty.json as each violation is fixed in Phase B.
  amnesty_bare_mutation=$(node -e "const a=require('./scripts/amnesty.json');const r=a.rules['bare-mutation'];const all=[...(r.permanent||[]),...(r.temporary||[])];process.stdout.write(all.map(e=>e.file).join('\n'))" 2>/dev/null || true)
  amnesty_sql_now=$(node -e "const a=require('./scripts/amnesty.json');const r=a.rules['sql-now'];const all=[...(r.permanent||[]),...(r.temporary||[])];process.stdout.write(all.map(e=>e.file).join('\n'))" 2>/dev/null || true)
  amnesty_loop_query=$(node -e "const a=require('./scripts/amnesty.json');const r=a.rules['loop-query'];const all=[...(r.permanent||[]),...(r.temporary||[])];process.stdout.write(all.map(e=>e.file).join('\n'))" 2>/dev/null || true)
  amnesty_push_in_stream=$(node -e "const a=require('./scripts/amnesty.json');const r=a.rules['unbounded-push-in-stream'];const all=[...(r.permanent||[]),...(r.temporary||[])];process.stdout.write(all.map(e=>e.file).join('\n'))" 2>/dev/null || true)
fi

is_amnestied() {
  local file="$1"
  local list="$2"
  [ -z "$list" ] && return 1
  echo "$list" | grep -qxF "$file"
}

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

# ---------------------------------------------------------------------------
# 7. bare-mutation: pool.query/client.query with INSERT/UPDATE/DELETE but no
#    withTransaction wrapper. All data mutations MUST use withTransaction.
#    Exempt: scripts/amnesty.json rules['bare-mutation'].permanent
# ---------------------------------------------------------------------------
bare_mutation=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  rel="${f#./}"
  is_amnestied "$rel" "$amnesty_bare_mutation" && continue
  if grep -qEi '\b(INSERT INTO|UPDATE |DELETE FROM)\b' "$f" && \
     ! grep -qE '\bwithTransaction\b' "$f"; then
    echo "footgun[bare-mutation]: $f has INSERT/UPDATE/DELETE without a withTransaction wrapper. All data mutations MUST be inside pipeline.withTransaction() (§47 §R9, Phase 7 B2). Add to scripts/amnesty.json only if this is an inert seed/backfill/maintenance script."
    bare_mutation=1
  fi
done < <(find scripts -maxdepth 1 -name '*.js' 2>/dev/null | sort || true)
[ $bare_mutation -eq 1 ] && fail=1

# ---------------------------------------------------------------------------
# 8. multi-transaction: 2+ withTransaction calls in a single script.
#    Multiple transactions risk partial writes. Informational only — does NOT
#    set fail=1. Review each flagged file manually to confirm independence.
# ---------------------------------------------------------------------------
while IFS= read -r f; do
  [ -z "$f" ] && continue
  count=$(grep -cE '\bwithTransaction\b' "$f" 2>/dev/null) || count=0
  count=$(echo "$count" | tr -d '[:space:]')
  if [ -n "$count" ] && [ "$count" -ge 2 ] 2>/dev/null; then
    echo "footgun[multi-transaction] (info): $f has $count withTransaction calls. Multiple transactions risk partial writes — review whether they should be merged into one atomic block (§47 §R9)."
  fi
done < <(find scripts -maxdepth 1 -name '*.js' 2>/dev/null | sort || true)

# ---------------------------------------------------------------------------
# 9. sql-now: NOW() or CURRENT_DATE in a script that also contains mutations.
#    Use RUN_AT (captured once via pipeline.getDbTimestamp()) instead.
#    Exempt: scripts/amnesty.json rules['sql-now'].permanent
# ---------------------------------------------------------------------------
sql_now=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  rel="${f#./}"
  is_amnestied "$rel" "$amnesty_sql_now" && continue
  # Case-sensitive NOW() to avoid false positives from JavaScript's Date.now()
  if grep -qEi '\b(INSERT INTO|UPDATE |DELETE FROM)\b' "$f" && \
     grep -qE '\bNOW\(\)|CURRENT_DATE\b' "$f"; then
    echo "footgun[sql-now]: $f uses NOW() or CURRENT_DATE in a file that also contains data mutations. Capture the DB clock once at startup via pipeline.getDbTimestamp(pool) and pass it as \$N to all mutation SQL (§47 §R3.5, Phase 7 B3)."
    sql_now=1
  fi
done < <(find scripts -maxdepth 1 -name '*.js' 2>/dev/null | sort || true)
[ $sql_now -eq 1 ] && fail=1

# ---------------------------------------------------------------------------
# 10. loop-query: pool.query/client.query inside a loop (N+1 query risk).
#     Uses AST-grep for accurate loop detection on scripts/*.js pipeline files.
#     Exempt: scripts/amnesty.json rules['loop-query'].permanent + temporary
# ---------------------------------------------------------------------------
loop_query=0
while IFS= read -r filepath; do
  [ -z "$filepath" ] && continue
  is_amnestied "$filepath" "$amnesty_loop_query" && continue
  echo "footgun[loop-query]: $filepath has pool.query/client.query inside a for/forEach/.map loop (N+1 queries — O(rows) round-trips to PostgreSQL). Refactor to UNNEST-based batch INSERT/UPDATE outside the loop (§47 §7.6, Phase 7 B1). Add to scripts/amnesty.json only if the loop is bounded (config lookups ≤5 iterations, not row-level data)."
  loop_query=1
done < <(
  npx ast-grep scan --rule scripts/ast-grep-rules/loop-query.yml scripts/ 2>/dev/null \
  | grep '  --> scripts/' \
  | sed 's/.*--> \(scripts\/[^:]*\):.*/\1/' \
  | sort -u \
  || true
)
[ $loop_query -eq 1 ] && fail=1

# ---------------------------------------------------------------------------
# 11. unbounded-push-in-stream: .push() inside for-await without a batch-flush
#     guard (OOM risk). Informational only — does NOT set fail=1.
#     Exempt: scripts/amnesty.json rules['unbounded-push-in-stream'].permanent + temporary
# ---------------------------------------------------------------------------
while IFS= read -r filepath; do
  [ -z "$filepath" ] && continue
  is_amnestied "$filepath" "$amnesty_push_in_stream" && continue
  echo "footgun[unbounded-push-in-stream] (info): $filepath pushes into an array inside a for-await loop without a visible batch-flush guard. If the stream returns 100K+ rows, this array grows without bound and will OOM the process. Add: if (batch.length >= BATCH_SIZE) { await flush(batch); batch = []; } (§47 Phase 7 B4)."
done < <(
  npx ast-grep scan --rule scripts/ast-grep-rules/unbounded-push-in-stream.yml scripts/ 2>/dev/null \
  | grep '  --> scripts/' \
  | sed 's/.*--> \(scripts\/[^:]*\):.*/\1/' \
  | sort -u \
  || true
)

if [ $fail -ne 0 ]; then
  echo
  echo "❌ Footgun gate failed. See messages above. To suppress a single line, add \`// ast-grep-disable-next-line <rule-id>\` with a justification."
  exit 1
fi

echo "✅ Footgun gate clean (silent-catch-fallback, env-default-in-lib, comment-rot, silent-row-drop, pool-boundary, direct-advisory-lock, bare-mutation, multi-transaction, sql-now, loop-query, unbounded-push-in-stream)"
exit 0
