# 導入手順（1 リポジトリ・約 1 時間）

所要時間の目安: 設定 30 分 + プロジェクト固有の書き換え 20 分 + スモークテスト 10 分。
順番どおりに進めてください。**Step 6（ラベル同期）を飛ばすと Issue テンプレートがラベルを付けられず、何も起動しません。**

## 前提

| 必要なもの | 確認方法 |
|---|---|
| 対象リポジトリの **admin** 権限 | Settings が開ける |
| GitHub CLI（ログイン済み） | `gh auth status` |
| Claude API キー（Console）か、Claude Pro/Max/Team/Enterprise のサブスクリプション | どちらか一方 |
| 既存の CI ワークフロー（テストが走るもの）とその `name:` | `.github/workflows/*.yml` の先頭 |
| 1 コマンドでテストが走ること | 例: `npm ci && npm test` |

以下、`OWNER/REPO` は自分のリポジトリに読み替えてください。

---

## Step 1. キットをリポジトリに入れる

```bash
cd path/to/your-repo
git switch -c chore/factory-kit
unzip -o ~/Downloads/issue-driven-factory-kit.zip -d /tmp/kit
rsync -a /tmp/kit/factory-kit/ ./          # 既存ファイルがある場合は上書き前に差分を確認
chmod +x scripts/factory/*.sh
git add -A && git commit -m "chore: add issue-driven factory kit"
git push -u origin chore/factory-kit
gh pr create --fill
```

`AGENTS.md` / `CLAUDE.md` が既にある場合は、キット側の内容を既存ファイルに**マージ**してください（キットの AGENTS.md は「不変条件」と「コマンド表」が肝です）。
この PR はこの時点ではマージせず、Step 7 の書き換えまで同じブランチで進めると一度で済みます。

## Step 2. Claude GitHub App をインストールする

Action は（`github_token` を渡さない限り）この App として git push・PR 作成・コメントを行います。未インストールだと build / chat / review / learn が動きません。

**手動（推奨: キットが独自のワークフローを持つため）**
1. https://github.com/apps/claude を開き **Install** → 対象リポジトリ（組織なら「Selected repositories」で対象を選ぶ）。
2. App の権限一覧が出ます。Action が使うのは Contents / Issues / Pull requests の read & write ですが、App は全 Claude 機能共通なので一括承認になります。
   組織ポリシーで最小権限が必要なら、後述の「自前 GitHub App」で代替できます。

**Claude Code から（`/install-github-app`）**
ローカルの Claude Code で `/install-github-app` を実行すると、App のインストール → Secret 保存 → `claude.yml`（と任意で `claude-code-review.yml`）の PR 作成まで行います。
**その PR はマージしないでください**（`claude.yml` は `factory-chat.yml` と、`claude-code-review.yml` は `factory-review.yml` と二重応答になります）。App と Secret だけを使い、PR は閉じます。

## Step 3. 認証 Secret を入れる

**A. API キー（組織・複数人で使うならこちら）**
```bash
gh secret set ANTHROPIC_API_KEY -R OWNER/REPO       # プロンプトでキーを貼り付け
```
Console 側で、このキー用の Workspace を分けて月額上限（spend limit）を設定しておくと暴走時の保険になります。

**B. サブスクリプション（個人・検証用）**
```bash
claude setup-token                                   # 長期トークンが表示される
gh secret set CLAUDE_CODE_OAUTH_TOKEN -R OWNER/REPO
# 6 本のワークフローの入力名を置換
sed -i 's/anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}/claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}/' .github/workflows/factory-*.yml
```
OAuth トークンは `setup-token` を実行した人のサブスクリプションに紐づきます。チームで使うなら A にしてください。

## Step 4. `FACTORY_GITHUB_TOKEN` を入れる（連鎖を切らないために必須）

GitHub の仕様で、ワークフロー既定の `GITHUB_TOKEN` で作った PR・コメント・ラベルは**他のワークフローを起動しません**（無限ループ防止）。
キットでは次の連鎖がこれに該当するため、別のトークンが必要です。

