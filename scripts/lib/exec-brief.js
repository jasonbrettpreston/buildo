'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.6.1
 *
 * The engine's own minimal brief front-matter parser — no YAML library. It
 * recognises ONLY this shape, at the very top of the brief file:
 *
 *   ---
 *   write_scope:
 *   - <glob>
 *   - <glob>
 *   ---
 *   <the rest of the brief, unparsed>
 *
 * Any other front-matter key is ignored (not an error — a future key can be
 * added without this parser needing to change first). A brief with no
 * leading `---` block, or whose block never closes, parses as
 * `{ writeScope: [], body: <entire content> }`.
 */

const FRONT_MATTER_DELIMITER = '---';
const WRITE_SCOPE_KEY_RE = /^write_scope:\s*$/;
const LIST_ITEM_RE = /^-\s+(\S.*)$/;

/**
 * parseBrief(content) → `{ writeScope: string[], body: string }`.
 */
function parseBrief(content) {
  if (typeof content !== 'string') {
    return { writeScope: [], body: content };
  }
  const lines = content.split(/\r?\n/);
  if (lines[0] !== FRONT_MATTER_DELIMITER) {
    return { writeScope: [], body: content };
  }

  let closeIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FRONT_MATTER_DELIMITER) {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) {
    return { writeScope: [], body: content }; // unterminated block — parse as absent, not an error
  }

  const frontMatterLines = lines.slice(1, closeIndex);
  const writeScope = [];
  let inWriteScope = false;
  for (const line of frontMatterLines) {
    if (WRITE_SCOPE_KEY_RE.test(line)) {
      inWriteScope = true;
      continue;
    }
    const item = LIST_ITEM_RE.exec(line);
    if (inWriteScope && item) {
      writeScope.push(item[1].trim());
      continue;
    }
    // A non "- <glob>" line ends the write_scope list (a new key, a blank
    // line, or the end of this loop's own iteration reaching a foreign key).
    inWriteScope = false;
  }

  const body = lines.slice(closeIndex + 1).join('\n');
  return { writeScope, body };
}

module.exports = { parseBrief };
