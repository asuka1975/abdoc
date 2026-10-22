# Issue #4: [chore] バックエンドの雛形（backend）

## 仕様（確定版の要約）
`backend/` に Go 1.27 + chi の最小サーバ（`GET /healthz`、slog JSON 構造化ログ、Cloud Run 向け Dockerfile）を置く。
`backend/AGENTS.md`・`.env.example`・`README.md` を実コードに基づいて整え、`setup.sh be` と `CI / api` が緑になる足場にする。業務機能・DB・認証・デプロイ・コード生成はスコープ外。
人間の回答: Go 1.27 で確定（PRODUCT.md を更新してよい）、モジュールパス `github.com/asuka1975/abdoc/backend`、バイナリ `cmd/abdoc`。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1 setup.sh be が成功 | `bash scripts/factory/setup.sh be` | 未 |
| AC2 go test で healthz テストが通る | `internal/transport/http` の `TestHealthz` | 未 |
| AC3 200 / `{"status":"ok"}` / JSON Content-Type | `TestHealthz` | 未 |
| AC4 CI / api が緑 | PR のチェック | 未 |
| AC5 Dockerfile（マルチステージ・非 root・PORT） | `internal/config` の `TestLoad*` + `docker build` | 未 |
| AC6 AGENTS.md に「例:」が無い | `grep -n '例:' backend/AGENTS.md` | 未 |
| AC7 .env.example / README.md | ファイル存在 + 環境変数の突き合わせ | 未 |
| AC8 起動ログが JSON | `internal/logging` の `TestNew*` / `cmd/abdoc` の起動ログテスト | 未 |

## 計画
- [x] 1. exec-plan を作成
- [ ] 2. go.mod（chi）と設定読み込み（PORT）+ テスト
- [ ] 3. slog JSON ロガー・/healthz・ルータ + テスト（AC3, AC8）
- [ ] 4. cmd/abdoc/main.go（起動ログ・graceful shutdown）と internal/ 骨組み
- [ ] 5. Dockerfile と .dockerignore（AC5）
- [ ] 6. .env.example・README.md・AGENTS.md・PRODUCT.md（Go 1.27 確定）
- [ ] 7. 最終確認・Draft PR

## 進捗ログ（セッションをまたいで追記）
- 2026-10-22 ステップ1 完了。

## 意思決定ログ
- Go 1.27.0 は `GOTOOLCHAIN=auto` で取得できることを確認したので `go 1.27.0` を採用。

## 人間への質問
なし
