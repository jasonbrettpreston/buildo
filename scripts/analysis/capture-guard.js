/**
 * capture-guard — the two pure pre-conditions for a POST golden capture.
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md (①②③ capture last); docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA
 *
 * WHY THIS EXISTS
 * ---------------
 * POST goldens were recaptured REPEATEDLY because gates fired AFTER the
 * capture: a run captured the POST, a gate failed on data the capture itself
 * produced, and the only way to clear it was to fix the step and capture AGAIN.
 * The head of that loop was never in the capture machinery — it was the ORDER.
 * Spec 123 ①②③ says "capture LAST": a capture must not happen while a gate that
 * a capture could feed is already red.
 *
 * `capture-step-golden.js` therefore runs, BEFORE a POST capture:
 *
 *   `node scripts/analysis/step-validate.mjs --step=<slug> --fast`
 *
 * and refuses the capture unless the step's verdict is a FIVE-WORD PASS. And
 * AFTER run 1 it refuses a POST whose upstream bytes differ from the committed
 * PRE — PRE and POST must have seen the SAME data, i.e. they must be captured
 * back-to-back in one session.
 *
 * This module holds BOTH decisions as pure functions, so they are lockable
 * without a database, a child process or a network
 * (`src/tests/capture-guard.logic.test.ts`). Nothing here touches disk or DB.
 *
 * THE ONE DELIBERATE EXCEPTION — gate G:
 * -------------------------------------------------------------
 * A five-word FAIL is not automatically a refusal. Gate G (#38-#40: nonzero
 * capture, lib_fingerprint freshness, explained diffs) judges the captures THIS
 * run PRODUCES — it is precisely the gate a capture FEEDS. If a G-only failure
 * blocked the capture, then a library change (which moves `lib_fingerprint`,
 * which fails gate G, which is fixed BY recapturing) could never be recaptured:
 * a deadlock. So a FAIL whose every named gate is capture-derived is ALLOWED —
 * the capture is the fix. G is still enforced on the COMMITTED captures by
 * step-validate, so the exemption buys no silence, only order. Any FAIL naming
 * any other gate is refused.
 */
'use strict';

/**
 * The five words of Spec 124 §5 R-BA ("McDonald's Airtight"), in the order the
 * scorecard renders them. Frozen: a sixth word is a spec change, not an
 * extension point.
 */
const FIVE_WORDS = Object.freeze([
  'STANDARDIZED',
  'OBSERVABLE',
  'SCALABLE',
  'UNDERSTANDABLE',
  'ACCURATE',
]);

/**
 * Gates that judge the captures THIS run produces, so they cannot gate the
 * capture that satisfies them. Gate G (#38-#40: nonzero capture,
 * lib_fingerprint freshness, explained diffs) is the whole set: a G-only failure
 * cannot block the capture that fixes it (else a lib change could never be
 * recaptured). G is STILL enforced on the committed captures by step-validate.
 */
const CAPTURE_DERIVED_GATES = Object.freeze(['G']);

const STATUS_PASS = 'PASS';
const STATUS_FAIL = 'FAIL';

/**
 * A rendered five-word row, from step-validate's
 * `### Five-word verdict (Spec 124 §5 R-BA ...)` table. Exact shapes:
 *
 *   | SCALABLE | FAIL | FAIL (gate B — unledgered) |      → status FAIL, gates ['B']
 *   | ACCURATE | FAIL | FAIL (gate G/K — unledgered) |    → status FAIL, gates ['G','K']
 *   | OBSERVABLE | PASS | PASS (3 deferred) |             → status PASS, gates []
 *   | STANDARDIZED | PASS | PASS |                        → status PASS, gates []
 *
 * Four cells when split naively is wrong — the detail cell itself contains no
 * `|`, but the ROW is `| a | b | c |`, so a split on `|` yields a leading and a
 * trailing empty cell. `^\|\s*<word>\s*\|` anchors the first CELL exactly, which
 * also excludes the other tables in the same stdout (their first cell is a gate
 * id, an invariant number or a metric name — never one of FIVE_WORDS).
 */
