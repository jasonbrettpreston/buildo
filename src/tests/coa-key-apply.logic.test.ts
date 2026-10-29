// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.318 (one values-only answer key), m.321 (pre-registered rounds), m.323 (one intake routine)
// SPEC LINK: decision log 2026-10-25-batch-g#CHAT-157.SPLIT-DECISION-ROUND
//
// RED/GREEN lock for scripts/analysis/bylaw-validation/coa-key-apply.mjs: one pre-registered round's decision moves applied
// to the 2017 key batch, refusing (throwing) on every mismatch instead of guessing. Every throwing case also asserts the
// input is unchanged. Base red = this file before the applier existed. A mutant red names ONE in-memory patch of the real
// applier source by env (COA_KEY_APPLY_MUTANT=<name>); the patched copy is written beside a copy of coa-key.mjs in a
// per-run os.tmpdir() root, never in the tree. Synthetic 6-row batch: invented file numbers, values only, no DB.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(__dirname, '../..');
const DIR_REL = 'scripts/analysis/bylaw-validation';
const APPLIER = path.join(ROOT, DIR_REL, 'coa-key-apply.mjs');
// realpath: on macOS os.tmpdir() is a symlink (/var -> /private/var), and the applier's main guard compares paths literally.
const TMP = fs.realpathSync(os.tmpdir());
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- loose JSON fixtures

const del = (s: string): [string, string] => [s, ''];
// prettier-ignore
const MUT = {
  'no-stamp': [['r.decision = a.decision; r.table[EV] = a.extractor_version; r.table[VV] = a.vocab_version;', 'r.decision = a.decision;']],
  'no-from-assert': [del("    if (r.decision !== m.from || b.decision !== m.from) throw new Error(`coa-key-apply: ${m.notice}#${m.n} from-mismatch (key ${r.decision}, before ${b.decision}, prereg ${m.from})`);\n")],
  'no-rest-check': [del("  for (const [k, b] of B) if (!moved.has(k) && A.get(k).decision !== b.decision) throw new Error(`coa-key-apply: unexpected move at ${k.split('|').slice(1).join('#')}`);\n")],
  'no-batch-check': [del("  if (prereg.batch !== BATCH_2017) throw new Error(`coa-key-apply: prereg batch ${prereg.batch} is not ${BATCH_2017}`);\n")],
  'no-to-assert': [del("    if (a.decision !== m.to) throw new Error(`coa-key-apply: ${m.notice}#${m.n} to-mismatch (after ${a.decision}, prereg ${m.to})`);\n")],
  'no-stamp-assert': [del("    if (r.table[EV] !== b.extractor_version || r.table[VV] !== b.vocab_version) throw new Error(`coa-key-apply: ${m.notice}#${m.n} stamp-mismatch`);\n")],
  'no-keyset-check': [del("  if (B.size !== A.size || [...B.keys()].some((k) => !A.has(k))) throw new Error('coa-key-apply: before and after hold different keys');\n")],
  'no-missing-check': [del("    if (!r || !b || !a) throw new Error(`coa-key-apply: ${m.notice}#${m.n} missing (key ${!!r}, before ${!!b}, after ${!!a})`);\n")],
  'no-twice-check': [del("    if (moved.has(k)) throw new Error(`coa-key-apply: ${m.notice}#${m.n} moved twice`);\n")],
  'no-empty-check': [del("  if (!Array.isArray(prereg.expected_moves) || prereg.expected_moves.length === 0) throw new Error('coa-key-apply: expected_moves is empty');\n")],
  'no-move-check': [del("  for (const m of prereg.expected_moves) if (m.from === m.to || !DECISIONS.includes(m.from) || !DECISIONS.includes(m.to)) throw new Error(`coa-key-apply: ${m.notice}#${m.n} move ${m.from} -> ${m.to} is not a move between decisions`);\n")],
  'no-row-batch-check': [del("  if (rows.some((r) => r.source_batch !== BATCH_2017)) throw new Error(`coa-key-apply: a key row is not in ${BATCH_2017}`);\n")],
  'no-ts-check': [del("  if (snap.ts !== ts) throw new Error(`coa-key-apply: snapshot ts ${snap.ts} is not this attempt's ${ts}`);\n")],
  'root-default-cwd': [["const root = need('--root');", "const root = arg('--root') || process.cwd();"]],
  'literal-main-guard': [['if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {', 'if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {']],
  'no-after-stamp-check': [del("    if (typeof a.extractor_version !== 'string' || typeof a.vocab_version !== 'string') throw new Error(`coa-key-apply: ${m.notice}#${m.n} after-stamp missing`);\n")],
};
/** The applier to test: the real file, or (red runs) a patched copy beside a copy of coa-key.mjs in a tmp root. */
function applierPath(): string {
  const name = process.env.COA_KEY_APPLY_MUTANT;
  if (!name) return APPLIER;
  const ps = (MUT as unknown as Record<string, string[][]>)[name];
  if (!ps) throw new Error(`unknown key-apply mutant ${name}`);
  let s = fs.readFileSync(APPLIER, 'utf8');
  for (const [f, r] of ps as Array<[string, string]>) { if (!s.includes(f)) throw new Error(`key-apply mutant ${name} does not apply`); s = s.replace(f, r); }
  const dir = path.join(fs.mkdtempSync(path.join(TMP, 'coa-key-apply-')), DIR_REL);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, DIR_REL, 'coa-key.mjs'), path.join(dir, 'coa-key.mjs'));
  fs.writeFileSync(path.join(dir, 'coa-key-apply.mjs'), s);
  return path.join(dir, 'coa-key-apply.mjs');
}
const FILE = applierPath();
const M = (await import(pathToFileURL(FILE).href)) as Json;

