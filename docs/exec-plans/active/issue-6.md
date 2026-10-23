# Issue #6: [chore] FE/BE 契約（contracts/openapi.yaml）と生成パイプライン

## 仕様（確定版の要約）
`contracts/openapi.yaml`（OpenAPI 3.1, `GET /healthz` → `200 {"status":"ok"}`、`operationId: getHealthz`、スキーマ `Health`）を FE/BE 共通の正とし、
`make generate`（= `scripts/generate.sh`）で Go サーバインターフェース（oapi-codegen, chi）と TS 型・クライアント（openapi-typescript + openapi-fetch）を生成する。
CI で再生成差分ゼロを検証する。業務 API・認証はスコープ外。
人間の回答: #4/#5 マージ後に着手 / Make と scripts/generate.sh の両方を用意 / バージョンは #4 #5 の決定（Go 1.27, Node 24, pnpm 10）に従う。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1 openapi.yaml (3.1) に GET /healthz | `make generate` 成功（両ツールが入力を解析） | 未 |
| AC2 BE に Go サーバインターフェース生成 | 生成ファイル存在 + `go build ./...` | 未 |
| AC3 FE `src/api/generated/` に型とクライアント | 生成ファイル存在 + `pnpm typecheck` | 未 |
| AC4 再生成で差分なし | `make generate && git diff --exit-code`（ローカル）、CI ステップ | 未 |
| AC5 /healthz が ServerInterface を実装 | `var _ api.ServerInterface = ...` + `TestHealthz*` | 未 |
| AC6 FE 生成クライアントで /healthz（fetch モック） | `frontend/tests/api-client.test.ts` | 未 |
| AC7 ルート AGENTS.md 契約節 | 目視 | 未 |
| AC8 CI / web, CI / api 緑 | PR のチェック | 未 |

## 計画
- [x] 0. exec-plan 作成
- [ ] 1. 契約 `contracts/openapi.yaml`
- [ ] 2. 生成パイプライン `Makefile` / `scripts/generate.sh`
- [ ] 3. BE: oapi-codegen（go tool で固定）・生成物・ハンドラが ServerInterface を実装・テスト
- [ ] 4. FE: openapi-typescript / openapi-fetch・生成物・クライアント・テスト
- [ ] 5. CI: 生成差分チェック
- [ ] 6. ルート AGENTS.md 更新
- [ ] 7. 最終確認・Draft PR

## 進捗ログ（セッションをまたいで追記）

## 意思決定ログ

## 人間への質問