const ROW_RE = new RegExp(`^\\|\\s*(${FIVE_WORDS.join('|')})\\s*\\|([^|]*)\\|([^|]*)\\|\\s*$`);

/** `gate B` / `gate G/K` inside a detail cell → ['B'] / ['G','K']. */
const GATE_RE = /\bgate\s+([A-Z][A-Z0-9]?(?:\s*\/\s*[A-Z][A-Z0-9]?)*)\b/;

/**
 * Parse the five-word verdict out of step-validate's rendered stdout.
 *
 * Only rows whose first cell is EXACTLY one of FIVE_WORDS are considered; the
 * status must be exactly PASS or FAIL (any other status is not a verdict and is
 * ignored rather than guessed at). If a word appears twice with DIFFERENT
 * content the output is ambiguous — several steps in one run — and this THROWS
 * rather than pick one. A repeated row with identical content is idempotent and
 * harmless.
 *
 * @param {string|null|undefined} stdout
 * @returns {Map<string, {status: string, gates: string[]}>}
 */
function parseFiveWords(stdout) {
  const byWord = new Map();
  if (typeof stdout !== 'string' || stdout.length === 0) return byWord;

  for (const line of stdout.split(/\r?\n/)) {
    const m = ROW_RE.exec(line.trim());
    if (!m) continue;
    const word = m[1];
    const status = m[2].trim();
    if (status !== STATUS_PASS && status !== STATUS_FAIL) continue;
    const gates = status === STATUS_FAIL ? gatesFromDetail(m[3]) : [];
    const entry = { status, gates };

    const prior = byWord.get(word);
    if (prior && (prior.status !== entry.status || prior.gates.join('/') !== entry.gates.join('/'))) {
      throw new Error(
        `ambiguous five-word output: ${word} appears as both ` +
          `${JSON.stringify(prior)} and ${JSON.stringify(entry)} — several steps in one run`,
      );
    }
    byWord.set(word, entry);
  }
  return byWord;
}

/** The gate ids named in a FAIL detail cell (`['G','K']`), or `[]`. Pure. */
function gatesFromDetail(detail) {
  const m = GATE_RE.exec(String(detail ?? ''));
  if (!m) return [];
  return m[1]
    .split('/')
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

/** `SCALABLE (gate B)` — how a failing word is named in `failing` and `reason`. Pure. */
function nameFailing(word, gates) {
  return gates.length > 0 ? `${word} (gate ${gates.join('/')})` : `${word} (gate none)`;
}

/**
 * Decide whether this invocation may proceed to a POST capture. PURE.
 *
 * Order of checks:
 *   1. Every FIVE_WORDS word must be present — a missing word means the verdict
 *      was unreadable (no capture can be authorized on an unread verdict).
 *   2. A FAIL word is ALLOWED iff it names >= 1 gate AND every named gate is in
 *      CAPTURE_DERIVED_GATES (see the header: gate G judges the captures this run
 *      produces). A FAIL naming no gate, or any non-capture-derived gate, is a
 *      refusal.
 *   3. Any refusal → `allow:false`.
 *
 * @param {Map<string, {status: string, gates: string[]}>|null|undefined} words
 * @returns {{allow: boolean, reason: string, failing: string[]}}
 */
function captureGuardDecision(words) {
  const map = words instanceof Map ? words : new Map();
  const failing = [];

  for (const word of FIVE_WORDS) {
    const entry = map.get(word);
    if (!entry || typeof entry !== 'object') {
      return { allow: false, reason: `${word} missing — verdict unreadable`, failing: [word] };
    }
    if (entry.status === STATUS_PASS) continue;
    const gates = Array.isArray(entry.gates) ? entry.gates : [];
    const captureDerived = gates.length > 0 && gates.every((g) => CAPTURE_DERIVED_GATES.includes(g));
    if (!captureDerived) failing.push(nameFailing(word, gates));
  }

  if (failing.length > 0) {
    return { allow: false, reason: `five-word verdict not PASS: ${failing.join(', ')}`, failing };
  }
  return { allow: true, reason: 'five-word verdict PASS', failing: [] };
}

/**
 * Every STRING value stored under a key exactly `content_hash`, walked
 * recursively, but ONLY inside `doc.summary.records_meta`. `table_state` — which
 * also carries `content_hash`, of the LOCAL table — is deliberately never
 * walked: this function answers "what upstream bytes did this capture see", not
 * "what does the target table look like". Sorted + de-duplicated; `[]` when
 * there is nothing. PURE.
 *
 * @param {object|null|undefined} doc
 * @returns {string[]}
 */
function contentHashes(doc) {
  const found = new Set();
  if (!doc || typeof doc !== 'object') return [];
  const summary = doc.summary;
  if (!summary || typeof summary !== 'object') return [];
  walkForContentHash(summary.records_meta, found);
  return [...found].sort();
}

/** Recursive walk collecting `content_hash` string values into `found`. PURE. */
function walkForContentHash(node, found) {
  if (Array.isArray(node)) {
    for (const item of node) walkForContentHash(item, found);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'content_hash' && typeof value === 'string' && value.length > 0) {
      found.add(value);
      continue;
    }
    if (value && typeof value === 'object') walkForContentHash(value, found);
  }
}

