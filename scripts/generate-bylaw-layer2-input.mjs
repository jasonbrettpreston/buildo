#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-II (Layer 1 reaches the resolve_bylaws compute as
//            one generated file; operator chat batch J, 2026-10-21-chat-batch-j#CHAT-36.OQ1, in its simplest compliant
//            form), R-IT (the version hash recipe, #CHAT-36.OQ12), R-DJ (1) (every generator --check runs at pre-commit)
// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (134:32, table_version and evaluator_version)
//
// LAYER 1 INPUT FOR LAYER 2. Builds the Layer 1 assembly with loadRealLotAssembly, unchanged (the function the
// golden-lot test helper uses, so the two cannot drift), and writes ONE file, docs/reference/bylaw-layer2-input.json:
//   body      the agreed units (with their generated fields and displacement links), the evaluator vocabulary, the
//             enactment dates, the absence rulings and the exception authoring map: everything makeContext and
//             effective() need. The resolve_bylaws compute require()s this file; it never reads a seed itself.
//   table_version      filesHash over every file under scripts/seeds/bylaw/ and scripts/analysis/bylaw/ (dot entries
//                      skipped), the assembly module and this generator. Covering more than the assembly reads costs a
//                      rerun, never stale law.
//   evaluator_version  filesHash over evaluate.mjs and dsl.mjs (134:32).
//   body_sha256        sha256 of the serialized body (a hand edit of the body is caught).
//
// Modes (exactly one; no default mode, no default write; anything else exits 2):
//   --write   rebuild the assembly (a few seconds) and write the file.
//   --check   file-only and fast: recompute both versions from the tree and the body hash from the file; exit 1 when
//             any differs (run --write). The full rebuild comparison is the logic lock
//             src/tests/steps/resolve_bylaws/bylaw-layer2-input.logic.test.ts.
//
// Deterministic: sorted inputs, no clock, no DB, no network. Reads the tree only.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const { sha256Hex, filesHash } = require('./lib/bylaw-resolution.js');

export const OUT_REL = 'docs/reference/bylaw-layer2-input.json';
export const GENERATOR_REL = 'scripts/generate-bylaw-layer2-input.mjs';
export const ASSEMBLY_REL = 'scripts/analysis/bylaw-validation/assembly.mjs';
/** Every file under these directories is a Layer 1 input (R-II). */
export const INPUT_DIRS = Object.freeze(['scripts/seeds/bylaw', 'scripts/analysis/bylaw']);
/** Plus these single files. */
export const INPUT_FILES = Object.freeze([ASSEMBLY_REL, GENERATOR_REL]);
/** evaluator_version covers the evaluator code (Spec 134:32). */
export const EVALUATOR_FILES = Object.freeze(['scripts/analysis/bylaw/evaluate.mjs', 'scripts/analysis/bylaw/dsl.mjs']);
const MODES = Object.freeze(['--write', '--check']);

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const posix = (p) => p.split(path.sep).join('/');

/** Every regular file under a directory, repo-relative POSIX, sorted; dot entries (e.g. the git-ignored .staging/) skipped. */
function walk(root, rel) {
  const out = [];
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return out;
  for (const name of fs.readdirSync(abs).sort(cmp)) {
    if (name.startsWith('.')) continue;
    const r = `${rel}/${name}`;
    const st = fs.statSync(path.join(root, r));
    if (st.isDirectory()) out.push(...walk(root, r));
    else if (st.isFile()) out.push(r);
  }
  return out;
}

const entryOf = (root, rel) => ({ path: posix(rel), sha256: sha256Hex(fs.readFileSync(path.join(root, rel))) });

/** The Layer 1 input files with their sha256, sorted by path. */
export function inputEntries(root = REPO_ROOT) {
  const files = new Set([...INPUT_DIRS.flatMap((d) => walk(root, d)), ...INPUT_FILES]);
  return [...files].sort(cmp).map((rel) => entryOf(root, rel));
}

/** {table_version, evaluator_version} from the tree (R-IT recipe). */
export function versions(root = REPO_ROOT) {
  return {
    table_version: filesHash(inputEntries(root)),
    evaluator_version: filesHash(EVALUATOR_FILES.map((rel) => entryOf(root, rel))),
  };
}

