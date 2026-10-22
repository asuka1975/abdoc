### 目的（Why）
{{SYSTEM}}

FE と BE の契約を `contracts/openapi.yaml` に一本化し、両側のコードを生成する仕組みを作る。
以後、API を変える Issue は「契約を変えて再生成する」だけになり、生成物の手編集をレビューで弾けるようになる。

### 受け入れ基準（検証できる形で）
- `contracts/openapi.yaml` が存在し、`GET /healthz` を定義している（OpenAPI 3.1）
- WHEN `make generate`（またはルートの `scripts/generate.sh`）を実行 THE SYSTEM SHALL
  - `{{BE_DIR}}` に Go のサーバ側インターフェース（例: oapi-codegen）が生成される
  - `{{FE_DIR}}/src/api/generated/` に TS の型とクライアント（例: openapi-typescript + openapi-fetch）が生成される
- WHEN 生成物を変更せずに `make generate` を再実行 THE SYSTEM SHALL 差分が出ない（CI で `git diff --exit-code` により検証する）
- `{{BE_DIR}}` の `/healthz` ハンドラが生成されたインターフェースを実装している
- `{{FE_DIR}}` に生成クライアントで `/healthz` を呼ぶ最小のテストがある（BE はモック）
- ルート `AGENTS.md` の「FE と BE の契約」節が、実際のコマンドと生成先に更新されている
- `CI / web` と `CI / api` が緑

### スコープ外（やらないこと）
- 業務 API の設計（この Issue は `/healthz` だけ）
- 認証スキーム

### 関連情報
- `docs/PRODUCT.md`
- 生成ツールの選定は PRODUCT.md に従う。無ければ oapi-codegen（Go）+ openapi-typescript（TS）を既定とし、PR 本文で理由を書く

### 人間への質問（あれば intake が追記）