/**
 * Decide whether the committed PRE and the just-taken POST saw the SAME
 * upstream data — i.e. were captured back-to-back in one session. PURE.
 *
 * A null PRE, or a PRE with no upstream content hash to compare, is `same:true`
 * with reason `no upstream content hash to compare`: absence of evidence is not
 * a mismatch (and a descriptor with no upstream hash cannot be checked here).
 * Otherwise `same` iff the two sorted-unique arrays are EQUAL.
 *
 * @param {object|null|undefined} preDoc
 * @param {object|null|undefined} postDoc
 * @returns {{same: boolean, pre: string[], post: string[], reason: string}}
 */
function sameSessionDecision(preDoc, postDoc) {
  const pre = contentHashes(preDoc);
  const post = contentHashes(postDoc);
  if (pre.length === 0) {
    return { same: true, pre, post, reason: 'no upstream content hash to compare' };
  }
  if (pre.join('\u0000') === post.join('\u0000')) {
    return { same: true, pre, post, reason: 'PRE and POST saw the same upstream content_hash' };
  }
  return {
    same: false,
    pre,
    post,
    reason:
      `upstream content_hash changed since the PRE capture (pre [${pre.join(', ')}] vs ` +
      `post [${post.join(', ')}]) — recapture PRE and POST back-to-back in one session`,
  };
}

/**
 * The PRE capture path matching a POST capture path — the LAST `/post/` segment
 * replaced by `/pre/`. Backslashes are normalised first, so a Windows path
 * resolves identically. `null` when there is no `/post/` segment. PURE.
 *
 * @param {string|null|undefined} postPath
 * @returns {string|null}
 */
function prePathFor(postPath) {
  if (typeof postPath !== 'string' || postPath.length === 0) return null;
  const normalised = postPath.split('\\').join('/');
  const idx = normalised.lastIndexOf('/post/');
  if (idx === -1) return null;
  return `${normalised.slice(0, idx)}/pre/${normalised.slice(idx + '/post/'.length)}`;
}

module.exports = {
  FIVE_WORDS,
  CAPTURE_DERIVED_GATES,
  STATUS_PASS,
  STATUS_FAIL,
  gatesFromDetail,
  parseFiveWords,
  captureGuardDecision,
  contentHashes,
  sameSessionDecision,
  prePathFor,
};
