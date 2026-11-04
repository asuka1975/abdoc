# abdoc

- 何を作るか・スタック・規約: [`docs/PRODUCT.md`](docs/PRODUCT.md)
- 開発の進め方（Issue 駆動の AI ファクトリー）: [`docs/factory/STATE_MACHINE.md`](docs/factory/STATE_MACHINE.md) / 導入: [`docs/factory/SETUP.md`](docs/factory/SETUP.md)
- バックエンド: [`backend/`](backend/) · フロントエンド: [`frontend/`](frontend/)

## ローカルで動かす（Docker Compose）

FE → プロキシ（Firebase Hosting の代わりの Caddy）→ backend → Firestore / BigQuery エミュレータの経路を、ルートの [`compose.yaml`](compose.yaml) で通せます。

| サービス | 役割 | ホストのポート |
|---|---|---|
| `proxy` | Caddy。`frontend/dist` を配信し、`/api/**` を backend へ転送する。`__session` 以外の Cookie は捨てる（[`compose/caddy/Caddyfile`](compose/caddy/Caddyfile)） | 8080 |
| `backend` | `backend/Dockerfile` のイメージ。エミュレータに接続する | （公開しない） |
| `firestore` | Firestore エミュレータ（`gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators`） | 8081 |
| `bigquery` | BigQuery エミュレータ（`ghcr.io/goccy/bigquery-emulator`）。初期データ [`compose/bigquery/data.yaml`](compose/bigquery/data.yaml) でデータセット `abdoc` と 2 つのテーブルを作る | 9050 |

```sh
# 1. FE をビルドする（proxy が frontend/dist を配信する）
(cd frontend && pnpm install && pnpm build)

# 2. 起動する
docker compose up --build -d

# 3. プロキシ経由で API を呼ぶ（訪問者 ID は UUID）
VID=$(uuidgen | tr 'A-Z' 'a-z')
curl -i -X PUT localhost:8080/api/posts/hello-world/reaction \
  -H "X-Abdoc-Visitor-Id: $VID" -H 'Content-Type: application/json' \
  -d '{"variant":"A","reaction":"like"}'
# => 200 {"bads":0,"likes":1,"myReaction":"like"}
curl -i "localhost:8080/api/posts/hello-world/reaction?variant=A" -H "X-Abdoc-Visitor-Id: $VID"
curl -i -X POST localhost:8080/api/posts/hello-world/engagement \
  -H "X-Abdoc-Visitor-Id: $VID" -H 'Content-Type: application/json' \
  -d '{"variant":"A","maxScrollDepth":80,"durationSeconds":42.5}'
# => 204

# 4. 記録を確かめる（エミュレータの REST API）
curl -s "localhost:8081/v1/projects/abdoc-local/databases/(default)/documents/posts/hello-world/variants/A"
curl -s -X POST localhost:9050/bigquery/v2/projects/abdoc-local/queries -H 'Content-Type: application/json' \
  -d '{"query":"SELECT * FROM abdoc.engagement_events","useLegacySql":false}'

# 5. 統合テスト（compose を起動したまま、backend/ で）
(cd backend && FIRESTORE_EMULATOR_HOST=localhost:8081 BIGQUERY_EMULATOR_HOST=localhost:9050 \
  GOOGLE_CLOUD_PROJECT=abdoc-local BIGQUERY_DATASET=abdoc ABDOC_PROXY_URL=http://localhost:8080 \
  go test -tags=integration -count=1 ./...)

# 片付け（エミュレータのデータはコンテナと一緒に消える）
docker compose down
```

エミュレータを使わずに backend だけを動かすときは、`GOOGLE_CLOUD_PROJECT` を設定せずに `go run ./cmd/abdoc` を実行するとインメモリのストアで動きます（再起動で消えます）。環境変数は [`backend/.env.example`](backend/.env.example) を参照してください。

### BigQuery のテーブル

backend はテーブルを作りません。本番では Terraform で作ります。列の定義は次のとおりです（ローカルでは `compose/bigquery/data.yaml` で作成）。すべて `REQUIRED` です。

| テーブル | 列 | 書き込むとき |
|---|---|---|
| `engagement_events` | `slug STRING`, `variant STRING`, `visitor_id STRING`, `max_scroll_depth INT64`, `duration_seconds FLOAT64`, `timestamp TIMESTAMP` | `POST /api/posts/{slug}/engagement` のたびに 1 行（重複排除は集計側） |
| `reaction_events` | `slug STRING`, `variant STRING`, `visitor_id STRING`, `reaction STRING`, `previous_reaction STRING`, `timestamp TIMESTAMP` | `PUT /api/posts/{slug}/reaction` でリアクションが変わったときに 1 行（同じ状態の再送では書かない）。`reaction` / `previous_reaction` は `like` / `bad` / `none` |
