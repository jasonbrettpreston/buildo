// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA
// (one closed allowlist for every closed-response gate); R-X closing-row posture.
//
// The five-word standard draws every gate answer from a CLOSED set. This module
// is the SHARED half of every one of those gates: the load, the row shape, and
// the match. A gate module (`closed-bounds.mjs`, `on-invalid.mjs`, ...) collects
// its violations and asks THIS module which of them are ledger-allowed.
//
// Two directions, both RED-by-default:
//   - a violation with NO row is `unallowed` (the gate fails), and
//   - a row with no violation is an ORPHAN — also RED (R-X closing-row posture:
//     the remediation commit deletes its own row, so the ledger can never
//     silently harden an excuse into permanent permission).
//
// Rows are `filed` + `adjudicated_by`, and a permanent disposition must cite a
// real `docs/specs/**` file with an `anchor` found LITERALLY in it — the same
// anti-rot test `checkOrderGuaranteesCited` (`scripts/analysis/step-validate.mjs`)
// applies to `checks[].order_guarantee`, so a cited spec amendment that deletes
// the sentence a row rests on reds the row instead of passing silently.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The closed set of gates that speak the ledger (Spec 124 §5 R-BA table). */
export const GATES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I'];

/**
 * The closed disposition menu, split by what the disposition CLAIMS:
 * `permanent` dispositions assert the value is not a tunable at all (so the row
 * must carry a spec citation that survives re-reading); `pending` dispositions
 * assert a real, dated, closing-brief-named remediation is in flight.
 */
export const DISPOSITIONS = {
  permanent: ['non_tunable', 'physical_constant', 'unit_conversion', 'coordinate_reference'],
  pending: ['pending_remediation', 'pending_recapture'],
};

export const LEDGER_REL_PATH = 'scripts/steps/_schema/standard-gates-ledger.json';

