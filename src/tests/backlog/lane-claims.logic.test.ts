// SPEC LINK: task-8 (INFRA.5, Increment 1.A), RR-0141 (the claims registry is a lock, not a message channel, MORNING-DECISIONS.md:733), RR-0149 (built in the repo, :744), RR-0219.
// scripts/analysis/lane-claims.mjs replaces the scratch panel-tools lanes.mjs. Run as a CLI on a temp registry (LANES_FILE), so the real fs, lock and rename are exercised.
// Contract: exit 0 ok, 1 refused (claim overlap, check with another owner), 2 usage, 3 registry unreadable. Registry JSON: array of { lane, paths, expires (epoch ms), ts, pathTs }.
import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SCRIPT = path.join(__dirname, '../../../scripts/analysis/lane-claims.mjs');
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lane-claims-')));
let n = 0;
function fx() {
  const dir = path.join(base, `t${++n}`);
  fs.mkdirSync(path.join(dir, 'a/b'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'foobar'));
  fs.mkdirSync(path.join(dir, 'foo'));
  return { dir, reg: path.join(dir, 'lanes.json') };
}
const env = (reg: string) => ({ ...process.env, LANES_FILE: reg });
const cli = (reg: string, ...a: string[]) => {
  const r = spawnSync('node', [SCRIPT, ...a], { env: env(reg), encoding: 'utf8' });
  let json: any = null;
  try { json = JSON.parse(r.stdout); } catch { /* not json */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
};
const cliAsync = (reg: string, ...a: string[]) => new Promise<{ status: number | null; stdout: string }>((res) => {
  const c = spawn('node', [SCRIPT, ...a], { env: env(reg) });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', (status) => res({ status, stdout: out }));
});

describe('lane-claims: claim and overlap refusal', () => {
  it('claims, then refuses an overlap naming the holder (same, enclosing, enclosed)', () => {
    const { dir, reg } = fx();
    const ok = cli(reg, 'claim', 'L1', path.join(dir, 'a'));
    expect(ok.status).toBe(0); expect(ok.json.ok).toBe(true);
    for (const p of [path.join(dir, 'a'), path.join(dir, 'a/b'), dir]) {
      const r = cli(reg, 'claim', 'L2', p);
      expect(r.status, p).toBe(1); expect(r.json.ok).toBe(false);
      expect(JSON.stringify(r.json.clashes)).toContain('L1');
    }
    expect(cli(reg, 'claim', 'L2', path.join(dir, 'foo')).status).toBe(0);
  });
  it('compares by path segment: foo and foobar do not clash', () => {
    const { dir, reg } = fx();
    expect(cli(reg, 'claim', 'L1', path.join(dir, 'foo')).status).toBe(0);
    expect(cli(reg, 'claim', 'L2', path.join(dir, 'foobar')).status).toBe(0);
  });
  it('a lane re-claiming extends its own paths and is never refused by itself', () => {
    const { dir, reg } = fx();
    cli(reg, 'claim', 'L1', path.join(dir, 'a'));
    const r = cli(reg, 'claim', 'L1', path.join(dir, 'a/b'), path.join(dir, 'foo'));
    expect(r.status).toBe(0);
    const l = cli(reg, 'list').json as any[];
    expect(l).toHaveLength(1); expect(l[0].paths).toContain(path.join(dir, 'foo')); expect(l[0].paths).toContain(path.join(dir, 'a'));
  });
  it('6 concurrent claimers of one path: exactly one wins, the rest are refused naming the winner', async () => {
    const { dir, reg } = fx();
    const rs = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => cliAsync(reg, 'claim', `C${i}`, path.join(dir, 'a'))));
    const won = rs.filter((r) => r.status === 0), lost = rs.filter((r) => r.status === 1);
    expect(won).toHaveLength(1); expect(lost).toHaveLength(5);
    const winner = (cli(reg, 'list').json as any[])[0].lane;
    for (const l of lost) expect(l.stdout).toContain(winner);
    expect(cli(reg, 'list').json).toHaveLength(1);
  });
});

