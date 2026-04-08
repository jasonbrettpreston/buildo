#!/usr/bin/env node
// Migration safety validator — runs in pre-commit hook and CLI.
// SPEC LINK: docs/specs/00_engineering_standards.md §3.2 + spec 75 §7a
//
// Rules:
//   1. DROP TABLE / DROP COLUMN / TRUNCATE TABLE require an explicit
//      `-- ALLOW-DESTRUCTIVE` marker.
//   2. CREATE INDEX on known-large tables must use CONCURRENTLY.
//   3. ALTER TABLE ... ADD COLUMN ... NOT NULL must include a DEFAULT
//      (checks every clause of a multi-clause ALTER).
//   4. UP and DOWN blocks must both be present (backstop for the bash hook).
//
// Usage:
//   node scripts/validate-migration.js migrations/067_foo.sql migrations/068_bar.sql
//
// Module export:
//   const { validateMigration } = require('./scripts/validate-migration.js');
//   const { ok, errors } = validateMigration(content, filename);

'use strict';

const fs = require('fs');

const LARGE_TABLES = ['permits', 'permit_trades', 'permit_parcels', 'wsib_registry', 'entities'];

/**
 * Find the 1-based line number for an index into the original content.
 * @param {string} content
 * @param {number} index
 * @returns {number}
 */
function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/**
 * Strip SQL block comments, preserving newlines so line numbers stay stable.
 * @param {string} content
 * @returns {string}
 */
function stripBlockComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Strip SQL line comments, but leave `--` alone when it appears inside an
 * open single-quoted string literal on the same line. Walks line by line and
 * counts single quotes up to each `--` occurrence; odd count = inside a string.
 *
 * Known limitation: multi-line string literals containing `--` are not
 * handled. Real migrations virtually never contain these.
 * @param {string} content
 * @returns {string}
 */
function stripLineComments(content) {
  const lines = content.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let searchFrom = 0;
    while (searchFrom < line.length) {
      const idx = line.indexOf('--', searchFrom);
      if (idx === -1) break;
      let quoteCount = 0;
      for (let i = 0; i < idx; i++) {
        if (line[i] === "'") quoteCount++;
      }
      if (quoteCount % 2 === 0) {
        // Not inside a string — strip from here to end of line.
        lines[li] = line.slice(0, idx) + ' '.repeat(line.length - idx);
        break;
      }
      // Inside a string literal; skip past this `--` and keep scanning.
      searchFrom = idx + 2;
    }
  }
  return lines.join('\n');
}

/**
 * Split an ALTER TABLE body by top-level commas (commas outside parentheses
 * and outside single-quoted strings).
 * @param {string} body
 * @returns {string[]}
 */
function splitTopLevelCommas(body) {
  const out = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (ch === "'") inStr = false;
      continue;
    }
    if (ch === "'") {
      inStr = true;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out;
}

