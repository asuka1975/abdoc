#!/usr/bin/env bash
# エージェントが最初に実行する環境構築スクリプト。
# 「新しい checkout を 1 コマンドでテストが走る状態にする」のが責務。
# ここが壊れていると build / heal / chat の全てが「環境のせい」で失敗する。
# → 失敗したら learn エージェントがここを直す PR を出す。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== factory setup =="

# --- プロジェクトに合わせて書き換える（例） ---
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile
  elif [ -f yarn.lock ]; then corepack enable && yarn install --immutable
  else npm ci; fi
fi
if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  python3 -m pip install -q -e . 2>/dev/null || python3 -m pip install -q -r requirements.txt
fi
if [ -f go.mod ]; then go mod download; fi
if [ -f Cargo.toml ]; then cargo fetch; fi

# --- スモークテスト: ここが通らなければ環境が壊れている ---
# 例: npm test -- --listTests >/dev/null
echo "== setup done =="
