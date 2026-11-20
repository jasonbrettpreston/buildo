#!/bin/bash
# Runs the DeepSeek lens set on the per-conflict parts of VERIFY.md. Prompt bound raised by the documented env knob (scripts/deepseek-review.js:34, DEEPSEEK_REVIEW_MAX_CHARS) because the rule lists are pasted whole.
cd ~/Buildo-wt-verifyc || exit 1
L=~/Buildo-scratch/lanes-20261119/inc1b/verifyc
export DEEPSEEK_REVIEW_MAX_CHARS=300000
export DOTENV_CONFIG_PATH=$HOME/Buildo/.env
run() { # lens part ctx
  out=$L/runs/r1-$1-$3-$2.txt
  node -r $HOME/Buildo/node_modules/dotenv/config scripts/deepseek-review.js review $L/parts/$2.md --template .claude/review-templates/lens-$1.md --context $L/ctx/ctx-$3.md > $out 2> $out.err
  echo "$1 $2 $3 rc=$? $(wc -c < $out)" >> $L/runs/DONE.txt
}
rm -f $L/runs/DONE.txt
jobs_list=(
 "compliance c1 132" "compliance c1 eng" "compliance c1 doc16"
 "compliance c2 doc16" "compliance c2 100" "compliance c2 eng"
 "compliance c3 100" "compliance c3 136"
 "compliance c4 126" "compliance c4 136"
 "ux c2 rulings" "ux c3 rulings" "ux c4 rulings"
 "error-paths c1 rulings" "error-paths c2 rulings"
 "code-review c1 rulings"
)
n=0
for j in "${jobs_list[@]}"; do
  run $j &
  n=$((n+1)); if (( n % 4 == 0 )); then wait; fi
done
wait
echo ALLDONE >> $L/runs/DONE.txt
