#!/bin/zsh -f
# BL-R6 (task-305), plan v8.1 section 4 (.cursor/active_task.md:54): commit board edits under backlog/ through the real hooks.
# Run by launchd every 10 minutes (com.maxbld.board-commit). Host-specific defaults (this Mac); BOARD_ROOT is overridable for tests only.
# Never pushes, never merges; a failing hook is a WARN line in the log and the edits stay in the tree for the next run.
export PATH=/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
R=${BOARD_ROOT:-$HOME/Buildo-wt-board}; L=$R/.board/board-commit.log
now() { date '+%Y-%m-%d %H:%M:%S' }
warn() { print -r -- "$(now) WARN $1" >> $L; exit 0 }
mkdir -p $R/.board; cd $R || exit 0
[ -z "$(git status --porcelain -- backlog)" ] && exit 0
[ -e "$(git rev-parse --git-path index.lock)" ] && warn "index.lock present (another git run); board edits left for the next run"
git add backlog || warn "git add failed"
OUT=$(git -c core.quotepath=false commit -q -m "docs(137_mcqueue): board edits $(date '+%Y-%m-%d %H:%M')" 2>&1); RC=$?
print -r -- "$(now) commit rc=$RC\n$OUT" >> $L
[ $RC -eq 0 ] || warn "commit refused: ${${(f)OUT}[1,3]}"
exit 0
