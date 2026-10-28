# Issue #24: [feat] 訪問者 ID・決定論的な A/B 割り当て・Cookie 同意バナー・プライバシーポリシー

## 仕様（確定版の要約）
- 同意（`localStorage` の `abdoc:consent` = `granted` / `denied`）したときだけ、訪問者 ID を Cookie `abdoc_vid`
  （`Path=/; Secure; SameSite=Lax; Max-Age=31536000`、`HttpOnly` なし）に保存する。
- 未同意・拒否のときは、ページを表示している間だけ一時 ID（`crypto.randomUUID()`）をメモリに持って版を決める。
  同意した時点でその一時 ID を Cookie に保存するので、表示中の版は変わらない。
- 同意済みで Cookie が無い（期限切れ）なら新しい ID を作って保存する。
- 割り当て: `FNV-1a32("<visitorId>:<slug>") / 2^32 < ratio` なら A、それ以外は B。`abdoc:variant:*` は使わない。
- 共通 Layout（バナー＋フッター）を作り、全ページに載せる。`/privacy/` を追加（運営者名・問い合わせ先は `TODO`）。
- `src/lib/visitor.ts` は「同意済みなら訪問者 ID、そうでなければ `null`」を返す `getVisitorId()` を公開する。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1 同じ ID+slug は同じ版、1 万件で ratio ±2% | `tests/variant.test.ts` / `e2e/posts.spec.ts` | 緑 |
| AC2 未同意/拒否で Cookie なし、同意で属性付き Cookie・版不変 | `tests/visitor.test.ts` / `e2e/consent.spec.ts` | 緑 |
| AC3 選択が保存されバナーが出ない、フッターから選び直し | `tests/consent.test.ts` / `tests/visitor.test.ts` / `e2e/consent.spec.ts` | 緑 |
| AC4 `/privacy/` が表示でき、バナーからリンク | `tests/privacy-page.test.ts` / `e2e/consent.spec.ts` / `pnpm lint` | 緑 |
| AC5 `getVisitorId()` が同意済みなら ID、それ以外は `null` | `tests/visitor.test.ts` | 緑 |
| AC6 同意済みで Cookie 無しなら新 ID を作って保存 | `tests/visitor.test.ts` | 緑 |
| AC7 `abdoc:variant:*` 廃止、既存テストを書き換え | `tests/variant.test.ts` / `tests/post-page.test.ts` / `e2e/posts.spec.ts` | 緑 |

## 計画
- [x] 1. `variant.ts` を FNV-1a32 の割り当てに置き換え、`variant.test.ts` を書き換え（AC1, AC7）
- [x] 2. `visitor.ts`（同意状態・一時 ID・Cookie・`getVisitorId()`・期限切れ再発行）と単体テスト（AC2, AC5, AC6）
- [x] 3. 共通 Layout + `ConsentBanner` + フッター、`index` を Layout 化（AC3, D2）
- [x] 4. `ABPost.astro` を Layout と訪問者 ID につなぐ、既存テスト書き換え（AC2, AC7）
- [x] 5. `/privacy/` ページ（AC4, D3）
- [x] 6. e2e（`consent.spec.ts`・`posts.spec.ts`）と `frontend/AGENTS.md` 更新

## 進捗ログ（セッションをまたいで追記）
- 2026-10-28 exec-plan 作成（4311126）。
- 2026-10-28 ステップ1 完了（fd73853）。型を緑に保つため、ABPost は暫定で一時 ID を使った。
- 2026-10-28 ステップ2 完了（589bb48）。
- 2026-10-28 ステップ3 完了（4e2f149）。
- 2026-10-28 ステップ4 完了（9c9382a）。`e2e/posts.spec.ts` の書き換えもここ。
- 2026-10-28 ステップ5 完了（ca789ad）。
- 2026-10-28 ステップ6 完了（952e2c2）。typecheck / lint / test（60 件）/ build / e2e（17 件）すべて緑。

## 意思決定ログ
- 同意から拒否に選び直したら `abdoc_vid` を `Max-Age=0` で消す（「拒否時は Cookie を書かない」に合わせた）。表示中の版は変えない。
- 拒否済みのときは、残っている `abdoc_vid` があっても読まない。
- `Visitor` はモジュール変数でなく `globalThis[Symbol.for("abdoc:visitor")]` に持つ。記事とバナーのスクリプトが別々にバンドルされても一時 ID を共有するため。
- `crypto.randomUUID` が無い環境（http の非 localhost）では `crypto.getRandomValues` で v4 UUID を作る（依存の追加なし）。
- 同意バナーは `hidden` で出力し、未選択のときだけスクリプトが出す。JS 無効時はバナーも Cookie も出さない。フッターの「Cookie の設定」も JS が有効なときだけ出す。
- 既存テストの書き換え: `variant.test.ts` の `storageKey` / `createVariantStore` / 乱数を注入する `assignVariant` のテストは、FNV-1a32 と決定論的な `assignVariant` のテストに置き換えた。`localStorage` が例外を投げるケースは `visitor.test.ts` に移した。`posts.spec.ts` は `Math.random` の固定を「同意済み + `abdoc_vid` Cookie」の固定に置き換えた。

## 人間への質問
- なし（`/privacy/` の運営者名・問い合わせ先の `TODO` は D3 のとおり PR で埋める）
