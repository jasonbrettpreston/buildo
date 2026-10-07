// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 1 (Snapshot), §6.4 rules 1 + 10,
//            §9 G-PROV (page shas) + G-CHANGE (change report, adopt refuses partial/old staging);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-37, M-47 (page set), M-15 v0.5 note (Ch.900 pages Phase 2);
//            docs/reports/mcbylaw-phase1-plan.md S3.
//
// Stage 1 of the McBylaw generator: the pinned page snapshot.
//   --refresh  fetches EXACTLY the pages in page-set.json (never follows links), validates each,
//              and stages raw + normalized pages under the git-ignored .staging/ — all or nothing
//              (a failed fetch leaves nothing staged). It also writes the change report against the
//              baseline: the Phase 0 pages for adoption 1, the adopted snapshot from adoption 2 on.
//   --adopt    re-validates the staging and refuses a partial or old one; then writes pages/,
//              manifest.json and an adoptions.json entry. Every write is atomic (tmp + rename).
// Provenance is recorded at fetch (clock.mjs), never taken from file mtimes. Every hash is a
// content sha256. JSON outputs are sorted-key, LF, newline-terminated.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SEEDS_REL = path.join('scripts', 'seeds', 'bylaw');

/**
 * Normalizer version, recorded in the manifest and every adoption. v1 is the Phase 0 / legacy
 * `norm.js` semantics byte for byte (it reproduces all 30 Phase 0 `.txt` files from their `.htm`),
 * applied to the page decoded as its declared charset (iso-8859-1, read as latin1).
 * Bump it when the output can change; a bump that leaves the normalized text unchanged changes
 * nothing downstream (Spec 68 §6 `verified_against_sha256`).
 */
export const NORMALIZER_VERSION = 'norm-v1';

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
  ndash: '-', mdash: '-', hellip: '...', sect: '§', deg: '°', frac12: '½', times: '×',
  le: '≤', ge: '≥', shy: '',
};

