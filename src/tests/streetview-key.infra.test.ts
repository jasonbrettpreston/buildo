// SPEC LINK: docs/specs/00-architecture/06_permits_rest_api.md (permit detail page; dated note 2026-11-09)
// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md (public env var names; dated note 2026-11-09)
//
// MB-87 lock: no Street View photo and no browser Maps key in shipped code.
// Operator ruling 2026-11-09 (public permit-page photo, verbatim): "Drop it (Recommended)" = remove PropertyPhoto
// from /permits/[id], delete the browser key, no public Street View route. Record:
// ~/Buildo-scratch/mcfrontend/phase1/open-questions.md, "MaxBLD report quota and Street View photos".
// Scope: the public permit page. Q-9 and Q-MF8 still stand for the MaxBLD report photo (MF-39).
//
// Walks every non-test file under src/, scripts/ and mobile/ (node_modules, dot entries, test files and
// test directories skipped by rule) and asserts:
//   (a) no file holds the Street View Static API URL path. URL only: the words "Street View" appear
//       legitimately in schemas and docs. STREETVIEW_URL_ALLOW is EMPTY.
//   (b) no NEXT_PUBLIC_*MAPS* env name (a browser Maps key is public by construction).
//   (c) no Google API key string (AIza + 20 or more key characters). One exact-path whitelist:
//       scripts/lib/exec-ledger.js holds the secret-redactor regex that names the prefix.
//   (d) the scanner is live: a planted tree holding all three forbidden strings (built at runtime, so this
//       file never holds them) is reported in full, and every whitelisted path still exists.
//
// How to lift: MF-39's later server-side fetch row (one Street View photo inside the signed-in, counted
// report) adds its single server-side helper file to STREETVIEW_URL_ALLOW in the same commit, citing its own
// operator ruling. (b) and (c) are not lifted by that row: the photo is fetched server-side, never with a
// browser key.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const ROOTS = ['src', 'scripts', 'mobile'];

/** Files allowed to hold the Street View URL path. Empty by the 2026-11-09 ruling; see the header. */
const STREETVIEW_URL_ALLOW = new Set<string>([]);
/** Files allowed to hold an AIza-shaped string: the secret redactor (a defence, not a key). */
const API_KEY_ALLOW = new Set<string>(['scripts/lib/exec-ledger.js']);

const SKIP_DIRS = new Set(['node_modules', 'tests', '__tests__', '__mocks__']);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|shp|shx|dbf|prj|cpg|woff2?|ttf|otf|mp4|mov)$/i;

const RULES = [
  { id: 'streetview_url', re: /maps\/api\/streetview/i, allow: STREETVIEW_URL_ALLOW },
  { id: 'public_maps_env', re: /NEXT_PUBLIC_[A-Z_]*MAPS/, allow: new Set<string>() },
  { id: 'google_api_key', re: /AIza[0-9A-Za-z_-]{20,}/, allow: API_KEY_ALLOW },
] as const;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.isSymbolicLink()) return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(p);
    return e.isFile() && !TEST_FILE.test(e.name) && !BINARY.test(e.name) ? [p] : [];
  });
}

/** Every rule hit under `root`, as `rule_id path:line`; paths are relative to `root`, with forward slashes. */
function scan(root: string): string[] {
  const hits: string[] = [];
  for (const top of ROOTS) {
    for (const f of walk(path.join(root, top))) {
      const rel = path.relative(root, f).split(path.sep).join('/');
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      for (const rule of RULES) {
        if (rule.allow.has(rel)) continue;
        lines.forEach((line, i) => {
          if (rule.re.test(line)) hits.push(`${rule.id} ${rel}:${i + 1}`);
        });
      }
    }
  }
  return hits;
}

describe('MB-87 Street View / browser Maps key lock (operator 2026-11-09)', () => {
  it('(a)(b)(c) no Street View URL, NEXT_PUBLIC_*MAPS name or Google API key string in non-test src/, scripts/, mobile/', () => {
    expect(scan(REPO_ROOT)).toEqual([]);
  });

  it('the Street View URL allow-list is empty; every whitelisted path exists', () => {
    expect([...STREETVIEW_URL_ALLOW]).toEqual([]);
    for (const rel of API_KEY_ALLOW) expect(fs.existsSync(path.join(REPO_ROOT, rel)), rel).toBe(true);
  });

  it('(d) planted violations are all reported (the scanner is live)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb87-lock-'));
    try {
      const url = 'https://maps.googleapis.com/maps/api/' + 'street' + 'view?size=600x400';
      const envName = 'NEXT_PUBLIC_' + 'GOOGLE_' + 'MAPS_KEY';
      const key = 'AI' + 'za' + 'X'.repeat(35);
      fs.mkdirSync(path.join(tmp, 'src/components'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'mobile/src'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'src/components/Photo.tsx'), `const u = \`${url}\`;\n`);
      fs.writeFileSync(path.join(tmp, 'scripts/env.js'), `process.env.${envName};\n`);
      fs.writeFileSync(path.join(tmp, 'mobile/src/key.ts'), `export const k = '${key}';\n`);
      // A test file holding all three is skipped by rule.
      fs.writeFileSync(path.join(tmp, 'src/components/Photo.test.tsx'), `${url}\n${envName}\n${key}\n`);
      expect(scan(tmp).sort()).toEqual([
        'google_api_key mobile/src/key.ts:1',
        'public_maps_env scripts/env.js:1',
        'streetview_url src/components/Photo.tsx:1',
      ]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
