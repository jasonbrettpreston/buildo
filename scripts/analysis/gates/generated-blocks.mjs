// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (generated Target Files, WF2 2026-09-29); 122_pipeline_step_optimization.md §4.1, §6
//
// The ONE place that knows the `<!-- generated:<id> -->` … `<!-- /generated:<id> -->`
// marker syntax. The Target Files generator writes and refreshes those blocks; the
// fast invariant (#43) and the commit-msg spec-diff hook must decide whether a real
// diff touched anything OUTSIDE a generated block; both import this module instead of
// re-deriving the syntax, so a marker change can never be half-applied.
//
// Pure: no `fs`, no imports. Text in, text (or offsets) out. Because a Windows
// checkout can carry CRLF while the committed blob is LF (tasks/lessons.md
// 2026-09-09), every entry point normalises `\r\n` → `\n` FIRST — a CRLF checkout
// must never read as a change.

/** The marker id of the per-step "Target Files" block. @type {string} */
export const TF_ID = 'target-files';

/** The marker id of a chain's "Chain Members" block. @param {string} chain @returns {string} */
export function chainId(chain) {
  return 'chain-members:' + chain;
}

/**
 * The opening marker for a block id.
 * @param {string} id
 * @returns {string} e.g. `<!-- generated:target-files -->`
 */
export function openMarker(id) {
  return '<!-- generated:' + id + ' -->';
}

/**
 * The closing marker for a block id.
 * @param {string} id
 * @returns {string} e.g. `<!-- /generated:target-files -->`
 */
export function closeMarker(id) {
  return '<!-- /generated:' + id + ' -->';
}

/** CRLF → LF. @param {unknown} text @returns {string} */
function normalise(text) {
  return String(text ?? '').replace(/\r\n/g, '\n');
}

// Both marker forms in one global alternation so the scan walks them in TEXT order.
// The `/` is optional and captured, which is all that distinguishes a close from an open.
const MARKER_RE = /<!-- (\/?)generated:([a-z0-9:_-]+) -->/g;

/**
 * Every `<!-- generated:<id> -->` … `<!-- /generated:<id> -->` block, in text order.
 * An open must be followed by its own close before any other open; the same id may
 * not appear as two blocks. Line endings are normalised to LF before scanning, so
 * offsets are LF offsets.
 * @param {string} text
 * @returns {Array<{id: string, start: number, end: number, body: string}>} `start` is
 *   the index of the open marker, `end` is the index just after the close marker and
 *   `body` is the text between the open marker's line end and the close marker.
 * @throws {Error} on an open without a close, a close without an open, or a repeated id.
 */
export function findBlocks(text) {
  const src = normalise(text);
  const blocks = [];
  /** @type {null | {id: string, start: number, bodyStart: number}} */
  let open = null;
  const seen = new Set();

  MARKER_RE.lastIndex = 0;
  for (let m = MARKER_RE.exec(src); m !== null; m = MARKER_RE.exec(src)) {
    const isClose = m[1] === '/';
    const id = m[2];

    if (!isClose) {
      if (open) throw new Error(`generated block "${open.id}": open marker without a close marker`);
      if (seen.has(id)) throw new Error(`generated block "${id}": appears twice`);
      // The body starts after the open marker's trailing `\n`, when there is one.
      const after = m.index + m[0].length;
      open = { id, start: m.index, bodyStart: src[after] === '\n' ? after + 1 : after };
      continue;
    }

    // A close must match the id of the open immediately before it.
    if (!open || open.id !== id) throw new Error(`generated block "${id}": close marker without an open marker`);
    seen.add(id);
    blocks.push({ id, start: open.start, end: m.index + m[0].length, body: src.slice(open.bodyStart, m.index) });
    open = null;
  }

  if (open) throw new Error(`generated block "${open.id}": open marker without a close marker`);
  return blocks;
}

/**
 * LF-normalised text with every whole generated block (open marker through close
 * marker, inclusive) removed. Nothing else changes.
 * @param {string} text
 * @returns {string}
 */
export function stripGeneratedBlocks(text) {
  const src = normalise(text);
  let out = '';
  let from = 0;
  for (const block of findBlocks(src)) {
    out += src.slice(from, block.start);
    from = block.end;
  }
  return out + src.slice(from);
}

/**
 * `true` when the text surrounding the generated blocks differs — i.e. a real
 * hand edit, not a regenerated body. Either side being `null`/`undefined` means the
 * file was added or deleted, which counts as a change.
 * @param {string|null|undefined} baseText
 * @param {string|null|undefined} headText
 * @returns {boolean}
 */
export function outsideMarkerChanged(baseText, headText) {
  if (baseText === null || baseText === undefined || headText === null || headText === undefined) return true;
  return stripGeneratedBlocks(baseText) !== stripGeneratedBlocks(headText);
}

/**
 * Replace one block's body. `body` must be `''` or end with `\n` so the close marker
 * always starts its own line. The result is the text before the open marker, the open
 * marker, a `\n`, the body, the close marker and the text after the close marker.
 * @param {string} text
 * @param {string} id
 * @param {string} body
 * @returns {string}
 * @throws {Error} when the block is absent or `body` does not end with a newline.
 */
export function replaceBlockBody(text, id, body) {
  const src = normalise(text);
  const block = findBlocks(src).find((b) => b.id === id);
  if (!block) throw new Error(`generated block "${id}": not present`);
  if (body !== '' && !body.endsWith('\n')) throw new Error(`generated block "${id}": body must be empty or end with a newline`);
  return src.slice(0, block.start) + openMarker(id) + '\n' + body + closeMarker(id) + src.slice(block.end);
}
