// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (generated Target Files, WF2 2026-09-29); 122_pipeline_step_optimization.md §4.1, §6
//
// The node half of the step-edit PreToolUse hook (brief gtf-14; Amendment 4 / D5 of
// `.cursor/wf2_generated_target_files_active_task.md`). It is wired in `.claude/settings.json` as
// `PreToolUse` / matcher `Read|Edit|Write` / command `bash scripts/hooks/step-registry-context.sh` /
// timeout 10 — the `.sh` prefilter forwards ONLY a candidate path here, so this module is spawned
// once per touch of a step file and renders that step's registry entry.
//
// It INFORMS, it never decides: the emitted JSON carries exactly
// `hookSpecificOutput.additionalContext` and NEVER a `permissionDecision`, so a bug here can never
// block or allow a read/edit. It also has no `process.exit()` — the whole main body swallows every
// error and exits 0 with no output, and a per-session marker keeps the SECOND touch of one step in
// one session down to a single line pointing back at `npm run step:registry`.
//
// The entry it renders is not re-derived: it is `renderStepEntry` from
// `scripts/analysis/gates/step-registry.mjs` (contract §B), the one derivation the generator and
// `npm run step:registry` also read, so the hook can never disagree with the registry about what a
// step owns.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadRegistryInputs, registryRows, renderStepEntry, resolveStep } from '../analysis/gates/step-registry.mjs';

/** One component of the marker dir: everything outside `[A-Za-z0-9_-]` becomes `_`. */
const safeSegment = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * The step-edit PreToolUse hook's whole response for one raw stdin payload.
 *
 * Parses the stdin JSON, takes `tool_input.file_path`, and resolves it to a registry slug through
 * `resolveStep` (which already normalises backslashes and makes an absolute path repo-relative via
 * `path.relative(inputs.root, …)`). Anything that is not a step — a parse failure, a non-string or
 * empty path, an unresolved path — is `null`, i.e. the hook says nothing.
 *
 * The FIRST touch of a slug in one session returns the domain banner (read every row below: touched
 * Y/N, behaviour impact, registration, owner spec updated in the same commit) followed by
 * `renderStepEntry(row, inputs)`; it also drops a marker file. Every later touch in the SAME session
 * returns one short line pointing back at `npm run step:registry`, because re-rendering the table the
 * session was already given only buries the tool call in noise. The session bucket is the session id
 * with everything outside `[A-Za-z0-9_-]` masked, under `<tmpBase>/buildo-step-registry/`, so two
 * sessions can never mark each other as seen.
 *
 * @param {string} stdinText the raw PreToolUse payload
 * @param {{inputs: object, tmpBase: string}} ctx `inputs` = `loadRegistryInputs()`, `tmpBase` = the marker root
 * @returns {string|null} the JSON to print, or `null` when there is nothing to say
 */
export function hookResponse(stdinText, { inputs, tmpBase }) {
  let parsed;
  try {
    parsed = JSON.parse(stdinText);
  } catch {
    return null;
  }

  const filePath = parsed && parsed.tool_input && parsed.tool_input.file_path;
  if (typeof filePath !== 'string' || filePath.length === 0) return null;

  const slug = resolveStep(filePath, inputs);
  if (!slug) return null;

  const row = registryRows(inputs).find((r) => r.slug === slug);
  if (!row) return null;

  const sessionId = parsed && typeof parsed.session_id === 'string' && parsed.session_id.length > 0 ? parsed.session_id : null;
  const dir = path.join(tmpBase, 'buildo-step-registry', sessionId ? safeSegment(sessionId) : 'no-session');
  const marker = path.join(dir, slug);

  let alreadyShown = false;
  try {
    alreadyShown = fs.existsSync(marker);
  } catch {
    alreadyShown = false;
  }

  let context;
  if (alreadyShown) {
    context = `step-registry: \`${slug}\` — its registry was already shown this session; re-run npm run step:registry -- ${slug}`;
  } else {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(marker, '');
    } catch {
      // A marker we cannot write only costs a duplicate render next touch — never the tool call.
    }
    context =
      `step-registry: you are about to read/edit step \`${slug}\`. Before changing it, READ every row below ` +
      `(touched Y/N, behaviour impact, registration, owner spec updated in the same commit):\n` +
      renderStepEntry(row, inputs);
  }

  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } });
}

// CLI main guard: run only when executed directly (never on import by a suite).
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const stdinText = fs.readFileSync(0, 'utf8');
    // TEST-ONLY override: redirects the per-session markers without touching the real tmp dir.
    const tmpBase = process.env.BUILDO_STEP_REGISTRY_TMP || os.tmpdir();
    const inputs = loadRegistryInputs();
    const response = hookResponse(stdinText, { inputs, tmpBase });
    if (response) process.stdout.write(response);
  } catch {
    // A hook bug must never break a read/edit: swallow everything, print nothing, exit 0.
  }
}
