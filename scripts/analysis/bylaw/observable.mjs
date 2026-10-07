// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-PROV (page arm: "page ... shas match the
//            manifest; manifest complete"), §6.4 rule 10 (provenance explicit, never mtimes), §8 rule 8 (module shape)
//
// OBSERVABLE word module. S3 lands the G-PROV page arm only; the amendment arm (S10), the keyer
// provenance arm and the ruling-citation arm (S6) are added here by their steps.
//
// Reason codes (closed set for the page arm):
//   manifest_missing            no manifest.json
//   page_set_mismatch           page-set.json and manifest.json pin different pages (either direction)
//   raw_sha_mismatch            pages/<key>.htm missing, or its sha256 differs from the manifest
//   normalized_sha_mismatch     pages/<key>.txt missing, or its sha256 differs from the manifest
//   normalized_not_reproducible normalize(raw) under the current normalizer differs from the pinned normalized sha
//   orphan_page_file            a file in pages/ that the manifest does not pin
//   adoption_mismatch           the latest adoptions.json entry is not the manifest's adoption, or its page shas differ

import fs from 'node:fs';
import path from 'node:path';
import { decodePage, loadPageSet, normalize, sha256 } from './snapshot.mjs';

/** G-PROV page arm over a seeds directory. Returns {pass, violations, checked}. */
export function checkProv({ seeds }) {
  const violations = [];
  let checked = 0;
  const manifestPath = path.join(seeds, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { pass: false, violations: ['manifest_missing: manifest.json'], checked };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pinned = new Map(manifest.pages.map((p) => [p.key, p]));

  const setKeys = loadPageSet(seeds).doc.pages.map((p) => p.key);
  for (const k of setKeys) if (!pinned.has(k)) violations.push(`page_set_mismatch: ${k} is in page-set.json but not in manifest.json`);
  for (const k of pinned.keys()) if (!setKeys.includes(k)) violations.push(`page_set_mismatch: ${k} is in manifest.json but not in page-set.json`);

  const pagesDir = path.join(seeds, 'pages');
  for (const p of manifest.pages) {
    checked++;
    const rawPath = path.join(pagesDir, `${p.key}.htm`);
    const txtPath = path.join(pagesDir, `${p.key}.txt`);
    const raw = fs.existsSync(rawPath) ? fs.readFileSync(rawPath) : null;
    if (!raw || sha256(raw) !== p.raw_sha256) violations.push(`raw_sha_mismatch: ${p.key}.htm ${raw ? 'sha differs from the manifest' : 'missing'}`);
    const txt = fs.existsSync(txtPath) ? fs.readFileSync(txtPath) : null;
    if (!txt || sha256(txt) !== p.normalized_sha256) violations.push(`normalized_sha_mismatch: ${p.key}.txt ${txt ? 'sha differs from the manifest' : 'missing'}`);
    if (raw && sha256(Buffer.from(normalize(decodePage(raw)), 'utf8')) !== p.normalized_sha256) {
      violations.push(`normalized_not_reproducible: normalize(${p.key}.htm) differs from the pinned normalized sha`);
    }
  }
  if (fs.existsSync(pagesDir)) {
    for (const f of fs.readdirSync(pagesDir).sort()) {
      const m = /^(.+)\.(htm|txt)$/.exec(f);
      if (!m || !pinned.has(m[1])) violations.push(`orphan_page_file: pages/${f}`);
    }
  }

  const adoptionsPath = path.join(seeds, 'adoptions.json');
  const adoptions = fs.existsSync(adoptionsPath) ? JSON.parse(fs.readFileSync(adoptionsPath, 'utf8')).adoptions : [];
  const latest = adoptions.at(-1);
  if (!latest || latest.adoption_id !== manifest.adoption_id) {
    violations.push(`adoption_mismatch: latest adoption ${latest ? latest.adoption_id : 'none'} != manifest ${manifest.adoption_id}`);
  } else {
    for (const p of manifest.pages) {
      const a = latest.pages[p.key];
      if (!a || a.raw_sha256 !== p.raw_sha256 || a.normalized_sha256 !== p.normalized_sha256) {
        violations.push(`adoption_mismatch: ${p.key} shas differ between ${latest.adoption_id} and the manifest`);
      }
    }
  }
  return { pass: violations.length === 0, violations, checked };
}
