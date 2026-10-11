// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D6 (T-IND), §D2/§D5 (T-SHAPE)
//
// T-SHAPE — the CoA pure library holds the compute-shape invariants (Spec 129 §D2/§D5).
//
// `scripts/lib/coa-notices/parse-values.js` and `scripts/lib/coa-notices/manifest.js`
// are PURE CommonJS modules: no I/O, no wall clock, no module-level numeric tunable.
// These are the SAME invariants `scripts/ast-grep-rules/compute-shape.yml` enforces over
// `scripts/lib/compute/**`; this suite applies that rule file to the CoA library so a
// regression that reaches for `fs` or `Date.now()` fails at test time.
//
// ── WHY A WIDENED-SCOPE COPY OF THE RULE FILE ────────────────────────────────
// Verified empirically (2026-09-27, ast-grep `scan` win32-x64-msvc): ast-grep honours
// each rule's `files:` glob EVEN when explicit paths are passed on the command line — a
// path outside the glob is silently scanned to ZERO findings (status 0, empty stdout).
// Every rule in `compute-shape.yml` is declared `files: ['scripts/lib/compute/**/*.js',
// 'scripts/steps/_schema/fixtures/compute/**/*.js']`, so scanning
// `scripts/lib/coa-notices/**` through the REAL file yields a vacuous `[]` — a green
// that proves nothing (Spec 121 §12b.6: a scan that matches nothing proves nothing).
//
// To make the scan NON-VACUOUS for this corpus we build a temporary copy of the real
// rule file whose `files:` entries are EXTENDED (never narrowed) to also select
// `scripts/lib/coa-notices/**/*.js` and `src/tests/fixtures/coa-notices/**/*.js`. The
// rule BODIES are byte-identical to the committed file; only the glob scope widens.
//
// ── THE ONE DESELECTED RULE, AND WHY ─────────────────────────────────────────
// `compute-no-verdict-derivation` is DELIBERATELY excluded from the widened set. It is a
// corpus-specific rule: its own message states it bans only "the narrower, compute-local
// tell: an identifier or object key literally named `verdict`", which is why it is scoped
// to `scripts/lib/compute/**`. Applied to the CoA manifest it produces a FALSE POSITIVE
// on a manifest DATA field — `manifest.js:169`'s `m.robots.verdict !== 'allowed'`, the
// robots.txt verdict the manifest contract validates — not a verdict derivation. Every
// other rule (require / clock / console / fetch / env / numeric-const / threshold /
// postgis / literal-window) is left in force; none of them is compute-corpus-specific.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const RULE_FILE = 'scripts/ast-grep-rules/compute-shape.yml';

/** The two PURE CoA library modules under test (Spec 129 §D2/§D5). */
const LIBRARY_FILES = [
  'scripts/lib/coa-notices/parse-values.js',
  'scripts/lib/coa-notices/manifest.js',
];

/** The known-bad library fixture location (written at test time, never executed). */
const FIXTURE_DIR_REL = 'src/tests/fixtures/coa-notices';
const FIXTURE_REL = `${FIXTURE_DIR_REL}/bad-library.js`;

/** The corpus-specific rule excluded from the widened scope (see the header note). */
const CORPUS_SPECIFIC_RULES = ['compute-no-verdict-derivation'];

/** Parse ast-grep `--report-style=short` lines, exactly as gate E's driver does. */
const LINE_RE = /^(.+?):(\d+):(\d+): error\[([\w-]+)\]:/;

interface Finding {
  file: string;
  line: number;
  ruleId: string;
}

/** The ast-grep binary: win32 cli package, then .bin (mirrors compute-literals.mjs). */
function astGrepBinary(): string {
  const candidates = process.platform === 'win32'
    ? [
      path.join(REPO_ROOT, 'node_modules', '@ast-grep', 'cli-win32-x64-msvc', 'ast-grep.exe'),
      path.join(REPO_ROOT, 'node_modules', '@ast-grep', 'cli', 'ast-grep.exe'),
    ]
    : [path.join(REPO_ROOT, 'node_modules', '.bin', 'ast-grep')];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error(`ast-grep binary not found (looked in ${candidates.join(', ')}) — run npm ci`);
  return found;
}

/**
 * Run the (widened-scope) compute-shape rule file over `files`, returning every finding.
 * Mirrors `scripts/analysis/gates/compute-literals.mjs`'s spawn + parse.
 */
