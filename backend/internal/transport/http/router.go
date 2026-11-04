// Package http は HTTP のルーティングとハンドラを置く（transport 層）。
package http

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/asuka1975/abdoc/backend/internal/transport/http/api"
)

// server は contracts/openapi.yaml から生成した api.ServerInterface を実装する。
type server struct {
	reactions Reactions
	logger    *slog.Logger
}

var _ api.ServerInterface = server{}

// NewRouter はアプリ全体の HTTP ハンドラを組み立てる。
func NewRouter(reactions Reactions, logger *slog.Logger) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)

	api.HandlerWithOptions(server{reactions: reactions, logger: logger}, api.ChiServerOptions{
		BaseRouter: r,
		// パス・クエリ・ヘッダーの形式違反（visitor ID が UUID でない等）は契約の Error 形式の 400 にする。
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeError(w, http.StatusBadRequest, err.Error())
		},
	})

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

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, api.Error{Message: message})
}
