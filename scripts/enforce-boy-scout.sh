#!/bin/bash
# scripts/enforce-boy-scout.sh
#
# Boy Scout Rule Enforcer — blocks PRs that touch grandfathered scripts
# without fixing their lint violations and removing them from the list.
#
# Logic: If a file appears in BOTH the PR diff AND .grandfather.txt,
# the developer must fix the warnings and remove the line from .grandfather.txt.
# If they touched the file but didn't remove it from the list, CI fails.

set -e

GRANDFATHER_FILE="scripts/.grandfather.txt"

if [ ! -f "$GRANDFATHER_FILE" ]; then
  echo "✅ No grandfather list found — all scripts are compliant."
  exit 0
fi

echo "🔍 Checking Boy Scout Rule..."

# Get files changed in this PR (compared to base branch)
git fetch origin main --quiet 2>/dev/null || true
CHANGED_FILES=$(git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~1)

VIOLATION_FOUND=0

for FILE in $CHANGED_FILES; do
  # Skip deleted files and the grandfather list itself
  [ ! -f "$FILE" ] && continue
  [ "$FILE" = "$GRANDFATHER_FILE" ] && continue

  # Check if this changed file is still in the grandfather list
  if grep -Fxq "$FILE" "$GRANDFATHER_FILE" 2>/dev/null; then
    echo "🚨 VIOLATION: You modified $FILE, which is a grandfathered legacy script."
    echo "   → Fix its lint warnings (npx eslint $FILE) and remove it from $GRANDFATHER_FILE"
    VIOLATION_FOUND=1
  fi
done

if [ $VIOLATION_FOUND -eq 1 ]; then
  echo ""
  echo "❌ PR BLOCKED: Leave the codebase cleaner than you found it."
  echo "   Run 'npx eslint scripts/' to see remaining violations."
  exit 1
else
  echo "✅ Boy Scout check passed."
  exit 0
fi
