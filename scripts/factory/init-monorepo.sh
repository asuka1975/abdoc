#!/usr/bin/env bash
# モノレポ用の初期化（1 回だけ実行）。プレースホルダを実際の構成に置換し、領域別 AGENTS.md を配置する。
#
#   bash scripts/factory/init-monorepo.sh <FE_DIR> <BE_DIR> [CI_FE_NAME] [CI_BE_NAME] [GITHUB_OWNER]
#   例: bash scripts/factory/init-monorepo.sh apps/web services/api "CI / web" "CI / api" asuka1975
#
# 置換するもの:
#   scripts/factory/setup.sh            FE_DIR / BE_DIR
#   AGENTS.md, .github/CODEOWNERS       {{FE_DIR}} {{BE_DIR}} {{OWNER}}
#   .github/workflows/factory-heal.yml  workflows: [CI 名]
#   <FE_DIR>/AGENTS.md, <BE_DIR>/AGENTS.md  テンプレートから生成（既存があれば触らない）
set -euo pipefail
FE_DIR="${1:?usage: init-monorepo.sh <FE_DIR> <BE_DIR> [CI_FE_NAME] [CI_BE_NAME] [OWNER]}"
BE_DIR="${2:?BE_DIR}"
CI_FE="${3:-CI / web}"
CI_BE="${4:-CI / api}"
OWNER="${5:-$(gh repo view --json owner -q .owner.login 2>/dev/null || echo OWNER)}"
cd "$(git rev-parse --show-toplevel)"
FE_DIR="${FE_DIR%/}"; BE_DIR="${BE_DIR%/}"
[ -d "$FE_DIR" ] || { echo "FE_DIR not found: $FE_DIR" >&2; exit 1; }
[ -d "$BE_DIR" ] || { echo "BE_DIR not found: $BE_DIR" >&2; exit 1; }

sed -i "s#^FE_DIR=.*#FE_DIR=\"$FE_DIR\"#; s#^BE_DIR=.*#BE_DIR=\"$BE_DIR\"#" scripts/factory/setup.sh
sed -i "s#{{FE_DIR}}#$FE_DIR#g; s#{{BE_DIR}}#$BE_DIR#g; s#{{OWNER}}#$OWNER#g" AGENTS.md .github/CODEOWNERS .github/ISSUE_TEMPLATE/config.yml
sed -i "s#^    workflows: \[.*\]#    workflows: [\"$CI_FE\", \"$CI_BE\"]#" .github/workflows/factory-heal.yml
sed -i "s#{{FE_DIR}}#$FE_DIR#g; s#{{BE_DIR}}#$BE_DIR#g" .github/factory/templates/ci-web.yml.example .github/factory/templates/ci-api.yml.example

# CI が無ければ最小の CI をテンプレートから置く（既存があれば触らない）
if ! ls .github/workflows/*.yml 2>/dev/null | grep -v factory- | grep -q .; then
  cp .github/factory/templates/ci-web.yml.example .github/workflows/ci-web.yml
  cp .github/factory/templates/ci-api.yml.example .github/workflows/ci-api.yml
  sed -i "s#^    workflows: \[.*\]#    workflows: [\"CI / web\", \"CI / api\"]#" .github/workflows/factory-heal.yml
  echo "created .github/workflows/ci-web.yml, ci-api.yml（CI が無かったため）"
fi

for pair in "fe:$FE_DIR" "be:$BE_DIR"; do
  kind="${pair%%:*}"; dir="${pair#*:}"
  if [ -f "$dir/AGENTS.md" ]; then
    echo "keep existing $dir/AGENTS.md"
  else
    sed "s#{{DIR}}#$dir#g" ".github/factory/templates/AGENTS.$kind.md" > "$dir/AGENTS.md"
    echo "created $dir/AGENTS.md"
  fi
  [ -f "$dir/CLAUDE.md" ] || printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
done

echo
echo "done. 次にやること:"
echo "  1. $FE_DIR/AGENTS.md と $BE_DIR/AGENTS.md のコマンド表を実際のコマンドに合わせる（数行）"
echo "  2. 確認: git worktree add /tmp/fresh HEAD && (cd /tmp/fresh && bash scripts/factory/setup.sh all)"
echo "  3. コミットして PR → マージ"
grep -n "{{" AGENTS.md .github/CODEOWNERS scripts/factory/setup.sh || true
