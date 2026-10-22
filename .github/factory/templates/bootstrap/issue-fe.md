### 目的（Why）
{{SYSTEM}}

フロントエンドの雛形を作り、以後の全 Issue が「型・リント・テスト・ビルドを通す」ループに乗れる足場にする。画面はまだ作らない。
**正は `docs/PRODUCT.md`。この Issue の記載と PRODUCT.md が矛盾したら PRODUCT.md を優先し、矛盾を「人間への質問」に書く。**
スタック（PRODUCT.md より）: **{{FE_STACK}}**

### 受け入れ基準（検証できる形で）
- WHEN `bash scripts/factory/setup.sh fe` を素の checkout で実行 THE SYSTEM SHALL 依存取得が成功する（ロックファイルをコミットする）
- `{{FE_DIR}}/package.json` に `typecheck` / `lint` / `test` / `build` の 4 つの script が定義され、WHEN `cd {{FE_DIR}} && pnpm typecheck && pnpm lint && pnpm test && pnpm build` THE SYSTEM SHALL すべて成功する（フレームワーク標準のコマンドに割り当てる。例: Astro なら `astro check` / `astro build`、Next.js なら `tsc --noEmit` / `next build`）
- WHEN 開発サーバを起動してトップページを開く THE SYSTEM SHALL 「{{SYSTEM_SHORT}}」というタイトルのページが表示される
- 少なくとも 1 つのユニット/コンポーネントテスト（フレームワーク標準のテストランナー）と、1 つの E2E（Playwright、トップページが表示される）がある。E2E は CI では `pnpm e2e` として分離してよい
- TypeScript は `strict: true`。ESLint にアクセシビリティ系ルール（`jsx-a11y` または同等）が入っている
- API のベース URL は環境変数で受ける。名前はフレームワークの公開変数規約に従う（Astro: `PUBLIC_API_BASE_URL`、Next.js: `NEXT_PUBLIC_API_BASE_URL`、Vite: `VITE_API_BASE_URL`）
- `{{FE_DIR}}/AGENTS.md` が **実コードに基づく**コマンド表・構成・禁止事項に書き換えられている（推測や例は残さない）
- `{{FE_DIR}}/.env.example` と `{{FE_DIR}}/README.md`（起動手順）が存在する
- WHEN PR を開く THE SYSTEM SHALL `CI / web` が緑になる

### スコープ外（やらないこと）
- 業務画面、認証、API 接続（契約 Issue の後）
- デザインシステムの選定（PRODUCT.md に書かれていれば従う。無ければ素の CSS か Tailwind のどちらかを選び、PR 本文で理由を書く）
- デプロイ（PRODUCT.md の実行基盤に合わせた設定ファイルの雛形を置くのは可。配信パイプラインは作らない）

### 関連情報
- `docs/PRODUCT.md`（スタック・配信方式・やらないこと）
- `{{BE_DIR}}` の雛形 Issue（API は `/api/**` 経由で呼ぶ想定。経路は PRODUCT.md の実行基盤に従う）

### 人間への質問（あれば intake が追記）
