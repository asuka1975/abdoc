# abdoc backend

abdoc の API サーバ（Go 1.27 + chi、Cloud Run 向け）。

## 起動手順
1. Go 1.27 を用意する（`go.mod` の `go 1.27.0` により、古い Go でも `GOTOOLCHAIN=auto` なら自動取得される）
2. `cd backend && go mod download`
3. 環境変数は `.env.example` を参照（`PORT` のみ。未設定なら 8080）
4. `go run ./cmd/abdoc` で起動する。ログは標準出力に 1 行 1 JSON で出る
5. `curl -i localhost:8080/healthz` → `200` と `{"status":"ok"}`
6. テスト: `go test ./... -race`
7. コンテナ: `docker build -t abdoc-api . && docker run --rm -e PORT=8080 -p 8080:8080 abdoc-api`
8. 停止は Ctrl-C（SIGINT/SIGTERM で graceful shutdown）
