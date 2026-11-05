# Issue #26: [feat] 記事ページのいいね/バッドボタンと、スクロール深さ・滞在時間の送信

## 仕様（確定版の要約）
`ABPost.astro` に、表示中の版へのいいね/バッドボタン（トグル・排他）を置く。ページ離脱時（`visibilitychange` hidden / `pagehide`）に、最大スクロール深さ（整数 %）と可視秒数を engagement として 1 回だけ `keepalive` の fetch で送る。
すべて同意済みのときだけ `client.ts`（openapi-fetch）経由で、`X-Abdoc-Visitor-Id` を付けて呼ぶ。同意状態の変更は、再読み込みせずにボタンと送信可否に反映する（AC8）。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1〜3（トグル・排他） | `tests/reaction.test.ts` + `e2e/reaction.spec.ts` | 緑 |
| AC4（engagement 1 回送信） | `tests/engagement.test.ts` + `e2e/reaction.spec.ts` | 緑 |
| AC5（未同意で API を呼ばない） | `tests/reaction.test.ts`, `tests/engagement.test.ts`, `tests/post-page.test.ts`, `e2e/reaction.spec.ts`, `e2e/posts.spec.ts` | 緑 |
| AC6（初期 GET・aria-pressed・lint） | `tests/reaction.test.ts`, `tests/post-page.test.ts`, `e2e/reaction.spec.ts`, `pnpm lint` | 緑 |
| AC7（API 失敗時に表示を保つ） | `tests/reaction.test.ts`, `tests/engagement.test.ts`, `e2e/reaction.spec.ts` | 緑 |
| AC8（同意の動的反映） | `tests/visitor-consent-change.test.ts`, `tests/reaction.test.ts`, `tests/engagement.test.ts`, `e2e/reaction.spec.ts` | 緑 |

## 計画
- [x] 1. 前提確認（#24 の `visitor.ts`・同意変更の通知手段、#25 の契約と生成物）→ 通知手段が無いので質問 → 案 A で回答
- [x] 1'. `visitor.ts` に `onConsentChange` を追加（案 A）+ `tests/visitor-consent-change.test.ts`
- [x] 2. `reaction.ts` + 単体テスト（AC1〜3, 7）
- [x] 3. `engagement.ts` + 単体テスト（AC4, AC8）
- [x] 4. `ABPost.astro` の接続（AC5, 6, 8）+ `tests/post-page.test.ts`
- [x] 5. e2e `reaction.spec.ts`（AC4, 5, 8）。`posts.spec.ts` の「/api/** を呼ばない」テストを #26 に合わせて更新
- [x] 6. `frontend/AGENTS.md` 更新・PR 本文に手動確認手順

## 進捗ログ（セッションをまたいで追記）
- 2026-11-04 ステップ 1 の前提確認を実施。
  - #25: `contracts/openapi.yaml` に `GET/PUT /api/posts/{slug}/reaction`・`POST /api/posts/{slug}/engagement`・ヘッダー `X-Abdoc-Visitor-Id` があり、仕様と一致（main に取り込み済み）。
  - #24: `frontend/src/lib/visitor.ts` に `visitor()` / `getConsent()` / `setConsent()` / `getVisitorId()` がある。
  - #24: **同意の変更を知らせる手段（カスタムイベントや購読関数）が無い**。`ConsentBanner.astro` は `v.setConsent(choice)` を呼ぶだけで、イベントを出さない。
  - 仕様の取り決め（「#24 に通知手段が無かった場合は手順 1 で止まって質問する」）に従い、ここで停止した。
- 2026-11-04 PR #32 で案 A の回答を受けて再開。ステップ 1'〜6 を実施。`pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e` 緑。

## 意思決定ログ
- 通知手段を足すには #24 の領域（`visitor.ts` または `ConsentBanner.astro`）を変える必要がある。仕様では、#24 の同意の仕組みはスコープ外になっている。このため、推測で進めずに質問した → 案 A（この Issue で `visitor.ts` に最小限の購読関数を足す）。
- Vitest の環境は node（DOM なし）。依存を足さないため、`reaction.ts` / `engagement.ts` は DOM・時刻・可視状態を注入する形にし、DOM へのつなぎ込みは薄く保った（`createReactionView`、`trackEngagement`）。
- 初期 GET が終わる前・失敗したときの件数は「-」と表示し、押下は `myReaction = none` とみなして押せる（AC7: 記事の閲覧は壊さない）。PUT の応答待ちの間の連打は無視する（応答順の入れ替わりを防ぐ）。
- 評価の section は JS 無効時は送れないので `hidden` で出力し、スクリプトが表示する。
- 途中で同意した場合、未送信なら読み込み時からの値を送る。未同意中に hidden になった（送らなかった）後で同意して離脱した場合も、その時点で 1 回送る。
- Playwright は離脱中のページの keepalive リクエストを観測できない（素の fetch でも同じことを確認）。e2e では `pagehide` をページ上で出して検証し、実際の離脱時の動作は単体テストで担保した。
- `e2e/posts.spec.ts` の「記事ページの表示・操作で /api/** を呼ばない」は #26 の AC6/AC8（同意後に GET する）と両立しない。未同意の間は 0 件、同意後は表示中の記事の GET reaction だけ、という形に厳しめに書き換えた（PR 本文に明記）。

## 人間への質問
1. （解決済み）同意の変更を知らせる手段 → 案 A。
2. `frontend/.env.example` が `PUBLIC_API_BASE_URL=/api` だが、契約のパスは `/api/posts/...` から始まるので、そのまま `.env` にすると `/api/api/posts/...` になる。この PR では触っていない（スコープ外）。空にするか、別 Issue で直すか判断してほしい。
