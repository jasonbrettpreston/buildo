// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 5 ("seals A's hash before B's brief … keyer B
//            (DeepSeek, separate worktree at a commit without A's draft, `.b` write scope) … the shard's provenance record
//            is committed with both drafts"), §9 G-PROV keyer arm (witnessed `git ls-tree`; declared-only ledger read
//            paths), G-AGREE; docs/specs/01-pipeline/69_mcbylaw_policy.md M-17; docs/reports/mcbylaw-phase1-plan.md A1..A7
//
// The keyer-B runner against REAL git worktrees (temp repos) with a stub engine: seal-before-B ordering, the blindness
// witness, and an end-to-end 2-unit shard (plan → briefs → A draft → seal → B in its worktree → prov → G-PROV + G-AGREE
// pass → a disagreement → queue → operator answer → adjudicated).
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const K = await load('scripts/analysis/bylaw/keying.mjs');
const B = await load('scripts/analysis/bylaw/keyer-b.mjs');
const F = await load('scripts/analysis/bylaw/authored-fixtures.mjs');
const AU = await load('scripts/analysis/bylaw/authored.mjs');
const AG = await load('scripts/analysis/bylaw/agree.mjs');
const KP = await load('scripts/analysis/bylaw/keyer-prov.mjs');
const SPEC68 = fs.readFileSync(path.join(process.cwd(), 'docs/specs/01-pipeline/68_mcbylaw_standard.md'), 'utf8');

