//go:build integration

package store_test

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"

	bqstore "github.com/asuka1975/abdoc/backend/internal/store/bigquery"
)

// AC8: `docker compose up` で起動した環境で、プロキシ（Caddy）→ backend → エミュレータの経路で記録される。
// 環境変数は README の「ローカルで動かす」を参照。
func TestProxyToEmulators(t *testing.T) {
	ctx := context.Background()
	proxy := os.Getenv("ABDOC_PROXY_URL")
	project, dataset := os.Getenv("GOOGLE_CLOUD_PROJECT"), os.Getenv("BIGQUERY_DATASET")
	bqHost := os.Getenv("BIGQUERY_EMULATOR_HOST")
	if proxy == "" || project == "" || dataset == "" || bqHost == "" || os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Fatal("ABDOC_PROXY_URL, GOOGLE_CLOUD_PROJECT, BIGQUERY_DATASET, BIGQUERY_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST are required")
	}
	vid := randomUUID(t)
	slug := "it-proxy-" + vid[:8]

	call := func(method, path, body string) (int, string) {
		t.Helper()
		req, err := http.NewRequestWithContext(ctx, method, proxy+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("X-Abdoc-Visitor-Id", vid)
		req.Header.Set("Content-Type", "application/json")
		// Hosting と同じく、プロキシは __session 以外の Cookie を捨てる（backend は Cookie を使わない）
		req.Header.Set("Cookie", "abdoc_vid="+vid+"; __session=s; other=1")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, string(b)
	}

	code, body := call(http.MethodPut, "/api/posts/"+slug+"/reaction", `{"variant":"B","reaction":"like"}`)
	if code != http.StatusOK {
		t.Fatalf("PUT = %d %s", code, body)
	}
	var st struct {
		Likes, Bads int64
		MyReaction  string
	}
	if err := json.Unmarshal([]byte(body), &st); err != nil || st.Likes != 1 || st.MyReaction != "like" {
		t.Errorf("PUT body = %s", body)
	}
	if code, body := call(http.MethodPost, "/api/posts/"+slug+"/engagement", `{"variant":"B","maxScrollDepth":90,"durationSeconds":30}`); code != http.StatusNoContent {
		t.Fatalf("POST engagement = %d %s", code, body)
	}
	if code, _ := call(http.MethodPut, "/api/posts/"+slug+"/reaction", `{"variant":"X","reaction":"like"}`); code != http.StatusBadRequest {
		t.Errorf("invalid PUT = %d, want 400", code)
	}

	fs, err := firestore.NewClient(ctx, project)
	if err != nil {
		t.Fatal(err)
	}
	defer fs.Close()
	snap, err := fs.Doc("posts/" + slug + "/variants/B").Get(ctx)
	if err != nil {
		t.Fatalf("firestore variants/B: %v", err)
	}
	if d := snap.Data(); d["likes"] != int64(1) || d["bads"] != int64(0) {
		t.Errorf("variants/B = %v", d)
	}
	snap, err = fs.Doc("posts/" + slug + "/reactions/" + vid).Get(ctx)
	if err != nil {
		t.Fatalf("firestore reactions: %v", err)
	}
	if d := snap.Data(); d["variant"] != "B" || d["reaction"] != "like" {
		t.Errorf("reactions doc = %v", d)
	}

	bq, err := bqstore.NewClient(ctx, project, bqHost)
	if err != nil {
		t.Fatal(err)
	}
	defer bq.Close()
	for _, table := range []string{bqstore.EngagementTable, bqstore.ReactionTable} {
		if n := countRows(t, bq, dataset, table, vid); n != 1 {
			t.Errorf("%s rows for visitor = %d, want 1", table, n)
		}
	}
}

func countRows(t *testing.T, c *bigquery.Client, dataset, table, vid string) int64 {
	t.Helper()
	q := c.Query("SELECT COUNT(*) AS n FROM `" + dataset + "." + table + "` WHERE visitor_id = @vid")
	q.Parameters = []bigquery.QueryParameter{{Name: "vid", Value: vid}}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	it, err := q.Read(ctx)
	if err != nil {
		t.Fatalf("query %s: %v", table, err)
	}
	var row struct{ N int64 }
	if err := it.Next(&row); err != nil && err != iterator.Done {
		t.Fatalf("read %s: %v", table, err)
	}
	return row.N
}

func randomUUID(t *testing.T) string {
	t.Helper()
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
