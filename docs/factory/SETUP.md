# 導入手順（モノレポ FE + BE / Google Cloud）

最初に 1 つだけ分岐があります。**リポジトリにコードがあるか、まだ無いか。**

```
既存コードあり:  1 キット展開 → 2 App と Secret → 3 マージ → 4 init-monorepo.sh → 5 領域 AGENTS.md の数行 → 6 Issue を 1 件
コードがまだ無い: 1 キット展開 → 2 App と Secret → 3 マージ → 4 init-monorepo.sh → 5G bootstrap-issues.sh → 6G 雛形 Issue を順に ready
あとで:          FACTORY_GITHUB_TOKEN / ブランチ保護 / Vertex AI 経由 / 組織展開
```

前提: リポジトリの admin 権限、`gh auth login` 済み、Claude API キー。Step 1〜4 は共通です。

## グリーンフィールド（コードがまだ無い）の考え方

工場は「コマンド表・CI・レイヤー」という足場を前提に動きますが、空のリポジトリにはその足場がありません。
そこで **足場を作る仕事自体を最初の Issue にします**。人間が決めるのは「何を作るか」と「スタック」だけで、
コマンド表・CI・AGENTS.md の中身は雛形 PR を書いたエージェントが実コードから埋めます。
コードが無い間、CI（`ci-*.yml`）と `setup.sh` はマニフェスト（`go.mod` / `package.json`）が無い領域をスキップして緑で終わります。

**最初の 3 つの雛形 PR は、以後の全 PR が真似する規約になります。** ここだけは手を抜かずにレビューしてください（構成、lint 設定、テストの書き方、Dockerfile）。

---

## 1. キットを展開する（5 分）

```bash
cd path/to/monorepo
git switch -c chore/factory-kit
unzip -o ~/Downloads/issue-driven-factory-kit.zip -d /tmp/kit
rsync -a --exclude README.md --exclude AGENTS.md --exclude CLAUDE.md /tmp/kit/factory-kit/ ./
mv /tmp/kit/factory-kit/README.md docs/factory/README.md
cp -n /tmp/kit/factory-kit/AGENTS.md /tmp/kit/factory-kit/CLAUDE.md ./     # 既存があれば内容をマージ
chmod +x scripts/factory/*.sh
```

## 2. Claude GitHub App と Secret（5 分）

1. https://github.com/apps/claude → Install → 対象リポジトリ。
   （`/install-github-app` でも可。ただし生成される `claude.yml` は `factory-chat.yml` と二重応答になるので、その PR はマージしない）
2. Settings → Secrets and variables → **Actions** → Repository secrets:
   ```bash
   gh secret set ANTHROPIC_API_KEY -R OWNER/REPO
   ```
3. Settings → Actions → General → Workflow permissions →「Allow GitHub Actions to create and approve pull requests」を ON。

## 3. マージする（ラベルは自動で同期される）（5 分）

```bash
git add -A && git commit -m "chore: add issue-driven factory kit" && git push -u origin HEAD
gh pr create --fill && gh pr merge --squash --delete-branch
sleep 30 && gh label list -R OWNER/REPO --limit 100 | grep -cE '^(factory|type|area|risk|budget|heal):'   # → 24
```
`labels.yml` が main に入ると `factory / labels` が自動実行されます（`gh workflow run` は default branch 上のワークフローしか見えないので、先にマージが必要）。24 にならなければ `gh workflow run "factory / labels"`。
default branch が `main` でない場合は `factory-labels.yml` の `branches: [main]` を直してからマージ。

## 4. `init-monorepo.sh` を 1 回実行する（2 分）

FE と BE のディレクトリ、CI ワークフローの `name:`、GitHub の owner を渡します。CI 名は `grep -m1 '^name:' .github/workflows/*.yml` で確認。

```bash
git switch -c chore/factory-init
bash scripts/factory/init-monorepo.sh apps/web services/api "CI / web" "CI / api" OWNER
```

置換されるもの: `setup.sh` の `FE_DIR` / `BE_DIR`、ルート `AGENTS.md` の領域表、`CODEOWNERS`、`factory-heal.yml` の CI 名。
`apps/web/AGENTS.md` と `services/api/AGENTS.md` がテンプレートから生成されます（既存があれば触りません）。
**CI が 1 つも無い場合**は、最小の `ci-web.yml` / `ci-api.yml` も自動で置かれます。
**コードが無い領域**（`package.json` / `go.mod` が無い）には、推測を禁じるスタブ AGENTS.md が置かれ、次は 5G に進みます。

## 5G. `bootstrap-issues.sh` で意図を渡す（グリーンフィールド・10 分）