const B17 = 'coa-2017-decisions';
const row = (i: number, d: string): Json => ({ file_number: `A900${i}/17TEY`, item: 1, clause: null, required_value: null, required_unit: null, proposed_value: null, proposed_unit: null,
  decision: d, decision_date: '2017-01-01', doc_type: 'decision_notice', source_batch: B17, lot_ref: `A900${i}/17TEY`, table: [null, null, null, null, null, null, null, null, null, null, null, 'coa-extractor-3', 'coa-vocab-3'] });
const ROWS = (): Json[] => [row(1, 'refused'), row(2, 'approved'), row(3, 'approved'), row(4, 'refused'), row(5, 'approved_with_conditions'), row(6, 'approved')];
const snap = (rows: Json[]): Json[] => rows.map((r) => ({ variance_key: `toronto_ca_decision_pdf|${r.file_number}|${r.item}`, decision: r.decision, extractor_version: r.table[11], vocab_version: r.table[12] }));
const MOVES = [{ notice: 'A9001/17TEY', n: 1, from: 'refused', to: 'approved' }, { notice: 'A9002/17TEY', n: 1, from: 'approved', to: 'refused' }];
const PRE = (moves: Json[] = MOVES, batch = B17): Json => ({ batch, expected_moves: moves });
const AFTER = (before: Json[], moves: Json[] = MOVES): Json[] => {
  const mv = new Map(moves.map((m) => [`toronto_ca_decision_pdf|${m.notice}|${m.n}`, m.to]));
  return before.map((b) => (mv.has(b.variance_key) ? { ...b, decision: mv.get(b.variance_key), extractor_version: 'coa-extractor-4', vocab_version: 'coa-vocab-4' } : b));
};
function refuses(f: () => unknown, re: RegExp, rows: Json[]): void {
  const copy = JSON.stringify(rows);
  expect(f).toThrow(re);
  expect(JSON.stringify(rows)).toBe(copy);
}