- `factory / heal` が PR に `@claude` とコメント → `factory / chat` が起動
- `finalize-build.sh` がフォールバックで Draft PR を作成 → CI と `factory / review` が起動
- `apply-intake.sh` のラベル変更（将来、ラベル起点の自動化を足す場合）

**選択肢 A: Fine-grained PAT（最短・1 リポジトリ向け）**
1. ファクトリー専用のマシンユーザー（例: `acme-factory-bot`）を作り、リポジトリに **Write** で招待する。
   個人アカウントの PAT でも動きますが、heal の依頼コメントがその人の名前で投稿され、退職や権限変更で工場が止まります。
2. そのユーザーで Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate:
   - Repository access: 対象リポジトリのみ
   - Permissions: **Contents: Read and write / Issues: Read and write / Pull requests: Read and write / Actions: Read / Metadata: Read**
   - 有効期限: 90 日以内にして、カレンダーに更新予定を入れる
3. `gh secret set FACTORY_GITHUB_TOKEN -R OWNER/REPO`

**選択肢 B: 自前の GitHub App（組織・複数リポジトリ向け）**
1. 組織の Settings → Developer settings → GitHub Apps → New。権限は A と同じ 5 つ。Webhook は不要。
2. Private key を生成し、`FACTORY_APP_ID`（Variable）と `FACTORY_APP_PRIVATE_KEY`（Secret）に保存。対象リポジトリにインストール。
3. `factory-intake.yml` / `factory-build.yml` / `factory-heal.yml` / `factory-learn.yml` の各ジョブ先頭に次のステップを追加し、`gh` やスクリプトを呼ぶステップの `env:` に `GH_TOKEN: ${{ steps.app.outputs.token }}` を付ける（ワークフロー/ジョブレベルの `env` からは steps を参照できないため、ステップ単位で上書きします）:
   ```yaml
         - id: app
           uses: actions/create-github-app-token@v1
           with:
             app-id: ${{ vars.FACTORY_APP_ID }}
             private-key: ${{ secrets.FACTORY_APP_PRIVATE_KEY }}
   ```
4. App のコメントは `<app-slug>[bot]` 名義になるので、`gh variable set FACTORY_BOT_LOGIN -b "<app-slug>[bot]"` を設定する（`factory / chat` と `factory / review` が bot のイベントを受け付けるため）。

> `FACTORY_GITHUB_TOKEN` を入れないままでも、各ワークフローは `github.token` にフォールバックして**単体では**動きます。ただし heal→chat の連鎖と、フォールバック PR への自動レビューが起動しません。検証だけなら省略可。

## Step 5. Variables とリポジトリ設定

```bash
# 任意。未設定なら既定値（build: claude-opus-5-5 / light: claude-sonnet-5-5 / heal 上限 2）
gh variable set FACTORY_MODEL_BUILD -b "claude-opus-5-5"  -R OWNER/REPO
gh variable set FACTORY_MODEL_LIGHT -b "claude-sonnet-5-5" -R OWNER/REPO
gh variable set FACTORY_MAX_HEALS   -b "2"                 -R OWNER/REPO
```

Settings → Actions → General:
- **Workflow permissions** → 「Allow GitHub Actions to create and approve pull requests」を **ON**
  （`FACTORY_GITHUB_TOKEN` 未設定時にフォールバック PR を `github.token` で作るために必要。設定済みなら不要だが ON にしておいて害はない）
- Fork pull request workflows: 公開リポジトリなら既定のまま（fork からの PR には secrets が渡らない。キットの review は同一リポジトリの PR に限定済み）

Settings → General → Features → **Issues** が ON であること。

## Step 6. ラベルを同期する（必須・最初に 1 回）

