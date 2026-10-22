### 目的（Why）
{{SYSTEM}}

フロントエンドの雛形を作り、以後の全 Issue が「型・リント・テスト・ビルドを通す」ループに乗れる足場にする。画面はまだ作らない。
正は `docs/PRODUCT.md`。スタック: **{{FE_STACK}}**。

### 受け入れ基準（検証できる形で）
- WHEN `bash scripts/factory/setup.sh fe` を素の checkout で実行 THE SYSTEM SHALL 依存取得が成功する（`pnpm-lock.yaml` をコミットする）
- WHEN `cd {{FE_DIR}} && pnpm typecheck && pnpm lint && pnpm test && pnpm build` THE SYSTEM SHALL すべて成功する（`package.json` にこの 4 つの script が定義されている）
- WHEN `pnpm dev` で起動してトップページを開く THE SYSTEM SHALL 「{{SYSTEM_SHORT}}」というタイトルのページが表示される
- 少なくとも 1 つのコンポーネントテスト（Testing Library）と、1 つの E2E（Playwright、トップページが表示される）がある。E2E は CI では `pnpm e2e` として分離してよい
- TypeScript は `strict: true`。ESLint に `jsx-a11y` が入っている
- `{{FE_DIR}}/AGENTS.md` が **実コードに基づく**コマンド表・構成・禁止事項に書き換えられている
- `{{FE_DIR}}/.env.example` と `{{FE_DIR}}/README.md`（起動手順）が存在する
- WHEN PR を開く THE SYSTEM SHALL `CI / web` が緑になる

### スコープ外（やらないこと）
- 業務画面、認証、API 接続（契約 Issue の後）
- デザインシステムの選定（PRODUCT.md に書かれていれば従う。無ければ素の CSS Modules か Tailwind のどちらかを選び、PR 本文で理由を書く）
- デプロイ

### 関連情報
- `docs/PRODUCT.md`
- `{{BE_DIR}}` の雛形 Issue（API のベース URL は環境変数 `NEXT_PUBLIC_API_BASE_URL` 等で受ける想定）

### 人間への質問（あれば intake が追記）
