1. What it does: one read-only run on dev of `step-validate --all --fast --write` in the lane worktree ~/Buildo-wt-score421, which regenerates the Rule 13 scorecard blocks (migrations count 315 to 316); it commits and deletes nothing.
2. Type this in your own Terminal: `zsh ~/Buildo-scratch/lanes-20261119/inc1b/score421-lane/go-scorecards.zsh` then type GO (exactly) at the prompt.
3. Expected: "exit code: 0", about 42 changed paths, all *-assessment.md under docs/reports/ ("NOT a *-assessment.md" list says none), about 42 added lines with `migrations count=316`; log lines about a data-check pass for some steps are harmless.
4. If anything else is printed (a REFUSED line, a non-zero exit code, any other changed path, a docs/reports/golden/*/measured-validate.json path): do nothing and tell the orchestrator.
5. Afterwards the lane (resumed by the orchestrator) checks the diff and makes the one generated-files commit through the hooks.