/** HTML page text -> normalized single-line text (normalizer v1). PURE. */
export function normalize(html) {
  let s = String(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<\/?(a|span|b|i|em|strong|u|sup|sub|font)\b[^>]*>/gi, '').replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/ /g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Declared charset of a page (`<META ... charset=...>`), lower-cased, or null. PURE. */
export function declaredCharset(html) {
  const m = /<META[^>]*charset=["']?([A-Za-z0-9_-]+)/i.exec(String(html));
  return m ? m[1].toLowerCase() : null;
}

/** Raw page bytes -> page text. The City pages declare iso-8859-1 (checked at fetch). PURE. */
export function decodePage(buf) {
  return Buffer.from(buf).toString('latin1');
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** JSON with every object's keys sorted, 2-space indent, LF, trailing newline. PURE. */
export function stableStringify(value) {
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
      return out;
    }
    return v;
  };
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

/** Numeric compare of dotted by-law ids ('1.5' < '1.20' < '10.5'). PURE. */
export function cmpSection(a, b) {
  const A = String(a).split('.').map(Number);
  const B = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] ?? -1;
    const y = B[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Table-of-contents rows of a City page: {id, level, title, href}. PURE. */
export function parseToc(html) {
  const rows = [];
  for (const chunk of String(html).split(/<TR[^>]*>/i).slice(1)) {
    const body = chunk.split(/<\/TR>/i)[0];
    const tds = [...body.matchAll(/<TD[^>]*>([\s\S]*?)<\/TD>/gi)].map((x) => x[1]);
    if (tds.length < 2) continue;
    const idTxt = strip(tds[0]);
    const a = /<A\s+HREF="?([^"\s>]+)"?[^>]*>([\s\S]*?)<\/A>/i.exec(tds[tds.length - 1]);
    if (!a) continue;
    let id = null;
    let level = null;
    const ch = /^Chapter (\d+)$/i.exec(idTxt);
    if (ch) {
      id = ch[1];
      level = 'chapter';
    } else if (/^\d+(\.\d+)+$/.test(idTxt)) {
      id = idTxt;
      level = ['chapter', 'section', 'article', 'clause', 'sub'][id.split('.').length - 1] || 'sub';
    } else continue;
    rows.push({ id, level, title: strip(a[2]), href: a[1] });
  }
  return rows;
}

/**
 * The section a page holds: the section of its own TOC article rows (same-page `#` anchors);
 * else the section row that links to the page's own file. A chapter URL holds only its first
 * section (Spec 68 §6.4 rule 1), so a section page whose own section differs is a wrong page. PURE.
 */
export function ownSection(html, file) {
  const toc = parseToc(html);
  const own = new Set();
  for (const r of toc) {
    if (r.level === 'chapter' || r.level === 'section') continue;
    const local = r.href.startsWith('#') || (file && r.href.startsWith(`${file}#`));
    if (local) own.add(r.id.split('.').slice(0, 2).join('.'));
  }
  if (own.size === 1) return [...own][0];
  if (own.size > 1) return null;
  const linked = toc.filter((r) => r.level === 'section' && file && r.href === file);
  if (linked.length === 1) return linked[0].id;
  // A chapter-URL page (e.g. Phase 0's ch800) of a chapter whose TOC lists exactly one section holds that section.
  const chapter = file ? /^ZBL_NewProvision_Chapter(\d+)\.htm$/.exec(file) : null;
  if (!chapter) return null;
  const secs = toc.filter((r) => r.level === 'section' && r.id.split('.')[0] === chapter[1]);
  return secs.length === 1 ? secs[0].id : null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function isoDate(text) {
  const m = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(text.trim());
  if (!m) return null;
  const mo = MONTHS.indexOf(m[1].toLowerCase());
  if (mo < 0) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** Consolidation date printed on a page: {version_date, amendments_up_to} (ISO) or null. PURE. */
export function consolidationOf(normText) {
  const m = /Version Date: ([A-Za-z]+ \d{1,2}, \d{4}),? including City-wide Amendments up to ([A-Za-z]+ \d{1,2}, \d{4})/.exec(normText);
  if (!m) return null;
  const version = isoDate(m[1]);
  const upTo = isoDate(m[2]);
  return version && upTo ? { version_date: version, amendments_up_to: upTo } : null;
}

/** Number of `[ By-law: ... ]` amendment tags in a normalized page. PURE. */
export function tagCount(normText) {
  return (normText.match(/\[\s*By-law:/g) || []).length;
}

/** Diff units: the text cut at every article id and every `(n) ` regulation / definition head. PURE. */
export function segments(normText) {
  return normText.split(/ (?=\d{1,3}\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})? [A-Z(]|\(\d{1,4}\) [A-Z])/);
}

/** Segment-level diff of two normalized texts: {removed[], added[]} (LCS after trimming the common ends). PURE. */
export function diffSegments(beforeText, afterText) {
  const a = segments(beforeText);
  const b = segments(afterText);
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let ea = a.length;
  let eb = b.length;
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const A = a.slice(lo, ea);
  const B = b.slice(lo, eb);
  const removed = [];
  const added = [];
  if (A.length * B.length > 4e6) {
    // Too large for an LCS table: report the trimmed middle whole (still exact about WHERE).
    return { removed: A, added: B };
  }
  const L = Array.from({ length: A.length + 1 }, () => new Int32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) removed.push(A[i++]);
    else added.push(B[j++]);
  }
  while (i < A.length) removed.push(A[i++]);
  while (j < B.length) added.push(B[j++]);
  return { removed, added };
}

export class SnapshotError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Atomic file write: tmp file in the same directory, then rename. */
export function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function seedsDir(root) {
  return path.join(root, SEEDS_REL);
}

/** The pinned page set + its content sha. Validates shape; throws SnapshotError on a bad file. */
export function loadPageSet(seeds) {
  const file = path.join(seeds, 'page-set.json');
  if (!fs.existsSync(file)) throw new SnapshotError('page_set_missing', file);
  const text = fs.readFileSync(file, 'utf8');
  const doc = JSON.parse(text);
  const keys = new Set();
  const sections = new Set();
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) throw new SnapshotError('page_set_invalid', 'pages[] empty');
  if (typeof doc.base_url !== 'string' || !/^https:\/\/www\.toronto\.ca\//.test(doc.base_url)) {
    throw new SnapshotError('page_set_invalid', 'base_url must be an official toronto.ca by-law URL');
  }
  for (const p of doc.pages) {
    if (!/^ch\d+(_\d+)?$/.test(p.key || '')) throw new SnapshotError('page_set_invalid', `bad key ${p.key}`);
    if (keys.has(p.key)) throw new SnapshotError('page_set_invalid', `duplicate key ${p.key}`);
    keys.add(p.key);
    if (!/^ZBL_NewProvision_Chapter\d+(_\d+)?\.htm$/.test(p.file || '')) throw new SnapshotError('page_set_invalid', `bad file ${p.file}`);
    if (p.status !== undefined && !(p.status === 'retired' && p.role === 'section' && typeof p.ruling === 'string' && p.ruling.length > 0)) {
      throw new SnapshotError('page_set_invalid', `${p.key}: status must be absent or 'retired' (a section page with a ruling)`);
    }
    if (p.role === 'section') {
      if (sections.has(p.section)) throw new SnapshotError('page_set_invalid', `section ${p.section} pinned twice`);
      sections.add(p.section);
    } else if (p.role !== 'toc_root') throw new SnapshotError('page_set_invalid', `bad role ${p.role} on ${p.key}`);
  }
  if (doc.pages.filter((p) => p.role === 'toc_root').length !== 1) throw new SnapshotError('page_set_invalid', 'exactly one toc_root page');
  return { doc, sha256: sha256(text) };
}

export function loadAdoptions(seeds) {
  return readJson(path.join(seeds, 'adoptions.json'), { adoptions: [] });
}

function stagingPaths(seeds) {
  const staging = path.join(seeds, '.staging');
  return { staging, incoming: path.join(staging, 'incoming'), ready: path.join(staging, 'ready') };
}

/** Validate one fetched page; returns its staged record or throws SnapshotError. PURE. */
export function validatePage(entry, buf, charsetExpected) {
  if (!buf || buf.length === 0) throw new SnapshotError('empty_page', entry.key);
  const html = decodePage(buf);
  const cs = declaredCharset(html);
  if (cs !== charsetExpected) throw new SnapshotError('unexpected_charset', `${entry.key}: ${cs} (normalizer ${NORMALIZER_VERSION} expects ${charsetExpected})`);
  const toc = parseToc(html);
  if (toc.length === 0) throw new SnapshotError('toc_empty', entry.key);
  const own = ownSection(html, entry.file);
  if (entry.role === 'section' && own !== entry.section) {
    throw new SnapshotError('wrong_section', `${entry.key}: page holds ${own}, pinned as ${entry.section}`);
  }
  const normalized = normalize(html);
  const consolidation = consolidationOf(normalized);
  if (!consolidation) throw new SnapshotError('no_consolidation_date', entry.key);
  return {
    normalized,
    record: {
      consolidation,
      normalized_bytes: Buffer.byteLength(normalized, 'utf8'),
      normalized_sha256: sha256(Buffer.from(normalized, 'utf8')),
      own_section: own,
      raw_bytes: buf.length,
      raw_sha256: sha256(buf),
      tag_count: tagCount(normalized),
      toc_entries: toc.length,
    },
  };
}

async function fetchWithRetry(url, { fetchImpl, sleep, delayMs, attempts = 3 }) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Buildo-McBylaw/1 (zoning by-law snapshot; polite, sequential)' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 200) return Buffer.from(await res.arrayBuffer());
      lastErr = new SnapshotError('http_status', `${url}: HTTP ${res.status}`);
      if (res.status < 500) break; // 3xx (never followed) / 4xx: not retried
    } catch (err) {
      lastErr = new SnapshotError('fetch_error', `${url}: ${err && err.message ? err.message : String(err)}`);
    }
    if (i < attempts - 1) await sleep(delayMs * 2 ** (i + 1));
  }
  throw lastErr;
}

