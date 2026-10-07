// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-36 (enacted by-laws captured from the enacting text:
//            url + sha256 + fetch time + extraction sha under scripts/seeds/bylaw/enacting/; the PDF is not
//            committed), M-39 (consolidation ≠ enacting text: the excerpt is committed with its extraction sha +
//            extractor version), §3 (654-2025); docs/specs/01-pipeline/68_mcbylaw_standard.md §6 `enacting_source`,
//            §9 G-PROV (enacting-PDF and extraction shas match the manifest), G-CHANGE (adopt refuses partial or
//            old staging), §10 artifacts; docs/reports/mcbylaw-phase1-plan.md S10
//
// Enacting-text capture, in the same two doors as the page snapshot:
//   captureEnacting  fetches ONE enacting PDF at its official url (never follows a redirect), refuses unless its
//                    sha256 equals the expected one, runs the extractor twice (refuses if the two runs differ —
//                    a same-machine agreement check, not a proof across extractor builds; the extractor name,
//                    args and version are recorded for that), and stages pdf + extraction + normalized text +
//                    record under the git-ignored .staging/enacting/. Any earlier staging of that by-law is
//                    discarded first, so an old staging can never survive a failed capture (as --refresh). The
//                    record is written LAST and atomically: its presence marks a complete staging.
//   adoptEnacting    re-validates the staging (record shape, pdf sha, extraction sha, normalization
//                    reproducible, current normalizer) and writes enacting/<bylaw>.extracted.txt,
//                    enacting/<bylaw>.txt, then the enacting/manifest.json entry (the commit point). The PDF stays
//                    in .staging (never committed), so the PDF sha is checked at capture and adopt only; offline,
//                    G-PROV re-checks the extraction and normalized shas (the PDF sha is declared-only there).
//   checkEnacting    the G-PROV enacting arm, offline.
// The enacting text is treated as a page by G-TEXT (Spec 69 M-36): <bylaw>.txt is its normalized text.
//
// G-PROV enacting-arm reason codes (closed set; `checked` = capture records examined):
//   enacting_manifest_invalid    enacting/manifest.json unreadable or misshapen, or a capture record invalid
//                                (missing field, key ≠ record.bylaw, not NNNN-YYYY, url not official)
//   normalizer_version_drift     a record was normalized under another enacting normalizer than the current one
//   extraction_sha_mismatch      <bylaw>.extracted.txt missing, or its sha differs from the record
//   normalized_sha_mismatch      <bylaw>.txt missing, or its sha differs from the record
//   normalized_not_reproducible  normalizeExtraction(extracted) differs from the recorded normalized sha
//   orphan_enacting_file         a file in enacting/ that is not manifest.json, findings.json (the M-39 findings
//                                record, validated by the infra test) or a recorded capture's two texts

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SnapshotError, seedsDir, sha256, stableStringify, writeAtomic } from './snapshot.mjs';

/** Version of normalizeExtraction; recorded per capture. Bump it when the output can change. */
export const ENACTING_NORMALIZER_VERSION = 'enacting-norm-v1';

const RECORD_FIELDS = Object.freeze(['bylaw', 'extraction_sha256', 'extractor', 'extractor_args', 'extractor_version', 'fetch_id', 'fetched_at', 'header_lines_stripped', 'normalized_sha256', 'normalizer_version', 'pdf_bytes', 'pdf_sha256', 'url']);
const BYLAW_NO_RE = /^\d{1,4}-\d{4}$/;
const OFFICIAL_URL_RE = /^https:\/\/www\.toronto\.ca\//;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const headerRe = (bylaw) => new RegExp(`^\\s*\\d+\\s+City of Toronto By-law ${escapeRe(bylaw)}\\s*$`);
const lines = (text) => String(text).replace(/\r\n?/g, '\n').replace(/\f/g, '\n').split('\n');

/** Number of running page-header lines "<n> City of Toronto By-law <bylaw>" the normalizer drops. PURE. */
export function headerLineCount(text, bylaw) {
  const re = headerRe(bylaw);
  return lines(text).filter((l) => re.test(l)).length;
}

/**
 * Extracted PDF text -> one-line normalized text (enacting-norm-v1). Drops form feeds and the running page
 * header "<n> City of Toronto By-law <bylaw>", folds the same quote/dash characters as the page normalizer,
 * and turns every line break and whitespace run into one space. Hyphens are kept exactly as extracted (a
 * line-end hyphen the extractor already removed is not restored, and none is re-joined by guess). PURE.
 */
