# Issue #4: [chore] バックエンドの雛形（backend）

## 仕様（確定版の要約）
`backend/` に Go 1.27 + chi の最小サーバ（`GET /healthz`、slog JSON 構造化ログ、Cloud Run 向け Dockerfile）を置く。
`backend/AGENTS.md`・`.env.example`・`README.md` を実コードに基づいて整え、`setup.sh be` と `CI / api` が緑になる足場にする。業務機能・DB・認証・デプロイ・コード生成はスコープ外。
人間の回答: Go 1.27 で確定（PRODUCT.md を更新してよい）、モジュールパス `github.com/asuka1975/abdoc/backend`、バイナリ `cmd/abdoc`。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1 setup.sh be が成功 | `setup_be` の各コマンド（mod download / build / vet / test -run '^$'）を個別に実行 | 緑（スクリプト本体の実行は環境の権限で不可） |
| AC2 go test で healthz テストが通る | `internal/transport/http` の `TestHealthz`, `TestHealthzOverServer` | 緑 |
| AC3 200 / `{"status":"ok"}` / JSON Content-Type | `TestHealthz`, `cmd/abdoc` の `TestRunServesHealthzAndLogsJSON` | 緑 |
| AC4 CI / api が緑 | PR のチェック | PR で確認 |
| AC5 Dockerfile（マルチステージ・非 root・PORT） | `internal/config` の `TestLoad*` | 緑（`docker build` は環境の権限で未実行） |
| AC6 AGENTS.md に「例:」が無い | `grep -n '例:' backend/AGENTS.md` → 0 件 | 緑 |
| AC7 .env.example / README.md | 存在確認。コードが読む環境変数は `PORT` のみ（`os.Getenv` は config.go の 1 箇所） | 緑 |
| AC8 起動ログが JSON | `internal/logging` の `TestNewWritesCloudLoggingJSON` / `TestSeverityMapping`、`cmd/abdoc` の `TestRunServesHealthzAndLogsJSON` | 緑 |

## 計画
- [x] 1. exec-plan を作成
- [x] 2. go.mod（chi）と設定読み込み（PORT）+ テスト
- [x] 3. slog JSON ロガー・/healthz・ルータ + テスト（AC3, AC8）
- [x] 4. cmd/abdoc/main.go（起動ログ・graceful shutdown）と internal/ 骨組み
- [x] 5. Dockerfile と .dockerignore（AC5）
- [x] 6. .env.example・README.md・AGENTS.md・PRODUCT.md（Go 1.27 確定）
- [ ] 7. 最終確認・Draft PR

## 進捗ログ（セッションをまたいで追記）
- 2026-10-22 ステップ1 完了（6d4f58a）。
- 2026-10-22 ステップ2 完了（2b8ab47）。
- 2026-10-22 ステップ3 完了（7b2e122）。chi v5.5.0 を追加。
- 2026-10-22 ステップ4 完了（cb0dd74）。
- 2026-10-22 ステップ5 完了（60ee6b9）。docker build はこの実行環境では許可されず未実行。
- 2026-10-22 ステップ6 完了。

## 意思決定ログ
- Go 1.27.0 は `GOTOOLCHAIN=auto` で取得できることを確認したので `go 1.27.0` を採用。
- `scripts/factory/setup.sh` の `setup_be` は実態のままで動くため変更しない。
- ログキーは Cloud Logging に合わせて `message` / `severity`（WARN は `WARNING`）。
- 実行イメージは distroless `static-debian12:nonroot`（非 root、CGO 無効の静的バイナリ）。
- `internal/app`・`domain`・`store` は `doc.go` だけの空パッケージ。
- PORT は 1〜65535 の数値以外なら起動時エラー（設定ミスを早く気付けるように）。

## 人間への質問
なし
