// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (`pending:stale`: an adoption changed the unit's
//            normalized text; counted, never failing; `complete` needs (e) every pin current), §6
//            `verified_against_sha256`, §6.4 rule 9 (re-verification after a text change needs a new draft pair), §9
//            G-CHANGE (stale units in the change report) + G-AUDIT (git witness: the bar's commit is an ancestor of the
//            sample record's commit), SC-7; docs/specs/01-pipeline/69_mcbylaw_policy.md M-29, M-45;
//            .cursor/mcbylaw/phase2-check/REDTEAM.md A9 (evidence redteam/out/G10c.result.txt: "10.20.40.70(3)(E)
//            1.8 → 2.1 m adopted; 523/523 green; the G-CHANGE stale-unit arm is unwired")
//
// Red-team attack A9 reproduced on the REAL snapshot: an authored row pinned at the current adoption; a legitimate
// adoption changes 10.20.40.70(3)(E) 1.8 → 2.1 m (the same edit as mut.mjs G10c); the change record names exactly
// the changed pinned unit stale, G-SHAPE says `pending:stale` (never `complete`) until re-keyed, and a re-pin without a
// new draft pair is caught. The git witnesses run against this repository.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SL = await load('scripts/analysis/bylaw/slice.mjs');
const FX = await load('scripts/analysis/bylaw/authored-fixtures.mjs');
const SH = await load('scripts/analysis/bylaw/shape.mjs');
const SA = await load('scripts/analysis/bylaw/stale-arm.mjs');
const AU = await load('scripts/analysis/bylaw/audit.mjs');
const SEEDS = path.join(ROOT, 'scripts', 'seeds', 'bylaw');
const LOCK_REL = 'scripts/seeds/bylaw/slice.lock.json';
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// the base = the committed snapshot; the adoption = the same pages with mut.mjs G10c's edit
const FROM = '1.8 metres if the required minimum';
const TO = '2.1 metres if the required minimum';
const baseSnap = SL.loadSnapshotPages(SEEDS);
const baseSlice = SL.sliceSnapshot(baseSnap);
const nextSnap = { ...baseSnap, pages: baseSnap.pages.map((p: Json) => (p.key === 'ch10_20' ? { ...p, html: p.html.replace(FROM, TO), normalized: p.normalized.replace(FROM, TO) } : p)) };
const nextSlice = SL.sliceSnapshot(nextSnap);
const BAND = '10.20.40.70(3)#(3)'; // the band unit: its text includes (E)
const LEAF_A = '10.20.40.70(3)#(3)(A)'; // a leaf whose text (and lead-in) the edit does not touch
const vocab = FX.REAL_VOCAB;
const shardAt = (slice: Json) => FX.shardOf([clone(FX.GOOD['LIMIT×band']), clone(FX.GOOD['LIMIT×literal'])], { key: 'ch10_20/10.20.40.70', slice });
const statusOf = (slice: Json, shards: Json[]) => SH.checkShape({ slice, shards, vocab }).rows.find((r: Json) => r.regulation_id === '10.20.40.70(3)').row_status;
const baseLockText = fs.readFileSync(path.join(ROOT, LOCK_REL), 'utf8');
// The A9 base is the CURRENT adoption (working tree = what a pre-commit sees staged), so its blob oracle is git's own hash of
// the working-tree file — never HEAD, which lags the adoption mid-change. The git-witness suite below asserts only on the
// already-COMMITTED lock (HEAD's blob), so every test holds both mid-change (staged) and committed.
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); // the lock is MBs since adoption-4
const baseLockOid = git('hash-object', '--no-filters', LOCK_REL).trim();
const nextId = 'adoption-next';
const adoptions = [...readJson('scripts/seeds/bylaw/adoptions.json').adoptions, { adoption_id: nextId }];
const GW = await load('scripts/analysis/bylaw/git-witness.mjs');
const SNAPM = await load('scripts/analysis/bylaw/snapshot.mjs');
const PROV_PATH = 'scripts/seeds/bylaw/authored/ch10_20/10.20.40.70.prov.json';
/** The arm's input: history commit 0 = the REAL committed base lock + the shard's provenance; commit 1 = the record. */
const armInput = (record: Json, thenShard: Json, nowShard: Json = thenShard) => {
  const text = SNAPM.stableStringify(record);
  const witness = GW.fakeWitness([{ [LOCK_REL]: baseLockText, [PROV_PATH]: SNAPM.stableStringify(thenShard.prov) }, { [SA.recordPathOf(record.adoption_id)]: text }, { 'b-worktree.txt': 'B drafts here' }]);
  return { adoptions, slice: nextSlice, record, recordText: text, shards: [nowShard], witness };
};

