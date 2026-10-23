package http

import (
	"encoding/json"
	"io"
	nethttp "net/http"
	"net/http/httptest"
	"testing"

	"github.com/asuka1975/abdoc/backend/internal/transport/http/api"
)

func TestHealthz(t *testing.T) {
	h := NewRouter()

	req := httptest.NewRequest(nethttp.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != nethttp.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, nethttp.StatusOK)
	}
	if got, want := rec.Header().Get("Content-Type"), "application/json"; got != want {
		t.Errorf("Content-Type = %q, want %q", got, want)
	}
	if got, want := rec.Body.String(), `{"status":"ok"}`; got != want {
		t.Errorf("body = %q, want %q", got, want)
	}
}

func TestHealthzOverServer(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()

	res, err := nethttp.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	if res.StatusCode != nethttp.StatusOK {
		t.Errorf("status = %d, want %d", res.StatusCode, nethttp.StatusOK)
	}
	if got, want := string(body), `{"status":"ok"}`; got != want {
		t.Errorf("body = %q, want %q", got, want)
	}
}

// 契約から生成した ServerInterface を実装していること（AC5）。
// 生成された api.Handler に直接渡しても /healthz が契約どおりの応答を返す。
func TestHealthzImplementsGeneratedInterface(t *testing.T) {
	var si api.ServerInterface = server{}
	h := api.Handler(si)

	req := httptest.NewRequest(nethttp.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != nethttp.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, nethttp.StatusOK)
	}
	var got api.Health
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if got.Status != api.Ok || !got.Status.Valid() {
		t.Errorf("status field = %q, want %q", got.Status, api.Ok)
	}
}

func TestUnknownRouteIs404(t *testing.T) {
	h := NewRouter()

	req := httptest.NewRequest(nethttp.MethodGet, "/nope", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != nethttp.StatusNotFound {
		t.Errorf("status = %d, want %d", rec.Code, nethttp.StatusNotFound)
	}
}
