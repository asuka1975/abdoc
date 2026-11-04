// Package storetest は app.ReactionStore の実装に共通のテストスイート。
// インメモリ実装の単体テストと、Firestore 実装の統合テストの両方から使う。
package storetest

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/asuka1975/abdoc/backend/internal/app"
	"github.com/asuka1975/abdoc/backend/internal/domain"
)

// Run は newStore が返すストアに対して共通のケースを実行する。
// slug はケースごとに変えるので、newStore は同じストアを返してもよい。
func Run(t *testing.T, newStore func(t *testing.T) app.ReactionStore) {
	t.Helper()
	ctx := context.Background()
	const visitor = "123e4567-e89b-12d3-a456-426614174000"
	const other = "00000000-0000-4000-8000-000000000001"

	set := func(t *testing.T, s app.ReactionStore, slug, vid string, v domain.Variant, r domain.Reaction) (domain.Transition, domain.Counts) {
		t.Helper()
		tr, c, err := s.Update(ctx, slug, vid, v, func(cur domain.VisitorReaction) domain.Transition {
			return domain.Apply(cur, v, r)
		})
		if err != nil {
			t.Fatalf("Update: %v", err)
		}
		return tr, c
	}
	counts := func(t *testing.T, s app.ReactionStore, slug string, v domain.Variant) domain.Counts {
		t.Helper()
		c, _, err := s.Get(ctx, slug, visitor, v)
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		return c
	}

	t.Run("empty", func(t *testing.T) {
		s := newStore(t)
		c, cur, err := s.Get(ctx, uniqueSlug(t), visitor, domain.VariantA)
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		if c != (domain.Counts{}) || cur.For(domain.VariantA) != domain.ReactionNone {
			t.Errorf("Get = %+v %+v, want zero", c, cur)
		}
	})

	t.Run("like, toggle, switch, move variant", func(t *testing.T) {
		s := newStore(t)
		slug := uniqueSlug(t)

		_, c := set(t, s, slug, visitor, domain.VariantA, domain.ReactionLike)
		if c != (domain.Counts{Likes: 1}) {
			t.Fatalf("after like: %+v", c)
		}
		_, c = set(t, s, slug, other, domain.VariantA, domain.ReactionBad)
		if c != (domain.Counts{Likes: 1, Bads: 1}) {
			t.Fatalf("after other bad: %+v", c)
		}
		_, c = set(t, s, slug, visitor, domain.VariantA, domain.ReactionBad)
		if c != (domain.Counts{Bads: 2}) {
			t.Fatalf("after switch to bad: %+v", c)
		}
		tr, c := set(t, s, slug, visitor, domain.VariantA, domain.ReactionBad)
		if tr.Changed || c != (domain.Counts{Bads: 2}) {
			t.Fatalf("after repeat bad: changed=%v %+v", tr.Changed, c)
		}
		_, c = set(t, s, slug, visitor, domain.VariantB, domain.ReactionLike)
		if c != (domain.Counts{Likes: 1}) {
			t.Fatalf("B after move: %+v", c)
		}
		if got := counts(t, s, slug, domain.VariantA); got != (domain.Counts{Bads: 1}) {
			t.Fatalf("A after move: %+v", got)
		}
		_, cur, _ := s.Get(ctx, slug, visitor, domain.VariantB)
		if cur.For(domain.VariantB) != domain.ReactionLike || cur.For(domain.VariantA) != domain.ReactionNone {
			t.Fatalf("visitor reaction after move: %+v", cur)
		}
		_, c = set(t, s, slug, visitor, domain.VariantB, domain.ReactionNone)
		if c != (domain.Counts{}) {
			t.Fatalf("B after none: %+v", c)
		}
	})

	t.Run("slugs are independent", func(t *testing.T) {
		s := newStore(t)
		a, b := uniqueSlug(t)+"-a", uniqueSlug(t)+"-b"
		set(t, s, a, visitor, domain.VariantA, domain.ReactionLike)
		if got := counts(t, s, b, domain.VariantA); got != (domain.Counts{}) {
			t.Errorf("other slug counts = %+v, want zero", got)
		}
	})

	t.Run("concurrent likes", func(t *testing.T) {
		s := newStore(t)
		slug := uniqueSlug(t)
		const n = 8
		var wg sync.WaitGroup
		for i := range n {
			wg.Go(func() {
				vid := fmt.Sprintf("00000000-0000-4000-8000-%012d", i)
				if _, _, err := s.Update(ctx, slug, vid, domain.VariantA, func(cur domain.VisitorReaction) domain.Transition {
					return domain.Apply(cur, domain.VariantA, domain.ReactionLike)
				}); err != nil {
					t.Errorf("Update: %v", err)
				}
			})
		}
		wg.Wait()
		if got := counts(t, s, slug, domain.VariantA); got != (domain.Counts{Likes: n}) {
			t.Errorf("counts = %+v, want %d likes", got, n)
		}
	})
}

var (
	slugMu  sync.Mutex
	slugSeq int
	testRun = time.Now().UnixNano()
)

// uniqueSlug はテストごとに別の slug を返す（エミュレータのデータが残っていても干渉しない）。
func uniqueSlug(t *testing.T) string {
	t.Helper()
	slugMu.Lock()
	defer slugMu.Unlock()
	slugSeq++
	return fmt.Sprintf("storetest-%d-%d", slugSeq, testRun)
}
