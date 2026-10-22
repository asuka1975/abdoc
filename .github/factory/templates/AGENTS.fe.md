# AGENTS.md — フロントエンド（`{{DIR}}/`）

<!-- 一般論は書かない。このディレクトリ固有のコマンド・境界・禁止事項だけ。 -->

## コマンド（このディレクトリで実行）
| 目的 | コマンド |
|---|---|
| 依存 | `pnpm install --frozen-lockfile` |
| 開発サーバ | `pnpm dev`（http://localhost:3000） |
| 単体テスト | `pnpm test` |
| 特定テスト | `pnpm test -- src/path/to/file.test.tsx` |
| 型・リント | `pnpm typecheck && pnpm lint` |
| E2E | `pnpm e2e`（Playwright。BE はモック or `pnpm dev:mock`） |
| ビルド | `pnpm build` |

## 構成と境界
- フレームワーク: **（例: Next.js 15 App Router / React 19 / TypeScript strict）**
- `src/app/` ルーティングのみ。ロジックは `src/features/<domain>/` に置く。
- API 呼び出しは `src/api/`（契約から生成したクライアント）経由のみ。`fetch` を直接書かない。
- 状態管理: **（例: TanStack Query をサーバ状態に、Zustand を UI 状態に）**
- スタイル: **（例: Tailwind。インライン style は禁止）**

## 禁止・注意
- `src/api/generated/` は手で編集しない（`pnpm generate:api` で再生成）。
- 新しい UI コンポーネントは既存のデザインシステム（`src/components/ui/`）を使う。独自に色やサイズを決めない。
- `any` と `@ts-ignore` を足さない。必要なら「人間への質問」に書く。
- アクセシビリティ: インタラクティブ要素にラベル、キーボード操作可、`eslint-plugin-jsx-a11y` を通す。

## 検証の証拠（PR 本文に書くもの）
- 変更した画面のスクリーンショット（before/after）、または Playwright のトレース。
- `pnpm build` が通ること（型エラーは build で止まる）。
