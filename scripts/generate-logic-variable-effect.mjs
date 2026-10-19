#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EO, R-DL
//
// Generates src/features/admin-controls/generated/logic-variable-effect.json: the admin badge for every declared
// logic variable the live step does not read (R-EO, operator Q6 y 2026-10-19). The derivation is
// scripts/analysis/gates/variable-effect.mjs; step-validate fast invariant #53 fails when this file is stale.
//
//   node scripts/generate-logic-variable-effect.mjs           (write)
//   node scripts/generate-logic-variable-effect.mjs --check   (drift lock, exit 1 on drift)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EFFECT_REL, loadVariableEffect, renderEffectFile } from './analysis/gates/variable-effect.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, EFFECT_REL);
const next = renderEffectFile(loadVariableEffect(ROOT));
const counts = Object.values(JSON.parse(next).entries).reduce((a, e) => ((a[e.badge] = (a[e.badge] || 0) + 1), a), {});

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== next) {
    console.error(`✗ ${EFFECT_REL} is stale — run node scripts/generate-logic-variable-effect.mjs`);
    process.exit(1);
  }
  console.log(`✔ ${EFFECT_REL} is up to date`);
} else {
  fs.writeFileSync(target, next);
  console.log(`✔ Generated ${EFFECT_REL}`);
}
console.log(`  ${JSON.stringify(counts)}`);
