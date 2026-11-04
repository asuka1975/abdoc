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
| AC1〜AC3 | `domain.TestApply`、`app_test.TestSetReactionFlow`、`transport/http.TestPutReactionLikeAndToggle` / `TestPutReactionSwitchAndMove`、`storetest.Run`（memory） | 緑 |
| AC4 | `domain.TestApply`（冪等ケース）、`transport/http.TestPutReactionIdempotent` | 緑 |
| AC5 | `transport/http.TestVisitorIDRequired` | 緑 |
| AC6 | `transport/http.TestInvalidInput`、`domain.TestValidators` / `TestEngagementValidate` | 緑 |
| AC7 | `make generate` 後に `git status` で差分なしを確認 | 緑（ローカル） |
| AC8 | `store.TestProxyToEmulators`、`firestore.TestReactionStoreOnEmulator`（`-tags=integration`）、README の curl 手順 | コンパイルのみ（この環境では Docker が使えない） |
| AC9 | `transport/http.TestGetReactionEmpty` | 緑 |
| AC10 | `transport/http.TestPostEngagement`、`bigquery.TestWriteEngagement` / `TestWriteReaction`（偽の insertAll で行内容を確認） | 緑 |
| AC11 | `bigquery.TestEventWriterOnEmulator`（`-tags=integration`）、偽の BigQuery が insertAll 以外を受けたら失敗 | 単体は緑 / 統合はコンパイルのみ |

## 計画
- [x] 1. 契約の変更と `make generate`（ハンドラは 501 の仮実装）
- [x] 2. domain: 遷移関数と入力の検証
- [x] 3. app: ユースケース、ストア/イベントのインターフェース、インメモリ実装
- [x] 4. HTTP ハンドラ
- [x] 5. Firestore 実装
- [x] 6. BigQuery 実装、設定、`.env.example`、`cmd/abdoc` の配線
- [x] 7. compose.yaml、Caddyfile、BigQuery 初期データ、README
- [x] 8. 統合テスト、Draft PR

## 進捗ログ（セッションをまたいで追記）
- 2026-10-27 ステップ 1〜8 完了（35d30fa〜fcc0289）。`go test ./... -race`・`go vet`・`gofmt`・FE の typecheck/test/lint は緑。
- 統合テスト（`-tags=integration`）はこの実行環境で Docker が許可されていないため未実行。コンパイルは確認済み。

## 意思決定ログ
- `PUT reaction=none` は、どの版に付いていても外す（訪問者×記事で最大 1 つのため）。外したあとの記録は `{variant: <送られた版>, reaction: none}`。
- `GET ?variant=X` の `myReaction` は「その版に付けたリアクション」。別の版に付けていれば `none` に見える。
- `reaction_events.variant` は送られた版、`previous_reaction` は（別の版のものでも）直前のリアクション。
- visitor ID は生成コードの UUID 変換（波括弧・`urn:uuid:`・ハイフン無しも通す）に加え、ヘッダーの文字列そのものをハイフン区切り 36 文字の形式で検証する。大文字は小文字にして保存する。
- 必須フィールドが無い・`null` のボディは 400（生成された型はゼロ値になってしまうため、キーの有無を別に確かめる）。ボディの上限は 4 KiB。
- イベント書き込みの失敗: リアクションはカウンター（Firestore）を正とし、BigQuery の失敗はログに出して 200 を返す。engagement は書き込みがそれだけなので 500 を返す。
- `GOOGLE_CLOUD_PROJECT` が未設定ならインメモリのストアで起動し、WARN ログを出す（既存の `run()` のテストと、エミュレータ無しのローカル起動のため）。設定されていれば `BIGQUERY_DATASET` は必須。
- BigQuery クライアントは `BIGQUERY_EMULATOR_HOST` を自動では読まないので、設定から `option.WithEndpoint` + `WithoutAuthentication` を渡す。
- Caddy では `route` で順序を固定し、`__session` が無ければ Cookie ヘッダーを削除、あれば `__session=<値>` だけに置き換える。
- engagement の `durationSeconds` は `number`（double）。NaN / Inf は JSON では来ないが domain でも弾く。

## 人間への質問
（なし）