export function normalizeExtraction(text, bylaw) {
  const re = headerRe(bylaw);
  return lines(text)
    .filter((l) => !re.test(l))
    .join(' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ') // also folds U+00A0
    .trim();
}

const count = (s, m) => s.split(m).length - 1;

/**
 * A literal excerpt of a normalized text from `startMarker` through `endMarker` (inclusive). Each marker must be
 * non-empty and occur exactly once in the whole text, the end after the start. Returns {text, start, end,
 * sha256}. Throws excerpt_not_found / excerpt_ambiguous. PURE.
 */
export function excerpt(text, startMarker, endMarker) {
  const s = String(text);
  if (!startMarker || !endMarker) throw new SnapshotError('excerpt_not_found', 'empty marker');
  for (const m of [startMarker, endMarker]) {
    const n = count(s, m);
    if (n === 0) throw new SnapshotError('excerpt_not_found', `marker "${m}"`);
    if (n > 1) throw new SnapshotError('excerpt_ambiguous', `marker "${m}" occurs ${n} times`);
  }
  const start = s.indexOf(startMarker);
  const endAt = s.indexOf(endMarker);
  if (endAt < start + startMarker.length) throw new SnapshotError('excerpt_not_found', `end marker "${endMarker}" is not after the start marker`);
  const end = endAt + endMarker.length;
  const out = s.slice(start, end);
  return { text: out, start, end, sha256: sha256(Buffer.from(out, 'utf8')) };
}

/**
 * The real extractor: `pdftotext` on PATH (Xpdf or Poppler), UTF-8, LF line ends, reading order (no -layout).
 * `pdftotext -v` exits non-zero on Xpdf (99), so only a spawn error or a missing version line refuses; the
 * version line and the line after it (the copyright, which tells Xpdf from Poppler) are recorded.
 */
