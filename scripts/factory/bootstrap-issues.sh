#!/usr/bin/env bash
# グリーンフィールド用: docs/PRODUCT.md を作り、雛形 Issue を 3 件（BE → FE → 契約）起票する。
# 人間が決めるのは「何を作るか」と「スタック」だけ。足場（コマンド表・CI・AGENTS.md）は工場が作る。
#
# 2 段階で使う（intake が未記入の PRODUCT.md を読まないように）:
#   1) bash scripts/factory/bootstrap-issues.sh --product-only \
#        --system "請求書 PDF を取り込んで仕訳を提案する社内ツール" \
#        --be "Go 1.23 + chi, Cloud Run" --fe "Next.js 15 + pnpm + TypeScript strict" \
#        --db "Cloud SQL (Postgres) + sqlc" --gcp "asia-northeast1, Cloud Run"
#      → docs/PRODUCT.md を埋めて default branch に push
#   2) bash scripts/factory/bootstrap-issues.sh --system "同じ文"  [--only be|fe|contracts] [--dry-run]
#      → 雛形 Issue 3 件（BE → FE → 契約）。PRODUCT.md が default branch に無ければ中断する
#
# 前提: ラベル同期済み（factory / labels）、init-monorepo.sh 実行済み（FE_DIR/BE_DIR が setup.sh に入っている）。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SYSTEM=""; BE_STACK="Go 1.23 + net/http (chi), Cloud Run"; FE_STACK="Next.js + pnpm + TypeScript strict"
DB="未定（最初の雛形では使わない）"; GCP="Cloud Run"; ONLY=""; DRY=0; PRODUCT_ONLY=0
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
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SYSTEM" ] || { echo "--system \"何を作るか（1〜2 文）\" は必須です" >&2; exit 2; }

FE_DIR=$(sed -n 's/^FE_DIR="\(.*\)"/\1/p' scripts/factory/setup.sh)
BE_DIR=$(sed -n 's/^BE_DIR="\(.*\)"/\1/p' scripts/factory/setup.sh)
[ -n "$FE_DIR" ] && [ "$FE_DIR" != "{{FE_DIR}}" ] || { echo "先に scripts/factory/init-monorepo.sh を実行してください" >&2; exit 2; }
SYSTEM_SHORT=$(printf '%s' "$SYSTEM" | cut -c1-40)

render() {  # render <template-file>
  sed -e "s|{{SYSTEM_SHORT}}|$SYSTEM_SHORT|g" -e "s|{{SYSTEM}}|$SYSTEM|g" \
      -e "s|{{BE_STACK}}|$BE_STACK|g" -e "s|{{FE_STACK}}|$FE_STACK|g" \
      -e "s|{{DB}}|$DB|g" -e "s|{{GCP}}|$GCP|g" \
      -e "s|{{FE_DIR}}|$FE_DIR|g" -e "s|{{BE_DIR}}|$BE_DIR|g" "$1"
}

# 1. docs/PRODUCT.md（無ければ作る。あれば触らない）
if [ ! -f docs/PRODUCT.md ]; then
  mkdir -p docs
  render .github/factory/templates/PRODUCT.md > docs/PRODUCT.md
  echo "created docs/PRODUCT.md"
else
  echo "keep existing docs/PRODUCT.md"
fi
if [ "$PRODUCT_ONLY" = 1 ]; then
  cat <<EOF

次にやること:
  1. docs/PRODUCT.md の「成功の定義」「やらないこと」「未決事項」を埋める（30 分かけない。決まっていないことは未決事項に）
  2. default branch に push:  git add docs/PRODUCT.md && git commit -m "docs: product brief" && git push
  3. もう一度このスクリプトを --product-only 無しで実行 → 雛形 Issue が 3 件できる
EOF
  exit 0
fi

# 2. ガード: PRODUCT.md が default branch に無い / 未記入のまま Issue を作ると、intake が空の根拠で仕様化してしまう
if [ "$DRY" = 0 ]; then
  default_branch=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || echo main)
  git fetch -q origin "$default_branch" || true
  if ! git cat-file -e "origin/$default_branch:docs/PRODUCT.md" 2>/dev/null; then
    echo "docs/PRODUCT.md が origin/$default_branch にありません。先に埋めて push してください（--product-only を参照）" >&2; exit 1
  fi
  if git show "origin/$default_branch:docs/PRODUCT.md" | grep -q "{{"; then
    echo "docs/PRODUCT.md にプレースホルダ {{...}} が残っています。埋めて push してください" >&2; exit 1
  fi
fi

# 3. 雛形 Issue（BE → FE → 契約の順。番号順に ready を付ける想定）
create_issue() {  # create_issue <kind> <title> <area>
  local kind="$1" title="$2" area="$3" body
  body=$(render ".github/factory/templates/bootstrap/issue-$kind.md")
  if [ "$DRY" = 1 ]; then
    printf '\n===== [dry-run] %s (area:%s) =====\n%s\n' "$title" "$area" "$body"; return
  fi
  gh issue create --title "$title" --body "$body" \
    --label "factory:triage" --label "type:chore" --label "area:$area" --label "risk:low" --label "budget:m"
}
[ -z "$ONLY" ] || [ "$ONLY" = be ]        && create_issue be        "[chore] バックエンドの雛形（$BE_DIR）"      be
[ -z "$ONLY" ] || [ "$ONLY" = fe ]        && create_issue fe        "[chore] フロントエンドの雛形（$FE_DIR）"    fe
[ -z "$ONLY" ] || [ "$ONLY" = contracts ] && create_issue contracts "[chore] FE/BE 契約（contracts/openapi.yaml）と生成パイプライン" infra

[ "$DRY" = 1 ] && exit 0
cat <<EOF

次にやること:
  1. 数分後、各 Issue に intake の仕様コメントが付く → 読んで、BE の Issue にだけ factory:ready
  2. Draft PR をレビュー（**最初の雛形は以後の全 PR が真似る規約になる。ここだけは丁寧に見る**）→ マージ
  3. FE → 契約 の順に同じことを繰り返す。3 件終わったら、AGENTS.md の空欄は実コードから埋まっている
EOF
