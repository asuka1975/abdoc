#!/usr/bin/env bash
# グリーンフィールド用: docs/PRODUCT.md を作り、雛形 Issue を 3 件（BE → FE → 契約）起票する。
# 人間が決めるのは「何を作るか」と「スタック」だけ。足場（コマンド表・CI・AGENTS.md）は工場が作る。
#
# 正は常に docs/PRODUCT.md。Issue 本文は PRODUCT.md（default branch 上の版）から生成する。
#
#   1) PRODUCT.md の雛形を作る（引数は雛形の初期値にだけ使う）:
#        bash scripts/factory/bootstrap-issues.sh --product-only --system "何を作るか" \
#             [--be "..."] [--fe "..."] [--db "..."] [--gcp "..."]
#      → 中身を編集して default branch に push
#   2) 雛形 Issue を起票（PRODUCT.md から読む。引数不要）:
#        bash scripts/factory/bootstrap-issues.sh [--only be|fe|contracts] [--dry-run]
#   3) PRODUCT.md を直した後に既存 Issue を作り直す（本文を再生成し、factory:triage に戻して再受付）:
#        bash scripts/factory/bootstrap-issues.sh --refresh 4 5 6
#   補助: 本文だけ出力  bash scripts/factory/bootstrap-issues.sh --render fe
#
# 前提: ラベル同期済み、init-monorepo.sh 実行済み（FE_DIR/BE_DIR が setup.sh に入っている）。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SYSTEM=""; BE_STACK="Go 1.23 + net/http (chi), Cloud Run"; FE_STACK="Next.js + pnpm + TypeScript strict"
DB="未定（最初の雛形では使わない）"; GCP="Cloud Run"
ONLY=""; DRY=0; PRODUCT_ONLY=0; RENDER=""; REFRESH=()
while [ $# -gt 0 ]; do
  case "$1" in
    --system) SYSTEM="$2"; shift 2 ;;
    --be) BE_STACK="$2"; shift 2 ;;
    --fe) FE_STACK="$2"; shift 2 ;;
    --db) DB="$2"; shift 2 ;;
    --gcp) GCP="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --product-only) PRODUCT_ONLY=1; shift ;;
    --render) RENDER="$2"; shift 2 ;;
    --refresh) shift; while [ $# -gt 0 ] && [[ "$1" =~ ^[0-9]+$ ]]; do REFRESH+=("$1"); shift; done ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

FE_DIR=$(sed -n 's/^FE_DIR="\(.*\)"/\1/p' scripts/factory/setup.sh)
BE_DIR=$(sed -n 's/^BE_DIR="\(.*\)"/\1/p' scripts/factory/setup.sh)
[ -n "$FE_DIR" ] && [ "$FE_DIR" != "{{FE_DIR}}" ] || { echo "先に scripts/factory/init-monorepo.sh を実行してください" >&2; exit 2; }

esc() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }   # sed の置換文字列として安全にする
render() {  # render <template-file>
  local short; short=$(printf '%s' "$SYSTEM" | cut -c1-40)
  sed -e "s|{{SYSTEM_SHORT}}|$(esc "$short")|g" -e "s|{{SYSTEM}}|$(esc "$SYSTEM")|g" \
      -e "s|{{BE_STACK}}|$(esc "$BE_STACK")|g" -e "s|{{FE_STACK}}|$(esc "$FE_STACK")|g" \
      -e "s|{{DB}}|$(esc "$DB")|g" -e "s|{{GCP}}|$(esc "$GCP")|g" \
      -e "s|{{FE_DIR}}|$(esc "$FE_DIR")|g" -e "s|{{BE_DIR}}|$(esc "$BE_DIR")|g" "$1"
}

# ---- 1. --product-only: PRODUCT.md の雛形を作って終わる ----
if [ "$PRODUCT_ONLY" = 1 ]; then
  [ -n "$SYSTEM" ] || { echo "--product-only には --system \"何を作るか（1〜2 文）\" が必要です" >&2; exit 2; }
  if [ -f docs/PRODUCT.md ]; then echo "keep existing docs/PRODUCT.md"
  else mkdir -p docs; render .github/factory/templates/PRODUCT.md > docs/PRODUCT.md; echo "created docs/PRODUCT.md"; fi
  cat <<EOF

次にやること:
  1. docs/PRODUCT.md の「成功の定義」「やらないこと」「未決事項」とスタック表を埋める（決まっていないことは未決事項に）
  2. default branch に push:  git add docs/PRODUCT.md && git commit -m "docs: product brief" && git push
  3. bash scripts/factory/bootstrap-issues.sh   （引数なし。PRODUCT.md から Issue を生成する）
EOF
  exit 0
fi

# ---- 2. PRODUCT.md（default branch 上の版）を正として値を読む ----
default_branch=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || echo main)
git fetch -q origin "$default_branch" 2>/dev/null || true
product=""
if git cat-file -e "origin/$default_branch:docs/PRODUCT.md" 2>/dev/null; then
  product=$(git show "origin/$default_branch:docs/PRODUCT.md")
