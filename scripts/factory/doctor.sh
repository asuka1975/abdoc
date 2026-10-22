#!/usr/bin/env bash
# 工場が動く状態かを機械的に検査する。導入の最後と、動かないときに実行する。
#   bash scripts/factory/doctor.sh
# 出力: PASS / WARN（動くが推奨から外れる）/ FAIL（このままでは工場が動かない）
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
R=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
fail=0; warn=0
pass() { echo "PASS  $*"; }
warnf() { echo "WARN  $*"; warn=$((warn+1)); }
failf() { echo "FAIL  $*"; fail=$((fail+1)); }

echo "== factory doctor: ${R:-?} =="

# 0. gh
if gh auth status >/dev/null 2>&1 && [ -n "$R" ]; then pass "gh にログイン済み（$R）"; else failf "gh auth login が必要、またはリポジトリの remote が GitHub ではない"; exit 1; fi

# 1. default branch とローカルの同期
def=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
if grep -q "branches: \[$def\]" .github/workflows/factory-labels.yml 2>/dev/null; then pass "default branch は $def（factory-labels.yml と一致）"; else warnf "default branch は $def だが factory-labels.yml は別のブランチ名を見ている"; fi

# 2. default branch 上のワークフロー（Issue 起点のワークフローは default branch に無いと存在しない扱い）
wf=$(gh workflow list --all 2>/dev/null)
for n in "factory / labels" "factory / intake" "factory / build" "factory / review" "factory / heal" "factory / chat" "factory / learn"; do
  grep -q "^$n" <<<"$wf" && pass "ワークフロー登録済み: $n" || failf "ワークフローが default branch に無い: $n（キットの PR をマージしたか）"
done
while IFS= read -r ci; do
  [ -n "$ci" ] || continue
  grep -q "^$ci" <<<"$wf" && pass "heal が監視する CI が存在: $ci" || warnf "heal が監視する CI が見つからない: $ci（CI が無い間 heal は動かない）"
done < <(sed -n 's/^    workflows: \[\(.*\)\]/\1/p' .github/workflows/factory-heal.yml | tr -d '"' | tr ',' '\n' | sed 's/^ *//; s/ *$//')
[ -f .github/workflows/claude.yml ] && warnf ".github/workflows/claude.yml があり @claude に二重応答する（/install-github-app の生成物。削除推奨）"

# 3. ラベル
n=$(gh label list -R "$R" --limit 200 --json name -q '.[].name' | grep -cE '^(factory|type|area|risk|budget|heal):')
if [ "$n" -ge 24 ]; then pass "ラベル $n 個（24 以上）"; else failf "ラベルが $n 個（24 必要）。gh workflow run \"factory / labels\" を実行"; fi

# 4. Secrets / Variables
sec=$(gh secret list -R "$R" --json name -q '.[].name' 2>/dev/null)
if grep -qx ANTHROPIC_API_KEY <<<"$sec" || grep -qx CLAUDE_CODE_OAUTH_TOKEN <<<"$sec"; then pass "認証 Secret あり"; else failf "ANTHROPIC_API_KEY（または CLAUDE_CODE_OAUTH_TOKEN）が Actions secrets に無い"; fi
if grep -qx CLAUDE_CODE_OAUTH_TOKEN <<<"$sec" && grep -q "anthropic_api_key:" .github/workflows/factory-build.yml; then warnf "OAuth トークンを使うならワークフローの anthropic_api_key: 行を claude_code_oauth_token: に置換"; fi
grep -qx FACTORY_GITHUB_TOKEN <<<"$sec" && pass "FACTORY_GITHUB_TOKEN あり（heal→chat の自動連鎖が有効）" || warnf "FACTORY_GITHUB_TOKEN 無し（動くが、CI 失敗→自動修復の連鎖は手動で @claude と書く）"

# 5. Claude GitHub App
if gh api user/installations --jq '.installations[].app_slug' 2>/dev/null | grep -qx claude; then pass "Claude GitHub App がインストール済み"; else warnf "Claude GitHub App が見つからない（https://github.com/apps/claude からこのリポジトリにインストール。未インストールだと build/chat が push できない）"; fi

# 6. Actions の設定
perm=$(gh api "repos/$R/actions/permissions/workflow" 2>/dev/null)
if [ "$(jq -r .can_approve_pull_request_reviews <<<"$perm")" = "true" ]; then pass "Actions が PR を作成できる設定"; else failf "Settings → Actions → General →「Allow GitHub Actions to create and approve pull requests」を ON（または: gh api -X PUT repos/$R/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true）"; fi
[ "$(gh repo view --json hasIssuesEnabled -q .hasIssuesEnabled)" = "true" ] && pass "Issues 有効" || failf "Issues が無効（Settings → General → Features）"
[ "$(gh repo view --json hasDiscussionsEnabled -q .hasDiscussionsEnabled)" = "true" ] || { grep -q discussions .github/ISSUE_TEMPLATE/config.yml 2>/dev/null && warnf "Discussions が無効なのに ISSUE_TEMPLATE/config.yml がリンクしている（contact_links を削除）"; }

# 7. プレースホルダと init の痕跡
left=$(grep -ln "{{\(FE_DIR\|BE_DIR\|OWNER\|REPO\|DIR\|KIND\|SYSTEM\)" AGENTS.md .github/CODEOWNERS .github/ISSUE_TEMPLATE/config.yml scripts/factory/setup.sh docs/PRODUCT.md 2>/dev/null)
[ -z "$left" ] && pass "プレースホルダ {{...}} なし" || failf "プレースホルダが残っている: $(tr '\n' ' ' <<<"$left")（init-monorepo.sh を実行 / PRODUCT.md を埋める）"
FE_DIR=$(sed -n 's/^FE_DIR="\(.*\)"/\1/p' scripts/factory/setup.sh); BE_DIR=$(sed -n 's/^BE_DIR="\(.*\)"/\1/p' scripts/factory/setup.sh)
for d in "$FE_DIR" "$BE_DIR"; do
  [ -f "$d/AGENTS.md" ] && pass "$d/AGENTS.md あり$(grep -q 'まだコードが無い' "$d/AGENTS.md" && echo '（雛形待ちスタブ）')" || failf "$d/AGENTS.md が無い（init-monorepo.sh）"
done
[ -f docs/PRODUCT.md ] && pass "docs/PRODUCT.md あり" || warnf "docs/PRODUCT.md が無い（グリーンフィールドなら bootstrap-issues.sh --product-only）"

# 8. setup.sh が素の checkout で通るか
tmp=$(mktemp -d); if git worktree add -q "$tmp" HEAD 2>/dev/null; then
  if (cd "$tmp" && bash scripts/factory/setup.sh all >"$tmp/setup.log" 2>&1); then pass "setup.sh all が素の checkout で成功"; else failf "setup.sh all が失敗: $(tail -n 3 "$tmp/setup.log" | tr '\n' ' ')"; fi
  git worktree remove --force "$tmp"
else warnf "worktree を作れず setup.sh を検証できない（コミットしていない？）"; fi

echo "== result: FAIL=$fail WARN=$warn =="
[ $fail -eq 0 ]