/**
 * Validate a single migration file's content.
 * @param {string} content
 * @param {string} filename
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateMigration(content, filename) {
  const errors = [];
  const display = filename || '<input>';

  // Blank out single-quoted string literals so destructive keywords hidden
  // inside string contents don't trigger false positives. Preserves length
  // and newlines so line numbers and downstream regexes stay stable.
  // eslint-disable-next-line no-inner-declarations
  function blankStringLiterals(s) {
    let out = '';
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (!inStr) {
        if (ch === "'") {
          inStr = true;
          out += "'";
        } else {
          out += ch;
        }
        continue;
      }
      // inStr
      if (ch === "'") {
        inStr = false;
        out += "'";
      } else if (ch === '\n') {
        out += '\n';
      } else {
        out += ' ';
      }
    }
    return out;
  }

  // Strip comments (block first, then line) before ALL content inspection,
  // including the ALLOW-DESTRUCTIVE marker — otherwise a destructive statement
  // hidden inside a `/* -- ALLOW-DESTRUCTIVE */` block comment would bypass
  // the check.
  const stripped = blankStringLiterals(stripLineComments(stripBlockComments(content)));
  const allowDestructive = /--\s*ALLOW-DESTRUCTIVE/i.test(content) && !/\/\*[\s\S]*?--\s*ALLOW-DESTRUCTIVE[\s\S]*?\*\//i.test(content);

  // Backstop: UP / DOWN blocks (check raw content so header comments count).
  if (!/^[ \t]*--[ \t]*UP\b/im.test(content)) {
    errors.push(`${display}: missing '-- UP' block`);
  }
  if (!/^[ \t]*--[ \t]*DOWN\b/im.test(content)) {
    errors.push(`${display}: missing '-- DOWN' block`);
  }

  // Rule 1: DROP TABLE / DROP COLUMN / ALTER TABLE ... DROP COLUMN / TRUNCATE TABLE.
  const dropRe = /\b(DROP\s+(?:TABLE|COLUMN)|ALTER\s+TABLE\s+[^;]*?\s+DROP\s+COLUMN|TRUNCATE\s+TABLE)\b/gi;
  let m;
  while ((m = dropRe.exec(stripped)) !== null) {
    if (!allowDestructive) {
      const line = lineOf(content, m.index);
      const raw = m[1].replace(/\s+/g, ' ').toUpperCase();
      let label;
      if (raw.startsWith('TRUNCATE')) label = 'TRUNCATE TABLE';
      else if (raw.includes('DROP COLUMN')) label = 'DROP COLUMN';
      else label = 'DROP TABLE';
      errors.push(
        `${display}:${line}: ${label} requires '-- ALLOW-DESTRUCTIVE' marker comment`,
      );
    }
  }

  // Rule 2: CREATE INDEX without CONCURRENTLY on large tables.
  // Match across newlines until a semicolon OR end of content.
  const indexRe = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:CONCURRENTLY\s+)?[\s\S]*?(?:;|$)/gi;
  let im;
  while ((im = indexRe.exec(stripped)) !== null) {
    const stmt = im[0];
    const isConcurrent = /\bCONCURRENTLY\b/i.test(stmt);
    const onMatch = /\bON\s+(?:ONLY\s+)?(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i.exec(stmt);
    if (!onMatch) continue;
    const tableName = (onMatch[2] || '').toLowerCase();
    if (!isConcurrent && LARGE_TABLES.includes(tableName)) {
      const line = lineOf(content, im.index);
      errors.push(
        `${display}:${line}: CREATE INDEX on large table '${tableName}' must use CONCURRENTLY`,
      );
    }
  }

  // Rule 3: ALTER TABLE ... ADD COLUMN ... NOT NULL without DEFAULT.
  // Walk each ALTER TABLE statement and split its body by top-level commas so
  // multi-clause ALTERs (e.g. `ADD COLUMN a INT, ADD COLUMN b TEXT NOT NULL`)
  // are fully inspected.
  const alterRe = /ALTER\s+TABLE\s+[^;]*/gi;
  let aMatch;
  while ((aMatch = alterRe.exec(stripped)) !== null) {
    const fullStmt = aMatch[0];
    // Strip the leading `ALTER TABLE <name>` — we only care about the clauses.
    const bodyMatch = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?[\w]+"?\.)?"?[\w]+"?\s+([\s\S]*)$/i.exec(fullStmt);
    if (!bodyMatch) continue;
    const body = bodyMatch[1];
    const clauses = splitTopLevelCommas(body);
    let cursor = aMatch.index + (fullStmt.length - body.length);
    for (const clause of clauses) {
      const addMatch = /^\s*ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?/i.exec(clause);
      if (addMatch) {
        const hasNotNull = /\bNOT\s+NULL\b/i.test(clause);
        const hasDefault = /\bDEFAULT\b/i.test(clause);
        if (hasNotNull && !hasDefault) {
          const line = lineOf(content, cursor);
          errors.push(
            `${display}:${line}: ADD COLUMN ... NOT NULL requires a DEFAULT clause`,
          );
        }
      }
      // Advance cursor past this clause + its separating comma.
      cursor += clause.length + 1;
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * CLI entrypoint.
 * @param {string[]} argv
 * @returns {number} exit code
 */
function runCli(argv) {
  const files = argv.filter((a) => a && a.length > 0);
  if (files.length === 0) {
    console.warn(
      'validate-migration.js: no files provided. Pass migration paths as args. Exiting non-zero to fail safely.',
    );
    return 1;
  }
  let failed = 0;
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      console.error(`ERROR: cannot read ${file}: ${err.message}`);
      failed = 1;
      continue;
    }
    const { ok, errors } = validateMigration(content, file);
    if (!ok) {
      failed = 1;
      for (const e of errors) {
        console.error(`ERROR: ${e}`);
      }
    }
  }
  if (failed) {
    console.error('');
    console.error('Migration safety checks failed (§3.2 + spec 75 §7a).');
  }
  return failed;
}

module.exports = { validateMigration, LARGE_TABLES, runCli };

if (require.main === module) {
  const code = runCli(process.argv.slice(2));
  process.exit(code);
}
