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

/** Parse TOP-LEVEL Zod schema field names. Tracks brace depth to skip
 *  fields nested inside e.g. `notification_prefs: z.object({ ... })`. */
function parseSchemaFields(src) {
  const objMatch = /UserProfileSchema\s*=\s*z\.object\s*\(\s*\{/.exec(src);
  if (!objMatch) {
    throw new Error('Could not locate UserProfileSchema = z.object({...}) in schema file');
  }
  // Walk from the opening brace, tracking depth, capturing top-level
  // `<name>: z.` only when depth === 1 (the schema's own properties).
  const start = objMatch.index + objMatch[0].length;
  const fields = new Set();
  let depth = 1;
  let i = start;
  // Match name at the current position when depth === 1.
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    } else if (depth === 1 && /[a-z_]/i.test(ch)) {
      // Try to match `<name>: z.` starting here.
      const slice = src.slice(i, i + 80);
      // Allow `z\s*\.` so multi-line declarations like
      //   subscription_status: z
      //     .enum([...])
      // are captured.
      const m = /^([a-z_][a-z0-9_]*)\s*:\s*z\s*\./.exec(slice);
      if (m) {
        fields.add(m[1]);
        i += m[1].length;
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
  const nextHeading = rest.search(/\n##+\s/m);
  const sectionBody = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

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
