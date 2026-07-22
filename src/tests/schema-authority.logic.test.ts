// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §7
//
// Schema-authority tripwire (P4 hardening WF2, H2 / GT#5): `scripts/migrate.js`
// is the ONLY schema authority — the Supabase CLI migration flow (`supabase db
// push` / `supabase migration new`) is forbidden. If it is ever used by habit,
// files materialize under supabase/migrations/ (config.toml has [db.migrations]
// enabled); this test then FAILS the husky pre-commit gauntlet, which runs the
// full `npm run test` (.husky/pre-commit) — so the test IS the pre-commit
// enforcement Spec 113 §7 mandates (Spec 05: test = strongest destination).
// `scripts/ai-env-check.mjs` carries the matching report-only visibility line.
//
// Recorded residuals (Security F3, Spec 113 §7): `git commit --no-verify`
// bypasses the gauntlet (caught at the next test run / pre-flight); a
// push-then-delete-the-files slip applies out-of-band DDL neither this test
// nor `migrate.js --verify` can see — inherent, accepted, documented in §7.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SUPA_MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

// Placeholder files that legitimately keep an (otherwise-empty) directory in
// version control are not migration files (Gemini/DeepSeek panel nit).
const PLACEHOLDERS = new Set(['.gitkeep']);

describe('schema authority — Spec 113 §7 (migrate.js is the ONLY schema authority)', () => {
  it('supabase/migrations/ is absent or holds no files — CLI-authored migrations are forbidden', () => {
    if (!fs.existsSync(SUPA_MIGRATIONS_DIR)) return; // absent = clean (current state)
    const offending = fs.readdirSync(SUPA_MIGRATIONS_DIR).filter((f) => !PLACEHOLDERS.has(f));
    expect(
      offending,
      `supabase/migrations/ holds ${offending.length} file(s) — someone used the Supabase CLI ` +
        `migration flow. scripts/migrate.js is the ONLY schema authority (Spec 113 §7): re-author ` +
        `the DDL as migrations/NNN_*.sql, apply via \`node scripts/migrate.js\`, and delete these files.`
    ).toEqual([]);
  });
});