```bash
gh workflow run "factory / labels" -R OWNER/REPO
sleep 20 && gh label list -R OWNER/REPO --search factory
```
`factory:triage` … `factory:done` の 8 個と `type:* / risk:* / budget:* / heal:*` が見えれば OK。
ワークフローがまだ main に無い（Step 1 の PR 未マージ）場合は、`workflow_run` はブランチを指定して実行できます: `gh workflow run "factory / labels" --ref chore/factory-kit`。それも通らなければ `.github/factory/labels.yml` を見て `gh label create` で手動作成してください。

## Step 7. プロジェクト固有の 5 か所を書き換える

| ファイル | 書き換える内容 | 確認方法 |
|---|---|---|
| `scripts/factory/setup.sh` | 新しい checkout を 1 コマンドでテスト可能にする手順（Node/Python のバージョン、DB の起動、環境変数の雛形） | `git clone` した直後の別ディレクトリで `bash scripts/factory/setup.sh && <テストコマンド>` が通る |
| `AGENTS.md` | 冒頭の説明、**コマンド表**、レイヤーの説明、不変条件（プロジェクト固有のもの） | 120 行以内。コマンド表の全行をコピペで実行できる |
| `.github/workflows/factory-heal.yml` | `workflows: ["CI"]` を実際の CI ワークフローの `name:` に | CI の `on:` に `pull_request` か `push` があり、`factory/**` ブランチが除外されていない |
| `.github/CODEOWNERS` | `@OWNER/...` を実在するチームに。`risk:high` 領域のパス（`/migrations/` など）を自分の構成に | チーム名は組織に存在し、メンバーが write 権限を持つ |
| `.github/ISSUE_TEMPLATE/config.yml` | Discussions の URL | — |

任意: `ISSUE_TEMPLATE/*.yml` の文言をチームの言葉に、`factory/prompts/*.md` にドメイン固有の注意（例: 「金額は必ず整数の最小通貨単位で扱う」）を追記。

ここまでを Step 1 のブランチにコミットして PR をマージします。

## Step 8. ブランチ保護（人間のゲートを機械的に強制する）

Settings → Rules → Rulesets → New branch ruleset（Target: default branch）。古い UI なら Branches → Branch protection rule。

| 設定 | 値 | 理由 |
|---|---|---|
| Require a pull request before merging | ON、Required approvals **1** | AI は Approve できない。マージは人間 |
| Require review from Code Owners | ON | `risk:high` 領域に 2 チーム目を強制 |
| Dismiss stale pull request approvals when new commits are pushed | ON | 承認後にエージェントが push しても承認が残らない |
| Require approval of the most recent reviewable push | ON | 同上 |
| Require status checks to pass | ON、CI のジョブを指定 | heal が成立する前提 |
| Block force pushes / Restrict deletions | ON | — |
| Bypass list | **空**（ファクトリー用ユーザー / App を入れない） | 工場が自分でゲートを越えられないように |
| Enforcement | Active（管理者にも適用） | — |

`FACTORY_GITHUB_TOKEN` のユーザー/App は Contents: write を持ちますが、この保護があれば default branch には直接 push できません。

## Step 9. スモークテスト（順に 6 段階）

各段階で `gh run list -R OWNER/REPO --limit 5` と対象 Issue/PR を見ます。

1. **intake**: テンプレート「✨ 機能要望」から、わざと受け入れ基準を空にした Issue を作る → 数分で `factory:needs-info` と質問コメントが付く。返信すると再度 intake が走り、`factory:planned` + `<!-- factory:spec -->` コメントになる。
   - 動かない → Step 6 のラベル、`ANTHROPIC_API_KEY`、Actions が有効か。
2. **build**: 仕様コメントを確認して `factory:ready` を付ける（write 権限のある人間が付けること） → `factory:building` → 終了時に `factory:in-review` と `Closes #N` 付きの Draft PR。
   - 「write access」で失敗 → ready を付けたアカウントの権限。
   - ブランチはあるが PR が無い → `finalize-build.sh` が代わりに作る。作られない場合は Step 5 の「create and approve pull requests」。
3. **review**: Draft PR に `🔍 factory review` の sticky コメントが付く。
   - 付かない → PR 作者が `claude[bot]` の場合は `allowed_bots`（キット設定済み）。Variables の `FACTORY_BOT_LOGIN` に余計な値が入っていないか。
