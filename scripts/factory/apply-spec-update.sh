#!/usr/bin/env bash
# chat エージェントが書いた仕様の改訂版を、Issue の <!-- factory:spec --> コメントに反映する「決定的な」スクリプト。
# AI は改訂版をファイルに書くだけ、コメントの書き換えはここが行う（factory-chat.yml のエージェント実行後のステップ）。
# 仕様コメントを投稿した intake と同じ github.token で実行するので、自分のコメントを編集することになる。
#
# 入力(環境変数): ISSUE_NUMBER, GITHUB_REPOSITORY, GH_TOKEN, RUN_URL（任意）
#                 SPEC_FILE（既定: .factory/spec-update.md。無ければ何もしない）
set -euo pipefail
: "${ISSUE_NUMBER:?}" "${GITHUB_REPOSITORY:?}"
R="$GITHUB_REPOSITORY"
MARKER="<!-- factory:spec -->"
SPEC_FILE="${SPEC_FILE:-.factory/spec-update.md}"

if [ ! -s "$SPEC_FILE" ]; then
  echo "no spec update ($SPEC_FILE が無い)"; exit 0
fi

# エージェントが今のコメントをマーカーや見出し行ごと写していても二重にしない（先頭の空行も落とす）
spec=$(grep -vxF "$MARKER" "$SPEC_FILE" \
        | grep -v -e '^<sub>🤖 factory / intake' -e '^<sub>📝 factory / chat' \
        | sed '/./,$!d' || true)

cid=$(gh api "repos/$R/issues/$ISSUE_NUMBER/comments" --paginate \
        --jq ".[] | select(.body | startswith(\"$MARKER\")) | .id" | head -n1 || true)
# intake の見出し行（decision / type / area / risk / budget）は残す
intake_line=""
if [ -n "$cid" ]; then
  intake_line=$(gh api "repos/$R/issues/comments/$cid" --jq '.body' | grep -m1 '^<sub>🤖 factory / intake' || true)
fi
header="$MARKER
${intake_line:+$intake_line

}<sub>📝 factory / chat が仕様を更新: $(date -u +%Y-%m-%d)${RUN_URL:+ · $RUN_URL} </sub>

"
body="${header}${spec}"
if [ -n "$cid" ]; then
  # 人間のアカウントで投稿された古い仕様コメントは github.token で編集できないことがある。
  # そのときは改訂版を工場のコメントとして残し、人間に差し替えてもらう
  gh api -X PATCH "repos/$R/issues/comments/$cid" -f body="$body" >/dev/null || {
    fallback="<!-- factory:bot -->
⚠️ 仕様コメントを書き換えられませんでした（別アカウントで投稿された仕様コメントの可能性があります）。
下の全文で仕様コメントを丸ごと差し替えてください。

<details><summary>仕様コメントの差し替え用全文</summary>

\`\`\`\`markdown
${body}
\`\`\`\`

</details>"
    gh api -X POST "repos/$R/issues/$ISSUE_NUMBER/comments" -f body="$fallback" >/dev/null
    echo "::error::仕様コメント ($cid) を編集できなかったため、差し替え用の全文をコメントした"
    exit 1
  }
else
  gh api -X POST "repos/$R/issues/$ISSUE_NUMBER/comments" -f body="$body" >/dev/null
fi
rm -f "$SPEC_FILE"
echo "applied spec update to #$ISSUE_NUMBER"
