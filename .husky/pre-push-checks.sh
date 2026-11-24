#!/bin/sh
# task-424 (RR-0370, option C): the ONE list of the non-interactive pre-push checks, in order; the chain stops at the first failure.
# The caller defines step() (step <name> <command...>: run the command, return its status), GATE_MODE and SUITE_ARGS, then sources this file.
#   .husky/pre-push: a plain step(), GATE_MODE=--push (the gate reads git's ref pairs on stdin and may ask the operator), SUITE_ARGS empty.
#   the push station (outside the repo): its logging step(), the gate in --ci mode on origin/<br>, the json reporter arguments for the suite.
# Fork cap: R-CQ; scripts/analysis/step-validate.mjs parses it from THIS file, so no comment here may carry a fork assignment.
step mcbylaws-gate node scripts/analysis/mcbylaws/gate.mjs $GATE_MODE &&
step step-validate-staged node scripts/analysis/step-validate.mjs --staged --fast &&
step step-validate-all node scripts/analysis/step-validate.mjs --all --fast &&
step spec-split node scripts/analysis/spec-split-check.mjs --check &&
step typecheck npm run typecheck &&
step mobile-typecheck npm --prefix mobile run typecheck &&
step mobile-tests npm --prefix mobile run test:ci -- --coverage=false --silent &&
step suite env VITEST_MIN_FORKS=8 VITEST_MAX_FORKS=8 npm run test $SUITE_ARGS