/** Baseline for the change report: Phase 0 pages (adoption 1) or the adopted snapshot. */
export function loadBaseline({ seeds, baselineDir, latest }) {
  const pages = {};
  if (latest) {
    const manifest = readJson(path.join(seeds, 'manifest.json'), null);
    if (!manifest) throw new SnapshotError('manifest_missing', 'an adoption exists but manifest.json does not');
    for (const p of manifest.pages) {
      const normalized = fs.readFileSync(path.join(seeds, 'pages', `${p.key}.txt`), 'utf8');
      pages[p.key] = { section: p.role === 'section' ? p.section : null, root: p.role === 'toc_root', normalized, normalized_sha256: p.normalized_sha256, raw_sha256: p.raw_sha256 };
    }
    return { kind: 'adopted', label: latest.adoption_id, pages };
  }
  if (!baselineDir || !fs.existsSync(baselineDir)) throw new SnapshotError('baseline_missing', `adoption 1 needs --baseline=<Phase 0 pages dir> (got ${baselineDir})`);
  for (const f of fs.readdirSync(baselineDir).filter((x) => x.endsWith('.htm')).sort()) {
    const key = f.slice(0, -4);
    const raw = fs.readFileSync(path.join(baselineDir, f));
    const html = decodePage(raw);
    const file = `ZBL_NewProvision_Chapter${key.replace(/^ch/, '')}.htm`;
    const txtPath = path.join(baselineDir, `${key}.txt`);
    const txt = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8') : null;
    const normalized = normalize(html);
    pages[key] = {
      section: ownSection(html, file),
      root: key === 'ch1',
      normalized,
      normalized_sha256: sha256(Buffer.from(normalized, 'utf8')),
      raw_sha256: sha256(raw),
      txt_reproduced: txt === normalized,
    };
  }
  return { kind: 'phase0', label: 'Phase 0 pages (.cursor/mcbylaw/pages)', pages };
}

