// Jest mock — prevents expo/src/winter from installing import.meta polyfills
// that break the Node test environment. The winter runtime is only needed
// on device; in Jest all tests run natively in Node.
module.exports = {};
