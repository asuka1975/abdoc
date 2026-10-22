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
REPO="$(gh repo view --json name -q .name 2>/dev/null || echo REPO)"
cd "$(git rev-parse --show-toplevel)"
FE_DIR="${FE_DIR%/}"; BE_DIR="${BE_DIR%/}"
mkdir -p "$FE_DIR" "$BE_DIR"
# グリーンフィールド判定: マニフェストが無い領域は「雛形待ち」のスタブ AGENTS.md を置く
fe_kind=fe; be_kind=be
[ -f "$FE_DIR/package.json" ] || fe_kind=greenfield
[ -f "$BE_DIR/go.mod" ]       || be_kind=greenfield

sed -i "s#^FE_DIR=.*#FE_DIR=\"$FE_DIR\"#; s#^BE_DIR=.*#BE_DIR=\"$BE_DIR\"#" scripts/factory/setup.sh
sed -i "s#{{FE_DIR}}#$FE_DIR#g; s#{{BE_DIR}}#$BE_DIR#g; s#{{OWNER}}#$OWNER#g; s#{{REPO}}#$REPO#g" AGENTS.md .github/CODEOWNERS .github/ISSUE_TEMPLATE/config.yml
sed -i "s#^    workflows: \[.*\]#    workflows: [\"$CI_FE\", \"$CI_BE\"]#" .github/workflows/factory-heal.yml
sed -i "s#{{FE_DIR}}#$FE_DIR#g; s#{{BE_DIR}}#$BE_DIR#g" .github/factory/templates/ci-web.yml.example .github/factory/templates/ci-api.yml.example

# CI: 無ければ最小の CI をテンプレートから置く。キットが以前生成したもの（「CI の最小例」マーカー入り）は最新版で上書き。
# 自前の CI（マーカー無し）には触らない。
kit_ci_present=0
for pair in "web:ci-web" "api:ci-api"; do
  f=".github/workflows/${pair#*:}.yml"
  if [ -f "$f" ] && grep -q "CI の最小例" "$f"; then
    cp ".github/factory/templates/${pair#*:}.yml.example" "$f"; echo "updated $f（キット生成の CI を最新版に）"; kit_ci_present=1
  fi
done
if [ $kit_ci_present = 0 ] && ! ls .github/workflows/*.yml 2>/dev/null | grep -v factory- | grep -q .; then
  cp .github/factory/templates/ci-web.yml.example .github/workflows/ci-web.yml
  cp .github/factory/templates/ci-api.yml.example .github/workflows/ci-api.yml
  kit_ci_present=1
  echo "created .github/workflows/ci-web.yml, ci-api.yml（CI が無かったため）"
fi
[ $kit_ci_present = 1 ] && sed -i "s#^    workflows: \[.*\]#    workflows: [\"CI / web\", \"CI / api\"]#" .github/workflows/factory-heal.yml

for triple in "fe:$FE_DIR:$fe_kind" "be:$BE_DIR:$be_kind"; do
  IFS=: read -r area dir kind <<<"$triple"
  if [ "$kind" = greenfield ]; then
    # コードが無い領域: 既存の AGENTS.md は推測でしかあり得ないので、スタブで置き換える
    [ -f "$dir/AGENTS.md" ] && ! grep -q "まだコードが無い" "$dir/AGENTS.md" && echo "replaced $dir/AGENTS.md（コードが無いためスタブに）"
    sed "s#{{DIR}}#$dir#g; s#{{KIND}}#$area#g" ".github/factory/templates/AGENTS.greenfield.md" > "$dir/AGENTS.md"
  elif [ -f "$dir/AGENTS.md" ] && ! grep -q "まだコードが無い" "$dir/AGENTS.md"; then
    echo "keep existing $dir/AGENTS.md"
  else
    sed "s#{{DIR}}#$dir#g; s#{{KIND}}#$area#g" ".github/factory/templates/AGENTS.$kind.md" > "$dir/AGENTS.md"
    echo "created $dir/AGENTS.md ($kind)"
  fi
  [ -f "$dir/CLAUDE.md" ] || printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
done

echo
if [ "$fe_kind" = greenfield ] || [ "$be_kind" = greenfield ]; then
  cat <<EOF
done（グリーンフィールド: コードの無い領域はスタブ AGENTS.md を置きました）。次にやること:
  1. コミットして PR → マージ（CI と setup.sh はコードが入るまでスキップして緑になります）
  2. bash scripts/factory/bootstrap-issues.sh --system "何を作るか" --be "..." --fe "..." --db "..."
     → docs/PRODUCT.md と雛形 Issue 3 件（BE → FE → 契約）ができます。AGENTS.md の中身は雛形 PR が実コードから書きます
EOF
else
  cat <<EOF
done. 次にやること:
  1. $FE_DIR/AGENTS.md と $BE_DIR/AGENTS.md のコマンド表を実際のコマンドに合わせる（数行）
  2. 確認: git worktree add /tmp/fresh HEAD && (cd /tmp/fresh && bash scripts/factory/setup.sh all)
  3. コミットして PR → マージ
EOF
fi
grep -n "{{" AGENTS.md .github/CODEOWNERS scripts/factory/setup.sh || true
