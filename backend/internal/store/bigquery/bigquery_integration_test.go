//go:build integration

package bigquery

import (
	"context"
	"crypto/rand"
	"fmt"
	"os"
	"testing"
	"time"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/iterator"

	"github.com/asuka1975/abdoc/backend/internal/domain"
)

// AC8, AC11: エミュレータの初期データにあるテーブルへ、作成処理なしで書き込める。
// `docker compose up bigquery` の後に
// BIGQUERY_EMULATOR_HOST=localhost:9050 GOOGLE_CLOUD_PROJECT=abdoc-local BIGQUERY_DATASET=abdoc go test -tags=integration ./...
func TestEventWriterOnEmulator(t *testing.T) {
	ctx := context.Background()
	host, project, dataset := os.Getenv("BIGQUERY_EMULATOR_HOST"), os.Getenv("GOOGLE_CLOUD_PROJECT"), os.Getenv("BIGQUERY_DATASET")
	if host == "" || project == "" || dataset == "" {
		t.Fatal("BIGQUERY_EMULATOR_HOST, GOOGLE_CLOUD_PROJECT and BIGQUERY_DATASET are required for integration tests")
	}
	c, err := NewClient(ctx, project, host)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	w := NewEventWriter(c, dataset)

	b := make([]byte, 16)
	_, _ = rand.Read(b)
	vid := fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
	now := time.Now().UTC().Truncate(time.Microsecond)
	if err := w.WriteEngagement(ctx, domain.Engagement{Slug: "it-bq", Variant: domain.VariantA, VisitorID: vid, MaxScrollDepth: 33, DurationSeconds: 4.5, Timestamp: now}); err != nil {
		t.Fatalf("WriteEngagement: %v", err)
	}
	if err := w.WriteReaction(ctx, domain.ReactionEvent{Slug: "it-bq", Variant: domain.VariantA, VisitorID: vid, Reaction: domain.ReactionLike, PreviousReaction: domain.ReactionNone, Timestamp: now}); err != nil {
		t.Fatalf("WriteReaction: %v", err)
	}

	if n := countRows(t, c, dataset, EngagementTable, vid); n != 1 {
		t.Errorf("%s rows = %d, want 1", EngagementTable, n)
	}
	if n := countRows(t, c, dataset, ReactionTable, vid); n != 1 {
		t.Errorf("%s rows = %d, want 1", ReactionTable, n)
	}
}

func countRows(t *testing.T, c *bigquery.Client, dataset, table, vid string) int64 {
	t.Helper()
	q := c.Query("SELECT COUNT(*) AS n FROM `" + dataset + "." + table + "` WHERE visitor_id = @vid")
	q.Parameters = []bigquery.QueryParameter{{Name: "vid", Value: vid}}
	it, err := q.Read(context.Background())
	if err != nil {
		t.Fatalf("query %s: %v", table, err)
	}
	var row struct{ N int64 }
	if err := it.Next(&row); err != nil && err != iterator.Done {
		t.Fatalf("read %s: %v", table, err)
	}
	return row.N
}
