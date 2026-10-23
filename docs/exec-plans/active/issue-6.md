# Issue #6: [chore] FE/BE 契約（contracts/openapi.yaml）と生成パイプライン

## 仕様（確定版の要約）
`contracts/openapi.yaml`（OpenAPI 3.1, `GET /healthz` → `200 {"status":"ok"}`、`operationId: getHealthz`、スキーマ `Health`）を FE/BE 共通の正とし、
`make generate`（= `scripts/generate.sh`）で Go サーバインターフェース（oapi-codegen, chi）と TS 型・クライアント（openapi-typescript + openapi-fetch）を生成する。
CI で再生成差分ゼロを検証する。業務 API・認証はスコープ外。
人間の回答: #4/#5 マージ後に着手 / Make と scripts/generate.sh の両方を用意 / バージョンは #4 #5 の決定（Go 1.27, Node 24, pnpm 10）に従う。

## 受け入れ基準 → テストの対応表
| AC | テスト | 状態 |
|---|---|---|
| AC1 openapi.yaml (3.1) に GET /healthz | `make generate` 成功（oapi-codegen / openapi-typescript の両方が入力を解析） | 緑 |
| AC2 BE に Go サーバインターフェース生成 | `backend/internal/transport/http/api/api.gen.go` + `go build ./...` | 緑 |
| AC3 FE `src/api/generated/` に型 | `frontend/src/api/generated/schema.ts` + `astro check` | 緑 |
| AC4 再生成で差分なし | ローカルで `make generate` 後 `git status` 差分なし。CI ステップは人間が追加（質問 #1） | ローカル緑 / CI 未 |
| AC5 /healthz が ServerInterface を実装 | `var _ api.ServerInterface = server{}` + `TestHealthzImplementsGeneratedInterface`, `TestHealthz*` | 緑 |
| AC6 FE 生成クライアントで /healthz（fetch モック） | `frontend/tests/api-client.test.ts` | 緑 |
| AC7 ルート AGENTS.md 契約節 | 目視 | 済 |
| AC8 CI / web, CI / api 緑 | PR のチェック | PR で確認 |

## 計画
- [x] 0. exec-plan 作成
- [x] 1. 契約 `contracts/openapi.yaml`
- [x] 2. 生成パイプライン `Makefile` / `scripts/generate.sh`
- [x] 3. BE: oapi-codegen（go tool で固定）・生成物・ハンドラが ServerInterface を実装・テスト
- [x] 4. FE: openapi-typescript / openapi-fetch・生成物・クライアント・テスト
- [ ] 5. CI: 生成差分チェック — エージェントは `.github/workflows/` を編集できないため PR 本文に差分を提示（人間への質問 #1）
- [x] 6. ルート AGENTS.md 更新（+ backend/frontend AGENTS.md の該当行）
- [x] 7. 最終確認・Draft PR

## 進捗ログ（セッションをまたいで追記）
- 2026-10-23 ステップ0〜4, 6 完了（afe671e, 33c8ea0, 57b7e4c, 98ffb6e, a3cf4fd, 5db412b）。
  BE: gofmt/vet/build/`test -race` 緑。FE: `astro check`・`astro build`（Node 24.22.1）・lint・test 緑。`make generate` 再実行で差分なし。

## 意思決定ログ
- 生成ツールは PRODUCT.md に指定が無いため既定の oapi-codegen v2.8.0（chi-server + models）+ openapi-typescript 7.13.0 + openapi-fetch 0.17.0。oapi-codegen v2.8.0 は OpenAPI 3.1 の本契約を処理できることを確認。
- oapi-codegen は `go.mod` の `tool` ディレクティブ（Go 1.24+）で版を固定し `go tool oapi-codegen` で実行（tools.go 不要）。
- openapi-fetch は実行時ライブラリで「生成」はされないため、`src/api/generated/` には openapi-typescript の型（`schema.ts`）のみを置き、クライアントは `src/api/client.ts`（`createClient<paths>` の薄いラッパ）にした。
- CI はジョブごとに Go / Node の片方しか入らないため、`scripts/generate.sh be|fe` で片側だけ生成できるようにした（`make generate-be` / `generate-fe`）。
- `/healthz` の応答は `json.Marshal(api.Health{...})` で生成型から作る（既存テストの厳密なボディ `{"status":"ok"}` を維持）。
- openapi-typescript 7.13.0 は peer に `typescript@^5` を要求するが、本リポジトリは TS 6.0.3。生成は問題なく動作（警告のみ）。

## 人間への質問
1. `ci-api.yml` / `ci-web.yml` に生成差分チェックを追加してください（エージェントは workflows を編集できません。差分は PR 本文）。
