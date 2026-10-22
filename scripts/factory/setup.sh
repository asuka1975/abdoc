#!/usr/bin/env bash
# エージェントが最初に実行する環境構築スクリプト（モノレポ・領域別）。
# 「素の checkout を 1 コマンドでテストが走る状態にする」のが責務。必要な領域だけ入れる。
#
#   bash scripts/factory/setup.sh fe|be|infra|all     （既定: all）
#
# FE_DIR / BE_DIR は scripts/factory/init-monorepo.sh が書き換える。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
area="${1:-all}"

FE_DIR="frontend"
BE_DIR="backend"

setup_fe() {
  echo "== setup fe ($FE_DIR) =="
  [ -f "$FE_DIR/package.json" ] || { echo "skip fe: $FE_DIR/package.json が無い（雛形が入るまで）"; return 0; }
  pushd "$FE_DIR" >/dev/null
  if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile
  elif [ -f yarn.lock ]; then corepack enable && yarn install --immutable
  elif [ -f package-lock.json ]; then npm ci
  else npm install; fi
  # E2E を使うなら（Playwright が devDependencies にある場合のみ）
  if [ -f package.json ] && grep -q '"@playwright/test"' package.json; then
    npx playwright install --with-deps chromium
  fi
  popd >/dev/null
}

setup_be() {
  echo "== setup be ($BE_DIR) =="
  [ -f "$BE_DIR/go.mod" ] || { echo "skip be: $BE_DIR/go.mod が無い（雛形が入るまで）"; return 0; }
  pushd "$BE_DIR" >/dev/null
  go version
  go mod download
  go build ./...
  # スモークテスト: コンパイルだけ通す（テスト本体は呼び出し側が実行）
  go vet ./...
  go test ./... -count=1 -run '^$' >/dev/null
  popd >/dev/null
}

setup_infra() {
  echo "== setup infra =="
  # 例: terraform -chdir=infra init -backend=false / actionlint のインストール
  :
}

case "$area" in
  fe)    setup_fe ;;
  be)    setup_be ;;
  infra) setup_infra ;;
  all)   setup_fe; setup_be; setup_infra ;;
  *) echo "unknown area: $area (fe|be|infra|all)" >&2; exit 2 ;;
esac
echo "== setup done ($area) =="
