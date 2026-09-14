#!/usr/bin/env node
/**
 * Spec 122/122a/123/124 split-move checker — the hook-enforced gate that makes a
 * spec move structurally unable to silently lose content or rot a citation.
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §4 R-I(4) ("a document
 *   move/consolidation is verified by a line-set diff before commit") — this tool IS
 *   that gate, not a restatement of the rule.
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-R / §R-8
 *   ("Hand-maintained trackers rot" — extends to spec prose, R-AA below).
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §10.3 (cross-cutting
 *   promises are declared data, generated, and gated).
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §12b.6 (self-test /
 *   refuse-to-emit over an unproven parser — the correct home of this rule; Spec 121
 *   §62's self-citation as "its own §12b.6" is a documented mislabel, ~49 sites,
 *   Spec 124 §9 U-row / this task's own ground-truth census).
 *
 * WHY THIS EXISTS. `122_pipeline_step_optimization.md` grew past readability (Spec 122a
 * already documents the operator's intelligibility ruling for the first appendix split,
 * 2026-08-28) and did so again. Every prior move was a HAND edit — cut here, paste there,
 * hope the diff reviewer notices a dropped sentence. This tool makes that structurally
 * impossible: `--refresh` is the ONLY sanctioned way to perform a move (it cuts, stamps a
 * stub, and hashes the moved block in one atomic pass), and `--check` re-verifies six
 * independent arms against the CURRENT tree on every commit/push.
 *
 * THE SIX ARMS (each has a known-bad fixture proven RED by --self-test):
 *   (i)   content survived   — every declared move's block is present at its destination
 *         anchor and hashes (LF-normalized) to the manifest's recorded content_sha256.
 *   (ii)  stub present       — the source still carries the anchor's original heading
 *         line (or, for a non-heading anchor — a bold-paragraph lead-in with no `#`
 *         line, Spec 122's four RE-FREEZE paragraphs being the one real instance — a
 *         short synthetic label; declared limitation, filed MED, see docblock note
 *         below), the stub body is <=3 non-blank lines, and it NAMES the destination
 *         spec + anchor.
 *   (iii) citations resolve  — every `Spec 1{19,20,21,22,23,24} §<n>` and every
 *         `Spec 124 R-<letter>` citation across docs/ src/ scripts/ tasks/ .cursor/
 *         resolves to a real heading in that spec (union 122a for the 122/123/124
 *         family) or, for an R-<letter> citation, a §5 register row — unless the exact
 *         citation string is listed in `known_dangling`. Widened to the whole 119-124
 *         family because the census that authorized this tool found a 49-site dangling
 *         citation (`Spec 121 §12b.6`) OUTSIDE the 122/123/124 family. This is a
 *         PRESENCE check, not a semantic one — a citation that resolves to the wrong
 *         section (a miscitation) passes by design; declared, never silently widened.
 *   (iv)  budget            — from_spec's line count AND byte count are each
 *         <= `budgets[spec].measured_at × (1 + headroom_pct/100)` — a HEADROOM
 *         margin around the last reviewed measurement, never a bare ceiling at the
 *         exact byte a manifest happened to be seeded at (a real pilot-9-commit-9
 *         RE-FREEZE paragraph would otherwise hard-block on day one). `--refresh`
 *         RATCHETS `measured_at` DOWN when the spec shrank; it REFUSES to widen
 *         `measured_at` when the spec grew — an intentional, reviewed growth is a
 *         hand-edit to the manifest's `measured_at`, declared and diffed, never a
 *         side effect of running the tool. Numbers live in the manifest, never as
 *         code literals.
 *   (v)   reader guard      — no declared move's `anchor` string appears inside any
 *         `reader_guards[].slices` entry (a program that slices spec prose by a
 *         heading string must not have that heading pulled out from under it).
 *   (vi)  totality           — every 122a section headed
 *         `(moved from Spec N §x)` has a corresponding `moves[]` row. An undeclared
 *         move is itself RED — the manifest is the one place a move may be recorded.
 *
 * DECLARED LIMITATION (arm ii, non-heading anchor). Spec 122's four "RE-FREEZE #1-#4"
 * paragraphs (§8.2) have no individual `#`-heading — each is a bold-lead-in paragraph.
 * For a move whose `anchor` does not match `^#{1,6}\s` (a markdown heading), arm (ii)
 * cannot demand the ORIGINAL line survive verbatim (that would defeat the point of
 * moving it — the paragraph itself is what is being cut). Instead it requires a fresh,
 * short SYNTHETIC label line naming the move id, destination spec, and to_anchor. Filed
 * MED in `docs/reports/review_followups.md` — a real, accepted narrowing of the "exact
 * heading" promise, not a silent one.
 *
 * Usage:
 *   node scripts/analysis/spec-split-check.mjs --refresh    (perform every declared,
 *       not-yet-executed move: cut the block from from_spec, stamp a stub, append the
 *       block verbatim to to_spec under to_anchor, and write content_sha256/moved_at/
 *       commit back into the manifest. A move whose anchor is already gone AND whose
 *       stub+destination already verify is left untouched — --refresh is idempotent.)
 *   node scripts/analysis/spec-split-check.mjs --check       (re-verify all six arms
 *       against the CURRENT tree; drift/dangling-citation/budget-breach/reader-break/
 *       undeclared-move all exit 1. Writes nothing.)
 *   node scripts/analysis/spec-split-check.mjs --self-test    (six known-bad, in-memory
 *       fixtures, each proven RED, per Spec 120 §12b.6 — "anything that enforces must be
 *       proven to fire." Also proves GREEN on the same fixtures once corrected.)
 *
 * Exit codes: 0 = clean · 1 = drift/dangling/budget/guard/totality (--check) · 2 =
 *   self-test failed or bad setup (mirrors step-churn-complexity.mjs's own convention).
 */
