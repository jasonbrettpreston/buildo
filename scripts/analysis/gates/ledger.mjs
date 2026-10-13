// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA
// (one closed allowlist for every closed-response gate); R-X closing-row posture;
// R-BZ C2 (2026-10-11 — a row allows exactly ONE violation: one row must not
// cover N same-key sites) + R-BZ C3 (`programmeExpiry` — a row closing on a
// BUILT/SUPERSEDED/missing programme item has expired and MUST be deleted).
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
export const GATES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'K'];

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
  'gate', 'step', 'file', 'item', 'disposition', 'why',
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

  // R-CN (2026-10-12): a gate-E row names the ONE file it allows. `step` is a
  // basename, so two files sharing a basename in different directories were
  // indistinguishable; the `file` field makes the allowed site unambiguous.
  if (row.gate === 'E') {
    if (!isNonEmptyString(row.file)) {
      problems.push('gate E row must name its file (R-CN)');
    } else {
      const file = row.file;
      if (file.startsWith('/') || file.includes('\\') || file.split('/').includes('..')) {
        problems.push(`file "${file}" must be a repo-relative posix path without ".." (R-CN)`);
      }
      if (path.posix.normalize(file) !== file) {
        problems.push(`file "${file}" must be a normalized posix path (no "." segments, "//", or trailing "/") (R-CN)`);
      }
      if (!file.endsWith('.js') && !file.endsWith('.cjs')) {
        problems.push('gate E row file must be a .js/.cjs module (R-CN)');
      }
      if (!fileExists(file)) {
        problems.push(`file "${file}" does not resolve to a real file (R-CN)`);
      }
      const expectedStep = path.posix.basename(file).replace(/\.(c?js)$/, '');
      if (row.step !== expectedStep) {
        problems.push(
          `step "${row.step}" must equal basename(file) minus .js/.cjs ("${expectedStep}") (R-CN)`,
        );
      }
    }
  } else if (row.file !== undefined) {
    problems.push('only gate E rows name a file (R-CN)');
  }

  return problems;
}

/**
 * Match a gate's live violations against the ledger rows. An ORPHAN (a row whose
 * violation no longer exists) is returned, not swallowed — the caller REDs on it.
 *
 * A row allows EXACTLY ONE violation (R-BZ C2, 2026-10-11). A row is keyed
 * `step\0item` — but for gate E the key is `step\0file\0item` (R-CN, 2026-10-12:
 * a gate-E row names the file it allows, so a same-basename file elsewhere is
 * never covered) — and a key is looked up, never consumed: before the collision lock
 * any number of same-key violations resolved to the same row, so ONE dated row
 * silently covered N distinct same-key sites (that is precisely the shape a
 * "grandfathered" permission hardens into). Now the FIRST violation (in input
 * order) with a key takes the row; every further violation with that same key is
 * `unallowed` — carrying `collision: true` so the caller can tell "no row at all"
 * from "a row already spent on another site with this key" — and each site must
 * be closed on its own terms (a fresh row, or a real fix), never folded under a
 * sibling's excuse.
 *
 * @param {string} gate
 * @param {Array<{step: string, item: string, file?: string}>} violations
 * @param {Array<object>} rows
 * @returns {{allowed: Array<{violation: {step: string, item: string, file?: string}, row: object}>,
 *   unallowed: Array<{step: string, item: string, file?: string, collision?: true}>,
 *   orphans: Array<object>}} entries carry `file` for gate E (R-CN).
 */
