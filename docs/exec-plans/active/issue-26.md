# Issue #26: [feat] 記事ページのいいね/バッドボタンと、スクロール深さ・滞在時間の送信

## 仕様（確定版の要約）
`ABPost.astro` に、表示中の版へのいいね/バッドボタン（トグル・排他）を置く。ページ離脱時（`visibilitychange` hidden / `pagehide`）に、最大スクロール深さ（整数 %）と可視秒数を engagement として 1 回だけ `keepalive` の fetch で送る。
すべて同意済みのときだけ `client.ts`（openapi-fetch）経由で、`X-Abdoc-Visitor-Id` を付けて呼ぶ。同意状態の変更は、再読み込みせずにボタンと送信可否に反映する（AC8）。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1〜3（トグル・排他） | `tests/reaction.test.ts` | 未着手 |
| AC4（engagement 1 回送信） | `tests/engagement.test.ts` + `e2e/reaction.spec.ts` | 未着手 |
| AC5（未同意で API を呼ばない） | `tests/reaction.test.ts` + `e2e/reaction.spec.ts` | 未着手 |
| AC6（初期 GET・aria-pressed・lint） | `tests/reaction.test.ts`, `tests/post-page.test.ts`, `pnpm lint` | 未着手 |
| AC7（API 失敗時に表示を保つ） | `tests/reaction.test.ts` | 未着手 |
| AC8（同意の動的反映） | `tests/reaction.test.ts`, `tests/engagement.test.ts`, `e2e/reaction.spec.ts` | **ブロック中（質問 1）** |

## 計画
- [ ] 1. 前提確認（#24 の `visitor.ts`・同意変更の通知手段、#25 の契約と生成物）→ **通知手段が無いので停止中**
- [ ] 2. `reaction.ts` + 単体テスト（AC1〜3, 7）
- [ ] 3. `engagement.ts` + 単体テスト（AC4, AC8）
- [ ] 4. `ABPost.astro` の接続（AC5, 6, 8）
- [ ] 5. e2e `reaction.spec.ts`（AC4, 5, 8）
- [ ] 6. `frontend/AGENTS.md` 更新・PR 本文に手動確認手順

## 進捗ログ（セッションをまたいで追記）
- 2026-11-04 ステップ 1 の前提確認を実施。
  - #25: `contracts/openapi.yaml` に `GET/PUT /api/posts/{slug}/reaction`・`POST /api/posts/{slug}/engagement`・ヘッダー `X-Abdoc-Visitor-Id` があり、仕様と一致（main に取り込み済み）。
  - #24: `frontend/src/lib/visitor.ts` に `visitor()` / `getConsent()` / `setConsent()` / `getVisitorId()` がある。
  - #24: **同意の変更を知らせる手段（カスタムイベントや購読関数）が無い**。`ConsentBanner.astro` は `v.setConsent(choice)` を呼ぶだけで、イベントを出さない。
  - 仕様の取り決め（「#24 に通知手段が無かった場合は手順 1 で止まって質問する」）に従い、ここで停止した。

## 意思決定ログ
- 通知手段を足すには #24 の領域（`visitor.ts` または `ConsentBanner.astro`）を変える必要がある。仕様では、#24 の同意の仕組みはスコープ外になっている。このため、推測で進めずに質問することにした。

## 人間への質問
1. **同意の変更を知らせる手段をどこに作るか**（AC8 に必要）。次のどれかを選んでください。
   - **案 A（推奨）**: この Issue の中で `frontend/src/lib/visitor.ts` を最小限だけ変える。`Visitor` に `onConsentChange(listener): () => void`（購読関数。戻り値で解除）を足し、`setConsent()` から通知する。`ConsentBanner.astro` は変えない。既存の `tests/visitor.test.ts` は変えず、テストを追加する。
   - **案 B**: 案 A と同じ変更を、別の Issue（#24 の追補）として先にマージする。その後でこの Issue を再開する。
   - **案 C**: `visitor.ts` を変えない。`ABPost.astro` 側で、バナーの `[data-consent-choice]` ボタンのクリックを監視する（DOM に依存するので壊れやすく、推奨しない）。
