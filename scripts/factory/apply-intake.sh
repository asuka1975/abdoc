#!/usr/bin/env bash
# intake エージェントの構造化出力(JSON)を Issue に反映する「決定的な」スクリプト。
# AI は判断だけ、副作用（ラベル・コメント）はここが行う。
#
# 入力(環境変数): INTAKE_JSON, ISSUE_NUMBER, GITHUB_REPOSITORY, GH_TOKEN
set -euo pipefail
: "${INTAKE_JSON:?INTAKE_JSON is required}" "${ISSUE_NUMBER:?}" "${GITHUB_REPOSITORY:?}"
R="$GITHUB_REPOSITORY"
MARKER="<!-- factory:spec -->"

decision=$(jq -r '.decision' <<<"$INTAKE_JSON")
type=$(jq -r '.type' <<<"$INTAKE_JSON")
area=$(jq -r '.area // "be"' <<<"$INTAKE_JSON")
risk=$(jq -r '.risk' <<<"$INTAKE_JSON")
budget=$(jq -r '.budget' <<<"$INTAKE_JSON")
dup=$(jq -r '.duplicate_of // empty' <<<"$INTAKE_JSON")
comment=$(jq -r '.comment_markdown' <<<"$INTAKE_JSON")

case "$decision" in
  needs-info) state="factory:needs-info" ;;
  planned)    state="factory:planned" ;;
  blocked)    state="factory:blocked" ;;
  *) echo "unknown decision: $decision" >&2; exit 1 ;;
esac

# --- ラベル: 状態は常に1つ。type/area/risk/budget は intake の提案で置き換える ---
want="$state type:$type area:$area risk:$risk budget:$budget"
current=$(gh issue view "$ISSUE_NUMBER" -R "$R" --json labels --jq '.labels[].name')
remove=()
for l in $current; do
  case "$l" in
    factory:*|type:*|area:*|risk:*|budget:*)
      grep -qx "$l" <<<"$(tr ' ' '\n' <<<"$want")" || remove+=(--remove-label "$l") ;;
  esac
done
add=()
for l in $want; do add+=(--add-label "$l"); done
gh issue edit "$ISSUE_NUMBER" -R "$R" ${remove[@]+"${remove[@]}"} "${add[@]}"

# --- コメント: <!-- factory:spec --> で始まる1つのコメントを upsert（会話を汚さない） ---
header="$MARKER
<sub>🤖 factory / intake — decision: \`$decision\` · type: \`$type\` · area: \`$area\` · risk: \`$risk\` · budget: \`$budget\`${dup:+ · duplicate_of: #$dup}</sub>

"
body="${header}${comment}"
cid=$(gh api "repos/$R/issues/$ISSUE_NUMBER/comments" --paginate \
        --jq ".[] | select(.body | startswith(\"$MARKER\")) | .id" | head -n1 || true)
if [ -n "$cid" ]; then
  gh api -X PATCH "repos/$R/issues/comments/$cid" -f body="$body" >/dev/null
else
  gh api -X POST "repos/$R/issues/$ISSUE_NUMBER/comments" -f body="$body" >/dev/null
fi
echo "applied: $decision ($type/$area/$risk/$budget) to #$ISSUE_NUMBER"
