// Package config は環境変数からサーバ設定を読み込む。設定は環境変数のみで与える。
package config

import (
	"fmt"
	"os"
	"strconv"
)

// DefaultPort は PORT が未設定のときに使うポート（Cloud Run の既定と同じ）。
const DefaultPort = "8080"

// Config はサーバ設定。
type Config struct {
	// Port は待ち受けポート（環境変数 PORT）。
	Port string
	// Project は Firestore / BigQuery のプロジェクト ID（GOOGLE_CLOUD_PROJECT）。
	// 空ならインメモリのストアで動く（ローカル開発用。再起動でデータは消える）。
	Project string
	// BigQueryDataset はイベントを書き込むデータセット（BIGQUERY_DATASET）。Project があるときは必須。
	BigQueryDataset string
	// BigQueryEmulatorHost は BigQuery エミュレータの host:port（BIGQUERY_EMULATOR_HOST）。空なら本物に接続する。
	// Firestore のエミュレータ（FIRESTORE_EMULATOR_HOST）はクライアントライブラリが直接読む。
	BigQueryEmulatorHost string
}

// Load は環境変数から Config を作る。
func Load() (Config, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return Config{}, fmt.Errorf("config: invalid PORT %q", port)
	}
	cfg := Config{
		Port:                 port,
		Project:              os.Getenv("GOOGLE_CLOUD_PROJECT"),
		BigQueryDataset:      os.Getenv("BIGQUERY_DATASET"),
		BigQueryEmulatorHost: os.Getenv("BIGQUERY_EMULATOR_HOST"),
	}
	if cfg.Project != "" && cfg.BigQueryDataset == "" {
		return Config{}, fmt.Errorf("config: BIGQUERY_DATASET is required when GOOGLE_CLOUD_PROJECT is set")
	}
	return cfg, nil
}

// Addr は http.Server に渡すリッスンアドレスを返す。
func (c Config) Addr() string {
	return ":" + c.Port
}

// InMemory はインメモリのストアで動かすか（GOOGLE_CLOUD_PROJECT が未設定）を返す。
func (c Config) InMemory() bool {
	return c.Project == ""
}
