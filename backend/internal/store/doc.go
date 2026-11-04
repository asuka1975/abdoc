// Package store は永続化層（Firestore / BigQuery）。外部データストアに触るのはこのパッケージ配下だけ。
//
//   - memory: インメモリ実装（テストと、GCP の設定が無いローカル起動用）
//   - firestore: リアクションのカウンターと訪問者ごとの状態
//   - bigquery: engagement_events / reaction_events への書き込み（テーブルは作らない）
//   - storetest: ストア実装に共通のテストスイート
package store
