// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D5 (T-SHAPE-2 known-bad fixture)
// NEVER EXECUTED — library-shape.infra.test.ts only SCANS this text: the compute-shape rules must report
// compute-forbidden-require and compute-no-wall-clock on it.
'use strict';

const fs = require('fs'); // eslint-disable-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars

module.exports = () => Date.now();
