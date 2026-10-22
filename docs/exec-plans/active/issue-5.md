# Issue #5: [chore] フロントエンドの雛形（frontend）
## 仕様（確定版の要約）
`frontend/` に Astro 7（static output）+ pnpm + TypeScript strict の雛形を作る。
`typecheck` / `lint` / `test` / `build`（＋分離した `e2e`）が通り、トップページ 1 枚（タイトル「ABDOC」）のみ。
人間の回答: タイトルは「ABDOC」/ スタイルは素の CSS / Node 24 / Astro 7 が無ければ最新安定版。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1 setup.sh fe が通る・lockfile | `bash scripts/factory/setup.sh fe` | 未 |
| AC2 4 script が通る | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | 未 |
| AC3 トップに「ABDOC」 | `e2e/top.spec.ts` | 未 |
| AC4 ユニット 1 + E2E 1 | `tests/index.test.ts` / `e2e/top.spec.ts` | 未 |
| AC5 strict + a11y lint | `tsconfig.json` / `eslint.config.js` + `pnpm lint` | 未 |
| AC6 PUBLIC_API_BASE_URL | `src/env.d.ts` / `.env.example` / `pnpm typecheck` | 未 |
| AC7 AGENTS.md 書き換え | レビュー | 未 |
| AC8 README | レビュー | 未 |
| AC9 CI / web 緑 | PR のチェック | 未 |

## 計画
- [ ] 1. exec-plan 作成
- [ ] 2. Astro 最小プロジェクト + トップページ + lockfile
- [ ] 3. ESLint（a11y）と typecheck/lint/build script
- [ ] 4. Vitest + Container API のテスト
- [ ] 5. Playwright E2E
- [ ] 6. README / AGENTS.md / .env.example
- [ ] 7. CI 確認・Draft PR

## 進捗ログ（セッションをまたいで追記）
- 2026-10-22 ステップ1 開始。

## 意思決定ログ
- タイトルは人間の回答に従い「ABDOC」（`<title>` と `<h1>`）。
- Astro 7.4.2 が取得可能なのでそれを使う。

## 人間への質問
（なし）
