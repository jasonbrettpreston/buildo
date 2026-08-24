const pipeline = require('../../../../lib/pipeline');
const descriptor = require('./bad-pipeline-run.descriptor.json');
const compute = require('./_compute-stub');
const ADVISORY_LOCK_ID = 102;
module.exports = pipeline.run(descriptor.identity.name, async (pool) => compute({ pool }));
module.exports.descriptor = descriptor;
module.exports.compute = compute;
