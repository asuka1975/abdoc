// Package http は HTTP のルーティングとハンドラを置く（transport 層）。
package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/asuka1975/abdoc/backend/internal/transport/http/api"
)

// server は contracts/openapi.yaml から生成した api.ServerInterface を実装する。
type server struct{}

var _ api.ServerInterface = server{}

// NewRouter はアプリ全体の HTTP ハンドラを組み立てる。
func NewRouter() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)

	api.HandlerFromMux(server{}, r)

	return r
}

// GetHealthz は GET /healthz を処理する。
func (server) GetHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, api.Health{Status: api.Ok})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
