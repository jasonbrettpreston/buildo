#!/bin/zsh -f
# BL-R6 (task-305), plan v8.1 section 4 (.cursor/active_task.md:55): fetch and fast-forward the board checkout to origin/wf1/mb-rulings.
# Run by launchd every 10 minutes (com.maxbld.board-ff). Host-specific defaults (this Mac); BOARD_ROOT and BOARD_STATUS_FILE are overridable for tests only.
# The only merge is --ff-only. Refused (unpushed board commits) is a WARN status line, not an error. One status line, a file of its own,
# because auto-board.zsh rewrites BOARD-STATUS.txt wholly at every rebuild (auto-board.zsh:28-31).
export PATH=/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
R=${BOARD_ROOT:-$HOME/Buildo-wt-board}; ST=${BOARD_STATUS_FILE:-$HOME/Buildo-scratch/backlog-pilot/BOARD-STATUS-6421.txt}
now() { date '+%Y-%m-%d %H:%M:%S' }
say() { print -r -- "6421: $(git rev-parse --short HEAD) $1 $(now)" > $ST; exit 0 }
cd $R || exit 0; mkdir -p ${ST:h}
git fetch -q origin wf1/mb-rulings 2>/dev/null || say "WARN fetch failed (offline?)"
[ -n "$(git status --porcelain -- backlog)" ] && say "WARN uncommitted backlog/ changes; merge skipped"
[ -e "$(git rev-parse --git-path index.lock)" ] && say "WARN index.lock present; merge skipped"
git merge -q --ff-only origin/wf1/mb-rulings >/dev/null 2>&1 && say ff
say "WARN ff-only refused (the checkout holds unpushed commits)"
