const pipeline = require('../../../../lib/pipeline');
const descriptor = require('./good-frozen-shape.descriptor.json');
const compute = require('./_compute-stub');
const ADVISORY_LOCK_ID = 102;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
