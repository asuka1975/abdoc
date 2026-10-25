#!/usr/bin/env bash
# chat エージェントが新しい Issue を作るための「決定的な」スクリプト（例: Issue の分割）。
# ラベル（factory:triage + type:*）はここが付ける。Issue テンプレートから作ったときと同じで、作ると intake が受け付ける。
# エージェント自身は factory:* ラベルを触らない。factory-chat.yml の Claude ステップ（FACTORY_ISSUE_OPS=chat）からだけ使える。
#
#   bash scripts/factory/create-issue.sh --title "[feat] ..." --body-file .factory/issues/a.md [--type feature] [--from 21]
#   → 作った Issue の番号を 1 行で出す
#
# 入力(環境変数): GITHUB_REPOSITORY, GH_TOKEN, FACTORY_ISSUE_OPS
set -euo pipefail
[ "${FACTORY_ISSUE_OPS:-}" = chat ] || { echo "create-issue.sh は factory / chat からだけ使える（FACTORY_ISSUE_OPS=chat が無い）" >&2; exit 2; }
: "${GITHUB_REPOSITORY:?}"
R="$GITHUB_REPOSITORY"
MAX_PER_RUN=10   # 1 回の実行で作れる上限（暴走で intake が大量に走るのを防ぐ）

title=""; body_file=""; type="feature"; from=""
while [ $# -gt 0 ]; do
  case "$1" in
    --title) title="$2"; shift 2 ;;
    --body-file) body_file="$2"; shift 2 ;;
    --type) type="$2"; shift 2 ;;
    --from) from="${2#\#}"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ -n "$title" ] || { echo "--title が必要" >&2; exit 2; }
[ -s "$body_file" ] || { echo "--body-file が無いか空: $body_file" >&2; exit 2; }
case "$type" in bug|feature|docs|chore) ;; *) echo "--type は bug|feature|docs|chore: $type" >&2; exit 2 ;; esac
[ -z "$from" ] || [[ "$from" =~ ^[0-9]+$ ]] || { echo "--from は Issue 番号: $from" >&2; exit 2; }

counter="${RUNNER_TEMP:-/tmp}/factory-create-issue.count"
count=$(cat "$counter" 2>/dev/null || echo 0)
[ "$count" -lt "$MAX_PER_RUN" ] || { echo "1 回の実行で作れる Issue は $MAX_PER_RUN 件まで" >&2; exit 1; }

body=$(cat "$body_file")
[ -z "$from" ] || body="${body}

<sub>🤖 factory / chat が #${from} での依頼を受けて作成</sub>"
url=$(gh issue create -R "$R" --title "$title" --body "$body" --label factory:triage --label "type:$type")
echo $((count + 1)) > "$counter"
echo "${url##*/}"
