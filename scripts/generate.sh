#!/usr/bin/env bash
# contracts/openapi.yaml（FE と BE の契約の正）から両側のコードを生成する。
#
#   bash scripts/generate.sh [be|fe|all]   （既定: all。`make generate` と同じ）
#
# 生成先（手で編集しない）:
#   BE: backend/internal/transport/http/api/api.gen.go  （oapi-codegen。設定は backend/oapi-codegen.yaml）
#   FE: frontend/src/api/generated/schema.ts            （openapi-typescript）
# ツールのバージョンは backend/go.mod の tool ディレクティブと frontend/package.json で固定している。
# 前提: BE は Go（go.mod の toolchain）、FE は `pnpm install` 済みであること。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
target="${1:-all}"

SPEC="contracts/openapi.yaml"

generate_be() {
  echo "== generate be =="
  (cd backend && go tool oapi-codegen -config oapi-codegen.yaml "../$SPEC")
}

generate_fe() {
  echo "== generate fe =="
  (cd frontend && pnpm exec openapi-typescript "../$SPEC" --output src/api/generated/schema.ts)
}

case "$target" in
  be)  generate_be ;;
  fe)  generate_fe ;;
  all) generate_be; generate_fe ;;
  *) echo "unknown target: $target (be|fe|all)" >&2; exit 2 ;;
esac
echo "== generate done ($target) =="