'use strict';

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Overridable for tests — same convention as BUILDO_CHURN_TABLE_PATH /
// BUILDO_PROGRAMME_ITEMS_PATH: a path RELATIVE to REPO_ROOT, joined below, so a test
// can point the whole tool at an isolated tmp fixture tree without touching the real
// committed specs.
const SPEC_DIR = process.env.BUILDO_SPEC_SPLIT_SPEC_DIR
  ? path.join(REPO_ROOT, process.env.BUILDO_SPEC_SPLIT_SPEC_DIR)
  : path.join(REPO_ROOT, 'docs/specs/01-pipeline');
export const MANIFEST_PATH = process.env.BUILDO_SPEC_SPLIT_MANIFEST_PATH
  ? path.join(REPO_ROOT, process.env.BUILDO_SPEC_SPLIT_MANIFEST_PATH)
  : path.join(SPEC_DIR, '122_split_manifest.json');
const SCHEMA_PATH = path.join(REPO_ROOT, 'docs/specs/01-pipeline/122_split_manifest.schema.json');

// The whole 119-124 family (arm iii's widened scope) + the filename each spec id
// resolves to. `122a` is a citation TARGET only (never a `from_spec`) — Spec 122's own
// appendix, folded into the 122/123/124 family's citation-resolution set.
export const SPEC_FILES = {
  119: '119_backend_verification_doctrine.md',
  120: '120_pipeline_step_runner.md',
  121: '121_assessment_and_verification_methodology.md',
  122: '122_pipeline_step_optimization.md',
  '122a': '122a_step_optimization_appendix.md',
  123: '123_step_opt_assessment_validation.md',
  124: '124_step_standard_policy.md',
};
// The family that shares 122a as a citation-resolution fallback (arm iii).
const APPENDIX_FAMILY = new Set(['122', '123', '124']);
// Grep roots for citation census (arm iii) — matches the plan's own census scope.
const CITATION_ROOTS = ['docs', 'src', 'scripts', 'tasks', '.cursor'];

function specPath(specId) {
  const file = SPEC_FILES[specId];
  if (!file) throw new Error(`spec-split-check: unknown spec id "${specId}"`);
  return path.join(SPEC_DIR, file);
}

function readSpec(specId) {
  return readFileSync(specPath(specId), 'utf8');
}

