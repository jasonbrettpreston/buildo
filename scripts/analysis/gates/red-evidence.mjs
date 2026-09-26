// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (gate K);
//            docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6 G7
//
// GATE K — G7's "prove red" is only real evidence once it names a COMMITTED
// vitest JSON reporter artifact, never the bare word `RED` in prose (operator
// decision 3, 2026-09-26). A red-first CLAIM is any report line containing the
// literal substring `docs/reports/red-evidence/` — nothing else counts as a
// claim under THIS gate (a prose "RED" narrates nothing). Zero claims -> pass
// (vacuous: whether a claim is REQUIRED AT ALL for a given step is gate H's
// job, not this module's — a fleet-scoped caller that DOES require one turns
// a zero-claim result into its own violation, same as `closed-bounds.mjs`'s
// callers do for gate A).
//
// Per claim, the closed answer set:
//   1. the cited `docs/reports/red-evidence/<slug>/<name>.json` EXISTS.
//   2. it parses as vitest JSON reporter output: `testResults[]`, each with
//      `assertionResults[].status`.
//   3. >=1 `assertionResults[].status === "failed"`.
//   4. every CITED TEST NAME appears among the artifact's assertion names.
// Cited test name grammar (closed, decidable, and this module's OWN — no
// committed report cites this artifact format yet, so there is no prior
// convention to match): every backticked span on the SAME line as the
// citation, other than the citation path itself, containing no `/` and at
// least 3 characters long.
// Anything else -> a violation string naming the missing piece.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GATES } from './ledger.mjs';

// `ledger.mjs` owns the row shape + the match (GATES includes 'K'); this file
// owns the closed answer set. Self-check: the shared allowlist must already
// speak gate K, or every row this module's caller asks about would be
// silently orphaned by `matchLedger`'s gate filter.
if (!GATES.includes('K')) {
  throw new Error(`ledger.mjs GATES omits 'K' — gate K cannot be ledger-allowed (${GATES.join('/')})`);
}

const CLAIM_MARKER = 'docs/reports/red-evidence/';
const CITATION_RE = /docs\/reports\/red-evidence\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.json)/g;
const MIN_NAME_LEN = 3;

/** Backticked spans on `line`, minus the citation path, "test-name shaped". PURE. */
function citedTestNames(line, relPath) {
  const out = [];
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(line))) {
    const val = m[1];
    if (val === relPath || val.includes('/') || val.length < MIN_NAME_LEN) continue;
    out.push(val);
  }
  return out;
}

/** Every assertion's `fullName`/`title` across a parsed vitest JSON doc. PURE. */
function assertionNames(doc) {
  const names = new Set();
  const files = Array.isArray(doc && doc.testResults) ? doc.testResults : [];
  for (const tf of files) {
    for (const a of Array.isArray(tf && tf.assertionResults) ? tf.assertionResults : []) {
      if (typeof a?.fullName === 'string') names.add(a.fullName);
      if (typeof a?.title === 'string') names.add(a.title);
    }
  }
  return names;
}

/**
 * Validate every red-first claim `reportText` makes for `slug`, against disk.
 * @param {{repoRoot: string, slug: string, reportText: string}} args
 * @returns {{pass: boolean, violations: string[], claims: number}}
 */
