package http

import (
	"io"
	nethttp "net/http"
	"net/http/httptest"
	"testing"
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

func TestUnknownRouteIs404(t *testing.T) {
	h := NewRouter()

	req := httptest.NewRequest(nethttp.MethodGet, "/nope", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != nethttp.StatusNotFound {
		t.Errorf("status = %d, want %d", rec.Code, nethttp.StatusNotFound)
	}
}