function scan(files: string[], ruleFile: string): Finding[] {
  if (files.length === 0) return [];
  const res = spawnSync(
    astGrepBinary(),
    ['scan', '--rule', ruleFile, '--report-style=short', '--color=never', ...files],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (res.error) throw res.error;
  const stdout = res.stdout || '';
  if (!stdout.trim() && res.status !== 0 && res.status !== 1) {
    throw new Error(`ast-grep failed (exit ${res.status}): ${res.stderr}`);
  }
  const out: Finding[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    out.push({
      file: (m[1] as string).replace(/\\/g, '/'),
      line: Number(m[2]),
      ruleId: m[4] as string,
    });
  }
  return out;
}

/**
 * Build a temporary copy of the REAL rule file whose `files:` scope is WIDENED to also
 * cover the CoA library corpus, minus the corpus-specific rules named in
 * `CORPUS_SPECIFIC_RULES`. Rule bodies are copied verbatim.
 */
function widenedRuleFile(): string {
  const raw = fs.readFileSync(path.join(REPO_ROOT, RULE_FILE), 'utf8');
  const blocks = raw.split(/^---\s*$/m).filter((block) => {
    const idMatch = /^\s*id:\s*(\S+)\s*$/m.exec(block);
    const id: string | null = idMatch ? (idMatch[1] as string) : null;
    return id === null || !CORPUS_SPECIFIC_RULES.includes(id);
  });
  const widened = blocks
    .join('\n---\n')
    .replace(
      /^(\s*- )'(scripts\/lib\/compute\/\*\*\/\*\.js)'.*$/gm,
      (_m, prefix: string, glob: string) =>
        `${prefix}'${glob}'\n${prefix}'scripts/lib/coa-notices/**/*.js'\n${prefix}'src/tests/fixtures/coa-notices/**/*.js'`,
    );
  // Guard the widening itself: the temporary rule MUST cover the corpus under test.
  if (!widened.includes('scripts/lib/coa-notices/**/*.js') || !widened.includes('src/tests/fixtures/coa-notices/**/*.js')) {
    throw new Error('widened rule file failed to select the CoA corpus — check compute-shape.yml `files:` entries');
  }
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coa-shape-')), 'compute-shape-widened.yml');
  fs.writeFileSync(tmp, widened, 'utf8');
  return tmp;
}

describe('T-SHAPE — the CoA pure library holds the compute-shape rules (Spec 129 §D2/§D5)', () => {
  // -------------------------------------------------------------------------
  // T-SHAPE-1 — the pure library is clean (NON-VACUOUS: the same scan REDs on
  // the fixture in T-SHAPE-2, proving the rule set actually fires on this corpus).
  // -------------------------------------------------------------------------
  it('T-SHAPE-1: compute-shape rules are clean over parse-values.js and manifest.js', () => {
    for (const rel of LIBRARY_FILES) {
      expect(fs.existsSync(path.join(REPO_ROOT, rel)), `library file missing: ${rel}`).toBe(true);
    }
    const ruleFile = widenedRuleFile();
    try {
      const findings = scan(LIBRARY_FILES, ruleFile);
      expect(findings, `compute-shape findings over the pure CoA library: ${JSON.stringify(findings)}`).toEqual([]);
    } finally {
      fs.rmSync(path.dirname(ruleFile), { recursive: true, force: true });
    }
  });

  it('T-SHAPE-1b: the widened rule file really fires on the corpus (the scan is not vacuous)', () => {
    const ruleFile = widenedRuleFile();
    // The committed fixture is real code, never executed — the scan only reads it.
    try {
      const findings = scan([FIXTURE_REL], ruleFile);
      expect(findings.length, 'the widened rule file must fire on the known-bad fixture').toBeGreaterThan(0);
    } finally {
      fs.rmSync(path.dirname(ruleFile), { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // T-SHAPE-2 — the scan catches the filesystem and the wall clock.
  // -------------------------------------------------------------------------
  it('T-SHAPE-2: the scan reports both compute-forbidden-require and compute-no-wall-clock on the fixture', () => {
    const ruleFile = widenedRuleFile();
    // The committed fixture is real code, never executed — the scan only reads it.
    try {
      const findings = scan([FIXTURE_REL], ruleFile);
      const ids = new Set(findings.map((f) => f.ruleId));
      expect(ids.has('compute-forbidden-require'), `expected compute-forbidden-require; got ${JSON.stringify(findings)}`).toBe(true);
      expect(ids.has('compute-no-wall-clock'), `expected compute-no-wall-clock; got ${JSON.stringify(findings)}`).toBe(true);
      expect(findings.every((f) => f.file === FIXTURE_REL)).toBe(true);
    } finally {
      fs.rmSync(path.dirname(ruleFile), { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // T-SHAPE-3 — the library holds no module-level numeric tunable (Rule 3).
  // -------------------------------------------------------------------------
  it('T-SHAPE-3: no compute-no-module-numeric-const finding over the pure library', () => {
    const ruleFile = widenedRuleFile();
    try {
      const findings = scan(LIBRARY_FILES, ruleFile);
      const numericConstFindings = findings.filter((f) => f.ruleId === 'compute-no-module-numeric-const');
      expect(
        numericConstFindings,
        `module-level numeric tunable(s) in the CoA library: ${JSON.stringify(numericConstFindings)}`,
      ).toEqual([]);
    } finally {
      fs.rmSync(path.dirname(ruleFile), { recursive: true, force: true });
    }
  });
});
