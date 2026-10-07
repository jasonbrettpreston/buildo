// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-PROV ("keyer provenance per shard (§10 stage 5): two
//            distinct keyers; A's seal equals A's draft hash; witnessed — the `.a` path is absent from the tree of B's
//            recorded worktree commit (`git ls-tree`); declared-only — B's engine-ledger read paths contain no `.a` path
//            …; a staged `.a` with no staged or committed `.b` fails. Ruling citations: `--accept` entries in
//            `ratchet-exceptions.json` cite a RATIFIED Spec 69 row literally; … an adjudication cites its adjudicator,
//            and a `consolidation_mismatch` one cites M-39; a Spec 69 parse that yields 0 rulings FAILS"), §8 rule 7
//            (literal spec-anchor citation, ledger.mjs semantics), §10 stage 5; docs/specs/01-pipeline/69_mcbylaw_policy.md
//            M-17, M-39; docs/reports/mcbylaw-phase1-plan.md S6
//
// The two G-PROV arms S6 adds (the page / manifest / tag arms are observable.mjs + amendments.mjs + enacting.mjs).
// PURE, except gitLsTree(root), which returns the injected witness the CLI hands to checkKeyerProv().
//
//   checkKeyerProv({shards, lsTree, headTree, staged}) → {status, pass, checked, violations, counts}
//       lsTree(commit) → string[] | null (null = commit unknown); without it, a shard that needs the witness makes the
//       arm `not_run` (never PASS). headTree / staged: path lists (HEAD tree; `git diff --cached --name-only`).
//   checkRulingIds({spec69Text, ledger, adjudications}) → {status, pass, checked, violations, counts}
//   duplicateRulings(spec69Text) → ids that occur in two register rows (the last would silently win in parseRulings)
//   gitLsTree(root) · keyerSelfTest() · rulingSelfTest() · selfTest()
//
// Keyer-arm reason codes (closed):
//   prov_missing             a shard has a .b draft but no .prov.json
//   prov_field_missing       the provenance record omits a field (keyers, briefs, a_seal, b_run, unit_shas)
//   keyers_not_distinct      keyer A and keyer B are the same id
//   seal_mismatch            A's seal ≠ the sha256 of A's committed draft bytes
//   seal_id_duplicate        two shards carry the same monotonic seal id
//   a_visible_to_b           witnessed: the shard's .a path is in the tree of B's recorded worktree commit
//   a_in_b_read_paths        declared-only: B's engine-ledger read paths contain an .a path
//   a_staged_without_b       a staged .a whose .b is neither staged nor committed
//   witness_commit_unknown   B's recorded worktree commit does not resolve (the witness cannot run → fail closed)
// Ruling-arm reason codes (closed):
//   rulings_empty            the Spec 69 register parses to 0 rulings
//   ruling_duplicate         an id appears in two Spec 69 register rows
//   ruling_not_ratified      a ledger row (or an adjudication) cites a ruling that is not RATIFIED
//   ruling_anchor_missing    a ledger row's anchor is not `**<ruling>**` or Spec 69 does not contain it literally
//   adjudication_unattributed  an adjudication (other than G-AGREE's `disagreement`) names no adjudicator
//   adjudication_ruling_wrong  a `consolidation_mismatch` adjudication does not cite M-39

import { execFileSync } from 'node:child_process';
import { gateResult, violation } from './authored.mjs';
import { parseRulings } from './universe.mjs';
import { keyerFixtures, rulingFixtures } from './authored-fixtures.mjs';

