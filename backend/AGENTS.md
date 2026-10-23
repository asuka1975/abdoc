# AGENTS.md — バックエンド（`backend/`、Go 1.27 + chi）

## コマンド（このディレクトリで実行）
| 目的 | コマンド |
|---|---|
| 環境構築（リポジトリのルートで） | `bash scripts/factory/setup.sh be` |
| 依存・ビルド | `go mod download && go build ./...` |
| 単体テスト（CI と同じ） | `go test ./... -count=1 -race` |
| 特定テスト | `go test ./internal/transport/http/... -run 'TestHealthz'` |
| リント（CI と同じ） | `gofmt -l .`（出力が空であること）と `go vet ./...` |
| ローカル起動 | `go run ./cmd/abdoc`（環境変数は `.env.example` 参照） |
| コンテナ | `docker build -t abdoc-api .` |

CI は `.github/workflows/ci-api.yml`（`CI / api`）: gofmt → vet → build → `test -race`。Go のバージョンは `go.mod` から選ばれる。

## 構成と境界
- `cmd/abdoc/` — エントリポイント。設定読み込み・ロガー生成・HTTP サーバ起動と graceful shutdown（`run(ctx, logOut)` をテストする）
- `internal/config/` — 環境変数から設定を読む（現在は `PORT`、既定 `8080`）。環境変数を増やしたら `.env.example` も更新する
- `internal/logging/` — slog の JSON ハンドラ。キーは Cloud Logging 向けに `message` / `severity`
- `internal/transport/http/` — chi ルータとハンドラ（`GET /healthz`）。ハンドラは生成された `api.ServerInterface` のメソッドとして実装する（ルートは生成コードが登録する）
- `internal/transport/http/api/` — `contracts/openapi.yaml` からの生成物（`make generate`、設定は `oapi-codegen.yaml`）。手で編集しない
- `internal/app/` — ユースケース（空）
- `internal/domain/` — ドメインモデル（空）。標準ライブラリ以外を import しない
- `internal/store/` — Firestore / BigQuery への永続化（空）。外部データストアに触るのはここだけ
- 依存の向き: `cmd → transport → app → domain`、`app → store`

## 禁止・注意
- ログは `logging.New` で作った `*slog.Logger` を使う。`fmt.Print*` / `log.Print*` で標準出力に書かない（1 行 1 JSON が崩れる）
- 設定は環境変数のみ。秘密情報や環境依存値をコードに書かない
- 公開 API を変えるときは `contracts/` を先に変更する。生成物は手で編集しない
- `context.Context` を第 1 引数で渡す。goroutine を無制限に起動しない
- エラーは `fmt.Errorf("...: %w", err)` でラップし、ハンドラ層で HTTP ステータスに変換する
- 依存の追加は PR 本文に package / version / 理由を書く。`go.sum` を手で編集しない（`go mod tidy` を使う）
- Dockerfile は Cloud Run 前提（マルチステージ、distroless `nonroot`、`PORT` を尊重）。root で動かす変更をしない

## 検証の証拠（PR 本文に書くもの）
- `go test ./... -count=1 -race` と `go vet ./...` の結果
- API 変更は `curl` または `httptest` のテスト結果