export function pdftotextExtractor({ bin = 'pdftotext' } = {}) {
  const args = ['-enc', 'UTF-8', '-eol', 'unix'];
  const v = spawnSync(bin, ['-v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  if (v.error) throw new SnapshotError('extractor_unavailable', `${bin}: ${v.error.message}`);
  const banner = [v.stdout, v.stderr].filter(Boolean).join('\n').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const at = banner.findIndex((l) => /^pdftotext\b.*version/i.test(l));
  if (at < 0) throw new SnapshotError('extractor_unavailable', `${bin} -v printed no "pdftotext … version" line`);
  return {
    name: 'pdftotext',
    version: banner.slice(at, at + 2).join('; '),
    args,
    run: (pdfPath) => {
      const r = spawnSync(bin, [...args, pdfPath, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
      if (r.error || r.status !== 0) throw new SnapshotError('extraction_failed', `${bin} exit ${r.status}: ${r.error ? r.error.message : (r.stderr || '').trim()}`);
      return r.stdout;
    },
  };
}

const safeName = (bylaw) => {
  if (!BYLAW_NO_RE.test(String(bylaw))) throw new SnapshotError('bad_bylaw', `"${bylaw}" is not a by-law number NNNN-YYYY`);
  return bylaw;
};

/** Problems with one capture record filed under `key` (empty = valid). Shared by adopt and check. PURE. */
export function recordProblems(rec, key) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return ['record is not an object'];
  const problems = [];
  const missing = RECORD_FIELDS.filter((f) => rec[f] === undefined || rec[f] === null);
  if (missing.length) problems.push(`lacks ${missing.join(', ')}`);
  if (!BYLAW_NO_RE.test(String(key))) problems.push(`key "${key}" is not NNNN-YYYY`);
  if (rec.bylaw !== key) problems.push(`record.bylaw "${rec.bylaw}" is filed under "${key}"`);
  if (rec.url && !OFFICIAL_URL_RE.test(rec.url)) problems.push(`url ${rec.url} is not an official toronto.ca url`);
  for (const f of ['pdf_sha256', 'extraction_sha256', 'normalized_sha256']) if (rec[f] && !/^[0-9a-f]{64}$/.test(rec[f])) problems.push(`${f} is not a sha256`);
  return problems;
}

function stagingDir(seeds) {
  return path.join(seeds, '.staging', 'enacting');
}

/** Fetch, verify and extract one enacting by-law into .staging/enacting/. Throws SnapshotError; stages nothing on failure. */
export async function captureEnacting({ root, bylaw, url, expectedSha256, fetchImpl, nowIso, extractor }) {
  const name = safeName(bylaw);
  if (!OFFICIAL_URL_RE.test(String(url))) throw new SnapshotError('bad_url', `${url} is not an official toronto.ca url`);
  if (!/^[0-9a-f]{64}$/.test(expectedSha256 || '')) throw new SnapshotError('bad_expected_sha', 'an expected lowercase-hex sha256 is required (Spec 69 pins it)');
  if (typeof fetchImpl !== 'function' || typeof nowIso !== 'function' || !extractor || typeof extractor.run !== 'function') {
    throw new SnapshotError('bad_args', 'fetchImpl, nowIso and extractor.run are required');
  }
  const dir = stagingDir(seedsDir(root));
  const files = ['pdf', 'extracted.txt', 'txt', 'json'].map((x) => path.join(dir, `${name}.${x}`));
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.rmSync(f, { force: true }); // an old staging can never survive a failed capture
    const res = await fetchImpl(url, { redirect: 'manual', headers: { 'User-Agent': 'Buildo-McBylaw/1 (enacting by-law capture)' }, signal: AbortSignal.timeout(60000) });
    if (res.status !== 200) throw new SnapshotError('http_status', `${url}: HTTP ${res.status}${res.status === 0 ? ' (redirect refused)' : ''}`);
    const pdf = Buffer.from(await res.arrayBuffer());
    const fetchedAt = nowIso();
    const pdfSha = sha256(pdf);
    if (pdfSha !== expectedSha256) throw new SnapshotError('pdf_sha_mismatch', `${url}: sha256 ${pdfSha}, expected ${expectedSha256}`);
    writeAtomic(files[0], pdf);
    const first = extractor.run(files[0]);
    const second = extractor.run(files[0]);
    if (typeof first !== 'string' || typeof second !== 'string') throw new SnapshotError('extraction_failed', 'the extractor returned no text');
    if (first !== second) throw new SnapshotError('extraction_nondeterministic', `${extractor.name} ${extractor.version} gave two different texts`);
    const normalized = normalizeExtraction(first, name);
    if (normalized.length === 0) throw new SnapshotError('extraction_empty', `${url}: no text extracted (an image-only PDF needs OCR, which this capture does not do)`);
    writeAtomic(files[1], first);
    writeAtomic(files[2], normalized);
    const record = {
      bylaw: name,
      extraction_sha256: sha256(Buffer.from(first, 'utf8')),
      extractor: extractor.name,
      extractor_args: extractor.args,
      extractor_version: extractor.version,
      fetch_id: `E-${pdfSha.slice(0, 16)}`, // content-derived, as the page snapshot's F-<sha> fetch ids
      fetched_at: fetchedAt,
      header_lines_stripped: headerLineCount(first, name),
      normalized_sha256: sha256(Buffer.from(normalized, 'utf8')),
      normalizer_version: ENACTING_NORMALIZER_VERSION,
      pdf_bytes: pdf.length,
      pdf_sha256: pdfSha,
      url,
    };
    writeAtomic(files[3], stableStringify(record)); // LAST: marks a complete staging
    return { record };
  } catch (err) {
    for (const f of files) fs.rmSync(f, { force: true });
    throw err;
  }
}

function readJsonOr(file, code) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new SnapshotError(code, `${file}: ${err && err.message ? err.message : String(err)}`);
  }
}