const SAMPLE = 12;
const clip = (s) => (s.length > 220 ? `${s.slice(0, 220)}…` : s);

/** The change report: every pinned page vs the baseline, and baseline pages not carried. PURE. */
export function buildChangeReport({ pageSet, staged, baseline }) {
  const pages = [];
  const carriedSections = new Set();
  for (const entry of pageSet.doc.pages) {
    const now = staged[entry.key];
    let candidates;
    if (baseline.kind === 'adopted') candidates = baseline.pages[entry.key] ? [entry.key] : [];
    else if (entry.role === 'toc_root') candidates = baseline.pages[entry.key] ? [entry.key] : [];
    else candidates = Object.keys(baseline.pages).filter((k) => baseline.pages[k].section === entry.section).sort();
    if (entry.role === 'section') carriedSections.add(entry.section);
    const row = { basis: entry.basis, key: entry.key, section: entry.section, baseline_keys: candidates, tags_after: now.record.tag_count, consolidation_after: now.record.consolidation };
    if (candidates.length === 0) {
      row.status = 'new';
    } else {
      // Prefer the baseline page with the same key (ch1_5 over ch1 for 1.5), else the first.
      const pick = candidates.includes(entry.key) ? entry.key : candidates[0];
      const before = baseline.pages[pick];
      row.compared_with = pick;
      row.tags_before = tagCount(before.normalized);
      row.consolidation_before = consolidationOf(before.normalized);
      if (before.normalized === now.normalized) row.status = 'unchanged';
      else {
        row.status = 'changed';
        const d = diffSegments(before.normalized, now.normalized);
        row.segments_removed = d.removed.length;
        row.segments_added = d.added.length;
        row.sample_removed = d.removed.slice(0, SAMPLE).map(clip);
        row.sample_added = d.added.slice(0, SAMPLE).map(clip);
      }
      const others = candidates.filter((k) => k !== pick && baseline.pages[k].normalized !== before.normalized);
      if (others.length) row.baseline_duplicates_differ = others;
    }
    pages.push(row);
  }
  const notCarried = [];
  const declared = new Map((pageSet.doc.phase0_not_carried || []).map((x) => [x.phase0_key, x]));
  for (const [key, b] of Object.entries(baseline.pages).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
    if (b.root && pageSet.doc.pages.some((p) => p.key === key)) continue;
    if (baseline.kind === 'adopted' ? pageSet.doc.pages.some((p) => p.key === key) : carriedSections.has(b.section)) continue;
    const d = declared.get(key);
    notCarried.push({ key, section: b.section, ruling: d ? d.ruling : null, reason: d ? d.reason : 'UNDECLARED' });
  }
  const count = (s) => pages.filter((p) => p.status === s).length;
  const summary = {
    pinned: pages.length,
    new: count('new'),
    unchanged: count('unchanged'),
    changed: count('changed'),
    not_carried: notCarried.length,
    not_carried_undeclared: notCarried.filter((n) => n.reason === 'UNDECLARED').length,
  };
  const baselineMeta = {
    kind: baseline.kind,
    label: baseline.label,
    pages: Object.fromEntries(
      Object.entries(baseline.pages).map(([k, b]) => [k, { normalized_sha256: b.normalized_sha256, raw_sha256: b.raw_sha256, section: b.section, ...(b.txt_reproduced === undefined ? {} : { txt_reproduced: b.txt_reproduced }) }]),
    ),
  };
  return { baseline: baselineMeta, not_carried: notCarried, pages, summary };
}