2 段階です（intake が未記入の PRODUCT.md を読まないように、Issue 起票は PRODUCT.md が default branch に入ってから）。

```bash
# (1) PRODUCT.md だけ作る
bash scripts/factory/bootstrap-issues.sh --product-only \
  --system "請求書 PDF を取り込んで仕訳を提案する社内ツール" \
  --be "Go 1.23 + chi, Cloud Run" --fe "Next.js 15 + pnpm + TypeScript strict" \
  --db "Cloud SQL (Postgres) + sqlc" --gcp "asia-northeast1, Cloud Run"
# (2) docs/PRODUCT.md の「成功の定義」「やらないこと」「未決事項」を埋めて default branch に push
git add docs/PRODUCT.md && git commit -m "docs: product brief" && git push
# (3) 雛形 Issue 3 件（BE → FE → 契約）。PRODUCT.md が push されていなければ中断する
bash scripts/factory/bootstrap-issues.sh --system "請求書 PDF を取り込んで仕訳を提案する社内ツール"
```
`--dry-run` で Issue 本文だけ確認できます。コードが無い間、エージェントの根拠は PRODUCT.md と Issue の仕様だけです。

## 6G. 雛形 Issue を順に ready にする（グリーンフィールド）

1. BE の Issue の仕様コメントを読み、`factory:ready`。Draft PR が来たら **丁寧に**レビュー（この構成が以後の規約になる）→ マージ。`backend/AGENTS.md` は実コードに基づく内容に置き換わっているはずです。
2. FE の Issue を ready → レビュー → マージ。
3. 契約の Issue を ready → レビュー → マージ。ルート `AGENTS.md` の契約の節が実コマンドになります。
4. ここから先は通常運用（Step 6 以降と同じ）。最初の業務機能の Issue を書くときは `docs/PRODUCT.md` の「成功の定義」から 1 つ選びます。

## 5. 領域の AGENTS.md を実際のコマンドに合わせる（既存コードあり・10 分）

生成された 2 つの AGENTS.md の「コマンド」表と「構成と境界」の **（例: …）** を、実際の値に直します。一般論は書かず、「このディレクトリ固有のコマンド・境界・禁止事項」だけ（10〜30 行）。ルート `AGENTS.md` の冒頭 1〜2 行（何のシステムか）も埋めます。

確認してからマージ:
```bash
git add -A && git commit -m "chore: factory init for monorepo"
git worktree add /tmp/fresh HEAD && (cd /tmp/fresh && bash scripts/factory/setup.sh all) && git worktree remove /tmp/fresh
git push -u origin HEAD && gh pr create --fill && gh pr merge --squash --delete-branch
```
ランナーは毎回素の checkout なので、`setup.sh` が手元のキャッシュに頼っていないかをこの worktree で確かめます（厳密にはコンテナ内で）。
この手順自体をローカルの Claude Code にやらせてもよい: 「`docs/factory/SETUP.md` の Step 5 を実行して。コマンドは package.json と Makefile から拾って」。

## 検査: `doctor.sh`（どの経路でも最後に 1 回）

```bash
bash scripts/factory/doctor.sh
```
ワークフローの登録、ラベル 24 個、Secret、Claude App、Actions の PR 作成許可、プレースホルダの残り、`setup.sh` が素の checkout で通るか、を PASS / WARN / FAIL で出します。FAIL が 0 なら Issue を作って構いません。動かなくなったときも最初にこれを実行してください。

## 6. Issue を 1 件作って回す（既存コードあり・5 分）

テンプレート「✨ 機能要望」で、`risk:low` 相当の小さな仕事（例: `services/api/AGENTS.md` の構成説明を実コードに合わせて補完する、`type:docs`）を 1 件。
- 数分で `factory:planned` と `<!-- factory:spec -->` コメントが付く → 読んで `factory:ready` を付ける
- `factory:building` → Draft PR（`Closes #N`）→ `🔍 factory review` コメント
- PR で `@claude …` と頼むと同じブランチに commit が増える
- 自分でレビューしてマージ → `factory:done` と `learn(#N)` の PR

ここまで動けば工場は稼働しています。**セットアップはここで止め、以降の改善は learn PR と自分の指摘をリンター / AGENTS.md に落とす形で進めます。**

---

## 必要になったら足すもの

| 足すもの | トリガー | 手順 |
|---|---|---|
| `FACTORY_GITHUB_TOKEN` | CI 失敗 → 修復の**自動**連鎖が欲しくなった（それまでは PR に `@claude 直して` と書けば同じ） | 下記 A |
| ブランチ保護 | 自分以外がマージし始めた / 工場の PR 数が増えて見落としが怖い | 下記 B |
| Vertex AI 経由の認証 | API キーを置きたくない / 請求を Google Cloud にまとめたい | 下記 C |
| `area` 別のレビュー深度の調整 | review の指摘が領域に合わない | `docs/factory/review-{fe,be}.md` を編集 |
| 組織展開 | 2 リポジトリ目 | 下記 D |

