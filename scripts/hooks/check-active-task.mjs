#!/usr/bin/env node
/**
 * GOD MODE Gate — PreToolUse hook for Edit and Write tools.
 *
 * Blocks writes to src/ and scripts/ unless .cursor/active_task.md
 * status is "Implementation" (i.e. user has said "Yes" to the plan).
 *
 * Allowed without a task: docs/, migrations/, CLAUDE.md, active_task.md
 * itself, and any other non-implementation path. Planning artifacts can
 * be written at any time — only code files are gated.
 *
 * Hook protocol: receives tool_input as JSON on stdin.
 * Outputs JSON decision to stdout. Exit 0 always (decision is in JSON).
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, relative, sep } from 'path';

// Read stdin (Claude Code pipes tool_input JSON here)
const raw = await new Promise(res => {
  let buf = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { buf += c; });
  process.stdin.on('end', () => res(buf));
  process.stdin.on('error', () => res(''));
});

let input = {};
try { input = JSON.parse(raw); } catch { /* allow on parse error — hook bug must not block work */ }

const filePath = String(input?.tool_input?.file_path ?? '');
if (!filePath) process.exit(0); // safety valve: no path → allow

const cwd = process.cwd();
const rel = relative(cwd, resolve(cwd, filePath));

// Only gate code files in implementation directories.
// Markdown, JSON, YAML, and other config files are always allowed — they are
// planning/doc artifacts. Only .js/.ts/.tsx/.mjs/.cjs/.jsx source files are gated.
const CODE_EXTENSIONS = ['.js', '.ts', '.tsx', '.mjs', '.cjs', '.jsx'];
const isCodeFile = CODE_EXTENSIONS.some(ext => rel.endsWith(ext));
const isInImplementationDir =
  rel.startsWith('src' + sep) ||
  rel.startsWith('scripts' + sep);
const isGated = isCodeFile && isInImplementationDir;

if (!isGated) process.exit(0);

// Check active_task.md
const taskPath = resolve(cwd, '.cursor/active_task.md');

const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
};

if (!existsSync(taskPath)) {
  deny(
    '[GOD MODE] No .cursor/active_task.md found.\n' +
    'Create one first:  npm run task -- --wf=N --name="Task Name"\n' +
    'Then present the plan and get user authorization before writing code.'
  );
}

const content = readFileSync(taskPath, 'utf-8');

if (!content.includes('**Status:** Implementation')) {
  const match = content.match(/\*\*Status:\*\*\s*(.+)/);
  const status = match ? match[1].trim() : 'unknown';
  deny(
    `[GOD MODE] .cursor/active_task.md Status is "${status}" — not yet authorized.\n` +
    'Steps: present the plan → "PLAN LOCKED. Authorize?" → user says "Yes" → ' +
    'update Status to Implementation in active_task.md → then write code.'
  );
}

// Status is Implementation — allow
process.exit(0);
