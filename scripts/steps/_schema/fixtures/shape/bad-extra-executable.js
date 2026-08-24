const pipeline = require('../../../../lib/pipeline');
const descriptor = require('./bad-extra-executable.descriptor.json');
const compute = require('./_compute-stub');
const ADVISORY_LOCK_ID = 102;
if (!process.env.SOME_REQUIRED_VAR) throw new Error('shape fixture: top-level env assertion');
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