/**
 * --refresh: fetch every pinned page into .staging/incoming, then promote to .staging/ready.
 * All or nothing: any failure removes incoming and leaves nothing staged (the previous ready
 * staging is discarded at start, so an old staging can never survive a failed refresh).
 */
export async function refresh({ root, baselineDir = null, fetchImpl, nowIso, sleep, delayMs = 1000, log = () => {} }) {
  const seeds = seedsDir(root);
  const pageSet = loadPageSet(seeds);
  const latest = loadAdoptions(seeds).adoptions.at(-1) || null;
  if (latest && baselineDir) throw new SnapshotError('baseline_not_allowed', '--baseline is only for adoption 1; later adoptions diff against the adopted snapshot (G-CHANGE)');
  const baseline = loadBaseline({ seeds, baselineDir, latest });
  const { staging, incoming, ready } = stagingPaths(seeds);
  fs.rmSync(ready, { recursive: true, force: true });
  fs.rmSync(incoming, { recursive: true, force: true });
  fs.mkdirSync(path.join(incoming, 'pages'), { recursive: true });
  try {
    const startedAt = nowIso();
    const staged = {};
    const records = {};
    const charset = pageSet.doc.normalizer_charset;
    for (let i = 0; i < pageSet.doc.pages.length; i++) {
      const entry = pageSet.doc.pages[i];
      const url = pageSet.doc.base_url + entry.file;
      if (i > 0) await sleep(delayMs);
      const buf = await fetchWithRetry(url, { fetchImpl, sleep, delayMs });
      const fetchedAt = nowIso();
      const v = validatePage(entry, buf, charset);
      fs.writeFileSync(path.join(incoming, 'pages', `${entry.key}.htm`), buf);
      fs.writeFileSync(path.join(incoming, 'pages', `${entry.key}.txt`), v.normalized);
      staged[entry.key] = v;
      records[entry.key] = { ...v.record, fetched_at: fetchedAt, url };
      log(`fetched ${entry.key} (${v.record.raw_bytes} B, section ${v.record.own_section})`);
    }
    const fetchId = `F-${sha256(Object.keys(records).sort().map((k) => `${k}:${records[k].raw_sha256}`).join('\n')).slice(0, 16)}`;
    const report = buildChangeReport({ pageSet, staged, baseline });
    fs.writeFileSync(path.join(incoming, 'change-report.json'), stableStringify(report));
    const meta = {
      base_adoption: latest ? latest.adoption_id : null,
      completed_at: nowIso(),
      fetch_id: fetchId,
      normalizer_version: NORMALIZER_VERSION,
      page_set_sha256: pageSet.sha256,
      pages: records,
      started_at: startedAt,
    };
    fs.writeFileSync(path.join(incoming, 'staging.json'), stableStringify(meta)); // written LAST: its presence marks a complete staging
    fs.mkdirSync(staging, { recursive: true });
    fs.renameSync(incoming, ready);
    return { fetchId, report, meta };
  } catch (err) {
    fs.rmSync(incoming, { recursive: true, force: true });
    throw err;
  }
}

/** Re-validate a ready staging against the current page set, normalizer and adoption. Returns {meta, report}. */
export function validateStaging(seeds) {
  const { ready } = stagingPaths(seeds);
  const metaPath = path.join(ready, 'staging.json');
  if (!fs.existsSync(metaPath)) throw new SnapshotError('no_complete_staging', 'run --refresh first (a partial or failed refresh stages nothing)');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const pageSet = loadPageSet(seeds);
  const latest = loadAdoptions(seeds).adoptions.at(-1) || null;
  if (meta.page_set_sha256 !== pageSet.sha256) throw new SnapshotError('old_staging', 'page-set.json changed since the refresh');
  if (meta.normalizer_version !== NORMALIZER_VERSION) throw new SnapshotError('old_staging', `staged with ${meta.normalizer_version}, current ${NORMALIZER_VERSION}`);
  if ((meta.base_adoption || null) !== (latest ? latest.adoption_id : null)) throw new SnapshotError('old_staging', `staged against ${meta.base_adoption}, latest adoption is ${latest ? latest.adoption_id : null}`);
  const want = pageSet.doc.pages.map((p) => p.key).sort();
  const got = Object.keys(meta.pages).sort();
  if (want.join(',') !== got.join(',')) throw new SnapshotError('partial_staging', `staged pages ${got.length} != pinned ${want.length}`);
  for (const key of want) {
    const raw = fs.readFileSync(path.join(ready, 'pages', `${key}.htm`));
    const txt = fs.readFileSync(path.join(ready, 'pages', `${key}.txt`), 'utf8');
    if (sha256(raw) !== meta.pages[key].raw_sha256) throw new SnapshotError('staging_tampered', `${key}.htm sha`);
    if (normalize(decodePage(raw)) !== txt || sha256(Buffer.from(txt, 'utf8')) !== meta.pages[key].normalized_sha256) {
      throw new SnapshotError('staging_tampered', `${key}.txt is not normalize(${key}.htm)`);
    }
  }
  const reportPath = path.join(ready, 'change-report.json');
  if (!fs.existsSync(reportPath)) throw new SnapshotError('partial_staging', 'change report missing');
  return { meta, report: JSON.parse(fs.readFileSync(reportPath, 'utf8')), pageSet, latest, ready };
}

