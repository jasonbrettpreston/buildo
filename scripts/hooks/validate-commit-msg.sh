#!/usr/bin/env bash
# Enforces conventional commit format with spec traceability:
#   type(NN_spec_name): description
# Allowed types: feat, fix, refactor, test, docs, chore
# Spec ID must be NN_ or NNa_ prefix (e.g., 00_engineering_standards, 08b_classification)
# Merge commits, revert commits, and version bumps are exempt.

MSG_FILE="$1"

# Extract the first non-empty, non-comment line (handles editor-opened commits)
MSG=$(grep -vE '^(#|$)' "$MSG_FILE" | head -1)

# Allow merge commits and revert commits
if echo "$MSG" | grep -qE '^(Merge|Revert) '; then
  exit 0
fi

# Allow version bumps (e.g., 1.2.3 or v1.2.3)
if echo "$MSG" | grep -qE '^[vV]?[0-9]+\.[0-9]+\.[0-9]+'; then
  exit 0
fi

# Enforce: type(NN[a-z]_spec)!?: description
if echo "$MSG" | grep -qE '^(feat|fix|refactor|test|docs|chore)\([0-9]{2}[a-z]?_[a-z0-9_]+\)!?: .+'; then
  exit 0
fi

echo ""
echo "ERROR: Commit message does not match required format."
echo ""
echo "  Required: type(NN_spec): description"
echo "  Example:  feat(28_data_quality): add pipeline status polling"
echo "  Breaking: refactor(01_database)!: drop legacy table"
echo ""
echo "  Allowed types: feat, fix, refactor, test, docs, chore"
echo "  Spec ID must start with a 2-digit number (optionally followed by a letter): 00_, 08b_, 28_, etc."
echo ""
echo "  Your message: $MSG"
echo ""
exit 1
