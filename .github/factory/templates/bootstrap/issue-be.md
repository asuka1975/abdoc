### 目的（Why）
{{SYSTEM}}

バックエンドの雛形を作り、以後の全 Issue が「テストを書いて CI を通す」ループに乗れる足場にする。機能はまだ作らない。
正は `docs/PRODUCT.md`。スタック: **{{BE_STACK}}**（データ: {{DB}}）。

### 受け入れ基準（検証できる形で）
- WHEN `bash scripts/factory/setup.sh be` を素の checkout で実行 THE SYSTEM SHALL 依存取得・ビルド・vet が成功する
- WHEN `cd {{BE_DIR}} && go test ./...` を実行 THE SYSTEM SHALL 少なくとも 1 つのテスト（`/healthz` ハンドラ）が通る
- WHEN サーバを起動して `GET /healthz` THE SYSTEM SHALL `200` と `{"status":"ok"}` を返す
- WHEN PR を開く THE SYSTEM SHALL `CI / api` が緑になる（マニフェストが入ると自動で有効化される）
- `{{BE_DIR}}/Dockerfile` が Cloud Run で動く形（非 root、`PORT` 環境変数を尊重、マルチステージ）で存在する
- `{{BE_DIR}}/AGENTS.md` が **実コードに基づく**コマンド表・構成・禁止事項に書き換えられている（推測や例は残さない）
- `{{BE_DIR}}/.env.example` と `{{BE_DIR}}/README.md`（起動手順）が存在する
- 構造化ログ（JSON）で起動ログが出る

### スコープ外（やらないこと）
- 業務機能、DB スキーマ、認証（別 Issue）
- デプロイワークフロー（工場の外で行う）
- `contracts/` からのコード生成（別 Issue）

### 関連情報
- `docs/PRODUCT.md`
- レイアウトの出発点: `cmd/<name>/main.go`, `internal/transport/http`, `internal/app`, `internal/domain`, `internal/store`（PRODUCT.md と矛盾するなら PRODUCT.md を優先し、PR 本文で指摘）

### 人間への質問（あれば intake が追記）
