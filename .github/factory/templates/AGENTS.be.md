# AGENTS.md — バックエンド（`{{DIR}}/`、Go）

<!-- 一般論は書かない。このディレクトリ固有のコマンド・境界・禁止事項だけ。 -->

## コマンド（このディレクトリで実行）
| 目的 | コマンド |
|---|---|
| 依存・ビルド | `go mod download && go build ./...` |
| 単体テスト | `go test ./...` |
| 特定テスト | `go test ./internal/<pkg>/... -run 'TestName'` |
| 統合テスト | `go test -tags=integration ./...`（要: `docker compose up -d db`） |
| リント | `gofmt -l . && go vet ./...`（`golangci-lint run` があればそれも） |
| ローカル起動 | `go run ./cmd/<name>`（env は `.env.example` 参照） |
| 生成 | `go generate ./...`（出力は手で編集しない） |

## 構成と境界
- レイアウト: **（例: `cmd/` エントリポイント、`internal/domain` ドメイン、`internal/app` ユースケース、`internal/store` DB、`internal/transport/http` ハンドラ）**
- 依存の向き: `cmd → transport → app → domain`。`domain` は標準ライブラリ以外を import しない。
- DB に触るのは `internal/store` だけ。SQL は **（例: sqlc / GORM）** 経由。
- Google Cloud との接続（Cloud SQL, Pub/Sub, Secret Manager など）は `internal/gcp/` に閉じ、ローカルではエミュレータかフェイクを使う。本番資格情報はテストで要求しない。

## 禁止・注意
- マイグレーション（`migrations/`）は追加のみ。既存ファイルを編集しない。down マイグレーションを必ず書く。
- 公開 API（`contracts/` の OpenAPI）を変えるときは契約を先に変更し、FE 側への影響を PR 本文に書く。
- `context.Context` を第 1 引数で渡す。goroutine を無制限に起動しない。
- エラーは `fmt.Errorf("...: %w", err)` でラップし、ハンドラ層で HTTP ステータスに変換する。

## 検証の証拠（PR 本文に書くもの）
- `go test ./...` の結果。統合テストを走らせた場合はその旨。
- API 変更は `curl` または契約テストの結果。