// Under a git hook (pre-commit runs `vitest related`) GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE point at the REAL repo:
// every git call below would then act on it (a 2026-10-07 run re-initialised it as bare and committed onto the branch).
// Strip them for this test process so each temp repo is its own repo; the lock below proves it.
for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k];
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-keying-'));
afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let repoN = 0;
function repo() {
  const root = path.join(TMP, `main${repoN++}`);
  fs.mkdirSync(root, { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}
const write = (root: string, rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};

const slice = () => F.fixtureSlice();

describe('loadAuthored reads an enacting:<bylaw> shard by its KEY (the A1 `status` "no A 2", 2026-10-07)', () => {
  it('drafts written at shardPaths(key) load back under that key, with page enacting:<bylaw>', () => {
    const root = path.join(TMP, 'enacting');
    const key = 'enacting:1075-2026/10.5.40.40';
    const p = K.shardPaths(key);
    for (const [k, rel] of Object.entries(p) as [string, string][]) write(root, rel, `${JSON.stringify({ schema: AU.AUTHORED_SCHEMA, shard: key, keyer: k === 'a' ? 'A' : 'B', units: [] })}
`);
    const shards = AU.loadAuthored(root);
    expect(shards.map((s: Json) => [s.key, s.page, s.article, s.paths.a])).toEqual([[key, 'enacting:1075-2026', '10.5.40.40', p.a]]);
    expect(shards[0].a && shards[0].b && shards[0].prov).toBeTruthy();
  });
});
const shard = () => K.planBatch({ slice: slice(), inScopeIds: new Set(['600.60.40(1)']), batch: 'A7' }).shards[0];
const UNITS = () => [F.GOOD['LIMIT×literal (label condition)'], F.GOOD['PERMIT×none']];
const aDoc = (s: Json) => ({ schema: AU.AUTHORED_SCHEMA, shard: s.key, keyer: 'A', units: UNITS(), rows: { '600.60.40(1)': { explanation: 'The overlay caps dwelling units.', code_refs: 'none' } } });

/** The stub engine: records its call, writes B's draft into B's worktree and a ledger, as deepseek-exec would. */
function stubEngine({ calls, bUnits, ledgerDir, readPath = 'scripts/seeds/bylaw/vocab.json' }: Json) {
  return async ({ bRoot, briefRel }: Json) => {
    calls.push({ bRoot, briefRel, brief: fs.readFileSync(path.join(bRoot, briefRel), 'utf8') });
    const s = shard();
    write(bRoot, K.shardPaths(s.key).b, `${JSON.stringify({ schema: AU.AUTHORED_SCHEMA, shard: s.key, keyer: 'B', units: bUnits }, null, 2)}\n`);
    const ledger = path.join(ledgerDir, `run-${calls.length}.jsonl`);
    fs.mkdirSync(ledgerDir, { recursive: true });
    fs.writeFileSync(ledger, [{ kind: 'run_start' }, { kind: 'tool_call', tool: 'read_file', args: { path: readPath } }, { kind: 'tool_call', tool: 'write_file', args: { path: K.shardPaths(s.key).b } }].map((r) => JSON.stringify(r)).join('\n'));
    return { status: 'completed', run_id: `run-${calls.length}`, ledger_path: ledger };
  };
}

describe('hook-env isolation (the temp repos never touch the repository under test)', () => {
  it('no GIT_* variable leaks into the git calls; gitIn strips them even when set', () => {
    expect(Object.keys(process.env).filter((k) => /^GIT_/.test(k))).toEqual([]);
    const main = repo();
    const top = git(main, 'rev-parse', '--show-toplevel');
    process.env.GIT_DIR = path.join(process.cwd(), '.git-does-not-exist');
    try {
      expect(B.gitIn(main, ['rev-parse', '--show-toplevel']).replace(/\\/g, '/')).toBe(top.replace(/\\/g, '/'));
    } finally {
      delete process.env.GIT_DIR;
    }
  });
});

describe('keyer-B runner: ordering and blindness (fail closed, before the engine runs)', () => {
  it('no seal → seal_missing; an A draft edited after its seal → seal_mismatch; the engine is never called', async () => {
    const main = repo();
    const s = shard();
    const bRoot = path.join(TMP, 'kb-order');
    B.ensureKeyerBWorktree({ mainRoot: main, bRoot });
    const calls: Json[] = [];
    const runEngine = stubEngine({ calls, bUnits: UNITS().map(F.bDraftOf), ledgerDir: path.join(TMP, 'ledger-order') });
    const aBytes = Buffer.from(JSON.stringify(aDoc(s)));
    const seal = K.sealDraft({ aBytes, shardKey: s.key });
    await expect(B.runKeyerB({ bRoot, shard: s, briefB: { text: 'b' }, seal: null, aSha: K.draftSha(aBytes), runEngine })).rejects.toThrow(/seal_missing/);
    await expect(B.runKeyerB({ bRoot, shard: s, briefB: { text: 'b' }, seal, aSha: K.draftSha(Buffer.from('{"edited":1}')), runEngine })).rejects.toThrow(/seal_mismatch/);
    expect(calls).toEqual([]);
  });

  it('B worktree at a commit that holds A\'s draft → a_visible_to_b (git ls-tree witness); an A draft on disk in B → a_present_in_b_worktree', async () => {
    const main = repo();
    const s = shard();
    const p = K.shardPaths(s.key);
    write(main, p.a, JSON.stringify(aDoc(s)));
    git(main, 'add', p.a);
    git(main, 'commit', '-q', '-m', 'A committed too early');
    const bRoot = path.join(TMP, 'kb-leak');
    const commit = B.ensureKeyerBWorktree({ mainRoot: main, bRoot });
    expect(KP.gitLsTree(bRoot)(commit)).toContain(p.a);
    const calls: Json[] = [];
    const aBytes = fs.readFileSync(path.join(main, p.a));
    const seal = K.sealDraft({ aBytes, shardKey: s.key });
    await expect(B.runKeyerB({ bRoot, shard: s, briefB: { text: 'b' }, seal, aSha: K.draftSha(aBytes), runEngine: stubEngine({ calls, bUnits: [], ledgerDir: TMP }) })).rejects.toThrow(/a_visible_to_b/);
    // an untracked A draft dropped into an otherwise blind B worktree
    const main2 = repo();
    const bRoot2 = path.join(TMP, 'kb-untracked');
    const c2 = B.ensureKeyerBWorktree({ mainRoot: main2, bRoot: bRoot2 });
    write(bRoot2, p.a, '{}');
    expect(() => B.assertBlind({ bRoot: bRoot2, commit: c2, aPaths: [p.a] })).toThrow(/a_present_in_b_worktree/);
    expect(() => B.assertBlind({ bRoot: bRoot2, commit: 'f'.repeat(40), aPaths: [p.a] })).toThrow(/witness_commit_unknown/);
    expect(calls).toEqual([]);
  });

  it('a B ledger that read an .a path is refused (declared-only arm); B drafting the wrong unit set is refused', async () => {
    const main = repo();
    const s = shard();
    const bRoot = path.join(TMP, 'kb-ledger');
    B.ensureKeyerBWorktree({ mainRoot: main, bRoot });
    const aBytes = Buffer.from(JSON.stringify(aDoc(s)));
    const seal = K.sealDraft({ aBytes, shardKey: s.key });
    const base = { bRoot, shard: s, briefB: { text: 'brief' }, seal, aSha: K.draftSha(aBytes) };
    await expect(B.runKeyerB({ ...base, runEngine: stubEngine({ calls: [], bUnits: UNITS().map(F.bDraftOf), ledgerDir: path.join(TMP, 'l1'), readPath: '../Buildo/x/600.60.40.a.json' }) })).rejects.toThrow(/a_in_b_read_paths/);
    await expect(B.runKeyerB({ ...base, runEngine: stubEngine({ calls: [], bUnits: UNITS().map(F.bDraftOf).slice(0, 1), ledgerDir: path.join(TMP, 'l2') }) })).rejects.toThrow(/b_units_mismatch/);
  });
});

describe('end to end: a 2-unit shard through the harness with a stub keyer B', () => {
  it('plan → briefs → A → seal → B (separate worktree) → prov: G-PROV keyer arm and G-AGREE pass; a disagreement → queue → answer → adjudicated', async () => {
    const main = repo();
    const s = shard();
    const p = K.shardPaths(s.key);
    const briefs = K.buildBriefs({ shard: s, slice: slice(), vocab: F.REAL_VOCAB, specText: SPEC68 });
    // keyer A drafts (uncommitted) and the orchestrator seals BEFORE B's worktree / run exist
    write(main, p.a, `${JSON.stringify(aDoc(s), null, 2)}\n`);
    const seal = K.sealDraft({ aBytes: fs.readFileSync(path.join(main, p.a)), shardKey: s.key, usedSealIds: [4] });
    expect(seal.seal_id).toBe(5);
    const bRoot = path.join(TMP, 'kb-e2e');
    const commit = B.ensureKeyerBWorktree({ mainRoot: main, bRoot });
    expect(commit).toBe(git(main, 'rev-parse', 'HEAD'));
    const calls: Json[] = [];
    const bUnits = (UNITS().map(F.bDraftOf) as Json[]).map((u, i) => (i === 0 ? { ...u, bound: 'min' } : u));
    // B reads "maximum" as a minimum on the first unit: one ⧉ disagreement
    const r = await B.runKeyerB({ bRoot, shard: s, briefB: briefs.b, seal, aSha: K.draftSha(fs.readFileSync(path.join(main, p.a))), aPaths: [p.a], runEngine: stubEngine({ calls, bUnits, ledgerDir: path.join(TMP, 'ledger-e2e') }) });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.brief).toBe(briefs.b.text); // B saw its brief, nothing of A's
    expect(calls[0]?.brief).not.toContain('600.60.40.a.json');
    expect(KP.gitLsTree(bRoot)(r.b_run.worktree_commit)).not.toContain(p.a);
    // collect into the main tree + the provenance record; the three files are committed together
    write(main, p.b, r.b_bytes);
    write(main, p.prov, `${JSON.stringify(K.buildProv({ shardKey: s.key, briefs: { a: briefs.a.sha256, b: briefs.b.sha256 }, seal, bRun: r.b_run, unitShas: briefs.unit_shas }), null, 2)}\n`);
    git(main, 'add', p.a, p.b, p.prov);
    const staged = git(main, 'diff', '--cached', '--name-only').split('\n');
    git(main, 'commit', '-q', '-m', 'shard');
    const shards = AU.loadAuthored(main);
    expect(shards.map((x: Json) => x.key)).toEqual([s.key]);
    const prov = KP.checkKeyerProv({ shards, lsTree: KP.gitLsTree(main), headTree: git(main, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n'), staged });
    expect(prov.violations).toEqual([]);
    expect(prov.status).toBe('pass');
    expect(shards[0].prov.b_run.read_paths).toEqual(['scripts/seeds/bylaw/vocab.json']);
    // G-AGREE: one unit agreed, one pending on `bound`
    const g1 = AG.checkAgree({ shards, vocab: F.REAL_VOCAB });
    expect([g1.status, g1.counts.units_agreed, g1.counts.units_pending]).toEqual(['pass', 1, 1]);
    const q = K.buildQueue({ batch: 'A7', agree: g1, slice: slice(), shards });
    expect(q.items.map((i: Json) => [i.unit, i.field, i.a.canonical, i.b.canonical, i.keyers])).toEqual([['600.60.40(1)#(1)(A)', 'bound', 'max', 'min', { a: 'keyer-a:claude', b: 'keyer-b:deepseek' }]]);
    const md = K.renderQueueMd(q).replace(/^answer: $/m, 'answer: A');
    const applied = K.applyAnswers({ queue: q, answers: K.parseAnswers(md).answers, adjudicator: 'operator', on: '2026-10-07' });
    const g2 = AG.checkAgree({ shards, adjudications: { adjudications: applied.entries }, vocab: F.REAL_VOCAB });
    expect(g2.violations).toEqual([]);
    expect([g2.counts.units_agreed, g2.counts.units_adjudicated, g2.counts.units_pending]).toEqual([1, 1, 0]);
    expect(g2.units.get('600.60.40(1)#(1)(A)').unit.bound).toBe('max');
  });
});