const ROW_KEYS = [
  'gate', 'step', 'item', 'disposition', 'why',
  'spec_ref', 'anchor', 'closing_brief', 'filed', 'adjudicated_by',
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Validate ONE ledger row against its closed shape.
 *
 * @param {object} row
 * @param {{repoRoot?: string, fileExists?: (p: string) => boolean, readFile?: (p: string) => string|null}} [deps]
 * @returns {string[]} problems — empty means the row is well-formed.
 */
export function validateRow(row, deps = {}) {
  const repoRoot = deps.repoRoot || path.resolve(HERE, '..', '..', '..');
  const fileExists = deps.fileExists || ((rel) => fs.existsSync(path.join(repoRoot, rel)));
  const readFile = deps.readFile
    || ((rel) => {
      const abs = path.join(repoRoot, rel);
      return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    });

  const problems = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ['row is not an object'];

  // Closed shape: an unknown key is the way prose smuggles itself into what is
  // supposed to be a decidable record, so it is refused, never ignored.
  for (const key of Object.keys(row)) {
    if (!ROW_KEYS.includes(key)) problems.push(`unknown key "${key}" (closed row shape)`);
  }

  if (!GATES.includes(row.gate)) {
    problems.push(`gate "${row.gate}" is not one of ${GATES.join('/')}`);
  }
  for (const field of ['step', 'item', 'why', 'adjudicated_by']) {
    if (!isNonEmptyString(row[field])) problems.push(`${field} must be a non-empty string`);
  }
  if (!isNonEmptyString(row.filed) || !ISO_DATE_RE.test(row.filed)) {
    problems.push(`filed must be an ISO date YYYY-MM-DD (got ${JSON.stringify(row.filed)})`);
  }
  if (!isNonEmptyString(row.filed) || Number.isNaN(Date.parse(row.filed))) {
    problems.push(`filed "${row.filed}" is not a parseable date`);
  }

  const permanent = DISPOSITIONS.permanent.includes(row.disposition);
  const pending = DISPOSITIONS.pending.includes(row.disposition);
  if (!permanent && !pending) {
    const menu = [...DISPOSITIONS.permanent, ...DISPOSITIONS.pending].join('/');
    problems.push(`disposition ${JSON.stringify(row.disposition)} is not one of ${menu}`);
  }

  if (permanent) {
    if (!isNonEmptyString(row.spec_ref) || !row.spec_ref.startsWith('docs/specs/')) {
      problems.push(
        `spec_ref must be a "docs/specs/..." path for a ${row.disposition} row (got ${JSON.stringify(row.spec_ref)})`,
      );
    } else if (!fileExists(row.spec_ref)) {
      problems.push(`spec_ref "${row.spec_ref}" does not resolve to a real file`);
    } else if (!isNonEmptyString(row.anchor)) {
      problems.push(`anchor must be a non-empty literal spec substring for a ${row.disposition} row`);
    } else {
      const text = readFile(row.spec_ref);
      if (text === null) {
        problems.push(`spec_ref "${row.spec_ref}" could not be read`);
      } else if (!text.includes(row.anchor)) {
        problems.push(
          `anchor not found literally in ${row.spec_ref} — rotted citation`,
        );
      }
    }
    if (row.closing_brief !== undefined) {
      problems.push(`closing_brief is for pending rows only (this row is ${row.disposition})`);
    }
  }

  if (pending && !isNonEmptyString(row.closing_brief)) {
    problems.push(`closing_brief must name the roster row that closes a ${row.disposition} row`);
  }

  return problems;
}

/**
 * Match a gate's live violations against the ledger rows. An ORPHAN (a row whose
 * violation no longer exists) is returned, not swallowed — the caller REDs on it.
 *
 * @param {string} gate
 * @param {Array<{step: string, item: string}>} violations
 * @param {Array<object>} rows
 */
export function matchLedger(gate, violations, rows) {
  const gateRows = (Array.isArray(rows) ? rows : []).filter((r) => r && r.gate === gate);
  const key = (r) => `${r.step}\u0000${r.item}`;
  const rowsByKey = new Map(gateRows.map((r) => [key(r), r]));

  const unallowed = [];
  const allowed = [];
  const consumed = new Set();
  for (const v of Array.isArray(violations) ? violations : []) {
    const row = rowsByKey.get(key(v));
    if (row) {
      allowed.push({ violation: { step: v.step, item: v.item }, row });
      consumed.add(key(v));
    } else {
      unallowed.push({ step: v.step, item: v.item });
    }
  }

  const orphans = gateRows.filter((r) => !consumed.has(key(r)));
  return { unallowed, orphans, allowed };
}

/**
 * Read + parse the ledger. A parse failure THROWS naming the path — a gate that
 * silently fell back to `[]` would report every violation as unallowed (noisy,
 * confusing) or, worse, a later caller could read it as "nothing to check".
 *
 * @param {string} repoRoot
 */
export function loadLedger(repoRoot) {
  const abs = path.join(repoRoot, LEDGER_REL_PATH);
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    throw new Error(`standard-gates ledger unreadable at ${LEDGER_REL_PATH}: ${e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`standard-gates ledger is not valid JSON at ${LEDGER_REL_PATH}: ${e.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rows)) {
    throw new Error(`standard-gates ledger at ${LEDGER_REL_PATH} has no \`rows\` array`);
  }
  return parsed;
}

/** In-memory, no-disk self-test. Throws on the first failed fixture. */
export function selfTest() {
  const fakeSpecs = {
    'docs/specs/01-pipeline/999_fixture.md': 'the fixture sentence an anchor cites verbatim',
  };
  const deps = {
    repoRoot: '/nonexistent-repo-root',
    fileExists: (p) => Object.prototype.hasOwnProperty.call(fakeSpecs, p),
    readFile: (p) => (Object.prototype.hasOwnProperty.call(fakeSpecs, p) ? fakeSpecs[p] : null),
  };

  const pendingFixture = {
    gate: 'A', step: 's', item: 'i', disposition: 'pending_remediation',
    why: 'w', closing_brief: '.cursor/plan.md row 1', filed: '2026-09-25', adjudicated_by: 'operator',
  };
  const permanentFixture = {
    gate: 'E', step: 's', item: 'i', disposition: 'coordinate_reference',
    why: 'w', spec_ref: 'docs/specs/01-pipeline/999_fixture.md',
    anchor: 'the fixture sentence an anchor cites verbatim',
    filed: '2026-09-25', adjudicated_by: 'operator',
  };

  // (1) a valid pending row is GREEN.
  const p1 = validateRow(pendingFixture, deps);
  if (p1.length) throw new Error(`self-test FAILED (1): valid pending row reported ${JSON.stringify(p1)}`);
  // (1b) a valid permanent row is GREEN.
  const p1b = validateRow(permanentFixture, deps);
  if (p1b.length) throw new Error(`self-test FAILED (1b): valid permanent row reported ${JSON.stringify(p1b)}`);

  // (2) a permanent row whose anchor is ABSENT is a problem naming `anchor`.
  const p2 = validateRow({ ...permanentFixture, anchor: 'no such sentence exists anywhere' }, deps);
  if (!p2.length || !p2.join(' ').includes('anchor')) {
    throw new Error(`self-test FAILED (2): rotted anchor not caught (${JSON.stringify(p2)})`);
  }

  // (3) an out-of-menu disposition is a problem.
  const p3 = validateRow({ ...pendingFixture, disposition: 'maybe' }, deps);
  if (!p3.length || !p3.join(' ').includes('disposition')) {
    throw new Error(`self-test FAILED (3): disposition "maybe" not caught (${JSON.stringify(p3)})`);
  }

  // (4) an unknown key is a problem (closed shape).
  const p4 = validateRow({ ...pendingFixture, note: 'prose' }, deps);
  if (!p4.length || !p4.join(' ').includes('note')) {
    throw new Error(`self-test FAILED (4): extra key "note" not caught (${JSON.stringify(p4)})`);
  }

  // (5) one violation with no row => unallowed 1.
  const p5 = matchLedger('A', [{ step: 's', item: 'i' }], []);
  if (p5.unallowed.length !== 1 || p5.allowed.length !== 0 || p5.orphans.length !== 0) {
    throw new Error(`self-test FAILED (5): expected 1 unallowed, got ${JSON.stringify(p5)}`);
  }

  // (6) a row with no violation => orphans 1 (RED — a fixed violation must delete its row).
  const p6 = matchLedger('A', [], [pendingFixture]);
  if (p6.orphans.length !== 1 || p6.unallowed.length !== 0) {
    throw new Error(`self-test FAILED (6): expected 1 orphan, got ${JSON.stringify(p6)}`);
  }

  // (7) row + matching violation => allowed 1, orphans 0.
  const p7 = matchLedger('A', [{ step: 's', item: 'i' }], [pendingFixture]);
  if (p7.allowed.length !== 1 || p7.orphans.length !== 0 || p7.unallowed.length !== 0) {
    throw new Error(`self-test FAILED (7): expected 1 allowed, got ${JSON.stringify(p7)}`);
  }

  // (8) a row belonging to ANOTHER gate is not this gate's orphan.
  const p8 = matchLedger('B', [], [pendingFixture]);
  if (p8.orphans.length !== 0) {
    throw new Error(`self-test FAILED (8): cross-gate row counted as orphan (${JSON.stringify(p8)})`);
  }
}
