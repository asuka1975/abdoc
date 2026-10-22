#!/usr/bin/env bash
# build エージェント終了後の後始末（決定的）。
#  - エージェントが作ったブランチ factory/issue-<N>-* を探す
#  - PR が無ければ Draft PR を作る（エージェントが開き忘れても人間に見える状態にする）
#  - Issue の状態ラベルを in-review / blocked に遷移させる
#
# 入力(環境変数): ISSUE_NUMBER, GITHUB_REPOSITORY, BASE_BRANCH, AGENT_CONCLUSION, RUN_URL, GH_TOKEN
set -euo pipefail
: "${ISSUE_NUMBER:?}" "${GITHUB_REPOSITORY:?}" "${BASE_BRANCH:?}"
R="$GITHUB_REPOSITORY"
conclusion="${AGENT_CONCLUSION:-unknown}"

git fetch origin --prune >/dev/null 2>&1 || true
# Action の branch_name 出力を優先し、無ければ命名規則で探す
branch="${AGENT_BRANCH:-}"
if [ -z "$branch" ] || ! git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  branch=$(git ls-remote --heads origin "factory/issue-${ISSUE_NUMBER}-*" \
            | awk '{print $2}' | sed 's#refs/heads/##' | sort | tail -n1 || true)
fi

if [ -z "$branch" ]; then
  # 何も push されていない = 実装に着手できなかった
  gh issue edit "$ISSUE_NUMBER" -R "$R" --remove-label factory:building --add-label factory:blocked
  gh issue comment "$ISSUE_NUMBER" -R "$R" --body "$(cat <<EOF
<!-- factory:bot -->
⚠️ build エージェントはブランチを作成できませんでした（conclusion: \`$conclusion\`）。
ログ: $RUN_URL

**次の一手（人間）**: 進捗コメントの「人間への質問」に回答し、\`factory:ready\` を付け直してください。
EOF
)"
  exit 0
fi

pr=$(gh pr list -R "$R" --head "$branch" --state all --json number --jq '.[0].number // empty')
if [ -z "$pr" ]; then
  title=$(gh issue view "$ISSUE_NUMBER" -R "$R" --json title --jq .title)
  body=$(sed -e "s/{{ISSUE_NUMBER}}/$ISSUE_NUMBER/g" -e "s|{{RUN_URL}}|$RUN_URL|g" \
             .github/factory/templates/pr-body-fallback.md)
  url=$(gh pr create -R "$R" --draft --base "$BASE_BRANCH" --head "$branch" \
          --title "factory: #${ISSUE_NUMBER} ${title}" --body "$body")
  pr=${url##*/}
  echo "created fallback draft PR #$pr for $branch"
fi

gh issue edit "$ISSUE_NUMBER" -R "$R" --remove-label factory:building --add-label factory:in-review

if [ "$conclusion" != "success" ]; then
  # 「@claude」を本文に書くと chat が誤発火するので、人間への案内は言い換える
  gh pr comment "$pr" -R "$R" --body "$(cat <<EOF
<!-- factory:bot -->
⚠️ build エージェントは異常終了しました（conclusion: \`$conclusion\`、予算切れの可能性）。ブランチと PR は残っています。
ログ: $RUN_URL

続行する場合は、この PR に「docs/exec-plans/active/issue-${ISSUE_NUMBER}.md の進捗から続けてください」とコメントし、先頭で claude をメンションしてください。
EOF
)"
fi
echo "issue #$ISSUE_NUMBER → in-review (PR #$pr, branch $branch)"
