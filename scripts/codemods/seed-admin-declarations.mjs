#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-shot codemod — declares a per-key `admin` field on every
// scripts/seeds/logic_variables.json entry.
//
// WF2 "Admin Tunable Coverage" (.cursor/wf2_admin_tunable_coverage_active_task.md)
// commit 1 — closes review_followups.md "WF3 cloud-parity FIX 3 remediation —
// admin GROUPS reverse-coverage gap (2026-09-03)": 302 of 438 seed keys are
// absent from GlobalConfigCard's GROUPS (invisible to operators) with no
// declared reason. This codemod does NOT decide admin-editability by hand —
// it declares the CURRENT, already-shipped truth:
//   - the 136 numeric keys GlobalConfigCard.tsx's GROUPS array ALREADY renders
//     get `admin: { group: "<label from that GROUPS entry>" }`
//   - every other key gets `admin: { hidden: "unclassified" }` — a transitional
//     marker, tracked by the ADMIN-1 programme-backlog item + a monotonic
//     ratchet test (commit 4), NOT asserted here as a final classification.
//
// Idempotent: re-running after commit 3 (GROUPS derived from generated JSON)
// would find `admin` already present on every key and is a no-op via the
// existing-field short-circuit below. Preserves key order and every existing
// field byte-for-byte; only appends `admin` to each entry. Preserves the
// source file's CRLF line endings.
//
// Usage: node scripts/codemods/seed-admin-declarations.mjs
// ---------------------------------------------------------------------------
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
