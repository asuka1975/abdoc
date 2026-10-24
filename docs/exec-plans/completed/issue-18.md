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
| AC1 未保存・抽選 A → A 表示・保存 | `tests/variant.test.ts`（assignVariant / applyVariant）/ `e2e/posts.spec.ts` AC1 | 緑 |
| AC2 未保存・抽選 B → B 表示 | `tests/variant.test.ts` / `e2e/posts.spec.ts` AC2 | 緑 |
| AC3 保存済みは乱数・ratio に関係なく同じ版 | `tests/variant.test.ts` / `e2e/posts.spec.ts` AC3 ×2 | 緑 |
| AC4 記事ごとに独立 | `tests/variant.test.ts` / `e2e/posts.spec.ts` AC4 | 緑 |
| AC5 ratio 境界・省略・0・1 | `tests/variant.test.ts`（pickVariant / parseRatio）/ `tests/post-schema.test.ts` / e2e AC5 | 緑 |
| AC6 不正 ratio / b.md の ratio はエラー | `tests/post-schema.test.ts` + 手動で `b.md` に `ratio` を入れて `astro sync` が InvalidContentEntryDataError になることを確認 | 緑 |
| AC7 `/api/**` へリクエストなし | `e2e/posts.spec.ts` AC7 | 緑 |
| AC8 両版が HTML に含まれ ratio が data-* に出る | `tests/post-page.test.ts`（Container API）+ `pnpm build`（`/posts/welcome/`・`/posts/getting-started/` を生成、`data-ratio="0.7"`） | 緑 |
| AC9 localStorage 不可でも片方だけ表示 | `tests/variant.test.ts` AC9 ×2 | 緑 |

## 計画
- [x] 1. `src/lib/variant.ts`（抽選・記事ごとの保存）と単体テスト
- [x] 2. Content Collection（`ratio` スキーマ）とサンプル記事 2 本
- [x] 3. 記事ページ `src/pages/posts/[slug].astro` と Container テスト
- [x] 4. e2e テスト
- [x] 5. `frontend/AGENTS.md` の構成欄を更新
- [x] 6. 最終確認・Draft PR

## 進捗ログ（セッションをまたいで追記）
- 2026-10-23 ステップ1〜4 完了（8d224bf, 5618561, d2a3f0d, 6eb8329）。typecheck / lint / test（36）/ build / e2e（9）緑（Node 24.21.0）。
- 2026-10-23 ステップ5 完了。Draft PR 作成。

## 意思決定ログ
- `b.md` の `ratio` をビルドエラーにするため、コレクションを `postsA`（`*/a.md`）と `postsB`（`*/b.md`）に分け、別スキーマにした。ID は `generateId` で `<slug>` にそろえる。B のスキーマは `ratio: z.never().optional()`。
- スキーマは `src/lib/post-schema.ts` に置いた（仕様の影響範囲では `variant.ts` に含める想定）。`variant.ts` はクライアントへバンドルされるので、zod を持ち込まないため分離した。
- frontmatter に `title`（必須）を追加した。各版の `<h1>` と、表示した版に合わせた `document.title` に使う。仕様に明記は無い。
- ページ本体を `src/components/ABPost.astro`（影響範囲外の新規ファイル）に切り出した。Vitest では content layer のストアが読まれず `getCollection` が空になるため、Container API でテストできる単位にした。Markdown の描画は `.md` の直接 import（Astro の Markdown パイプライン）で検証する。
- `a.md` / `b.md` の片方しか無い記事は `getStaticPaths` でビルドエラーにする（仕様に無いが、黙って記事が欠けるのを防ぐ）。
- 表示した版の判定と保存は `<script>`（モジュール、Astro がバンドル）で行う。両版とも `hidden` で出すため、誤った版がちらつかない。

## 人間への質問
なし
