# AGENTS.md — フロントエンド（`frontend/`）

<!-- 一般論は書かない。このディレクトリ固有のコマンド・境界・禁止事項だけ。 -->

## コマンド（このディレクトリで実行）
| 目的 | コマンド |
|---|---|
| 依存 | `pnpm install --frozen-lockfile`（ルートからは `bash scripts/factory/setup.sh fe`） |
| 開発サーバ | `pnpm dev`（http://localhost:4321） |
| 単体テスト | `pnpm test`（Vitest。`tests/**/*.test.ts`） |
| 特定テスト | `pnpm test tests/index.test.ts` |
| 型・リント | `pnpm typecheck && pnpm lint`（`astro check` / `eslint .`） |
| E2E | `pnpm e2e`（Playwright。`e2e/**/*.spec.ts`。dev サーバを自動起動） |
| ビルド | `pnpm build`（`dist/` に静的出力） |

## 構成と境界
- フレームワーク: Astro 7（`output: "static"`）/ TypeScript strict（`astro/tsconfigs/strict`）/ Node 24 / pnpm 10（`packageManager` で固定）
- `src/pages/` ルーティング（`index.astro`、記事 `posts/[slug].astro`）。
- A/B 記事: `src/content/posts/<slug>/{a,b}.md` → `/posts/<slug>/`。コレクションは `src/content.config.ts`（`postsA` / `postsB`、スキーマは `src/lib/post-schema.ts`）。比率は `a.md` の `ratio`（0〜1、省略時 0.5）だけに書く（`b.md` に書くとビルドエラー）。
  - 両版を `src/components/ABPost.astro` が `hidden` で出力し、クライアントの `src/lib/variant.ts` が `localStorage` の `abdoc:variant:<slug>` で記事ごとに割り当てを固定する。zod はクライアントに持ち込まない（`variant.ts` から `post-schema.ts` を import しない）。
  - Vitest からは `getCollection` が空になる。ページは Container API でなく `ABPost.astro` + `.md` の直接 import でテストする（`tests/post-page.test.ts`）。
- `src/env.d.ts` 公開環境変数の型。API のベース URL は `import.meta.env.PUBLIC_API_BASE_URL` でのみ参照する。
- `tests/` Vitest。`.astro` は Astro Container API（`astro/container`）でレンダリングして検証する。
- `e2e/` Playwright（chromium のみ）。
- スタイル: 素の CSS（`.astro` の scoped `<style>`）。CSS フレームワークは入れていない。
- リント: `eslint.config.js` = typescript-eslint strict + eslint-plugin-astro recommended + `jsx-a11y-strict`（実体は `eslint-plugin-jsx-a11y-x`）。a11y ルールが効いていることは `tests/eslint-a11y.test.ts` が守る。

## 禁止・注意
- 新しい公開環境変数は `PUBLIC_` 接頭辞を付け、`src/env.d.ts` と `.env.example` を同時に更新する。
- `src/api/generated/` は `contracts/openapi.yaml` からの生成物（`make generate`）。手で編集しない。API は `src/api/client.ts` の `createApiClient` 経由で呼ぶ。
- `any` と `@ts-ignore` を足さない。必要なら「人間への質問」に書く。
- `eslint-plugin-jsx-a11y` は ESLint 10 未対応。差し替えない（`-x` フォークを使う）。
- Astro 7 の `astro dev` はエージェント実行を検知すると自動でバックグラウンド化する（止めるのは `pnpm exec astro dev stop`）。`playwright.config.ts` の webServer はそれを避けるため `--ignore-lock` を付けている。外さない。

## 検証の証拠（PR 本文に書くもの）
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` の結果。
- 画面を変えたら `pnpm e2e` の結果（必要なら Playwright のトレースかスクリーンショット）。
