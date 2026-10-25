#!/usr/bin/env bash
# chat エージェントが、分割などで置き換えた Issue を閉じるための「決定的な」スクリプト。
# 置き換え先が open な Issue として実在することを確かめ、リンクをコメントしてから閉じる（理由: not planned）。ラベルは触らない。
# factory-chat.yml の Claude ステップ（FACTORY_ISSUE_OPS=chat）からだけ使える。
#
#   bash scripts/factory/close-issue.sh 21 --replaced-by 23 24 25
#
# 入力(環境変数): GITHUB_REPOSITORY, GH_TOKEN, FACTORY_ISSUE_OPS
set -euo pipefail
[ "${FACTORY_ISSUE_OPS:-}" = chat ] || { echo "close-issue.sh は factory / chat からだけ使える（FACTORY_ISSUE_OPS=chat が無い）" >&2; exit 2; }
: "${GITHUB_REPOSITORY:?}"
R="$GITHUB_REPOSITORY"
usage() { echo "usage: close-issue.sh <N> --replaced-by <M>..." >&2; exit 2; }

n="${1:-}"; n="${n#\#}"
[[ "$n" =~ ^[0-9]+$ ]] || usage
shift
[ "${1:-}" = --replaced-by ] || usage
shift
[ $# -gt 0 ] || usage

# "open false" のように state と PR かどうかを返す
state_of() { gh api "repos/$R/issues/$1" --jq '"\(.state) \(.pull_request != null)"'; }

[ "$(state_of "$n")" = "open false" ] || { echo "#$n は open な Issue ではない" >&2; exit 1; }
refs=()
for m in "$@"; do
  m="${m#\#}"
  [[ "$m" =~ ^[0-9]+$ ]] || usage
  [ "$m" != "$n" ] || { echo "#$n 自身では置き換えられない" >&2; exit 2; }
  [ "$(state_of "$m")" = "open false" ] || { echo "置き換え先 #$m が open な Issue ではない" >&2; exit 1; }
  refs+=("#$m")
done

gh issue close "$n" -R "$R" --reason "not planned" --comment "<!-- factory:bot -->
${refs[*]} に置き換えたため閉じます（factory / chat が依頼を受けて実行）。"
echo "closed #$n (replaced by ${refs[*]})"
