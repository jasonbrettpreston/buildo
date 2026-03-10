#!/usr/bin/env bash
# Enforces conventional commit format with spec traceability:
#   type(NN_spec_name): description
# Allowed types: feat, fix, refactor, test, docs, chore
# Spec ID must be NN_ prefix (e.g., 00_engineering_standards, 28_data_quality)
# Merge commits and version bumps are exempt.

MSG_FILE="$1"
MSG=$(head -1 "$MSG_FILE")

# Allow merge commits
if echo "$MSG" | grep -qE '^Merge '; then
  exit 0
fi

# Enforce: type(NN_spec): description
if echo "$MSG" | grep -qE '^(feat|fix|refactor|test|docs|chore)\([0-9]{2}_[a-z_]+\): .+'; then
  exit 0
fi

echo ""
echo "ERROR: Commit message does not match required format."
echo ""
echo "  Required: type(NN_spec): description"
echo "  Example:  feat(28_data_quality): add pipeline status polling"
echo ""
echo "  Allowed types: feat, fix, refactor, test, docs, chore"
echo "  Spec ID must start with 2-digit number: 00_, 28_, 37_, etc."
echo ""
echo "  Your message: $MSG"
echo ""
exit 1
