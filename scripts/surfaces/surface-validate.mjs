#!/usr/bin/env node
// SPEC LINK: docs/specs/02-web-admin/127_surface_conversion_procedure.md (the gate table rows S-gen, S-golden, S-parity; dated notes 2026-11-04 and 2026-11-09),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 13 (one command), Rule 20 (binding),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-13 (this gate), FE-06, FE-29.
//
// MF-15 · McFrontend queue · lane G. The first surface gate, REPORT only. Read-only; writes nothing.
//   node scripts/surfaces/surface-validate.mjs [--check]   exit 0 clean, 1 any finding, 2 usage
// One finding per line on stderr: `SV-<ARM> <subject>: <problem>`, arms in the order GEN, GOLDEN, PARITY, BIND, STATUS.
// The check logic lives in scripts/surfaces/report-checks.mjs (one home, R-27). GEN spawns the committed generators' own --check; no logic is copied.
// Budget has no code: it waits for MF-08 and is printed as a stated waiting, never a pass (FE-04 stays OWED).
// The tree it reads is the one the script sits in, never the cwd.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, TARGETS, bindProblems, goldenProblems, manifestOf, parityProblems, statusProblems } from './report-checks.mjs';

const args = process.argv.slice(2);
const usage = args.length > 1 || (args.length === 1 && args[0] !== '--check');
if (usage) {
  console.error('usage: node scripts/surfaces/surface-validate.mjs [--check]');
  process.exitCode = 2;
}

const GENERATORS = ['scripts/surfaces/_schema/seed-report-v2.mjs', 'scripts/analysis/report-schema.mjs'];
const genProblems = () => GENERATORS.flatMap((rel) => {
  const name = path.basename(rel);
  if (!fs.existsSync(path.join(REPO, rel))) return [`SV-GEN ${name}: missing`];
  // A hung generator is a finding, not a hang: bounded time and output.
  const r = spawnSync(process.execPath, [path.join(REPO, rel), '--check'], { cwd: REPO, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (r.status === 0) return [];
  const lines = `${r.stderr ?? ''}`.split('\n').filter((l) => l.trim() !== '');
  return [`SV-GEN ${name}: ${r.status === null ? `no exit (${r.signal ?? r.error?.code ?? 'unknown'})` : `exit ${r.status}`}`, ...lines.map((l) => `SV-GEN ${name}: ${l}`)];
});

const arms = [
  ['S-gen', 'GEN', genProblems],
  ['S-golden', 'GOLDEN', goldenProblems],
  ['S-parity', 'PARITY', parityProblems],
  ['binding', 'BIND', bindProblems],
  ['closed-status', 'STATUS', statusProblems],
];
const findings = [];
const ok = [];
// An input of the wrong shape is a finding, never a crash: a bad descriptor must exit 1.
const guarded = (arm, run) => { try { return run(); } catch (e) { return [`SV-${arm} arm: input of the wrong shape: ${e.message}`]; } };
for (const [label, arm, run] of usage ? [] : arms) {
  const f = guarded(arm, run);
  findings.push(...f);
  if (f.length === 0) ok.push(label);
}

if (usage) {
  // exit code 2 already set
} else if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
const m = manifestOf();
const owed = Number.isInteger(m?.owed_states) && Number.isInteger(m?.owed_files) ? `; owed ${m.owed_states} states / ${m.owed_files} files` : '';
console.log(`surface-validate current; ${ok.map((l) => (l === 'S-golden' ? `${l} ok (${m.states.length} states x ${TARGETS.length}${owed})` : `${l} ok`)).join(' · ')} · budget WAITS MF-08`);
}