export function checkRedEvidence({ repoRoot, slug, reportText }) {
  const violations = [];
  let claims = 0;
  const lines = String(reportText || '').split('\n');
  for (const line of lines) {
    if (!line.includes(CLAIM_MARKER)) continue;
    CITATION_RE.lastIndex = 0;
    let m;
    while ((m = CITATION_RE.exec(line))) {
      claims += 1;
      const relPath = `docs/reports/red-evidence/${m[1]}`;
      const absPath = path.join(repoRoot, relPath);
      if (!fs.existsSync(absPath)) {
        violations.push(`${relPath}: missing artifact (cited by ${slug})`);
        continue;
      }
      let doc;
      try {
        doc = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      } catch (e) {
        violations.push(`${relPath}: not valid JSON (${e.message})`);
        continue;
      }
      if (!Array.isArray(doc.testResults)) {
        violations.push(`${relPath}: not vitest JSON reporter output (no testResults[])`);
        continue;
      }
      const allAssertions = [];
      for (const tf of doc.testResults) {
        for (const a of Array.isArray(tf && tf.assertionResults) ? tf.assertionResults : []) allAssertions.push(a);
      }
      const failed = allAssertions.filter((a) => a && a.status === 'failed');
      if (failed.length === 0) {
        violations.push(`${relPath}: no assertionResults[].status === "failed" (${allAssertions.length} assertion(s) checked)`);
        continue;
      }
      const names = assertionNames(doc);
      for (const name of citedTestNames(line, relPath)) {
        if (!names.has(name)) violations.push(`${relPath}: cited test name "${name}" not found in artifact assertionResults`);
      }
    }
  }
  return { pass: violations.length === 0, violations, claims };
}

/** In-memory + tmp-dir fixtures, both directions. Used by `selfTest()` and the vitest suite alike. */
export function selfTestCases() {
  return [
    {
      name: 'good fixture: cited path exists, has a failed assertion, cited name matches -> pass',
      build: (repoRoot) => {
        const dir = path.join(repoRoot, 'docs/reports/red-evidence/fixture_step');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'lock.json'), JSON.stringify({
          testResults: [{ assertionResults: [
            { status: 'passed', fullName: 'other test' },
            { status: 'failed', fullName: 'the fixture red-first lock' },
          ] }],
        }));
        return 'red-first lock: `docs/reports/red-evidence/fixture_step/lock.json` (`the fixture red-first lock`)';
      },
      expect: { pass: true, violations: 0, claims: 1 },
    },
    {
      name: 'known-bad: report cites the path but the artifact was never committed -> violation',
      build: () => 'red-first lock: `docs/reports/red-evidence/fixture_step/missing.json`',
      expect: { pass: false, violations: 1, claims: 1 },
    },
    {
      name: 'artifact exists but has no failed assertion -> violation',
      build: (repoRoot) => {
        const dir = path.join(repoRoot, 'docs/reports/red-evidence/fixture_step');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'allgreen.json'), JSON.stringify({
          testResults: [{ assertionResults: [{ status: 'passed', fullName: 'x' }] }],
        }));
        return 'red-first lock: `docs/reports/red-evidence/fixture_step/allgreen.json`';
      },
      expect: { pass: false, violations: 1, claims: 1 },
    },
    {
      name: 'cited test name absent from the artifact -> violation',
      build: (repoRoot) => {
        const dir = path.join(repoRoot, 'docs/reports/red-evidence/fixture_step');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'lock2.json'), JSON.stringify({
          testResults: [{ assertionResults: [{ status: 'failed', fullName: 'a real lock' }] }],
        }));
        return 'red-first lock: `docs/reports/red-evidence/fixture_step/lock2.json` (`a lock that was never run`)';
      },
      expect: { pass: false, violations: 1, claims: 1 },
    },
    {
      name: 'no red-first claim at all -> vacuous pass',
      build: () => 'the report narrates genuine RED output in prose only, no artifact cited',
      expect: { pass: true, violations: 0, claims: 0 },
    },
  ];
}

/** In-memory (tmp-dir backed) fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  for (const c of selfTestCases()) {
    const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gate-k-'));
    try {
      const reportText = c.build(repoRoot);
      const got = checkRedEvidence({ repoRoot, slug: 'fixture_step', reportText });
      if (got.pass !== c.expect.pass) throw new Error(`self-test FAILED (${c.name}): pass=${got.pass}, want ${c.expect.pass}`);
      if (got.violations.length !== c.expect.violations) {
        throw new Error(`self-test FAILED (${c.name}): ${got.violations.length} violation(s), want ${c.expect.violations} (${JSON.stringify(got.violations)})`);
      }
      if (got.claims !== c.expect.claims) throw new Error(`self-test FAILED (${c.name}): claims=${got.claims}, want ${c.expect.claims}`);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }
}