### A. `FACTORY_GITHUB_TOKEN`
GitHub の仕様で、既定の `GITHUB_TOKEN` で作ったコメント・PR は他のワークフローを起動しません。heal → chat の連鎖とフォールバック PR への自動レビューにはこれが必要です。
1. ファクトリー専用のマシンユーザーを作り、リポジトリに Write で招待。
2. そのユーザーで Fine-grained PAT: Repository access = 対象リポジトリ、Permissions = **Issues: RW / Pull requests: RW / Contents: Read**（Metadata は自動）。有効期限 90 日。
3. `gh secret set FACTORY_GITHUB_TOKEN -R OWNER/REPO`
組織なら自前の GitHub App + `actions/create-github-app-token@v1` で短命トークンを都度発行し、`gh` を呼ぶステップの `env: GH_TOKEN:` を `${{ steps.app.outputs.token }}` に。App 名義のコメントを受け付けるため `gh variable set FACTORY_BOT_LOGIN -b "<app-slug>[bot]"`。

### B. ブランチ保護（Settings → Rules → Rulesets、default branch）
PR 必須（承認 1）/ Code Owners のレビュー必須 / 新 push で承認を無効化 / status checks（`CI / web`, `CI / api`）必須 / force push 禁止 / bypass は空 / 管理者にも適用。
チームが増えたら `CODEOWNERS` を `@OWNER/frontend` `@OWNER/backend` に分け、`contracts/` と `migrations/` は両チーム必須に。

### C. Vertex AI 経由（Google Cloud）
API キーの代わりに Workload Identity Federation で Vertex AI を使えます（静的な資格情報をリポジトリに置かない）。各ワークフローの `anthropic_api_key:` 行を外し、`use_vertex: "true"` と `google-github-actions/auth`（OIDC）を追加、`ANTHROPIC_VERTEX_PROJECT_ID` / `CLOUD_ML_REGION` を設定します。手順は公式の「Use Claude Code GitHub Actions with cloud providers」（https://code.claude.com/docs/en/github-actions-cloud-providers）に従ってください。モデル ID は Vertex の表記になります。
**デプロイは工場の外**: Cloud Run / GKE へのデプロイは別ワークフロー + Environment 保護 + WIF で行い、ファクトリーのジョブに GCP の書き込み権限を渡さないでください。

### D. 組織展開
Claude App を組織レベルで 1 回インストール、Secret は組織の Actions secrets に。6 本のワークフローとプロンプトを `OWNER/.github` に移して `workflow_call` の再利用ワークフローにし、各リポジトリには呼び出し側（10 行）+ `AGENTS.md` + `setup.sh` + ラベル同期だけ置く。

---

## 運用の最初の 90 日
- `factory:ready` は `risk:low` / `budget:s` から。レビュー待ちが 5 件を超えたら ready を止める。
- 週 1 回: マージ PR 数、リバート数、`heal:*` 発生率、ready → merge の中央値、`cost_usd` 合計 ÷ マージ PR 数。
- 同じ指摘を 2 回したら、AGENTS.md ではなくリンターか CI チェックにする。

## 詰まりどころ

| 症状 | 原因 | 対処 |
|---|---|---|
| Issue を作っても何も起きない | ラベル未同期 / 空 Issue | Step 3 の 24 個を確認 |
| `could not find any workflows named …` | ワークフローが default branch に無い | 先にマージ |
| build が「write access」で落ちる | ready を付けたアカウントに write 権限が無い / bot | 権限 |
| build 後に CI が走らない | CI の `on:` に `pull_request` が無い / `paths:` で除外 | CI 側を直す |
| review が付かない | PR 作者 `claude[bot]` を `allowed_bots` で許可していない | キットは設定済み。`FACTORY_BOT_LOGIN` に余計な値が無いか |
| heal のコメントは付くが chat が動かない | `FACTORY_GITHUB_TOKEN` 未設定 | A |
| setup.sh が毎回失敗 | 手元のキャッシュ依存 / 本番資格情報が必要 | worktree か Docker で再現。テストが GCP 資格情報を要求しない設計に |
| `@claude` が二重に応答 | `/install-github-app` の `claude.yml` が残っている | 削除 |
| コストが読めない | `budget:l` の乱発 / `--max-turns` 大 | budget を厳しめに。Console の Workspace に上限 |
