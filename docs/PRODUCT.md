# PRODUCT.md — このシステムは何か（人間が書く・工場の全 Issue が参照する）

<!--
グリーンフィールドでは、これが唯一の「正」です。コードが無い間、エージェントはここと Issue の仕様だけを根拠に動きます。
一般論は書かず、決めたこと・決めていないこと・やらないことを書いてください。短くてよい（30〜60 行）。
-->

## 目的
- abdoc は同じ内容で2種類のブログ記事をABテスト的に公開し、版ごとにいいね数・訪問回数・滞在時間を記録するシステム。記事はMarkdownで書き、SGで静的配信する。A/Bの割り当ては訪問者ごとに固定する
- 主な利用者: （誰が・どんな場面で）
- 成功の定義: （何ができたら最初のリリースか。1〜3 個）

## やらないこと（最初のリリースでは）
- 
- 

## スタックと配置（決定事項）
| 領域 | 決定 | 理由・制約 |
|---|---|---|
| バックエンド（`backend/`） | Go 1.27 + chi, Cloud Run | |
| フロントエンド（`frontend/`） | Astro 7 (static output) + pnpm + TypeScript strict | |
| データ | Firestore（いいね・カウンター）+ BigQuery（イベントログ）, 公式Goクライアント | |
| 契約 | `contracts/openapi.yaml` を正とし、Go / TS のクライアント・型は生成する | 生成物は手で編集しない |
| 実行基盤 | Google Cloud（asia-northeast1, Firebase Hosting（/api/** を Cloud Run へリライト）, Cloud Run, Firestore, BigQuery, Looker Studio） | デプロイは工場の外（別ワークフロー + WIF） |
| 認証 | （未定 / Firebase Auth / IAP / 自前） | |

## 規約（最初の雛形で確定させ、以後は AGENTS.md に転記）
- 言語バージョン: Go （未定）, Node （未定）
- パッケージマネージャ: pnpm
- テスト: 受け入れ基準 1 つにつきテスト 1 つ以上。統合テストは `-tags=integration`
- ログ: 構造化ログ（JSON）。Cloud Logging で読める形
- 設定: 環境変数のみ。`.env.example` を常に最新に

## 未決事項（決まったらここから消して上の表へ）
- 
- 

## 意思決定ログ
| 日付 | 決定 | 理由 | Issue/PR |
|---|---|---|---|
| | | | |
