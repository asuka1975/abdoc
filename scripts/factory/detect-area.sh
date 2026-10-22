#!/usr/bin/env bash
# PR の変更ファイルから領域を判定する: fe / be / all を出力。
#   bash scripts/factory/detect-area.sh <PR_NUMBER>
# PR 番号が無い（Issue 上のコメント等）場合は all。
# FE_DIR / BE_DIR は setup.sh と同じ値を読む。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pr="${1:-}"
[ -z "$pr" ] && { echo all; exit 0; }

FE_DIR=$(sed -n 's/^FE_DIR="\(.*\)"/\1/p' scripts/factory/setup.sh)
BE_DIR=$(sed -n 's/^BE_DIR="\(.*\)"/\1/p' scripts/factory/setup.sh)

files=$(gh pr view "$pr" -R "${GITHUB_REPOSITORY:?}" --json files --jq '.files[].path' || true)
[ -z "$files" ] && { echo all; exit 0; }

fe=0; be=0; other=0
while IFS= read -r f; do
  case "$f" in
    "$FE_DIR"/*) fe=1 ;;
    "$BE_DIR"/*) be=1 ;;
    *) other=1 ;;
  esac
done <<<"$files"

if   [ $fe -eq 1 ] && [ $be -eq 0 ] && [ $other -eq 0 ]; then echo fe
elif [ $be -eq 1 ] && [ $fe -eq 0 ] && [ $other -eq 0 ]; then echo be
else echo all
fi
