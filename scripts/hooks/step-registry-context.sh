#!/usr/bin/env bash
# SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (generated Target Files, WF2 2026-09-29); 122_pipeline_step_optimization.md §4.1, §6
#
# The cheap prefilter of the step-edit PreToolUse hook (brief gtf-14; Amendment 4 / D5 of
# `.cursor/wf2_generated_target_files_active_task.md`). Wired in `.claude/settings.json` as
# `PreToolUse` / matcher `Read|Edit|Write` / command `bash scripts/hooks/step-registry-context.sh` /
# timeout 10, so it runs on EVERY read and edit — the overwhelming majority of which have nothing to
# do with a step. Spawning node on every one of them would tax the whole session, so this half reads
# the raw stdin once and only hands a candidate path to `step-registry-context.mjs`.
#
# Why a bash `case` and not node: measured by the panel, a `case` costs ~100 ms versus ~140 ms for a
# node process per call (measured 2026-09-30) — and with this prefilter only a candidate `file_path`
# pays for node at all, so the overwhelming majority of reads and edits cost the `case` alone.
#
# The match is on the `file_path` VALUE only (output-panel F5): a path is the only thing these
# patterns are about, so content in `old_string`/`new_string`/`content` that merely mentions
# `scripts/` never spawns node. `file_path` is still JSON-escaped here, so a Windows path carries
# `\\` — the third alternative keeps matching it (its `script\\...`/`src\\tests\\steps` text must
# still be recognised so the absolute Windows path the hook receives can reach the node half).
#
# Node's stderr goes to /dev/null, so a missing/broken node can never leak an error into the session.

input="$(cat)"
re='"file_path"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)"'
[[ $input =~ $re ]] || exit 0
fp="${BASH_REMATCH[1]}"
case "$fp" in
  *scripts[/\\]*|*src[/\\]tests[/\\]steps*|*src[/\\][/\\]tests[/\\][/\\]steps*)
    cd "$(dirname "$0")/../.." 2>/dev/null || exit 0
    printf '%s' "$input" | node scripts/hooks/step-registry-context.mjs 2>/dev/null
    ;;
esac
exit 0
