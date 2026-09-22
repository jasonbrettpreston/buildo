'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.2, §C.5
 *
 * Shared child-process env scrubbing. `tasks/lessons.md` (2026-09-21): "a
 * test that shells out to git inherits the SESSION's GIT_* env" — the same
 * leak applies to the engine's own git introspection calls, `grep_files`
 * (git grep), `run_bash_command` and the pre/post worktree capture. Every
 * git-shelling call in this engine goes through `scrubbedEnv()`.
 */

function scrubbedEnv(extraDenyPrefixes) {
  const denyPrefixes = ['GIT_', ...(Array.isArray(extraDenyPrefixes) ? extraDenyPrefixes : [])];
  const out = {};
  for (const key of Object.keys(process.env)) {
    if (denyPrefixes.some((prefix) => key.startsWith(prefix))) {
      continue;
    }
    out[key] = process.env[key];
  }
  return out;
}

module.exports = { scrubbedEnv };