export function matchLedger(gate, violations, rows) {
  const gateRows = (Array.isArray(rows) ? rows : []).filter((r) => r && r.gate === gate);
  const key = (r) => (gate === 'E'
    ? `${r.step}\u0000${r.file || ''}\u0000${r.item}`
    : `${r.step}\u0000${r.item}`);
  const rowsByKey = new Map(gateRows.map((r) => [key(r), r]));

  const unallowed = [];
  const allowed = [];
  const consumed = new Set();
  for (const v of Array.isArray(violations) ? violations : []) {
    if (gate === 'E' && !isNonEmptyString(v && v.file)) {
      throw new Error(
        `matchLedger(E): violation ${v.step} ${v.item} has no file (R-CN) — a gate-E finding must carry its file`,
      );
    }
    const k = key(v);
    const row = rowsByKey.get(k);
    if (row && !consumed.has(k)) {
      allowed.push(gate === 'E'
        ? { violation: { step: v.step, file: v.file, item: v.item }, row }
        : { violation: { step: v.step, item: v.item }, row });
      consumed.add(k);
    } else if (row) {
      // The key's single row is already spent on an earlier site: a collision.
      unallowed.push(gate === 'E'
        ? { step: v.step, file: v.file, item: v.item, collision: true }
        : { step: v.step, item: v.item, collision: true });
    } else {
      unallowed.push(gate === 'E'
        ? { step: v.step, file: v.file, item: v.item }
        : { step: v.step, item: v.item });
    }
  }

  const orphans = gateRows.filter((r) => !consumed.has(key(r)));
  return { unallowed, orphans, allowed };
}

/**
 * Programme-item id shape (`CP-S1`, `CP-PLANA`, `STD-1`, ...). A `closing_brief`
 * that is a BARE id — not a prose sentence that happens to mention one — is the
 * only thing this tripwire judges: everything else (e.g. "chain_sources
 * conversion complete (Spec 124 R-AQ ...)") is prose and out of scope.
 */
const PROGRAMME_ID_RE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/;

/**
 * Programme-expiry tripwire (R-BZ C3). A ledger row that closes on a PROGRAMME
 * item (its `closing_brief` is exactly that item's id) expires the moment that
 * item is BUILT or SUPERSEDED — the closing work is done or gone, so the row can
 * no longer be a dated deferral and MUST be deleted. An id naming no item in
 * `programmeItems` is `item_missing`: the row points at a promise that does not
 * exist (a typo, or an item already removed), which is RED for the same reason.
 *
 * Only rows whose `closing_brief` is EXACTLY a programme-item-id shape are in
 * scope; prose closing briefs are ignored (their expiry is adjudicated by the
 * brief they name, not by this registry). Pure: no fs, no clock.
 *
 * @param {Array<object>} rows ledger rows
 * @param {Array<{id: string, status: string}>} programmeItems parsed `programme-items.json` items
 * @returns {Array<{step: string, item: string, closing_brief: string, reason: string}>}
 *   reason is one of `item_missing` | `item_built` | `item_superseded`.
 */
