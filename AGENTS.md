# AGENTS.md — モノレポの地図（エージェント向け・100 行以内を維持）

<!-- ここは「どこを読めばよいか」と「全領域共通の不変条件」だけ。領域固有のことは各ディレクトリの AGENTS.md へ。 -->

## このリポジトリ
- 何のシステムか: **（1〜2 行で書く）**
- ファクトリーの約束事（ラベル・コメント・ゲート）: `docs/factory/STATE_MACHINE.md`
- 進行中の作業計画: `docs/exec-plans/active/`（1 Issue 1 ファイル）/ 完了: `docs/exec-plans/completed/`

## 領域（Issue の `area:*` ラベルに対応）
| area | ディレクトリ | 最初に読むもの | セットアップ |
|---|---|---|---|
| `fe` | `frontend/` | `frontend/AGENTS.md` | `bash scripts/factory/setup.sh fe` |
| `be` | `backend/` | `backend/AGENTS.md` | `bash scripts/factory/setup.sh be` |
| `infra` | `.github/`, `infra/`, `contracts/`, ルートの設定 | この AGENTS.md | `bash scripts/factory/setup.sh infra` |
| `fullstack` | 両方 | 契約 → BE → FE の順に両方 | `bash scripts/factory/setup.sh all` |

**作業する領域の AGENTS.md を必ず先に読む。** 他領域のファイルは、仕様に明記が無い限り触らない。

## FE と BE の契約
- API の正は `contracts/`（OpenAPI など。無ければ BE のハンドラ定義）。**生成物（型・クライアント）は手で編集しない**。契約を変えて再生成する。
- 契約を変える変更は `risk:medium` 以上。FE と BE の両方のテストを通す。
- 後方互換を壊す変更（フィールド削除・型変更）は PR 本文に移行手順を書く。

## 全領域共通の不変条件
1. テストを削除・skip・緩めて CI を通さない。通せないなら止まって質問する。
2. 受け入れ基準ごとにテストを書く。テストが無い変更はマージされない。
3. 仕様（Issue の `<!-- factory:spec -->` コメント）の外側を変えない。必要なら PR 本文で理由を明示。
4. 依存の追加は PR 本文に package/version/理由を書く。ロックファイルを手で編集しない。
5. 秘密情報・環境依存値をコードに書かない。`.env.example` を更新する。
6. 認証・決済・DB スキーマ・公開 API・IaC を触る変更は `risk:high`。ロールバック手順を PR に書く。
7. `factory:*` / `area:*` ラベルを自分で付け替えない（ワークフローと人間の仕事）。

## 作業の型
- 着手前に `docs/exec-plans/active/issue-<N>.md` を作り、ステップ完了ごとに更新・コミットする。
- 1 ステップ = 1 コミット（`feat(#N): …` / `fix(#N): …` / `test(#N): …`）。
- 完了の定義: 受け入れ基準が全てテストで緑 + リント/型が緑 + PR 本文に検証方法と証拠。
- 迷ったら推測せず「人間への質問」に書く。質問は番号付き・最大 5 個。

## よくある失敗と対策（learn エージェントが追記する）
- …

## 読む順番
1. この AGENTS.md → 2. 領域の AGENTS.md → 3. Issue の仕様コメント → 4. `docs/exec-plans/active/issue-<N>.md` → 5. 影響範囲のコードとテスト