/** Re-validate a staged capture and write it into enacting/. Returns {record}. Throws SnapshotError. */
export function adoptEnacting({ root, bylaw }) {
  const name = safeName(bylaw);
  const seeds = seedsDir(root);
  const dir = stagingDir(seeds);
  const recPath = path.join(dir, `${name}.json`);
  if (!fs.existsSync(recPath)) throw new SnapshotError('no_complete_staging', `no staged capture for ${name}; run the capture first`);
  const record = readJsonOr(recPath, 'staging_tampered');
  const problems = recordProblems(record, name);
  if (problems.length) throw new SnapshotError('staging_tampered', `${name}.json: ${problems.join('; ')}`);
  if (record.normalizer_version !== ENACTING_NORMALIZER_VERSION) throw new SnapshotError('old_staging', `staged with ${record.normalizer_version}, current ${ENACTING_NORMALIZER_VERSION}`);
  const read = (ext) => {
    const f = path.join(dir, `${name}.${ext}`);
    if (!fs.existsSync(f)) throw new SnapshotError('staging_tampered', `${name}.${ext} missing`);
    return fs.readFileSync(f);
  };
  const pdf = read('pdf');
  const extracted = read('extracted.txt');
  const normalized = read('txt');
  if (sha256(pdf) !== record.pdf_sha256 || pdf.length !== record.pdf_bytes) throw new SnapshotError('staging_tampered', `${name}.pdf sha`);
  if (sha256(extracted) !== record.extraction_sha256) throw new SnapshotError('staging_tampered', `${name}.extracted.txt sha`);
  if (sha256(normalized) !== record.normalized_sha256) throw new SnapshotError('staging_tampered', `${name}.txt sha`);
  if (normalizeExtraction(extracted.toString('utf8'), name) !== normalized.toString('utf8')) {
    throw new SnapshotError('staging_tampered', `${name}.txt is not normalizeExtraction(${name}.extracted.txt)`);
  }
  const out = path.join(seeds, 'enacting');
  const manifestPath = path.join(out, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? readJsonOr(manifestPath, 'enacting_manifest_invalid') : { captures: {} };
  if (!manifest || typeof manifest !== 'object' || !manifest.captures || typeof manifest.captures !== 'object') {
    throw new SnapshotError('enacting_manifest_invalid', 'enacting/manifest.json has no captures object');
  }
  writeAtomic(path.join(out, `${name}.extracted.txt`), extracted);
  writeAtomic(path.join(out, `${name}.txt`), normalized);
  // manifest.json is written last: it is the commit point of the capture (re-adopting overwrites both texts).
  writeAtomic(manifestPath, stableStringify({ ...manifest, captures: { ...manifest.captures, [name]: record } }));
  for (const ext of ['extracted.txt', 'txt', 'json']) fs.rmSync(path.join(dir, `${name}.${ext}`), { force: true });
  return { record };
}

/** G-PROV enacting arm over a seeds directory. Returns {pass, violations, checked}. An absent enacting/ is vacuous (checked 0). */
export function checkEnacting({ seeds }) {
  const violations = [];
  let checked = 0;
  const dir = path.join(seeds, 'enacting');
  if (!fs.existsSync(dir)) return { pass: true, violations, checked };
  let captures = {};
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (!m || typeof m !== 'object' || !m.captures || typeof m.captures !== 'object' || Array.isArray(m.captures)) throw new Error('no captures object');
    captures = m.captures;
  } catch (err) {
    violations.push(`enacting_manifest_invalid: ${err && err.message ? err.message : String(err)}`);
  }
  const known = new Set(['manifest.json', 'findings.json']);
  for (const name of Object.keys(captures).sort()) {
    checked++;
    const rec = captures[name];
    const problems = recordProblems(rec, name);
    if (problems.length) {
      violations.push(`enacting_manifest_invalid: ${JSON.stringify(name)} ${problems.join('; ')}`);
      if (!BYLAW_NO_RE.test(name) || !rec || typeof rec !== 'object') continue; // never build a path from a bad key
    }
    if (rec.normalizer_version !== ENACTING_NORMALIZER_VERSION) {
      violations.push(`normalizer_version_drift: ${name} normalized under ${rec.normalizer_version}, current ${ENACTING_NORMALIZER_VERSION} (re-capture)`);
    }
    known.add(`${name}.extracted.txt`);
    known.add(`${name}.txt`);
    const ex = path.join(dir, `${name}.extracted.txt`);
    const tx = path.join(dir, `${name}.txt`);
    const extracted = fs.existsSync(ex) ? fs.readFileSync(ex) : null;
    const normalized = fs.existsSync(tx) ? fs.readFileSync(tx) : null;
    if (!extracted || sha256(extracted) !== rec.extraction_sha256) violations.push(`extraction_sha_mismatch: ${name}.extracted.txt ${extracted ? 'sha differs from the record' : 'missing'}`);
    if (!normalized || sha256(normalized) !== rec.normalized_sha256) violations.push(`normalized_sha_mismatch: ${name}.txt ${normalized ? 'sha differs from the record' : 'missing'}`);
    if (extracted && sha256(Buffer.from(normalizeExtraction(extracted.toString('utf8'), name), 'utf8')) !== rec.normalized_sha256) {
      violations.push(`normalized_not_reproducible: normalizeExtraction(${name}.extracted.txt) differs from the recorded normalized sha`);
    }
  }
  for (const f of fs.readdirSync(dir).sort()) if (!known.has(f)) violations.push(`orphan_enacting_file: enacting/${f}`);
  return { pass: violations.length === 0, violations, checked };
}
