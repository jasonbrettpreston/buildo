// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.318 (one values-only answer key), m.321 (pre-registered rounds), m.323 (one intake routine), m.305 (CoA tools in coa-*)
// SPEC LINK: decision log 2026-10-25-batch-g#CHAT-157.SPLIT-DECISION-ROUND; 2026-10-26-batch-j#CHAT-169.SPLIT-THREE-FAMILIES
// Applies ONE pre-registered round's decision moves to the 2017 key batch (coa-2017-decisions), values only. It is not an intake:
// M-323's routine (oracle-c-run.mjs --build-key) adds batches; this edits rows a round re-ingested. It writes through coa-key.mjs writeBatch,
// so the key's shape, validation and manifest stay one routine. It reads no database and refuses (throws) rather than re-applies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKey, writeBatch, BATCH_2017, TABLE_FIELDS, DECISIONS } from './coa-key.mjs';

const EV = TABLE_FIELDS.indexOf('extractor_version');
const VV = TABLE_FIELDS.indexOf('vocab_version');
const vkey = (file, item) => `toronto_ca_decision_pdf|${file}|${item}`;

/** Pure. rows: the 2017 key rows; prereg: {batch, expected_moves[{notice,n,from,to}]}; before/after: §3 snapshot rows. Returns new rows. */
export function applyRound(rows, prereg, before, after) {
  if (prereg.batch !== BATCH_2017) throw new Error(`coa-key-apply: prereg batch ${prereg.batch} is not ${BATCH_2017}`);
  if (!Array.isArray(prereg.expected_moves) || prereg.expected_moves.length === 0) throw new Error('coa-key-apply: expected_moves is empty');
  for (const m of prereg.expected_moves) if (m.from === m.to || !DECISIONS.includes(m.from) || !DECISIONS.includes(m.to)) throw new Error(`coa-key-apply: ${m.notice}#${m.n} move ${m.from} -> ${m.to} is not a move between decisions`);
  if (rows.some((r) => r.source_batch !== BATCH_2017)) throw new Error(`coa-key-apply: a key row is not in ${BATCH_2017}`);
  const B = new Map(before.map((r) => [r.variance_key, r]));
  const A = new Map(after.map((r) => [r.variance_key, r]));
  if (B.size !== A.size || [...B.keys()].some((k) => !A.has(k))) throw new Error('coa-key-apply: before and after hold different keys');
  const out = rows.map((r) => ({ ...r, table: Array.isArray(r.table) ? [...r.table] : r.table }));
  const byKey = new Map(out.map((r) => [vkey(r.file_number, r.item), r]));
  const moved = new Set();
  for (const m of prereg.expected_moves) {
    const k = vkey(m.notice, m.n);
    const r = byKey.get(k); const b = B.get(k); const a = A.get(k);
    if (!r || !b || !a) throw new Error(`coa-key-apply: ${m.notice}#${m.n} missing (key ${!!r}, before ${!!b}, after ${!!a})`);
    if (moved.has(k)) throw new Error(`coa-key-apply: ${m.notice}#${m.n} moved twice`);
    if (r.decision !== m.from || b.decision !== m.from) throw new Error(`coa-key-apply: ${m.notice}#${m.n} from-mismatch (key ${r.decision}, before ${b.decision}, prereg ${m.from})`);
    if (a.decision !== m.to) throw new Error(`coa-key-apply: ${m.notice}#${m.n} to-mismatch (after ${a.decision}, prereg ${m.to})`);
    if (typeof a.extractor_version !== 'string' || typeof a.vocab_version !== 'string') throw new Error(`coa-key-apply: ${m.notice}#${m.n} after-stamp missing`);
    if (r.table[EV] !== b.extractor_version || r.table[VV] !== b.vocab_version) throw new Error(`coa-key-apply: ${m.notice}#${m.n} stamp-mismatch`);
    r.decision = a.decision; r.table[EV] = a.extractor_version; r.table[VV] = a.vocab_version;
    moved.add(k);
  }
  for (const [k, b] of B) if (!moved.has(k) && A.get(k).decision !== b.decision) throw new Error(`coa-key-apply: unexpected move at ${k.split('|').slice(1).join('#')}`);
  return { rows: out, applied: moved.size };
}

/** A slot snapshot is {ts, rows}; its ts must be this attempt's $TS (L-C). */
export function snapshotRows(snap, ts) {
  if (!snap || typeof snap.ts !== 'string' || !Array.isArray(snap.rows)) throw new Error('coa-key-apply: a snapshot is not {ts, rows}');
  if (snap.ts !== ts) throw new Error(`coa-key-apply: snapshot ts ${snap.ts} is not this attempt's ${ts}`);
  return snap.rows;
}

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
// realpath both sides: Node realpaths import.meta.url but not argv[1], so a symlinked invocation must not skip the body (exit 0, no write).
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const need = (n) => { const v = arg(n); if (!v) throw new Error(`coa-key-apply: ${n} is required`); return v; };
  const root = need('--root'); // required: never the cwd of whichever worktree the shell is in (L-E)
  const ts = need('--ts');
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const prereg = read(need('--prereg')); const before = snapshotRows(read(need('--before')), ts); const after = snapshotRows(read(need('--after')), ts);
  const { rows } = readKey(root, [BATCH_2017]);
  const { rows: next, applied } = applyRound(rows, prereg, before, after);
  const m = writeBatch(root, BATCH_2017, next);
  console.log(`coa-key-apply: ${BATCH_2017} applied=${applied} rows=${m.rows} files=${m.files} sha256=${m.sha256}`);
}
