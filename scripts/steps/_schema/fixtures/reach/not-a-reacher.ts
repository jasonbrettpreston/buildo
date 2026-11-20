// @ts-nocheck
// Gate A negative control (task-367): breaks rules but never reaches the compute core, so it is not listed.
export function other() {
  console.log('not our business');
  return Date.now();
}