elif [ -f docs/PRODUCT.md ] && [ "$DRY" = 1 ]; then
  product=$(cat docs/PRODUCT.md); echo "(dry-run: ローカルの docs/PRODUCT.md を使用)" >&2
else
  echo "docs/PRODUCT.md が origin/$default_branch にありません。先に --product-only で作り、埋めて push してください" >&2; exit 1
fi
grep -q "{{" <<<"$product" && { echo "docs/PRODUCT.md にプレースホルダ {{...}} が残っています。埋めて push してください" >&2; exit 1; }

cell() {  # cell <行頭ラベル> → 表の 2 列目
  awk -F'|' -v k="$1" 'index($2, k) == 2 { gsub(/^[ \t]+|[ \t]+$/, "", $3); print $3; exit }' <<<"$product"
}
v=$(cell "バックエンド");   [ -n "$v" ] && BE_STACK="$v"
v=$(cell "フロントエンド"); [ -n "$v" ] && FE_STACK="$v"
v=$(cell "データ");         [ -n "$v" ] && DB="$v"
v=$(cell "実行基盤");       [ -n "$v" ] && GCP="$v"
v=$(awk '/^## 目的/{f=1;next} f && /^- /{sub(/^- /,""); print; exit}' <<<"$product"); [ -n "$v" ] && SYSTEM="$v"
[ -n "$SYSTEM" ] || { echo "PRODUCT.md の「## 目的」の最初の箇条書きが空です" >&2; exit 1; }
if [ -f docs/PRODUCT.md ] && ! diff -q <(printf '%s\n' "$product") docs/PRODUCT.md >/dev/null; then
  echo "注意: ローカルの docs/PRODUCT.md は origin/$default_branch と差があります。生成には origin 側を使います" >&2
fi
echo "PRODUCT.md から読んだ値: BE=[$BE_STACK] FE=[$FE_STACK] DB=[$DB] 基盤=[$GCP]" >&2

# ---- 3. --render: 本文だけ出力 ----
if [ -n "$RENDER" ]; then render ".github/factory/templates/bootstrap/issue-$RENDER.md"; exit 0; fi

title_of() { case "$1" in
  be) echo "[chore] バックエンドの雛形（$BE_DIR）" ;;
  fe) echo "[chore] フロントエンドの雛形（$FE_DIR）" ;;
  contracts) echo "[chore] FE/BE 契約（contracts/openapi.yaml）と生成パイプライン" ;;
esac; }
area_of() { case "$1" in be) echo be ;; fe) echo fe ;; contracts) echo infra ;; esac; }

# ---- 4. --refresh N...: 既存 Issue の本文を PRODUCT.md から作り直し、triage に戻して再受付させる ----
if [ ${#REFRESH[@]} -gt 0 ]; then
  for n in "${REFRESH[@]}"; do
    t=$(gh issue view "$n" --json title -q .title)
    case "$t" in
      *バックエンドの雛形*) kind=be ;; *フロントエンドの雛形*) kind=fe ;; *契約*) kind=contracts ;;
      *) echo "#$n は雛形 Issue ではありません（$t）。スキップ" >&2; continue ;;
    esac
    cur=$(gh issue view "$n" --json labels -q '.labels[].name' | grep '^factory:' || true)
    args=(); for l in $cur; do [ "$l" = factory:triage ] || args+=(--remove-label "$l"); done
    gh issue edit "$n" ${args[@]+"${args[@]}"} --add-label factory:triage >/dev/null        # 先に状態を triage へ
    gh issue edit "$n" --title "$(title_of $kind)" --body "$(render ".github/factory/templates/bootstrap/issue-$kind.md")" >/dev/null   # edited イベント → intake 再実行
    echo "refreshed #$n ($kind) → factory:triage、intake が再受付します"
  done
  exit 0
fi

# ---- 5. 新規起票（BE → FE → 契約の順。番号順に ready を付ける想定） ----
create_issue() {  # create_issue <kind>
  local kind="$1" body; body=$(render ".github/factory/templates/bootstrap/issue-$kind.md")
  if [ "$DRY" = 1 ]; then printf '\n===== [dry-run] %s (area:%s) =====\n%s\n' "$(title_of $kind)" "$(area_of $kind)" "$body"; return; fi
  gh issue create --title "$(title_of $kind)" --body "$body" \
    --label "factory:triage" --label "type:chore" --label "area:$(area_of $kind)" --label "risk:low" --label "budget:m"
}
for kind in be fe contracts; do
  [ -z "$ONLY" ] || [ "$ONLY" = "$kind" ] || continue
  create_issue "$kind"
done
[ "$DRY" = 1 ] && exit 0
cat <<EOF

次にやること:
  1. 数分後、各 Issue に intake の仕様コメントが付く → 読んで、BE の Issue にだけ factory:ready
  2. Draft PR をレビュー（**最初の雛形は以後の全 PR が真似る規約になる。ここだけは丁寧に見る**）→ マージ
  3. FE → 契約 の順に同じことを繰り返す。3 件終わったら、AGENTS.md の空欄は実コードから埋まっている
  PRODUCT.md を直したら: bash scripts/factory/bootstrap-issues.sh --refresh <Issue 番号...>
EOF