describe('coa-key-apply: one pre-registered round applied to the 2017 key, refusing on any mismatch', () => {
  it('K-1 applies the moves and the after-stamps; every other row is unchanged', () => {
    const rows = ROWS(); const b = snap(rows);
    const r = M.applyRound(rows, PRE(), b, AFTER(b));
    expect(r.applied).toBe(2);
    expect(r.rows.slice(0, 2).map((x: Json) => [x.decision, x.table[11], x.table[12]])).toEqual([['approved', 'coa-extractor-4', 'coa-vocab-4'], ['refused', 'coa-extractor-4', 'coa-vocab-4']]);
    expect(r.rows.slice(2)).toEqual(ROWS().slice(2));
    expect(rows).toEqual(ROWS());
  });
  it('K-2 from-mismatch: the key decision is not the prereg from', () => {
    const rows = ROWS(); rows[0]!.decision = 'approved_with_conditions'; const b = snap(ROWS());
    refuses(() => M.applyRound(rows, PRE(), b, AFTER(b)), /from-mismatch/, rows);
  });
  it('K-3 a re-run on the applied key refuses (from-mismatch; keep this regex strict: without the from check it throws stamp-mismatch)', () => {
    const rows = ROWS(); const b = snap(rows); const a = AFTER(b);
    const once = M.applyRound(rows, PRE(), b, a).rows;
    refuses(() => M.applyRound(once, PRE(), b, a), /from-mismatch/, once);
  });
  it('K-4 an unexpected move in after', () => {
    const rows = ROWS(); const b = snap(rows); const a = AFTER(b); a[3] = { ...a[3], decision: 'approved' };
    refuses(() => M.applyRound(rows, PRE(), b, a), /unexpected move/, rows);
  });
  it('K-5 a prereg of another batch', () => {
    const rows = ROWS(); const b = snap(rows);
    refuses(() => M.applyRound(rows, PRE(MOVES, 'coa-2026-a'), b, AFTER(b)), /prereg batch/, rows);
  });
  it('K-6 to-mismatch: after disagrees with the prereg to', () => {
    const rows = ROWS(); const b = snap(rows); const a = AFTER(b); a[0] = { ...a[0], decision: 'approved_with_conditions' };
    refuses(() => M.applyRound(rows, PRE(), b, a), /to-mismatch/, rows);
  });
  it('K-7 stamp-mismatch: before stamps are not the key stamps', () => {
    const rows = ROWS(); const b = snap(rows).map((x) => ({ ...x, extractor_version: 'coa-extractor-2' }));
    refuses(() => M.applyRound(rows, PRE(), b, AFTER(b)), /stamp-mismatch/, rows);
  });
  it('K-8 before and after hold different keys (message regex required)', () => {
    const rows = ROWS(); const b = snap(rows); const a = AFTER(b); a[5] = { ...a[5], variance_key: 'toronto_ca_decision_pdf|A9999/17TEY|1' };
    refuses(() => M.applyRound(rows, PRE(), b, a), /different keys/, rows);
  });
  it('K-9 a move whose row is missing (message regex required)', () => {
    const rows = ROWS(); const b = snap(rows);
    refuses(() => M.applyRound(rows, PRE([...MOVES, { notice: 'A9009/17TEY', n: 1, from: 'approved', to: 'refused' }]), b, AFTER(b)), /missing/, rows);
  });
  it('K-10 the same move listed twice (message regex required: without the check the from-assert still refuses)', () => {
    const rows = ROWS(); const b = snap(rows);
    refuses(() => M.applyRound(rows, PRE([MOVES[0]!, MOVES[0]!]), b, AFTER(b, [MOVES[0]!])), /moved twice/, rows);
  });
  it('K-11 an empty move list', () => {
    const rows = ROWS(); const b = snap(rows);
    refuses(() => M.applyRound(rows, PRE([]), b, b), /expected_moves is empty/, rows);
  });
  it('K-12 a move that is not a move between decisions', () => {
    const rows = ROWS(); const b = snap(rows);
    refuses(() => M.applyRound(rows, PRE([{ ...MOVES[0]!, to: 'refused' }]), b, b), /not a move between decisions/, rows);
  });
  it('K-13 a key row of another batch', () => {
    const rows = ROWS(); rows[5] = { ...rows[5], source_batch: 'coa-2026-a' }; const b = snap(rows);
    refuses(() => M.applyRound(rows, PRE(), b, AFTER(b)), /not in coa-2017-decisions/, rows);
  });
  it('K-14 a snapshot of another attempt (ts) is refused; this attempt\'s rows come back', () => {
    expect(() => M.snapshotRows({ ts: '20261026t0100z', rows: [] }, '20261026t0200z')).toThrow(/snapshot ts/);
    expect(M.snapshotRows({ ts: '20261026t0100z', rows: [1] }, '20261026t0100z')).toEqual([1]);
  });
  it('K-16 the CLI body runs when invoked through a symlinked path (no silent exit 0): without --root it refuses', () => {
    const real = fs.mkdtempSync(path.join(TMP, 'coa-key-link-'));
    fs.copyFileSync(FILE, path.join(real, 'coa-key-apply.mjs'));
    fs.copyFileSync(path.join(path.dirname(FILE), 'coa-key.mjs'), path.join(real, 'coa-key.mjs'));
    const link = `${real}-link`;
    fs.symlinkSync(real, link, 'dir');
    let out = '';
    let code = 0;
    try { execFileSync(process.execPath, [path.join(link, 'coa-key-apply.mjs'), '--ts', 't1'], { cwd: real, stdio: 'pipe' }); } catch (e) { code = (e as Json).status; out = String((e as Json).stderr); }
    expect(code).not.toBe(0);
    expect(out).toMatch(/--root is required/);
  });
  it('K-17 an after-row without its extractor / vocab stamps is refused (after-stamp missing)', () => {
    const rows = ROWS(); const b = snap(rows); const a = AFTER(b); a[0] = { ...a[0], extractor_version: undefined };
    refuses(() => M.applyRound(rows, PRE(), b, a), /after-stamp missing/, rows);
  });
  it('K-15 the CLI requires --root (a cwd holding a key is never written) and writes only that root', () => {
    const tmp = fs.mkdtempSync(path.join(TMP, 'coa-key-cli-'));
    const kd = path.join(tmp, 'scripts/seeds/bylaw/validation/coa-key');
    fs.mkdirSync(kd, { recursive: true });
    const rows = ROWS();
    const text = `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`;
    fs.writeFileSync(path.join(kd, `${B17}.json`), text);
    fs.writeFileSync(path.join(kd, 'manifest.json'), JSON.stringify({ schema: 'coa-key-manifest-v1', batches: { [B17]: { rows: 6, files: 6, sha256: 'x' } } }));
    const b = snap(rows);
    const w = (n: string, o: unknown) => { const p = path.join(tmp, n); fs.writeFileSync(p, JSON.stringify(o)); return p; };
    const args = ['--ts', 't1', '--prereg', w('pre.json', PRE()), '--before', w('b.json', { ts: 't1', rows: b }), '--after', w('a.json', { ts: 't1', rows: AFTER(b) })];
    let noRoot = 'exit 0';
    try { execFileSync(process.execPath, [FILE, ...args], { cwd: tmp, stdio: 'pipe' }); } catch { noRoot = 'refused'; }
    expect(noRoot).toBe('refused');
    expect(fs.readFileSync(path.join(kd, `${B17}.json`), 'utf8')).toBe(text);
    const out = execFileSync(process.execPath, [FILE, '--root', tmp, ...args], { cwd: ROOT, stdio: 'pipe' }).toString();
    expect(out).toMatch(/applied=2 rows=6 files=6/);
  });
});