4. **chat**: PR に `@claude README に変更点の説明を 1 行足してください` とコメント → 同じブランチに commit が増える（新しいブランチは増えない）。
5. **heal**: PR のブランチで、わざとテストを 1 つ失敗させる commit を push → CI 失敗 → `heal:1` ラベルと `@claude` の修復依頼コメント → chat が修正 commit を push。
   - 修復依頼コメントは付くが chat が起動しない → `FACTORY_GITHUB_TOKEN` が未設定（`github.token` のコメントは他ワークフローを起動しない）。
   - 3 回目は `factory:blocked` になることを確認（`FACTORY_MAX_HEALS=2`）。
6. **learn**: Draft を Ready にし、人間が Approve → マージ → Issue が `factory:done`、`factory/learn-*` ブランチから `learn(#N): …` の PR が開く。

全部通ったらテスト用 Issue / PR / ブランチを閉じて削除します。

## Step 10. 運用開始のルール

- 最初の 2〜4 週間は `type:chore` / `risk:low` / `budget:s` にだけ `factory:ready` を付ける。信頼が溜まってから `medium` へ。
- `factory:ready` は**レビューできる量だけ**付ける。レビュー待ちが 5 件を超えたら ready を止める（レビューがボトルネックになるのが 2026 年の各社共通の教訓）。
- 週 1 回見る数字: マージ PR 数、リバート数、`heal:*` 発生率、ready→merge の中央値、Actions ログの `cost_usd` 合計 ÷ マージ PR 数。
- 失敗のたびに「ツール / リンター / setup.sh / 仕様テンプレ / AGENTS.md のどれが欠けていたか」を決め、learn PR で潰す。同じ指摘を 2 回したら仕組みにする。

---

## 組織で横展開する場合（2 リポジトリ目から）

- Claude GitHub App を**組織レベル**で一度インストール（対象リポジトリを選択）。
- `ANTHROPIC_API_KEY` / `FACTORY_GITHUB_TOKEN` を**組織の Actions Secret** にして、各リポジトリに配らない。長期 Secret を持ちたくなければ Workload Identity Federation（`anthropic_federation_rule_id` 等の入力）に置き換えられる。
- 6 本のワークフローとプロンプトを組織の `.github` リポジトリ（または `OWNER/factory-workflows`）に移し、`on: workflow_call` の再利用ワークフローにする。各リポジトリに置くのは、呼び出し側ワークフロー（10 行程度）+ `AGENTS.md` + `scripts/factory/setup.sh` + ラベル同期だけ。プロンプトやゲートの改善が全リポジトリに一括で効く。

## よくある詰まりどころ

| 症状 | 原因 | 対処 |
|---|---|---|
| Issue を作っても何も起きない | ラベル未同期 / テンプレートを使わず空 Issue を作った | Step 6 / `blank_issues_enabled: false` を確認 |
| intake が「write access」で落ちる | `allowed_non_write_users` と `github_token` の組み合わせが崩れた | intake の 2 行を元に戻す |
| build は成功したのに CI が走らない | CI の `on:` に `pull_request` が無い / `paths:` フィルタで除外 | CI 側のトリガーを直す |
| heal のコメントは付くが chat が動かない | `FACTORY_GITHUB_TOKEN` 未設定 | Step 4 |
| chat が bot のコメントを無視する | App 名義のコメントを許可していない | `FACTORY_BOT_LOGIN` |
| エージェントが毎回 setup で失敗する | `setup.sh` が壊れている / 秘密情報が必要 | ローカルの素の clone で再現。テストに本番秘密情報を要求しない設計にする |
| コストが読めない | `--max-turns` と `timeout-minutes` が大きすぎる / `budget:l` を乱発 | budget ラベルを厳しめに。Console の Workspace 上限 |
| `@claude` が二重に応答する | `/install-github-app` が作った `claude.yml` が残っている | 削除する |
