# Issue #5: [chore] フロントエンドの雛形（frontend）
## 仕様（確定版の要約）
`frontend/` に Astro 7（static output）+ pnpm + TypeScript strict の雛形を作る。
`typecheck` / `lint` / `test` / `build`（＋分離した `e2e`）が通り、トップページ 1 枚（タイトル「ABDOC」）のみ。
人間の回答: タイトルは「ABDOC」/ スタイルは素の CSS / Node 24 / Astro 7 が無ければ最新安定版。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1 setup.sh fe が通る・lockfile | `pnpm install --frozen-lockfile`（setup.sh の中身）/ `frontend/pnpm-lock.yaml` | 緑（setup.sh そのものはエージェント環境で実行不可。CI で確認） |
| AC2 4 script が通る | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | 緑 |
| AC3 トップに「ABDOC」 | `e2e/top.spec.ts` | 緑 |
| AC4 ユニット 1 + E2E 1 | `tests/index.test.ts` / `e2e/top.spec.ts` | 緑 |
| AC5 strict + a11y lint | `tsconfig.json` / `tests/eslint-a11y.test.ts` | 緑 |
| AC6 PUBLIC_API_BASE_URL | `src/env.d.ts` / `.env.example` / `pnpm typecheck` | 緑 |
| AC7 AGENTS.md 書き換え | 記載コマンドを実行して確認 | 緑 |
| AC8 README | 目視 | 緑 |
| AC9 CI / web 緑 | PR のチェック | PR で確認 |

## 計画
- [x] 1. exec-plan 作成
- [x] 2. Astro 最小プロジェクト + トップページ + lockfile
- [x] 3. ESLint（a11y）と typecheck/lint/build script
- [x] 4. Vitest + Container API のテスト
- [x] 5. Playwright E2E
- [x] 6. README / AGENTS.md / .env.example
- [ ] 7. CI 確認・Draft PR

## 進捗ログ（セッションをまたいで追記）
- 2026-10-22 ステップ1〜6 完了（1: 174906e / 2: 4eb3631 / 3: 1956ee3 / 4: 46e128b / 5: d65ac1f + 3e42574 / 6: 9004a80）。ローカルで typecheck/lint/test/build/e2e すべて緑（Node 22.23.4 で実行）。
  - d65ac1f は `playwright.config.ts` の `process` 型エラーを含んだままコミットしてしまい、3e42574 で `@types/node` を追加して修正（同じメッセージの 2 コミット）。

## 意思決定ログ
- タイトルは人間の回答に従い「ABDOC」（`<title>` と `<h1>`）。
- Astro 7.4.2 が取得可能なのでそれを使う。
- `eslint-plugin-jsx-a11y` は ESLint 10 を peer に含まないため、eslint-plugin-astro が公式に対応する `eslint-plugin-jsx-a11y-x` を使う。
- `@astrojs/check` が TypeScript ^5 || ^6 のみ対応のため TypeScript 6 を使う（7 ではない）。
- Astro 7 の `astro dev` はエージェント検知で自動バックグラウンド化するので、Playwright webServer は `astro dev --ignore-lock` で起動する。
- `.github/workflows/ci-web.yml` は Node 22 固定。エージェントはワークフローを編集できないため変更していない（人間への質問 #1）。

- 2026-10-23 人間の回答: (1) `ci-web.yml` を `node-version-file: "frontend/.nvmrc"` に変更済み（main の bf802a2, #12）。(2) CI への E2E 追加は別 Issue で対応する。

## 人間への質問
1. ~~`ci-web.yml` の `node-version: "22"` を `node-version-file: "frontend/.nvmrc"`（= 24）に変えてください。~~ → 回答: 変更済み（bf802a2）
2. ~~`ci-web.yml` は `pnpm e2e` を実行しません。E2E を CI に入れるかは別 Issue でよいですか。~~ → 回答: 別 Issue でよい