function loadManifest(manifestPath = MANIFEST_PATH) {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

/** LF-normalize (CRLF -> LF) — heritage-418 precedent, tasks/lessons.md CRLF lesson. */
function lf(text) {
  return text.replace(/\r\n/g, '\n');
}

function sha256(text) {
  return crypto.createHash('sha256').update(lf(text), 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Heading index — every `#`-heading in a spec, with its extracted section number
// (if any) and full 0-based line index. Used by arm (iii) (citation resolution),
// arm (ii) (stub/original-heading presence) and arm (vi) (totality).
// ---------------------------------------------------------------------------

// Matches `1`, `1.2`, `1.2a`, `10b`, `12b.6`, `3.0b` — digits, an optional trailing
// letter, then zero or more `.digits[letter]` groups (a letter CAN precede a further
// dotted group, e.g. Spec 120's real `12b.6`).
const NUMBER_RE = /^([0-9]+[a-z]?(?:\.[0-9]+[a-z]?)*)\b/;

/** `{lineIndex, level, text, number}[]` — `number` is the leading `1.2a`/`10b`/`12b.6`-
 * shaped token if the heading has one, else null. Ratifies Spec 122's own numbering
 * rule (numbers are stable, never re-flowed) as the resolution key. */
export function extractHeadings(text) {
  const lines = lf(text).split('\n');
  const out = [];
  const HEADING_RE = /^(#{1,6})\s+(.*)$/;
  lines.forEach((line, i) => {
    const m = HEADING_RE.exec(line);
    if (!m) return;
    // Some specs (124) write heading numbers as `## §7. Title` — strip a leading `§`
    // (or the word `Section `) before matching, so the `§` glyph itself is never
    // mistaken for "no number here."
    const headingText = m[2].trim().replace(/^(§|Section\s+)/, '');
    const numMatch = NUMBER_RE.exec(headingText);
    out.push({ lineIndex: i, level: m[1].length, text: line, number: numMatch ? numMatch[1] : null });
  });
  return out;
}

/**
 * Every citable section-number token in `text`: every heading's own number, PLUS
 * every top-level markdown ordered-list item (`1. `, `2. `, ...) nested directly
 * under a numbered heading, indexed as `"<headingNumber>.<itemNumber>"` — Specs
 * 120/121/124 all cite a numbered-list step this way (e.g. "Spec 124 §4.2" = the
 * 2nd numbered item under `## §4.`) even though no `#`-heading exists for the
 * sub-item itself. Declared, not invented: this is how the corpus already writes
 * these citations; a checker that only indexed `#`-headings would flag hundreds of
 * genuine, pre-existing, non-dangling citations as dangling.
 */
export function extractResolvableNumbers(text) {
  const lines = lf(text).split('\n');
  const headings = extractHeadings(text);
  const numbers = new Set(headings.map((h) => h.number).filter(Boolean));
  const LIST_ITEM_RE = /^\s{0,3}([0-9]+)\.\s/;
  for (let hi = 0; hi < headings.length; hi++) {
    const h = headings[hi];
    if (!h.number) continue;
    const end = hi + 1 < headings.length ? headings[hi + 1].lineIndex : lines.length;
    for (let li = h.lineIndex + 1; li < end; li++) {
      const m = LIST_ITEM_RE.exec(lines[li]);
      if (m) numbers.add(`${h.number}.${m[1]}`);
    }
  }
  return numbers;
}

/** Every `## Appendix §A<n> — ... (moved from Spec N §x) — ...` heading in 122a,
 * `{lineIndex, text, fromSpec, fromAnchor}[]` — feeds arm (vi) totality. */
export function extractDeclaredMoveHeadings(appendixText) {
  const out = [];
  for (const h of extractHeadings(appendixText)) {
    const m = /\(moved from Spec\s+(\d+[a-z]?)\s+§([^)]+)\)/.exec(h.text);
    if (m) out.push({ lineIndex: h.lineIndex, text: h.text, fromSpec: m[1], fromAnchor: `§${m[2]}` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Citation census (arm iii)
// ---------------------------------------------------------------------------

/** `{citation, file, line}[]` for every `Spec 1{19..24} §<n>` / `Spec 124 R-<letter>`
 * citation under CITATION_ROOTS. This tool has no git dependency for the census — it
 * must see the WORKING TREE, not a committed SHA (Spec 08 A7 landing-discipline note:
 * "the hook validates the working tree, not the index or a SHA"). */
function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  // This tool's own self-test fixtures deliberately embed fake citations
  // ("Spec 122 §99.9", "Spec 122 §77") as known-bad proof strings — excluded from
  // the census so they cannot be mistaken for real corpus rot.
  const SELF_EXCLUDE = /spec-split-check\.mjs$|spec-split\.infra\.test\.ts$/;
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name.startsWith('_tmp')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else if (/\.(md|ts|tsx|js|mjs|json|sh|yml|yaml)$/.test(ent.name) && !SELF_EXCLUDE.test(ent.name)) out.push(full);
  }
  return out;
}

const CITATION_SECTION_RE = /Spec\s+(119|120|121|122|123|124)\s+§([0-9]+[a-z]?(?:\.[0-9]+[a-z]?)*)/g;
// R-PACE-1 (Spec 124 R-PACE-1, WF "R-PACE-1 doc landing", 2026-09-13) widens
// the amendment-suffix arm from dot-only (R-K.1/R-K.2) to dot-OR-hyphen
// (R-PACE-1/R-PACE-2/R-PACE-3) — the PACE sub-scheme names its rows with a
// hyphenated ordinal, not the register's own dotted-amendment convention.
const CITATION_RULING_RE = /Spec\s+124\s+(R-[A-Z]+(?:[.-][0-9]+)?)/g;

/** `{citation, specId, kind, file, line}[]` — `kind` is `'section'` or `'ruling'`. */
export function collectCitations(roots = CITATION_ROOTS.map((r) => path.join(REPO_ROOT, r))) {
  const out = [];
  for (const root of roots) {
    for (const file of walkFiles(root)) {
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lines = lf(text).split('\n');
      lines.forEach((line, idx) => {
        for (const m of line.matchAll(CITATION_SECTION_RE)) {
          out.push({ citation: `Spec ${m[1]} §${m[2]}`, specId: m[1], number: m[2], kind: 'section', file, line: idx + 1 });
        }
        for (const m of line.matchAll(CITATION_RULING_RE)) {
          out.push({ citation: `Spec 124 ${m[1]}`, specId: '124', kind: 'ruling', file, line: idx + 1 });
        }
      });
    }
  }
  return out;
}

/** Register-row ruling ids declared in Spec 124 §5 (`| R-X | ... |` table rows). Mirrors CITATION_RULING_RE's dot-OR-hyphen amendment arm (R-PACE-1). */
export function extractRegisterRulingIds(spec124Text) {
  const ids = new Set();
  for (const raw of lf(spec124Text).split('\n')) {
    const m = /^\|\s*(R-[A-Z]+(?:[.-][0-9]+)?)\s*\|/.exec(raw.trim());
    if (m) ids.add(m[1]);
  }
  return ids;
}

/**
 * Arm (iii). `citations` from `collectCitations()`; `specTexts` is `{specId: text}`
 * for every spec in SPEC_FILES (122a included); `knownDangling` is the manifest's
 * `known_dangling[]`. Returns `{dangling: [...], totalCitations: n}` — `dangling`
 * entries not covered by `knownDangling` are the RED set.
 */
export function checkCitationsResolve(citations, specTexts, knownDangling) {
  const declaredDangling = new Set((knownDangling || []).map((d) => d.citation));
  const headingsBySpec = {};
  for (const [id, text] of Object.entries(specTexts)) {
    headingsBySpec[id] = extractResolvableNumbers(text);
  }
  const registerIds = specTexts['124'] ? extractRegisterRulingIds(specTexts['124']) : new Set();
  const dangling = [];
  const seen = new Set();
  for (const c of citations) {
    let ok;
    if (c.kind === 'ruling') {
      ok = registerIds.has(c.citation.replace('Spec 124 ', ''));
    } else {
      const own = headingsBySpec[c.specId] || new Set();
      const appendix = APPENDIX_FAMILY.has(c.specId) ? headingsBySpec['122a'] || new Set() : new Set();
      ok = own.has(c.number) || appendix.has(c.number);
    }
    const key = `${c.citation}|${c.file}|${c.line}`;
    if (!ok && !declaredDangling.has(c.citation) && !seen.has(key)) {
      seen.add(key);
      dangling.push(c);
    }
  }
  return { dangling, totalCitations: citations.length };
}

// ---------------------------------------------------------------------------
// Move mechanics (arms i, ii, vi + --refresh)
// ---------------------------------------------------------------------------

const HEADING_ANCHOR_RE = /^#{1,6}\s/;

/** Finds `anchor` as an exact full-line match in `lines`; returns the 0-based line
 * index or -1. Exact-line match (not substring) so a heading number appearing inside
 * unrelated prose can never be mistaken for the anchor itself. */
function findAnchorLine(lines, anchor) {
  return lines.findIndex((l) => l === anchor);
}

/** `{lines, startIndex, block}` of a move's block in `from_spec`'s current text, or
 * null if the anchor is not found (already moved). Block = `line_count` consecutive
 * lines starting at the anchor (declared in the manifest at authoring time, never
 * re-derived from heading nesting — deliberately simple, see docblock). */
export function locateBlock(specText, move) {
  const lines = lf(specText).split('\n');
  const idx = findAnchorLine(lines, move.anchor);
  if (idx === -1) return null;
  // For a `#`-heading anchor, the heading line is deliberately PRESERVED by its own
  // stub (buildStub keeps it as line 1, see docblock) — so finding the anchor again
  // is NOT proof the block is still there. Detect an already-applied stub (a
  // "**MOVED to ...**" pointer immediately after the heading) and report "already
  // executed" (null) rather than re-cutting the stub itself on a second --refresh.
  if (HEADING_ANCHOR_RE.test(move.anchor)) {
    const nextFew = lines.slice(idx + 1, idx + 4).join(' ');
    if (/\*\*MOVED to/.test(nextFew)) return null;
  }
  const block = lines.slice(idx, idx + move.line_count);
  return { lines, startIndex: idx, block };
}

/** A move's stub body — the pointer text written in from_spec in place of the cut
 * block's TAIL (the heading/anchor line itself is preserved for a `#`-heading anchor;
 * for a non-heading anchor a short synthetic label replaces the anchor line too, see
 * the arm-ii docblock note). Always <=3 non-blank lines, always names to_spec+to_anchor. */
export function buildStub(move, dateStr) {
  const isHeading = HEADING_ANCHOR_RE.test(move.anchor);
  const destFile = SPEC_FILES[move.to_spec] ? path.basename(SPEC_FILES[move.to_spec]) : `${move.to_spec}`;
  const pointer = `**MOVED to \`${destFile}\` ${move.to_anchor} — ${dateStr} (Spec 124 §4 R-I(4)).** ${move.classification === 'HISTORICAL' ? 'Historical; ' : ''}${move.evidence}`.trim();
  if (isHeading) {
    return [move.anchor, '', pointer, ''];
  }
  // Non-heading (bold-paragraph) anchor — synthetic short label line replaces it.
  const label = `**${move.id} — moved to \`${destFile}\` ${move.to_anchor}, ${dateStr}.**`;
  return [label, '', pointer, ''];
}

/** Verifies arm (ii) for one move against the CURRENT from_spec text (only called
 * once `locateBlock` returns null — i.e. the move has already executed). */
export function verifyStub(fromSpecText, move) {
  const lines = lf(fromSpecText).split('\n');
  const isHeading = HEADING_ANCHOR_RE.test(move.anchor);
  let idx = -1;
  if (isHeading) {
    idx = findAnchorLine(lines, move.anchor);
    if (idx === -1) return { ok: false, reason: `stub missing — heading "${move.anchor}" not found in from_spec` };
  } else {
    idx = lines.findIndex((l) => l.includes(move.id) && l.includes('moved to'));
    if (idx === -1) return { ok: false, reason: `stub missing — no synthetic label for move ${move.id}` };
  }
  // Body = next few non-blank lines up to the next heading or blank-blank gap.
  const bodyLines = [];
  for (let i = idx + 1; i < lines.length && bodyLines.length < 6; i++) {
    if (HEADING_ANCHOR_RE.test(lines[i])) break;
    if (lines[i].trim().length > 0) bodyLines.push(lines[i]);
    else if (bodyLines.length > 0) break;
  }
  if (bodyLines.length === 0) return { ok: false, reason: `stub for ${move.id} has no pointer body` };
  if (bodyLines.length > 3) return { ok: false, reason: `stub for ${move.id} body has ${bodyLines.length} non-blank lines, >3` };
  const bodyText = bodyLines.join(' ');
  const destFile = SPEC_FILES[move.to_spec] ? path.basename(SPEC_FILES[move.to_spec]) : `${move.to_spec}`;
  if (!bodyText.includes(destFile)) return { ok: false, reason: `stub for ${move.id} does not name destination spec "${destFile}"` };
  if (!bodyText.includes(move.to_anchor)) return { ok: false, reason: `stub for ${move.id} does not name to_anchor "${move.to_anchor}"` };
  return { ok: true };
}

/** Verifies arm (i) for one move: a `line_count`-line block hashing to
 * `move.content_sha256` exists somewhere at/after `to_anchor` inside `toSpecText`. */
export function verifyContentSurvived(toSpecText, move) {
  if (!move.content_sha256) return { ok: false, reason: `move ${move.id} has no recorded content_sha256 — never refreshed` };
  const lines = lf(toSpecText).split('\n');
  const anchorIdx = findAnchorLine(lines, move.to_anchor);
  if (anchorIdx === -1) return { ok: false, reason: `move ${move.id}: to_anchor "${move.to_anchor}" not found in to_spec` };
  for (let start = anchorIdx; start < lines.length; start++) {
    const candidate = lines.slice(start, start + move.line_count).join('\n');
    if (sha256(candidate) === move.content_sha256) return { ok: true };
  }
  return { ok: false, reason: `move ${move.id}: no ${move.line_count}-line block under "${move.to_anchor}" hashes to the recorded content_sha256 — content did not survive intact` };
}

/** Arm (vi): every 122a `(moved from Spec N §x)` heading has a matching `moves[]` row
 * (matched by the destination heading text appearing verbatim as some move's
 * `to_anchor`). */
export function checkTotality(appendixText, moves) {
  const declared = extractDeclaredMoveHeadings(appendixText);
  const undeclared = [];
  for (const d of declared) {
    const matches = (moves || []).some((m) => d.text.startsWith(m.to_anchor) || d.text === m.to_anchor);
    if (!matches) undeclared.push(d);
  }
  return { undeclared };
}

/** Arm (v): no move's anchor appears inside a reader_guards[] slice string. */
export function checkReaderGuards(moves, readerGuards) {
  const breaks = [];
  for (const g of readerGuards || []) {
    for (const slice of g.slices || []) {
      for (const m of moves || []) {
        if (m.anchor.includes(slice) || slice.includes(m.anchor)) {
          breaks.push({ reader: g.reader, slice, moveId: m.id });
        }
      }
    }
  }
  return breaks;
}

/**
 * Arm (v)'s SECOND half (H2, output-review fix 2026-09-10): a `reader_guards[]` row
 * is a claim that some file's CODE literally depends on some slice of a spec — that
 * claim must be EXECUTABLE, not descriptive prose that can rot unnoticed. For every
 * row carrying `reader_literal`, asserts that exact substring is still present,
 * byte-for-byte, in the reader's OWN source file — the same "proven to fire"
 * discipline this whole tool exists to apply to citations, turned on the guard
 * mechanism's own premise. A row whose `reader_literal` no longer matches means
 * either the reader changed shape (this manifest's row is now WRONG, not merely
 * stale) or someone hand-edited the manifest to describe a dependency that was
 * never real.
 */
/**
 * `scripts/generate-system-map.mjs`'s own dependency on EVERY spec file in the
 * 122/122a/123/124 family (M-panel finding, 2026-09-10): `parseSpec` requires a
 * first-line `# `-heading (a leading "Spec N -- " prefix is stripped, case
 * insensitive) and defaults `status` to the string 'Done' when neither the
 * blockquote-Status pattern nor the bare bold-Status-line pattern matches — a
 * silent, wrong default, not a loud one. Checked for every row in
 * `reader_guards[]` carrying `checks_spec_files: true`.
 */
export function checkSystemMapDependencies(specTexts) {
  const problems = [];
  for (const specId of Object.keys(SPEC_FILES)) {
    const text = specTexts[specId];
    if (text === undefined) continue;
    const firstHeading = /^#\s+(.+)$/m.exec(text);
    if (!firstHeading) problems.push(`spec ${specId}: no first-line "# " heading — generate-system-map.mjs's titleMatch would fall back to the bare filename`);
    const hasStatus = />\s*\*\*Status:\s*(\w+)\*\*/.test(text) || /^\*\*Status:\*\*\s*(.+)$/m.test(text);
    if (!hasStatus) problems.push(`spec ${specId}: no "**Status:**" line — generate-system-map.mjs silently defaults status to 'Done'`);
  }
  return problems;
}

export function checkReaderGuardsExecutable(readerGuards) {
  const problems = [];
  for (const g of readerGuards || []) {
    if (!g.reader_literal) continue;
    const abs = path.join(REPO_ROOT, g.reader);
    if (!existsSync(abs)) {
      problems.push(`reader "${g.reader}" does not exist`);
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    if (!text.includes(g.reader_literal)) {
      problems.push(`reader "${g.reader}" no longer contains the declared literal "${g.reader_literal}" — this guard's own dependency claim has rotted`);
    }
  }
  return problems;
}

/** `wc -l` semantics (counts newline characters, not array length) — a
 * trailing-newline-terminated file must not count a phantom empty final line. */
function countLines(text) {
  const normalized = lf(text);
  const rawLines = normalized.split('\n');
  return normalized.endsWith('\n') ? rawLines.length - 1 : rawLines.length;
}

/**
 * Arm (iv): from_spec's line/byte counts vs a HEADROOM budget, never a bare
 * ceiling — `budgets[spec] = { headroom_pct, measured_at: {lines, bytes, commit} }`.
 * The effective limit is `measured_at × (1 + headroom_pct/100)`, so an intentional,
 * REVIEWED growth (e.g. pilot 9 commit 9's RE-FREEZE #5 paragraph) fits inside a
 * declared margin instead of hard-blocking on the exact byte this manifest was last
 * seeded at. Widening the margin itself still requires a manual `measured_at` bump
 * (see `refreshMeasuredAt` below) — headroom absorbs SMALL, expected drift, it does
 * not license unbounded growth.
 */
export function checkBudget(specId, text, budgets) {
  const b = budgets[specId];
  if (!b || !b.measured_at) return { ok: false, reason: `no budget declared for spec ${specId}` };
  const lines = countLines(text);
  const bytes = Buffer.byteLength(text, 'utf8');
  const headroom = 1 + (b.headroom_pct || 0) / 100;
  const maxLines = Math.floor(b.measured_at.lines * headroom);
  const maxBytes = Math.floor(b.measured_at.bytes * headroom);
  const overLines = lines > maxLines;
  const overBytes = bytes > maxBytes;
  return { ok: !overLines && !overBytes, lines, bytes, maxLines, maxBytes, overLines, overBytes };
}

/**
 * The ONLY sanctioned mutator of `budgets[spec].measured_at` — a RATCHET, never a
 * bare re-seed: updates `measured_at` to the current {lines, bytes, commit} ONLY
 * when the spec has gotten SMALLER or stayed the same (both <=), mirroring
 * step-churn-complexity.mjs's own committed-artifact-only-ratchets convention. A
 * spec that GREW (even within headroom) is left with its OLD `measured_at` —
 * `--refresh` can never silently widen the ceiling; an intentional, reviewed
 * bump to `measured_at` is a hand-edit to the manifest, the one place growth is
 * declared. Returns `{updated, reason}`.
 */
export function refreshMeasuredAt(specId, text, commit, budgets) {
  const b = budgets[specId];
  if (!b || !b.measured_at) return { updated: false, reason: `no budget declared for spec ${specId}` };
  const lines = countLines(text);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (lines === b.measured_at.lines && bytes === b.measured_at.bytes) {
    return { updated: false, reason: 'already up to date' };
  }
  if (lines > b.measured_at.lines || bytes > b.measured_at.bytes) {
    return { updated: false, reason: `refused — spec ${specId} grew (measured ${lines}L/${bytes}B > recorded ${b.measured_at.lines}L/${b.measured_at.bytes}B); bump measured_at by hand if this growth is reviewed and intentional` };
  }
  b.measured_at = { lines, bytes, commit };
  return { updated: true, reason: 'ratcheted down' };
}

// ---------------------------------------------------------------------------
// --refresh — perform every not-yet-executed move, mutating from_spec + to_spec +
// the manifest itself (content_sha256/moved_at/commit).
// ---------------------------------------------------------------------------

function currentHeadShort() {
  const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : 'UNCOMMITTED';
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function doRefresh() {
  const manifest = loadManifest();
  const textBySpec = {};
  for (const m of manifest.moves) {
    textBySpec[m.from_spec] = textBySpec[m.from_spec] || lf(readSpec(m.from_spec));
    textBySpec[m.to_spec] = textBySpec[m.to_spec] || lf(readSpec(m.to_spec));
  }
  const date = todayStr();
  const commit = currentHeadShort();
  let changed = false;
  for (const move of manifest.moves) {
    if (move.classification === 'GRANDFATHERED') continue; // pre-existing, never cut by this tool
    const fromText = textBySpec[move.from_spec];
    const located = locateBlock(fromText, move);
    if (!located) {
      // Already moved (or never present) — verify idempotently, do not re-cut.
      const stubCheck = verifyStub(fromText, move);
      if (!stubCheck.ok) {
        throw new Error(`--refresh: move ${move.id} has no block AND no valid stub (${stubCheck.reason}) — manual intervention required`);
      }
      continue;
    }
    const { lines, startIndex, block } = located;
    const contentSha = sha256(block.join('\n'));
    const stubLines = buildStub(move, date);
    const newFromLines = [...lines.slice(0, startIndex), ...stubLines, ...lines.slice(startIndex + move.line_count)];
    textBySpec[move.from_spec] = newFromLines.join('\n');

    // Append verbatim to to_spec under to_anchor, bridging paragraph per 122a's own
    // existing convention (read, not assumed — see the appendix's A3-A6 sections).
    const toLines = lf(textBySpec[move.to_spec]).split('\n');
    const bridging = `Moved from Spec ${move.from_spec} — ${move.evidence}`;
    const appended = [
      '',
      '---',
      '',
      move.to_anchor,
      '',
      bridging,
      '',
      ...block,
    ];
    textBySpec[move.to_spec] = [...toLines, ...appended].join('\n');

    move.content_sha256 = contentSha;
    move.line_count = block.length;
    move.moved_at = date;
    move.commit = commit;
    changed = true;
  }

  // Budget ratchet — every spec with a declared budget, whether or not a move
  // touched it this run (123/124 carry budgets with zero moves). Ratchets
  // measured_at DOWN only; refuses (and logs why) if the spec grew.
  let budgetChanged = false;
  for (const specId of Object.keys(manifest.budgets || {})) {
    const currentText = textBySpec[specId] !== undefined ? textBySpec[specId] : readSpec(specId);
    const result = refreshMeasuredAt(specId, currentText, commit, manifest.budgets);
    if (result.updated) {
      budgetChanged = true;
      console.log(`[spec-split-check] --refresh: spec ${specId} measured_at ratcheted down (${result.reason}).`);
    } else if (result.reason && result.reason.startsWith('refused')) {
      console.log(`[spec-split-check] --refresh: spec ${specId} budget NOT widened — ${result.reason}.`);
    }
  }

  if (changed || budgetChanged) {
    for (const [specId, text] of Object.entries(textBySpec)) {
      writeFileSync(specPath(specId), text.endsWith('\n') ? text : `${text}\n`);
    }
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log('[spec-split-check] --refresh performed move(s)/budget ratchet; manifest + spec files updated.');
  } else {
    console.log('[spec-split-check] --refresh — nothing to do, all declared moves already executed and verified, budgets unchanged.');
  }
}

// ---------------------------------------------------------------------------
// --check — re-verify all six arms against the CURRENT tree. Writes nothing.
// ---------------------------------------------------------------------------

function doCheck() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`[spec-split-check] DRIFT — ${path.relative(REPO_ROOT, MANIFEST_PATH)} does not exist.`);
    return 1;
  }
  const manifest = loadManifest();
  const ajv = new Ajv({ allowUnionTypes: true, strict: false });
  const schema = loadSchema();
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    console.error('[spec-split-check] DRIFT — manifest fails its own schema:');
    for (const e of validate.errors || []) console.error(`  - ${e.instancePath} ${e.message}`);
    return 1;
  }

  const specTexts = {};
  for (const id of Object.keys(SPEC_FILES)) specTexts[id] = readSpec(id);

  const problems = [];

  // (i) content survived + (ii) stub present — per move, whichever state it is in.
  // GRANDFATHERED moves (122a §A1-A5, moved 2026-08-28 before this tool existed)
  // are exempt from i/ii — there is no reliable pre-tool anchor/stub to re-verify —
  // but still COUNT for arm (vi) totality below, so they are not flagged undeclared.
  for (const move of manifest.moves) {
    if (move.classification === 'GRANDFATHERED') continue;
    const fromText = specTexts[move.from_spec];
    const located = locateBlock(fromText, move);
    if (located) {
      problems.push(`move ${move.id} has NOT been executed (--refresh has not been run for it, or it was hand-reverted) — block still present at "${move.anchor}"`);
      continue;
    }
    const stubCheck = verifyStub(fromText, move);
    if (!stubCheck.ok) problems.push(`arm(ii) ${stubCheck.reason}`);
    const contentCheck = verifyContentSurvived(specTexts[move.to_spec], move);
    if (!contentCheck.ok) problems.push(`arm(i) ${contentCheck.reason}`);
  }

  // (iii) citations resolve
  const citations = collectCitations();
  const { dangling } = checkCitationsResolve(citations, specTexts, manifest.known_dangling);
  for (const d of dangling) {
    problems.push(`arm(iii) DANGLING citation "${d.citation}" at ${path.relative(REPO_ROOT, d.file)}:${d.line} — not declared in known_dangling`);
  }

  // (iv) budget — every spec that carries a declared budget (122/123/124 — declared
  // even with zero moves for 123/124, per the operator ruling: no 123/124 moves in
  // this task, but a budget still caps future growth).
  for (const specId of Object.keys(manifest.budgets)) {
    const b = checkBudget(specId, specTexts[specId], manifest.budgets);
    if (!b.ok) problems.push(`arm(iv) BUDGET BREACH spec ${specId}: lines=${b.lines}/${b.maxLines} bytes=${b.bytes}/${b.maxBytes}`);
  }

  // (v) reader guards — collision AND executable-literal halves
  const breaks = checkReaderGuards(manifest.moves, manifest.reader_guards);
  for (const b of breaks) problems.push(`arm(v) reader "${b.reader}" slices on a moved anchor (move ${b.moveId})`);
  for (const p of checkReaderGuardsExecutable(manifest.reader_guards)) problems.push(`arm(v) ${p}`);
  if ((manifest.reader_guards || []).some((g) => g.checks_spec_files)) {
    for (const p of checkSystemMapDependencies(specTexts)) problems.push(`arm(v) ${p}`);
  }

  // (vi) totality
  const { undeclared } = checkTotality(specTexts['122a'], manifest.moves);
  for (const u of undeclared) problems.push(`arm(vi) UNDECLARED MOVE — 122a heading "${u.text}" has no moves[] row`);

  if (problems.length) {
    console.error(`[spec-split-check] DRIFT — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`[spec-split-check] clean — ${manifest.moves.length} move(s) verified, ${citations.length} citations checked, 0 dangling, budgets held, 0 reader breaks, totality holds.`);
  return 0;
}

// ---------------------------------------------------------------------------
// --self-test (Spec 120 §12b.6) — six known-bad, in-memory fixtures.
// ---------------------------------------------------------------------------

export function selfTest() {
  const fail = [];

  // (i) content survived — a dropped sentence must fail the hash.
  {
    const move = { id: 'X1', from_spec: '122', anchor: '## Fixture heading', to_spec: '122a', to_anchor: '## Appendix §AX — Fixture', line_count: 3, classification: 'HISTORICAL', evidence: 'fixture' };
    const originalBlock = ['## Fixture heading', 'line one.', 'line two, the important sentence.'];
    move.content_sha256 = sha256(originalBlock.join('\n'));
    const badDestText = ['# 122a', '', move.to_anchor, '', 'bridging.', '', '## Fixture heading', 'line one.', 'line TWO WITH THE SENTENCE DROPPED.'].join('\n');
    const check = verifyContentSurvived(badDestText, move);
    if (check.ok) fail.push('(i) content-survived: a dropped-sentence fixture (bad-dropped-sentence.md) was NOT caught');
    const goodDestText = ['# 122a', '', move.to_anchor, '', 'bridging.', '', ...originalBlock].join('\n');
    const goodCheck = verifyContentSurvived(goodDestText, move);
    if (!goodCheck.ok) fail.push(`(i) content-survived: a GOOD fixture was wrongly flagged (${goodCheck.reason})`);
  }

  // (ii) stub present — missing stub, and a stub with no destination named.
  {
    const move = { id: 'X2', from_spec: '122', anchor: '## Fixture heading 2', to_spec: '122a', to_anchor: '## Appendix §AX — Fixture 2', line_count: 2, classification: 'HISTORICAL', evidence: 'fixture' };
    const missingStubText = ['# 122', '', 'some other content, the heading is simply gone', ''].join('\n');
    const r1 = verifyStub(missingStubText, move);
    if (r1.ok) fail.push('(ii) stub-present: a fixture with NO stub at all (bad-missing-stub.md) was NOT caught');

    const noDestText = ['# 122', '', move.anchor, '', '**MOVED elsewhere.**', ''].join('\n');
    const r2 = verifyStub(noDestText, move);
    if (r2.ok) fail.push('(ii) stub-present: a stub naming no destination (bad-stub-without-destination.md) was NOT caught');

    const goodText = ['# 122', '', move.anchor, '', `**MOVED to \`122a_step_optimization_appendix.md\` ${move.to_anchor} — 2026-09-10.** history.`, ''].join('\n');
    const r3 = verifyStub(goodText, move);
    if (!r3.ok) fail.push(`(ii) stub-present: a GOOD stub was wrongly flagged (${r3.reason})`);

    // Idempotency regression lock: a HEADING anchor is deliberately PRESERVED by its
    // own stub, so re-finding the heading line must NOT be read as "block still
    // present" once a stub already follows it — a second --refresh must not re-cut
    // the stub itself (the historical bug this fixture pins).
    const alreadyStubbedText = goodText;
    const relocated = locateBlock(alreadyStubbedText, move);
    if (relocated !== null) fail.push('(ii)/idempotency: locateBlock re-found a block behind an already-applied stub — a second --refresh would corrupt it');
  }

  // (iii) citations resolve — a dangling citation with no known_dangling entry.
  {
    const citations = [{ citation: 'Spec 122 §99.9', specId: '122', number: '99.9', kind: 'section', file: 'bad-dangling-citation.md', line: 1 }];
    const specTexts = { '122': '## 1. Real heading\n', '122a': '## Appendix §A1 — x\n', '123': '', '124': '' };
    const r1 = checkCitationsResolve(citations, specTexts, []);
    if (r1.dangling.length !== 1) fail.push('(iii) citations-resolve: a dangling citation (bad-dangling-citation.md) was NOT caught');
    const r2 = checkCitationsResolve(citations, specTexts, [{ citation: 'Spec 122 §99.9', sites: 1, why: 'fixture', owner: 'x', declared: '2026-09-10' }]);
    if (r2.dangling.length !== 0) fail.push('(iii) citations-resolve: a DECLARED dangling citation was wrongly still flagged');
    const goodCitations = [{ citation: 'Spec 122 §1', specId: '122', number: '1', kind: 'section', file: 'good.md', line: 1 }];
    const r3 = checkCitationsResolve(goodCitations, specTexts, []);
    if (r3.dangling.length !== 0) fail.push('(iii) citations-resolve: a resolvable citation was wrongly flagged dangling');
  }

  // (iv) budget — headroom + ratchet, three cases (H1, 2026-09-10 output-review fix).
  {
    // A 1-line-measured budget with 10% headroom (effective ceiling ~1 line) must
    // still fail against 3 real lines.
    const tightBudgets = { 122: { headroom_pct: 10, measured_at: { lines: 1, bytes: 100000, commit: 'x' } } };
    const r1 = checkBudget('122', 'line one\nline two\nline three\n', tightBudgets);
    if (r1.ok) fail.push('(iv) budget: a 1-line-measured fixture with 10% headroom did NOT fail on 3 lines (beyond headroom)');

    // GREEN — within headroom: measured_at=2 lines, headroom 10% -> ceiling 2 (floor
    // of 2.2); 2 real lines must pass.
    const withinBudgets = { 122: { headroom_pct: 10, measured_at: { lines: 2, bytes: 100000, commit: 'x' } } };
    const r2 = checkBudget('122', 'line one\nline two\n', withinBudgets);
    if (!r2.ok) fail.push('(iv) budget: a fixture exactly at measured_at (within headroom) was wrongly flagged');

    // RED — beyond headroom: measured_at=2 lines, headroom 10% -> ceiling 2; 5 real
    // lines must fail.
    const r3 = checkBudget('122', 'a\nb\nc\nd\ne\n', withinBudgets);
    if (r3.ok) fail.push('(iv) budget: a fixture 2.5x over measured_at (beyond headroom) was wrongly flagged GREEN');

    // REFUSED — --refresh's ratchet must NOT widen measured_at when the spec grew.
    const growBudgets = { 122: { headroom_pct: 10, measured_at: { lines: 2, bytes: 20, commit: 'old' } } };
    const grown = refreshMeasuredAt('122', 'a\nb\nc\nd\n', 'new', growBudgets);
    if (grown.updated) fail.push('(iv) budget: refreshMeasuredAt WIDENED measured_at on growth — ratchet-up must be REFUSED');
    if (growBudgets['122'].measured_at.commit !== 'old') fail.push('(iv) budget: measured_at was mutated despite the refusal');

    // Ratchet DOWN — refreshMeasuredAt must accept a genuine shrink.
    const shrinkBudgets = { 122: { headroom_pct: 10, measured_at: { lines: 10, bytes: 200, commit: 'old' } } };
    const shrunk = refreshMeasuredAt('122', 'a\nb\n', 'new', shrinkBudgets);
    if (!shrunk.updated) fail.push('(iv) budget: refreshMeasuredAt refused a genuine shrink (ratchet-down must be allowed)');
    if (shrinkBudgets['122'].measured_at.lines !== 2) fail.push('(iv) budget: ratchet-down did not record the new, smaller line count');
  }

  // (v) reader guard — a move whose anchor collides with a declared reader slice.
  {
    const moves = [{ id: 'X5', anchor: '### 1.2a', from_spec: '122', to_spec: '122a', to_anchor: '## Appendix §AX' }];
    const readerGuards = [{ reader: 'src/tests/assert-schema-config-parity.logic.test.ts', slices: ['### 1.2a'] }];
    const breaks = checkReaderGuards(moves, readerGuards);
    if (breaks.length !== 1) fail.push('(v) reader-guard: a move breaking a declared reader slice (bad-move-breaks-reader.json) was NOT caught');
    const safeMoves = [{ id: 'X6', anchor: '### 9.9 unrelated', from_spec: '122', to_spec: '122a', to_anchor: '## Appendix §AY' }];
    const noBreaks = checkReaderGuards(safeMoves, readerGuards);
    if (noBreaks.length !== 0) fail.push('(v) reader-guard: an unrelated move was wrongly flagged as breaking a reader');
  }

  // (v) reader guard, executable half (H2, 2026-09-10) — a reader_literal that has
  // rotted (the reader's own source no longer contains it) must fire; a genuine one
  // (this very file's own SECTION_8_HEADING-shaped literal, `export function` as a
  // stand-in real anchor) must not.
  {
    const realReader = 'scripts/analysis/spec-split-check.mjs';
    // Built by concatenation so the literal search target never appears, verbatim,
    // anywhere in THIS file's own source (which would make the fixture self-defeat).
    const nonexistentLiteral = ['NO_SUCH', 'TOKEN', 'IN_THIS', 'FILE_EVER'].join('_');
    const rotted = checkReaderGuardsExecutable([{ reader: realReader, slices: [], reader_literal: nonexistentLiteral }]);
    if (rotted.length !== 1) fail.push('(v) reader-guard-executable: a rotted reader_literal was NOT caught');
    const genuine = checkReaderGuardsExecutable([{ reader: realReader, slices: [], reader_literal: 'export function checkReaderGuardsExecutable' }]);
    if (genuine.length !== 0) fail.push('(v) reader-guard-executable: a genuine, present reader_literal was wrongly flagged as rotted');
  }

  // (v) system-map dependency (M-panel finding, 2026-09-10) — a spec file with no
  // first-line heading, or no Status line, must fire; a well-formed pair must not.
  {
    const bad = checkSystemMapDependencies({ 122: 'no heading here\n\nno status either\n' });
    if (bad.length !== 2) fail.push(`(v) system-map-deps: a headingless, statusless fixture did not fire both checks (got ${bad.length})`);
    const good = checkSystemMapDependencies({ 122: '# Spec 122 -- Fixture\n\n**Status:** ACTIVE\n' });
    if (good.length !== 0) fail.push('(v) system-map-deps: a well-formed fixture was wrongly flagged');
  }

  // (vi) totality — a 122a section headed "(moved from ...)" with no moves[] row.
  {
    const appendixText = [
      '# 122a',
      '',
      '## Appendix §A9 — Undeclared (moved from Spec 122 §77) — HISTORICAL',
      'body',
    ].join('\n');
    const r1 = checkTotality(appendixText, []);
    if (r1.undeclared.length !== 1) fail.push('(vi) totality: an undeclared move (bad-undeclared-move.md) was NOT caught');
    const declaredMoves = [{ id: 'X9', from_spec: '122', anchor: '## Something', to_spec: '122a', to_anchor: '## Appendix §A9 — Undeclared (moved from Spec 122 §77) — HISTORICAL' }];
    const r2 = checkTotality(appendixText, declaredMoves);
    if (r2.undeclared.length !== 0) fail.push('(vi) totality: a DECLARED move was wrongly flagged as undeclared');
  }

  if (fail.length) {
    console.error('[spec-split-check] self-test FAILED:');
    for (const f of fail) console.error(`  - ${f}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(argv) {
  if (!selfTest()) {
    console.error('[spec-split-check] refusing to run against unproven totality checks.');
    process.exit(2);
  }
  if (argv.includes('--self-test')) {
    console.log('[spec-split-check] self-test PASSED');
    return;
  }
  if (argv.includes('--refresh')) {
    doRefresh();
    return;
  }
  if (argv.includes('--check')) {
    process.exit(doCheck());
  }
  throw new Error('usage: --refresh | --check | --self-test');
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`[spec-split-check] ${err.stack || err.message}`);
    process.exit(2);
  }
}