/** The assembly, as the plain data effective() needs: loadRealLotAssembly unchanged, plus the evaluator vocabulary. */
export async function buildBody(root = REPO_ROOT) {
  const { loadRealLotAssembly } = await import(pathToFileURL(path.join(root, ASSEMBLY_REL)).href);
  const VO = await import(pathToFileURL(path.join(root, 'scripts/analysis/bylaw/vocab.mjs')).href);
  const { I, units, C } = await loadRealLotAssembly(root);
  return JSON.parse(JSON.stringify({
    units,
    evaluator_vocab: VO.evaluatorVocab(I.vocab),
    enactments: C.enactments,
    absences: C.absences,
    authored: C.authored,
  }));
}

/** One unit per line, so a diff of the file names the unit that changed. */
export function serializeBody(body) {
  const { units, ...rest } = body;
  const head = Object.keys(rest).sort(cmp).map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(rest[k])}`);
  const unitLines = (units || []).map((u) => `    ${JSON.stringify(u)}`).join(',\n');
  return `{\n${head.join(',\n')},\n  "units": [\n${unitLines}\n  ]\n}`;
}

/** The whole file. */
export function render(doc) {
  const header = ['$comment', 'generator', 'table_version', 'evaluator_version', 'input_files', 'body_sha256']
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(doc[k])},`).join('\n');
  return `{\n${header}\n  "body": ${serializeBody(doc.body).split('\n').join('\n  ')}\n}\n`;
}

const COMMENT = 'GENERATED by scripts/generate-bylaw-layer2-input.mjs --write; never edit by hand (--check at pre-commit). '
  + 'Spec 124 R-II / R-IT (operator chat batch J, 2026-10-21): the Layer 1 input of the resolve_bylaws step (Spec 134), '
  + 'built with loadRealLotAssembly unchanged. table_version = filesHash over every file under scripts/seeds/bylaw and '
  + 'scripts/analysis/bylaw, the assembly and the generator; evaluator_version = filesHash over evaluate.mjs and dsl.mjs.';

export async function buildDoc(root = REPO_ROOT) {
  const body = await buildBody(root);
  const v = versions(root);
  return { $comment: COMMENT, generator: GENERATOR_REL, ...v, input_files: inputEntries(root).length, body_sha256: sha256Hex(serializeBody(body)), body };
}

/** Problems with a parsed file against the tree (file-only, no rebuild). */
export function checkDoc(root, doc) {
  const p = [];
  if (!doc || typeof doc !== 'object' || !doc.body) return [`${OUT_REL}: not a Layer 1 input document`];
  const v = versions(root);
  if (doc.table_version !== v.table_version) p.push(`${OUT_REL}: table_version is stale (a Layer 1 input changed): run node ${GENERATOR_REL} --write`);
  if (doc.evaluator_version !== v.evaluator_version) p.push(`${OUT_REL}: evaluator_version is stale (evaluate.mjs or dsl.mjs changed): run node ${GENERATOR_REL} --write`);
  if (doc.body_sha256 !== sha256Hex(serializeBody(doc.body))) p.push(`${OUT_REL}: body does not match body_sha256 (hand-edited?): run node ${GENERATOR_REL} --write`);
  return p;
}

async function main(argv) {
  const modes = argv.filter((a) => MODES.includes(a));
  const unknown = argv.filter((a) => !MODES.includes(a));
  if (modes.length !== 1 || unknown.length) {
    console.error(`usage: node ${GENERATOR_REL} --write | --check  (exactly one mode; got ${argv.join(' ') || 'none'})`);
    return 2;
  }
  const out = path.join(REPO_ROOT, OUT_REL);
  if (modes[0] === '--write') {
    const doc = await buildDoc(REPO_ROOT);
    fs.writeFileSync(out, render(doc));
    console.log(`[bylaw-layer2-input] wrote ${OUT_REL} (${doc.body.units.length} units, table_version ${doc.table_version.slice(0, 12)})`);
    return 0;
  }
  if (!fs.existsSync(out)) { console.error(`[bylaw-layer2-input] RED — ${OUT_REL} is missing: run node ${GENERATOR_REL} --write`); return 1; }
  let doc;
  try { doc = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { console.error(`[bylaw-layer2-input] RED — ${OUT_REL} does not parse: ${e.message}`); return 1; }
  const problems = checkDoc(REPO_ROOT, doc);
  if (problems.length) { console.error(`[bylaw-layer2-input] RED — ${problems.join('; ')}`); return 1; }
  console.log(`[bylaw-layer2-input] clean — ${OUT_REL} current (table_version ${doc.table_version.slice(0, 12)}, ${doc.input_files} input files)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 2; });
}
