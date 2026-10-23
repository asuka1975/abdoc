# Issue #18: [feat] フロントエンドでMarkdown形式のA/Bの記事をどちらか表示する

## 仕様（確定版の要約）
`src/content/posts/<slug>/{a,b}.md` を `/posts/<slug>/` の 1 ページに両方描画し（初期は両方 `hidden`）、
クライアントスクリプトが訪問者 × 記事ごとに A/B を決めて片方だけ表示する。
比率は `a.md` の frontmatter `ratio`（0〜1、省略時 0.5、`r < ratio` なら A）。`b.md` に `ratio` があればビルドエラー。
割り当ては `localStorage` の `abdoc:variant:<slug>` に `A`/`B` で保存し、保存済みなら比率に関係なく再表示。
不正値は未保存扱い。`localStorage` が使えなければメモリで動く。JS 無効時は `<noscript>` で A を表示。
バックエンドへは何も送らない。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1 未保存・抽選 A → A 表示・保存 | `tests/variant.test.ts` / `e2e/posts.spec.ts` | 未 |
| AC2 未保存・抽選 B → B 表示 | `tests/variant.test.ts` / `e2e/posts.spec.ts` | 未 |
| AC3 保存済みは乱数・ratio に関係なく同じ版 | `tests/variant.test.ts` / `e2e/posts.spec.ts` | 未 |
| AC4 記事ごとに独立 | `tests/variant.test.ts` / `e2e/posts.spec.ts` | 未 |
| AC5 ratio 境界・省略・0・1 | `tests/variant.test.ts` | 未 |
| AC6 不正 ratio / b.md の ratio はエラー | `tests/post-schema.test.ts` | 未 |
| AC7 `/api/**` へリクエストなし | `e2e/posts.spec.ts` | 未 |
| AC8 両版が HTML に含まれ ratio が data-* に出る | `tests/post-page.test.ts`（Container API）+ `pnpm build` | 未 |
| AC9 localStorage 不可でも片方だけ表示 | `tests/variant.test.ts` | 未 |

## 計画
- [ ] 1. `src/lib/variant.ts`（抽選・記事ごとの保存）と単体テスト
- [ ] 2. Content Collection（`ratio` スキーマ）とサンプル記事 2 本
- [ ] 3. 記事ページ `src/pages/posts/[slug].astro` と Container テスト
- [ ] 4. e2e テスト
- [ ] 5. `frontend/AGENTS.md` の構成欄を更新
- [ ] 6. 最終確認・Draft PR

## 進捗ログ（セッションをまたいで追記）
- 2026-10-23 exec-plan 作成。

## 意思決定ログ

## 人間への質問
