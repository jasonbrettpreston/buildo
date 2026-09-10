#!/usr/bin/env node
// ---------------------------------------------------------------------------
// RETIRED — one-shot historical codemod. DO NOT RUN.
//
// Ran exactly once, at WF2 "Admin Tunable Coverage" commit 1
// (.cursor/wf2_admin_tunable_coverage_active_task.md, 2026-09-03), to
// bootstrap a per-key `admin` field onto every scripts/seeds/
// logic_variables.json entry that lacked one. Retired by TWO independent,
// irreversible changes landed since:
//   1. Commit 3 of that same plan made GlobalConfigCard.tsx's `GROUPS`
//      GENERATED (`export const GROUPS = GENERATED_GROUPS` from
//      scripts/generate-logic-variable-groups.mjs), not a hand-authored
//      literal array — this codemod's own GROUPS-parsing regex
//      (`export const GROUPS[\s\S]*?\n\];`) already cannot find that shape
//      and would throw "GROUPS block not found" on any re-run.
//   2. WF2 "ADMIN-1 ratchet to zero" batch 6 (2026-09-09) RETIRED
//      `"unclassified"` from the closed `hidden` enum
//      (derived|internal|deprecated|migration-only) — this codemod's line 2
//      fallback (`entry.admin = { hidden: 'unclassified' }`) writes a value
//      that is now a structural error (src/tests/logic-var-admin-
//      declarations.logic.test.ts's closed-enum check reddens on it).
//
// F-5 (WF2 ADMIN-1 ratchet, output panel): rather than "fix" a codemod that
// re-derives an already-superseded array shape (redundant with
// scripts/generate-logic-variable-groups.mjs, which is the actual live
// generator today), this file is left in place as a HISTORICAL record —
// its idempotent existing-field short-circuit already makes a re-run of
// the real (unreachable) codemod body a no-op — and hard-stops instead.
// Any future "reclassify a fresh batch of unclassified keys" need is
// scripts/generate-logic-variable-groups.mjs's job (it already cross-
// validates `admin.group` against `GROUP_ORDER` both directions); a NEW
// codemod for a NEW purpose should not resurrect this file's name or shape.
//
// Usage: none — retired. (Historically: node scripts/codemods/seed-admin-declarations.mjs)
// ---------------------------------------------------------------------------
throw new Error(
  'scripts/codemods/seed-admin-declarations.mjs is RETIRED (see header) — ' +
    'it ran once at WF2 "Admin Tunable Coverage" commit 1 and its GROUPS-parsing ' +
    'assumption + "unclassified" fallback are both stale. Do not run it.',
);

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SEED_PATH = path.join(ROOT, 'scripts', 'seeds', 'logic_variables.json');
const CARD_PATH = path.join(
  ROOT,
  'src',
  'features',
  'admin-controls',
  'components',
  'GlobalConfigCard.tsx',
);

// ── 1. Parse the CURRENT GROUPS array (label → keys) directly out of the ────
//    still-hand-authored GlobalConfigCard.tsx (commit 3 makes GROUPS generated;
//    this codemod runs at commit 1, before that, so the source of truth here
//    IS the literal array).
const cardSrc = fs.readFileSync(CARD_PATH, 'utf8');
const groupsBlock = /export const GROUPS[\s\S]*?\n\];/.exec(cardSrc);
if (!groupsBlock) {
  throw new Error('GROUPS block not found in GlobalConfigCard.tsx — codemod cannot proceed');
}
const groupRe = /label:\s*'([^']+)',[\s\S]*?keys:\s*\[([\s\S]*?)\n\s*\],/g;
const keyToGroup = new Map();
let gm;
while ((gm = groupRe.exec(groupsBlock[0])) !== null) {
  const label = gm[1];
  const keys = [...gm[2].matchAll(/'([a-z][a-z0-9_]*)'/g)].map((m) => m[1]);
  for (const key of keys) keyToGroup.set(key, label);
}
if (keyToGroup.size === 0) {
  throw new Error('parsed zero GROUPS keys out of GlobalConfigCard.tsx — vacuous parse, refusing to proceed');
}
// income_premium_tiers is JSONB/migration-seeded, never in the numeric seed file.
keyToGroup.delete('income_premium_tiers');

// ── 2. Load the seed JSON, preserving raw text to detect CRLF vs LF ─────────
const raw = fs.readFileSync(SEED_PATH, 'utf8');
const usesCRLF = raw.includes('\r\n');
const seed = JSON.parse(raw);

let groupCount = 0;
let hiddenCount = 0;
let alreadyDeclared = 0;

for (const [key, entry] of Object.entries(seed)) {
  if (entry.admin !== undefined) {
    alreadyDeclared++;
    continue; // idempotent re-run — never overwrite an existing declaration
  }
  const group = keyToGroup.get(key);
  if (group) {
    entry.admin = { group };
    groupCount++;
  } else {
    entry.admin = { hidden: 'unclassified' };
    hiddenCount++;
  }
}

// ── 3. Serialize, preserving field/key order and line-ending style ──────────
let out = JSON.stringify(seed, null, 2) + '\n';
if (usesCRLF) out = out.replace(/\n/g, '\r\n');

fs.writeFileSync(SEED_PATH, out);

console.log(`✔ scripts/seeds/logic_variables.json — admin field declared`);
console.log(`  grouped: ${groupCount}  hidden(unclassified): ${hiddenCount}  already-declared(skipped): ${alreadyDeclared}`);
console.log(`  total keys: ${Object.keys(seed).length}`);
