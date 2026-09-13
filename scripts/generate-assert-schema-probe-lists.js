#!/usr/bin/env node
'use strict';
/**
 * generate-assert-schema-probe-lists.js — regenerate ONLY the two arrays R-D
 * grows every time a converted step declares new `config.logic_variables[]`
 * names: `scripts/quality/assert-schema.descriptor.json`'s
 * `config.probe_presence` and `checks[id="declared_logic_variables_present"].expect`.
 *
 * ── ASK A1 (batch1 I2 commit 7) ──────────────────────────────────────────────
 * `.cursor/batch1_i2_assert_data_bounds_active_task.md` §8 Ask A1: this hand
 * splice had fired twice by hand (pilot 9: 42→86, I1: 86→106) with "zero guard
 * against a transcription slip" — this tool closes that RECURRING #2 followup
 * (I1's own report) by making the growth a checked, `--check`-locked generation
 * step instead of a manual JSON edit, mirroring the assert-data-bounds/assert-
 * global-coverage descriptor generators' own `buildX({...}) + --check` shape.
 *
 * `buildProbeLists(names)` is a PURE function (no I/O) — the drift lock
 * (src/tests/steps/assert_schema/violations.test.ts) can call it directly
 * against `collectDeclaredLogicVariableNames()`'s live result and against a
 * mutated fixture, without ever touching the committed descriptor except via
 * this file's own explicit CLI paths.
 *
 * Writes ONLY the two named arrays into the EXISTING descriptor JSON, in
 * place, preserving every other field's formatting exactly (JSON.stringify on
 * the parsed-then-mutated object, matching the file's own indent convention).
 *
 * Usage:
 *   node scripts/generate-assert-schema-probe-lists.js            (write)
 *   node scripts/generate-assert-schema-probe-lists.js --check    (drift lock)
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2a P4 addendum (R-D)
 */

const fs = require('fs');
const path = require('path');

const DESCRIPTOR_PATH = path.join(__dirname, 'quality', 'assert-schema.descriptor.json');
const CHECK_ID = 'declared_logic_variables_present';

/**
 * Pure: given the sorted, deduplicated list of every declared
 * `config.logic_variables[].name` across every CONVERTED step's descriptor,
 * returns the two array values assert-schema.descriptor.json must carry.
 * Both are identical BY DESIGN (R-D: `expect` and `config.probe_presence`
 * must never drift from each other, or from the live derivation) — returned
 * as two references to the SAME array intentionally, not two independently
 * constructed copies, so a caller cannot accidentally diverge them.
 *
 * @param {string[]} names - already sorted+deduplicated (collectDeclaredLogicVariableNames())
 * @returns {{ expect: string[], probePresence: string[] }}
 */
function buildProbeLists(names) {
  if (!Array.isArray(names)) throw new Error('buildProbeLists: names must be an array');
  const sorted = [...new Set(names)].sort();
  return { expect: sorted, probePresence: sorted };
}

/**
 * SURGICAL string-level replacement — a naive JSON.parse -> mutate ->
 * JSON.stringify round trip re-flows EVERY nested object in the file to
 * `JSON.stringify`'s own 2-space style, which does NOT preserve this
 * descriptor's existing mix of compact single-line and expanded multi-line
 * formatting (measured this session: a parse/stringify round trip touched
 * ~90% of the file's bytes for a 0-name-count change). Touches ONLY the two
 * named arrays' own list-item lines, byte-for-byte identical formatting
 * (one string literal per line, same indent the committed file already uses),
 * so `git diff` shows exactly the added/removed names and nothing else.
 *
 * @param {string} text - the raw committed file text
 * @param {string[]} names - already sorted+deduplicated
 * @returns {string} the rewritten file text
 */
function applyToText(text, names) {
  const { expect, probePresence } = buildProbeLists(names);

  function replaceArray(source, label, indent, values) {
    const re = new RegExp(`("${label}":\\s*\\[)([\\s\\S]*?)(\\n\\s*\\])`);
    const m = re.exec(source);
    if (!m) throw new Error(`generate-assert-schema-probe-lists: could not locate "${label}": [ ... ] in the descriptor text`);
    const rendered = values.map((n) => `${indent}"${n}"`).join(',\n');
    return source.slice(0, m.index) + m[1] + '\n' + rendered + m[3] + source.slice(m.index + m[0].length);
  }

  // "expect" appears exactly once inside the declared_logic_variables_present
  // check (checks[].expect is otherwise a free-form object per-check, never
  // named "expect": [ ... ] elsewhere in an ASSERT descriptor of this shape —
  // verified this session: exactly 1 match in the live file).
  let out = replaceArray(text, 'expect', '        ', expect);
  out = replaceArray(out, 'probe_presence', '      ', probePresence);
  return out;
}

module.exports = { buildProbeLists, applyToText, CHECK_ID };

if (require.main === module) {
  const { collectDeclaredLogicVariableNames } = require('./lib/declared-logic-variables');
  const names = collectDeclaredLogicVariableNames();

  const committedText = fs.readFileSync(DESCRIPTOR_PATH, 'utf8');
  const beforeMatch = /"probe_presence":\s*\[([\s\S]*?)\n\s*\]/.exec(committedText);
  const before = beforeMatch ? (beforeMatch[1].match(/"/g) || []).length / 2 : 0;
  const rendered = applyToText(committedText, names);
  const after = names.length;

  if (process.argv.includes('--check')) {
    if (committedText === rendered) {
      console.log(`[generate-assert-schema-probe-lists] clean — no drift (${after} declared names)`);
    } else {
      console.error(`[generate-assert-schema-probe-lists] DRIFT — ${DESCRIPTOR_PATH}'s config.probe_presence/checks[${CHECK_ID}].expect is stale (committed ${before} names, live derivation ${after}). Run \`node scripts/generate-assert-schema-probe-lists.js\` to regenerate.`);
      process.exitCode = 1;
    }
  } else {
    fs.writeFileSync(DESCRIPTOR_PATH, rendered, 'utf8');
    console.log(`Wrote ${DESCRIPTOR_PATH} — config.probe_presence/checks[${CHECK_ID}].expect: ${before} → ${after} names`);
  }
}
