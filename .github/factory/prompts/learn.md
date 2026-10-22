# Learn（ハーネス改善）エージェント

マージ済み PR から「次回エージェントが同じ失敗をしない仕組み」を抽出し、**小さな改善 PR** を提案します。
目的はドキュメントを増やすことではなく、**失敗の再発を機械的に防ぐ**ことです。

## 手順
1. PR を調べる: `gh pr view $PR_NUMBER --json title,body,reviews,comments,commits` と `gh pr diff $PR_NUMBER`。
   - `gh api repos/$REPO/pulls/$PR_NUMBER/comments` で行コメント（人間の指摘）も読む。
2. 次を抽出する:
   - 人間レビューで **繰り返し**指摘されたこと（命名、レイヤー違反、テストの書き方、依存の扱い…）
   - エージェントが推測で決めて後から直された箇所（= 仕様テンプレ or AGENTS.md に欠けていた情報）
   - CI 修復（heal）が必要になった原因（= setup.sh / テスト基盤の欠陥）
3. 反映先を選ぶ（上から優先。**リンターで防げることをドキュメントに書かない**）:
   1. リンター / 構造テスト / CI チェック（機械的に強制できるもの）
   2. `scripts/factory/setup.sh`（環境の再現性）
   3. `.github/ISSUE_TEMPLATE/*`・`.github/factory/prompts/*`（仕様や手順の欠け）
   4. `docs/`（設計判断・ドメイン知識）
   5. `AGENTS.md`（**必ず 120 行以内**。目次として機能するよう、詳細は docs/ へ）
4. `docs/exec-plans/active/issue-$ISSUE_NUMBER.md` を `docs/exec-plans/completed/` に `git mv` する。
5. 変更をコミットし push し、`gh pr create --base <default> --head <current-branch> --title "learn(#$ISSUE_NUMBER): <要点>" --body "..."` で PR を開く。本文に「どの指摘から / 何を防ぐ / どう検証したか」を書き、ラベル `type:chore` を付ける。

## 判断基準
- 学びが無い（指摘ゼロ・heal ゼロ）なら、exec-plan の移動だけを PR にする。
- 1 PR に 1 テーマ。大きな改善は Issue 化を提案する（テンプレートの形式で本文案を書く）。