export function programmeExpiry(rows, programmeItems) {
  const items = new Map(
    (Array.isArray(programmeItems) ? programmeItems : [])
      .filter((it) => it && typeof it.id === 'string')
      .map((it) => [it.id, it]),
  );

  const expired = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.closing_brief !== 'string') continue;
    const brief = row.closing_brief;
    if (!PROGRAMME_ID_RE.test(brief)) continue; // prose closing brief — out of scope.
    const item = items.get(brief);
    let reason = null;
    if (!item) reason = 'item_missing';
    else if (item.status === 'BUILT') reason = 'item_built';
    else if (item.status === 'SUPERSEDED') reason = 'item_superseded';
    if (reason) {
      expired.push({ step: row.step, item: row.item, closing_brief: brief, reason });
    }
  }
  return expired;
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
    // R-CN: the gate-E fixture rows below name a real (faked) file.
    'scripts/lib/compute/compute.js': '',
    'scripts/lib/x.js': '',
    'scripts/lib/compute/x.js': '',
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
    gate: 'E', step: 'compute', file: 'scripts/lib/compute/compute.js', item: 'i',
    disposition: 'coordinate_reference',
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

  // (9) R-BZ C2 — ONE row covers exactly ONE violation. A second same-key site
  // is a COLLISION (unallowed, flagged), not a second free pass.
  const p9 = matchLedger(
    'A',
    [{ step: 's', item: 'i' }, { step: 's', item: 'i' }],
    [pendingFixture],
  );
  if (
    p9.allowed.length !== 1
    || p9.unallowed.length !== 1
    || p9.unallowed[0].collision !== true
    || p9.orphans.length !== 0
  ) {
    throw new Error(`self-test FAILED (9): same-key collision not caught (${JSON.stringify(p9)})`);
  }

  // (9b) distinct keys, each with its own row, are NOT a collision.
  const p9b = matchLedger(
    'A',
    [{ step: 's', item: 'i' }, { step: 's', item: 'j' }],
    [pendingFixture, { ...pendingFixture, item: 'j' }],
  );
  if (p9b.unallowed.length !== 0 || p9b.allowed.length !== 2 || p9b.orphans.length !== 0) {
    throw new Error(`self-test FAILED (9b): distinct keys misreported (${JSON.stringify(p9b)})`);
  }

  // (10) R-BZ C3 — programmeExpiry: BUILT / SUPERSEDED / missing, and prose ignored.
  const cpRow = (closing_brief) => ({ ...pendingFixture, closing_brief });
  const items = [{ id: 'CP-S1', status: 'NOT_STARTED' }, { id: 'CP-PLANA', status: 'BUILT' }];
  const p10 = programmeExpiry([cpRow('CP-S1')], items);
  if (p10.length !== 0) {
    throw new Error(`self-test FAILED (10): NOT_STARTED item reported expired (${JSON.stringify(p10)})`);
  }
  const p10b = programmeExpiry([cpRow('CP-PLANA')], items);
  if (p10b.length !== 1 || p10b[0].reason !== 'item_built') {
    throw new Error(`self-test FAILED (10b): BUILT item not expired (${JSON.stringify(p10b)})`);
  }
  const p10c = programmeExpiry([cpRow('CP-PLANA')], [{ id: 'CP-PLANA', status: 'SUPERSEDED' }]);
  if (p10c.length !== 1 || p10c[0].reason !== 'item_superseded') {
    throw new Error(`self-test FAILED (10c): SUPERSEDED item not expired (${JSON.stringify(p10c)})`);
  }
  const p10d = programmeExpiry([cpRow('CP-GONE')], items);
  if (p10d.length !== 1 || p10d[0].reason !== 'item_missing') {
    throw new Error(`self-test FAILED (10d): missing item not expired (${JSON.stringify(p10d)})`);
  }
  const p10e = programmeExpiry([cpRow('chain_sources conversion complete (Spec 124 R-AQ)')], items);
  if (p10e.length !== 0) {
    throw new Error(`self-test FAILED (10e): prose closing_brief not ignored (${JSON.stringify(p10e)})`);
  }

  // (11) R-CN — a gate-E row names its file, so the same step+item in TWO files
  // is two distinct keys: the row allows only the file it names, and the other
  // site is UNALLOWED (a plain "no row", not a collision), with 0 orphans.
  const fileDeps = {
    repoRoot: '/nonexistent-repo-root',
    fileExists: deps.fileExists,
    readFile: deps.readFile,
  };
  const eRow = {
    ...permanentFixture,
    step: 'x',
    file: 'scripts/lib/x.js',
    spec_ref: 'docs/specs/01-pipeline/999_fixture.md',
  };
  const p11 = matchLedger(
    'E',
    [
      { step: 'x', file: 'scripts/lib/x.js', item: 'i' },
      { step: 'x', file: 'scripts/lib/compute/x.js', item: 'i' },
    ],
    [eRow],
  );
  if (
    p11.allowed.length !== 1
    || p11.unallowed.length !== 1
    || p11.unallowed[0].collision === true
    || p11.orphans.length !== 0
  ) {
    throw new Error(`self-test FAILED (11): cross-file gate-E key misreport (${JSON.stringify(p11)})`);
  }

  // (11b) a gate-E row WITHOUT `file` fails validateRow.
  const p11b = validateRow({ ...eRow, file: undefined }, fileDeps);
  if (!p11b.length || !p11b.join(' ').includes('file')) {
    throw new Error(`self-test FAILED (11b): gate-E row without file not caught (${JSON.stringify(p11b)})`);
  }
}
