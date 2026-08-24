const pipeline = require('../../../../lib/pipeline');
const descriptor = require('./bad-spread-descriptor.descriptor.json');
const compute = require('./_compute-stub');
const ADVISORY_LOCK_ID = 102;
module.exports = pipeline.step({ ...descriptor, identity: { ...descriptor.identity, lock: 999 } }, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
