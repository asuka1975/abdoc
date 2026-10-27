# Issue #25: リアクション・engagement の API と記録（Firestore / BigQuery）、ローカル用 Docker Compose

## 仕様（確定版の要約）
- `GET/PUT /api/posts/{slug}/reaction`、`POST /api/posts/{slug}/engagement`。3 本とも `X-Abdoc-Visitor-Id`（UUID）必須。
- リアクションは訪問者×記事で最大 1 つ。トグル・排他・版の付け替え。状態遷移は純粋関数（`domain`）。
- Firestore: `posts/{slug}/variants/{A|B}` `{likes,bads}`、`posts/{slug}/reactions/{visitorId}` `{variant,reaction}` をトランザクションで更新。
- BigQuery: `engagement_events`（POST ごとに 1 行）、`reaction_events`（変化があったときだけ 1 行）。テーブルは作らない。
- ルートの `compose.yaml`（Firestore / BigQuery エミュレータ、backend、Caddy）と README。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1〜AC3 | `domain.TestApply`、`app.TestReactionService`、`transport/http.TestPutReaction` | |
| AC4 | `domain.TestApply`（変化なし）、`transport/http.TestPutReactionIdempotent` | |
| AC5 | `transport/http.TestVisitorIdRequired` | |
| AC6 | `transport/http.TestInvalidInput` | |
| AC7 | CI の再生成差分チェック（ローカルで `make generate` + `git diff --exit-code`） | |
| AC8, AC11 | `store/integration_test.go`（`-tags=integration`）、README の curl 手順 | |
| AC9 | `transport/http.TestGetReactionEmpty` | |
| AC10 | `transport/http.TestEngagement`、`TestPutReaction`（イベント行の内容） | |

## 計画
- [ ] 1. 契約の変更と `make generate`（ハンドラは 501 の仮実装）
- [ ] 2. domain: 遷移関数と入力の検証
- [ ] 3. app: ユースケース、ストア/イベントのインターフェース、インメモリ実装
- [ ] 4. HTTP ハンドラ
- [ ] 5. Firestore 実装
- [ ] 6. BigQuery 実装、設定、`.env.example`、`cmd/abdoc` の配線
- [ ] 7. compose.yaml、Caddyfile、BigQuery 初期データ、README
- [ ] 8. 統合テスト、Draft PR

## 進捗ログ（セッションをまたいで追記）

## 意思決定ログ

## 人間への質問
（なし）
