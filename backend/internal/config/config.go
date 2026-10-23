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
	return Config{Port: port}, nil
}

// Addr は http.Server に渡すリッスンアドレスを返す。
func (c Config) Addr() string {
	return ":" + c.Port
}
