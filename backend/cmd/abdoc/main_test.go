package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// syncBuffer はサーバの goroutine とテストから同時に触られるログ出力先。
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func freePort(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer l.Close()
	return strconv.Itoa(l.Addr().(*net.TCPAddr).Port)
}

func TestRunServesHealthzAndLogsJSON(t *testing.T) {
	port := freePort(t)
	t.Setenv("PORT", port)
	t.Setenv("GOOGLE_CLOUD_PROJECT", "") // インメモリのストアで起動する

	var logs syncBuffer
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, &logs) }()

	var res *http.Response
	deadline := time.Now().Add(5 * time.Second)
	for {
		var err error
		res, err = http.Get("http://127.0.0.1:" + port + "/healthz")
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			cancel()
			t.Fatalf("server did not start: %v; logs: %s", err, logs.String())
		}
		time.Sleep(20 * time.Millisecond)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != http.StatusOK || string(body) != `{"status":"ok"}` {
		t.Errorf("GET /healthz = %d %q, want 200 %q", res.StatusCode, body, `{"status":"ok"}`)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("run() error = %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("run() did not return after cancel")
	}

	lines := strings.Split(strings.TrimRight(logs.String(), "\n"), "\n")
	var first map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &first); err != nil {
		t.Fatalf("startup log is not JSON: %v: %q", err, lines[0])
	}
	if first["message"] != "server starting" || first["severity"] != "INFO" || first["addr"] != ":"+port {
		t.Errorf("startup log = %v, want message=server starting severity=INFO addr=:%s", first, port)
	}
	for _, line := range lines {
		if !json.Valid([]byte(line)) {
			t.Errorf("log line is not JSON: %q", line)
		}
	}
}

func TestRunFailsWithoutDataset(t *testing.T) {
	t.Setenv("PORT", freePort(t))
	t.Setenv("GOOGLE_CLOUD_PROJECT", "abdoc-local")
	t.Setenv("BIGQUERY_DATASET", "")

	var logs syncBuffer
	if err := run(context.Background(), &logs); err == nil {
		t.Fatal("run() error = nil, want error")
	}
	if !strings.Contains(logs.String(), "BIGQUERY_DATASET") {
		t.Errorf("logs = %q, want BIGQUERY_DATASET error", logs.String())
	}
}

func TestRunFailsOnInvalidPort(t *testing.T) {
	t.Setenv("PORT", "not-a-port")

	var logs syncBuffer
	if err := run(context.Background(), &logs); err == nil {
		t.Fatal("run() error = nil, want error")
	}
	var entry map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(logs.String())), &entry); err != nil {
		t.Fatalf("error log is not JSON: %v: %q", err, logs.String())
	}
	if entry["severity"] != "ERROR" {
		t.Errorf("severity = %v, want ERROR", entry["severity"])
	}
}
