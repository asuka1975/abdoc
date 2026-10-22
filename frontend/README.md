# abdoc frontend

Astro 7（static output）+ pnpm + TypeScript strict。Node 24（`.nvmrc`）。

```bash
bash scripts/factory/setup.sh fe   # リポジトリルートで。依存と Playwright の Chromium を入れる
cd frontend
cp .env.example .env               # PUBLIC_API_BASE_URL を設定
pnpm dev                           # http://localhost:4321
pnpm typecheck && pnpm lint && pnpm test   # 型・リント・ユニット
pnpm e2e                           # Playwright（dev サーバを自動起動）
pnpm build                         # dist/ に静的ファイルを出力
```
