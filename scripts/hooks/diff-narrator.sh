#!/usr/bin/env bash
# Wrapper for scripts/diff-narrator.js — gates on BUILDO_DIFF_NARRATOR=1
# (default OFF) and pipes the staged diff in. Wired to .husky/prepare-commit-msg.
#
# Why opt-in: the narrator calls Gemini on every commit, which costs ~1
# round-trip latency (~2-5s) and ~$0.0001/commit. Defaulting OFF lets devs
# enable it explicitly without surprising anyone.
#
# Enable for your local checkout:
#   echo 'export BUILDO_DIFF_NARRATOR=1' >> ~/.bashrc   # or your shell rc
#
# Args (passed by git via prepare-commit-msg):
#   $1 — commit message file path
#   $2 — commit source (message, template, merge, squash, commit)
#   $3 — commit hash (only on amend)
#
# Exits 0 on opt-out, success, AND any error (fails-open by design).
set -u

if [ "${BUILDO_DIFF_NARRATOR:-0}" != "1" ]; then
  exit 0
fi

# Skip on merge commits, squash commits, and message-from-template paths.
# These don't have a meaningful "what changed" diff to narrate.
COMMIT_SOURCE="${2:-}"
case "$COMMIT_SOURCE" in
  merge|squash|commit) exit 0 ;;
esac

MSG_FILE="${1:-}"
if [ -z "$MSG_FILE" ] || [ ! -f "$MSG_FILE" ]; then
  exit 0
fi

# Capture the staged diff and hand it to the Node script.
git diff --cached | node scripts/diff-narrator.js "$MSG_FILE" || true

exit 0
