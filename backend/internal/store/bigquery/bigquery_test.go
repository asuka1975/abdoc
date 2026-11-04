package bigquery

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/asuka1975/abdoc/backend/internal/domain"
)

type insertCall struct {
	path string
	rows []map[string]any
}

// fakeBigQuery は tabledata.insertAll だけを受け付ける偽の BigQuery。
func fakeBigQuery(t *testing.T) (*httptest.Server, func() []insertCall) {
	t.Helper()
	var (
		mu    sync.Mutex
		calls []insertCall
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !strings.HasSuffix(r.URL.Path, "/insertAll") {
			t.Errorf("unexpected request %s %s（テーブル作成などをしてはいけない）", r.Method, r.URL.Path)
			http.Error(w, "unexpected", http.StatusNotFound)
			return
		}
		var body struct {
			Rows []struct {
				JSON map[string]any `json:"json"`
			} `json:"rows"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode: %v", err)
		}
		c := insertCall{path: r.URL.Path}
		for _, row := range body.Rows {
			c.rows = append(c.rows, row.JSON)
		}
		mu.Lock()
		calls = append(calls, c)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"kind":"bigquery#tableDataInsertAllResponse"}`))
	}))
	t.Cleanup(srv.Close)
	return srv, func() []insertCall {
		mu.Lock()
		defer mu.Unlock()
		return append([]insertCall(nil), calls...)
	}
}

func newWriter(t *testing.T, url string) *EventWriter {
	t.Helper()
	c, err := NewClient(context.Background(), "abdoc-local", url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return NewEventWriter(c, "abdoc")
}

var ts = time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)

// AC10: engagement_events の行内容。
func TestWriteEngagement(t *testing.T) {
	srv, calls := fakeBigQuery(t)
	w := newWriter(t, srv.URL)
	err := w.WriteEngagement(context.Background(), domain.Engagement{
		Slug: "hello", Variant: domain.VariantB, VisitorID: "123e4567-e89b-12d3-a456-426614174000",
		MaxScrollDepth: 75, DurationSeconds: 12.5, Timestamp: ts,
	})
	if err != nil {
		t.Fatal(err)
	}
	got := calls()
	if len(got) != 1 || len(got[0].rows) != 1 {
		t.Fatalf("calls = %+v, want 1 row", got)
	}
	if !strings.HasSuffix(got[0].path, "/projects/abdoc-local/datasets/abdoc/tables/engagement_events/insertAll") {
		t.Errorf("path = %s", got[0].path)
	}
	row := got[0].rows[0]
	want := map[string]any{
		"slug": "hello", "variant": "B", "visitor_id": "123e4567-e89b-12d3-a456-426614174000",
		"max_scroll_depth": float64(75), "duration_seconds": 12.5,
	}
	for k, v := range want {
		if row[k] != v {
			t.Errorf("%s = %#v, want %#v", k, row[k], v)
		}
	}
	if row["timestamp"] == nil || len(row) != 6 {
		t.Errorf("row = %v, want 6 columns incl. timestamp", row)
	}
}

// AC10: reaction_events の行内容。
func TestWriteReaction(t *testing.T) {
	srv, calls := fakeBigQuery(t)
	w := newWriter(t, srv.URL)
	err := w.WriteReaction(context.Background(), domain.ReactionEvent{
		Slug: "hello", Variant: domain.VariantA, VisitorID: "123e4567-e89b-12d3-a456-426614174000",
		Reaction: domain.ReactionLike, PreviousReaction: domain.ReactionBad, Timestamp: ts,
	})
	if err != nil {
		t.Fatal(err)
	}
	got := calls()
	if len(got) != 1 || len(got[0].rows) != 1 {
		t.Fatalf("calls = %+v, want 1 row", got)
	}
	if !strings.HasSuffix(got[0].path, "/tables/reaction_events/insertAll") {
		t.Errorf("path = %s", got[0].path)
	}
	row := got[0].rows[0]
	want := map[string]any{
		"slug": "hello", "variant": "A", "visitor_id": "123e4567-e89b-12d3-a456-426614174000",
		"reaction": "like", "previous_reaction": "bad",
	}
	for k, v := range want {
		if row[k] != v {
			t.Errorf("%s = %#v, want %#v", k, row[k], v)
		}
	}
	if row["timestamp"] == nil || len(row) != 6 {
		t.Errorf("row = %v, want 6 columns incl. timestamp", row)
	}
}
