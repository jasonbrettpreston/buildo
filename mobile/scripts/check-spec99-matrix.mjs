#!/usr/bin/env node
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §8.6 + §9.13
//
// Schema-vs-Spec-99-§3.1 drift check (Spec 99 §8.6 mandate).
//
// Parses Zod object keys from `mobile/src/lib/userProfile.schema.ts` and the
// "Server-Authoritative Profile Fields" table column 1 from §3.1 of Spec 99.
// Asserts setEqual: every server profile field has exactly one §3.1 row, and
// every §3.1 row corresponds to a real schema field. A future server schema
// migration that adds a field without a §3.1 row will fail this check.
//
// Run: `node mobile/scripts/check-spec99-matrix.mjs` (manual / pre-commit
// hook in a future §9.13b followup).
//
// Exit codes:
//   0 — schema and §3.1 are in sync
//   1 — drift detected (with a diff printed to stderr)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const SCHEMA_FILE = path.join(REPO_ROOT, 'mobile/src/lib/userProfile.schema.ts');
const SPEC_FILE = path.join(REPO_ROOT, 'docs/specs/03-mobile/99_mobile_state_architecture.md');

/** Strip line comments, block comments, and string-literal contents from
 *  source so the brace-depth walker is not desynced by `{` / `}` chars
 *  inside strings, templates, or comments. Replaces stripped content with
 *  spaces of equal length so character indices stay stable for any caller
 *  walking by index. Per WF2 P2 review #5 + #9 (Gemini + DeepSeek
 *  consensus on parser fragility). */
function stripStringsAndComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  out = out.replace(/'([^'\\\n]|\\.)*'/g, (m) => `'${' '.repeat(m.length - 2)}'`);
  out = out.replace(/"([^"\\\n]|\\.)*"/g, (m) => `"${' '.repeat(m.length - 2)}"`);
  out = out.replace(/`([^`\\]|\\.)*`/g, (m) => `\`${' '.repeat(m.length - 2)}\``);
  return out;
}

/** Parse TOP-LEVEL Zod schema field names. Tracks brace depth on a
 *  comment/string-stripped clone to skip fields nested inside e.g.
 *  `notification_prefs: z.object({ ... })` AND to ignore commented-out
 *  fields like `// foo: z.string()`.
 *
 *  Per WF2 P2 review #9 (DeepSeek): bumped slice limit from 80 → 240
 *  chars and added a `slice-exhausted` warning so a long type signature
 *  (e.g., a wide `z.enum([...])`) cannot silently slip past the field-
 *  detector. The 240 figure covers the widest current field
 *  (`subscription_status` enum at ~120 chars) with comfortable headroom. */
function parseSchemaFields(src) {
  const safe = stripStringsAndComments(src);
  const objMatch = /UserProfileSchema\s*=\s*z\.object\s*\(\s*\{/.exec(safe);
  if (!objMatch) {
    throw new Error('Could not locate UserProfileSchema = z.object({...}) in schema file');
  }
  const start = objMatch.index + objMatch[0].length;
  const fields = new Set();
  let depth = 1;
  let i = start;
  const SLICE = 240;
  while (i < safe.length && depth > 0) {
    const ch = safe[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    } else if (depth === 1 && /[a-z_]/i.test(ch)) {
      // Try to match `<name>: z.` starting here. Run on `safe` so a
      // commented-out field doesn't register, and slice from `safe` so
      // string contents containing `:` or `.` cannot tease a false match.
      const slice = safe.slice(i, i + SLICE);
      const m = /^([a-z_][a-z0-9_]*)\s*:\s*z\s*\./.exec(slice);
      if (m) {
        fields.add(m[1]);
        i += m[1].length;
      } else if (slice.length === SLICE && /^[a-z_][a-z0-9_]*\s*:/i.test(slice)) {
        // Slice exhausted but the name+colon prefix is present and we
        // didn't match `z.`. Either a non-zod field type or the value
        // text exceeds 240 chars. Warn so a future schema regression
        // surfaces as a noisy script run, not silent drift.
        const nameMatch = /^([a-z_][a-z0-9_]*)/i.exec(slice);
        console.error(
          `[check-spec99-matrix] WARN slice exhausted at field "${nameMatch?.[1] ?? '?'}" — bump SLICE in parseSchemaFields if this is a new long-type field.`,
        );
      }
    }
    i++;
  }
  return fields;
}

/** Parse all backtick-wrapped field names from column 1 of the §3.1 table. */
function parseSpecFields(src) {
  const sectionStart = src.indexOf('### 3.1 Server-Authoritative Profile Fields');
  if (sectionStart === -1) {
    throw new Error('Could not locate §3.1 Server-Authoritative Profile Fields heading');
  }
  const rest = src.slice(sectionStart);
  // Anchor on top-level `### N.N` boundaries only (per WF2 P2 review #10
  // DeepSeek): the prior `/\n##+\s/` truncated on ANY heading level ≥ 2,
  // so adding a `#### Migration notes` subheading inside §3.1 would silently
  // drop trailing rows.
  const HEADING_AFTER_31 = /\n###\s+(?:[0-4]\.\d|\d{2}\.\d)\s/m;
  const nextHeading = rest.slice(1).search(HEADING_AFTER_31);
  const sectionBody = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);

  const fields = new Set();
  // Split into table rows.
  for (const line of sectionBody.split('\n')) {
    if (!line.startsWith('|')) continue;
    // Skip header + separator rows.
    if (line.includes('---')) continue;
    if (line.includes('| Field |')) continue;
    // Column 1 is everything between the first and second pipe.
    const firstPipe = line.indexOf('|');
    const secondPipe = line.indexOf('|', firstPipe + 1);
    if (firstPipe === -1 || secondPipe === -1) continue;
    const col1 = line.slice(firstPipe + 1, secondPipe);
    // Capture all `name` literals (backtick-wrapped).
    const nameRe = /`([a-z_][a-z0-9_]*)`/g;
    let m;
    while ((m = nameRe.exec(col1)) !== null) {
      fields.add(m[1]);
    }
  }
  return fields;
}

function main() {
  const schemaSrc = fs.readFileSync(SCHEMA_FILE, 'utf-8');
  const specSrc = fs.readFileSync(SPEC_FILE, 'utf-8');

  const schemaFields = parseSchemaFields(schemaSrc);
  const specFields = parseSpecFields(specSrc);

  const inSchemaNotSpec = [...schemaFields].filter((f) => !specFields.has(f)).sort();
  const inSpecNotSchema = [...specFields].filter((f) => !schemaFields.has(f)).sort();

  if (inSchemaNotSpec.length === 0 && inSpecNotSchema.length === 0) {
    console.log(
      `[check-spec99-matrix] OK — ${schemaFields.size} fields in sync between Zod schema and §3.1`,
    );
    process.exit(0);
  }

  console.error('[check-spec99-matrix] DRIFT DETECTED:');
  if (inSchemaNotSpec.length > 0) {
    console.error(
      `\n  Fields in userProfile.schema.ts but MISSING from §3.1 (${inSchemaNotSpec.length}):`,
    );
    for (const f of inSchemaNotSpec) console.error(`    - ${f}`);
  }
  if (inSpecNotSchema.length > 0) {
    console.error(
      `\n  Fields in §3.1 but MISSING from schema (${inSpecNotSchema.length}) — likely renamed/removed:`,
    );
    for (const f of inSpecNotSchema) console.error(`    - ${f}`);
  }
  console.error(
    '\n  Fix: add a §3.1 row for each schema field, OR remove the stale §3.1 row, then re-run.',
  );
  process.exit(1);
}

main();