describe('red-team A9 on the real snapshot: an adopted text change to an authored unit', () => {
  it('the edit changes exactly one leaf of 10.20.40.70(3): (3)(E)', () => {
    const b = new Map(baseSlice.units.map((u: Json) => [u.unit_id, u.sha256]));
    const changed = nextSlice.units.filter((u: Json) => b.get(u.unit_id) !== u.sha256).map((u: Json) => u.unit_id);
    expect(changed).toEqual(['10.20.40.70(3)#(3)(E)']);
  });
  it('the authored row is complete before the adoption and pending:stale after it (never complete until re-keyed)', () => {
    const shard = shardAt(baseSlice);
    expect(statusOf(baseSlice, [shard])).toBe('complete');
    expect(statusOf(nextSlice, [shard])).toBe('pending:stale');
  });
  it('the change record names exactly the changed pinned unit stale (SC-7: stale = changed exactly, 0 unflagged)', () => {
    const shard = shardAt(baseSlice);
    const rec = SA.buildChangeRecord({ baseLockText, baseSlice, currentSlice: nextSlice, adoptionId: nextId, baseAdoptionId: baseSnap.adoption_id, shards: [shard] });
    expect(rec.adoption_id).toBe(nextId);
    expect(rec.base_adoption).toBe(baseSnap.adoption_id);
    expect(rec.changed).toContain('10.20.40.70(3)#(3)(E)');
    expect(rec.changed).toContain(BAND);
    expect(rec.changed).not.toContain(LEAF_A);
    expect(rec.stale).toEqual([BAND]);
    expect(rec.unflagged_changes).toEqual([]);
    expect(rec.sc7).toEqual({ changed_pinned: 1, newly_stale: 1, equal: true });
    expect(rec.base_lock_blob).toBe(baseLockOid);
  });
  it('the arm, bound to the adoption, passes with the unit counted stale (pending never fails a gate)', () => {
    const shard = shardAt(baseSlice);
    const record = SA.buildChangeRecord({ baseLockText, baseSlice, currentSlice: nextSlice, adoptionId: nextId, baseAdoptionId: baseSnap.adoption_id, shards: [shard] });
    const r = SA.checkStaleArm(armInput(record, shard));
    expect(r.violations).toEqual([]);
    expect(r.status).toBe('pass');
    expect(r.counts.stale).toBe(1);
  });
  it('a re-pin without a new draft pair (prov.unit_shas edited to the new sha) makes G-SHAPE say complete — the arm FAILS it', () => {
    const shard = shardAt(baseSlice);
    const record = SA.buildChangeRecord({ baseLockText, baseSlice, currentSlice: nextSlice, adoptionId: nextId, baseAdoptionId: baseSnap.adoption_id, shards: [shard] });
    const forged = clone(shard);
    forged.prov.unit_shas[BAND] = record.pinned[BAND].after;
    expect(statusOf(nextSlice, [forged])).toBe('complete'); // the hole the arm closes
    const r = SA.checkStaleArm(armInput(record, shard, forged));
    expect(r.status).toBe('fail');
    expect(r.violations.map((x: Json) => x.code)).toEqual(['repinned_without_rekey']);
  });
  it('a re-key (a new A seal over a new draft pair, pinned to the new text) clears it: complete, arm passes', () => {
    const shard = shardAt(baseSlice);
    const record = SA.buildChangeRecord({ baseLockText, baseSlice, currentSlice: nextSlice, adoptionId: nextId, baseAdoptionId: baseSnap.adoption_id, shards: [shard] });
    const band = clone(FX.GOOD['LIMIT×band']);
    band.numeric_expression = band.numeric_expression.map((s: string) => s.replace('< 24.0 m: 1.8 m', '< 24.0 m: 2.1 m'));
    const rekeyed = FX.shardOf([band, clone(FX.GOOD['LIMIT×literal'])], { key: 'ch10_20/10.20.40.70', slice: nextSlice });
    rekeyed.prov.a_seal.seal_id = 2;
    rekeyed.prov.b_run.worktree_commit = GW.fakeWitness([{}, {}, {}]).commits[2]; // B drafted in a worktree holding the adoption
    expect(statusOf(nextSlice, [rekeyed])).toBe('complete');
    const r = SA.checkStaleArm(armInput(record, shard, rekeyed));
    expect(r.violations).toEqual([]);
    expect(r.status).toBe('pass');
    // the same "re-key" drafted by B in a worktree that predates the adoption is not a new draft pair
    const early = clone(rekeyed);
    early.prov.b_run.worktree_commit = GW.fakeWitness([{}]).commits[0];
    expect(SA.checkStaleArm(armInput(record, shard, early)).violations.map((x: Json) => x.code)).toEqual(['repinned_without_rekey']);
  });
  it('a record edited to drop the stale unit is caught (record_mismatch), and an unknown base lock blob fails closed', () => {
    const shard = shardAt(baseSlice);
    const record = SA.buildChangeRecord({ baseLockText, baseSlice, currentSlice: nextSlice, adoptionId: nextId, baseAdoptionId: baseSnap.adoption_id, shards: [shard] });
    const edited = clone(record);
    edited.pinned[BAND].after = edited.pinned[BAND].before;
    edited.stale = [];
    edited.changed = edited.changed.filter((x: string) => x !== BAND);
    expect(SA.checkStaleArm(armInput(edited, shard)).violations.map((x: Json) => x.code)).toContain('record_mismatch');
    const unknown = { ...clone(record), base_lock_blob: '0'.repeat(40) };
    expect(SA.checkStaleArm(armInput(unknown, shard)).violations.map((x: Json) => x.code)).toEqual(['base_lock_unknown']);
  });
});

