# Issue 駆動 AI ソフトウェアファクトリー スターターキット（モノレポ FE + BE 対応）

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
  factory/labels.yml                             # 状態・種別・領域・リスク・予算ラベル
  factory/templates/AGENTS.{fe,be}.md            # 領域別 AGENTS.md の雛形（init が配置）
  factory/templates/ci-{web,api}.yml.example     # CI が無いときの最小 CI（コードが無い間はスキップして緑）
  factory/templates/PRODUCT.md, AGENTS.greenfield.md, bootstrap/issue-*.md   # グリーンフィールド用
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
  init-monorepo.sh     FE/BE ディレクトリ・CI 名・owner を 1 回渡して初期化（コードが無ければスタブ AGENTS.md）
  bootstrap-issues.sh  グリーンフィールド: docs/PRODUCT.md（--product-only）→ 雛形 Issue 3 件
  doctor.sh            導入の検査（PASS/WARN/FAIL）
  setup.sh             領域別（fe|be|infra|all）に素の checkout をテスト可能にする
  detect-area.sh       PR の変更ファイルから領域を判定（chat が使う）
  apply-intake.sh      intake の JSON を Issue に反映
  finalize-build.sh    build 後の後始末（PR 保証・ラベル遷移）
docs/factory/STATE_MACHINE.md, SETUP.md, review-{fe,be}.md   # プロトコル仕様・導入手順・領域別レビュー観点
docs/exec-plans/{active,completed}/               # 1 Issue 1 計画ファイル（セッションをまたぐ記憶）
AGENTS.md / CLAUDE.md                              # ルートの地図（領域表 + 共通不変条件）。領域ごとに <dir>/AGENTS.md
```

## 導入手順

**`docs/factory/SETUP.md`** を参照（最短ルート 6 ステップ・約 30 分）:
展開 → App と Secret → マージ（ラベル自動同期）→ `scripts/factory/init-monorepo.sh <FE_DIR> <BE_DIR> "<CI FE名>" "<CI BE名>" <OWNER>` → 領域 AGENTS.md の数行 → Issue を 1 件。
**コードがまだ無い（グリーンフィールド）** なら Step 5 の代わりに `scripts/factory/bootstrap-issues.sh --system "何を作るか" --be ... --fe ...` を実行。`docs/PRODUCT.md` と雛形 Issue 3 件（BE → FE → 契約）ができ、AGENTS.md・CI・コマンド表は雛形 PR が実コードから埋める。
`FACTORY_GITHUB_TOKEN` / ブランチ保護 / Vertex AI / 組織展開は「必要になったら足す」。

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