/** --adopt: write pages/, manifest.json and the adoption entry from a validated staging. */
export function adopt({ root }) {
  const seeds = seedsDir(root);
  const { meta, report, pageSet, latest, ready } = validateStaging(seeds);
  if (report.summary.not_carried_undeclared > 0) {
    throw new SnapshotError('undeclared_drop', `${report.summary.not_carried_undeclared} baseline page(s) dropped without a page-set ruling`);
  }
  const adoptions = loadAdoptions(seeds);
  const adoptionId = `adoption-${adoptions.adoptions.length + 1}`;
  // pages/: build a complete sibling directory, then swap it in.
  const pagesDir = path.join(seeds, 'pages');
  const tmpDir = path.join(seeds, `pages.tmp-${process.pid}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const p of pageSet.doc.pages) {
    fs.copyFileSync(path.join(ready, 'pages', `${p.key}.htm`), path.join(tmpDir, `${p.key}.htm`));
    fs.copyFileSync(path.join(ready, 'pages', `${p.key}.txt`), path.join(tmpDir, `${p.key}.txt`));
  }
  const oldDir = path.join(seeds, `pages.old-${process.pid}`);
  if (fs.existsSync(pagesDir)) fs.renameSync(pagesDir, oldDir);
  fs.renameSync(tmpDir, pagesDir);
  fs.rmSync(oldDir, { recursive: true, force: true });

  const pages = pageSet.doc.pages.map((p) => {
    const r = meta.pages[p.key];
    return {
      basis: p.basis,
      consolidation: r.consolidation,
      fetch_id: meta.fetch_id,
      fetched_at: r.fetched_at,
      key: p.key,
      normalized_bytes: r.normalized_bytes,
      normalized_sha256: r.normalized_sha256,
      raw_bytes: r.raw_bytes,
      raw_sha256: r.raw_sha256,
      role: p.role,
      section: p.section,
      tag_count: r.tag_count,
      url: r.url,
      ...(p.carve_in ? { carve_in: p.carve_in } : {}),
      ...(p.status ? { status: p.status } : {}),
    };
  });
  const manifest = {
    adoption_id: adoptionId,
    fetches: { [meta.fetch_id]: { completed_at: meta.completed_at, started_at: meta.started_at } },
    normalizer_version: NORMALIZER_VERSION,
    page_set_sha256: pageSet.sha256,
    pages,
  };
  writeAtomic(path.join(seeds, 'manifest.json'), stableStringify(manifest));
  const entry = {
    adoption_id: adoptionId,
    base_adoption: latest ? latest.adoption_id : null,
    baseline: { kind: report.baseline.kind, label: report.baseline.label, pages: report.baseline.pages },
    change_summary: report.summary,
    fetch_id: meta.fetch_id,
    not_carried: report.not_carried,
    normalizer_version: NORMALIZER_VERSION,
    page_set_sha256: pageSet.sha256,
    pages: Object.fromEntries(
      report.pages.map((r) => [r.key, { normalized_sha256: meta.pages[r.key].normalized_sha256, raw_sha256: meta.pages[r.key].raw_sha256, status: r.status }]),
    ),
  };
  // adoptions.json is written last: it is the commit point of an adoption.
  writeAtomic(path.join(seeds, 'adoptions.json'), stableStringify({ adoptions: [...adoptions.adoptions, entry] }));
  fs.rmSync(ready, { recursive: true, force: true });
  return { adoptionId, manifest, entry };
}