describe('G-AUDIT git witness on this repository (-z, commit ids only)', () => {
  const w = AU.gitAuditWitness ? AU.gitAuditWitness(ROOT) : null;
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const parent = execFileSync('git', ['rev-parse', 'HEAD~1'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const headLockOid = git('rev-parse', `HEAD:${LOCK_REL}`).trim(); // the committed lock — independent of the working tree
  const headLockText = git('cat-file', 'blob', headLockOid);
  it('isAncestor: HEAD~1 → HEAD true, HEAD → HEAD~1 false, unknown commit → null', () => {
    expect(w.isAncestor(parent, head)).toBe(true);
    expect(w.isAncestor(head, parent)).toBe(false);
    expect(w.isAncestor('0'.repeat(40), head)).toBe(null);
  });
  it('commitsTouching lists commit ids oldest first; blobAt resolves the committed blob; readBlob returns its bytes', () => {
    const cs = w.commitsTouching(LOCK_REL);
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) expect(c).toMatch(/^[0-9a-f]{40}$/);
    const blob = w.blobAt(head, LOCK_REL);
    expect(blob).toBe(headLockOid);
    expect(SA.gitBlobOid(Buffer.from(headLockText, 'utf8'))).toBe(blob);
    expect(w.readBlob(blob)).toBe(headLockText);
    expect(w.blobAt(head, 'scripts/seeds/bylaw/expert-audit/no-such.json')).toBe(null);
  });
  it('lsTree gives path + blob id; readBlobs batches; pathsEver lists added paths; the base lock is a committed ancestor of HEAD', () => {
    const tree = w.lsTree(head, 'scripts/seeds/bylaw');
    const lock = tree.find((x: Json) => x.path === LOCK_REL);
    expect(lock.oid).toBe(w.blobAt(head, LOCK_REL));
    expect(w.readBlobs([lock.oid, '0'.repeat(40)]).get(lock.oid)).toBe(headLockText);
    expect(w.readBlobs([lock.oid, '0'.repeat(40)]).get('0'.repeat(40))).toBe(null);
    expect(w.pathsEver('scripts/seeds/bylaw')).toContain(LOCK_REL);
    const at = w.commitsTouching(LOCK_REL).filter((c: string) => w.blobAt(c, LOCK_REL) === lock.oid);
    expect(at.some((c: string) => w.isAncestor(c, head) === true)).toBe(true);
  });
});

describe('G-AUDIT on the real tree', () => {
  const pop = () => AU.buildPopulation({
    rows: [],
    external: readJson('scripts/seeds/bylaw/external.json'),
    absence: readJson('scripts/seeds/bylaw/absence-rulings.json'),
    adjudications: readJson('scripts/seeds/bylaw/adjudications.json'),
    rowIds: baseSlice.rows.map((r: Json) => r.regulation_id),
  });
  it('required members from the seeds: the seven EXT-* rows, every ABS row, the four 900.1.10 rows, the M-39 adjudicated row', () => {
    const p = pop();
    expect(p.required.filter((x: string) => x.startsWith('EXT-'))).toHaveLength(7);
    expect(p.required).toContain('ABS-1');
    for (const x of ['900.1.10(1)', '900.1.10(2)', '900.1.10(3)', '900.1.10(4)', '600.60.40(3)']) expect(p.required).toContain(x);
  });
  it('EXT-prov-1 carries one explicit confirmation per provincial direction reading (M-55 note), 900.1.10(3) the implicit-override confirmation', () => {
    const p = pop();
    const prov = p.population.find((x: Json) => x.id === 'EXT-prov-1');
    expect(prov.confirm).toHaveLength(3);
    expect(p.confirmations['900.1.10(3)']).toEqual(['implicit_override:900.1.10(3)']);
  });
  it('today: no bar and no record → not_run (never a pass)', () => {
    const p = pop();
    const r = AU.checkAudit({ bar: null, barText: null, records: [], population: p.population, required: p.required, witness: null });
    expect(r.status).toBe('not_run');
  });
});
