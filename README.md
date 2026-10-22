# Issue 駆動 AI ソフトウェアファクトリー スターターキット

GitHub Issue を **人間と AI の唯一の対話面** にしたファクトリーの最小構成です。
状態は `factory:*` ラベル、対話は Issue/PR コメント、判断は AI、副作用（ラベル・PR 作成）は決定的なスクリプト、
マージは人間、という分担で動きます。プロトコルの全体は `docs/factory/STATE_MACHINE.md` を読んでください。

```
Issue(テンプレート) ─▶ intake(AI分類・仕様案) ─▶ 👤 factory:ready ─▶ build(隔離ランナーで実装)
      ▲                                                                       │
      │ needs-info ◀── 質問                                        Draft PR + 証拠
      │                                                                       ▼
   learn(AGENTS.md/docs/lint 改善PR) ◀── 👤 マージ ◀── review(AI) + heal(CI修復≤2回) + chat(@claude)
```

## ファイル構成
```
.github/
  ISSUE_TEMPLATE/{feature,bug}.yml, config.yml   # 受付フォーム（factory:triage を自動付与）
  CODEOWNERS                                     # 人間のゲートを機械的に強制
  factory/labels.yml                             # 状態・種別・リスク・予算ラベル
  factory/prompts/{intake,build,review,heal,learn}.md   # 各エージェントの手順書（バージョン管理）
  factory/templates/pr-body*.md                  # PR 本文の型（証拠の必須項目）
  workflows/
    factory-labels.yml   ラベル同期（最初に 1 回実行）
    factory-intake.yml   受付: 分類・重複・完全性・仕様案（構造化出力 → スクリプトが反映）
    factory-build.yml    実装: factory:ready で起動、1 Issue = 1 ブランチ = 1 Draft PR
    factory-review.yml   検証: 別コンテキストの AI レビュー（Approve はしない）
    factory-heal.yml     CI 失敗の自動修復依頼（回数制限 → blocked）
    factory-chat.yml     @claude の対話（Issue/PR）。変更依頼はここ
    factory-learn.yml    マージ後にハーネス改善 PR を提案
scripts/factory/
  setup.sh             新しい checkout をテスト可能にする（要書き換え）
  apply-intake.sh      intake の JSON を Issue に反映
  finalize-build.sh    build 後の後始末（PR 保証・ラベル遷移）
docs/factory/STATE_MACHINE.md, state-machine.mmd   # プロトコル仕様
docs/exec-plans/{active,completed}/               # 1 Issue 1 計画ファイル（セッションをまたぐ記憶）
AGENTS.md / CLAUDE.md                              # エージェント向けの地図（120 行以内）
```

## 導入手順

詳細は **`docs/factory/SETUP.md`**（約 1 時間・スモークテスト付き）。要約:

1. キットをブランチに展開して PR を作る
2. Claude GitHub App を https://github.com/apps/claude からインストール（`/install-github-app` が作る `claude.yml` はマージしない）
3. `ANTHROPIC_API_KEY`（または `CLAUDE_CODE_OAUTH_TOKEN`）を Secret に
4. `FACTORY_GITHUB_TOKEN`（Fine-grained PAT か自前 App）を Secret に — `GITHUB_TOKEN` では heal → chat 等の連鎖が起動しないため
5. Variables（任意）と「Allow GitHub Actions to create and approve pull requests」を ON
6. `factory / labels` を 1 回実行してラベルを作る（**必須**）
7. `setup.sh` / `AGENTS.md` / heal の CI 名 / CODEOWNERS / config.yml を書き換えてマージ
8. ブランチ保護（PR 必須・Code Owners・CI 必須・bypass なし・管理者含む）
9. スモークテスト 6 段階（intake → build → review → chat → heal → learn）
10. 最初は `chore / low / s` だけに `factory:ready` を付けて運用開始

## 運用のルール（最初の 90 日）
- 最初は `type:chore` / `risk:low` / `budget:s` だけに `factory:ready` を付ける。信頼が溜まってから広げる。
- Intake の自動化は入っていますが、**ready は必ず人間**。レビューが追いつかないほど PR を作らない。
- 計測: マージされた PR あたりのコスト（Actions ログの `cost_usd`）、リバート率、`heal:*` の発生率、ready → merge の時間。
- 失敗したら「何が欠けていたか（ツール / リンター / ドキュメント / 仕様テンプレ）」を特定し、learn PR で潰す。

## セキュリティの前提
- intake は誰でも起動できる（Issue 本文 = 信頼できない入力）ので、`contents: read` + 参照系ツールのみ。本文の指示には従わない。
- build / chat は write 権限を持つ人間（または許可した bot）だけが起動でき、持つ秘密情報は API キーと GitHub トークンのみ。
- デプロイは別ワークフロー + Environment 保護で行い、エージェントの手が届かない場所に置く。
- 公開リポジトリでは `allowed_non_write_users: "*"` を intake 以外に絶対に付けない。

## 他ベンダーのエージェントへの差し替え
状態機械・ラベル・プロンプト・スクリプトはベンダー中立です。`anthropics/claude-code-action` のステップを
Codex / Copilot coding agent / 自前の Agent SDK ランナーに置き換えても、Issue 側の契約は変わりません。
