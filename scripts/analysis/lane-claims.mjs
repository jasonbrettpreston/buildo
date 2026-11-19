#!/usr/bin/env node
// INFRA.5 lane claims registry (task-8; replaces the scratch panel-tools/lanes.mjs; RR-0141: a lock, not a message channel; RR-0149: built in the repo).
// Usage: node scripts/analysis/lane-claims.mjs claim <lane> <path...> [--ttl-h N] | release <lane> | list | check <lane> <path> | owner <path>
// Advisory lock: single host, cooperative callers. Nothing here enforces a claim; the session hook ~/.claude/hooks/lane-guard.mjs reads the same file.
// Registry: $LANES_FILE, default ~/Buildo-scratch/panel-tools/lanes.json (outside the repo so the existing hook keeps reading it). JSON array of
//   { lane, paths[], expires (epoch ms), ts, pathTs } ; readers need lane, paths, expires. Written under a mkdir lock, atomically.
// A claim conflicts when either path is a segment-wise prefix of the other (same, enclosing, enclosed). Paths are resolved with realpath (nearest
//   existing ancestor + the rest) at claim AND compare time, so symlinks cannot hide an overlap (GD-1). Default TTL 12 h.
// Exit codes: 0 ok, 1 refused (claim overlap, check with another owner), 2 usage, 3 registry unreadable (unparsable JSON is never treated as empty).
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync, renameSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const H = homedir();
const FILE = process.env.LANES_FILE || `${H}/Buildo-scratch/panel-tools/lanes.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

async function withLock(lockDir, fn, waitMs = 30000) {
  const t0 = Date.now();
  mkdirSync(dirname(lockDir), { recursive: true });
  for (;;) {
    if (Date.now() - t0 > waitMs) throw new Error(`lock wait exceeded ${waitMs} ms: ${lockDir}`);
    try { mkdirSync(lockDir); writeFileSync(`${lockDir}/pid`, String(process.pid)); break; }
    catch (e) {
      if (e.code === 'ENOENT') { rmSync(lockDir, { recursive: true, force: true }); continue; } // our half-made dir was reclaimed under us: retry
      if (e.code !== 'EEXIST') throw e;
      let pid = NaN; try { pid = parseInt(readFileSync(`${lockDir}/pid`, 'utf8'), 10); } catch { /* pid not written yet */ }
      if (Number.isFinite(pid) && !alive(pid)) { rmSync(lockDir, { recursive: true, force: true }); continue; }
      if (!Number.isFinite(pid)) { try { if (Date.now() - statSync(lockDir).mtimeMs > 10000) { rmSync(lockDir, { recursive: true, force: true }); continue; } } catch { /* gone */ } }
      await sleep(50);
    }
  }
  try { return await fn(); } finally { rmSync(lockDir, { recursive: true, force: true }); }
}
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return d; throw new Error(`unparsable ${f}: ${e.message}`); } };
const writeJsonAtomic = (f, o) => { const t = `${f}.tmp.${process.pid}`; writeFileSync(t, JSON.stringify(o, null, 1)); renameSync(t, f); };

const real = (p) => { let q = p; const rest = []; for (let i = 0; i < 40; i++) { try { return [realpathSync(q), ...rest.reverse()].join('/').replace(/\/\//g, '/'); } catch { const b = basename(q); if (!b || dirname(q) === q) break; rest.push(b); q = dirname(q); } } return p; };
export const norm = (p) => { if (!String(p).trim()) throw new Error('empty path'); return real(resolve(p.replace(/^~(?=\/|$)/, H))).replace(/\/$/, ''); }; // resolve(): absolute, no . or .. left in a not-yet-existing suffix
export const overlaps = (a, b) => { a = norm(a); b = norm(b); return a === b || a.startsWith(b + '/') || b.startsWith(a + '/'); };

async function mutate(fn) { return withLock(FILE + '.lock', async () => { const now = Date.now(); const cl = readJson(FILE, []).filter((c) => c.expires > now); const r = fn(cl, now); writeJsonAtomic(FILE, cl); return r; }); }
export const claim = (lane, paths, ttlH = 12) => mutate((cl, now) => {
  const clashes = [];
  for (const p of paths) for (const c of cl) if (c.lane !== lane) for (const q of c.paths) if (overlaps(p, q)) clashes.push(`${p} overlaps ${q} (lane ${c.lane})`);
  if (clashes.length) return { ok: false, clashes };
  let mine = cl.find((c) => c.lane === lane);
  if (!mine) { mine = { lane, paths: [], ts: new Date(now).toISOString(), expires: 0 }; cl.push(mine); }
  mine.pathTs ||= {};
  for (const p of paths) if (!mine.paths.some((x) => norm(x) === norm(p))) { mine.paths.push(norm(p)); mine.pathTs[norm(p)] = now; }
  mine.expires = now + ttlH * 3600000;
  return { ok: true, lane, paths: mine.paths };
});
export const release = (lane) => mutate((cl) => { const keep = cl.filter((c) => c.lane !== lane); const n = cl.length - keep.length; cl.length = 0; cl.push(...keep); return { ok: true, released: n }; });
const readLive = () => readJson(FILE, []).filter((c) => c.expires > Date.now()); // readers take no lock and write nothing
export const owner = async (p) => readLive().filter((c) => c.paths.some((q) => overlaps(p, q))).map((c) => c.lane);
export const list = async () => readLive().map((c) => ({ lane: c.lane, paths: c.paths, expires: new Date(c.expires).toISOString() }));

const isMain = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const USAGE = 'usage: lane-claims.mjs claim <lane> <path...> [--ttl-h N] | release <lane> | list | check <lane> <path> | owner <path>';
  const [cmd, ...a] = process.argv.slice(2);
  const ti = a.indexOf('--ttl-h'); const ttl = ti >= 0 ? Number(a.splice(ti, 2)[1]) : 12;
  if (!(Number.isFinite(ttl) && ttl > 0)) { console.error('--ttl-h needs a positive number'); process.exit(2); }
  let r;
  try {
    if (cmd === 'claim' && a.length >= 2) r = await claim(a[0], a.slice(1), ttl);
    else if (cmd === 'release' && a[0]) r = await release(a[0]);
    else if (cmd === 'list') r = await list();
    else if (cmd === 'owner' && a[0]) r = await owner(a[0]);
    else if (cmd === 'check' && a.length === 2) { const o = (await owner(a[1])).filter((l) => l !== a[0]); r = { ok: o.length === 0, otherOwners: o }; }
    else { console.error(USAGE); process.exit(2); }
  } catch (e) { console.error(String(e.message || e)); process.exit(3); }
  console.log(JSON.stringify(r)); process.exitCode = r && r.ok === false ? 1 : 0;
}
