//go:build integration

package firestore

import (
	"context"
	"os"
	"testing"

	"cloud.google.com/go/firestore"

	"github.com/asuka1975/abdoc/backend/internal/app"
	"github.com/asuka1975/abdoc/backend/internal/domain"
	"github.com/asuka1975/abdoc/backend/internal/store/storetest"
)

// エミュレータに接続して共通スイートを実行する（AC8）。`docker compose up firestore` の後に
// FIRESTORE_EMULATOR_HOST=localhost:8081 GOOGLE_CLOUD_PROJECT=abdoc-local go test -tags=integration ./...
func newClient(t *testing.T) *firestore.Client {
	t.Helper()
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Fatal("FIRESTORE_EMULATOR_HOST is required for integration tests")
	}
	project := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if project == "" {
		t.Fatal("GOOGLE_CLOUD_PROJECT is required for integration tests")
	}
	c, err := firestore.NewClient(context.Background(), project)
	if err != nil {
		t.Fatalf("firestore.NewClient: %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

func TestReactionStoreOnEmulator(t *testing.T) {
	c := newClient(t)
	storetest.Run(t, func(*testing.T) app.ReactionStore { return NewReactionStore(c) })
}

func TestDocumentLayout(t *testing.T) {
	ctx := context.Background()
	c := newClient(t)
	s := NewReactionStore(c)
	const slug, vid = "layout-check", "123e4567-e89b-12d3-a456-426614174000"
	_, _ = c.Collection("posts").Doc(slug).Collection("reactions").Doc(vid).Delete(ctx)
	_, _ = c.Collection("posts").Doc(slug).Collection("variants").Doc("B").Delete(ctx)

	if _, _, err := s.Update(ctx, slug, vid, domain.VariantB, func(cur domain.VisitorReaction) domain.Transition {
		return domain.Apply(cur, domain.VariantB, domain.ReactionBad)
	}); err != nil {
		t.Fatal(err)
	}
	r, err := c.Doc("posts/" + slug + "/reactions/" + vid).Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := r.Data(); got["variant"] != "B" || got["reaction"] != "bad" {
		t.Errorf("reaction doc = %v", got)
	}
	v, err := c.Doc("posts/" + slug + "/variants/B").Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := v.Data(); got["likes"] != int64(0) || got["bads"] != int64(1) {
		t.Errorf("variant doc = %v", got)
	}
}
