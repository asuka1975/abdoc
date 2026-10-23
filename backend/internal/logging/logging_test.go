package logging

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func TestNewWritesCloudLoggingJSON(t *testing.T) {
	var buf bytes.Buffer
	logger := New(&buf)

	logger.Info("server starting", slog.String("addr", ":8080"))

	lines := strings.Split(strings.TrimRight(buf.String(), "\n"), "\n")
	if len(lines) != 1 {
		t.Fatalf("want 1 line, got %d: %q", len(lines), buf.String())
	}
	var entry map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &entry); err != nil {
		t.Fatalf("log line is not JSON: %v: %q", err, lines[0])
	}
	if got := entry["severity"]; got != "INFO" {
		t.Errorf("severity = %v, want INFO", got)
	}
	if got := entry["message"]; got != "server starting" {
		t.Errorf("message = %v, want %q", got, "server starting")
	}
	if got := entry["addr"]; got != ":8080" {
		t.Errorf("addr = %v, want %q", got, ":8080")
	}
	if _, ok := entry["time"]; !ok {
		t.Errorf("time is missing: %v", entry)
	}
	for _, k := range []string{"msg", "level"} {
		if _, ok := entry[k]; ok {
			t.Errorf("unexpected key %q: %v", k, entry)
		}
	}
}

func TestSeverityMapping(t *testing.T) {
	tests := []struct {
		log  func(*slog.Logger)
		want string
	}{
		{func(l *slog.Logger) { l.Warn("w") }, "WARNING"},
		{func(l *slog.Logger) { l.Error("e") }, "ERROR"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			var buf bytes.Buffer
			tt.log(New(&buf))
			var entry map[string]any
			if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
				t.Fatalf("log line is not JSON: %v", err)
			}
			if got := entry["severity"]; got != tt.want {
				t.Errorf("severity = %v, want %s", got, tt.want)
			}
		})
	}
}
