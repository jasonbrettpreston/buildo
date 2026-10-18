#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EC (the R-DJ (2) budget, registered
//            and observed); R-DJ; R-CQ (host); R-EB (b) (pinned tooling variables)
//
// PRE-COMMIT BUDGET. R-DJ (2) records two budgets for `.husky/pre-commit`'s file-only stages: a
// docs-only commit and a registry-input commit. They are the pinned tooling variables
// `tooling_precommit_budget_docs_only_s` and `tooling_precommit_budget_registry_s` (R-EB (b)).
//
//   --measure  times each file-only stage of the hook, ONE COMMAND AT A TIME on this host (never a
//              whole-hook run: lint-staged can rewrite files, and `vitest related` / gate J2 depend on
//              what is staged). Writes docs/reports/generated/precommit-budget.json:
//              {measured_at, host, hook_sha256, stages[], docs_only_s, registry_s}.
//              docs_only_s = every stage, with `step-validate --staged --fast` on an empty index;
//              registry_s  = the same, with that stage timed as the whole-registry selection
//              (`step-validate --all --fast`, what a registry-input commit selects, R-DJ (1)).
//   --check    file-only (no timing, no spawn): RED when the evidence is missing or unparsable, when its
//              hook_sha256 differs from the live hook (re-measure owed), when a total exceeds its
//              variable, or when a variable is unpinned. Timing never fails a developer's commit, so a
//              loaded machine cannot flake it; the hook TEXT is what is proven. Fast invariant #52.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gateVariable } from './gates/variables.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

export const HOOK_REL_PATH = '.husky/pre-commit';
export const EVIDENCE_REL_PATH = 'docs/reports/generated/precommit-budget.json';
export const BUDGET_VARIABLES = Object.freeze({
  docs_only_s: 'tooling_precommit_budget_docs_only_s',
  registry_s: 'tooling_precommit_budget_registry_s',
});
/** The staged-dependent stages that are not file-only timings of the hook text. */
const NOT_TIMED = [/^npx lint-staged\b/, /^RELATED_FILES=/, /^STAGED_LIB=/, /^if \[/];
const STAGED_STEP_VALIDATE = 'node scripts/analysis/step-validate.mjs --staged --fast';
const WHOLE_REGISTRY_STEP_VALIDATE = 'node scripts/analysis/step-validate.mjs --all --fast';

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * The hook's file-only stage commands, in order. PURE over the hook text: every `&&`-chained command
 * line before the staged-dependent tail (lint-staged, `vitest related`, gate J2).
 * @param {string} hookText
 * @returns {string[]}
 */
export function hookStages(hookText) {
  const out = [];
  for (const raw of String(hookText).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^RELATED_FILES=/.test(line)) break; // the staged-dependent tail starts here
    const cmd = line.replace(/\s*&&\s*\\?$/, '').replace(/\s*\\$/, '').trim();
    if (!/^(node|npx|npm|bash) /.test(cmd)) continue;
    if (NOT_TIMED.some((re) => re.test(cmd))) continue;
    out.push(cmd);
  }
  return out;
}

/**
 * The budget verdict. PURE.
 * @param {{evidence: object|null, hookText: string, budgets: Record<string, number|Error>}} input
 * @returns {{pass: boolean, problems: string[]}}
 */
export function budgetDecision({ evidence, hookText, budgets }) {
  const problems = [];
  for (const [field, name] of Object.entries(BUDGET_VARIABLES)) {
    if (budgets[field] instanceof Error) problems.push(`${name}: ${budgets[field].message}`);
  }
  if (!evidence || typeof evidence !== 'object') {
    problems.push(`${EVIDENCE_REL_PATH} is missing or unparsable — run \`node scripts/analysis/precommit-budget.mjs --measure\``);
    return { pass: false, problems };
  }
  if (evidence.hook_sha256 !== sha256(hookText)) {
    problems.push(`${EVIDENCE_REL_PATH} was measured against another ${HOOK_REL_PATH} (hook_sha256 ${String(evidence.hook_sha256).slice(0, 12)} vs live ${sha256(hookText).slice(0, 12)}) — re-measure owed`);
  }
  for (const field of Object.keys(BUDGET_VARIABLES)) {
    const got = evidence[field];
    const cap = budgets[field];
    if (typeof got !== 'number' || !Number.isFinite(got)) problems.push(`${EVIDENCE_REL_PATH} ${field} is not a number`);
    else if (typeof cap === 'number' && got > cap) problems.push(`${field} ${got} s > budget ${cap} s (${BUDGET_VARIABLES[field]})`);
  }
  return { pass: problems.length === 0, problems };
}

function readBudgets() {
  const out = {};
  for (const [field, name] of Object.entries(BUDGET_VARIABLES)) {
    try {
      out[field] = gateVariable(name);
    } catch (e) {
      out[field] = e instanceof Error ? e : new Error(String(e));
    }
  }
  return out;
}