export const REASON_CODES = Object.freeze([
  'prov_missing',
  'prov_field_missing',
  'keyers_not_distinct',
  'seal_mismatch',
  'seal_id_duplicate',
  'a_visible_to_b',
  'a_in_b_read_paths',
  'a_staged_without_b',
  'witness_commit_unknown',
]);
export const RULING_REASON_CODES = Object.freeze([
  'rulings_empty',
  'ruling_duplicate',
  'ruling_not_ratified',
  'ruling_anchor_missing',
  'adjudication_unattributed',
  'adjudication_ruling_wrong',
]);
/** adjudications.json kinds whose ruling citation this arm checks (Spec 69 M-39). */
export const HANDLED_KINDS = Object.freeze(['consolidation_mismatch']);
export const KIND_RULING = Object.freeze({ consolidation_mismatch: 'M-39' });
export const PROV_FIELDS = Object.freeze(['keyers.a.id', 'keyers.b.id', 'briefs.a', 'briefs.b', 'a_seal.sha256', 'a_seal.seal_id', 'b_run.run_id', 'b_run.ledger_sha256', 'b_run.read_paths', 'b_run.worktree_commit', 'unit_shas']);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const get = (o, p) => p.split('.').reduce((c, k) => (c && typeof c === 'object' ? c[k] : undefined), o);
const A_DRAFT = /\.a\.json$/;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** The ls-tree witness for the CLI: (commit) → tracked paths, or null when the commit does not resolve. */
export function gitLsTree(root) {
  return (commit) => {
    try {
      // -z: unquoted paths (core.quotePath would C-quote a non-ASCII path and the witness would fail open)
      return execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', '--end-of-options', String(commit)], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
    } catch {
      return null; // an unknown commit is a closed answer (witness_commit_unknown), not a throw
    }
  };
}

/** G-PROV keyer-provenance arm. PURE given the injected witness. */
export function checkKeyerProv({ shards = [], lsTree = undefined, headTree = undefined, staged = undefined } = {}) {
  const v = [];
  const counts = { shards: 0, sealed_without_b: 0, witnessed: 0 };
  const seals = new Map();
  const head = new Set(headTree || []);
  const stagedSet = new Set(staged || []);
  let notRun = null;
  for (const s of [...shards].sort((a, b) => cmpStr(a.key, b.key))) {
    counts.shards++;
    const aPath = s.paths && s.paths.a;
    const bPath = s.paths && s.paths.b;
    // a staged .a needs its .b staged or committed — whether or not a .b exists on disk
    if (s.a) {
      if (staged === undefined || headTree === undefined) notRun = notRun || 'staged / HEAD paths not injected';
      else if (aPath && stagedSet.has(aPath) && !(bPath && (stagedSet.has(bPath) || head.has(bPath)))) v.push(violation('a_staged_without_b', s.key, `${aPath} is staged; ${bPath} is neither staged nor committed`));
    }
    if (s.a && !s.b) {
      counts.sealed_without_b++; // pending (M-45)
      continue;
    }
    if (!s.b) continue;
    if (!s.a) {
      v.push(violation('seal_mismatch', s.key, 'a .b draft with no .a draft: there is no A draft for the seal to equal'));
      continue;
    }
    const p = s.prov;
    if (!p) {
      v.push(violation('prov_missing', s.key, 'a .b draft without its .prov.json'));
      continue;
    }
    const missing = PROV_FIELDS.filter((f) => {
      const x = get(p, f);
      if (f === 'b_run.read_paths') return !Array.isArray(x) || x.some((y) => typeof y !== 'string');
      if (f === 'b_run.worktree_commit') return !OID.test(String(x ?? '')); // an object id, never a moving ref like HEAD
      if (f === 'unit_shas') return !x || typeof x !== 'object' || Array.isArray(x);
      if (f === 'a_seal.seal_id') return !Number.isSafeInteger(x) || x < 1;
      return !isStr(x);
    });
    if (missing.length) {
      v.push(violation('prov_field_missing', s.key, missing.join(', ')));
      continue;
    }
    if (p.keyers.a.id === p.keyers.b.id) v.push(violation('keyers_not_distinct', s.key, `both keyers are ${p.keyers.a.id}`));
    if (s.a && p.a_seal.sha256 !== s.a_sha256) v.push(violation('seal_mismatch', s.key, `seal ${p.a_seal.sha256.slice(0, 12)}… ≠ .a ${String(s.a_sha256).slice(0, 12)}…`));
    if (seals.has(p.a_seal.seal_id)) v.push(violation('seal_id_duplicate', s.key, `seal id ${p.a_seal.seal_id} is also ${seals.get(p.a_seal.seal_id)}'s`));
    else seals.set(p.a_seal.seal_id, s.key);
    const leaked = p.b_run.read_paths.filter((x) => A_DRAFT.test(String(x)));
    if (leaked.length) v.push(violation('a_in_b_read_paths', s.key, `B's ledger read ${leaked.join(', ')}`));
    if (typeof lsTree !== 'function') {
      notRun = notRun || 'the git ls-tree witness was not injected';
      continue;
    }
    const tree = lsTree(p.b_run.worktree_commit);
    if (tree === null || tree === undefined) {
      v.push(violation('witness_commit_unknown', s.key, `commit ${p.b_run.worktree_commit} does not resolve`));
      continue;
    }
    counts.witnessed++;
    if (aPath && tree.includes(aPath)) v.push(violation('a_visible_to_b', s.key, `${aPath} is in B's worktree commit ${p.b_run.worktree_commit}`));
  }
  return gateResult({ violations: v, checked: counts.shards, counts, notRun: v.length ? null : notRun });
}

