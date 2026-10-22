# AGENTS.md — このリポジトリの地図（エージェント向け・120 行以内を維持）

<!-- 詳細はここに書かず docs/ へ。ここは「どこを読めばよいか」と「破ってはいけないこと」だけ。 -->

## このリポジトリ
- 何のシステムか: **（1〜2 行で書く）**
- 全体像: `docs/ARCHITECTURE.md`
- 進行中の作業計画: `docs/exec-plans/active/`（1 Issue 1 ファイル）/ 完了: `docs/exec-plans/completed/`
- ファクトリーの約束事（ラベル・コメント・ゲート）: `docs/factory/STATE_MACHINE.md`

## セットアップと検証コマンド（エージェントはこれだけ使う）
| 目的 | コマンド |
|---|---|
| 環境構築 | `bash scripts/factory/setup.sh` |
| テスト | `（例: npm test / pytest -q）` |
| 特定テスト | `（例: npm test -- path/to/file.test.ts）` |
| リント・型 | `（例: npm run lint && npm run typecheck）` |
| E2E | `（例: npm run e2e）` |
| ローカル起動 | `（例: npm run dev → http://localhost:3000）` |

## レイヤーと依存の向き（違反はリンターで落ちる）
`types → config → repository → service → runtime → ui`。逆方向の import は禁止。
横断関心事（認証・ログ・フラグ）は `providers/` 経由のみ。詳細: `docs/ARCHITECTURE.md#layers`

## 破ってはいけないこと（不変条件）
1. テストを削除・skip・緩めて CI を通さない。通せないなら止まって質問する。
2. 受け入れ基準ごとにテストを書く。テストが無い変更はマージされない。
3. 仕様（Issue の `<!-- factory:spec -->` コメント）の外側を変えない。必要なら PR 本文で理由を明示。
4. 依存の追加は PR 本文に package/version/理由を書く。ロックファイルを手で編集しない。
5. 秘密情報・環境依存値をコードに書かない。`.env.example` を更新する。
6. 公開 API / DB スキーマ / 認証・決済 を触る変更は `risk:high`。ロールバック手順を PR に書く。
7. `factory:*` ラベルを自分で付け替えない（ワークフローと人間の仕事）。

## 作業の型
- 着手前に `docs/exec-plans/active/issue-<N>.md` を作り、ステップ完了ごとに更新・コミットする。
- 1 ステップ = 1 コミット（`feat(#N): …` / `fix(#N): …` / `test(#N): …`）。
- 完了の定義: 受け入れ基準が全てテストで緑 + リント/型が緑 + PR 本文に検証方法と証拠。
- 迷ったら推測せず「人間への質問」に書く。質問は番号付き・最大 5 個。

## よくある失敗と対策（learn エージェントが追記する）
- （例）`setup.sh` が Node のバージョン違いで失敗 → `.nvmrc` を参照するよう修正済み
- …

## 読む順番
1. この AGENTS.md → 2. Issue の仕様コメント → 3. `docs/exec-plans/active/issue-<N>.md` → 4. 影響範囲のコードとテスト