/** Fast invariant #52, file-only. DISK. */
export function checkPrecommitBudget(repoRoot = REPO_ROOT) {
  const hookText = fs.readFileSync(path.join(repoRoot, HOOK_REL_PATH), 'utf8');
  let evidence = null;
  try {
    evidence = JSON.parse(fs.readFileSync(path.join(repoRoot, EVIDENCE_REL_PATH), 'utf8'));
  } catch {
    evidence = null;
  }
  const budgets = readBudgets();
  const d = budgetDecision({ evidence, hookText, budgets });
  const detail = d.pass
    ? `PRECOMMIT-BUDGET (R-EC): docs-only ${evidence.docs_only_s} s <= ${budgets.docs_only_s} s; registry-input ${evidence.registry_s} s <= ${budgets.registry_s} s; measured ${evidence.measured_at} on ${evidence.host}, hook sha matches`
    : `PRECOMMIT-BUDGET (R-EC): RED [${d.problems.join('; ')}]`;
  return { pass: d.pass, problems: d.problems, detail };
}

function timeCommand(cmd, repoRoot) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync('sh', ['-c', cmd], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: gateVariable('tooling_spawn_max_buffer_mb') * 1024 * 1024 });
  const s = Number(process.hrtime.bigint() - t0) / 1e9;
  if (r.status !== 0) throw new Error(`stage failed (exit ${r.status}), cannot time a red hook: ${cmd}\n${(r.stderr || r.stdout || '').slice(0, 2000)}`);
  return Math.round(s * 100) / 100;
}

/** Time every stage and write the evidence. DISK + spawn. Requires an empty index. */
export function measure(repoRoot = REPO_ROOT) {
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();
  if (staged) throw new Error('--measure needs an empty index (the docs-only class times step-validate --staged with nothing staged)');
  const hookText = fs.readFileSync(path.join(repoRoot, HOOK_REL_PATH), 'utf8');
  const stages = [];
  for (const command of hookStages(hookText)) {
    const s = timeCommand(command, repoRoot);
    stages.push({ command, s });
    process.stdout.write(`  ${s.toFixed(2).padStart(6)} s  ${command}\n`);
  }
  const registryStage = timeCommand(WHOLE_REGISTRY_STEP_VALIDATE, repoRoot);
  const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  const docsOnly = sum(stages.map((x) => x.s));
  const stagedStage = stages.find((x) => x.command === STAGED_STEP_VALIDATE);
  const registry = sum([docsOnly, registryStage, stagedStage ? -stagedStage.s : 0]);
  const doc = {
    $comment: 'R-EC (Spec 124): per-stage timings of .husky/pre-commit file-only stages, one command at a time (never a whole-hook run). registry_s replaces the staged step-validate stage with the whole-registry selection. Checked file-only by fast invariant #52 against tooling_precommit_budget_*_s.',
    measured_at: new Date().toISOString(),
    host: `${os.hostname()} (${os.platform()} ${os.arch()}, ${os.cpus().length} cpu)`,
    hook_sha256: sha256(hookText),
    stages,
    registry_stage: { command: WHOLE_REGISTRY_STEP_VALIDATE, s: registryStage },
    docs_only_s: docsOnly,
    registry_s: registry,
  };
  fs.mkdirSync(path.dirname(path.join(repoRoot, EVIDENCE_REL_PATH)), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, EVIDENCE_REL_PATH), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

/** In-memory fixtures, both directions. Throws on the first failure. */
export function selfTest() {
  const fail = (m) => { throw new Error(`precommit-budget self-test FAILED: ${m}`); };
  const hook = ['#!/bin/sh', '# comment', 'bash scripts/hooks/a.sh && \\', '  node x.mjs --check && \\', '  npx lint-staged --allow-empty && \\', '  npm run lint && \\', '  RELATED_FILES="$(git diff)" && \\', '  npx vitest related'].join('\n');
  const st = hookStages(hook);
  if (JSON.stringify(st) !== JSON.stringify(['bash scripts/hooks/a.sh', 'node x.mjs --check', 'npm run lint'])) fail(`hookStages ${JSON.stringify(st)}`);
  const budgets = { docs_only_s: 25.3, registry_s: 27.5 };
  const good = { hook_sha256: sha256(hook), docs_only_s: 20, registry_s: 22 };
  if (!budgetDecision({ evidence: good, hookText: hook, budgets }).pass) fail('matching evidence under budget must be GREEN');
  if (budgetDecision({ evidence: null, hookText: hook, budgets }).pass) fail('missing evidence must be RED');
  if (budgetDecision({ evidence: { ...good, hook_sha256: 'x' }, hookText: hook, budgets }).pass) fail('a hook sha mismatch must be RED');
  if (budgetDecision({ evidence: { ...good, docs_only_s: 30 }, hookText: hook, budgets }).pass) fail('over budget must be RED');
  if (budgetDecision({ evidence: good, hookText: hook, budgets: { ...budgets, registry_s: new Error('unpinned') } }).pass) fail('an unpinned variable must be RED');
}

function main(argv) {
  if (argv.includes('--self-test')) { selfTest(); console.log('[precommit-budget] self-test passed'); return; }
  if (argv.includes('--measure')) {
    const doc = measure();
    console.log(`[precommit-budget] docs-only ${doc.docs_only_s} s; registry-input ${doc.registry_s} s -> ${EVIDENCE_REL_PATH}`);
  }
  const r = checkPrecommitBudget();
  console.log(r.detail);
  if (!r.pass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