describe('lane-claims: release, expiry, check, owner, list shape', () => {
  it('release frees the path for another lane', () => {
    const { dir, reg } = fx();
    cli(reg, 'claim', 'L1', path.join(dir, 'a'));
    expect(cli(reg, 'release', 'L1').json.released).toBe(1);
    expect(cli(reg, 'claim', 'L2', path.join(dir, 'a')).status).toBe(0);
  });
  it('an expired claim is ignored by claim, list, owner and check', () => {
    const { dir, reg } = fx();
    fs.writeFileSync(reg, JSON.stringify([{ lane: 'OLD', paths: [path.join(dir, 'a')], expires: Date.now() - 1000 }]));
    expect(cli(reg, 'list').json).toEqual([]);
    expect(cli(reg, 'owner', path.join(dir, 'a')).json).toEqual([]);
    expect(cli(reg, 'check', 'L2', path.join(dir, 'a')).status).toBe(0);
    expect(cli(reg, 'claim', 'L2', path.join(dir, 'a')).status).toBe(0);
  });
  it('--ttl-h sets the expiry; list and the registry keep the shape lane, paths, expires', () => {
    const { dir, reg } = fx();
    const t0 = Date.now();
    cli(reg, 'claim', 'L1', path.join(dir, 'a'), '--ttl-h', '2');
    const row = (JSON.parse(fs.readFileSync(reg, 'utf8')) as any[])[0];
    expect(row.lane).toBe('L1'); expect(row.paths).toEqual([path.join(dir, 'a')]);
    expect(row.expires).toBeGreaterThanOrEqual(t0 + 2 * 3600000 - 5000); expect(row.expires).toBeLessThanOrEqual(Date.now() + 2 * 3600000);
    const l = (cli(reg, 'list').json as any[])[0];
    expect(Object.keys(l).sort()).toEqual(['expires', 'lane', 'paths']);
  });
  it('check answers ok for the holder and refused for another lane; owner names the holder', () => {
    const { dir, reg } = fx();
    cli(reg, 'claim', 'L1', path.join(dir, 'a'));
    expect(cli(reg, 'check', 'L1', path.join(dir, 'a/b/file.txt')).status).toBe(0);
    const c = cli(reg, 'check', 'L2', path.join(dir, 'a/b/file.txt'));
    expect(c.status).toBe(1); expect(c.json.otherOwners).toEqual(['L1']);
    expect(cli(reg, 'owner', path.join(dir, 'a/b')).json).toEqual(['L1']);
    expect(cli(reg, 'owner', path.join(dir, 'foo')).json).toEqual([]);
  });
});

describe('lane-claims: realpath', () => {
  it('a symlinked path resolves to the same claim (claimed through the link, checked through the target and back)', () => {
    const { dir, reg } = fx();
    fs.symlinkSync(path.join(dir, 'a'), path.join(dir, 'link'));
    expect(cli(reg, 'claim', 'L1', path.join(dir, 'link')).status).toBe(0);
    const r = cli(reg, 'claim', 'L2', path.join(dir, 'a/b'));
    expect(r.status).toBe(1); expect(JSON.stringify(r.json.clashes)).toContain('L1');
    expect(cli(reg, 'owner', path.join(dir, 'a')).json).toEqual(['L1']);
    expect(cli(reg, 'owner', path.join(dir, 'link/b/new.txt')).json).toEqual(['L1']);
  });
  it('a symlink made after the claim still matches (stored paths are resolved at compare time)', () => {
    const { dir, reg } = fx();
    cli(reg, 'claim', 'L1', path.join(dir, 'later/x'));
    fs.mkdirSync(path.join(dir, 'real/x'), { recursive: true });
    fs.symlinkSync(path.join(dir, 'real'), path.join(dir, 'later'));
    expect(cli(reg, 'owner', path.join(dir, 'real/x')).json).toEqual(['L1']);
  });
});

describe('lane-claims: output-review fixes (r2)', () => {
  it('dot-dot in a not-yet-existing suffix is resolved before comparing', () => {
    const { dir, reg } = fx();
    cli(reg, 'claim', 'L1', path.join(dir, 'a'));
    expect(cli(reg, 'claim', 'L2', path.join(dir, 'nope/../a/b')).status).toBe(1);
  });
  it('a missing registry directory is created; an empty path and a non-finite ttl are refused', () => {
    const { dir } = fx();
    const reg = path.join(dir, 'new/dir/lanes.json');
    expect(cli(reg, 'claim', 'L1', path.join(dir, 'a')).status).toBe(0);
    expect(cli(reg, 'claim', 'L2', '').status).toBe(3);
    expect(cli(reg, 'claim', 'L2', path.join(dir, 'foo'), '--ttl-h', 'Infinity').status).toBe(2);
  });
});

describe('lane-claims: lock and registry safety', () => {
  it('a lock held by a dead process is reclaimed, not waited on', () => {
    const { dir, reg } = fx();
    fs.mkdirSync(`${reg}.lock`); fs.writeFileSync(`${reg}.lock/pid`, '999999');
    const r = cli(reg, 'claim', 'L1', path.join(dir, 'a'));
    expect(r.status).toBe(0); expect(fs.existsSync(`${reg}.lock`)).toBe(false);
  });
  it('an unparsable registry is a hard error (exit 3), never treated as empty, and is left untouched', () => {
    const { dir, reg } = fx();
    fs.writeFileSync(reg, '[{"lane":"L1","paths":[');
    for (const a of [['claim', 'L2', path.join(dir, 'a')], ['list'], ['owner', path.join(dir, 'a')]]) {
      const r = cli(reg, ...a); expect(r.status, a.join(' ')).toBe(3); expect(r.stderr).toContain('unparsable');
    }
    expect(fs.readFileSync(reg, 'utf8')).toBe('[{"lane":"L1","paths":[');
  });
  it('usage errors exit 2', () => {
    const { reg } = fx();
    expect(cli(reg, 'claim', 'L1').status).toBe(2);
    expect(cli(reg, 'bogus').status).toBe(2);
    expect(cli(reg, 'claim', 'L1', '/x', '--ttl-h', '0').status).toBe(2);
  });
});