const REGISTER_ROW = /^\|\s*(?:\*\*(M-\d+|P-\d+)\*\*|~~(M-\d+|P-\d+)~~)\s*\|/;

/** Ids that open two Spec 69 register rows (parseRulings keeps the last silently — lesson 10). PURE. */
export function duplicateRulings(text) {
  const n = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const m = REGISTER_ROW.exec(line);
    if (m) n.set(m[1] || m[2], (n.get(m[1] || m[2]) || 0) + 1);
  }
  return [...n].filter(([, k]) => k > 1).map(([id]) => id).sort(cmpStr);
}

/** G-PROV ruling-id arm. PURE. */
export function checkRulingIds({ spec69Text = '', ledger = null, adjudications = null } = {}) {
  const v = [];
  const rulings = parseRulings(spec69Text);
  const counts = { rulings: rulings.size, ledger_rows: 0, adjudications: 0 };
  if (rulings.size === 0) v.push(violation('rulings_empty', 'docs/specs/01-pipeline/69_mcbylaw_policy.md', 'the register parses to 0 rulings'));
  for (const id of duplicateRulings(spec69Text)) v.push(violation('ruling_duplicate', id, 'two register rows open with this id'));
  const rows = ledger && Array.isArray(ledger.rows) ? ledger.rows : [];
  rows.forEach((r, i) => {
    counts.ledger_rows++;
    const id = `ratchet-exceptions.json#${i}`;
    if (rulings.get(r && r.ruling) !== 'RATIFIED') v.push(violation('ruling_not_ratified', id, `${r && r.ruling} is ${rulings.get(r && r.ruling) || 'absent'} in Spec 69`));
    else if (!r || r.anchor !== `**${r.ruling}**` || !String(spec69Text).includes(r.anchor)) v.push(violation('ruling_anchor_missing', id, `anchor ${JSON.stringify(r && r.anchor)} must be "**${r && r.ruling}**", cited literally in Spec 69`));
  });
  for (const e of (adjudications && adjudications.adjudications) || []) {
    if (!e || e.kind === 'disagreement') continue; // G-AGREE owns those
    counts.adjudications++;
    const id = e.id ?? '?';
    if (!isStr(e.adjudicator)) v.push(violation('adjudication_unattributed', id, `kind ${e.kind}`));
    const need = KIND_RULING[e.kind];
    if (need && e.ruling !== need) v.push(violation('adjudication_ruling_wrong', id, `a ${e.kind} adjudication cites ${e.ruling}, not ${need}`));
    else if (isStr(e.ruling) && rulings.size && rulings.get(e.ruling) !== 'RATIFIED') v.push(violation('ruling_not_ratified', id, `${e.ruling} is ${rulings.get(e.ruling) || 'absent'} in Spec 69`));
  }
  return gateResult({ violations: v, checked: counts.ledger_rows + counts.adjudications + 1, counts });
}

function runFixtures(fixtures, check, codes) {
  const results = [];
  for (const f of fixtures) {
    const r = check(f.input);
    const got = [...new Set(r.violations.map((x) => x.code))];
    const ok = f.reason === null ? r.status === 'pass' : r.status === 'fail' && got.length === 1 && got[0] === f.reason;
    results.push({ name: f.name, expected: f.reason, got, ok });
  }
  const covered = new Set(results.map((x) => x.expected).filter(Boolean));
  for (const c of codes) if (!covered.has(c)) results.push({ name: `fixture for ${c}`, expected: c, got: [], ok: false });
  return { pass: results.every((x) => x.ok), results };
}
export const keyerSelfTest = () => runFixtures(keyerFixtures(), checkKeyerProv, REASON_CODES);
export const rulingSelfTest = () => runFixtures(rulingFixtures(), checkRulingIds, RULING_REASON_CODES);
/** Both arms. */
export function selfTest() {
  const k = keyerSelfTest();
  const r = rulingSelfTest();
  return { pass: k.pass && r.pass, results: [...k.results, ...r.results] };
}
